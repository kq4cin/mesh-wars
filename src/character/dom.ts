// DOM glue: canvases declared in HTML strings are "hydrated" into live, animated portraits.
//
//   <canvas data-portrait data-seed="123" data-job="Pilot" data-expr="hurt" data-crop="head"
//           data-track="unit-7" data-hp="12">
//
// One PortraitStage runs a single requestAnimationFrame loop for every mounted portrait,
// sizes backing stores for devicePixelRatio, skips off-screen / static portraits and stops
// entirely when nothing is animating or the tab is hidden.

import { AssetFactory } from './AssetFactory';
import { CharacterAsset } from './CharacterAsset';
import { esc } from './rng';
import { ARTWORK_IDS } from './sprites';
import type { AnimationState, ArmorClass, CharacterRecord, Crop, EquipmentVisuals, Expression, HelmetId, OutfitId, WeaponId } from './types';

const EXPRESSIONS: readonly Expression[] = ['neutral', 'happy', 'determined', 'hurt', 'ko'];
const ARMORS: readonly ArmorClass[] = ['light', 'medium', 'heavy'];
const WEAPONS: readonly WeaponId[] = ['none', 'pistol', 'carbine', 'shotgun', 'longRifle', 'arcWrench', 'medInjector', 'datapad'];
const HELMETS: readonly HelmetId[] = ['none', 'headset', 'goggles', 'visor', 'beanie', 'combat'];
const OUTFIT_IDS: readonly OutfitId[] = ['flightSuit', 'traderJacket', 'tacticalUniform', 'enforcerCoat', 'lightArmor', 'armorSuit', 'harness'];
const CROP_IDS: readonly Crop[] = ['full', 'bust', 'head'];
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

interface Mount { canvas: HTMLCanvasElement; asset: CharacterAsset; crop: Crop; state: AnimationState; dirty: boolean }

export interface MountOptions {
  crop?: Crop;
  /** View state to animate with; pass the same object across re-renders to keep clips running. */
  state?: AnimationState;
}

export class PortraitStage {
  private readonly mounts = new Map<HTMLCanvasElement, Mount>();
  private raf = 0;
  private last = 0;
  private reducedMotion = false;

