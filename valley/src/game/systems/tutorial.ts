import type { Game } from '../game';
import type { AnyEntity, Monster } from '../types';
import { pointsEarned, pointsSpent } from '../rules/tree';

const STEPS = ['walk', 'look', 'fight', 'skill', 'bounty'] as const;
type Step = typeof STEPS[number];
const TIPS: Record<string, { seconds: number; when: (g: Game) => boolean }> = {
  dodge: { seconds: 9, when: (g) => g.hazards.warned },
  tonic: { seconds: 12, when: (g) => !g.player.dead && g.player.hp < g.player.maxHp * 0.45 && g.player.char.potions > 0 },
  points: { seconds: 12, when: (g) => pointsEarned(g.player.char.level, g.player.char.bonusPoints) > pointsSpent(g.player.char.tree) },
  loot: { seconds: 10, when: (g) => g.player.char.bag.some((i) => i && i.rarity !== 'common') },
};

interface Spot { x: number; y: number; z: number }

export class Tutorial {
  private readonly game: Game;
  private i = -1;
  private goal: Spot | AnyEntity | null = null;
  private mobs: Monster[] = [];
  private t = 0;
  private from: { yaw: number; pitch: number; distance: number } | null = null;
  private tip: { id: string; left: number } | null = null;
  private pulse = 0;

  constructor(game: Game) {
    this.game = game;
    const bus = game.bus;
    bus.on('begin', () => this.begin());
    bus.on('guide:skip', (d) => this.finish(true, !!(d && d.quiet)));
    bus.on('guide:restart', () => { this.clear(); this.go(0); });
    bus.on('skill', (d) => { if (this.step === 'skill' && d.id === game.player.char.bar[1]) this.next(); });
    bus.on('bounty:changed', () => { if (this.step === 'bounty' && game.player.char.journey.bounty) this.next(); });
    bus.on('drink', () => { if (this.tip?.id === 'tonic') this.endTip(); });
    bus.on('ui:toggle', (id) => { if ((this.tip?.id === 'points' && id === 'skills') || (this.tip?.id === 'loot' && id === 'inventory')) this.endTip(); });
  }

  reset(): void { this.clear(); }

  get step(): Step | null { return this.i >= 0 ? STEPS[this.i] : null; }

  private begin(): void {
    const c = this.game.player.char, j = c.journey;
    if (j.guide === 'done') return;
    if (c.level > 1 || c.xp > 0 || j.bounty) { j.guide = 'done'; return; }
    this.go(0);
  }

  private go(i: number): void {
    const g = this.game, p = g.player;
    this.i = i; this.t = 0; this.goal = null;
    this.endTip();
    const step = this.step;
    if (step === 'walk') this.goal = this.freeSpot(6.5, 0.6);
    else if (step === 'look') this.from = { ...g.camera.goal };
    else if (step === 'fight') this.goal = this.practice(4.2, 0.9)[0];
    else if (step === 'skill') {
      this.mobs = this.mobs.filter((m) => !m.dead && !m.gone);
      const pack = this.practice(3.6, 0.8, 3 - Math.min(2, this.mobs.length));
      this.goal = pack[0] || this.mobs[0] || null;
    } else if (step === 'bounty') {
      if (p.char.journey.bounty) return this.next();
      this.goal = g.entities.nearest('npc', p.x, p.z, 80, (e) => e.role === 'warden');
      if (!this.goal) return this.next();
    }
    this.announce();
  }

  private next(): void {
    this.game.bus.emit('guide:step', { id: this.step });
    if (this.i + 1 < STEPS.length) this.go(this.i + 1); else this.finish(false);
  }

  private finish(skipped: boolean, quiet = false): void {
    const j = this.game.player.char.journey;
    if (this.i < 0 && j.guide === 'done') return;
    this.clear();
    j.guide = 'done';
    this.game.bus.emit('guide', null);
    this.game.bus.emit('guide:done', { skipped, quiet });
  }

