// CharacterKit public API. Bundled by esbuild into /character.js as the global `CharacterKit`
// (see package.json "build"), so the game can load it with a plain <script> tag.

import { AssetFactory, type FactoryOptions } from './AssetFactory';
import { hydrateWith, portraitMarkup, PortraitStage, type PortraitMarkupOptions } from './dom';
import type { CharacterRecord, Identity } from './types';

export { AssetFactory } from './AssetFactory';
export { CharacterAsset } from './CharacterAsset';
export { CROPS, PIVOTS, VIEW_W, VIEW_H } from './layout';
export { JOB_KITS, OUTFITS } from './catalog';
export { ARTWORK, ARTWORK_IDS } from './sprites';
export { TextureCache, sourceIdOf } from './TextureCache';
export { IdleDriver, CLIPS } from './animation';
export { PortraitStage, portraitMarkup, hydrateWith } from './dom';
export { SLOT_Z } from './types';
export type * from './types';

export const VERSION = '3.0.0';

let stage: PortraitStage | null = null;
const getStage = (): PortraitStage => (stage ??= new PortraitStage(new AssetFactory()));

/** Create the shared factory/stage. Call once before rendering (later calls replace it). */
export function configure(opts: FactoryOptions & { fps?: number } = {}): PortraitStage {
  stage = new PortraitStage(new AssetFactory(opts), opts.fps);
  return stage;
}

export const factory = (): AssetFactory => getStage().factory;
export const traits = (seed: number): Identity => getStage().factory.traits(seed);
export const portraitHTML = (rec: CharacterRecord, o?: PortraitMarkupOptions): string => portraitMarkup(getStage().factory, rec, o);
export const hydrate = (root: ParentNode): number => hydrateWith(getStage(), root);
export const stats = () => ({ mounted: getStage().size, ...getStage().factory.stats() });
