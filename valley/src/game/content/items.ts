import type { ClassId, EquipSlot, Rarity, SkillCategory } from '../types';
import type { StatId } from '../rules/stats';
import type { Effect } from './effects';
import { param, onCast, selfStatus, stat } from './classes/helpers';

export type ItemKind = 'weapon' | 'offhand' | 'armor' | 'jewelry';
export type BaseSlot = 'helm' | 'chest' | 'gloves' | 'legs' | 'boots' | 'amulet' | 'ring' | 'weapon' | 'offhand';

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  slot: BaseSlot;
  type?: string;
  hands?: 1 | 2;
  dmg?: [number, number];
  speed?: number;
  armor?: number;
  implicit?: { stat: StatId; value: number }[];
  shape: number;
}

export const BASES: ItemBase[] = [
  { id: 'sword', name: 'Sword', kind: 'weapon', slot: 'weapon', type: 'sword', hands: 1, dmg: [10, 14], speed: 1.25, shape: 4 },
  { id: 'axe', name: 'Axe', kind: 'weapon', slot: 'weapon', type: 'axe', hands: 1, dmg: [11, 16], speed: 1.15, shape: 4, implicit: [{ stat: 'critDamage', value: 0.08 }] },
  { id: 'mace', name: 'Mace', kind: 'weapon', slot: 'weapon', type: 'mace', hands: 1, dmg: [12, 17], speed: 1.05, shape: 4, implicit: [{ stat: 'dmgVsCC', value: 0.1 }] },
  { id: 'greatsword', name: 'Greatsword', kind: 'weapon', slot: 'weapon', type: 'greatsword', hands: 2, dmg: [18, 26], speed: 0.95, shape: 4 },
  { id: 'greataxe', name: 'Greataxe', kind: 'weapon', slot: 'weapon', type: 'greataxe', hands: 2, dmg: [20, 28], speed: 0.9, shape: 4, implicit: [{ stat: 'critDamage', value: 0.12 }] },
  { id: 'staff', name: 'Staff', kind: 'weapon', slot: 'weapon', type: 'staff', hands: 2, dmg: [15, 21], speed: 1.0, shape: 5, implicit: [{ stat: 'resourceMax', value: 10 }] },
  { id: 'wand', name: 'Wand', kind: 'weapon', slot: 'weapon', type: 'wand', hands: 1, dmg: [9, 13], speed: 1.3, shape: 5, implicit: [{ stat: 'critChance', value: 0.03 }] },
  { id: 'shortbow', name: 'Bow', kind: 'weapon', slot: 'weapon', type: 'bow', hands: 2, dmg: [13, 19], speed: 1.1, shape: 5 },
  { id: 'dagger', name: 'Dagger', kind: 'weapon', slot: 'weapon', type: 'dagger', hands: 1, dmg: [8, 12], speed: 1.45, shape: 4, implicit: [{ stat: 'critChance', value: 0.04 }] },
  { id: 'shield', name: 'Shield', kind: 'offhand', slot: 'offhand', type: 'shield', armor: 10, shape: 8, implicit: [{ stat: 'block', value: 0.15 }] },
  { id: 'focus', name: 'Focus', kind: 'offhand', slot: 'offhand', type: 'focus', shape: 7, implicit: [{ stat: 'resourceRegen', value: 0.1 }, { stat: 'critChance', value: 0.02 }] },
  { id: 'quiver', name: 'Quiver', kind: 'offhand', slot: 'offhand', type: 'quiver', shape: 6, implicit: [{ stat: 'dmgRanged', value: 0.08 }, { stat: 'attackSpeed', value: 0.03 }] },
  { id: 'hood', name: 'Hood', kind: 'armor', slot: 'helm', armor: 6, shape: 6 },
  { id: 'jerkin', name: 'Jerkin', kind: 'armor', slot: 'chest', armor: 12, shape: 6 },
  { id: 'robe', name: 'Robe', kind: 'armor', slot: 'chest', armor: 9, shape: 6, implicit: [{ stat: 'resistAll', value: 0.03 }] },
  { id: 'gloves', name: 'Gloves', kind: 'armor', slot: 'gloves', armor: 5, shape: 6 },
  { id: 'breeches', name: 'Breeches', kind: 'armor', slot: 'legs', armor: 8, shape: 6 },
  { id: 'boots', name: 'Boots', kind: 'armor', slot: 'boots', armor: 5, shape: 6, implicit: [{ stat: 'moveSpeed', value: 0.04 }] },
  { id: 'amulet', name: 'Amulet', kind: 'jewelry', slot: 'amulet', shape: 7, implicit: [{ stat: 'resistAll', value: 0.04 }] },
  { id: 'ring', name: 'Ring', kind: 'jewelry', slot: 'ring', shape: 7, implicit: [{ stat: 'critChance', value: 0.02 }] },
];
export const BASE: Record<string, ItemBase> = Object.fromEntries(BASES.map((b) => [b.id, b]));

