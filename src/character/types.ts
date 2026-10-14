// Public data contracts for the layered character pipeline ("Character Asset Class // Modular Crew Generation").
//
//   CharacterRecord (what the game stores)  --AssetFactory.resolve-->  CharacterSheet (fully resolved look)
//   CharacterSheet  --AssetFactory-->  AssetLayer[] (z-ordered, each pointing at an AssetSource)
//   AssetLayer.source  --TextureCache-->  rasterised bitmap shared by every character that uses it
//   CharacterAsset  composites the bitmaps with per-layer blend modes and a small bone rig.

/** Logical slots, listed back-to-front. The numeric z of each slot lives in SLOT_Z. */
export type LayerSlot =
  | 'backing'   // blueprint panel + floor shadow
  | 'gearBack'  // backpack, slung long gun: everything behind the figure
  | 'body'      // BASE BODY: skin / scales / robot frame
  | 'outfit'    // UNIFORMS & ARMOR: suits, coats, plate armour, boots
  | 'gear'      // ACCESSORY_KIT: belts, holsters, chest rigs, pauldrons, gloves
  | 'headBack'  // hair that falls behind the head (ponytail, bob)
  | 'head'      // HEAD_VARIANTS: skull, jaw, ears, implants, scars / robot heads
  | 'face'      // eyes, brows, mouth, optics: swapped per expression / blink
  | 'hair'      // HAIR_GEAR_LIB: cuts and beards
  | 'helmet'    // headgear and robot HEAD_EXTENSIONS
  | 'weapon'    // held weapon
  | 'overlay';  // frame and labels

export const SLOT_Z: Readonly<Record<LayerSlot, number>> = {
  backing: 0, gearBack: 50, body: 100, outfit: 200, gear: 250, headBack: 300, head: 400, face: 500, hair: 600, helmet: 700, weapon: 800, overlay: 900,
};

/** Bones of the rig. Layers attach to one bone and inherit its transform. */
export type BoneName = 'root' | 'torso' | 'head';

/** Supported species: Human, Alien A (Reptilian), Alien B (Cybernetic), Robot A (Synthetic), Robot B (Combat). */
export type Species = 'human' | 'reptilian' | 'cybernetic' | 'synthetic' | 'combat';
export type Gender = 'male' | 'female' | 'none';
export type Expression = 'neutral' | 'happy' | 'determined' | 'hurt' | 'ko';
export type ArmorClass = 'light' | 'medium' | 'heavy';
export type OutfitId = 'flightSuit' | 'traderJacket' | 'tacticalUniform' | 'enforcerCoat' | 'lightArmor' | 'armorSuit' | 'harness';
export type AccessoryId = 'belt' | 'holster' | 'gloves' | 'chestRig' | 'pauldrons' | 'backpack' | 'toolPouch' | 'medPouch';
export type WeaponId = 'none' | 'pistol' | 'carbine' | 'shotgun' | 'longRifle' | 'arcWrench' | 'medInjector' | 'datapad';
export type HelmetId = 'none' | 'headset' | 'goggles' | 'visor' | 'beanie' | 'combat';

import type { ArtworkId } from './sprites';

/** Portrait-space rectangle (the art space is VIEW_W x VIEW_H, see layout.ts). */
export interface Rect { x: number; y: number; w: number; h: number }

/** Where a layer's pixels come from. The shipped character library uses atlas sources only. */
export type AssetSource =
  /** Inner SVG markup (defs + shapes) in a `0 0 width height` space; any sub-region can be rasterised at any scale. */
  | { kind: 'svg'; markup: string; width: number; height: number }
  /** Absolute URL to an atlas image (served offline by the service worker); `frame` maps onto the whole width x height art space. */
  | { kind: 'atlas'; url: string; frame: Rect; width: number; height: number; destination?: Rect };

