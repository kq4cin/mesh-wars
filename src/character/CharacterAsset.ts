// CharacterAsset: the visual state of one character and the compositor that draws it.
//
// Draw pipeline for one frame:
//   1. the animation driver samples a Pose (bones, face override, alpha channels, post fx)
//   2. visible layers = static layers + face layers for the current variant, sorted by z,
//      minus any slot occluded by another visible layer (beanie / combat helmet hides hair)
//   3. each layer's texture covers only (layer bounds ∩ visible crop) at a quantised scale, and is
//      drawn with its own blend mode & alpha under its bone's transform
//   4. alpha-preserving `source-atop` passes: grey dimming (KO) and colour flash (damage)

import { CLIPS, IdleDriver, type ClipName } from './animation';
import { PIVOTS, VIEW_H, VIEW_W } from './layout';
import { TextureCache, type Texture } from './TextureCache';
import type {
  AnimationDriver, AnimationState, AssetLayer, BoneName, CharacterSheet, Crop, Expression, FaceVariant, LayerSlot, Pose, Rect, RenderOptions,
} from './types';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type FaceBuilder = (v: FaceVariant) => AssetLayer[];
interface DrawStep { layer: AssetLayer; tex: Texture; region: Rect; alpha: number }

const CHAIN: Record<BoneName, readonly BoneName[]> = { root: ['root'], torso: ['root', 'torso'], head: ['root', 'torso', 'head'] };
/** Texture scale steps (pixels per art unit). Similar sizes share textures; bigger steps cost more memory. */
const STEPS = [0.25, 0.35, 0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.4, 4];
const stepFor = (s: number): number => STEPS.find(q => q >= s - 1e-3) ?? STEPS[STEPS.length - 1];
/** Extra art-space margin rasterised around a crop so bone motion never reveals a texture edge. */
const PAD = 10;

function regionFor(bounds: Rect, crop: Rect): Rect | null {
  const x0 = Math.max(bounds.x, crop.x - PAD, 0), y0 = Math.max(bounds.y, crop.y - PAD, 0);
  const x1 = Math.min(bounds.x + bounds.w, crop.x + crop.w + PAD, VIEW_W), y1 = Math.min(bounds.y + bounds.h, crop.y + crop.h + PAD, VIEW_H);
  if (x1 <= x0 || y1 <= y0) return null;
  const x = Math.floor(x0), y = Math.floor(y0);
  return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
}

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
function scratchCtx(w: number, h: number): Ctx2D {
  if (!scratch) scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  const c = scratch.getContext('2d') as Ctx2D;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return c;
}

