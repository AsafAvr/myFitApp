import { GAME } from '../../config.js';
import type { Game } from '../game';
import type { Monster, MonsterRank, Npc, NpcRole } from '../types';
import { baseEntity, pencils } from '../entities';
import { ELITE_AFFIX_IDS, MONSTERS, RANK_SCALE, scaleMonster } from '../content/monsters';
import { levelAt } from '../rules/stats';
import { Combat } from './combat';

const NEAR = 26, FAR = 58, DESPAWN = 82;
const NIGHT_ELDERS = 0.08;

const NPC_LOOKS: Record<NpcRole, { extra: number; colors: [number, number, number][]; title: string }> = {
  alchemist: { extra: 1, colors: [[150, 178, 120], [222, 178, 110], [122, 62, 44]], title: 'Alchemist' },
  warden: { extra: 2, colors: [[84, 108, 156], [116, 156, 138], [150, 142, 132]], title: 'Warden' },
  smith: { extra: 1, colors: [[74, 77, 94], [176, 128, 84], [226, 188, 130]], title: 'Smith' },
  stash: { extra: 1, colors: [[176, 128, 84], [226, 188, 130], [74, 77, 94]], title: 'Stash-keeper' },
  tinker: { extra: 1, colors: [[176, 128, 84], [116, 156, 138], [150, 142, 132]], title: 'Tinker' },
  sage: { extra: 2, colors: [[136, 90, 120], [226, 176, 52], [232, 226, 212]], title: 'Sage' },
  keeper: { extra: 2, colors: [[96, 138, 84], [196, 160, 98], [232, 220, 196]], title: 'Keeper' },
};

export interface SpawnOptions { rank?: MonsterRank; affixes?: string[]; resident?: boolean; name?: string; hide?: [number, number, number] }

export class Spawner {
  private readonly game: Game;
  private timer = 0;
  private npcSites = new Set<string>();

  constructor(game: Game) { this.game = game; }

  reset(): void { this.timer = 0; this.npcSites.clear(); }

  update(dt: number): void {
    const g = this.game, p = g.player;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.35;

    if (g.world !== g.overworld) { g.monsters = g.monsters.filter((m) => !m.gone); return; }
    for (const m of g.monsters) {
      if (!m.dead && Math.hypot(m.x - p.x, m.z - p.z) > DESPAWN && m.ai.state !== 'chase') m.gone = true;
    }
    g.monsters = g.monsters.filter((m) => !m.gone);

    for (const site of g.world.sites.inRange(p.x, p.z, 140)) {
      if (site.den && !site.denStocked && Math.hypot(site.x - p.x, site.z - p.z) < 70) {
        site.denStocked = true;
        const id = g.world.biome(site.x, site.z).monsters[0][0];
        const level = Math.max(1, levelAt(Math.hypot(site.x, site.z)) + 1);
        this.spawnMonster(id, site.x + 2.5, site.z + 2.5, level, { rank: 'elite', affixes: this.rollAffixes(level, 1) });
      }
      if (this.npcSites.has(site.key)) continue;
      this.npcSites.add(site.key);
      for (const n of site.npcs ?? []) this.spawnNpc(n, site);
    }
    for (const site of g.world.sites.inRange(p.x, p.z, 400)) if (site.denStocked && Math.hypot(site.x - p.x, site.z - p.z) > 200) site.denStocked = false;

    if (g.monsters.length >= GAME.MAX_MONSTERS || g.paused) return;
    const a = g.rng.angle(), r = NEAR + g.rng.next() * (FAR - NEAR);
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (!this.clear(x, z)) return;
    const table: [string, number][] = g.world.biome(x, z).monsters;
    const id = g.rng.weighted(table);
    const pack = 1 + Math.floor(g.rng.next() * (id === 'cragling' ? 1.5 : 3.2));
    const level = Math.max(1, levelAt(Math.hypot(x, z)) + (g.rng.chance(0.3) ? 1 : 0));
    const eliteChance = 0.05 + NIGHT_ELDERS * g.stakes.night() + (p.char.difficulty === 'veteran' ? 0.03 : p.char.difficulty === 'nightmare' ? 0.06 : 0);
    for (let i = 0; i < pack && g.monsters.length < GAME.MAX_MONSTERS; i++) {
      const ox = x + (g.rng.next() - 0.5) * 5, oz = z + (g.rng.next() - 0.5) * 5;
      if (!this.clear(ox, oz)) continue;
      const elite = i === 0 && level >= 2 && g.rng.chance(eliteChance);
      this.spawnMonster(id, ox, oz, level, elite ? { rank: 'elite', affixes: this.rollAffixes(level) } : {});
    }
  }

