import type { Game } from '../game';
import type { Drop, LootPayload, Monster, Rarity, Vec3 } from '../types';
import type { Particle } from '../fx';
import { baseEntity } from '../entities';
import { BASE, MATERIAL } from '../content/items';
import { rollDrops, type DropContext } from '../rules/loot';
import { displayName, type ItemInstance } from '../rules/items';
import { addMaterial, addToBag } from '../rules/inventory';

const SUN: Vec3 = [244 / 255, 190 / 255, 62 / 255];
const TONIC: Vec3 = [198 / 255, 62 / 255, 58 / 255];
const MAGNET = 2.6, REACH = 0.85;

export class Loot {
  private readonly game: Game;
  drops: Drop[] = [];
  private beams = new Map<number, Particle>();

  constructor(game: Game) { this.game = game; }

  reset(): void {
    for (const b of this.beams.values()) this.game.fx.release(b);
    this.beams.clear();
    this.drops = [];
  }

  dropFrom(m: Monster): void {
    const g = this.game, p = g.player;
    const ctx: DropContext = {
      rank: m.rank, level: m.level, classId: p.char.classId, magicFind: p.build.derived.magicFind,
      goldFind: p.build.derived.goldFind, difficulty: p.char.difficulty, night: g.stakes.night(), def: m.def,
    };
    this.scatter(rollDrops(g.rng, ctx), m.x, m.z);
  }

  chest(x: number, z: number, level: number, rank: 'chest' | 'boss' = 'chest'): void {
    const g = this.game, p = g.player;
    this.scatter(rollDrops(g.rng, {
      rank, level, classId: p.char.classId, magicFind: p.build.derived.magicFind, goldFind: p.build.derived.goldFind,
      difficulty: p.char.difficulty, night: 0,
    }), x, z);
  }

  scatter(list: LootPayload[], x: number, z: number): void {
    for (const loot of list) {
      const a = this.game.rng.angle(), r = 0.5 + this.game.rng.next() * (list.length > 3 ? 1.6 : 1);
      this.spawn(loot, x, z, x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
  }

  spawn(loot: LootPayload, x: number, z: number, tx: number, tz: number, keep = false): Drop {
    const g = this.game;
    let color: Vec3 = SUN, extra = 0, name = '', rarity: Rarity | null = null;
    if (loot.type === 'gold') { name = `${loot.n} glint`; }
    else if (loot.type === 'potion') { color = TONIC; extra = 2; name = 'Red Tonic'; }
    else if (loot.type === 'material') {
      const m = MATERIAL[loot.id];
      color = m ? [m.color[0] / 255, m.color[1] / 255, m.color[2] / 255] : SUN; extra = 1;
      name = `${m?.name ?? loot.id}${loot.n > 1 ? ` ×${loot.n}` : ''}`;
    } else {
      rarity = loot.item.rarity;
      color = g.fx.rarityPencil(rarity);
      extra = BASE[loot.item.base]?.shape ?? 3;
      name = displayName(loot.item);
    }
    const d: Drop = {
      ...baseEntity('drop', 'drop'),
      kind: 'drop',
      x, z, y: g.world.surface(x, z), tx, tz, radius: 0.4, height: 0.7, extra,
      colors: [color, color, color], name, loot, rarity, age: keep ? 1 : 0, grow: keep ? 1 : 0, keep,
    };
    g.entities.add(d);
    this.drops.push(d);
    if (rarity === 'legendary' || rarity === 'unique' || rarity === 'rare') {
      const beam = g.fx.lootBeam(d, rarity);
      if (beam) this.beams.set(d.id, beam);
    }
    if (rarity === 'legendary' || rarity === 'unique') g.bus.emit('item:legendary', { item: (loot as { item: ItemInstance }).item });
    return d;
  }

  discard(item: ItemInstance): void {
    const p = this.game.player;
    this.spawn({ type: 'item', item }, p.x, p.z, p.x + 0.8, p.z + 0.4, true);
  }

  update(dt: number): void {
    const g = this.game, p = g.player, auto = g.settings.autoPickup;
    let w = 0;
    for (const d of this.drops) {
      if (d.gone) { this.unbeam(d); continue; }
      d.age += dt;
      d.grow = Math.min(1, d.grow + dt * 5);
      const k = Math.min(1, d.age / 0.4);
      d.x += (d.tx - d.x) * Math.min(1, dt * 8); d.z += (d.tz - d.z) * Math.min(1, dt * 8);
      d.lift = Math.sin(k * Math.PI) * 0.6;
      d.y = g.world.surface(d.x, d.z);
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      const isItem = d.loot.type === 'item';
      const wanted = !isItem || auto || p.target === d;
      if (d.age > 0.45 && !p.dead && wanted && dist < (isItem ? 2 : MAGNET)) {
        d.tx = p.x; d.tz = p.z;
        if (dist < REACH + (isItem ? 0.5 : 0) && this.take(d)) { d.gone = true; this.unbeam(d); continue; }
      }
      if (!d.keep && d.age > (isItem ? 600 : 120)) { d.gone = true; this.unbeam(d); continue; }
      this.drops[w++] = d;
    }
    this.drops.length = w;
  }

  private unbeam(d: Drop): void {
    const b = this.beams.get(d.id);
    if (b) { this.game.fx.release(b); this.beams.delete(d.id); }
  }

  take(d: Drop): boolean {
    const g = this.game, c = g.player.char, loot = d.loot;
    let label = d.name, rare = false;
    if (loot.type === 'gold') c.gold += loot.n;
    else if (loot.type === 'potion') {
      if (c.potions >= g.player.build.derived.potionCharges) return false;
      c.potions++;
    } else if (loot.type === 'material') { addMaterial(c, loot.id, loot.n); rare = true; }
    else {
      if (addToBag(c, loot.item) < 0) {
        if (!d.warned) { d.warned = true; g.bus.emit('log', { text: 'Your bag is full.' }); g.bus.emit('deny'); }
        return false;
      }
      rare = loot.item.rarity !== 'common';
      if (loot.item.rarity === 'legendary' || loot.item.rarity === 'unique') c.tally.legendaries++;
      label = displayName(loot.item);
      g.bus.emit('inventory:changed');
    }
    g.bus.emit('pickup', { x: d.x, y: d.y, z: d.z, item: loot.type === 'item' ? loot.item.base : loot.type === 'material' ? loot.id : loot.type, n: 'n' in loot ? loot.n : 1, rare, name: label, rarity: d.rarity ?? undefined });
    return true;
  }
}