export class CharacterAsset {
  readonly key: string;
  driver: AnimationDriver;
  private readonly state: AnimationState;
  private readonly faceCache = new Map<string, AssetLayer[]>();
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly sheet: CharacterSheet,
    private readonly baseLayers: readonly AssetLayer[],
    private readonly buildFace: FaceBuilder,
    private readonly cache: TextureCache,
    driver?: AnimationDriver,
  ) {
    this.key = sheet.key;
    this.driver = driver ?? new IdleDriver();
    this.state = this.createState();
  }

  /** A fresh per-view animation state (see RenderOptions.state). */
  createState(expression: Expression = 'neutral'): AnimationState {
    return { expression, phase: (this.sheet.seed % 997) / 997, oneShots: new Map(), reducedMotion: false };
  }

  get expression(): Expression { return this.state.expression; }
  get loadFailed(): boolean { return this.baseLayers.some(layer => this.cache.hasFailure(layer.sourceId)); }

  setExpression(e: Expression): this {
    if (this.state.expression !== e) { this.state.expression = e; this.emit(); }
    return this;
  }

  /** Start a one-shot clip ("hit" flinch, "nod") on the default state, or on a view's own state. */
  play(clip: ClipName, now = performance.now(), state: AnimationState = this.state): this {
    state.oneShots.set(clip, now);
    if (state === this.state) this.emit();
    return this;
  }

  setReducedMotion(on: boolean): this { this.state.reducedMotion = on; return this; }

  /** Whether render() output changes over time right now (lets the stage skip static portraits). */
  isAnimated(now = performance.now(), state: AnimationState = this.state): boolean { pruneClips(state, now); return this.driver.isAnimated(state); }

  /** Notified when the default state's expression or clips change. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Layers for one face variant, z-sorted with occluded slots removed. */
  layers(variant: FaceVariant = { expression: this.state.expression, blink: false }): AssetLayer[] {
    const all = this.baseLayers.concat(this.faceLayers(variant)).sort((a, b) => a.z - b.z);
    const hidden = new Set<LayerSlot>();
    for (const l of all) l.occludes?.forEach(s => hidden.add(s));
    return hidden.size ? all.filter(l => !hidden.has(l.slot)) : all;
  }

  /** Warm the texture cache for a target pixel size (current expression, open and blinking). */
  async prefetch(pixelW: number, pixelH: number, crop: Crop = 'full'): Promise<void> {
    const c = this.sheet.crops[crop], q = stepFor(Math.min(pixelW / c.w, pixelH / c.h)), seen = new Set<string>(), jobs: Promise<unknown>[] = [];
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
  render(ctx: Ctx2D, dx: number, dy: number, dw: number, dh: number, opts: RenderOptions = {}): boolean {
    const t = opts.time ?? performance.now(), st = opts.state ?? this.state;
    pruneClips(st, t);
    const pose = this.driver.sample(t, st);
    const crop = this.sheet.crops[opts.crop ?? 'full'];
    const scale = Math.min(dw / crop.w, dh / crop.h), q = stepFor(scale);

    // Resolve every texture before touching the canvas. If a layer has no texture at all we fall
    // back to the resting face, then to the last face that drew completely (an expression change
    // must never blank the portrait); failing that nothing is drawn rather than a half-built figure.
    const resting: FaceVariant = { expression: st.expression, blink: false };
    const variants = [pose.face, resting, st.lastFace].filter((v): v is FaceVariant => !!v);
    let complete = true, plan: DrawStep[] | null = null;
    for (const v of variants) {
      const r = this.plan(v, pose, crop, q);
      complete &&= r.complete;
      if (r.steps) { plan = r.steps; if (r.complete) st.lastFace = v; break; }
    }
    if (!plan) return false;

    const post = !!pose.tint || pose.desaturate > 0;
    if (opts.clear) ctx.clearRect(dx, dy, dw, dh);
    const target: Ctx2D = post ? scratchCtx(Math.ceil(dw), Math.ceil(dh)) : ctx;
    const bx = post ? 0 : dx, by = post ? 0 : dy;
    // Contain the crop rather than cutting off heads or boots in mismatched viewports.
    const ox = bx + (dw - crop.w * scale) / 2 - crop.x * scale, oy = by + (dh - crop.h * scale) / 2 - crop.y * scale;

    target.save();
    target.beginPath(); target.rect(bx, by, dw, dh); target.clip();
    target.imageSmoothingQuality = 'high';
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
        target.globalCompositeOperation = 'source-atop';
        target.fillStyle = `rgba(128,128,128,${pose.desaturate})`;
        target.fillRect(0, 0, w, h);
      }
      if (pose.tint && pose.tint.alpha > 0) {
        target.globalCompositeOperation = 'source-atop';
        target.globalAlpha = pose.tint.alpha;
        target.fillStyle = pose.tint.color;
        target.fillRect(0, 0, w, h);
      }
      target.restore();
      ctx.drawImage(target.canvas as CanvasImageSource, 0, 0, w, h, dx, dy, w, h);
    }
    return complete;
  }

  private plan(v: FaceVariant, pose: Pose, crop: Rect, q: number): { steps: DrawStep[] | null; complete: boolean } {
    const steps: DrawStep[] = [];
    let complete = true;
    for (const layer of this.layers(v)) {
      const region = regionFor(layer.bounds, crop);
      if (!region) continue;
      let tex: Texture | undefined = this.cache.peek(layer.sourceId, region, q);
      if (!tex) {
        complete = false;
        void this.cache.request(layer.sourceId, layer.source, region, q);
        tex = this.fallback(layer.sourceId, region, q);
        if (!tex) return { steps: null, complete };
      }
      const alpha = layer.opacity * (layer.alphaChannel ? pose.alpha[layer.alphaChannel] ?? 1 : 1);
      if (alpha > 0.002) steps.push({ layer, tex, region, alpha });
    }
    return { steps, complete };
  }

  private faceLayers(v: FaceVariant): AssetLayer[] {
    const k = `${v.expression}${v.blink ? ':blink' : ''}`;
    let layers = this.faceCache.get(k);
    if (!layers) { layers = this.buildFace(v); this.faceCache.set(k, layers); }
    return layers;
  }

  private fallback(sourceId: string, region: Rect, wanted: number): Texture | undefined {
    for (let i = STEPS.length - 1; i >= 0; i--) {
      if (STEPS[i] === wanted) continue;
      const t = this.cache.peek(sourceId, region, STEPS[i]);
      if (t) return t;
    }
    return undefined;
  }

  private emit(): void { this.listeners.forEach(fn => fn()); }
}

function pruneClips(st: AnimationState, now: number): void {
  for (const [name, start] of st.oneShots) if (now - start > CLIPS[name as ClipName]) st.oneShots.delete(name);
}

function applyBones(ctx: Ctx2D, pose: Pose, bone: BoneName): void {
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
