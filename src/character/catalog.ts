import type { AccessoryId, ArmorClass, HelmetId, OutfitId, WeaponId } from './types';

/** Gameplay kit metadata; the fixed illustrations do not change with these values. */
export const OUTFITS: Readonly<Record<OutfitId, { armor: ArmorClass; label: string }>> = {
  flightSuit: { armor: 'light', label: 'Star Trader Flight Suit' },
  traderJacket: { armor: 'light', label: 'Star Trader Jacket' },
  tacticalUniform: { armor: 'light', label: 'Alien Specced (Xeno Tailored)' },
  enforcerCoat: { armor: 'medium', label: 'Syndicate Enforcer' },
  lightArmor: { armor: 'medium', label: 'Light Armor' },
  armorSuit: { armor: 'heavy', label: 'APL-R9 Armor Suite' },
  harness: { armor: 'light', label: 'Gear Harness' },
};
export const DEFAULT_OUTFIT: Readonly<Record<ArmorClass, OutfitId>> = { light: 'flightSuit', medium: 'lightArmor', heavy: 'armorSuit' };

export interface JobKit {
  outfit: OutfitId;
  weapon: WeaponId;
  helmet: HelmetId;
  accessories: readonly AccessoryId[];
}

export const JOB_KITS: Readonly<Record<string, JobKit>> = {
  Captain: { outfit: 'enforcerCoat', weapon: 'pistol', helmet: 'none', accessories: ['belt', 'holster', 'gloves'] },
  Pilot: { outfit: 'flightSuit', weapon: 'pistol', helmet: 'headset', accessories: ['belt', 'holster'] },
  Gunner: { outfit: 'lightArmor', weapon: 'carbine', helmet: 'none', accessories: ['belt', 'gloves', 'pauldrons'] },
  Engineer: { outfit: 'traderJacket', weapon: 'arcWrench', helmet: 'goggles', accessories: ['belt', 'toolPouch', 'gloves'] },
  Medic: { outfit: 'tacticalUniform', weapon: 'medInjector', helmet: 'none', accessories: ['belt', 'medPouch'] },
  Marine: { outfit: 'armorSuit', weapon: 'shotgun', helmet: 'none', accessories: ['chestRig', 'gloves', 'backpack', 'belt'] },
  Tactician: { outfit: 'tacticalUniform', weapon: 'datapad', helmet: 'visor', accessories: ['belt'] },
  Scout: { outfit: 'traderJacket', weapon: 'longRifle', helmet: 'beanie', accessories: ['backpack', 'belt', 'gloves'] },
};
export const FALLBACK_KIT: JobKit = { outfit: 'flightSuit', weapon: 'none', helmet: 'none', accessories: ['belt'] };
export const FALLBACK_JOB_COLOR = '#ffb547';
