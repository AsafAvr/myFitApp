import type { Game } from '../game';
import type { Element, Monster } from '../types';
import type { SpecialDef } from '../content/monsters';
import type { Particle } from '../fx';
import { FX_COLORS } from '../fx';

interface Cloud { kind: 'cloud'; src: Monster; x: number; z: number; r: number; left: number; mult: number; tick: number; next: number; element: Element }
interface Shot { kind: 'shot'; src: Monster; x: number; y: number; z: number; vx: number; vz: number; r: number; left: number; mult: number; orb: Particle | null; element: Element }
type Hazard = Cloud | Shot;

export class Hazards {
  private readonly game: Game;
  private list: Hazard[] = [];
  warned = false;

  constructor(game: Game) {
    this.game = game;
    game.bus.on('telegraph', (d) => {
      const p = game.player;
      if (Math.hypot(d.x - p.x, d.z - p.z) < (d.len ?? d.r ?? 0) + 6) this.warned = true;
    });
  }

  reset(): void { this.clear(); }

  cloud(m: Monster, r: number, life: number, mult: number, tick: number, element: Element = 'poison'): void {
    const g = this.game, y = g.world.surface(m.x, m.z);
    g.bus.emit('hazard:cloud', { x: m.x, y, z: m.z, r, life, color: element === 'fire' ? FX_COLORS.FLAME : g.fx.danger });
    this.list.push({ kind: 'cloud', src: m, x: m.x, z: m.z, r, left: life, mult, tick, next: tick * 0.5, element });
  }

  patch(m: Monster, r: number, life: number, mult: number, element: Element): void {
    this.cloud(m, r, life, mult, 0.5, element);
  }

  shot(m: Monster, dirx: number, dirz: number, sp: SpecialDef): void {
    const g = this.game, y = m.y + 0.9;
    const orb = g.fx.spawn('orb', m.x + dirx * 0.5, y, m.z + dirz * 0.5, { size: 0.5, color: [m.colors[2][0], m.colors[2][1], m.colors[2][2]], hold: true });
    const speed = (sp.speed as number) ?? 8.5;
    this.list.push({ kind: 'shot', src: m, x: m.x + dirx * 0.5, y, z: m.z + dirz * 0.5, vx: dirx * speed, vz: dirz * speed, r: (sp.r as number) ?? 0.4, left: (sp.life as number) ?? 1.7, mult: sp.mult, orb, element: sp.element ?? 'physical' });
    g.bus.emit('monster:shot', m);
  }

  clear(): void {
    for (const h of this.list) if (h.kind === 'shot') this.game.fx.release(h.orb);
    this.list.length = 0;
  }

  update(dt: number): void {
    const g = this.game, p = g.player;
    let w = 0;
    for (const h of this.list) {
      h.left -= dt;
      let done = h.left <= 0;
      if (h.kind === 'cloud') {
        h.next -= dt;
        if (h.next <= 0) {
          h.next = h.tick;
          if (!p.dead && Math.hypot(p.x - h.x, p.z - h.z) < h.r) g.combat.hurtHero(h.src, h.mult, true, h.element);
        }
      } else {
        h.x += h.vx * dt; h.z += h.vz * dt;
        if (h.orb) { h.orb.x = h.x; h.orb.y = h.y; h.orb.z = h.z; }
        g.fx.light(h.x, h.y, h.z, 4, 0.05);
        if (g.world.surface(h.x, h.z) > h.y - 0.1) done = true;
        if (!done) g.world.forEachProp(h.x, h.z, 1, (pr: { def: { collide: number; height: number }; x: number; z: number; y: number; scale: number }) => {
          if (pr.def.collide > 0 && Math.hypot(pr.x - h.x, pr.z - h.z) < pr.def.collide * pr.scale + 0.15 && h.y < pr.y + pr.def.height * pr.scale) done = true;
        });
        if (!done && !p.dead && Math.hypot(p.x - h.x, p.z - h.z) < h.r + p.radius) { g.combat.hurtHero(h.src, h.mult, false, h.element); done = true; }
        if (done) { g.bus.emit('shot:hit', { x: h.x, y: h.y, z: h.z }); g.fx.release(h.orb); }
      }
      if (done) continue;
      this.list[w++] = h;
    }
    this.list.length = w;
  }
}
