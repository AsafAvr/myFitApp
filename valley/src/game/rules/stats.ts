import type { Attr, ClassId, Element, SkillTag } from '../types';
import { ATTRS } from '../types';

export const STAT_IDS = [
  'might', 'grace', 'vigor', 'mind', 'allAttrs',
  'life', 'lifePct', 'lifeRegen', 'lifeOnHit', 'lifeOnKill', 'healing', 'potionHeal', 'potionCharges',
  'armor', 'armorPct', 'resistAll', 'resistFire', 'resistFrost', 'resistStorm', 'resistPoison', 'resistShadow',
  'dodge', 'block', 'damageTaken', 'thorns', 'barrierGen', 'ccDuration',
  'damage', 'dmgPhysical', 'dmgFire', 'dmgFrost', 'dmgStorm', 'dmgPoison', 'dmgShadow',
  'dmgBasic', 'dmgCore', 'dmgDefensive', 'dmgMobility', 'dmgMastery', 'dmgUltimate',
  'dmgMelee', 'dmgRanged', 'dmgArea', 'dmgDot',
  'dmgVsElite', 'dmgVsVulnerable', 'dmgVsCC', 'dmgVsBurning', 'dmgVsChilled', 'dmgVsPoisoned', 'dmgVsBleeding',
  'dmgVsClose', 'dmgVsDistant', 'dmgVsInjured', 'dmgWhileHealthy', 'dmgVsMarked',
  'critChance', 'critDamage', 'attackSpeed', 'moveSpeed', 'cdr',
  'resourceMax', 'resourceRegen', 'resourceGen', 'costReduction', 'resourceOnKill',
  'goldFind', 'magicFind', 'xpPct', 'statusDuration',
] as const;
export type StatId = typeof STAT_IDS[number];

export interface Mod { stat: StatId; value: number; more?: boolean }

export class Totals {
  readonly add = {} as Record<StatId, number>;
  readonly more = {} as Record<StatId, number>;
  constructor() {
    for (const id of STAT_IDS) { this.add[id] = 0; this.more[id] = 1; }
  }
  apply(m: Mod, scale = 1): void {
    if (m.more) this.more[m.stat] *= 1 + m.value * scale;
    else this.add[m.stat] += m.value * scale;
  }
}

export const ATTRIBUTE_INFO: Record<Attr, { name: string; hint: string }> = {
  might: { name: 'Might', hint: 'Armor. Wardens hit harder with it.' },
  grace: { name: 'Grace', hint: 'Dodge and critical strikes. Striders hit harder with it.' },
  vigor: { name: 'Vigor', hint: 'Health and its recovery, for everyone.' },
  mind: { name: 'Mind', hint: 'Resistance to the elements. Emberwrights hit harder with it.' },
};

export function baseAttributes(primary: Attr, level: number): Record<Attr, number> {
  const out = {} as Record<Attr, number>;
  for (const a of ATTRS) out[a] = 7 + (a === primary ? 3 : 0) + (level - 1) * (a === primary ? 2 : 1);
  return out;
}

export const LEVEL_CAP = 50;
export const xpToNext = (level: number): number => Math.round(36 * Math.pow(level, 1.55));
export const xpFactor = (playerLevel: number, monsterLevel: number): number =>
  Math.max(0.1, Math.min(1.2, 1 - (playerLevel - monsterLevel - 2) * 0.2));
export const levelAt = (dist: number): number => 1 + Math.floor(Math.max(0, dist - 60) / 95);

export interface Weapon { min: number; max: number; speed: number }

export interface Derived {
  attrs: Record<Attr, number>;
  maxLife: number;
  lifeRegen: number;
  armor: number;
  resist: Record<Element, number>;
  dodge: number;
  block: number;
  taken: number;
  thorns: number;
  weapon: Weapon;
  critChance: number;
  critMult: number;
  attackSpeed: number;
  moveSpeed: number;
  cdr: number;
  costMul: number;
  genMul: number;
  maxResource: number;
  resourceRegen: number;
  mainMult: number;
  potionHeal: number;
  potionCharges: number;
  goldFind: number;
  magicFind: number;
  xpMul: number;
  lifeOnHit: number;
  lifeOnKill: number;
  resourceOnKill: number;
  statusDuration: number;
  ccTaken: number;
  healing: number;
  barrierGen: number;
}

export interface ClassNumbers { id: ClassId; primary: Attr; resource: { max: number; regen: number } }

const RESIST_STAT: Record<Exclude<Element, 'physical'>, StatId> = {
  fire: 'resistFire', frost: 'resistFrost', storm: 'resistStorm', poison: 'resistPoison', shadow: 'resistShadow',
};
export const RESIST_CAP = 0.7;

