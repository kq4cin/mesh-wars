const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
// Exercise the actual standalone objects without booting the UI, IndexedDB or a radio.
function objectSource(start, next) {
  const from = html.indexOf(start), until = html.indexOf(next, from);
  assert.ok(from >= 0 && until > from, `Cannot locate ${start}`);
  return html.slice(from, html.lastIndexOf('};', until) + 2);
}
const source = objectSource('const GameEngine = {', 'const CombatEngine = {')
  + '\n' + objectSource('const M = {', '\n  return {\n    SIZE')
  + '\nglobalThis.engine = GameEngine; globalThis.manager = M;';

function harness() {
  let now = 1_800_000_000_000, items = [], nextId = 1, sleepAdvance = 0;
  const queued = [], sent = [], loopback = [], events = new Map();
  const context = vm.createContext({
    Date: class extends Date { static now() { return now; } },
    TextEncoder, Uint8Array, enc: new TextEncoder(), MAX_TEXT: 100, HAIL_TTL_MS: 30 * 60000,
    encodeWire: bytes => String(bytes[0]), navigator: {},
    document: { hidden: false, addEventListener: (name, fn, options) => events.set(name, { fn, options }) },
    window: { addEventListener: (name, fn) => events.set(name, { fn }) },
    U: {
      now: () => Math.floor(now / 1000), hexBytes: () => '00', le32: () => {},
      sleep: async () => { now += sleepAdvance; },
    },
    ArtAndUIController: { render() {}, toast() {} }, AudioEngine: { play() {} },
    StorageManager: {
      all: async () => items.slice(),
      put: async (_store, item) => { items.push({ ...item, qid: nextId++ }); },
      del: async (_store, id) => { items = items.filter(it => it.qid !== id); },
      count: async () => items.length,
    },
    MeshProtocol: { packSignature: () => new Uint8Array([1]), manager: {
      online: () => true, client: { ready: true }, queue: (...args) => queued.push(args),
    } },
  });
  vm.runInContext(source, context);
  const { engine, manager } = context;
  engine.state = { settings: { heartbeat: 5 }, lastSigAt: 0 };
  engine.signature = () => ({});
  engine.save = () => {};
  manager.hooks = { heartbeatIdle: () => engine.heartbeatIdle(), onStatus() {} };
  manager.activeChannel = () => 0;
  manager.bc = { postMessage: value => loopback.push(value) };
  manager.client = { ready: true, request: async frame => { sent.push(frame); return new Uint8Array([0]); } };
  return {
    context, engine, manager, queued, sent, loopback, events,
    advance: ms => { now += ms; },
    add: (kind, label = kind, wire = 'packet') => items.push({ qid: nextId++, kind, label, wire, t: now }),
    items: () => items,
    advanceBetweenBatches: ms => { sleepAdvance = ms; },
  };
}

test('automatic heartbeat sends before, but not at or after, the exact five-minute boundary', () => {
  for (const [elapsed, expected] of [[299999, 1], [300000, 0], [300001, 0], [3600000, 0]]) {
    const h = harness();
    h.advance(elapsed); h.engine.heartbeatTick();
    assert.equal(h.queued.length, expected, `${elapsed}ms`);
    if (expected) assert.equal(h.queued[0][2], 'heartbeat');
  }
});

test('overdue heartbeat resumes once on activity, without a burst on subsequent input', () => {
  const h = harness();
  h.advance(300000);
  h.engine.notePlayerActivity();
  for (let i = 0; i < 20; i++) { h.engine.notePlayerActivity(); h.engine.heartbeatTick(); }
  assert.equal(h.queued.length, 1);
  assert.equal(h.engine.heartbeatIdle(), false);
});

test('resume honors the configured interval and Heartbeat Off', () => {
  for (const interval of [0, 15]) {
    const h = harness();
    h.engine.state.settings.heartbeat = interval;
    h.engine.state.lastSigAt = h.context.U.now();
    h.advance(300001);
    h.engine.notePlayerActivity();
    assert.equal(h.queued.length, 0);
  }
});

