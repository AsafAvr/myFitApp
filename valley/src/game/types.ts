import type { Character } from './state/character';
import type { Build } from './rules/build';
import type { ItemInstance } from './rules/items';

export type Vec3 = [number, number, number];
export type Pencils = [Vec3, Vec3, Vec3];

export type ClassId = 'warden' | 'emberwright' | 'strider';
export const ATTRS = ['might', 'grace', 'vigor', 'mind'] as const;
export type Attr = typeof ATTRS[number];
export const ELEMENTS = ['physical', 'fire', 'frost', 'storm', 'poison', 'shadow'] as const;
export type Element = typeof ELEMENTS[number];

export const RARITIES = ['common', 'magic', 'rare', 'legendary', 'unique'] as const;
export type Rarity = typeof RARITIES[number];

export const EQUIP_SLOTS = ['helm', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2', 'mainhand', 'offhand'] as const;
export type EquipSlot = typeof EQUIP_SLOTS[number];

export const SKILL_CATEGORIES = ['basic', 'core', 'defensive', 'mobility', 'mastery', 'ultimate'] as const;
export type SkillCategory = typeof SKILL_CATEGORIES[number];
export type SkillTag = SkillCategory | 'melee' | 'ranged' | 'projectile' | 'area' | 'movement' | 'shout' | 'trap' | 'buff' | 'heal' | Element;
export type SkillId = string;

export type Difficulty = 'story' | 'normal' | 'veteran' | 'nightmare';
export type MonsterRank = 'normal' | 'elite' | 'boss';
export type NpcRole = 'smith' | 'alchemist' | 'warden' | 'stash' | 'tinker' | 'sage' | 'keeper';

export type StatusId =
  | 'burn' | 'bleed' | 'poison' | 'chill' | 'freeze' | 'stun' | 'slow' | 'vulnerable' | 'marked'
  | 'rally' | 'haste' | 'unstoppable' | 'thorns' | 'brand' | 'laststand' | 'bloodrage'
  | 'overflow' | 'ambush' | 'poised' | 'mending' | 'warded' | 'hawkeye';

export type EntityKind = 'player' | 'monster' | 'npc' | 'drop' | 'missile';

export interface EntityBase {
  id: number;
  kind: EntityKind;
  archetype: string;
  x: number; y: number; z: number; yaw: number;
  scale: number; grow: number;
  radius: number; height: number;
  move: number; walk: number;
  action: number; actionT: number; actionDur: number;
  flash: number; shade: number; seed: number;
  colors: Pencils; extra: number; lift: number;
  ghost: boolean; hover: boolean; dead: boolean; gone: boolean;
  name: string; level: number;
  pose?: [number, number, number, number];
  marked?: boolean;
  face?: number;
  tint?: Vec3 | null;
}

export interface StatusInstance {
  id: StatusId;
  left: number;
  dur: number;
  potency: number;
  stacks: number;
  tick: number;
  src?: number;
}

export interface Actor extends EntityBase {
  hp: number; maxHp: number;
  statuses: StatusInstance[];
  barrier: number;
  invuln: number;
}

export interface Dash {
  x: number; z: number;
  speed: number; t: number;
  skill?: SkillId;
  hit?: Set<number>;
  coef?: number; width?: number;
  leap?: boolean; total?: number;
}

export interface ActiveCast {
  skill: SkillId;
  t: number;
  dur: number;
  hitAt: number;
  fire: (() => void) | null;
}

export interface Player extends Actor {
  kind: 'player';
  char: Character;
  build: Build;
  resource: number;
  intent: { moveX: number; moveZ: number };
  target: AnyEntity | null;
  pursue: boolean;
  moveTo: { x: number; z: number } | null;
  queued: { slot: number } | null;
  cast: ActiveCast | null;
  cooldowns: Record<SkillId, number>;
  dash: Dash | null;
  calm: number;
  potionCd: number;
  evadeCd: number;
  safe: boolean;
  respawn: number;
  dirty: boolean;
  standStill: boolean;
}

export interface AIState {
  state: 'idle' | 'chase' | 'attack' | 'special' | 'home';
  hx: number; hz: number;
  gx: number; gz: number; going: boolean;
  timer: number; cd: number; scd?: number;
  target: Player | null; provoked: boolean;
  pushX: number; pushZ: number;
  struck: boolean;
  stun: number;
  sp?: unknown;
  affixT?: number;
  phase?: number;
}

export interface Monster extends Actor {
  kind: 'monster';
  def: import('./content/monsters').MonsterDef;
  defId: string;
  rank: MonsterRank;
  elite: boolean;
  affixes: string[];
  atk: number; xp: number; armor: number; dr: number;
  ai: AIState;
  deathT: number;
  guard?: boolean;
  practice?: boolean;
  resident?: boolean;
  boss?: boolean;
  calmT?: number;
}

export interface Npc extends EntityBase {
  kind: 'npc';
  role: NpcRole;
  npcId: string;
  siteKey: string;
  title: string;
  habit?: string;
}

export type LootPayload =
  | { type: 'gold'; n: number }
  | { type: 'item'; item: ItemInstance }
  | { type: 'material'; id: string; n: number }
  | { type: 'potion'; n: number };

export interface Drop extends EntityBase {
  kind: 'drop';
  loot: LootPayload;
  rarity: Rarity | null;
  age: number;
  tx: number; tz: number;
  keep?: boolean;
  satchel?: boolean;
  warned?: boolean;
}

export interface Missile extends EntityBase { kind: 'missile' }

export type AnyEntity = Player | Monster | Npc | Drop | Missile;
export type Fighter = Player | Monster;
