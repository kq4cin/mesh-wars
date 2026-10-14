/* MESH WARS CharacterKit - GENERATED from src/character by 'npm run build'. Do not edit by hand. */
"use strict";
var CharacterKit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/character/index.ts
  var index_exports = {};
  __export(index_exports, {
    ARTWORK: () => ARTWORK,
    ARTWORK_IDS: () => ARTWORK_IDS,
    AssetFactory: () => AssetFactory,
    CLIPS: () => CLIPS,
    CROPS: () => CROPS,
    CharacterAsset: () => CharacterAsset,
    IdleDriver: () => IdleDriver,
    JOB_KITS: () => JOB_KITS,
    OUTFITS: () => OUTFITS,
    PIVOTS: () => PIVOTS,
    PortraitStage: () => PortraitStage,
    SLOT_Z: () => SLOT_Z,
    TextureCache: () => TextureCache,
    VERSION: () => VERSION,
    VIEW_H: () => VIEW_H,
    VIEW_W: () => VIEW_W,
    configure: () => configure,
    factory: () => factory,
    hydrate: () => hydrate,
    hydrateWith: () => hydrateWith,
    portraitHTML: () => portraitHTML,
    portraitMarkup: () => portraitMarkup,
    sourceIdOf: () => sourceIdOf,
    stats: () => stats,
    traits: () => traits
  });

  // src/character/animation.ts
  var ident = () => ({ dx: 0, dy: 0, rot: 0, scale: 1 });
  var CLIPS = { hit: 420, nod: 650 };
  var IdleDriver = class {
    isAnimated(st) {
      return st.oneShots.size > 0;
    }
    sample(t, st) {
      const pose = {
        bones: { root: ident(), torso: ident(), head: ident() },
        alpha: {},
        desaturate: st.expression === "ko" ? 0.8 : 0
      };
      for (const [name, start] of st.oneShots) {
        const duration = CLIPS[name];
        if (!duration) continue;
        const p = (t - start) / duration;
        if (p < 0 || p >= 1) continue;
        if (name === "hit") {
          if (!st.reducedMotion) pose.bones.root.dx = Math.sin(p * Math.PI * 9) * (1 - p) * 3;
          pose.tint = { color: "#ff4d5e", alpha: 0.42 * (1 - p) };
        } else if (name === "nod" && !st.reducedMotion) {
          pose.bones.root.dy = 2 * Math.sin(p * Math.PI);
        }
      }
      return pose;
    }
  };

  // src/character/layout.ts
  var VIEW_W = 200;
  var VIEW_H = 400;
  var CROPS = {
    full: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
    bust: { x: 40, y: 0, w: 120, h: 144 },
    head: { x: 60, y: 0, w: 80, h: 80 }
  };
  var PIVOTS = {
    root: [100, 200],
    torso: [100, 392],
    head: [100, 50]
  };

  // src/character/CharacterAsset.ts
  var CHAIN = { root: ["root"], torso: ["root", "torso"], head: ["root", "torso", "head"] };
  var STEPS = [0.25, 0.35, 0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.4, 4];
  var stepFor = (s) => STEPS.find((q) => q >= s - 1e-3) ?? STEPS[STEPS.length - 1];
  var PAD = 10;
  function regionFor(bounds, crop) {
    const x0 = Math.max(bounds.x, crop.x - PAD, 0), y0 = Math.max(bounds.y, crop.y - PAD, 0);
    const x1 = Math.min(bounds.x + bounds.w, crop.x + crop.w + PAD, VIEW_W), y1 = Math.min(bounds.y + bounds.h, crop.y + crop.h + PAD, VIEW_H);
    if (x1 <= x0 || y1 <= y0) return null;
    const x = Math.floor(x0), y = Math.floor(y0);
    return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
  }
  var scratch = null;
  function scratchCtx(w, h) {
    if (!scratch) scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
    if (scratch.width < w) scratch.width = w;
    if (scratch.height < h) scratch.height = h;
    const c = scratch.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, w, h);
    return c;
  }
  var CharacterAsset = class {
    constructor(sheet, baseLayers, buildFace, cache, driver) {
      this.sheet = sheet;
      this.baseLayers = baseLayers;
      this.buildFace = buildFace;
      this.cache = cache;
      this.faceCache = /* @__PURE__ */ new Map();
      this.listeners = /* @__PURE__ */ new Set();
      this.key = sheet.key;
      this.driver = driver ?? new IdleDriver();
      this.state = this.createState();
    }
    /** A fresh per-view animation state (see RenderOptions.state). */
    createState(expression = "neutral") {
      return { expression, phase: this.sheet.seed % 997 / 997, oneShots: /* @__PURE__ */ new Map(), reducedMotion: false };
    }
    get expression() {
      return this.state.expression;
    }
    get loadFailed() {
      return this.baseLayers.some((layer) => this.cache.hasFailure(layer.sourceId));
    }
    setExpression(e) {
      if (this.state.expression !== e) {
        this.state.expression = e;
        this.emit();
      }
      return this;
    }
    /** Start a one-shot clip ("hit" flinch, "nod") on the default state, or on a view's own state. */
    play(clip, now = performance.now(), state = this.state) {
      state.oneShots.set(clip, now);
      if (state === this.state) this.emit();
      return this;
    }
    setReducedMotion(on) {
      this.state.reducedMotion = on;
      return this;
    }
    /** Whether render() output changes over time right now (lets the stage skip static portraits). */
    isAnimated(now = performance.now(), state = this.state) {
      pruneClips(state, now);
      return this.driver.isAnimated(state);
    }
    /** Notified when the default state's expression or clips change. Returns an unsubscribe function. */
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    /** Layers for one face variant, z-sorted with occluded slots removed. */
    layers(variant = { expression: this.state.expression, blink: false }) {
      const all = this.baseLayers.concat(this.faceLayers(variant)).sort((a, b) => a.z - b.z);
      const hidden = /* @__PURE__ */ new Set();
      for (const l of all) l.occludes?.forEach((s) => hidden.add(s));
      return hidden.size ? all.filter((l) => !hidden.has(l.slot)) : all;
    }
    /** Warm the texture cache for a target pixel size (current expression, open and blinking). */
    async prefetch(pixelW, pixelH, crop = "full") {
      const c = this.sheet.crops[crop], q = stepFor(Math.min(pixelW / c.w, pixelH / c.h)), seen = /* @__PURE__ */ new Set(), jobs = [];
      for (const blink of [false, true]) {
        for (const l of this.layers({ expression: this.state.expression, blink })) {
          const region = regionFor(l.bounds, c);
          if (!region || seen.has(l.sourceId)) continue;
          seen.add(l.sourceId);
          jobs.push(this.cache.request(l.sourceId, l.source, region, q));
        }
      }
      await Promise.all(jobs);
    }
    /**
     * Draw the character into (dx, dy, dw, dh) of a 2D context, in that context's pixel units.
     * Returns false while some layer textures are still loading (a copy at another scale is used
     * meanwhile when one exists); the TextureCache onLoad hook signals when to draw again.
     */
    render(ctx, dx, dy, dw, dh, opts = {}) {
      const t = opts.time ?? performance.now(), st = opts.state ?? this.state;
      pruneClips(st, t);
      const pose = this.driver.sample(t, st);
      const crop = this.sheet.crops[opts.crop ?? "full"];
      const scale = Math.min(dw / crop.w, dh / crop.h), q = stepFor(scale);
      const resting = { expression: st.expression, blink: false };
      const variants = [pose.face, resting, st.lastFace].filter((v) => !!v);
      let complete = true, plan = null;
      for (const v of variants) {
        const r = this.plan(v, pose, crop, q);
        complete && (complete = r.complete);
        if (r.steps) {
          plan = r.steps;
          if (r.complete) st.lastFace = v;
          break;
        }
      }
      if (!plan) return false;
      const post = !!pose.tint || pose.desaturate > 0;
      if (opts.clear) ctx.clearRect(dx, dy, dw, dh);
      const target = post ? scratchCtx(Math.ceil(dw), Math.ceil(dh)) : ctx;
      const bx = post ? 0 : dx, by = post ? 0 : dy;
      const ox = bx + (dw - crop.w * scale) / 2 - crop.x * scale, oy = by + (dh - crop.h * scale) / 2 - crop.y * scale;
      target.save();
      target.beginPath();
      target.rect(bx, by, dw, dh);
      target.clip();
      target.imageSmoothingQuality = "high";
      for (const { layer, tex, region, alpha } of plan) {
        target.save();
        target.globalAlpha = alpha;
        target.globalCompositeOperation = layer.blend;
        target.translate(ox, oy);
        target.scale(scale, scale);
        applyBones(target, pose, layer.bone);
        target.drawImage(tex.image, region.x, region.y, region.w, region.h);
        target.restore();
      }
      target.restore();
      if (post) {
        const w = Math.ceil(dw), h = Math.ceil(dh);
        target.save();
        if (pose.desaturate > 0) {
          target.globalCompositeOperation = "source-atop";
          target.fillStyle = `rgba(128,128,128,${pose.desaturate})`;
          target.fillRect(0, 0, w, h);
        }
        if (pose.tint && pose.tint.alpha > 0) {
          target.globalCompositeOperation = "source-atop";
          target.globalAlpha = pose.tint.alpha;
          target.fillStyle = pose.tint.color;
          target.fillRect(0, 0, w, h);
        }
        target.restore();
        ctx.drawImage(target.canvas, 0, 0, w, h, dx, dy, w, h);
      }
      return complete;
    }
    plan(v, pose, crop, q) {
      const steps = [];
      let complete = true;
      for (const layer of this.layers(v)) {
        const region = regionFor(layer.bounds, crop);
        if (!region) continue;
        let tex = this.cache.peek(layer.sourceId, region, q);
        if (!tex) {
          complete = false;
          void this.cache.request(layer.sourceId, layer.source, region, q);
          tex = this.fallback(layer.sourceId, region, q);
          if (!tex) return { steps: null, complete };
        }
        const alpha = layer.opacity * (layer.alphaChannel ? pose.alpha[layer.alphaChannel] ?? 1 : 1);
        if (alpha > 2e-3) steps.push({ layer, tex, region, alpha });
      }
      return { steps, complete };
    }
    faceLayers(v) {
      const k = `${v.expression}${v.blink ? ":blink" : ""}`;
      let layers = this.faceCache.get(k);
      if (!layers) {
        layers = this.buildFace(v);
        this.faceCache.set(k, layers);
      }
      return layers;
    }
    fallback(sourceId, region, wanted) {
      for (let i = STEPS.length - 1; i >= 0; i--) {
        if (STEPS[i] === wanted) continue;
        const t = this.cache.peek(sourceId, region, STEPS[i]);
        if (t) return t;
      }
      return void 0;
    }
    emit() {
      this.listeners.forEach((fn) => fn());
    }
  };
  function pruneClips(st, now) {
    for (const [name, start] of st.oneShots) if (now - start > CLIPS[name]) st.oneShots.delete(name);
  }
  function applyBones(ctx, pose, bone) {
    for (const b of CHAIN[bone]) {
      const tr = pose.bones[b];
      if (!tr.dx && !tr.dy && !tr.rot && tr.scale === 1) continue;
      const [px, py] = PIVOTS[b];
      ctx.translate(px + tr.dx, py + tr.dy);
      if (tr.rot) ctx.rotate(tr.rot);
      if (tr.scale !== 1) ctx.scale(tr.scale, tr.scale);
      ctx.translate(-px, -py);
    }
  }

  // src/character/catalog.ts
  var OUTFITS = {
    flightSuit: { armor: "light", label: "Star Trader Flight Suit" },
    traderJacket: { armor: "light", label: "Star Trader Jacket" },
    tacticalUniform: { armor: "light", label: "Alien Specced (Xeno Tailored)" },
    enforcerCoat: { armor: "medium", label: "Syndicate Enforcer" },
    lightArmor: { armor: "medium", label: "Light Armor" },
    armorSuit: { armor: "heavy", label: "APL-R9 Armor Suite" },
    harness: { armor: "light", label: "Gear Harness" }
  };
  var DEFAULT_OUTFIT = { light: "flightSuit", medium: "lightArmor", heavy: "armorSuit" };
  var JOB_KITS = {
    Captain: { outfit: "enforcerCoat", weapon: "pistol", helmet: "none", accessories: ["belt", "holster", "gloves"] },
    Pilot: { outfit: "flightSuit", weapon: "pistol", helmet: "headset", accessories: ["belt", "holster"] },
    Gunner: { outfit: "lightArmor", weapon: "carbine", helmet: "none", accessories: ["belt", "gloves", "pauldrons"] },
    Engineer: { outfit: "traderJacket", weapon: "arcWrench", helmet: "goggles", accessories: ["belt", "toolPouch", "gloves"] },
    Medic: { outfit: "tacticalUniform", weapon: "medInjector", helmet: "none", accessories: ["belt", "medPouch"] },
    Marine: { outfit: "armorSuit", weapon: "shotgun", helmet: "none", accessories: ["chestRig", "gloves", "backpack", "belt"] },
    Tactician: { outfit: "tacticalUniform", weapon: "datapad", helmet: "visor", accessories: ["belt"] },
    Scout: { outfit: "traderJacket", weapon: "longRifle", helmet: "beanie", accessories: ["backpack", "belt", "gloves"] }
  };
  var FALLBACK_KIT = { outfit: "flightSuit", weapon: "none", helmet: "none", accessories: ["belt"] };
  var FALLBACK_JOB_COLOR = "#ffb547";

  // assets/crew/sprites.json
  var sprites_default = {
    sheet: {
      w: 1408,
      h: 768
    },
    sprites: {
      head_bald_0: {
        w: 61,
        h: 75,
        group: "head_bald",
        src: [
          49,
          123
        ],
        bbox: {
          x: 7,
          y: 7,
          w: 47,
          h: 62
        },
        shoulderW: 41,
        frame: {
          x: 0,
          y: 0,
          w: 61,
          h: 75
        }
      },
      head_bald_1: {
        w: 61,
        h: 73,
        group: "head_bald",
        src: [
          117,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 49,
          h: 61
        },
        shoulderW: 40,
        frame: {
          x: 63,
          y: 0,
          w: 61,
          h: 73
        }
      },
      head_bald_2: {
        w: 57,
        h: 73,
        group: "head_bald",
        src: [
          185,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 45,
          h: 62
        },
        shoulderW: 40,
        frame: {
          x: 126,
          y: 0,
          w: 57,
          h: 73
        }
      },
      head_bald_3: {
        w: 59,
        h: 79,
        group: "head_bald",
        src: [
          251,
          123
        ],
        bbox: {
          x: 6,
          y: 7,
          w: 47,
          h: 65
        },
        shoulderW: 42,
        frame: {
          x: 185,
          y: 0,
          w: 59,
          h: 79
        }
      },
      head_bald_4: {
        w: 59,
        h: 76,
        group: "head_bald",
        src: [
          318,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 47,
          h: 65
        },
        shoulderW: 43,
        frame: {
          x: 246,
          y: 0,
          w: 59,
          h: 76
        }
      },
      head_bald_5: {
        w: 60,
        h: 77,
        group: "head_bald",
        src: [
          385,
          123
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 47,
          h: 66
        },
        shoulderW: 43,
        frame: {
          x: 307,
          y: 0,
          w: 60,
          h: 77
        }
      },
      head_mid_0: {
        w: 60,
        h: 69,
        group: "head_mid",
        src: [
          476,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 48,
          h: 62
        },
        shoulderW: 41,
        frame: {
          x: 369,
          y: 0,
          w: 60,
          h: 69
        }
      },
      head_mid_1: {
        w: 60,
        h: 69,
        group: "head_mid",
        src: [
          543,
          124
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 47,
          h: 62
        },
        shoulderW: 41,
        frame: {
          x: 431,
          y: 0,
          w: 60,
          h: 69
        }
      },
      head_mid_2: {
        w: 60,
        h: 69,
        group: "head_mid",
        src: [
          611,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 48,
          h: 62
        },
        shoulderW: 40,
        frame: {
          x: 493,
          y: 0,
          w: 60,
          h: 69
        }
      },
      head_mid_3: {
        w: 61,
        h: 69,
        group: "head_mid",
        src: [
          678,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 49,
          h: 62
        },
        shoulderW: 41,
        frame: {
          x: 555,
          y: 0,
          w: 61,
          h: 69
        }
      },
      head_mid_4: {
        w: 60,
        h: 69,
        group: "head_mid",
        src: [
          746,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 48,
          h: 61
        },
        shoulderW: 41,
        frame: {
          x: 618,
          y: 0,
          w: 60,
          h: 69
        }
      },
      head_mid_5: {
        w: 61,
        h: 69,
        group: "head_mid",
        src: [
          814,
          124
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 49,
          h: 62
        },
        shoulderW: 40,
        frame: {
          x: 680,
          y: 0,
          w: 61,
          h: 69
        }
      },
      head_mid_6: {
        w: 60,
        h: 70,
        group: "head_mid",
        src: [
          882,
          123
        ],
        bbox: {
          x: 6,
          y: 7,
          w: 48,
          h: 62
        },
        shoulderW: 40,
        frame: {
          x: 743,
          y: 0,
          w: 60,
          h: 70
        }
      },
      head_robot_0: {
        w: 62,
        h: 79,
        group: "head_robot",
        src: [
          975,
          125
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 50,
          h: 68
        },
        shoulderW: 50,
        frame: {
          x: 805,
          y: 0,
          w: 62,
          h: 79
        }
      },
      head_robot_1: {
        w: 59,
        h: 78,
        group: "head_robot",
        src: [
          1054,
          126
        ],
        bbox: {
          x: 6,
          y: 5,
          w: 47,
          h: 68
        },
        shoulderW: 45,
        frame: {
          x: 869,
          y: 0,
          w: 59,
          h: 78
        }
      },
      head_robot_2: {
        w: 60,
        h: 79,
        group: "head_robot",
        src: [
          1131,
          126
        ],
        bbox: {
          x: 6,
          y: 5,
          w: 48,
          h: 68
        },
        shoulderW: 47,
        frame: {
          x: 930,
          y: 0,
          w: 60,
          h: 79
        }
      },
      head_robot_3: {
        w: 66,
        h: 79,
        group: "head_robot",
        src: [
          1209,
          125
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 53,
          h: 68
        },
        shoulderW: 44,
        frame: {
          x: 0,
          y: 81,
          w: 66,
          h: 79
        }
      },
      head_robot_4: {
        w: 64,
        h: 80,
        group: "head_robot",
        src: [
          1286,
          124
        ],
        bbox: {
          x: 6,
          y: 7,
          w: 51,
          h: 68
        },
        shoulderW: 47,
        frame: {
          x: 68,
          y: 81,
          w: 64,
          h: 80
        }
      },
      head_hair_0: {
        w: 70,
        h: 85,
        group: "head_hair",
        src: [
          48,
          253
        ],
        bbox: {
          x: 11,
          y: 10,
          w: 47,
          h: 67
        },
        shoulderW: 43,
        frame: {
          x: 134,
          y: 81,
          w: 70,
          h: 85
        }
      },
      head_hair_1: {
        w: 58,
        h: 78,
        group: "head_hair",
        src: [
          120,
          257
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 45,
          h: 66
        },
        shoulderW: 42,
        frame: {
          x: 206,
          y: 81,
          w: 58,
          h: 78
        }
      },
      head_hair_2: {
        w: 69,
        h: 82,
        group: "head_hair",
        src: [
          181,
          254
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 56,
          h: 69
        },
        shoulderW: 54,
        frame: {
          x: 266,
          y: 81,
          w: 69,
          h: 82
        }
      },
      head_hair_3: {
        w: 58,
        h: 80,
        group: "head_hair",
        src: [
          258,
          257
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 44,
          h: 68
        },
        shoulderW: 44,
        frame: {
          x: 337,
          y: 81,
          w: 58,
          h: 80
        }
      },
      head_hair_4: {
        w: 57,
        h: 81,
        group: "head_hair",
        src: [
          324,
          257
        ],
        bbox: {
          x: 6,
          y: 6,
          w: 45,
          h: 69
        },
        shoulderW: 43,
        frame: {
          x: 397,
          y: 81,
          w: 57,
          h: 81
        }
      },
      head_hair_5: {
        w: 68,
        h: 79,
        group: "head_hair",
        src: [
          378,
          256
        ],
        bbox: {
          x: 6,
          y: 7,
          w: 55,
          h: 66
        },
        shoulderW: 47,
        frame: {
          x: 456,
          y: 81,
          w: 68,
          h: 79
        }
      },
      head_ext_0: {
        w: 73,
        h: 79,
        group: "head_ext",
        src: [
          969,
          253
        ],
        bbox: {
          x: 6,
          y: 5,
          w: 61,
          h: 68
        },
        shoulderW: 7,
        frame: {
          x: 526,
          y: 81,
          w: 73,
          h: 79
        }
      },
      head_ext_1: {
        w: 75,
        h: 74,
        group: "head_ext",
        src: [
          1052,
          256
        ],
        bbox: {
          x: 6,
          y: 5,
          w: 63,
          h: 63
        },
        shoulderW: 27,
        frame: {
          x: 601,
          y: 81,
          w: 75,
          h: 74
        }
      },
      head_ext_2: {
        w: 78,
        h: 72,
        group: "head_ext",
        src: [
          1129,
          262
        ],
        bbox: {
          x: 7,
          y: 7,
          w: 64,
          h: 59
        },
        shoulderW: 54,
        frame: {
          x: 678,
          y: 81,
          w: 78,
          h: 72
        }
      },
      head_ext_3: {
        w: 62,
        h: 75,
        group: "head_ext",
        src: [
          1213,
          258
        ],
        bbox: {
          x: 6,
          y: 7,
          w: 50,
          h: 62
        },
        shoulderW: 49,
        frame: {
          x: 758,
          y: 81,
          w: 62,
          h: 75
        }
      },
      head_ext_4: {
        w: 82,
        h: 76,
        group: "head_ext",
        src: [
          1281,
          262
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 59,
          h: 55
        },
        shoulderW: 48,
        frame: {
          x: 822,
          y: 81,
          w: 82,
          h: 76
        }
      },
      figure_0: {
        w: 150,
        h: 412,
        group: "figure",
        src: [
          484,
          258
        ],
        bbox: {
          x: 7,
          y: 6,
          w: 134,
          h: 399
        },
        shoulderW: 99,
        head: {
          x: 42,
          y: 2,
          w: 64,
          h: 70
        },
        frame: {
          x: 0,
          y: 168,
          w: 150,
          h: 412
        }
      },
      figure_1: {
        w: 151,
        h: 409,
        group: "figure",
        src: [
          632,
          261
        ],
        bbox: {
          x: 12,
          y: 5,
          w: 131,
          h: 399
        },
        shoulderW: 101,
        head: {
          x: 48,
          y: 3,
          w: 60,
          h: 70
        },
        frame: {
          x: 152,
          y: 168,
          w: 151,
          h: 409
        }
      },
      figure_2: {
        w: 154,
        h: 420,
        group: "figure",
        src: [
          788,
          250
        ],
        bbox: {
          x: 9,
          y: 18,
          w: 139,
          h: 396
        },
        shoulderW: 116,
        head: {
          x: 52,
          y: 14,
          w: 56,
          h: 70
        },
        frame: {
          x: 305,
          y: 168,
          w: 154,
          h: 420
        }
      }
    },
    atlas: {
      file: "crew.png",
      w: 1024,
      h: 588
    }
  };

  // src/character/rng.ts
  function hash32(...vals) {
    let h = 2166136261;
    for (const v of vals) {
      const s = String(v);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      h ^= 44;
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rng = (...v) => mulberry32(hash32(...v));
  var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // src/character/sprites.ts
  var frames = sprites_default.sprites;
  var ARTWORK_IDS = Object.keys(frames);
  function identityFor(id) {
    if (id === "figure_0") return { species: "human", gender: "female", label: "Human / Female" };
    if (id === "figure_1") return { species: "reptilian", gender: "none", label: "Reptilian" };
    if (id === "figure_2" || id.startsWith("head_robot"))
      return { species: "synthetic", gender: "none", label: "Synthetic" };
    if (id.startsWith("head_ext")) return { species: "combat", gender: "none", label: "Combat Robot" };
    const n = Number(id.slice(-1));
    const cybernetic = id.startsWith("head_bald") && n >= 3 || id.startsWith("head_mid") && n >= 4;
    return { species: cybernetic ? "cybernetic" : "human", gender: "male", label: `${cybernetic ? "Cybernetic" : "Human"} / Male` };
  }
  function artwork(id) {
    const s = frames[id], fullFigure = id.startsWith("figure");
    const scale = fullFigure ? Math.min(180 / s.w, 380 / s.h) : Math.min(88 / s.w, 96 / s.h);
    const destination = { x: (200 - s.w * scale) / 2, y: 8, w: s.w * scale, h: s.h * scale };
    const head = s.head ?? { x: 0, y: 0, w: s.w, h: s.h };
    const size = Math.max(head.w, head.h) * scale + 12;
    const headCrop = {
      x: destination.x + (head.x + head.w / 2) * scale - size / 2,
      y: destination.y + (head.y + head.h / 2) * scale - size / 2,
      w: size,
      h: size
    };
    const bust = fullFigure ? { x: 40, y: 0, w: 120, h: 144 } : { x: headCrop.x, y: headCrop.y - size * 0.1, w: size, h: size * 1.2 };
    return {
      frame: s.frame,
      destination,
      identity: identityFor(id),
      fullFigure,
      crops: { full: fullFigure ? { x: 0, y: 0, w: 200, h: 400 } : headCrop, bust, head: headCrop }
    };
  }
  var ARTWORK = Object.fromEntries(ARTWORK_IDS.map((id) => [id, artwork(id)]));
  var HEAD_IDS = ARTWORK_IDS.filter((id) => id.startsWith("head"));
  function artworkForSeed(seed) {
    const r = rng(seed >>> 0, "crew-reference-art-v3"), roll = r();
    if (roll < 0.16) return "figure_0";
    if (roll < 0.3) return "figure_1";
    if (roll < 0.38) return "figure_2";
    return HEAD_IDS[Math.floor(r() * HEAD_IDS.length)];
  }

  // src/character/TextureCache.ts
  function sourceIdOf(src) {
    if (src.kind === "svg") return `svg:${hash32(src.markup).toString(36)}.${hash32(src.markup, src.markup.length).toString(36)}:${src.width}x${src.height}`;
    const f = src.frame;
    const d = src.destination;
    return `atlas:${src.url}#${f.x},${f.y},${f.w},${f.h}:${src.width}x${src.height}${d ? `:${d.x},${d.y},${d.w},${d.h}` : ""}`;
  }
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`texture load failed: ${url.slice(0, 80)}`));
      img.src = url;
    });
  }
  var TextureCache = class _TextureCache {
    constructor(budgetBytes = 32 * 1024 * 1024) {
      this.budgetBytes = budgetBytes;
      this.entries = /* @__PURE__ */ new Map();
      // insertion order = LRU order
      this.pending = /* @__PURE__ */ new Map();
      this.atlases = /* @__PURE__ */ new Map();
      this.listeners = /* @__PURE__ */ new Set();
      this.failures = /* @__PURE__ */ new Map();
      this.bytes = 0;
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
    }
    /** A texture is one source, one region of its art space, at one scale step. */
    static key(sourceId, r, q) {
      return `${sourceId}|${r.x},${r.y},${r.w},${r.h}@${q}`;
    }
    /** Synchronous lookup used while drawing. Marks the texture as recently used. */
    peek(sourceId, region, q) {
      const k = _TextureCache.key(sourceId, region, q), t = this.entries.get(k);
      if (t) {
        this.entries.delete(k);
        this.entries.set(k, t);
        this.hits++;
      }
      return t;
    }
    /**
     * Rasterise (or fetch) `region` of a source at scale `q` (pixels per art unit); concurrent calls
     * share one promise. Resolves null on failure.
     */
    request(sourceId, src, region, q) {
      const k = _TextureCache.key(sourceId, region, q);
      const ready = this.entries.get(k);
      if (ready) return Promise.resolve(ready);
      if (Date.now() < (this.failures.get(k) ?? 0)) return Promise.resolve(null);
      let p = this.pending.get(k);
      if (!p) {
        this.misses++;
        p = this.rasterise(src, region, Math.max(1, Math.round(region.w * q)), Math.max(1, Math.round(region.h * q))).then((t) => {
          this.failures.delete(k);
          this.store(k, t);
          return t;
        }).catch((err) => {
          this.failures.set(k, Date.now() + 1e4);
          console.warn("[CharacterKit]", err);
          return null;
        }).finally(() => {
          this.pending.delete(k);
          this.listeners.forEach((fn) => fn());
        });
        this.pending.set(k, p);
      }
      return p;
    }
    /** Called whenever a texture finishes loading, so views can redraw. Returns an unsubscribe function. */
    onLoad(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    stats() {
      return { textures: this.entries.size, bytes: this.bytes, budgetBytes: this.budgetBytes, hits: this.hits, misses: this.misses, pending: this.pending.size, evictions: this.evictions, atlases: this.atlases.size };
    }
    hasFailure(sourceId) {
      for (const key of this.failures.keys()) if (key.startsWith(sourceId + "|")) return true;
      return false;
    }
    clear() {
      this.entries.clear();
      this.atlases.clear();
      this.failures.clear();
      this.bytes = 0;
    }
    store(k, t) {
      this.entries.set(k, t);
      this.bytes += t.bytes;
      for (const [key, old] of this.entries) {
        if (this.bytes <= this.budgetBytes || key === k) break;
        this.entries.delete(key);
        this.bytes -= old.bytes;
        this.evictions++;
      }
    }
    async rasterise(src, r, w, h) {
      let img, sx = 0, sy = 0, sw, sh;
      let dx = 0, dy = 0, dw = w, dh = h;
      if (src.kind === "svg") {
        const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.w} ${r.h}" width="${w}" height="${h}">${src.markup}</svg>`;
        img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(doc));
        sw = img.naturalWidth || w;
        sh = img.naturalHeight || h;
      } else {
        let a = this.atlases.get(src.url);
        if (!a) {
          a = loadImage(src.url);
          this.atlases.set(src.url, a);
          a.catch(() => this.atlases.delete(src.url));
        }
        img = await a;
        const d = src.destination ?? { x: 0, y: 0, w: src.width, h: src.height };
        const x = Math.max(r.x, d.x), y = Math.max(r.y, d.y);
        const rw = Math.max(0, Math.min(r.x + r.w, d.x + d.w) - x);
        const rh = Math.max(0, Math.min(r.y + r.h, d.y + d.h) - y);
        const kx = src.frame.w / d.w, ky = src.frame.h / d.h;
        sx = src.frame.x + (x - d.x) * kx;
        sy = src.frame.y + (y - d.y) * ky;
        sw = rw * kx;
        sh = rh * ky;
        dx = (x - r.x) * w / r.w;
        dy = (y - r.y) * h / r.h;
        dw = rw * w / r.w;
        dh = rh * h / r.h;
      }
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      ctx.imageSmoothingQuality = "high";
      if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      return { image: canvas, width: w, height: h, bytes: w * h * 4 };
    }
  };

  // src/character/types.ts
  var SLOT_Z = {
    backing: 0,
    gearBack: 50,
    body: 100,
    outfit: 200,
    gear: 250,
    headBack: 300,
    head: 400,
    face: 500,
    hair: 600,
    helmet: 700,
    weapon: 800,
    overlay: 900
  };

  // src/character/AssetFactory.ts
  var bundleURL = typeof document === "undefined" ? void 0 : new URL(document.currentScript?.getAttribute("src") || ".", document.baseURI).href;
  var AssetFactory = class {
    constructor(opts = {}) {
      this.opts = opts;
      this.assets = /* @__PURE__ */ new Map();
      this.cache = opts.cache ?? new TextureCache();
      this.maxAssets = opts.maxAssets ?? 96;
      if (!Number.isInteger(this.maxAssets) || this.maxAssets < 1) throw new RangeError("maxAssets must be a positive integer");
      if (!opts.atlasUrl && !bundleURL) throw new Error("An absolute atlasUrl is required outside the browser");
      this.atlasUrl = new URL(opts.atlasUrl ?? "assets/crew/crew.png", bundleURL).href;
    }
    traits(seed) {
      return ARTWORK[artworkForSeed(seed)].identity;
    }
    resolve(rec) {
      const seed = rec.seed >>> 0;
      const artworkId = rec.customization?.spriteId ?? artworkForSeed(seed);
      const art = ARTWORK[artworkId];
      if (!art) throw new RangeError(`Unknown crew sprite: ${artworkId}`);
      const eq = rec.equipment ?? {}, kit = JOB_KITS[rec.job] ?? FALLBACK_KIT;
      const outfit = eq.outfit ?? (eq.armor ? DEFAULT_OUTFIT[eq.armor] : kit.outfit);
      const equipment = {
        armor: eq.armor ?? OUTFITS[outfit].armor,
        outfit,
        accessories: eq.accessories ?? kit.accessories,
        weapon: eq.weapon ?? kit.weapon,
        helmet: eq.helmet ?? kit.helmet
      };
      const jobColor = this.opts.jobColors?.[rec.job] ?? FALLBACK_JOB_COLOR;
      const key = JSON.stringify([seed, rec.job, jobColor, artworkId, equipment]);
      return { key, seed, job: rec.job, jobColor, identity: art.identity, artworkId, crops: art.crops, equipment };
    }
    create(rec) {
      const sheet = this.resolve(rec);
      let asset = this.assets.get(sheet.key);
      if (asset) {
        this.assets.delete(sheet.key);
        this.assets.set(sheet.key, asset);
        return asset;
      }
      asset = new CharacterAsset(sheet, this.layersFor(sheet), () => [], this.cache, this.opts.driver?.());
      this.assets.set(sheet.key, asset);
      while (this.assets.size > this.maxAssets) {
        const oldest = this.assets.keys().next().value;
        if (oldest !== void 0) this.assets.delete(oldest);
      }
      return asset;
    }
    layersFor(sheet) {
      const art = ARTWORK[sheet.artworkId];
      const source = {
        kind: "atlas",
        url: this.atlasUrl,
        frame: art.frame,
        width: VIEW_W,
        height: VIEW_H,
        destination: art.destination
      };
      return [{
        id: sheet.artworkId,
        sourceId: sourceIdOf(source),
        slot: "body",
        z: SLOT_Z.body,
        source,
        bounds: art.destination,
        bone: "root",
        blend: "source-over",
        opacity: 1
      }];
    }
    stats() {
      return { assets: this.assets.size, ...this.cache.stats() };
    }
  };

  // src/character/dom.ts
  var EXPRESSIONS = ["neutral", "happy", "determined", "hurt", "ko"];
  var ARMORS = ["light", "medium", "heavy"];
  var WEAPONS = ["none", "pistol", "carbine", "shotgun", "longRifle", "arcWrench", "medInjector", "datapad"];
  var HELMETS = ["none", "headset", "goggles", "visor", "beanie", "combat"];
  var OUTFIT_IDS = ["flightSuit", "traderJacket", "tacticalUniform", "enforcerCoat", "lightArmor", "armorSuit", "harness"];
  var CROP_IDS = ["full", "bust", "head"];
  var oneOf = (list, v) => v && list.includes(v) ? v : void 0;
  var PortraitStage = class {
    constructor(factory2, fps = 30) {
      this.factory = factory2;
      this.fps = fps;
      this.mounts = /* @__PURE__ */ new Map();
      this.raf = 0;
      this.last = 0;
      this.reducedMotion = false;
      this.tick = (t) => {
        this.raf = 0;
        let keepGoing = false;
        const due = t - this.last >= 1e3 / this.fps - 2;
        if (due) this.last = t;
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const m of this.mounts.values()) {
          if (!m.canvas.isConnected) {
            this.unmount(m.canvas);
            continue;
          }
          const animated = m.asset.isAnimated(t, m.state);
          if (m.state.oneShots.size === 0 && m.canvas.dataset.animating === "true") m.dirty = true;
          m.canvas.dataset.animating = String(animated);
          const r = m.canvas.getBoundingClientRect();
          if (r.width === 0 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
          if (animated || m.dirty) keepGoing = true;
          if (!due || !(animated || m.dirty)) continue;
          this.draw(m, t);
        }
        if (keepGoing) this.wake();
      };
      if (typeof matchMedia === "function") {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        this.reducedMotion = mq.matches;
        mq.addEventListener?.("change", (e) => {
          this.reducedMotion = e.matches;
          this.mounts.forEach((m) => {
            m.state.reducedMotion = e.matches;
            m.dirty = true;
          });
          this.wake();
        });
      }
      factory2.cache.onLoad(() => {
        this.mounts.forEach((m) => {
          m.dirty = true;
        });
        this.wake();
      });
      document.addEventListener("visibilitychange", () => this.wake());
      const refresh = () => {
        this.mounts.forEach((m) => {
          m.dirty = true;
        });
        this.wake();
      };
      window.addEventListener("resize", refresh);
      window.addEventListener("orientationchange", refresh);
      document.addEventListener("scroll", () => this.wake(), { passive: true, capture: true });
      window.addEventListener("online", () => {
        factory2.cache.clear();
        refresh();
      });
    }
    /**
     * Bind an asset to a canvas and draw it immediately (cached textures => no flicker on re-render).
     * Returns the view's AnimationState: set its expression or start clips with asset.play(clip, t, state).
     */
    mount(canvas, asset, opts = {}) {
      const state = opts.state ?? this.mounts.get(canvas)?.state ?? asset.createState();
      state.reducedMotion = this.reducedMotion;
      const m = { canvas, asset, crop: opts.crop ?? "full", state, dirty: true };
      this.mounts.set(canvas, m);
      this.draw(m, performance.now());
      this.wake();
      return state;
    }
    /** Redraw a mounted canvas soon (after changing its state's expression or clips). */
    invalidate(canvas) {
      const m = this.mounts.get(canvas);
      if (m) {
        m.dirty = true;
        this.wake();
      }
    }
    unmount(canvas) {
      this.mounts.delete(canvas);
    }
    get size() {
      return this.mounts.size;
    }
    draw(m, t) {
      const cv = m.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round((cv.clientWidth || cv.width) * dpr)), h = Math.max(1, Math.round((cv.clientHeight || cv.height) * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const ready = m.asset.render(ctx, 0, 0, w, h, { crop: m.crop, time: t, clear: true, state: m.state });
      cv.dataset.portraitStatus = ready ? "ready" : m.asset.loadFailed ? "error" : "loading";
      cv.title = m.asset.loadFailed ? "Portrait unavailable. Reconnect or reload to retry." : "";
      if (!ready && m.asset.loadFailed) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#9bb4c4";
        ctx.font = `${Math.max(9, w / 12)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Art unavailable", w / 2, h / 2, w - 6);
      }
      m.dirty = false;
    }
    wake() {
      if (!this.raf && this.mounts.size && !document.hidden) this.raf = requestAnimationFrame(this.tick);
    }
  };
  function portraitMarkup(factory2, rec, o = {}) {
    const eq = rec.equipment ?? {};
    const attrs = {
      "data-seed": rec.seed >>> 0,
      "data-job": rec.job,
      "data-expr": o.expression,
      "data-crop": o.crop,
      "data-armor": eq.armor,
      "data-outfit": eq.outfit,
      "data-weapon": eq.weapon,
      "data-helmet": eq.helmet,
      "data-track": o.track,
      "data-hp": o.hp,
      "data-sprite": rec.customization?.spriteId,
      "data-accessories": eq.accessories?.join(",")
    };
    const label = o.label ?? `${factory2.resolve(rec).identity.label} ${rec.job} crew portrait`;
    const a = Object.entries(attrs).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}="${esc(v)}"`).join(" ");
    return `<canvas class="portrait-art${o.className ? " " + esc(o.className) : ""}" data-portrait ${a} role="img" aria-label="${esc(label)}"></canvas>`;
  }
  var tracked = /* @__PURE__ */ new Map();
  function hydrateWith(stage2, root) {
    const list = root.querySelectorAll("canvas[data-portrait]");
    list.forEach((cv) => {
      const d = cv.dataset;
      const equipment = {};
      const armor = oneOf(ARMORS, d.armor), outfit = oneOf(OUTFIT_IDS, d.outfit), weapon = oneOf(WEAPONS, d.weapon), helmet = oneOf(HELMETS, d.helmet);
      if (armor) equipment.armor = armor;
      if (outfit) equipment.outfit = outfit;
      if (weapon) equipment.weapon = weapon;
      if (helmet) equipment.helmet = helmet;
      const spriteId = oneOf(ARTWORK_IDS, d.sprite);
      if (d.sprite && !spriteId) throw new RangeError(`Unknown crew sprite: ${d.sprite}`);
      if (d.accessories != null) {
        const accessories = d.accessories ? d.accessories.split(",") : [];
        const allowed = ["belt", "holster", "gloves", "chestRig", "pauldrons", "backpack", "toolPouch", "medPouch"];
        equipment.accessories = accessories.map((id) => {
          const accessory = oneOf(allowed, id);
          if (!accessory) throw new RangeError(`Unknown crew accessory: ${id}`);
          return accessory;
        });
      }
      const asset = stage2.factory.create({ seed: Number(d.seed) >>> 0, job: d.job || "Captain", equipment, customization: spriteId ? { spriteId } : void 0 });
      const expression = oneOf(EXPRESSIONS, d.expr) ?? "neutral";
      let state;
      let hit = false;
      if (d.track) {
        let t = tracked.get(d.track);
        if (!t || t.key !== asset.key) {
          if (tracked.size > 512) tracked.clear();
          t = { key: asset.key, state: asset.createState() };
          tracked.set(d.track, t);
        }
        state = t.state;
        if (d.hp != null && d.hp !== "") {
          const hp = Number(d.hp);
          hit = t.hp != null && hp < t.hp;
          t.hp = hp;
        }
      }
      state ?? (state = asset.createState());
      state.expression = expression;
      if (hit) asset.play("hit", performance.now(), state);
      stage2.mount(cv, asset, { crop: oneOf(CROP_IDS, d.crop) ?? "full", state });
    });
    return list.length;
  }

  // src/character/index.ts
  var VERSION = "3.0.0";
  var stage = null;
  var getStage = () => stage ?? (stage = new PortraitStage(new AssetFactory()));
  function configure(opts = {}) {
    stage = new PortraitStage(new AssetFactory(opts), opts.fps);
    return stage;
  }
  var factory = () => getStage().factory;
  var traits = (seed) => getStage().factory.traits(seed);
  var portraitHTML = (rec, o) => portraitMarkup(getStage().factory, rec, o);
  var hydrate = (root) => hydrateWith(getStage(), root);
  var stats = () => ({ mounted: getStage().size, ...getStage().factory.stats() });
  return __toCommonJS(index_exports);
})();
