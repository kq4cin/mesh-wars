// TextureCache: one rasterised bitmap per (asset content, pixel size), shared by every character.
//
// * Content-addressed: keys are hashes of the layer source, so two crew members with the same
//   backing, uniform, armour or weapon share the exact same bitmap.
// * In-flight de-duplication: concurrent requests for a texture await one decode.
// * LRU with a byte budget (w * h * 4) so long sessions can't grow memory without bound.
// * Atlas images are fetched once per absolute URL (the service worker serves them offline) and
//   individual frames are cut into their own textures.

import { hash32 } from './rng';
import type { AssetSource, Rect } from './types';

export type TextureImage = HTMLCanvasElement | OffscreenCanvas;
export interface Texture { image: TextureImage; width: number; height: number; bytes: number }

export interface TextureCacheStats {
  textures: number; bytes: number; budgetBytes: number; hits: number; misses: number; pending: number; evictions: number; atlases: number;
}

export function sourceIdOf(src: AssetSource): string {
  if (src.kind === 'svg') return `svg:${hash32(src.markup).toString(36)}.${hash32(src.markup, src.markup.length).toString(36)}:${src.width}x${src.height}`;
  const f = src.frame;
  const d = src.destination;
  return `atlas:${src.url}#${f.x},${f.y},${f.w},${f.h}:${src.width}x${src.height}${d ? `:${d.x},${d.y},${d.w},${d.h}` : ''}`;
}

function makeCanvas(w: number, h: number): TextureImage {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`texture load failed: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

export class TextureCache {
  private readonly entries = new Map<string, Texture>(); // insertion order = LRU order
  private readonly pending = new Map<string, Promise<Texture | null>>();
  private readonly atlases = new Map<string, Promise<HTMLImageElement>>();
  private readonly listeners = new Set<() => void>();
  private readonly failures = new Map<string, number>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(readonly budgetBytes = 32 * 1024 * 1024) {}

  /** A texture is one source, one region of its art space, at one scale step. */
  static key(sourceId: string, r: Rect, q: number): string { return `${sourceId}|${r.x},${r.y},${r.w},${r.h}@${q}`; }

  /** Synchronous lookup used while drawing. Marks the texture as recently used. */
  peek(sourceId: string, region: Rect, q: number): Texture | undefined {
    const k = TextureCache.key(sourceId, region, q), t = this.entries.get(k);
    if (t) { this.entries.delete(k); this.entries.set(k, t); this.hits++; }
    return t;
  }

  /**
   * Rasterise (or fetch) `region` of a source at scale `q` (pixels per art unit); concurrent calls
   * share one promise. Resolves null on failure.
   */
  request(sourceId: string, src: AssetSource, region: Rect, q: number): Promise<Texture | null> {
    const k = TextureCache.key(sourceId, region, q);
    const ready = this.entries.get(k);
    if (ready) return Promise.resolve(ready);
    if (Date.now() < (this.failures.get(k) ?? 0)) return Promise.resolve(null);
    let p = this.pending.get(k);
    if (!p) {
      this.misses++;
      p = this.rasterise(src, region, Math.max(1, Math.round(region.w * q)), Math.max(1, Math.round(region.h * q)))
        .then(t => { this.failures.delete(k); this.store(k, t); return t; })
        .catch(err => { this.failures.set(k, Date.now() + 10000); console.warn('[CharacterKit]', err); return null; })
        .finally(() => { this.pending.delete(k); this.listeners.forEach(fn => fn()); });
      this.pending.set(k, p);
    }
    return p;
  }

  /** Called whenever a texture finishes loading, so views can redraw. Returns an unsubscribe function. */
  onLoad(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  stats(): TextureCacheStats {
    return { textures: this.entries.size, bytes: this.bytes, budgetBytes: this.budgetBytes, hits: this.hits, misses: this.misses, pending: this.pending.size, evictions: this.evictions, atlases: this.atlases.size };
  }

  hasFailure(sourceId: string): boolean {
    for (const key of this.failures.keys()) if (key.startsWith(sourceId + '|')) return true;
    return false;
  }

  clear(): void { this.entries.clear(); this.atlases.clear(); this.failures.clear(); this.bytes = 0; }

  private store(k: string, t: Texture): void {
    this.entries.set(k, t);
    this.bytes += t.bytes;
    for (const [key, old] of this.entries) {
      if (this.bytes <= this.budgetBytes || key === k) break;
      this.entries.delete(key); this.bytes -= old.bytes; this.evictions++;
    }
  }

  private async rasterise(src: AssetSource, r: Rect, w: number, h: number): Promise<Texture> {
    let img: HTMLImageElement, sx = 0, sy = 0, sw: number, sh: number;
    let dx = 0, dy = 0, dw = w, dh = h;
    if (src.kind === 'svg') {
      // the viewBox selects just the region, so the browser rasterises only the pixels we keep
      const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.w} ${r.h}" width="${w}" height="${h}">${src.markup}</svg>`;
      img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc));
      sw = img.naturalWidth || w; sh = img.naturalHeight || h;
    } else {
      let a = this.atlases.get(src.url);
      if (!a) { a = loadImage(src.url); this.atlases.set(src.url, a); a.catch(() => this.atlases.delete(src.url)); }
      img = await a;
      const d = src.destination ?? { x: 0, y: 0, w: src.width, h: src.height };
      const x = Math.max(r.x, d.x), y = Math.max(r.y, d.y);
      const rw = Math.max(0, Math.min(r.x + r.w, d.x + d.w) - x);
      const rh = Math.max(0, Math.min(r.y + r.h, d.y + d.h) - y);
      const kx = src.frame.w / d.w, ky = src.frame.h / d.h;
      sx = src.frame.x + (x - d.x) * kx; sy = src.frame.y + (y - d.y) * ky;
      sw = rw * kx; sh = rh * ky;
      dx = (x - r.x) * w / r.w; dy = (y - r.y) * h / r.h;
      dw = rw * w / r.w; dh = rh * h / r.h;
    }
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return { image: canvas, width: w, height: h, bytes: w * h * 4 };
  }
}