export const TIERS: [minIlvl: number, name: string][] = [[1, 'Rough'], [10, 'Fine'], [22, 'Masterwork'], [36, 'Starforged'], [55, 'Inkbound']];
export const tierName = (ilvl: number): string => {
  let name = TIERS[0][1];
  for (const [min, n] of TIERS) if (ilvl >= min) name = n;
  return name;
};

export function slotsFor(base: ItemBase): EquipSlot[] {
  if (base.slot === 'ring') return ['ring1', 'ring2'];
  if (base.slot === 'weapon') return ['mainhand'];
  return [base.slot];
}

export type AffixScale = 'flat' | 'attr' | 'pct' | 'none';
export type SlotGroup = BaseSlot | 'armor' | 'jewelry' | 'any';

export interface AffixDef {
  id: string;
  stat: StatId | 'ranks';
  range: [number, number];
  scale: AffixScale;
  slots: SlotGroup[];
  weight: number;
  text: string;
  adj: string;
  group?: string;
  minIlvl?: number;
  whole?: boolean;
  classes?: ClassId[];
  category?: SkillCategory;
}

const ARMOR: SlotGroup[] = ['helm', 'chest', 'gloves', 'legs', 'boots'];
const affix = (d: AffixDef) => d;

export const AFFIXES: AffixDef[] = [
  affix({ id: 'might', stat: 'might', range: [3, 6], scale: 'attr', slots: ['any'], weight: 10, text: '+{v} Might', adj: 'Mighty', whole: true }),
  affix({ id: 'grace', stat: 'grace', range: [3, 6], scale: 'attr', slots: ['any'], weight: 10, text: '+{v} Grace', adj: 'Graceful', whole: true }),
  affix({ id: 'vigor', stat: 'vigor', range: [3, 6], scale: 'attr', slots: ['any'], weight: 10, text: '+{v} Vigor', adj: 'Hale', whole: true }),
  affix({ id: 'mind', stat: 'mind', range: [3, 6], scale: 'attr', slots: ['any'], weight: 10, text: '+{v} Mind', adj: 'Thoughtful', whole: true }),
  affix({ id: 'allAttrs', stat: 'allAttrs', range: [2, 3], scale: 'attr', slots: ['amulet'], weight: 3, text: '+{v} to all attributes', adj: 'Gifted', whole: true }),
  affix({ id: 'life', stat: 'life', range: [10, 20], scale: 'flat', slots: ['armor', 'jewelry', 'offhand'], weight: 10, text: '+{v} maximum health', adj: 'Stout', whole: true }),
  affix({ id: 'lifePct', stat: 'lifePct', range: [0.04, 0.08], scale: 'pct', slots: ['helm', 'chest', 'amulet'], weight: 5, text: '+{v} maximum health', adj: 'Hearty' }),
  affix({ id: 'lifeRegen', stat: 'lifeRegen', range: [0.6, 1.2], scale: 'flat', slots: ['armor', 'amulet'], weight: 5, text: '+{v} health per second', adj: 'Mending' }),
  affix({ id: 'lifeOnHit', stat: 'lifeOnHit', range: [1, 3], scale: 'flat', slots: ['weapon', 'gloves', 'ring'], weight: 5, text: '+{v} health per hit', adj: 'Thirsting', whole: true }),
  affix({ id: 'lifeOnKill', stat: 'lifeOnKill', range: [3, 6], scale: 'flat', slots: ['weapon', 'ring'], weight: 4, text: '+{v} health per kill', adj: 'Feasting', whole: true }),
  affix({ id: 'armor', stat: 'armor', range: [6, 12], scale: 'flat', slots: ['armor', 'offhand'], weight: 8, text: '+{v} armor', adj: 'Studded', whole: true }),
  affix({ id: 'armorPct', stat: 'armorPct', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'offhand'], weight: 5, text: '+{v} armor', adj: 'Plated' }),
  affix({ id: 'resistAll', stat: 'resistAll', range: [0.03, 0.06], scale: 'pct', slots: ['jewelry', 'chest', 'helm', 'legs'], weight: 4, text: '+{v} resistance to all elements', adj: 'Warded', group: 'resist' }),
  affix({ id: 'resistFire', stat: 'resistFire', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'jewelry'], weight: 4, text: '+{v} fire resistance', adj: 'Fireproof', group: 'resist' }),
  affix({ id: 'resistFrost', stat: 'resistFrost', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'jewelry'], weight: 4, text: '+{v} frost resistance', adj: 'Fur-lined', group: 'resist' }),
  affix({ id: 'resistStorm', stat: 'resistStorm', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'jewelry'], weight: 4, text: '+{v} storm resistance', adj: 'Grounded', group: 'resist' }),
  affix({ id: 'resistPoison', stat: 'resistPoison', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'jewelry'], weight: 4, text: '+{v} poison resistance', adj: 'Antidotal', group: 'resist' }),
  affix({ id: 'resistShadow', stat: 'resistShadow', range: [0.06, 0.12], scale: 'pct', slots: ['armor', 'jewelry'], weight: 3, text: '+{v} shadow resistance', adj: 'Lantern-lit', group: 'resist' }),
  affix({ id: 'dodge', stat: 'dodge', range: [0.02, 0.04], scale: 'pct', slots: ['boots', 'legs', 'amulet'], weight: 3, text: '+{v} chance to dodge', adj: 'Nimble' }),
  affix({ id: 'block', stat: 'block', range: [0.05, 0.1], scale: 'pct', slots: ['offhand'], weight: 3, text: '+{v} chance to block', adj: 'Bracing', classes: ['warden'] }),
  affix({ id: 'thorns', stat: 'thorns', range: [4, 8], scale: 'flat', slots: ['chest', 'legs', 'offhand'], weight: 3, text: '+{v} thorns', adj: 'Bramble', whole: true }),
  affix({ id: 'damage', stat: 'damage', range: [0.05, 0.1], scale: 'pct', slots: ['weapon', 'amulet', 'ring'], weight: 6, text: '+{v} damage', adj: 'Fierce' }),
  affix({ id: 'dmgPhysical', stat: 'dmgPhysical', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 4, text: '+{v} physical damage', adj: 'Honed', classes: ['warden', 'strider'] }),
  affix({ id: 'dmgFire', stat: 'dmgFire', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 4, text: '+{v} fire damage', adj: 'Smouldering', classes: ['emberwright', 'warden'] }),
  affix({ id: 'dmgFrost', stat: 'dmgFrost', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 4, text: '+{v} frost damage', adj: 'Rimed', classes: ['emberwright'] }),
  affix({ id: 'dmgStorm', stat: 'dmgStorm', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 4, text: '+{v} storm damage', adj: 'Crackling', classes: ['emberwright'] }),
  affix({ id: 'dmgPoison', stat: 'dmgPoison', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 4, text: '+{v} poison damage', adj: 'Venomous', classes: ['strider'] }),
  affix({ id: 'dmgShadow', stat: 'dmgShadow', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'gloves', 'ring'], weight: 3, text: '+{v} shadow damage', adj: 'Dusky', classes: ['strider'] }),
  affix({ id: 'dmgBasic', stat: 'dmgBasic', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'gloves'], weight: 3, text: '+{v} Basic skill damage', adj: 'Practised' }),
  affix({ id: 'dmgCore', stat: 'dmgCore', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'amulet', 'gloves'], weight: 3, text: '+{v} Core skill damage', adj: 'Devoted' }),
  affix({ id: 'dmgMastery', stat: 'dmgMastery', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'amulet', 'helm'], weight: 3, text: '+{v} Mastery skill damage', adj: 'Masterful' }),
  affix({ id: 'dmgDot', stat: 'dmgDot', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'amulet', 'legs'], weight: 3, text: '+{v} damage over time', adj: 'Festering' }),
  affix({ id: 'dmgVsElite', stat: 'dmgVsElite', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'ring'], weight: 4, text: '+{v} damage to elites', adj: 'Elderbane' }),
  affix({ id: 'dmgVsVulnerable', stat: 'dmgVsVulnerable', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'gloves', 'ring'], weight: 3, text: '+{v} damage to Vulnerable enemies', adj: 'Cruel' }),
  affix({ id: 'dmgVsCC', stat: 'dmgVsCC', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'gloves'], weight: 3, text: '+{v} damage to Stunned or Frozen enemies', adj: 'Merciless' }),
  affix({ id: 'dmgVsClose', stat: 'dmgVsClose', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'legs'], weight: 3, text: '+{v} damage to close enemies', adj: 'Brawling' }),
  affix({ id: 'dmgVsDistant', stat: 'dmgVsDistant', range: [0.08, 0.15], scale: 'pct', slots: ['weapon', 'amulet', 'legs'], weight: 3, text: '+{v} damage to distant enemies', adj: 'Far-seeing' }),
  affix({ id: 'dmgVsInjured', stat: 'dmgVsInjured', range: [0.1, 0.18], scale: 'pct', slots: ['weapon', 'ring'], weight: 3, text: '+{v} damage to injured enemies', adj: 'Finishing' }),
  affix({ id: 'critChance', stat: 'critChance', range: [0.02, 0.05], scale: 'pct', slots: ['gloves', 'ring', 'amulet', 'weapon'], weight: 6, text: '+{v} critical strike chance', adj: 'Keen' }),
  affix({ id: 'critDamage', stat: 'critDamage', range: [0.08, 0.18], scale: 'pct', slots: ['weapon', 'gloves', 'ring'], weight: 6, text: '+{v} critical strike damage', adj: 'Vicious' }),
  affix({ id: 'attackSpeed', stat: 'attackSpeed', range: [0.03, 0.07], scale: 'pct', slots: ['gloves', 'ring', 'weapon', 'amulet'], weight: 6, text: '+{v} attack speed', adj: 'Quick' }),
  affix({ id: 'moveSpeed', stat: 'moveSpeed', range: [0.04, 0.09], scale: 'pct', slots: ['boots', 'amulet'], weight: 6, text: '+{v} movement speed', adj: 'Swift' }),
  affix({ id: 'cdr', stat: 'cdr', range: [0.03, 0.06], scale: 'pct', slots: ['helm', 'amulet', 'ring'], weight: 5, text: '{v} shorter cooldowns', adj: 'Ready' }),
  affix({ id: 'costReduction', stat: 'costReduction', range: [0.04, 0.08], scale: 'pct', slots: ['amulet', 'helm', 'offhand'], weight: 4, text: 'Skills cost {v} less', adj: 'Thrifty' }),
  affix({ id: 'resourceGen', stat: 'resourceGen', range: [0.05, 0.1], scale: 'pct', slots: ['ring', 'amulet', 'weapon'], weight: 4, text: '+{v} resource generation', adj: 'Rousing' }),
  affix({ id: 'resourceMax', stat: 'resourceMax', range: [5, 12], scale: 'none', slots: ['helm', 'amulet', 'offhand'], weight: 3, text: '+{v} maximum resource', adj: 'Deep', whole: true }),
  affix({ id: 'resourceOnKill', stat: 'resourceOnKill', range: [2, 4], scale: 'none', slots: ['weapon', 'ring'], weight: 3, text: '+{v} resource per kill', adj: 'Reaping', whole: true }),
  affix({ id: 'potionHeal', stat: 'potionHeal', range: [0.08, 0.15], scale: 'pct', slots: ['chest', 'legs', 'amulet'], weight: 3, text: 'Tonics heal {v} more', adj: 'Brewer’s' }),
  affix({ id: 'potionCharges', stat: 'potionCharges', range: [1, 1], scale: 'none', slots: ['legs'], weight: 1, text: '+{v} tonic carried', adj: 'Pocketed', whole: true, minIlvl: 15 }),
  affix({ id: 'goldFind', stat: 'goldFind', range: [0.1, 0.2], scale: 'pct', slots: ['helm', 'ring', 'amulet'], weight: 3, text: '+{v} glint found', adj: 'Magpie’s' }),
  affix({ id: 'magicFind', stat: 'magicFind', range: [0.08, 0.15], scale: 'pct', slots: ['helm', 'ring', 'amulet'], weight: 3, text: '+{v} chance of finer finds', adj: 'Lucky' }),
  affix({ id: 'xpPct', stat: 'xpPct', range: [0.04, 0.08], scale: 'pct', slots: ['helm', 'amulet'], weight: 2, text: '+{v} experience', adj: 'Studious' }),
  affix({ id: 'statusDuration', stat: 'statusDuration', range: [0.06, 0.12], scale: 'pct', slots: ['weapon', 'gloves', 'amulet'], weight: 2, text: 'Effects you cause last {v} longer', adj: 'Lingering' }),
  affix({ id: 'rank', stat: 'ranks', range: [1, 2], scale: 'none', slots: ['helm', 'amulet', 'gloves', 'weapon'], weight: 5, text: '+{v} to {skill}', adj: 'Learned', whole: true }),
  affix({ id: 'rankCore', stat: 'ranks', range: [1, 1], scale: 'none', slots: ['amulet'], weight: 2, text: '+{v} to Core skills', adj: 'Scholar’s', whole: true, category: 'core', minIlvl: 20 }),
  affix({ id: 'rankBasic', stat: 'ranks', range: [1, 1], scale: 'none', slots: ['amulet', 'gloves'], weight: 2, text: '+{v} to Basic skills', adj: 'Drilled', whole: true, category: 'basic', minIlvl: 10 }),
];
export const AFFIX: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

