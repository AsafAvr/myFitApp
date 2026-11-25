import { World } from '../../world/world.js';
import { createDungeonGen } from '../../world/dungeon.js';
import { biomeById } from '../../world/biomes.js';
import type { Game } from '../game';
import type { Monster } from '../types';
import type { Env } from '../environment';
import type { ZoneRef } from '../state/character';
import { MONSTERS } from '../content/monsters';
import { Rng } from '../../engine/rng';
import { levelAt } from '../rules/stats';
import { keyName, padName } from '../../engine/bindings';

interface Interactable { x: number; z: number; r: number; label: string; act: () => void; priority?: number }
interface DungeonState {
  ref: Extract<ZoneRef, { kind: 'dungeon' }>;
  world: World;
  gen: ReturnType<typeof createDungeonGen>;
  total: number;
  killed: number;
  boss: Monster | null;
  cleared: boolean;
}
type Site = { kind: string; key: string; x: number; z: number; name: string; delve?: string; door?: { x: number; z: number }; biome?: string };

const NEAR = 2.8;

export class Zones {
  private readonly game: Game;
  private d: DungeonState | null = null;
  private trip: { t: number; moved: boolean; go: () => void } | null = null;
  private promptTimer = 0;
  private prompt: Interactable | null = null;
  private heading: Interactable | null = null;
  private cache = new Map<string, World>();
  private outsideView: [number, number] | null = null;

  constructor(game: Game) { this.game = game; }

  reset(): void {
    this.d = null; this.trip = null; this.prompt = null; this.heading = null;
    this.game.bus.emit('interact:prompt', null);
  }

  get dungeonName(): string | null { return this.d?.ref.name ?? null; }
  get progress(): { killed: number; total: number; cleared: boolean; bossAlive: boolean } | null {
    const d = this.d;
    return d ? { killed: d.killed, total: d.total, cleared: d.cleared, bossAlive: !!d.boss && !d.boss.dead } : null;
  }

  goal(): { x: number; z: number } | null {
    const d = this.d;
    if (!d) return null;
    if (d.boss && !d.boss.dead) return { x: d.boss.x, z: d.boss.z };
    return d.gen.entrance ? { x: d.gen.entrance.x, z: d.gen.entrance.z } : null;
  }

  private interactables(): Interactable[] {
    const g = this.game, p = g.player, out: Interactable[] = [];
    if (!this.d) {
      for (const s of g.world.sites.inRange(p.x, p.z, 40) as Site[]) {
        if (s.kind !== 'dungeon' || !s.door) continue;
        const cleared = !!p.char.journey.dungeons[s.key];
        out.push({ x: s.door.x, z: s.door.z, r: NEAR, label: `Enter ${s.name}${cleared ? ' (cleared)' : ''}`, act: () => this.enter(s) });
      }
      return out;
    }
    const d = this.d, gen = d.gen;
    if (gen.entrance) out.push({ x: gen.entrance.x, z: gen.entrance.z, r: NEAR + 0.6, label: `Leave ${d.ref.name}`, act: () => this.leaveWithFade() });
    if (gen.hoard && !gen.opened.has(gen.hoardKey)) out.push({ x: gen.hoard.x, z: gen.hoard.z, r: NEAR, label: 'Open the hoard', act: () => this.openHoard() });
    if (d.cleared) out.push({ x: p.x, z: p.z, r: 1e9, label: `Leave ${d.ref.name}`, act: () => this.leaveWithFade(), priority: -1 });
    return out;
  }

