import type { Element, Vec3 } from '../types';

export interface SpecialDef {
  kind: 'leap' | 'charge' | 'cloud' | 'shot' | 'slam' | 'guard';
  every: number; min: number; max: number; windup: number; mult: number;
  element?: Element;
  [k: string]: unknown;
}

export interface MonsterDef {
  id: string;
  name: string;
  archetype: string;
  scale: number; radius: number; height: number;
  hp: number; atk: number; speed: number; range: number;
  attackTime: number; cooldown: number; aggro: number; xp: number; stride: number;
  glow?: boolean;
  keep?: [number, number];
  special: SpecialDef;
  colors: [Vec3, Vec3, Vec3];
  gold: [number, number];
  mats: [string, number, [number, number]][];
  potion: number;
  resist?: Partial<Record<Element, number>>;
}

export const MONSTERS: Record<string, MonsterDef> = {
  sproutling: {
    id: 'sproutling', name: 'Sproutling', archetype: 'sproutling', scale: 1.0, radius: 0.36, height: 0.95,
    hp: 26, atk: 5, speed: 2.5, range: 1.15, attackTime: 0.8, cooldown: 1.7, aggro: 0, xp: 9, stride: 2.0,
    special: { kind: 'leap', every: 5.5, min: 2.2, max: 6.5, windup: 0.6, air: 0.42, r: 1.3, mult: 1.3 },
    colors: [[150, 178, 120], [116, 168, 90], [226, 176, 52]],
    gold: [1, 4], mats: [['sprout_leaf', 0.55, [1, 2]]], potion: 0.05,
  },
  puffcap: {
    id: 'puffcap', name: 'Puffcap', archetype: 'puffcap', scale: 1.05, radius: 0.4, height: 1.05,
    hp: 40, atk: 7, speed: 2.0, range: 1.2, attackTime: 0.9, cooldown: 1.9, aggro: 5.5, xp: 14, stride: 5.5,
    special: { kind: 'cloud', every: 9, min: 0, max: 3.2, windup: 0.75, r: 2.5, life: 4.2, mult: 0.45, tick: 0.55, element: 'poison' },
    colors: [[224, 92, 70], [226, 176, 52], [248, 232, 190]],
    gold: [2, 6], mats: [['puff_spore', 0.5, [1, 2]]], potion: 0.06, resist: { poison: 0.5 },
  },
  bristlehog: {
    id: 'bristlehog', name: 'Bristlehog', archetype: 'bristlehog', scale: 1.1, radius: 0.48, height: 1.0,
    hp: 68, atk: 10, speed: 3.5, range: 1.35, attackTime: 0.7, cooldown: 1.8, aggro: 7.5, xp: 23, stride: 3.1,
    special: { kind: 'charge', every: 7, min: 3.5, max: 10, windup: 0.8, speed: 13, dist: 11, mult: 1.9, winded: 1.4 },
    colors: [[74, 77, 94], [226, 176, 52], [226, 188, 130]],
    gold: [4, 9], mats: [['hog_bristle', 0.5, [1, 2]]], potion: 0.08,
  },
  wisp: {
    id: 'wisp', name: 'Glimmerwisp', archetype: 'wisp', scale: 1.0, radius: 0.36, height: 1.45,
    hp: 32, atk: 9, speed: 3.0, range: 1.5, attackTime: 0.7, cooldown: 1.6, aggro: 7, xp: 18, stride: 1.0, glow: true,
    keep: [4.2, 7],
    special: { kind: 'shot', every: 2.6, min: 2.5, max: 10.5, windup: 0.6, speed: 8.5, r: 0.4, life: 1.7, mult: 1.0, element: 'storm' },
    colors: [[136, 180, 216], [70, 150, 150], [226, 176, 52]],
    gold: [3, 8], mats: [['wisp_ember', 0.5, [1, 1]]], potion: 0.08, resist: { storm: 0.5 },
  },
  cragling: {
    id: 'cragling', name: 'Cragling', archetype: 'cragling', scale: 1.0, radius: 0.55, height: 1.5,
    hp: 125, atk: 15, speed: 1.9, range: 1.5, attackTime: 1.15, cooldown: 2.4, aggro: 6, xp: 40, stride: 5.0,
    special: { kind: 'slam', every: 6.5, min: 0, max: 3.2, windup: 1.1, r: 3.3, mult: 1.7, recover: 1.0 },
    colors: [[150, 142, 132], [226, 176, 52], [84, 108, 156]],
    gold: [8, 16], mats: [['crag_shard', 0.55, [1, 2]]], potion: 0.12, resist: { physical: 0 },
  },
  shellsnap: {
    id: 'shellsnap', name: 'Shellsnap', archetype: 'shellsnap', scale: 1.05, radius: 0.48, height: 0.75,
    hp: 50, atk: 8, speed: 2.9, range: 1.25, attackTime: 0.6, cooldown: 1.5, aggro: 5, xp: 17, stride: 2.2,
    special: { kind: 'guard', every: 8, min: 0, max: 2.4, below: 0.8, hold: 1.5, windup: 0.55, r: 2.3, mult: 1.4 },
    colors: [[188, 84, 60], [226, 176, 52], [226, 188, 130]],
    gold: [3, 7], mats: [['snap_claw', 0.5, [1, 1]]], potion: 0.07, resist: { frost: 0.3 },
  },
};