test('disconnected and unready radios do not receive periodic heartbeats', () => {
  const h = harness(), radio = h.context.MeshProtocol.manager;
  radio.client.ready = false; h.engine.heartbeatTick();
  radio.client = null; radio.online = () => false; h.engine.heartbeatTick();
  assert.equal(h.queued.length, 0);
});

test('idle guard also covers connection/travel announcements but permits manual signatures', () => {
  const h = harness();
  h.advance(300000);
  h.engine.broadcastSignature(true);
  assert.equal(h.queued.length, 0);
  assert.equal(h.engine.state.lastSigAt, 0);
  h.engine.broadcastSignature(false);
  assert.equal(h.queued.length, 1);
  assert.equal(h.queued[0][2], 'sig');
});

test('only trusted foreground input or a visible return resets inactivity', () => {
  const h = harness();
  h.engine.initActivityTracking();
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'click', 'focus', 'visibilitychange']) {
    h.advance(300000);
    const listener = h.events.get(event);
    listener.fn({ isTrusted: false });
    assert.equal(h.engine.heartbeatIdle(), true, `synthetic ${event}`);
    h.context.document.hidden = true;
    listener.fn({ isTrusted: true });
    assert.equal(h.engine.heartbeatIdle(), true, `hidden ${event}`);
    h.context.document.hidden = false;
    listener.fn({ isTrusted: true });
    assert.equal(h.engine.heartbeatIdle(), false, `trusted ${event}`);
  }
  assert.equal(h.events.get('pointerdown').options.capture, true);
});

test('background timer/status work does not renew activity', () => {
  const h = harness();
  for (let i = 0; i < 10; i++) {
    h.advance(30000); h.engine.heartbeatTick(); h.context.ArtAndUIController.render();
  }
  assert.equal(h.engine.heartbeatIdle(), true);
  assert.equal(h.queued.length, 1);
});

test('queued automatic and legacy automatic signatures are dropped while idle', async () => {
  const h = harness();
  h.add('heartbeat');
  h.add('sig', 'Auto ship signature');
  h.advance(300000);
  await h.manager.flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.items().length, 0);
  assert.equal(h.manager.pending, 0);
});

test('manual signatures, hails and gameplay packets still flush while idle', async () => {
  const h = harness();
  h.add('heartbeat');
  h.add('sig', 'Ship signature', 'manual');
  h.add('hail', 'Hail', 'hail');
  h.add('misc', 'Trade', 'trade');
  h.advance(300000);
  await h.manager.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(new TextDecoder().decode(h.sent[0].slice(7)), 'manual hail trade');
  assert.equal(h.items().length, 0);
});

test('flush rechecks inactivity between radio batches', async () => {
  const h = harness();
  h.add('misc', 'Trade', 'x'.repeat(100));
  h.add('heartbeat');
  h.advanceBetweenBatches(300000);
  await h.manager.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.items().length, 0);
});

test('idle automatic queueing neither replaces manual traffic nor sends loopback/radio traffic', async () => {
  const h = harness();
  h.add('sig', 'Ship signature');
  h.advance(300000);
  await h.manager.queue(new Uint8Array([1]), 'Auto ship signature', 'heartbeat');
  assert.equal(h.items().length, 1);
  assert.equal(h.items()[0].label, 'Ship signature');
  assert.equal(h.loopback.length, 0);
  assert.equal(h.sent.length, 0);
});

test('manual and automatic signatures share the existing latest-signature deduplication', async () => {
  const h = harness();
  h.manager.client = null;
  h.add('sig', 'old manual');
  h.add('heartbeat', 'old automatic');
  await h.manager.queue(new Uint8Array([1]), 'Auto ship signature', 'heartbeat');
  assert.equal(h.items().length, 1);
  assert.equal(h.items()[0].kind, 'heartbeat');
  await h.manager.queue(new Uint8Array([2]), 'Ship signature', 'sig');
  assert.equal(h.items().length, 1);
  assert.equal(h.items()[0].kind, 'sig');
});
