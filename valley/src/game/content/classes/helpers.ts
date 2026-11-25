import type { SkillId, SkillTag, StatusId } from '../../types';
import type { Effect, TriggerAction } from '../effects';
import type { StatId } from '../../rules/stats';

export const param = (skill: SkillId, key: string, op: 'add' | 'mul' | 'set', value: number): Effect =>
  ({ kind: 'param', skill, key, op, value });

export const stat = (s: StatId, value: number, more = false): Effect => ({ kind: 'stat', stat: s, value, more });

export const onCast = (skill: SkillId, ...actions: TriggerAction[]): Effect => ({ kind: 'trigger', on: 'cast', skill, actions });
export const onCastTag = (tag: SkillTag, chance: number, ...actions: TriggerAction[]): Effect => ({ kind: 'trigger', on: 'cast', tag, chance, actions });
export const onHitDo = (skill: SkillId, ...actions: TriggerAction[]): Effect => ({ kind: 'trigger', on: 'hit', skill, actions });
export const onKill = (...actions: TriggerAction[]): Effect => ({ kind: 'trigger', on: 'kill', actions });

export const selfStatus = (status: StatusId, duration: number, potency = 0, stacks = 1): TriggerAction =>
  ({ do: 'status', status, duration, potency, stacks, to: 'self' });
export const heal = (pct: number): TriggerAction => ({ do: 'heal', pct });
export const gain = (amount: number): TriggerAction => ({ do: 'resource', amount });
export const barrier = (pct: number, duration: number): TriggerAction => ({ do: 'barrier', pct, duration });