export function affixValue(a: AffixDef, roll: number, ilvl: number): number {
  const [lo, hi] = a.range;
  let v = lo + (hi - lo) * roll;
  const k = Math.max(0, ilvl - 1);
  if (a.scale === 'flat') v *= 1 + 0.2 * k;
  else if (a.scale === 'attr') v *= 1 + 0.12 * k;
  else if (a.scale === 'pct') v *= 1 + 0.008 * k;
  if (a.whole) v = Math.max(1, Math.round(v));
  return v;
}

export interface AspectDef {
  id: string;
  name: string;
  desc: string;
  range: [number, number];
  format: 'pct' | 'int' | 'sec' | 'num';
  classes?: ClassId[];
  slots: SlotGroup[];
  effects: (v: number) => Effect[];
}

const GEAR: SlotGroup[] = ['any'];
export const ASPECTS: AspectDef[] = [
  { id: 'bulwark', name: 'Bulwark', desc: 'While you hold a barrier, you deal {v} more damage (×).', range: [0.1, 0.2], format: 'pct', slots: ['chest', 'offhand', 'amulet', 'helm'],
    effects: (v) => [{ kind: 'stat', stat: 'damage', value: v, more: true, when: 'barrier' }] },
  { id: 'wayfarer', name: 'Wayfarer’s', desc: '+{v} movement speed.', range: [0.1, 0.18], format: 'pct', slots: ['boots', 'amulet', 'legs'], effects: (v) => [stat('moveSpeed', v)] },
  { id: 'hearthward', name: 'Hearthward', desc: 'A blow that leaves you below 35% health gives a barrier of {v} of your health. Once every 30 seconds.', range: [0.2, 0.35], format: 'pct', slots: ARMOR,
    effects: (v) => [{ kind: 'trigger', on: 'hurt', when: 'injured', icd: 30, actions: [{ do: 'barrier', pct: v, duration: 6 }] }] },
  { id: 'thirsting', name: 'Thirsting', desc: 'Critical strikes mend {v} of your health.', range: [0.01, 0.02], format: 'pct', slots: ['weapon', 'gloves', 'ring'],
    effects: (v) => [{ kind: 'trigger', on: 'crit', icd: 0.3, actions: [{ do: 'heal', pct: v }] }] },
  { id: 'elderbane', name: 'Elderbane', desc: 'You deal {v} more damage (×) to elites.', range: [0.15, 0.3], format: 'pct', slots: ['weapon', 'amulet', 'ring', 'gloves'], effects: (v) => [stat('dmgVsElite', v, true)] },
  { id: 'magpie', name: 'Magpie’s', desc: '+{v} glint found and chance of finer finds.', range: [0.2, 0.4], format: 'pct', slots: ['helm', 'ring', 'amulet'], effects: (v) => [stat('goldFind', v), stat('magicFind', v * 0.6)] },
  { id: 'stormcall', name: 'Stormcaller’s', desc: 'Critical strikes call down lightning on the target for {v} weapon damage.', range: [0.6, 1.2], format: 'pct', slots: ['weapon', 'gloves', 'amulet'],
    effects: (v) => [{ kind: 'trigger', on: 'crit', icd: 0.5, actions: [{ do: 'explode', radius: 1.6, coef: v, element: 'storm' }] }] },
  { id: 'frostbitten', name: 'Frostbitten', desc: 'Your hits Chill enemies by {v}.', range: [0.08, 0.15], format: 'pct', slots: ['weapon', 'gloves', 'ring', 'boots'],
    effects: (v) => [{ kind: 'onHit', status: 'chill', duration: 3, potency: v }] },
  { id: 'kindled', name: 'Kindled', desc: 'Your hits have a 20% chance to set enemies Burning for {v} of the blow over 3 seconds.', range: [0.5, 1.0], format: 'pct', slots: ['weapon', 'gloves', 'ring'],
    effects: (v) => [{ kind: 'onHit', status: 'burn', chance: 0.2, duration: 3, potency: v }] },
  { id: 'twinblade', name: 'Twinblade', classes: ['warden'], desc: 'Cleave strikes a second time, for {v} of the damage.', range: [0.4, 0.7], format: 'pct', slots: ['weapon', 'gloves', 'amulet'],
    effects: (v) => [param('cleave', 'echo', 'set', v)] },
  { id: 'earthwake', name: 'Earthwake', classes: ['warden'], desc: 'Leap leaves burning ground for 3 seconds, dealing {v} weapon damage twice a second.', range: [0.3, 0.6], format: 'pct', slots: ['boots', 'legs', 'weapon'],
    effects: (v) => [param('leap', 'zoneDur', 'set', 3), param('leap', 'zoneCoef', 'set', v), param('leap', 'zoneFire', 'set', 1)] },
  { id: 'unending', name: 'Unending Whirl', classes: ['warden'], desc: 'Whirl spins twice and costs {v} less.', range: [0.1, 0.25], format: 'pct', slots: ['weapon', 'amulet', 'chest'],
    effects: (v) => [param('whirl', 'echo', 'set', 1), param('whirl', 'cost', 'mul', 1 - v)] },
  { id: 'ironbound', name: 'Ironbound', classes: ['warden'], desc: 'Iron Hide’s barrier is {v} stronger, and it Rallies you.', range: [0.2, 0.4], format: 'pct', slots: ARMOR,
    effects: (v) => [param('ironhide', 'pct', 'mul', 1 + v), onCast('ironhide', selfStatus('rally', 5, 0.2))] },
  { id: 'trefoil', name: 'Trefoil', classes: ['emberwright'], desc: 'Ember Bolt throws {v} more motes.', range: [1, 2], format: 'int', slots: ['weapon', 'amulet', 'gloves'],
    effects: (v) => [param('emberbolt', 'count', 'add', Math.round(v))] },
  { id: 'glacier', name: 'Glacier’s Heart', classes: ['emberwright'], desc: 'Ice Lance freezes enemies for {v}.', range: [0.8, 1.5], format: 'sec', slots: ['weapon', 'amulet', 'helm'],
    effects: (v) => [param('icelance', 'freeze', 'set', v)] },
  { id: 'tempest', name: 'Tempest', classes: ['emberwright'], desc: 'Chain Lightning leaps {v} more times.', range: [2, 4], format: 'int', slots: ['weapon', 'gloves', 'ring'],
    effects: (v) => [param('chainlightning', 'jumps', 'add', Math.round(v))] },
  { id: 'inkwell', name: 'Inkwell', classes: ['emberwright'], desc: 'Inkfall drops {v} more blots around the first.', range: [1, 2], format: 'int', slots: ['weapon', 'amulet', 'chest'],
    effects: (v) => [param('inkfall', 'count', 'add', Math.round(v)), param('inkfall', 'scatter', 'set', 2.6)] },
  { id: 'splitting', name: 'Splitting', classes: ['strider'], desc: 'Quick Shot looses {v} more arrows.', range: [1, 2], format: 'int', slots: ['weapon', 'gloves', 'offhand'],
    effects: (v) => [param('quickshot', 'count', 'add', Math.round(v)), param('quickshot', 'spread', 'set', 0.12)] },
  { id: 'hailstorm', name: 'Hailstorm', classes: ['strider'], desc: 'Arrow Fan looses {v} more arrows, and they pass through an enemy.', range: [2, 3], format: 'int', slots: ['weapon', 'offhand', 'amulet'],
    effects: (v) => [param('arrowfan', 'count', 'add', Math.round(v)), param('arrowfan', 'pierce', 'add', 1)] },
  { id: 'nightstep', name: 'Nightstep', classes: ['strider'], desc: 'Tumble gives Haste: {v} faster for 3 seconds.', range: [0.2, 0.4], format: 'pct', slots: ['boots', 'legs', 'chest'],
    effects: (v) => [onCast('tumble', selfStatus('haste', 3, v))] },
  { id: 'viper', name: 'Viper', classes: ['strider'], desc: 'Poison you cause deals {v} more damage (×).', range: [0.2, 0.4], format: 'pct', slots: ['weapon', 'gloves', 'ring'],
    effects: (v) => [stat('dmgPoison', v, true)] },
];
export const ASPECT: Record<string, AspectDef> = Object.fromEntries(ASPECTS.map((a) => [a.id, a]));

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  classes?: ClassId[];
  flavor: string;
  affixes: string[];
  power: AspectDef;
  minIlvl: number;
}

