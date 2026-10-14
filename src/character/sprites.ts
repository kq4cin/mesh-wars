import manifest from '../../assets/crew/sprites.json';
import { rng } from './rng';
import type { Crop, Identity, Rect } from './types';

export type ArtworkId = keyof typeof manifest.sprites;
interface SpriteFrame { w: number; h: number; frame: Rect; head?: Rect }
export interface Artwork {
  frame: Rect;
  destination: Rect;
  crops: Readonly<Record<Crop, Rect>>;
  identity: Identity;
  fullFigure: boolean;
}

const frames: Readonly<Record<ArtworkId, SpriteFrame>> = manifest.sprites;
export const ARTWORK_IDS = Object.keys(frames) as ArtworkId[];

function identityFor(id: ArtworkId): Identity {
  if (id === 'figure_0') return { species: 'human', gender: 'female', label: 'Human / Female' };
  if (id === 'figure_1') return { species: 'reptilian', gender: 'none', label: 'Reptilian' };
  if (id === 'figure_2' || id.startsWith('head_robot'))
    return { species: 'synthetic', gender: 'none', label: 'Synthetic' };
  if (id.startsWith('head_ext')) return { species: 'combat', gender: 'none', label: 'Combat Robot' };
  const n = Number(id.slice(-1));
  const cybernetic = (id.startsWith('head_bald') && n >= 3) || (id.startsWith('head_mid') && n >= 4);
  return { species: cybernetic ? 'cybernetic' : 'human', gender: 'male', label: `${cybernetic ? 'Cybernetic' : 'Human'} / Male` };
}

function artwork(id: ArtworkId): Artwork {
  const s = frames[id], fullFigure = id.startsWith('figure');
  const scale = fullFigure ? Math.min(180 / s.w, 380 / s.h) : Math.min(88 / s.w, 96 / s.h);
  const destination = { x: (200 - s.w * scale) / 2, y: 8, w: s.w * scale, h: s.h * scale };
  const head = s.head ?? { x: 0, y: 0, w: s.w, h: s.h };
  const size = Math.max(head.w, head.h) * scale + 12;
  const headCrop = {
    x: destination.x + (head.x + head.w / 2) * scale - size / 2,
    y: destination.y + (head.y + head.h / 2) * scale - size / 2, w: size, h: size,
  };
  const bust = fullFigure
    ? { x: 40, y: 0, w: 120, h: 144 }
    : { x: headCrop.x, y: headCrop.y - size * 0.1, w: size, h: size * 1.2 };
  return {
    frame: s.frame, destination, identity: identityFor(id), fullFigure,
    crops: { full: fullFigure ? { x: 0, y: 0, w: 200, h: 400 } : headCrop, bust, head: headCrop },
  };
}

export const ARTWORK = Object.fromEntries(ARTWORK_IDS.map(id => [id, artwork(id)])) as Record<ArtworkId, Artwork>;
const HEAD_IDS = ARTWORK_IDS.filter(id => id.startsWith('head'));

export function artworkForSeed(seed: number): ArtworkId {
  const r = rng(seed >>> 0, 'crew-reference-art-v3'), roll = r();
  if (roll < 0.16) return 'figure_0';
  if (roll < 0.30) return 'figure_1';
  if (roll < 0.38) return 'figure_2';
  return HEAD_IDS[Math.floor(r() * HEAD_IDS.length)];
}
