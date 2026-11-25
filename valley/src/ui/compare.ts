import type { Character } from '../game/state/character';
import type { EquipSlot } from '../game/types';
import type { ItemInstance } from '../game/rules/items';
import { compileBuild, type Build } from '../game/rules/build';
import { defaultSlot } from '../game/rules/inventory';
import { BASE } from '../game/content/items';

export interface Delta { label: string; before: number; after: number; fmt: 'int' | 'pct' | 'num'; better: boolean }

export function damageScore(b: Build): number {
  const d = b.derived, t = b.totals;
  const avg = (d.weapon.min + d.weapon.max) / 2;
  return avg * d.mainMult * (1 + t.add.damage) * t.more.damage * (1 + d.critChance * (d.critMult - 1)) * d.attackSpeed;
}
export function toughScore(b: Build): number {
  const d = b.derived;
  const res = (d.resist.fire + d.resist.frost + d.resist.storm + d.resist.poison + d.resist.shadow) / 5;
  const armor = d.armor / (d.armor + 40 + 9 * 20);
  return d.maxLife / ((1 - armor * 0.6) * (1 - res * 0.4) * d.taken * (1 - d.dodge) * (1 - d.block * 0.4));
}

export function compareItem(char: Character, item: ItemInstance, slot?: EquipSlot): Delta[] {
  const target = slot ?? defaultSlot(char, item);
  const before = compileBuild({ char });
  const equipment = { ...char.equipment, [target]: item };
  if (target === 'mainhand' && BASE[item.base]?.hands === 2) delete equipment.offhand;
  const after = compileBuild({ char: { ...char, equipment } });
  const a = before.derived, b = after.derived;
  const rows: Delta[] = [
    { label: 'Damage', before: damageScore(before), after: damageScore(after), fmt: 'int', better: true },
    { label: 'Toughness', before: toughScore(before), after: toughScore(after), fmt: 'int', better: true },
    { label: 'Health', before: a.maxLife, after: b.maxLife, fmt: 'int', better: true },
    { label: 'Armor', before: a.armor, after: b.armor, fmt: 'int', better: true },
    { label: 'Critical chance', before: a.critChance, after: b.critChance, fmt: 'pct', better: true },
    { label: 'Critical damage', before: a.critMult, after: b.critMult, fmt: 'pct', better: true },
    { label: 'Attack speed', before: a.attackSpeed, after: b.attackSpeed, fmt: 'pct', better: true },
    { label: 'Movement speed', before: a.moveSpeed, after: b.moveSpeed, fmt: 'pct', better: true },
    { label: 'Cooldowns', before: a.cdr, after: b.cdr, fmt: 'pct', better: true },
    { label: 'Resource', before: a.maxResource, after: b.maxResource, fmt: 'int', better: true },
  ];
  return rows.filter((r) => Math.abs(r.after - r.before) > (r.fmt === 'pct' ? 0.0005 : 0.5));
}

export function fmtDelta(d: Delta): string {
  const diff = d.after - d.before;
  const sign = diff > 0 ? '+' : '−';
  if (d.fmt === 'pct') return `${sign}${Math.abs(diff * 100).toFixed(1)}%`;
  if (d.label === 'Damage' || d.label === 'Toughness') return `${sign}${Math.abs(d.before ? diff / d.before * 100 : 0).toFixed(1)}%`;
  return `${sign}${Math.round(Math.abs(diff))}`;
}