  private nearest(): Interactable | null {
    const p = this.game.player;
    let best: Interactable | null = null, bd = 1e9;
    for (const it of this.interactables()) {
      const d = Math.hypot(it.x - p.x, it.z - p.z) - (it.priority ?? 0) * 1e6;
      if (Math.hypot(it.x - p.x, it.z - p.z) <= it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  interact(): boolean {
    if (this.trip || this.game.player.dead) return false;
    const it = this.nearest();
    if (!it) return false;
    it.act();
    return true;
  }

  clickInteract(ray: { origin: number[]; dir: number[] }): boolean {
    const g = this.game;
    const hit = g.world.raycast(ray.origin, ray.dir);
    if (!hit) return false;
    for (const it of this.interactables()) {
      if (it.r > 100) continue;
      if (Math.hypot(hit.x - it.x, hit.z - it.z) < 2.4) {
        this.heading = it;
        const p = g.player;
        p.moveTo = { x: it.x, z: it.z }; p.pursue = false; p.target = null; p.queued = null;
        return true;
      }
    }
    return false;
  }

  update(dt: number): void {
    const g = this.game, p = g.player;
    if (this.trip) {
      const t = this.trip;
      t.t += dt;
      if (!t.moved && t.t > 0.55) { t.moved = true; t.go(); g.look.fadeGoal = 1; }
      if (t.t > 1.3) this.trip = null;
      return;
    }
    if (g.paused) return;
    if (this.heading && Math.hypot(this.heading.x - p.x, this.heading.z - p.z) <= this.heading.r) {
      const it = this.heading; this.heading = null; it.act();
    } else if (this.heading && !p.moveTo) this.heading = null;
    if ((this.promptTimer -= dt) <= 0) {
      this.promptTimer = 0.12;
      const it = p.dead ? null : this.nearest();
      if (it !== this.prompt && (it?.label !== this.prompt?.label)) {
        this.prompt = it;
        const s = g.settings;
        const key = g.input.lastDevice === 'pad' ? padName(s.pad.interact) : g.touch ? 'Tap' : keyName(s.keys.interact[0]);
        g.bus.emit('interact:prompt', it ? { text: it.label, key } : null);
      }
    }
    const d = this.d;
    if (d && d.boss && d.boss.gone && !d.cleared && !d.boss.dead) d.boss = null;
  }

  dressEnv(env: Env): void {
    if (!this.d) return;
    env.night = 0.62; env.gold = 0; env.cloud = 0.6;
    env.keyDir = [0.12, 0.98, 0.16]; env.sunDir = [0.12, 0.98, 0.16]; env.moonDir = [0.12, 0.98, 0.16];
  }

  private fade(go: () => void): void {
    this.trip = { t: 0, moved: false, go };
    this.game.look.fadeGoal = 0;
  }

  enter(site: Site): void {
    const g = this.game, p = g.player;
    if (p.calm < 1.5 && g.monsters.some((m) => !m.dead && m.ai.state === 'chase')) { g.bus.emit('log', { text: 'Not with creatures on your heels.' }); g.bus.emit('deny'); return; }
    const level = Math.max(1, levelAt(Math.hypot(site.x, site.z)) + 1);
    const ref: Extract<ZoneRef, { kind: 'dungeon' }> = {
      kind: 'dungeon', key: site.key, name: site.name, theme: site.delve ?? 'crypt', level, seed: Rng.hash(site.key, g.seed), x: site.x, z: site.z,
    };
    g.bus.emit('travel', { name: site.name });
    this.fade(() => this.build(ref, site.biome ?? g.overworld.biome(site.x, site.z).id));
  }

  private build(ref: Extract<ZoneRef, { kind: 'dungeon' }>, biomeId: string): void {
    const g = this.game, p = g.player;
    let world = this.cache.get(ref.key);
    if (!world) {
      const gen = createDungeonGen({ seed: ref.seed, theme: ref.theme });
      world = new World(ref.seed, gen);
      if (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(ref.key, world);
    }
    const gen = world.gen as unknown as ReturnType<typeof createDungeonGen>;
    this.clearStage();
    g.useWorld(world);
    p.char.zone = ref;
    const start = gen.entrance ?? gen.rooms[0];
    p.x = start.x + 2.2; p.z = start.z + 2.2; p.y = world.surface(p.x, p.z);
    g.camera.target = [p.x, p.y + 1, p.z];
    this.outsideView = [g.camera.goal.pitch, g.camera.goal.distance];
    g.camera.goal.pitch = Math.max(g.camera.goal.pitch, 1.02);
    g.camera.goal.distance = Math.min(g.camera.goal.distance, 15);
    g.fillWorld();
    this.d = { ref, world, gen, total: 0, killed: 0, boss: null, cleared: false };
    this.stock(this.d, biomeId);
    g.bus.emit('zone:enter', { zone: ref, name: ref.name });
    g.bus.emit('travel:arrive', { x: p.x, y: p.y, z: p.z, name: ref.name });
    g.save();
  }

  private stock(d: DungeonState, biomeId: string): void {
    const g = this.game, rng = new Rng(d.ref.seed ^ 0x5bd1e995);
    const table: [string, number][] = (biomeById(biomeId)?.monsters ?? [['sproutling', 1]]).filter(([id]: [string, number]) => MONSTERS[id]);
    const lvl = d.ref.level;
    const sp = g.spawner;
    let elites = 1 + (lvl >= 12 ? 1 : 0);
    for (const room of d.gen.rooms) {
      if (room.kind === 'entrance') continue;
      const place = (): [number, number] => {
        for (let k = 0; k < 20; k++) {
          const x = room.x0 + 1.5 + rng.next() * (room.x1 - room.x0 - 3), z = room.z0 + 1.5 + rng.next() * (room.z1 - room.z0 - 3);
          if (d.gen.open(x, z)) return [x, z];
        }
        return [room.x, room.z];
      };
      if (room.kind === 'boss') {
        const strongest = [...table].sort((a, b) => MONSTERS[b[0]].hp - MONSTERS[a[0]].hp)[0][0];
        d.boss = sp.spawnMonster(strongest, room.x, room.z, lvl, { rank: 'boss', affixes: sp.rollAffixes(lvl, 1, true), resident: true });
        for (let k = 0; k < 2; k++) { const [x, z] = place(); this.resident(sp.spawnMonster(rng.weighted(table), x, z, lvl, { resident: true })); }
        d.total += 3;
        continue;
      }
      const n = Math.max(2, Math.min(7, Math.round(room.tiles * 0.32)));
      const lead = elites > 0 && room.kind === 'hall' && rng.chance(0.5);
      if (lead) elites--;
      for (let k = 0; k < n; k++) {
        const [x, z] = place();
        const m = sp.spawnMonster(rng.weighted(table), x, z, lvl, k === 0 && lead ? { rank: 'elite', affixes: sp.rollAffixes(lvl), resident: true } : { resident: true });
        this.resident(m);
      }
      d.total += n;
    }
  }

  private resident(m: Monster): void { m.resident = true; }

  onKill(m: Monster): void {
    const d = this.d, g = this.game;
    if (!d || !m.resident) return;
    d.killed++;
    if (m === d.boss && !d.cleared) {
      d.cleared = true;
      const j = g.player.char.journey;
      const first = !j.dungeons[d.ref.key];
      j.dungeons[d.ref.key] = { cleared: (j.dungeons[d.ref.key]?.cleared ?? 0) + 1 };
      if (first) { g.player.char.tally.dungeons++; g.combat.grantXp(Math.round(60 + d.ref.level * 30)); }
      g.bounties.progress();
      g.bus.emit('dungeon:cleared', { name: d.ref.name, first });
    }
  }

  private openHoard(): void {
    const d = this.d, g = this.game;
    if (!d || !d.gen.hoard || d.gen.opened.has(d.gen.hoardKey)) return;
    d.gen.opened.add(d.gen.hoardKey);
    const [cx, cz] = d.world.refreshAt(d.gen.hoard.x, d.gen.hoard.z);
    g.renderer.worldTex.refresh(cx, cz);
    g.loot.chest(d.gen.hoard.x, d.gen.hoard.z + 1.2, d.ref.level, 'chest');
    g.bus.emit('found', { kind: 'cache', name: 'The hoard', count: g.discover.count(), x: d.gen.hoard.x, y: d.world.surface(d.gen.hoard.x, d.gen.hoard.z), z: d.gen.hoard.z });
  }

  private leaveWithFade(): void {
    this.game.bus.emit('travel', { name: 'the open air' });
    this.fade(() => this.leave(false));
  }

  leave(_instant: boolean): void {
    const g = this.game, p = g.player, d = this.d;
    if (!d) return;
    this.clearStage();
    this.d = null;
    g.useWorld(g.overworld);
    p.char.zone = { kind: 'overworld' };
    p.x = d.ref.x + 1.5; p.z = d.ref.z + 4.2; p.y = g.world.surface(p.x, p.z);
    g.camera.target = [p.x, p.y + 1, p.z];
    if (this.outsideView) { [g.camera.goal.pitch, g.camera.goal.distance] = this.outsideView; this.outsideView = null; }
    g.spawner.reset();
    g.fillWorld();
    g.bus.emit('zone:enter', { zone: p.char.zone, name: g.world.biome(p.x, p.z).name });
    g.bus.emit('interact:prompt', null);
  }

  private clearStage(): void {
    const g = this.game, p = g.player;
    g.entities.clear((e) => e === p);
    g.monsters = [];
    g.loot.reset();
    g.skills.reset();
    g.hazards.clear();
    g.fx.clear();
    p.target = null; p.pursue = false; p.moveTo = null; p.dash = null; p.cast = null; p.queued = null;
    this.prompt = null; this.heading = null;
  }
}
