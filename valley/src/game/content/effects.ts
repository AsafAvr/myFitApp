import type { Element, SkillCategory, SkillId, SkillTag, StatusId } from '../types';
import type { StatId } from '../rules/stats';

export type TriggerOn = 'cast' | 'hit' | 'crit' | 'kill' | 'hurt';

export type TriggerAction =
  | { do: 'status'; status: StatusId; duration: number; potency?: number; stacks?: number; to: 'self' | 'target' }
  | { do: 'resource'; amount: number }
  | { do: 'heal'; pct: number }
  | { do: 'refund' }
  | { do: 'explode'; radius: number; coef: number; element: Element }
  | { do: 'cooldowns'; seconds: number }
  | { do: 'barrier'; pct: number; duration: number };

export type When = 'resourceHigh' | 'resourceLow' | 'healthy' | 'injured' | 'barrier';

export type Effect =
  | { kind: 'stat'; stat: StatId; value: number; more?: boolean; when?: When }
  | { kind: 'param'; skill?: SkillId; tag?: SkillTag; key: string; op: 'add' | 'mul' | 'set'; value: number }
  | { kind: 'ranks'; skill?: SkillId; category?: SkillCategory; value: number }
  | { kind: 'onHit'; skill?: SkillId; tag?: SkillTag; status: StatusId; chance?: number; duration: number; potency?: number; stacks?: number }
  | { kind: 'trigger'; on: TriggerOn; skill?: SkillId; tag?: SkillTag; chance?: number; icd?: number; when?: When; actions: TriggerAction[] };

export interface Power {
  desc: string;
  effects: Effect[];
}
