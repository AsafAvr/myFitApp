import type { AnyEntity, Element, Fighter, Monster, Npc, Player, SkillId } from './types';
import type { ItemInstance } from './rules/items';
import type { Bounty, ZoneRef } from './state/character';

export interface XYZ { x: number; y: number; z: number }

export interface GameEvents {
  frame: number;
  begin: void;
  'character:loaded': Player;

  step: { entity: AnyEntity; water: boolean };
  moveclick: XYZ;
  dash: XYZ;
  evade: XYZ;
  target: AnyEntity | null;

  swing: { entity: AnyEntity; radius: number; color?: [number, number, number]; heavy?: boolean };
  cast: { id: SkillId; element: Element; behavior: string; category: string; x: number; y: number; z: number };
  skill: { id: SkillId; element: Element; behavior: string; category: string };
  damage: { target: Fighter; amount: number; crit: boolean; source: AnyEntity | null; element: Element; blocked?: boolean; dot?: boolean };
  miss: { target: AnyEntity; text: string };
  'monster:died': Monster;
  'monster:alert': Monster;
  'monster:special': Monster;
  'monster:strike': Monster;
  'monster:shot': Monster;
  'boss:spawn': Monster;
  telegraph: { x: number; y: number; z: number; r?: number; t: number; fill?: boolean; lane?: boolean; dirx?: number; dirz?: number; len?: number; w?: number; color?: [number, number, number] };
  slam: { x: number; y: number; z: number; r: number; heavy?: boolean; color?: [number, number, number] };
  'hazard:cloud': { x: number; y: number; z: number; r: number; life: number; color: [number, number, number] };
  'shot:hit': XYZ;
  'charge:dust': XYZ;
  guard: { entity: Monster; t: number };
  'bolt:hit': XYZ & { element: Element; big?: boolean };
  'blast': XYZ & { r: number; element: Element; heavy?: boolean };
  'chain': { from: XYZ; to: XYZ; element: Element };
  heal: { entity: Fighter; focus?: boolean; amount?: number };
  lowhealth: void;
  deny: void;

  xp: { amount: number };
  levelup: { level: number };
  'player:died': void;
  'player:respawn': { name: string };
  fallen: { lost: number };
  recovered: { n: number };
  drink: { item: string };
  'build:changed': void;

  pickup: XYZ & { item: string; n: number; rare: boolean; name?: string; rarity?: string };
  'inventory:changed': void;
  'equipment:changed': void;
  'tree:changed': void;
  'item:legendary': { item: ItemInstance };
  trade: { sold?: string; total?: number; bought?: string; made?: string; n?: number };

  'site:enter': { name: string; kind: string };
  attune: XYZ & { name: string };
  found: { kind: string; name: string; count: number; shown?: number } & Partial<XYZ>;
  boon: { id: string; name: string; desc: string; entity: Player };
  travel: { name: string };
  'travel:arrive': XYZ & { name: string };
  land: { name: string; count: number; total: number; mark: boolean; all: boolean };
  nightfall: void;
  daybreak: void;
  'zone:enter': { zone: ZoneRef; name: string };
  'dungeon:cleared': { name: string; first: boolean };
  'npc:talk': Npc;
  'interact:prompt': { text: string; key: string } | null;

  'bounty:changed': void;
  'bounty:claimed': Bounty;

  log: { text: string; big?: boolean };
  'ui:toggle': string;
  'ui:click': void;
  guide: { id: string; index?: number; total?: number; tip?: boolean; at?: XYZ | null; entity?: AnyEntity | null } | null;
  'guide:step': { id: string | null };
  'guide:skip': { quiet?: boolean } | void;
  'guide:restart': void;
  'guide:done': { skipped: boolean; quiet: boolean };
  'settings:changed': void;
  'audio:mix': { master: number; music: number; sfx: number; ambience: number; ui: number; mono: boolean; muteHidden: boolean };
}