export function derive(t: Totals, cls: ClassNumbers, level: number, weapon: Weapon | null): Derived {
  const A = t.add, M = t.more;
  const base = baseAttributes(cls.primary, level);
  const attrs = {} as Record<Attr, number>;
  for (const a of ATTRS) attrs[a] = Math.round((base[a] + A[a] + A.allAttrs) * M[a]);

  const resist = { physical: 0 } as Record<Element, number>;
  for (const e of Object.keys(RESIST_STAT) as Exclude<Element, 'physical'>[]) {
    resist[e] = Math.min(RESIST_CAP, A.resistAll + A[RESIST_STAT[e]] + attrs.mind * 0.0015);
  }
  const w = weapon ?? { min: 2, max: 4, speed: 1.2 };
  return {
    attrs,
    maxLife: Math.round((60 + level * 10 + attrs.vigor * 9 + A.life) * (1 + A.lifePct) * M.life * M.lifePct),
    lifeRegen: (0.5 + attrs.vigor * 0.08 + A.lifeRegen) * M.lifeRegen,
    armor: (A.armor + attrs.might * 0.5 + level) * (1 + A.armorPct) * M.armor,
    resist,
    dodge: Math.min(0.3, attrs.grace * 0.002 + A.dodge),
    block: Math.min(0.5, A.block),
    taken: Math.max(0.2, M.damageTaken * (1 + A.damageTaken)),
    thorns: A.thorns,
    weapon: { min: w.min, max: w.max, speed: w.speed },
    critChance: Math.min(0.75, 0.05 + attrs.grace * 0.0008 + A.critChance),
    critMult: 1.5 + A.critDamage,
    attackSpeed: Math.min(2.5, (1 + A.attackSpeed) * M.attackSpeed),
    moveSpeed: Math.max(0.35, Math.min(1.75, (1 + A.moveSpeed) * M.moveSpeed)),
    cdr: Math.min(0.5, A.cdr),
    costMul: Math.max(0.4, 1 - A.costReduction),
    genMul: (1 + A.resourceGen) * M.resourceGen,
    maxResource: Math.round(cls.resource.max + A.resourceMax),
    resourceRegen: cls.resource.regen * (1 + A.resourceRegen),
    mainMult: 1 + attrs[cls.primary] * 0.01,
    potionHeal: 0.45 * (1 + A.potionHeal),
    potionCharges: 4 + Math.round(A.potionCharges),
    goldFind: 1 + A.goldFind,
    magicFind: 1 + A.magicFind,
    xpMul: 1 + A.xpPct,
    lifeOnHit: A.lifeOnHit,
    lifeOnKill: A.lifeOnKill,
    resourceOnKill: A.resourceOnKill,
    statusDuration: 1 + A.statusDuration,
    ccTaken: Math.max(0.2, 1 + A.ccDuration),
    healing: (1 + A.healing) * M.healing,
    barrierGen: 1 + A.barrierGen,
  };
}

const ELEMENT_STAT: Record<Element, StatId> = {
  physical: 'dmgPhysical', fire: 'dmgFire', frost: 'dmgFrost', storm: 'dmgStorm', poison: 'dmgPoison', shadow: 'dmgShadow',
};
const TAG_STAT: Partial<Record<SkillTag, StatId>> = {
  basic: 'dmgBasic', core: 'dmgCore', defensive: 'dmgDefensive', mobility: 'dmgMobility', mastery: 'dmgMastery', ultimate: 'dmgUltimate',
  melee: 'dmgMelee', ranged: 'dmgRanged', area: 'dmgArea',
};

export interface HitCircumstance {
  vsElite: boolean; vulnerable: boolean; cc: boolean; burning: boolean; chilled: boolean;
  poisoned: boolean; bleeding: boolean; marked: boolean; close: boolean; distant: boolean;
  injured: boolean; healthy: boolean; dot: boolean;
}

export function damageStats(element: Element, tags: readonly SkillTag[], c: HitCircumstance): StatId[] {
  const out: StatId[] = ['damage', ELEMENT_STAT[element]];
  for (const tag of tags) { const s = TAG_STAT[tag]; if (s && !out.includes(s)) out.push(s); }
  if (c.dot) out.push('dmgDot');
  if (c.vsElite) out.push('dmgVsElite');
  if (c.vulnerable) out.push('dmgVsVulnerable');
  if (c.cc) out.push('dmgVsCC');
  if (c.burning) out.push('dmgVsBurning');
  if (c.chilled) out.push('dmgVsChilled');
  if (c.poisoned) out.push('dmgVsPoisoned');
  if (c.bleeding) out.push('dmgVsBleeding');
  if (c.marked) out.push('dmgVsMarked');
  if (c.close) out.push('dmgVsClose');
  if (c.distant) out.push('dmgVsDistant');
  if (c.injured) out.push('dmgVsInjured');
  if (c.healthy) out.push('dmgWhileHealthy');
  return out;
}

export function damageBuckets(t: Totals, stats: StatId[]): { inc: number; more: number } {
  let inc = 0, more = 1;
  for (const s of stats) { inc += t.add[s]; more *= t.more[s]; }
  return { inc, more };
}
