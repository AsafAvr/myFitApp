import type { ClassId, Rarity, SkillId } from '../types';
import { RARITIES } from '../types';
import type { Rng } from '../../engine/rng';
import type { Effect } from '../content/effects';
import type { ClassDef } from '../content/skills';
import { CLASSES, skillDef } from '../content/classes';
import {
  AFFIX, AFFIXES, ASPECT, ASPECTS, BASE, BASES, RARE_FIRST, RARE_SECOND, RARITY_INFO, UNIQUE, UNIQUES,
  affixValue, tierName, type AffixDef, type AspectDef, type ItemBase, type SlotGroup,
} from '../content/items';
import { LEVEL_CAP, type Weapon } from './stats';

export interface RolledAffix { id: string; roll: number; skill?: SkillId }

export interface ItemInstance {
  uid: string;
  base: string;
  rarity: Rarity;
  ilvl: number;
  name?: string;
  affixes: RolledAffix[];
  aspect?: { id: string; roll: number };
  unique?: string;
  classId?: ClassId;
  junk?: boolean;
  fresh?: boolean;
}

export const RARITY_BONUS: Record<Rarity, number> = { common: 0, magic: 5, rare: 10, legendary: 20, unique: 25 };
export const itemPower = (it: ItemInstance): number => it.ilvl * 10 + RARITY_BONUS[it.rarity];
export const requiredLevel = (it: ItemInstance): number => Math.max(1, Math.min(LEVEL_CAP, it.ilvl - 2));

const growth = (ilvl: number, per: number) => 1 + per * Math.max(0, ilvl - 1);

export function weaponOf(it: ItemInstance | null | undefined): Weapon | null {
  if (!it) return null;
  const b = BASE[it.base];
  if (!b?.dmg) return null;
  const g = growth(it.ilvl, 0.28);
  return { min: Math.round(b.dmg[0] * g), max: Math.round(b.dmg[1] * g), speed: b.speed ?? 1.2 };
}

export function armorOf(it: ItemInstance): number {
  const b = BASE[it.base];
  return b?.armor ? Math.round(b.armor * growth(it.ilvl, 0.22)) : 0;
}

export function aspectValue(a: AspectDef, roll: number, ilvl: number): number {
  const [lo, hi] = a.range;
  const v = lo + (hi - lo) * roll;
  return a.format === 'int' ? Math.round(v) : v * (1 + 0.004 * Math.max(0, ilvl - 1));
}

export function powerOf(it: ItemInstance): { def: AspectDef; value: number } | null {
  if (it.unique) {
    const u = UNIQUE[it.unique];
    return u ? { def: u.power, value: aspectValue(u.power, it.aspect?.roll ?? 0.5, it.ilvl) } : null;
  }
  if (it.aspect) {
    const a = ASPECT[it.aspect.id];
    return a ? { def: a, value: aspectValue(a, it.aspect.roll, it.ilvl) } : null;
  }
  return null;
}

export function itemEffects(it: ItemInstance): Effect[] {
  const out: Effect[] = [];
  const b = BASE[it.base];
  if (!b) return out;
  for (const imp of b.implicit ?? []) out.push({ kind: 'stat', stat: imp.stat, value: imp.value });
  const armor = armorOf(it);
  if (armor) out.push({ kind: 'stat', stat: 'armor', value: armor });
  for (const r of it.affixes) {
    const a = AFFIX[r.id];
    if (!a) continue;
    const v = affixValue(a, r.roll, it.ilvl);
    if (a.stat === 'ranks') out.push({ kind: 'ranks', value: v, skill: r.skill, category: a.category });
    else out.push({ kind: 'stat', stat: a.stat, value: v });
  }
  const p = powerOf(it);
  if (p) out.push(...p.def.effects(p.value));
  return out;
}

