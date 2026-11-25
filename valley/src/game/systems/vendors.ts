import type { Game } from '../game';
import type { EquipSlot } from '../types';
import type { ItemInstance } from '../rules/items';
import { AFFIX, AFFIXES, BASES, MATERIAL } from '../content/items';
import { generateItem, rollRarity, salvageYield, sellValue, usableBy } from '../rules/items';
import { addMaterial, addToBag, firstFree, fromStash, materialCount, spendMaterial, toStash, type Outcome } from '../rules/inventory';

const fail = (reason: string): Outcome => ({ ok: false, reason });

export const TONIC_TIERS = [
  { name: 'Red Tonic', heal: '45%', needs: {}, glint: 0 },
  { name: 'Strong Tonic', heal: '56%', needs: { sprout_leaf: 6, puff_spore: 4 }, glint: 120 },
  { name: 'Potent Tonic', heal: '67%', needs: { hog_bristle: 6, wisp_ember: 4 }, glint: 600 },
  { name: 'Hearth Tonic', heal: '79%', needs: { crag_shard: 8, snap_claw: 6, inkstone: 1 }, glint: 2400 },
  { name: 'Elder Tonic', heal: '90%', needs: { crag_shard: 14, wisp_ember: 10, inkstone: 3 }, glint: 9000 },
];

export const GAMBLE_KINDS: { id: string; name: string; slot: string }[] = [
  { id: 'weapon', name: 'Weapon', slot: 'weapon' }, { id: 'offhand', name: 'Off-hand', slot: 'offhand' },
  { id: 'helm', name: 'Helm', slot: 'helm' }, { id: 'chest', name: 'Chest', slot: 'chest' }, { id: 'gloves', name: 'Gloves', slot: 'gloves' },
  { id: 'legs', name: 'Legs', slot: 'legs' }, { id: 'boots', name: 'Boots', slot: 'boots' }, { id: 'amulet', name: 'Amulet', slot: 'amulet' }, { id: 'ring', name: 'Ring', slot: 'ring' },
];

export class Vendors {
  private readonly game: Game;
  constructor(game: Game) { this.game = game; }

  private changed(): void { this.game.bus.emit('inventory:changed'); }

  sell(index: number): Outcome {
    const c = this.game.player.char, it = c.bag[index];
    if (!it) return fail('Nothing there.');
    c.bag[index] = null;
    const v = sellValue(it);
    c.gold += v;
    this.game.bus.emit('trade', { sold: it.base, total: v });
    this.changed();
    return { ok: true };
  }

  sellJunk(): number {
    const c = this.game.player.char;
    let total = 0;
    c.bag.forEach((it, i) => { if (it?.junk) { total += sellValue(it); c.bag[i] = null; } });
    if (total) { c.gold += total; this.game.bus.emit('trade', { total }); this.changed(); }
    return total;
  }

  salvage(index: number): Outcome {
    const c = this.game.player.char, it = c.bag[index];
    if (!it) return fail('Nothing there.');
    c.bag[index] = null;
    for (const m of salvageYield(it)) addMaterial(c, m.id, m.n);
    this.game.bus.emit('trade', { made: 'salvage' });
    this.game.bus.emit('log', { text: `Salvaged: ${salvageYield(it).map((m) => `${m.n} ${MATERIAL[m.id].name}`).join(', ')}.` });
    this.changed();
    return { ok: true };
  }

  sellMaterials(): number {
    const c = this.game.player.char;
    let total = 0;
    for (const id of Object.keys(c.materials)) {
      if (['scrap', 'thread', 'inkstone'].includes(id)) continue;
      total += (MATERIAL[id]?.value ?? 1) * c.materials[id];
      delete c.materials[id];
    }
    if (total) { c.gold += total; this.game.bus.emit('trade', { total }); this.changed(); }
    return total;
  }

  nextTonic(): typeof TONIC_TIERS[number] | null { return TONIC_TIERS[this.game.player.char.potionTier + 1] ?? null; }

