// Deterministic helpers. These MUST stay bit-for-bit identical to `U.hash32`, `U.mulberry32`
// and `U.pick` in index.html: crew records only store a seed, so the portrait a player has
// seen for months is reproduced purely by replaying the same random sequence.

export type Rng = () => number;

export function hash32(...vals: unknown[]): number {
  let h = 0x811c9dc5;
  for (const v of vals) {
    const s = String(v);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= 0x2c; h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = (...v: unknown[]): Rng => mulberry32(hash32(...v));
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const hex = (n: number, l = 8): string => (n >>> 0).toString(16).toUpperCase().padStart(l, '0');
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const f1 = (v: number): string => v.toFixed(1);