export const UNIQUES: UniqueDef[] = [
  { id: 'hearthkeeper', name: 'Hearthkeeper’s Ward', base: 'shield', classes: ['warden'], minIlvl: 8, affixes: ['might', 'life', 'armorPct'],
    flavor: 'Hung over a door in Hearthmere for a hundred winters.',
    power: { id: 'u_hearthkeeper', name: '', desc: 'Shield Bash strikes twice, and its chance to Stun rises by {v}.', range: [0.15, 0.3], format: 'pct', slots: GEAR,
      effects: (v) => [param('bash', 'hits', 'set', 2), param('bash', 'stunChance', 'add', v)] } },
  { id: 'ashenstaff', name: 'The Ashen Staff', base: 'staff', classes: ['emberwright'], minIlvl: 8, affixes: ['mind', 'dmgFire', 'critChance'],
    flavor: 'It is warm to hold, even in the snow.',
    power: { id: 'u_ashenstaff', name: '', desc: 'Enemies you kill burst into embers for {v} weapon damage.', range: [0.8, 1.4], format: 'pct', slots: GEAR,
      effects: (v) => [{ kind: 'trigger', on: 'kill', actions: [{ do: 'explode', radius: 2.4, coef: v, element: 'fire' }] }] } },
  { id: 'wayboots', name: 'Boots of the Long Road', base: 'boots', minIlvl: 5, affixes: ['vigor', 'moveSpeed', 'dodge'],
    flavor: 'Resoled more times than anyone can count.',
    power: { id: 'u_wayboots', name: '', desc: 'After you Evade, your next attack deals {v} more damage (×).', range: [0.4, 0.7], format: 'pct', slots: GEAR,
      effects: (v) => [onCast('evade', selfStatus('ambush', 3, v, 1))] } },
  { id: 'starglass', name: 'Starglass Ring', base: 'ring', minIlvl: 12, affixes: ['critChance', 'critDamage', 'grace'],
    flavor: 'A sliver of night sky, set in brass.',
    power: { id: 'u_starglass', name: '', desc: 'Critical strikes take {v} off your cooldowns.', range: [0.2, 0.4], format: 'sec', slots: GEAR,
      effects: (v) => [{ kind: 'trigger', on: 'crit', icd: 0.4, actions: [{ do: 'cooldowns', seconds: v }] }] } },
  { id: 'bottomless', name: 'The Bottomless Quiver', base: 'quiver', classes: ['strider'], minIlvl: 10, affixes: ['grace', 'attackSpeed', 'dmgVsDistant'],
    flavor: 'Nobody has ever seen the bottom. Nobody has looked very hard.',
    power: { id: 'u_bottomless', name: '', desc: 'Your arrows and bolts pass through {v} more enemies.', range: [1, 2], format: 'int', slots: GEAR,
      effects: (v) => [{ kind: 'param', tag: 'projectile', key: 'pierce', op: 'add', value: Math.round(v) }] } },
  { id: 'longwalk', name: 'Crown of the Long Walk', base: 'hood', minIlvl: 20, affixes: ['allAttrs', 'xpPct', 'lifePct'],
    flavor: 'Woven from a thread of every country.',
    power: { id: 'u_longwalk', name: '', desc: '+{v} to every skill you know.', range: [1, 1], format: 'int', slots: GEAR,
      effects: (v) => [{ kind: 'ranks', value: Math.round(v) }] } },
];
export const UNIQUE: Record<string, UniqueDef> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

