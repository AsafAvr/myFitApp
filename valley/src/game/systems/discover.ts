import type { Game } from '../game';
import { BIOMES } from '../../world/biomes.js';
import { BOONS } from '../content/boons';
import { levelAt } from '../rules/stats';
import { generateItem } from '../rules/items';
import type { LootPayload } from '../types';

const COUNTRIES = BIOMES.filter((b: { hidden?: boolean }) => !b.hidden);
const WALK_MARKS = [4, 8, COUNTRIES.length];
const MATS = ['sprout_leaf', 'puff_spore', 'hog_bristle', 'wisp_ember', 'crag_shard', 'snap_claw'];

interface Lead { key: string; x: number; z: number; name: string }

export class Discover {
  private readonly game: Game;
  private timer = 0;
  trip: { way: { x: number; z: number; name: string }; t: number; moved: boolean } | null = null;
  lead: Lead | null = null;

  constructor(game: Game) {
    this.game = game;
    game.bus.on('attune', (d) => {
      const j = game.player.char.journey;
      if (!j.ways.some((w) => w.x === d.x && w.z === d.z)) j.ways.push({ x: d.x, z: d.z, name: d.name });
    });
    game.bus.on('player:respawn', () => { this.trip = null; });
  }

  reset(): void {
    const g = this.game, j = g.player.char.journey;
    this.trip = null; this.lead = null; this.timer = 0;
    if (!j.ways.length) j.ways.push({ x: 0, z: 0, name: 'Hearthmere' });
    if (!j.ways.some((w) => w.x === j.waystone.x && w.z === j.waystone.z)) j.ways.push({ ...j.waystone });
    for (const key in j.found) if (key[0] === 'f') g.overworld.gen.opened.add(key);
  }

  nextMark(): number {
    const n = Object.keys(this.game.player.char.journey.lands).length;
    return WALK_MARKS.find((m) => m > n) ?? 0;
  }
  get totalCountries(): number { return COUNTRIES.length; }

  private land(biome: { id: string; name: string; hidden?: boolean }): void {
    const g = this.game, c = g.player.char, j = c.journey;
    if (biome.hidden) return;
    const first = Object.keys(j.lands).length === 0;
    j.lands[biome.id] = 1;
    const n = Object.keys(j.lands).length;
    if (first) return;
    const mark = WALK_MARKS.includes(n);
    if (mark) { c.bonusPoints++; g.bus.emit('tree:changed'); }
    g.combat.grantXp(10 + n * 6);
    g.bus.emit('land', { name: biome.name, count: n, total: COUNTRIES.length, mark, all: n === COUNTRIES.length });
  }

  count(): number { return Object.keys(this.game.player.char.journey.found).length; }

  private note(key: string, x: number, z: number): void {
    const g = this.game, j = g.player.char.journey;
    j.found[key] = 1;
    delete j.known[key];
    g.combat.grantXp(6 + levelAt(Math.hypot(x, z)) * 4);
  }

  travel(i: number): boolean {
    const g = this.game, p = g.player, way = p.char.journey.ways[i];
    if (!way || p.dead || this.trip) return false;
    if (p.calm < 4) { g.bus.emit('log', { text: 'Not in the middle of a fight.' }); g.bus.emit('deny'); return false; }
    this.trip = { way, t: 0, moved: false };
    g.look.fadeGoal = 0;
    g.bus.emit('travel', { name: way.name });
    return true;
  }