  brewTonic(): Outcome {
    const g = this.game, c = g.player.char, next = this.nextTonic();
    if (!next) return fail('Your tonics are as strong as they can be brewed.');
    if (c.gold < next.glint) return fail('Not enough glint.');
    for (const [id, n] of Object.entries(next.needs)) if (materialCount(c, id) < n) return fail(`You need ${n} ${MATERIAL[id].name}.`);
    for (const [id, n] of Object.entries(next.needs)) spendMaterial(c, id, n);
    c.gold -= next.glint;
    c.potionTier++;
    c.potions = g.player.build.derived.potionCharges;
    g.bus.emit('trade', { made: 'tonic' });
    g.bus.emit('log', { text: `Your tonics are now <em>${next.name}s</em>.` });
    this.changed();
    return { ok: true };
  }

  refill(): Outcome {
    const p = this.game.player;
    p.char.potions = p.build.derived.potionCharges;
    this.game.bus.emit('drink', { item: 'refill' });
    return { ok: true };
  }

  gamblePrice(): number { return Math.round(60 + this.game.player.char.level * 14); }

  gamble(kind: string): Outcome {
    const g = this.game, c = g.player.char, price = this.gamblePrice();
    if (c.gold < price) return fail('Not enough glint.');
    if (firstFree(c.bag) < 0) return fail('Your bag is full.');
    const cls = g.player.build.cls;
    const pool = BASES.filter((b) => b.slot === kind && usableBy(cls, b));
    if (!pool.length) return fail('The smith has nothing of that kind for you.');
    const rarity = rollRarity(g.rng, { magicFind: 1.4, rank: 'chest', ilvl: c.level });
    const item = generateItem(g.rng, { ilvl: c.level, rarity: rarity === 'common' ? 'magic' : rarity, classId: c.classId, base: g.rng.pick(pool).id });
    c.gold -= price;
    addToBag(c, item);
    g.bus.emit('trade', { bought: item.base });
    this.changed();
    return { ok: true };
  }

  enchantCost(it: ItemInstance): { glint: number; thread: number } {
    return { glint: Math.round(40 + it.ilvl * 9), thread: it.rarity === 'legendary' || it.rarity === 'unique' ? 3 : 1 };
  }

  enchant(where: { bag?: number; slot?: EquipSlot }, affixIndex: number): Outcome {
    const g = this.game, c = g.player.char;
    const it = where.bag !== undefined ? c.bag[where.bag] : where.slot ? c.equipment[where.slot] : null;
    if (!it) return fail('Nothing there.');
    if (it.rarity === 'unique') return fail('A unique cannot be changed.');
    const cur = it.affixes[affixIndex];
    if (!cur) return fail('No such affix.');
    const cost = this.enchantCost(it);
    if (c.gold < cost.glint) return fail('Not enough glint.');
    if (materialCount(c, 'thread') < cost.thread) return fail(`You need ${cost.thread} Gilded Thread.`);
    const roll = generateItem(g.rng, { ilvl: it.ilvl, rarity: 'rare', base: it.base, classId: c.classId });
    const taken = new Set(it.affixes.map((a) => a.id));
    const groups = new Set(it.affixes.filter((_, i) => i !== affixIndex).map((a) => AFFIX[a.id]?.group).filter(Boolean));
    const fresh = roll.affixes.find((a) => !taken.has(a.id) && !(AFFIX[a.id]?.group && groups.has(AFFIX[a.id].group)))
      ?? { id: AFFIXES[0].id, roll: g.rng.next() };
    c.gold -= cost.glint;
    spendMaterial(c, 'thread', cost.thread);
    it.affixes[affixIndex] = fresh;
    if (where.slot) g.player.dirty = true;
    g.bus.emit('trade', { made: 'enchant' });
    this.changed();
    return { ok: true };
  }

  deposit(bagIndex: number, tab: number): Outcome {
    const out = toStash(this.game.player.char, this.game.stash[tab], bagIndex);
    if (out.ok) { this.changed(); this.game.persistAccount(); }
    return out;
  }
  withdraw(stashIndex: number, tab: number): Outcome {
    const out = fromStash(this.game.player.char, this.game.stash[tab], stashIndex);
    if (out.ok) { this.changed(); this.game.persistAccount(); }
    return out;
  }
}
