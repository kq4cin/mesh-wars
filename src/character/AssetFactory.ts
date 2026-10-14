import { CharacterAsset } from './CharacterAsset';
import { DEFAULT_OUTFIT, FALLBACK_JOB_COLOR, FALLBACK_KIT, JOB_KITS, OUTFITS } from './catalog';
import { VIEW_H, VIEW_W } from './layout';
import { ARTWORK, artworkForSeed } from './sprites';
import { TextureCache, sourceIdOf } from './TextureCache';
import { SLOT_Z, type AnimationDriver, type AssetLayer, type CharacterRecord, type CharacterSheet, type Identity } from './types';

const bundleURL = typeof document === 'undefined' ? undefined
  : new URL(document.currentScript?.getAttribute('src') || '.', document.baseURI).href;

export interface FactoryOptions {
  jobColors?: Record<string, string>;
  cache?: TextureCache;
  maxAssets?: number;
  driver?: () => AnimationDriver;
  /** Absolute atlas URL override; otherwise resolved relative to character.js (including Pages subpaths). */
  atlasUrl?: string;
}

export class AssetFactory {
  readonly cache: TextureCache;
  private readonly assets = new Map<string, CharacterAsset>();
  private readonly maxAssets: number;
  private readonly atlasUrl: string;

  constructor(private readonly opts: FactoryOptions = {}) {
    this.cache = opts.cache ?? new TextureCache();
    this.maxAssets = opts.maxAssets ?? 96;
    if (!Number.isInteger(this.maxAssets) || this.maxAssets < 1) throw new RangeError('maxAssets must be a positive integer');
    if (!opts.atlasUrl && !bundleURL) throw new Error('An absolute atlasUrl is required outside the browser');
    this.atlasUrl = new URL(opts.atlasUrl ?? 'assets/crew/crew.png', bundleURL).href;
  }

  traits(seed: number): Identity { return ARTWORK[artworkForSeed(seed)].identity; }

  resolve(rec: CharacterRecord): CharacterSheet {
    const seed = rec.seed >>> 0;
    const artworkId = rec.customization?.spriteId ?? artworkForSeed(seed);
    const art = ARTWORK[artworkId];
    if (!art) throw new RangeError(`Unknown crew sprite: ${artworkId}`);
    const eq = rec.equipment ?? {}, kit = JOB_KITS[rec.job] ?? FALLBACK_KIT;
    const outfit = eq.outfit ?? (eq.armor ? DEFAULT_OUTFIT[eq.armor] : kit.outfit);
    const equipment = {
      armor: eq.armor ?? OUTFITS[outfit].armor, outfit,
      accessories: eq.accessories ?? kit.accessories,
      weapon: eq.weapon ?? kit.weapon, helmet: eq.helmet ?? kit.helmet,
    };
    const jobColor = this.opts.jobColors?.[rec.job] ?? FALLBACK_JOB_COLOR;
    // Equipment is retained as game metadata, not composited onto flattened artwork.
    const key = JSON.stringify([seed, rec.job, jobColor, artworkId, equipment]);
    return { key, seed, job: rec.job, jobColor, identity: art.identity, artworkId, crops: art.crops, equipment };
  }

  create(rec: CharacterRecord): CharacterAsset {
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
      if (oldest !== undefined) this.assets.delete(oldest);
    }
    return asset;
  }

  layersFor(sheet: CharacterSheet): AssetLayer[] {
    const art = ARTWORK[sheet.artworkId];
    const source = {
      kind: 'atlas' as const, url: this.atlasUrl, frame: art.frame,
      width: VIEW_W, height: VIEW_H, destination: art.destination,
    };
    return [{
      id: sheet.artworkId, sourceId: sourceIdOf(source), slot: 'body', z: SLOT_Z.body,
      source, bounds: art.destination, bone: 'root', blend: 'source-over', opacity: 1,
    }];
  }

  stats(): ReturnType<TextureCache['stats']> & { assets: number } {
    return { assets: this.assets.size, ...this.cache.stats() };
  }
}