const pctText = (v: number) => `${+(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
export function formatValue(v: number, format: 'pct' | 'int' | 'sec' | 'num' | 'whole'): string {
  if (format === 'pct') return pctText(v);
  if (format === 'int' || format === 'whole') return String(Math.round(v));
  if (format === 'sec') return `${+v.toFixed(1)} seconds`;
  return String(+v.toFixed(1));
}

export interface AffixLine { text: string; range?: string; implicit?: boolean; greater?: boolean }

export function affixText(a: AffixDef, v: number, skill?: SkillId): string {
  const shown = a.whole || a.scale === 'flat' || a.scale === 'attr' ? String(Math.round(v)) : a.stat === 'lifeRegen' ? v.toFixed(1) : pctText(v);
  return a.text.replace('{v}', shown).replace('{skill}', skill ? (skillDef(skill)?.name ?? skill) : 'a skill');
}

export function affixLines(it: ItemInstance): AffixLine[] {
  const b = BASE[it.base];
  const out: AffixLine[] = [];
  for (const imp of b?.implicit ?? []) {
    const a = AFFIXES.find((x) => x.stat === imp.stat);
    out.push({ text: a ? affixText(a, imp.value) : `${imp.stat} ${imp.value}`, implicit: true });
  }
  for (const r of it.affixes) {
    const a = AFFIX[r.id];
    if (!a) continue;
    const v = affixValue(a, r.roll, it.ilvl);
    const lo = affixValue(a, 0, it.ilvl), hi = affixValue(a, 1, it.ilvl);
    const fmt = (x: number) => (a.whole || a.scale === 'flat' || a.scale === 'attr' ? String(Math.round(x)) : pctText(x));
    out.push({ text: affixText(a, v, r.skill), range: lo !== hi ? `${fmt(lo)}–${fmt(hi)}` : undefined, greater: r.roll >= 0.9 });
  }
  return out;
}

export function powerText(it: ItemInstance): string | null {
  const p = powerOf(it);
  return p ? p.def.desc.replace('{v}', formatValue(p.value, p.def.format)) : null;
}

export function typeLine(it: ItemInstance): string {
  const b = BASE[it.base];
  return `${tierName(it.ilvl)} ${b?.name ?? it.base}`;
}

export function displayName(it: ItemInstance): string {
  if (it.name) return it.name;
  const b = BASE[it.base];
  if (it.rarity === 'magic' && it.affixes.length) return `${AFFIX[it.affixes[0].id]?.adj ?? ''} ${typeLine(it)}`.trim();
  if (it.rarity === 'legendary' && it.aspect) return `${ASPECT[it.aspect.id]?.name ?? ''} ${b?.name ?? ''}`.trim();
  return typeLine(it);
}

export function sellValue(it: ItemInstance): number {
  return Math.round((4 + it.ilvl * 2.2) * RARITY_INFO[it.rarity].sell);
}

export function salvageYield(it: ItemInstance): { id: string; n: number }[] {
  const n = 1 + Math.floor(it.ilvl / 15);
  switch (it.rarity) {
    case 'common': return [{ id: 'scrap', n }];
    case 'magic': return [{ id: 'scrap', n: n + 1 }];
    case 'rare': return [{ id: 'scrap', n: n + 1 }, { id: 'thread', n }];
    default: return [{ id: 'thread', n: n + 1 }, { id: 'inkstone', n: 1 }];
  }
}

export function canEquip(cls: ClassDef, it: ItemInstance, level: number): { ok: boolean; reason?: string } {
  const b = BASE[it.base];
  if (!b) return { ok: false, reason: 'Unknown item.' };
  if (b.kind === 'weapon' && !cls.weapons.includes(b.type!)) return { ok: false, reason: `A ${cls.name} cannot wield a ${b.name.toLowerCase()}.` };
  if (b.kind === 'offhand' && !cls.offhands.includes(b.type!)) return { ok: false, reason: `A ${cls.name} cannot use a ${b.name.toLowerCase()}.` };
  const req = requiredLevel(it);
  if (level < req) return { ok: false, reason: `Requires level ${req}.` };
  return { ok: true };
}

export const usableBy = (cls: ClassDef, b: ItemBase): boolean =>
  b.kind === 'weapon' ? cls.weapons.includes(b.type!) : b.kind === 'offhand' ? cls.offhands.includes(b.type!) : true;

const fits = (groups: SlotGroup[], b: ItemBase): boolean => groups.some((g) =>
  g === 'any' || g === b.slot || (g === 'armor' && b.kind === 'armor') || (g === 'jewelry' && b.kind === 'jewelry') || (g === 'offhand' && b.kind === 'offhand'));

export interface RarityOdds { magicFind: number; rank: 'normal' | 'elite' | 'boss' | 'chest'; ilvl: number }

export function rollRarity(rng: Rng, o: RarityOdds): Rarity {
  const lift = o.magicFind * (o.rank === 'boss' ? 3 : o.rank === 'elite' ? 1.8 : o.rank === 'chest' ? 2 : 1);
  const w: [Rarity, number][] = [
    ['common', o.rank === 'normal' ? 50 : 18],
    ['magic', 34],
    ['rare', 13 * lift],
    ['legendary', (o.ilvl >= 5 ? 2.2 : 0.8) * lift],
    ['unique', o.ilvl >= 5 ? 0.35 * lift : 0],
  ];
  return rng.weighted(w);
}

export interface RollOptions {
  ilvl: number;
  rarity?: Rarity;
  base?: string;
  classId?: ClassId;
  unique?: string;
}

export function generateItem(rng: Rng, o: RollOptions): ItemInstance {
  const ilvl = Math.max(1, Math.round(o.ilvl));
  const cls = o.classId ? CLASSES[o.classId] : null;

  let rarity: Rarity = o.rarity ?? 'magic';
  if (rarity === 'unique' || o.unique) {
    const pool = UNIQUES.filter((u) => (o.unique ? u.id === o.unique : u.minIlvl <= ilvl && (!cls || !u.classes || u.classes.includes(cls.id))));
    const u = pool.length ? rng.pick(pool) : null;
    if (u) {
      return {
        uid: rng.uid('i'), base: u.base, rarity: 'unique', ilvl, name: u.name, unique: u.id, classId: cls?.id,
        affixes: u.affixes.map((id) => ({ id, roll: rng.range(0.25, 1) })), aspect: { id: u.power.id, roll: rng.next() }, fresh: true,
      };
    }
    rarity = 'legendary';
  }

  let base: ItemBase;
  if (o.base && BASE[o.base]) base = BASE[o.base];
  else {
    const usable = cls ? BASES.filter((b) => usableBy(cls, b)) : BASES;
    const pool = cls && rng.chance(0.75) ? usable : BASES;
    base = rng.weighted(pool.map((b) => [b, b.kind === 'weapon' ? 0.7 : b.kind === 'offhand' ? 0.6 : 1] as const));
  }

  const item: ItemInstance = { uid: rng.uid('i'), base: base.id, rarity, ilvl, affixes: [], classId: cls?.id, fresh: true };

  const [lo, hi] = RARITY_INFO[rarity].affixes;
  const count = rarity === 'rare' && ilvl >= 30 ? 4 : rng.int(lo, hi);
  const taken = new Set<string>(), groups = new Set<string>();
  for (let i = 0; i < count; i++) {
    const pool = AFFIXES.filter((a) => !taken.has(a.id) && (!a.group || !groups.has(a.group)) && fits(a.slots, base)
      && (a.minIlvl ?? 0) <= ilvl && (!a.classes || !cls || a.classes.includes(cls.id)) && (a.id !== 'rank' || !!cls));
    if (!pool.length) break;
    const a = rng.weighted(pool.map((x) => [x, x.weight] as const));
    taken.add(a.id);
    if (a.group) groups.add(a.group);
    const rolled: RolledAffix = { id: a.id, roll: rng.next() };
    if (a.id === 'rank' && cls) rolled.skill = rng.pick(cls.skills.filter((s) => s.category !== 'ultimate')).id;
    item.affixes.push(rolled);
  }

  if (rarity === 'legendary') {
    const pool = ASPECTS.filter((a) => fits(a.slots, base) && (!a.classes || !cls || a.classes.includes(cls.id)) && (!a.classes || !!cls));
    const pick = pool.length ? rng.pick(pool) : rng.pick(ASPECTS.filter((a) => !a.classes));
    item.aspect = { id: pick.id, roll: rng.next() };
  }

  if (rarity === 'rare') item.name = `${rng.pick(RARE_FIRST)} ${rng.pick(RARE_SECOND[base.slot])}`;
  return item;
}

export function starterItem(rng: Rng, base: string, classId: ClassId): ItemInstance {
  return { uid: rng.uid('i'), base, rarity: 'common', ilvl: 1, affixes: [], classId };
}

export const rarityRank = (r: Rarity): number => RARITIES.indexOf(r);
