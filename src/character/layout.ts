import type { BoneName, Crop, Rect } from './types';

export const VIEW_W = 200;
export const VIEW_H = 400;
export const CROPS: Readonly<Record<Crop, Rect>> = {
  full: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
  bust: { x: 40, y: 0, w: 120, h: 144 },
  head: { x: 60, y: 0, w: 80, h: 80 },
};
export const PIVOTS: Readonly<Record<BoneName, readonly [number, number]>> = {
  root: [100, 200], torso: [100, 392], head: [100, 50],
};
