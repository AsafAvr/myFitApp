import type { Attr, ClassId, Element, Pencils, SkillCategory, SkillId, SkillTag, StatusId } from '../types';
import type { Effect, Power } from './effects';

export type BehaviorId =
  | 'melee' | 'projectile' | 'nova' | 'blast' | 'zone' | 'dash' | 'leap'
  | 'buff' | 'heal' | 'barrier' | 'chain' | 'trap' | 'mark';

export type SkillParams = Record<string, number>;

export interface Upgrade extends Power { name: string }

export interface SkillDef {
  id: SkillId;
  name: string;
  category: SkillCategory;
  tags: SkillTag[];
  element: Element;
  icon: string;
  behavior: BehaviorId;
  anim: 'swing' | 'cast' | 'lunge' | 'shoot';
  targeting: 'enemy' | 'ground' | 'direction' | 'self';
  range: number;
  params: SkillParams;
  status?: StatusId;
  desc: string;
  enhance: Power;
  upgrades: [Upgrade, Upgrade];
}

export interface PassiveDef {
  id: string;
  name: string;
  cluster: SkillCategory;
  max: number;
  effects: Effect[];
  desc: string;
  icon: string;
}

export interface KeyPassiveDef {
  id: string;
  name: string;
  effects: Effect[];
  desc: string;
  icon: string;
}

export interface ResourceDef {
  name: string;
  max: number;
  regen: number;
  startFull: boolean;
  onHurt?: number;
  decay?: [after: number, perSecond: number];
  color: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  about: string;
  primary: Attr;
  resource: ResourceDef;
  weapons: string[];
  offhands: string[];
  kit: number;
  pencils: Pencils;
  start: SkillId[];
  gear: string[];
  skills: SkillDef[];
  passives: PassiveDef[];
  keys: KeyPassiveDef[];
}

export type ClusterId = SkillCategory | 'key';

export const CLUSTERS: { id: ClusterId; name: string; req: number }[] = [
  { id: 'basic', name: 'Basic', req: 0 },
  { id: 'core', name: 'Core', req: 1 },
  { id: 'defensive', name: 'Defensive', req: 4 },
  { id: 'mobility', name: 'Mobility', req: 7 },
  { id: 'mastery', name: 'Mastery', req: 11 },
  { id: 'ultimate', name: 'Ultimate', req: 16 },
  { id: 'key', name: 'Key Passive', req: 22 },
];

export const SKILL_MAX_RANK = 5;
export const PASSIVE_RANK_STEP = 0.1;
export const START_POINTS = 2;