  private clear(): void {
    for (const m of this.mobs) if (!m.dead) m.gone = true;
    this.mobs = [];
    this.i = -1; this.goal = null;
    this.endTip();
  }

  private announce(): void {
    const goal = this.goal;
    const isEntity = !!goal && 'kind' in goal;
    this.game.bus.emit('guide', {
      id: this.step!, index: this.i, total: STEPS.length,
      at: goal && !isEntity ? goal as Spot : null,
      entity: isEntity ? goal as AnyEntity : null,
    });
  }

  private freeSpot(dist: number, room: number): Spot {
    const g = this.game, p = g.player, w = g.world;
    const f = g.camera.fwd;
    const toward = Math.atan2(f[2], f[0]);
    for (let k = 0; k < 16; k++) {
      const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.39;
      const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
      if (!w.walkable(x, z) || w.waterDepth(x, z) > 0.05) continue;
      let clear = true;
      w.forEachProp(x, z, room, (pr: { def: { collide: number }; x: number; z: number; scale: number }) => { if (pr.def.collide > 0 && Math.hypot(pr.x - x, pr.z - z) < pr.def.collide * pr.scale + room) clear = false; });
      for (const e of g.entities.list) if (e !== p && !e.dead && Math.hypot(e.x - x, e.z - z) < room + e.radius) clear = false;
      if (clear) return { x, y: w.surface(x, z), z };
    }
    return { x: p.x + dist, y: w.surface(p.x + dist, p.z), z: p.z };
  }

  private practice(dist: number, room: number, n = 1): Monster[] {
    const g = this.game, made: Monster[] = [];
    const first = this.freeSpot(dist, room);
    for (let k = 0; k < n; k++) {
      const m = g.spawner.spawnMonster('sproutling', first.x + (k % 2 ? 0.9 : -0.9) * Math.ceil(k / 2), first.z + (k ? 0.7 : 0), 1);
      m.marked = true; m.practice = true;
      this.mobs.push(m); made.push(m);
    }
    return made;
  }

  private endTip(): void {
    if (!this.tip) return;
    this.tip = null;
    if (this.i < 0) this.game.bus.emit('guide', null);
  }

  update(dt: number): void {
    const g = this.game, p = g.player, j = p.char.journey;
    if (g.paused) return;
    const step = this.step;
    if (step) {
      this.t += dt;
      const goal = this.goal as (Spot & { dead?: boolean; gone?: boolean }) | null;
      if (step === 'walk' && goal) {
        if ((this.pulse -= dt) <= 0) { this.pulse = 0.8; g.fx.click(goal.x, goal.y, goal.z); }
        if (Math.hypot(p.x - goal.x, p.z - goal.z) < 1.3) this.next();
      } else if (step === 'look' && this.from) {
        const c = g.camera.goal, f = this.from;
        if (Math.abs(c.yaw - f.yaw) > 0.45 || Math.abs(c.pitch - f.pitch) > 0.18 || Math.abs(c.distance / f.distance - 1) > 0.14) this.next();
      } else if (step === 'fight') {
        if (!goal || goal.dead || goal.gone) this.next();
      } else if (step === 'skill') {
        if (!goal || goal.dead || goal.gone) {
          this.goal = this.mobs.find((m) => !m.dead && !m.gone) || null;
          if (!this.goal) this.goal = this.practice(3.6, 0.8, 2)[0];
          this.announce();
        }
      } else if (step === 'bounty') {
        if (j.bounty) this.next();
      }
      return;
    }
    if (j.guide !== 'done') return;
    if (this.tip) {
      this.tip.left -= dt;
      if (this.tip.left <= 0 || !TIPS[this.tip.id].when(g)) this.endTip();
      return;
    }
    for (const id in TIPS) {
      if (j.tips[id] || !TIPS[id].when(g)) continue;
      j.tips[id] = 1;
      this.tip = { id, left: TIPS[id].seconds };
      g.bus.emit('guide', { id: 'tip:' + id, tip: true });
      break;
    }
  }
}
