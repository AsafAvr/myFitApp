import type { Element, SkillTag, StatusId, Vec3 } from '../types';
import type { Mod } from '../rules/stats';

export interface StatusDef {
  id: StatusId;
  name: string;
  kind: 'debuff' | 'buff';
  stacking: 'refresh' | 'stack';
  maxStacks?: number;
  dot?: Element;
  cc?: 'stop' | 'slow';
  mods?: (potency: number, stacks: number) => Mod[];
  castBonus?: { tag?: SkillTag; more?: number; crit?: number; consume: boolean };
  tint?: Vec3;
  desc: string;
}

const C = (r: number, g: number, b: number): Vec3 => [r / 255, g / 255, b / 255];
export const STATUS_TINT = {
  frost: C(150, 196, 226), fire: C(240, 158, 74), poison: C(116, 168, 90), shadow: C(74, 77, 94), stun: C(244, 190, 62),
};

const defs: StatusDef[] = [
  { id: 'burn', name: 'Burning', kind: 'debuff', stacking: 'refresh', dot: 'fire', tint: STATUS_TINT.fire, desc: 'Takes fire damage over time.' },
  { id: 'bleed', name: 'Bleeding', kind: 'debuff', stacking: 'refresh', dot: 'physical', desc: 'Takes physical damage over time.' },
  { id: 'poison', name: 'Poisoned', kind: 'debuff', stacking: 'stack', maxStacks: 5, dot: 'poison', tint: STATUS_TINT.poison, desc: 'Takes poison damage over time. Stacks.' },
  { id: 'chill', name: 'Chilled', kind: 'debuff', stacking: 'stack', maxStacks: 99, cc: 'slow', tint: STATUS_TINT.frost,
    mods: (p) => [{ stat: 'moveSpeed', value: -Math.min(0.6, p), more: true }, { stat: 'attackSpeed', value: -Math.min(0.3, p / 2), more: true }],
    desc: 'Slowed by cold. Enough cold freezes.' },
  { id: 'freeze', name: 'Frozen', kind: 'debuff', stacking: 'refresh', cc: 'stop', tint: STATUS_TINT.frost, desc: 'Cannot move or act.' },
  { id: 'stun', name: 'Stunned', kind: 'debuff', stacking: 'refresh', cc: 'stop', desc: 'Cannot move or act.' },
  { id: 'slow', name: 'Slowed', kind: 'debuff', stacking: 'refresh', cc: 'slow', mods: (p) => [{ stat: 'moveSpeed', value: -Math.min(0.7, p), more: true }], desc: 'Moves slower.' },
  { id: 'vulnerable', name: 'Vulnerable', kind: 'debuff', stacking: 'refresh', desc: 'Takes 20% more damage.' },
  { id: 'marked', name: 'Marked', kind: 'debuff', stacking: 'refresh', tint: STATUS_TINT.shadow, desc: 'Takes more damage from the hero who marked it.' },
  { id: 'rally', name: 'Rallied', kind: 'buff', stacking: 'refresh',
    mods: (p) => [{ stat: 'damageTaken', value: -p, more: true }, { stat: 'resourceGen', value: 0.4 }], desc: 'Takes less damage and gains more Resolve.' },
  { id: 'haste', name: 'Haste', kind: 'buff', stacking: 'refresh',
    mods: (p) => [{ stat: 'moveSpeed', value: p }, { stat: 'attackSpeed', value: p / 2 }], desc: 'Moves and attacks faster.' },
  { id: 'unstoppable', name: 'Unstoppable', kind: 'buff', stacking: 'refresh', desc: 'Cannot be stunned, frozen, chilled or slowed.' },
  { id: 'thorns', name: 'Iron Barbs', kind: 'buff', stacking: 'refresh', mods: (p) => [{ stat: 'thorns', value: p }], desc: 'Attackers are hurt in turn.' },
  { id: 'brand', name: 'Hearthfire Brand', kind: 'buff', stacking: 'refresh', mods: (p) => [{ stat: 'attackSpeed', value: p }], desc: 'Attacks set enemies burning and come faster.' },
  { id: 'laststand', name: 'Last Stand', kind: 'buff', stacking: 'refresh',
    mods: () => [{ stat: 'damage', value: 0.5, more: true }, { stat: 'damageTaken', value: -0.3, more: true }], desc: 'Deals more damage and takes less.' },
  { id: 'bloodrage', name: 'Bloodrage', kind: 'buff', stacking: 'stack', maxStacks: 5,
    mods: (_p, s) => [{ stat: 'damage', value: 0.05 * s, more: true }], desc: 'Each stack: 5% more damage.' },
  { id: 'hawkeye', name: "Hawk's Eye", kind: 'buff', stacking: 'refresh', mods: (p) => [{ stat: 'critChance', value: p }], desc: 'Far more critical strikes.' },
  { id: 'mending', name: 'Mending', kind: 'buff', stacking: 'refresh', desc: 'Recovering health.' },
  { id: 'warded', name: 'Barrier', kind: 'buff', stacking: 'refresh', desc: 'A barrier soaks damage before health.' },
  { id: 'overflow', name: 'Overflow', kind: 'buff', stacking: 'refresh', castBonus: { tag: 'core', more: 0.3, consume: true }, desc: 'Your next Core skill deals 30% more damage.' },
  { id: 'ambush', name: 'Ambush', kind: 'buff', stacking: 'stack', maxStacks: 3, castBonus: { more: 0.6, consume: true }, desc: 'Your next attacks deal 60% more damage.' },
  { id: 'poised', name: 'Poised', kind: 'buff', stacking: 'refresh', castBonus: { tag: 'basic', crit: 1, consume: true }, desc: 'Your next Basic skill is a critical strike.' },
];

export const STATUSES: Record<StatusId, StatusDef> = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<StatusId, StatusDef>;

export const FREEZE_AT = 1;
export const VULNERABLE_MORE = 0.2;
