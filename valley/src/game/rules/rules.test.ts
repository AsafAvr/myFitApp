import { describe, expect, it } from 'vitest';
import { Rng } from '../../engine/rng';
import { newCharacter } from '../state/character';
import { CLASSES, CLASS_LIST } from '../content/classes';
import { AFFIX, AFFIXES, ASPECTS, BASE, affixValue } from '../content/items';
import { Totals, derive, damageBuckets, damageStats, xpToNext } from './stats';
import { resolveHit, armorMitigation, type AttackerView, type DefenderView } from './damage';
import { generateItem, itemEffects, canEquip, sellValue, salvageYield, type ItemInstance } from './items';
import { buildTree, canAllocate, canRefund, lockedNodes, pointsEarned, pointsSpent } from './tree';
import { compileBuild } from './build';
import { addToBag, equipFromBag, sortBag, unequip } from './inventory';
import { rollDrops } from './loot';

const noCirc = { vsElite: false, vulnerable: false, cc: false, burning: false, chilled: false, poisoned: false, bleeding: false, marked: false, close: false, distant: false, injured: false, healthy: false, dot: false };

describe('stats', () => {
  it('sums adds and multiplies mores', () => {
    const t = new Totals();
    t.apply({ stat: 'dmgFire', value: 0.2 });
    t.apply({ stat: 'dmgFire', value: 0.2 });
    t.apply({ stat: 'dmgFire', value: 0.2, more: true });
    t.apply({ stat: 'dmgFire', value: 0.2, more: true });
    const b = damageBuckets(t, damageStats('fire', ['core'], noCirc));
    expect(b.inc).toBeCloseTo(0.4);
    expect(b.more).toBeCloseTo(1.44);
  });

  it('gives a level 1 hero about the old game’s health', () => {
    const d = derive(new Totals(), CLASSES.warden, 1, null);
    expect(d.maxLife).toBeGreaterThan(120);
    expect(d.maxLife).toBeLessThan(150);
    expect(d.mainMult).toBeCloseTo(1.1);
  });

  it('caps resistances and keeps the experience curve rising', () => {
    const t = new Totals();
    t.apply({ stat: 'resistAll', value: 2 });
    expect(derive(t, CLASSES.emberwright, 10, null).resist.fire).toBe(0.7);
    for (let l = 1; l < 50; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
});

describe('damage', () => {
  const att: AttackerView = { level: 10, totals: null, mainMult: 1, critChance: 0, critMult: 1.5, hpFrac: 1, isPlayer: true };
  const def: DefenderView = { level: 10, armor: 0, resist: {}, taken: 1, dodge: 0, block: 0, statuses: [], hpFrac: 1, elite: false, isPlayer: false, distance: 2 };

  it('makes Vulnerable enemies take 20% more', () => {
    const rng = new Rng(1);
    const plain = resolveHit(att, def, { base: 100, element: 'physical', tags: [], canCrit: false }, rng).amount;
    const vuln = resolveHit(att, { ...def, statuses: [{ id: 'vulnerable', left: 2, dur: 2, potency: 0, stacks: 1, tick: 0 }] }, { base: 100, element: 'physical', tags: [], canCrit: false }, rng).amount;
    expect(plain).toBe(100);
    expect(vuln).toBe(120);
  });

  it('crits, mitigates by armor and resistance', () => {
    const rng = new Rng(2);
    const crit = resolveHit({ ...att, critChance: 1 }, def, { base: 100, element: 'fire', tags: [], canCrit: true }, rng);
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBe(150);
    const resisted = resolveHit(att, { ...def, resist: { fire: 0.5 } }, { base: 100, element: 'fire', tags: [], canCrit: false }, rng);
    expect(resisted.amount).toBe(50);
    expect(armorMitigation(1e9, 1)).toBe(0.8);
  });

  it('never crits or dodges damage over time', () => {
    const rng = new Rng(3);
    const r = resolveHit({ ...att, critChance: 1 }, { ...def, isPlayer: true, dodge: 1 }, { base: 10, element: 'poison', tags: [], canCrit: true, dot: true }, rng);
    expect(r.crit).toBe(false);
    expect(r.dodged).toBe(false);
  });
});

describe('items', () => {
  it('rolls the same item from the same seed', () => {
    const a = generateItem(new Rng(42), { ilvl: 20, rarity: 'rare', classId: 'warden' });
    const b = generateItem(new Rng(42), { ilvl: 20, rarity: 'rare', classId: 'warden' });
    expect(a).toEqual(b);
  });

  it('gives each rarity its share of affixes and powers', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const it = generateItem(rng, { ilvl: 1 + (i % 40), rarity: (['common', 'magic', 'rare', 'legendary'] as const)[i % 4], classId: CLASS_LIST[i % 3].id });
      const n = it.affixes.length;
      if (it.rarity === 'common') expect(n).toBe(0);
      if (it.rarity === 'magic') expect(n).toBeGreaterThanOrEqual(1);
      if (it.rarity === 'rare') { expect(n).toBeGreaterThanOrEqual(3); expect(it.name).toBeTruthy(); }
      if (it.rarity === 'legendary') expect(it.aspect).toBeTruthy();
      const groups = it.affixes.map((r) => AFFIX[r.id].group).filter(Boolean);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it('grows flat affixes with item level, not percentages much', () => {
    expect(affixValue(AFFIX.life, 1, 50)).toBeGreaterThan(affixValue(AFFIX.life, 1, 1) * 8);
    expect(affixValue(AFFIX.critChance, 1, 50)).toBeLessThan(affixValue(AFFIX.critChance, 1, 1) * 1.5);
  });

  it('has a known stat or rank for every affix, and effects for every aspect', () => {
    for (const a of AFFIXES) expect(a.range[0]).toBeLessThanOrEqual(a.range[1]);
    for (const a of ASPECTS) expect(a.effects((a.range[0] + a.range[1]) / 2).length).toBeGreaterThan(0);
  });

  it('keeps classes to their own weapons and checks level', () => {
    const staff: ItemInstance = { uid: 'x', base: 'staff', rarity: 'common', ilvl: 1, affixes: [] };
    expect(canEquip(CLASSES.warden, staff, 1).ok).toBe(false);
    expect(canEquip(CLASSES.emberwright, staff, 1).ok).toBe(true);
    expect(canEquip(CLASSES.emberwright, { ...staff, ilvl: 30 }, 5).ok).toBe(false);
    expect(sellValue({ ...staff, rarity: 'legendary' })).toBeGreaterThan(sellValue(staff));
    expect(salvageYield({ ...staff, rarity: 'legendary' }).some((m) => m.id === 'inkstone')).toBe(true);
    expect(itemEffects(staff).some((e) => e.kind === 'stat' && e.stat === 'resourceMax')).toBe(true);
  });
});

describe('skill tree', () => {
  const tree = buildTree(CLASSES.warden);

  it('opens branches by points spent above them', () => {
    expect(canAllocate(tree, { strike: 1 }, 'cleave', 1).ok).toBe(true);
    expect(canAllocate(tree, { strike: 1 }, 'rally', 1).ok).toBe(false);
    expect(canAllocate(tree, { strike: 3, cleave: 1 }, 'rally', 1).ok).toBe(true);
    expect(canAllocate(tree, { strike: 1 }, 'cleave', 0).ok).toBe(false);
  });

  it('chains skill → enhancement → one of two upgrades', () => {
    expect(canAllocate(tree, { strike: 1 }, 'strike:a', 5).ok).toBe(false);
    expect(canAllocate(tree, { strike: 1, 'strike+': 1 }, 'strike:a', 5).ok).toBe(true);
    expect(canAllocate(tree, { strike: 1, 'strike+': 1, 'strike:a': 1 }, 'strike:b', 5).ok).toBe(false);
  });

  it('refuses refunds that would strand a node', () => {
    const a = { strike: 3, cleave: 1, rally: 1 };
    expect(canRefund(tree, a, 'strike').ok).toBe(false);
    expect(canRefund(tree, { strike: 1, 'strike+': 1 }, 'strike').ok).toBe(false);
    expect(canRefund(tree, { strike: 2, cleave: 1 }, 'cleave').ok).toBe(true);
    expect(canRefund(tree, { strike: 1, cleave: 1 }, 'strike', lockedNodes(tree, { strike: 1, cleave: 1 })).ok).toBe(false);
  });

  it('lets only one ultimate and one key passive be taken', () => {
    const big = { strike: 5, cleave: 5, whirl: 5, rally: 1, leap: 1, laststand: 1 };
    expect(canAllocate(tree, big, 'avalanche', 9).ok).toBe(false);
    expect(canAllocate(tree, { ...big, unbroken: 1 }, 'bloodrage', 9).ok).toBe(false);
  });

  it('starts every class with its starting points spent', () => {
    for (const cls of CLASS_LIST) {
      const c = newCharacter(cls.id, 'Test', 1);
      expect(pointsSpent(c.tree)).toBe(pointsEarned(1, 0));
      for (const id of cls.start) expect(buildTree(cls).nodes.get(id)).toBeTruthy();
    }
  });
});

describe('build compiler', () => {
  it('resolves skills with rank scaling and upgrades', () => {
    const c = newCharacter('emberwright', 'T', 1);
    let b = compileBuild({ char: c });
    expect(b.skills.get('emberbolt')!.params.count).toBe(1);
    const coef1 = b.skills.get('emberbolt')!.params.coef;
    c.tree.emberbolt = 3; c.tree['emberbolt+'] = 1; c.tree['emberbolt:a'] = 1;
    b = compileBuild({ char: c });
    expect(b.skills.get('emberbolt')!.params.count).toBe(2);
    expect(b.skills.get('emberbolt')!.params.coef).toBeCloseTo(coef1 * 1.2);
  });

  it('adds ranks from gear and applies aspects after upgrades', () => {
    const c = newCharacter('emberwright', 'T', 1);
    c.tree['emberbolt+'] = 1; c.tree['emberbolt:a'] = 1;
    c.equipment.amulet = { uid: 'a', base: 'amulet', rarity: 'legendary', ilvl: 10, affixes: [{ id: 'rank', roll: 0, skill: 'emberbolt' }], aspect: { id: 'trefoil', roll: 1 } };
    const b = compileBuild({ char: c });
    expect(b.skills.get('emberbolt')!.rank).toBe(2);
    expect(b.skills.get('emberbolt')!.params.count).toBe(4);
  });

  it('applies conditional modifiers only while their condition holds', () => {
    const c = newCharacter('warden', 'T', 1);
    c.tree.unbroken = 1;
    expect(compileBuild({ char: c, when: { resourceHigh: false } }).derived.taken).toBeCloseTo(1);
    expect(compileBuild({ char: c, when: { resourceHigh: true } }).derived.taken).toBeCloseTo(0.85);
  });

  it('shortens cooldowns and costs from gear', () => {
    const c = newCharacter('warden', 'T', 1);
    c.equipment.helm = { uid: 'h', base: 'hood', rarity: 'magic', ilvl: 1, affixes: [{ id: 'cdr', roll: 1 }, { id: 'costReduction', roll: 1 }] };
    c.equipment.amulet = { uid: 'a', base: 'amulet', rarity: 'magic', ilvl: 1, affixes: [{ id: 'costReduction', roll: 1 }] };
    const b = compileBuild({ char: c });
    expect(b.skills.get('cleave')!.params.cost).toBeLessThan(30);
  });
});

describe('inventory', () => {
  it('swaps worn and carried, and makes room for a two-handed weapon', () => {
    const c = newCharacter('warden', 'T', 1);
    const shield: ItemInstance = { uid: 's', base: 'shield', rarity: 'common', ilvl: 1, affixes: [] };
    const great: ItemInstance = { uid: 'g', base: 'greatsword', rarity: 'common', ilvl: 1, affixes: [] };
    addToBag(c, shield);
    expect(equipFromBag(c, 0).ok).toBe(true);
    expect(c.equipment.offhand?.uid).toBe('s');
    addToBag(c, great);
    expect(equipFromBag(c, 0).ok).toBe(true);
    expect(c.equipment.mainhand?.uid).toBe('g');
    expect(c.equipment.offhand).toBeUndefined();
    expect(c.bag.filter(Boolean).map((i) => i!.base).sort()).toEqual(['shield', 'sword']);
  });

  it('refuses when the bag is full and sorts by kind and rarity', () => {
    const c = newCharacter('strider', 'T', 1);
    for (let i = 0; i < c.bag.length; i++) c.bag[i] = { uid: 'r' + i, base: i % 2 ? 'ring' : 'boots', rarity: i % 3 ? 'magic' : 'rare', ilvl: i + 1, affixes: [] };
    expect(unequip(c, 'chest').ok).toBe(false);
    sortBag(c);
    expect(BASE[c.bag[0]!.base].slot).toBe('boots');
    expect(c.bag[0]!.rarity).toBe('rare');
  });
});

describe('loot', () => {
  it('always gives a boss something special first', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 30; i++) {
      const drops = rollDrops(rng, { rank: 'boss', level: 12, classId: 'strider', magicFind: 1, goldFind: 1, difficulty: 'normal', night: 0 });
      const first = drops.find((d) => d.type === 'item');
      expect(first && first.type === 'item' && ['legendary', 'unique'].includes(first.item.rarity)).toBe(true);
    }
  });
});