  constructor(readonly factory: AssetFactory, private readonly fps = 30) {
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      mq.addEventListener?.('change', e => { this.reducedMotion = e.matches; this.mounts.forEach(m => { m.state.reducedMotion = e.matches; m.dirty = true; }); this.wake(); });
    }
    factory.cache.onLoad(() => { this.mounts.forEach(m => { m.dirty = true; }); this.wake(); });
    document.addEventListener('visibilitychange', () => this.wake());
    const refresh = () => { this.mounts.forEach(m => { m.dirty = true; }); this.wake(); };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    document.addEventListener('scroll', () => this.wake(), { passive: true, capture: true });
    window.addEventListener('online', () => { factory.cache.clear(); refresh(); });
  }

  /**
   * Bind an asset to a canvas and draw it immediately (cached textures => no flicker on re-render).
   * Returns the view's AnimationState: set its expression or start clips with asset.play(clip, t, state).
   */
  mount(canvas: HTMLCanvasElement, asset: CharacterAsset, opts: MountOptions = {}): AnimationState {
    const state = opts.state ?? this.mounts.get(canvas)?.state ?? asset.createState();
    state.reducedMotion = this.reducedMotion;
    const m: Mount = { canvas, asset, crop: opts.crop ?? 'full', state, dirty: true };
    this.mounts.set(canvas, m);
    this.draw(m, performance.now());
    this.wake();
    return state;
  }

  /** Redraw a mounted canvas soon (after changing its state's expression or clips). */
  invalidate(canvas: HTMLCanvasElement): void {
    const m = this.mounts.get(canvas);
    if (m) { m.dirty = true; this.wake(); }
  }

  unmount(canvas: HTMLCanvasElement): void { this.mounts.delete(canvas); }

  get size(): number { return this.mounts.size; }

  private draw(m: Mount, t: number): void {
    const cv = m.canvas, dpr = Math.min(2, window.devicePixelRatio || 1); // 2x is visually lossless for portraits and halves 3x-phone memory
    const w = Math.max(1, Math.round((cv.clientWidth || cv.width) * dpr)), h = Math.max(1, Math.round((cv.clientHeight || cv.height) * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ready = m.asset.render(ctx, 0, 0, w, h, { crop: m.crop, time: t, clear: true, state: m.state });
    cv.dataset.portraitStatus = ready ? 'ready' : m.asset.loadFailed ? 'error' : 'loading';
    cv.title = m.asset.loadFailed ? 'Portrait unavailable. Reconnect or reload to retry.' : '';
    if (!ready && m.asset.loadFailed) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#9bb4c4';
      ctx.font = `${Math.max(9, w / 12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Art unavailable', w / 2, h / 2, w - 6);
    }
    m.dirty = false; // if textures were missing, the cache's onLoad hook marks us dirty again
  }

  private readonly tick = (t: number): void => {
    this.raf = 0;
    let keepGoing = false;
    const due = t - this.last >= 1000 / this.fps - 2;
    if (due) this.last = t;
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const m of this.mounts.values()) {
      if (!m.canvas.isConnected) { this.unmount(m.canvas); continue; }
      const animated = m.asset.isAnimated(t, m.state);
      if (m.state.oneShots.size === 0 && m.canvas.dataset.animating === 'true') m.dirty = true;
      m.canvas.dataset.animating = String(animated);
      const r = m.canvas.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
      if (animated || m.dirty) keepGoing = true;
      if (!due || !(animated || m.dirty)) continue;
      this.draw(m, t);
    }
    if (keepGoing) this.wake();
  };

  private wake(): void {
    if (!this.raf && this.mounts.size && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }
}

export interface PortraitMarkupOptions {
  expression?: Expression;
  crop?: Crop;
  /** Stable id used to detect HP loss between renders and play the "hit" flinch. */
  track?: string;
  hp?: number;
  className?: string;
  label?: string;
}

/** HTML for a portrait placeholder; call hydrate() after inserting it into the document. */
export function portraitMarkup(factory: AssetFactory, rec: CharacterRecord, o: PortraitMarkupOptions = {}): string {
  const eq = rec.equipment ?? {};
  const attrs: Record<string, string | number | undefined> = {
    'data-seed': rec.seed >>> 0, 'data-job': rec.job, 'data-expr': o.expression, 'data-crop': o.crop,
    'data-armor': eq.armor, 'data-outfit': eq.outfit, 'data-weapon': eq.weapon, 'data-helmet': eq.helmet, 'data-track': o.track, 'data-hp': o.hp,
    'data-sprite': rec.customization?.spriteId, 'data-accessories': eq.accessories?.join(','),
  };
  const label = o.label ?? `${factory.resolve(rec).identity.label} ${rec.job} crew portrait`;
  const a = Object.entries(attrs).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  return `<canvas class="portrait-art${o.className ? ' ' + esc(o.className) : ''}" data-portrait ${a} role="img" aria-label="${esc(label)}"></canvas>`;
}

// Tracked views keep their animation state (and last HP) across re-renders of the same element id.
const tracked = new Map<string, { key: string; state: AnimationState; hp?: number }>();

/** Find every `canvas[data-portrait]` under root, resolve its asset and mount it on the stage. */
export function hydrateWith(stage: PortraitStage, root: ParentNode): number {
  const list = root.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]');
  list.forEach(cv => {
    const d = cv.dataset;
    const equipment: Partial<EquipmentVisuals> = {};
    const armor = oneOf(ARMORS, d.armor), outfit = oneOf(OUTFIT_IDS, d.outfit), weapon = oneOf(WEAPONS, d.weapon), helmet = oneOf(HELMETS, d.helmet);
    if (armor) equipment.armor = armor;
    if (outfit) equipment.outfit = outfit;
    if (weapon) equipment.weapon = weapon;
    if (helmet) equipment.helmet = helmet;
    const spriteId = oneOf(ARTWORK_IDS, d.sprite);
    if (d.sprite && !spriteId) throw new RangeError(`Unknown crew sprite: ${d.sprite}`);
    if (d.accessories != null) {
      const accessories = d.accessories ? d.accessories.split(',') : [];
      const allowed = ['belt', 'holster', 'gloves', 'chestRig', 'pauldrons', 'backpack', 'toolPouch', 'medPouch'] as const;
      equipment.accessories = accessories.map(id => {
        const accessory = oneOf(allowed, id);
        if (!accessory) throw new RangeError(`Unknown crew accessory: ${id}`);
        return accessory;
      });
    }
    const asset = stage.factory.create({ seed: Number(d.seed) >>> 0, job: d.job || 'Captain', equipment, customization: spriteId ? { spriteId } : undefined });
    const expression = oneOf(EXPRESSIONS, d.expr) ?? 'neutral';
    let state: AnimationState | undefined;
    let hit = false;
    if (d.track) {
      let t = tracked.get(d.track);
      if (!t || t.key !== asset.key) {
        if (tracked.size > 512) tracked.clear();
        t = { key: asset.key, state: asset.createState() };
        tracked.set(d.track, t);
      }
      state = t.state;
      if (d.hp != null && d.hp !== '') {
        const hp = Number(d.hp);
        hit = t.hp != null && hp < t.hp;
        t.hp = hp;
      }
    }
    state ??= asset.createState();
    state.expression = expression;
    if (hit) asset.play('hit', performance.now(), state);
    stage.mount(cv, asset, { crop: oneOf(CROP_IDS, d.crop) ?? 'full', state });
  });
  return list.length;
}
