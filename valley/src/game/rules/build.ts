import type { SkillId, SkillTag, StatusId, StatusInstance } from '../types';
import { EQUIP_SLOTS } from '../types';
import type { Character } from '../state/character';
import type { Effect, TriggerAction, TriggerOn, When } from '../content/effects';
import type { ClassDef, SkillDef, SkillParams } from '../content/skills';
import { PASSIVE_RANK_STEP } from '../content/skills';
import { CLASSES } from '../content/classes';
import { STATUSES } from '../content/statuses';
import { BOONS } from '../content/boons';
import { buildTree, rankOf } from './tree';
import { itemEffects, weaponOf } from './items';
import { Totals, derive, type Derived } from './stats';

export interface SkillState { def: SkillDef; rank: number; params: SkillParams }

export interface OnHitRule { skill?: SkillId; tag?: SkillTag; status: StatusId; chance: number; duration: number; potency: number; stacks: number }

export interface TriggerRule {
  id: number;
  on: TriggerOn; skill?: SkillId; tag?: SkillTag; chance: number; icd: number; when?: When;
  actions: TriggerAction[];
}

export interface Build {
  cls: ClassDef;
  totals: Totals;
  derived: Derived;
  skills: Map<SkillId, SkillState>;
  onHit: OnHitRule[];
  triggers: TriggerRule[];
  conds: Set<When>;
  when: Record<When, boolean>;
}

export interface BuildInput {
  char: Character;
  statuses?: readonly StatusInstance[];
  when?: Partial<Record<When, boolean>>;
}

const NO_WHEN: Record<When, boolean> = { resourceHigh: false, resourceLow: false, healthy: true, injured: false, barrier: false };

export function gatherEffects(char: Character, statuses: readonly StatusInstance[] = []): [Effect, number][] {
  const cls = CLASSES[char.classId];
  const tree = buildTree(cls);
  const out: [Effect, number][] = [];
  for (const [id, r] of Object.entries(char.tree)) {
    const node = tree.nodes.get(id);
    if (!node || r <= 0) continue;
    for (const e of node.effects) out.push([e, node.kind === 'passive' && e.kind === 'stat' ? r : 1]);
  }
  for (const slot of EQUIP_SLOTS) {
    const it = char.equipment[slot];
    if (it) for (const e of itemEffects(it)) out.push([e, 1]);
  }
  const boon = char.journey.boon && BOONS[char.journey.boon.id];
  if (boon) for (const e of boon.effects) out.push([e, 1]);
  for (const s of statuses) {
    const def = STATUSES[s.id];
    if (def?.mods) for (const m of def.mods(s.potency, s.stacks)) out.push([{ kind: 'stat', stat: m.stat, value: m.value, more: m.more }, 1]);
  }
  return out;
}

const matches = (def: SkillDef, skill?: SkillId, tag?: SkillTag): boolean =>
  (skill === undefined || skill === def.id) && (tag === undefined || def.tags.includes(tag));

export function compileBuild(input: BuildInput): Build {
  const { char } = input;
  const cls = CLASSES[char.classId];
  const tree = buildTree(cls);
  const when = { ...NO_WHEN, ...input.when };
  const effects = gatherEffects(char, input.statuses);

  const totals = new Totals();
  const conds = new Set<When>();
  const onHit: OnHitRule[] = [];
  const triggers: TriggerRule[] = [];
  const paramFx: Extract<Effect, { kind: 'param' }>[] = [];
  const rankFx: Extract<Effect, { kind: 'ranks' }>[] = [];

  for (const [e, times] of effects) {
    switch (e.kind) {
      case 'stat':
        if (e.when) { conds.add(e.when); if (!when[e.when]) break; }
        totals.apply(e, times);
        break;
      case 'param': paramFx.push(e); break;
      case 'ranks': rankFx.push(e); break;
      case 'onHit':
        onHit.push({ skill: e.skill, tag: e.tag, status: e.status, chance: e.chance ?? 1, duration: e.duration, potency: e.potency ?? 0, stacks: e.stacks ?? 1 });
        break;
      case 'trigger':
        if (e.when) conds.add(e.when);
        triggers.push({ id: triggers.length, on: e.on, skill: e.skill, tag: e.tag, chance: e.chance ?? 1, icd: e.icd ?? 0, when: e.when, actions: e.actions });
        break;
    }
  }

  const derived = derive(totals, cls, char.level, weaponOf(char.equipment.mainhand));

  const skills = new Map<SkillId, SkillState>();
  for (const def of cls.skills) {
    const base = rankOf(char.tree, def.id);
    if (base <= 0 || !tree.nodes.has(def.id)) continue;
    let rank = base;
    for (const r of rankFx) {
      if ((r.skill === undefined || r.skill === def.id) && (r.category === undefined || r.category === def.category)) rank += r.value;
    }
    const params: SkillParams = { ...def.params };
    for (const op of ['set', 'add', 'mul'] as const) {
      for (const p of paramFx) {
        if (p.op !== op || !matches(def, p.skill, p.tag)) continue;
        const cur = params[p.key] ?? (op === 'mul' ? 1 : 0);
        params[p.key] = op === 'set' ? p.value : op === 'add' ? cur + p.value : cur * p.value;
      }
    }
    const grow = 1 + PASSIVE_RANK_STEP * (rank - 1);
    for (const k of Object.keys(params)) if (k.startsWith('coef') || k === 'zoneCoef' || k === 'explodeCoef') params[k] *= grow;
    if (params.cooldown) params.cooldown = Math.max(0.5, params.cooldown * (1 - derived.cdr));
    if (params.cost) params.cost = Math.round(params.cost * derived.costMul);
    skills.set(def.id, { def, rank, params });
  }

  return { cls, totals, derived, skills, onHit, triggers, conds, when };
}

export function condsChanged(b: Build, now: Record<When, boolean>): boolean {
  for (const c of b.conds) if (b.when[c] !== now[c]) return true;
  return false;
}