  update(dt: number): void {
    const g = this.game, p = g.player, c = p.char, j = c.journey, w = g.world;
    if (this.trip) {
      const t = this.trip;
      t.t += dt;
      if (!t.moved && t.t > 0.55) {
        t.moved = true;
        if (g.world !== g.overworld) g.zones.leave(true);
        p.x = t.way.x + 2.4; p.z = t.way.z + 2.4; p.y = g.world.surface(p.x, p.z);
        Object.assign(p, { target: null, pursue: false, moveTo: null, dash: null, queued: null });
        g.camera.target = [p.x, p.y + 1, p.z];
        g.hazards.clear();
        g.fillWorld();
        g.look.fadeGoal = 1;
        g.bus.emit('travel:arrive', { x: p.x, y: p.y, z: p.z, name: t.way.name });
      }
      if (t.t > 1.3) this.trip = null;
      return;
    }
    if (g.paused || p.dead) return;
    if (j.boon) {
      j.boon.left -= dt;
      if (j.boon.left <= 0) { g.bus.emit('log', { text: `${BOONS[j.boon.id]?.name ?? 'The boon'} fades.` }); j.boon = null; p.dirty = true; }
    }
    if (w !== g.overworld) return;
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.25;

    const biome = w.biome(p.x, p.z);
    if (!j.lands[biome.id]) this.land(biome);

    let lead: Lead | null = null, best = 1e9;
    for (const site of w.sites.inRange(p.x, p.z, 420)) {
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (!j.found[site.key]) {
        if (d < Math.max(6, site.plaza || 0) + 3) { this.note(site.key, site.x, site.z); g.bus.emit('found', { kind: site.kind, name: site.name, count: this.count() }); }
        else if (d < best) { best = d; lead = site; }
      }
    }
    this.lead = lead;

    for (const f of w.finds.inRange(p.x, p.z, 8)) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (f.kind === 'cache' && d < 2.3 && !j.found[f.key]) this.open(f);
      else if (f.kind === 'stones' && d < 3.4) this.bless(f);
      else if (f.kind === 'beacon' && d < 4.2 && !j.found[f.key]) this.survey(f);
    }
  }

  private open(f: { key: string; x: number; z: number; i: number; j: number; name: string }): void {
    const g = this.game, c = g.player.char, lvl = levelAt(Math.hypot(f.x, f.z));
    const y = g.world.surface(f.x, f.z);
    const roll = (k: number) => { const v = Math.sin(f.i * 127.1 + f.j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    const loot: LootPayload[] = [
      { type: 'gold', n: Math.round(14 + lvl * 7 + roll(1) * 12) },
      { type: 'potion', n: 1 },
      { type: 'material', id: MATS[Math.floor(roll(3) * MATS.length)], n: 2 + Math.floor(roll(4) * 2) },
      { type: 'item', item: generateItem(g.rng, { ilvl: lvl + 1, rarity: roll(5) < 0.08 ? 'legendary' : roll(5) < 0.4 ? 'rare' : 'magic', classId: c.classId }) },
    ];
    g.loot.scatter(loot, f.x, f.z);
    this.note(f.key, f.x, f.z);
    const [cx, cz] = g.world.openFind(f);
    g.renderer.worldTex.refresh(cx, cz);
    g.bus.emit('found', { kind: 'cache', name: 'A cache', count: this.count(), x: f.x, y, z: f.z });
  }

  private bless(f: { key: string; x: number; z: number; i: number; j: number; name: string }): void {
    const g = this.game, p = g.player, j = p.char.journey;
    if (!j.found[f.key]) { this.note(f.key, f.x, f.z); g.bus.emit('found', { kind: 'stones', name: f.name, count: this.count() }); }
    if (j.boon) return;
    const ids = Object.keys(BOONS), id = ids[Math.abs(f.i * 3 + f.j * 5 + this.count()) % ids.length];
    j.boon = { id, left: BOONS[id].seconds };
    p.dirty = true;
    g.playerSystem.recompile(true);
    if (id === 'hale') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2);
    g.bus.emit('boon', { id, name: BOONS[id].name, desc: BOONS[id].desc, entity: p });
  }

  private survey(f: { key: string; x: number; z: number; name: string }): void {
    const g = this.game, j = g.player.char.journey;
    this.note(f.key, f.x, f.z);
    const near = [...g.world.sites.inRange(f.x, f.z, 520), ...g.world.finds.inRange(f.x, f.z, 300)]
      .filter((o: Lead) => !j.found[o.key])
      .sort((a: Lead, b: Lead) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, 6);
    for (const o of near) j.known[o.key] = [o.x, o.z, o.name];
    g.bus.emit('found', { kind: 'beacon', name: f.name, count: this.count(), shown: near.length });
  }
}