export interface AssetLayer {
  /** Stable id within one character, e.g. "face:hurt". */
  id: string;
  /** Content hash of `source`; the texture cache key, so identical art is rasterised and stored once. */
  sourceId: string;
  slot: LayerSlot;
  /** Absolute draw order: SLOT_Z[slot] + sub-order inside the slot. */
  z: number;
  source: AssetSource;
  /** Area the layer can paint. Only this part (clipped to the visible crop) is rasterised, so a face layer costs a face-sized texture. */
  bounds: Rect;
  bone: BoneName;
  /** Canvas compositing operation used when this layer is drawn (lighter glows, etc). */
  blend: GlobalCompositeOperation;
  opacity: number;
  /** Slots this layer hides completely while it is visible (a beanie or combat helmet hides hair). */
  occludes?: readonly LayerSlot[];
  /** Named alpha channel the animation driver may modulate (e.g. "glow" pulses). */
  alphaChannel?: string;
}

/** What the game persists for a crew member. Only `seed` and `job` are required. */
export interface CharacterRecord {
  seed: number;
  job: string;
  level?: number;
  /** Explicit equipment ids; anything omitted falls back to the job's default kit. */
  equipment?: Partial<EquipmentVisuals>;
  /** Select a fixed reference sprite; otherwise selected deterministically from the seed. */
  customization?: Partial<CustomizationIds>;
}

export interface CustomizationIds {
  spriteId: ArtworkId;
}

export interface EquipmentVisuals {
  /** Protection class; picks a default outfit of that class when `outfit` isn't given. */
  armor: ArmorClass;
  outfit: OutfitId;
  accessories: readonly AccessoryId[];
  weapon: WeaponId;
  helmet: HelmetId;
}

export interface Identity {
  species: Species;
  gender: Gender;
  /** Human-readable label, e.g. "Reptilian / Female". */
  label: string;
}

/** Fully resolved, render-ready description of one character. Pure data: safe to cache or serialise. */
export interface CharacterSheet {
  key: string;
  seed: number;
  job: string;
  jobColor: string;
  identity: Identity;
  artworkId: ArtworkId;
  crops: Readonly<Record<Crop, Rect>>;
  /** Resolved gameplay equipment. Flattened sprites do not visually change with equipment. */
  equipment: EquipmentVisuals;
}

/** Per-bone transform in portrait units; pivots are fixed per bone (layout.ts). */
export interface BoneTransform { dx: number; dy: number; rot: number; scale: number }

/** One sampled animation frame. */
export interface Pose {
  bones: Record<BoneName, BoneTransform>;
  /** Overrides the asset expression for this frame (blink, flinch). */
  face?: FaceVariant;
  /** Multiplier per AssetLayer.alphaChannel. */
  alpha: Record<string, number>;
  /** Full-portrait colour flash composited with `source-atop` (damage). */
  tint?: { color: string; alpha: number };
  /** 0..1 grey dimming composited with source-atop, preserving transparent sprite edges. */
  desaturate: number;
}

/** Face layers are generated per variant: an expression, optionally with eyes closed. */
export interface FaceVariant { expression: Expression; blink: boolean }

/** Animation hook: anything that can turn (time, asset state) into a Pose. Swap in a Spine/skeletal driver here. */
export interface AnimationDriver {
  sample(timeMs: number, state: AnimationState): Pose;
  /** True if the pose changes over time (lets the renderer skip static portraits). */
  isAnimated(state: AnimationState): boolean;
}

export interface AnimationState {
  expression: Expression;
  /** Per-character phase so a crew line-up doesn't breathe in sync. */
  phase: number;
  /** Active one-shot clips keyed by name -> start time (ms). */
  oneShots: Map<string, number>;
  reducedMotion: boolean;
  /** Last face variant that drew completely; fallback while a new expression's textures load. */
  lastFace?: FaceVariant;
}

/** Framing: full figure, head-to-chest bust, or a square head shot for small tokens. */
export type Crop = 'full' | 'bust' | 'head';

export interface RenderOptions {
  crop?: Crop;
  /** Animation clock in ms (defaults to performance.now()). */
  time?: number;
  /** Clear the destination rect right before drawing (skipped when nothing can be drawn yet). */
  clear?: boolean;
  /**
   * Per-view animation state. A cached CharacterAsset can be on screen several times at once
   * (e.g. healthy in the roster, knocked out in a boarding party), so each view owns its own
   * expression/clips. Defaults to the asset's built-in state.
   */
  state?: AnimationState;
}