export interface EliteAffixDef {
  id: string;
  name: string;
  desc: string;
  speedMul?: number;
  cdMul?: number;
  taken?: number;
}

export const ELITE_AFFIXES: Record<string, EliteAffixDef> = {
  swift: { id: 'swift', name: 'Swift', desc: 'Moves and strikes faster.', speedMul: 1.35, cdMul: 0.75 },
  stonehide: { id: 'stonehide', name: 'Stonehide', desc: 'Takes a third less damage and cannot be knocked back.', taken: 0.65 },
  blazing: { id: 'blazing', name: 'Blazing', desc: 'Leaves burning ground behind it.' },
  frostbound: { id: 'frostbound', name: 'Frostbound', desc: 'Its blows Chill.' },
  vampiric: { id: 'vampiric', name: 'Vampiric', desc: 'Heals from the blows it lands.' },
  warded: { id: 'warded', name: 'Warded', desc: 'Shielded by a barrier that returns if left alone.' },
};
export const ELITE_AFFIX_IDS = Object.keys(ELITE_AFFIXES);

export const RANK_SCALE = {
  normal: { hp: 1, atk: 1, xp: 1, size: 1 },
  elite: { hp: 2.8, atk: 1.45, xp: 4, size: 1.45 },
  boss: { hp: 6.5, atk: 1.7, xp: 14, size: 1.9 },
} as const;

export const DIFFICULTY = {
  story: { name: 'Story', hp: 0.6, atk: 0.5, xp: 0.8, find: 0.8, telegraph: 1.35, desc: 'For the tale and the wandering. Creatures are far weaker and warn longer.' },
  normal: { name: 'Normal', hp: 1, atk: 1, xp: 1, find: 1, telegraph: 1, desc: 'The road as it was meant to be walked.' },
  veteran: { name: 'Veteran', hp: 1.6, atk: 1.45, xp: 1.3, find: 1.3, telegraph: 1, desc: 'Tougher creatures, more experience and finer finds.' },
  nightmare: { name: 'Nightmare', hp: 2.8, atk: 2.1, xp: 1.7, find: 1.8, telegraph: 0.9, desc: 'The ink runs deep. Much more of everything, and less warning.' },
} as const;

export function scaleMonster(def: MonsterDef, level: number, rank: keyof typeof RANK_SCALE, diff: keyof typeof DIFFICULTY) {
  const k = level - 1, r = RANK_SCALE[rank], d = DIFFICULTY[diff];
  return {
    maxHp: Math.round(def.hp * (1 + 0.32 * k) * r.hp * d.hp),
    atk: def.atk * (1 + 0.21 * k) * r.atk * d.atk,
    xp: Math.round(def.xp * (1 + 0.38 * k) * r.xp * d.xp),
    armor: level * 1.5,
  };
}