  rollAffixes(level: number, min = 1, boss = false): string[] {
    const n = Math.max(min, 1 + (level >= 15 ? 1 : 0) + (boss && level >= 30 ? 1 : 0));
    return this.game.rng.shuffle([...ELITE_AFFIX_IDS]).slice(0, n);
  }

  private clear(x: number, z: number): boolean {
    const w = this.game.world;
    if (!w.walkable(x, z) || w.waterDepth(x, z) > 0.1) return false;
    const site = w.sites.near(x, z);
    return !(site && site.safe && Math.hypot(x - site.x, z - site.z) < site.safe + 6);
  }

  spawnMonster(id: string, x: number, z: number, level: number, o: SpawnOptions = {}): Monster {
    const g = this.game, def = MONSTERS[id] ?? MONSTERS.sproutling, rank = o.rank ?? 'normal';
    const affixes = o.affixes ?? [];
    const s = scaleMonster(def, level, rank, g.player.char.difficulty);
    const aff = Combat.affixNumbers(affixes);
    const variant = g.world.biome(x, z).variant as { prefix: string; pencil: [number, number, number] } | undefined;
    const hide = o.hide ?? (variant ? variant.pencil : def.colors[0]);
    const kindName = variant ? `${variant.prefix} ${def.name}` : def.name;
    const size = RANK_SCALE[rank].size;
    const elite = rank !== 'normal';
    const deep = rank === 'boss' ? 0.65 : elite ? 0.45 : 0;
    const coat = hide.map((c, i) => c * (1 - deep) + [74, 77, 94][i] * deep) as [number, number, number];
    const name = o.name ?? (rank === 'boss' ? `${kindName}, the Inkbound` : elite ? `Elder ${kindName}` : kindName);
    const m: Monster = {
      ...baseEntity('monster', def.archetype),
      kind: 'monster',
      x, z, y: g.world.surface(x, z), yaw: g.rng.angle(),
      scale: def.scale * size * (0.94 + g.rng.next() * 0.12), grow: 0,
      radius: def.radius * (elite ? 1.4 : 1) * (rank === 'boss' ? 1.25 : 1), height: def.height * size,
      colors: pencils([coat, def.colors[1], def.colors[2]]),
      name, level, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, xp: s.xp, armor: s.armor,
      dr: 1 - aff.taken + (rank === 'boss' ? 0.1 : 0),
      statuses: [], barrier: affixes.includes('warded') ? s.maxHp * 0.3 : 0, invuln: 0,
      def, defId: def.id, rank, elite, affixes, boss: rank === 'boss', resident: o.resident, deathT: 0,
      ai: { state: 'idle', hx: x, hz: z, gx: x, gz: z, going: false, timer: g.rng.next() * 3, cd: 0, target: null, provoked: false, pushX: 0, pushZ: 0, struck: false, stun: 0 },
    };
    g.entities.add(m);
    g.monsters.push(m);
    if (m.boss) g.bus.emit('boss:spawn', m);
    return m;
  }

  summonAround(m: Monster, n: number): void {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const a = g.rng.angle(), x = m.x + Math.cos(a) * 3, z = m.z + Math.sin(a) * 3;
      if (!g.world.walkable(x, z)) continue;
      const s = this.spawnMonster(m.defId, x, z, Math.max(1, m.level - 1), { resident: m.resident });
      s.ai.provoked = true; s.ai.state = 'chase'; s.ai.target = g.player;
    }
  }

  spawnNpc(n: { id: string; name: string; role: NpcRole; x: number; z: number; habit?: string; title?: string }, site: { x: number; z: number; key: string }): Npc {
    const g = this.game, look = NPC_LOOKS[n.role] ?? NPC_LOOKS.warden;
    const npc: Npc = {
      ...baseEntity('npc', 'humanoid'),
      kind: 'npc',
      x: n.x, z: n.z, y: g.world.surface(n.x, n.z), yaw: Math.atan2(n.x - site.x, -(n.z - site.z)),
      radius: 0.45, height: 1.6, extra: look.extra, colors: pencils(look.colors),
      name: n.name, role: n.role, npcId: n.id, siteKey: site.key, title: n.title ?? look.title, habit: n.habit,
    };
    return g.entities.add(npc);
  }
}

