import type { Element, SkillTag, StatusInstance } from '../types';
import type { Rng } from '../../engine/rng';
import { VULNERABLE_MORE } from '../content/statuses';
import { damageBuckets, damageStats, type HitCircumstance, type Totals } from './stats';

export interface AttackerView {
  level: number;
  totals: Totals | null;
  mainMult: number;
  critChance: number;
  critMult: number;
  hpFrac: number;
  isPlayer: boolean;
}

export interface DefenderView {
  level: number;
  armor: number;
  resist: Partial<Record<Element, number>>;
  taken: number;
  dodge: number;
  block: number;
  statuses: readonly StatusInstance[];
  hpFrac: number;
  elite: boolean;
  isPlayer: boolean;
  distance: number;
}

export interface HitSpec {
  base: number;
  element: Element;
  tags: readonly SkillTag[];
  canCrit: boolean;
  critBonus?: number;
  more?: number;
  dot?: boolean;
}

export interface HitResult { amount: number; crit: boolean; dodged: boolean; blocked: boolean; element: Element }

export const ARMOR_CAP = 0.8;
export const BLOCK_KEEP = 0.6;
export const CLOSE = 3.5, DISTANT = 6;

const has = (list: readonly StatusInstance[], id: string) => list.some((s) => s.id === id);

export function circumstance(att: AttackerView, def: DefenderView, dot = false): HitCircumstance {
  const s = def.statuses;
  return {
    vsElite: def.elite,
    vulnerable: has(s, 'vulnerable'),
    cc: has(s, 'stun') || has(s, 'freeze'),
    burning: has(s, 'burn'),
    chilled: has(s, 'chill') || has(s, 'freeze'),
    poisoned: has(s, 'poison'),
    bleeding: has(s, 'bleed'),
    marked: has(s, 'marked'),
    close: def.distance <= CLOSE,
    distant: def.distance >= DISTANT,
    injured: def.hpFrac < 0.35,
    healthy: att.hpFrac > 0.8,
    dot,
  };
}

export const armorMitigation = (armor: number, attackerLevel: number): number =>
  Math.min(ARMOR_CAP, Math.max(0, armor / (armor + 40 + 9 * attackerLevel)));

export function resolveHit(att: AttackerView, def: DefenderView, spec: HitSpec, rng: Rng): HitResult {
  const element = spec.element;
  const c = circumstance(att, def, !!spec.dot);
  if (def.isPlayer && !spec.dot && def.dodge > 0 && rng.chance(def.dodge)) {
    return { amount: 0, crit: false, dodged: true, blocked: false, element };
  }
  let dmg = spec.base * att.mainMult * (1 + (spec.more ?? 0));
  if (att.totals) {
    const { inc, more } = damageBuckets(att.totals, damageStats(element, spec.tags, c));
    dmg *= (1 + inc) * more;
  }
  if (c.vulnerable) dmg *= 1 + VULNERABLE_MORE;
  if (att.isPlayer && c.marked) {
    const mark = def.statuses.find((s) => s.id === 'marked');
    dmg *= 1 + (mark?.potency ?? 0.3);
  }
  const crit = !spec.dot && spec.canCrit && rng.chance(att.critChance + (spec.critBonus ?? 0));
  if (crit) dmg *= att.critMult;
  const mit = element === 'physical' ? armorMitigation(def.armor, att.level) : Math.min(0.7, def.resist[element] ?? 0);
  dmg *= (1 - mit) * def.taken;
  const blocked = !spec.dot && def.block > 0 && rng.chance(def.block);
  if (blocked) dmg *= BLOCK_KEEP;
  return { amount: Math.max(1, Math.round(dmg)), crit, dodged: false, blocked, element };
}
