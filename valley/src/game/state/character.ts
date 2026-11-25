import type { ClassId, Difficulty, EquipSlot, SkillId } from '../types';
import type { ItemInstance } from '../rules/items';
import { starterItem } from '../rules/items';
import { CLASSES } from '../content/classes';
import { BASE, slotsFor } from '../content/items';
import { Rng } from '../../engine/rng';

export const BAG_SIZE = 33;
export const BAR_SIZE = 6;
export const STASH_TAB_SIZE = 50;

export type ZoneRef =
  | { kind: 'overworld' }
  | { kind: 'dungeon'; key: string; name: string; theme: string; level: number; seed: number; x: number; z: number };

export interface Waypoint { x: number; z: number; name: string }

export interface Bounty {
  kind: 'cull' | 'gather' | 'elder' | 'scout' | 'delve';
  have: number; need: number; xp: number; glint: number;
  monster?: string; item?: string; name?: string;
  key?: string; x?: number; z?: number; place?: string;
  giver?: string; town?: string;
}

export interface QuestProgress {
  step: number;
  have: number;
}

export interface Journey {
  found: Record<string, 1>;
  known: Record<string, [number, number, string]>;
  ways: Waypoint[];
  waystone: Waypoint;
  lands: Record<string, 1>;
  boon: { id: string; left: number } | null;
  satchel: { x: number; z: number; n: number } | null;
  guide?: 'done';
  tips: Record<string, 1>;
  bounty: Bounty | null;
  bountiesDone: number;
  dungeons: Record<string, { cleared: number }>;
}

export interface Character {
  version: 2;
  id: string;
  name: string;
  classId: ClassId;
  created: number;
  played: number;
  level: number;
  xp: number;
  gold: number;
  tree: Record<string, number>;
  bonusPoints: number;
  bar: (SkillId | null)[];
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  bag: (ItemInstance | null)[];
  materials: Record<string, number>;
  potions: number;
  potionTier: number;
  difficulty: Difficulty;
  journey: Journey;
  quests: Record<string, QuestProgress>;
  zone: ZoneRef;
  pos: { x: number; z: number };
  hour: number;
  view: [number, number] | null;
  hp: number;
  resource: number;
  look?: { tunic: number; hair: number };
  tally: { kills: number; deaths: number; elites: number; bosses: number; dungeons: number; legendaries: number };
}

export const HOME: Waypoint = { x: 0, z: 0, name: 'Hearthmere' };

export function newJourney(): Journey {
  return {
    found: {}, known: {}, ways: [{ ...HOME }], waystone: { ...HOME }, lands: {}, boon: null, satchel: null,
    tips: {}, bounty: null, bountiesDone: 0, dungeons: {},
  };
}

export function newCharacter(classId: ClassId, name: string, seed = Date.now()): Character {
  const cls = CLASSES[classId];
  const rng = new Rng(seed);
  const tree: Record<string, number> = {};
  for (const id of cls.start) tree[id] = 1;
  const equipment: Character['equipment'] = {};
  for (const id of cls.gear) {
    const slot: EquipSlot = slotsFor(BASE[id])[0];
    equipment[slot] = starterItem(rng, id, classId);
  }
  const bar: (SkillId | null)[] = new Array(BAR_SIZE).fill(null);
  cls.start.forEach((id, i) => (bar[i] = id));
  return {
    version: 2,
    id: rng.uid('c'),
    name: name.trim() || cls.name,
    classId,
    created: Date.now(),
    played: 0,
    level: 1, xp: 0, gold: 20,
    tree, bonusPoints: 0,
    bar,
    equipment,
    bag: new Array(BAG_SIZE).fill(null),
    materials: {},
    potions: 4, potionTier: 0,
    difficulty: 'normal',
    journey: newJourney(),
    quests: {},
    zone: { kind: 'overworld' },
    pos: { x: 3.5, z: 6.5 },
    hour: 9.5,
    view: null,
    hp: 1e9, resource: cls.resource.startFull ? 1e9 : 0,
    tally: { kills: 0, deaths: 0, elites: 0, bosses: 0, dungeons: 0, legendaries: 0 },
  };
}