export const RARITY_INFO: Record<Rarity, { name: string; affixes: [number, number]; sell: number }> = {
  common: { name: 'Common', affixes: [0, 0], sell: 1 },
  magic: { name: 'Magic', affixes: [1, 2], sell: 2 },
  rare: { name: 'Rare', affixes: [3, 4], sell: 4 },
  legendary: { name: 'Legendary', affixes: [3, 3], sell: 8 },
  unique: { name: 'Unique', affixes: [3, 3], sell: 10 },
};

export interface MaterialDef { id: string; name: string; desc: string; value: number; color: [number, number, number] }

export const MATERIALS: MaterialDef[] = [
  { id: 'sprout_leaf', name: 'Sprout Leaf', desc: 'Still a little wriggly.', value: 4, color: [116, 168, 90] },
  { id: 'puff_spore', name: 'Puff Spore', desc: 'Do not sneeze near it.', value: 6, color: [224, 92, 70] },
  { id: 'hog_bristle', name: 'Hog Bristle', desc: 'Stiff as a nail.', value: 9, color: [176, 128, 84] },
  { id: 'wisp_ember', name: 'Wisp Ember', desc: 'Cool to the touch.', value: 12, color: [136, 180, 216] },
  { id: 'crag_shard', name: 'Crag Shard', desc: 'Hums when struck.', value: 18, color: [150, 142, 132] },
  { id: 'snap_claw', name: 'Snap Claw', desc: 'Mind your fingers.', value: 8, color: [226, 176, 52] },
  { id: 'scrap', name: 'Iron Scrap', desc: 'What is left of plain and magic gear. The smith wants it.', value: 2, color: [150, 142, 132] },
  { id: 'thread', name: 'Gilded Thread', desc: 'Picked out of rare gear. Used to enchant.', value: 6, color: [226, 176, 52] },
  { id: 'inkstone', name: 'Inkstone', desc: 'A drop of the dark, set hard. Left by legendary gear.', value: 20, color: [74, 77, 94] },
];
export const MATERIAL: Record<string, MaterialDef> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export const RARE_FIRST = ['Bramble', 'Gloom', 'Hearth', 'Ash', 'Thorn', 'Dusk', 'Ember', 'Rime', 'Storm', 'Moss', 'Iron', 'Hollow', 'Wren', 'Briar', 'Ink', 'Lantern', 'Cinder', 'Tallow', 'Raven', 'Fern', 'Quill', 'Saltmarsh', 'Larch', 'Kestrel'];
export const RARE_SECOND: Record<BaseSlot, string[]> = {
  weapon: ['Bite', 'Edge', 'Fang', 'Song', 'Reaver', 'Whisper', 'Brand', 'Spite', 'Thorn'],
  offhand: ['Ward', 'Bulwark', 'Wall', 'Eye', 'Lamp', 'Keeper'],
  helm: ['Crown', 'Cowl', 'Brow', 'Visage', 'Hood'],
  chest: ['Coat', 'Mantle', 'Shell', 'Hide', 'Carapace'],
  gloves: ['Grip', 'Grasp', 'Touch', 'Knuckles', 'Fist'],
  legs: ['Stride', 'Legguards', 'Wraps', 'Greaves'],
  boots: ['Tread', 'Step', 'Road', 'Trail', 'Heels'],
  amulet: ['Charm', 'Locket', 'Heart', 'Token', 'Talisman'],
  ring: ['Loop', 'Band', 'Coil', 'Circle', 'Seal'],
};
