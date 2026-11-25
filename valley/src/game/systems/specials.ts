import type { Game } from '../game';
import type { Monster } from '../types';
import type { SpecialDef } from '../content/monsters';
import { DIFFICULTY } from '../content/monsters';
import { yawFromDir } from '../entities';

type Move = { dx: number; dz: number; done: boolean };
interface Special<S> {
  begin(g: Game, m: Monster, sp: SpecialDef): S;
  update(g: Game, m: Monster, sp: SpecialDef, s: S, dt: number): Move;
}

const reach = (m: Monster) => (m.boss ? 1.4 : m.elite ? 1.25 : 1);
const windup = (g: Game, m: Monster, t: number) => t * (m.elite ? 0.85 : 1) * g.settings.telegraphScale * DIFFICULTY[g.player.char.difficulty].telegraph;
const still: Move = { dx: 0, dz: 0, done: false };
const finished: Move = { dx: 0, dz: 0, done: true };
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
const pose = (m: Monster, t: number) => { m.action = 1; m.actionDur = 1e3; m.actionT = t; };
const rest = (m: Monster) => { m.action = 0; };
const face = (m: Monster, x: number, z: number) => { m.yaw = yawFromDir(x - m.x, z - m.z); };
const warn = (g: Game, x: number, z: number, r: number, t: number) => g.bus.emit('telegraph', { x, y: g.world.surface(x, z), z, r, t, fill: true });

interface LeapState { phase: number; t: number; wind: number; r: number; vx: number; vz: number }
interface ChargeState { phase: number; t: number; wind: number; dirx: number; dirz: number; left: number; lx: number; lz: number; stuck: number; dust?: number }
interface TimedState { t: number; wind: number; r: number; done: boolean }
interface GuardState { t: number; warned: boolean; r: number; snapped: boolean }

export const SPECIALS: Record<SpecialDef['kind'], Special<any>> = {
  leap: {
    begin(g, m, sp): LeapState {
      const p = g.player, r = num(sp.r) * reach(m), wind = windup(g, m, sp.windup), air = num(sp.air, 0.42);
      face(m, p.x, p.z);
      warn(g, p.x, p.z, r, wind + air);
      return { phase: 0, t: 0, wind, r, vx: (p.x - m.x) / air, vz: (p.z - m.z) / air };
    },
    update(g, m, sp, s: LeapState, dt) {
      s.t += dt;
      const air = num(sp.air, 0.42);
      if (s.phase === 0) {
        pose(m, 0.18 * Math.min(1, s.t / s.wind));
        if (s.t >= s.wind) { s.phase = 1; s.t = 0; }
        return still;
      }
      if (s.phase === 1) {
        const k = Math.min(1, s.t / air);
        m.lift = Math.sin(k * Math.PI) * 1.5;
        pose(m, 0.3 + 0.2 * k);
        if (k < 1) return { dx: s.vx, dz: s.vz, done: false };
        m.lift = 0;
        g.bus.emit('slam', { x: m.x, y: m.y, z: m.z, r: s.r });
        if (Math.hypot(g.player.x - m.x, g.player.z - m.z) < s.r + 0.2) g.combat.hurtHero(m, sp.mult, false, sp.element);
        else g.bus.emit('miss', { target: g.player, text: 'Dodged' });
        s.phase = 2; s.t = 0;
        return still;
      }
      pose(m, 0.5 + 0.5 * Math.min(1, s.t / 0.35));
      if (s.t < 0.35) return still;
      rest(m);
      return finished;
    },
  },

  charge: {
    begin(g, m, sp): ChargeState {
      const p = g.player, d = Math.hypot(p.x - m.x, p.z - m.z) || 1;
      const dirx = (p.x - m.x) / d, dirz = (p.z - m.z) / d, len = num(sp.dist, 11) * reach(m), w = m.radius * 2 + 0.7, wind = windup(g, m, sp.windup);
      face(m, p.x, p.z);
      g.bus.emit('telegraph', { lane: true, x: m.x + dirx * len / 2, y: m.y, z: m.z + dirz * len / 2, dirx, dirz, len, w, t: wind });
      return { phase: 0, t: 0, wind, dirx, dirz, left: len, lx: m.x, lz: m.z, stuck: 0 };
    },
    update(g, m, sp, s: ChargeState, dt) {
      const p = g.player, speed = num(sp.speed, 13);
      s.t += dt;
      if (s.phase === 0) {
        pose(m, 0.16 * Math.min(1, s.t / s.wind));
        if (s.t >= s.wind) { s.phase = 1; s.t = 0; s.lx = m.x; s.lz = m.z; }
        return still;
      }
      if (s.phase === 1) {
        pose(m, 0.5);
        const went = Math.hypot(m.x - s.lx, m.z - s.lz);
        if (s.t > dt * 1.5 && went < speed * dt * 0.35) s.stuck += dt; else s.stuck = 0;
        s.lx = m.x; s.lz = m.z;
        s.left -= speed * dt;
        const hit = !p.dead && Math.hypot(p.x - m.x, p.z - m.z) < m.radius + p.radius + 0.3;
        if (hit) { g.combat.hurtHero(m, sp.mult, false, sp.element); s.phase = 2; s.t = 0; return still; }
        if (s.left <= 0 || s.stuck > 0.08) {
          g.bus.emit('miss', { target: m, text: 'Winded' });
          m.ai.stun = num(sp.winded, 1.4);
          rest(m);
          return finished;
        }
        if ((s.dust = (s.dust ?? 0) - dt) <= 0) { s.dust = 0.07; g.bus.emit('charge:dust', { x: m.x, y: m.y, z: m.z }); }
        return { dx: s.dirx * speed, dz: s.dirz * speed, done: false };
      }
      pose(m, 0.5 + 0.5 * Math.min(1, s.t / 0.4));
      if (s.t < 0.4) return still;
      rest(m);
      return finished;
    },
  },

  cloud: {
    begin(g, m, sp): TimedState {
      const r = num(sp.r) * reach(m), wind = windup(g, m, sp.windup);
      warn(g, m.x, m.z, r, wind);
      return { t: 0, wind, r, done: false };
    },
    update(g, m, sp, s: TimedState, dt) {
      s.t += dt;
      if (!s.done) {
        pose(m, 0.45 * Math.min(1, s.t / s.wind));
        if (s.t >= s.wind) { s.done = true; s.t = 0; g.hazards.cloud(m, s.r, num(sp.life, 4), sp.mult, num(sp.tick, 0.55), sp.element ?? 'poison'); }
        return still;
      }
      pose(m, 0.5 + 0.5 * Math.min(1, s.t / 0.4));
      if (s.t < 0.4) return still;
      rest(m);
      return finished;
    },
  },

  shot: {
    begin(g, m, sp): TimedState {
      const wind = windup(g, m, sp.windup);
      face(m, g.player.x, g.player.z);
      g.bus.emit('telegraph', { x: m.x, y: m.y + 0.05, z: m.z, r: 0.9, t: wind });
      return { t: 0, wind, r: 0, done: false };
    },
    update(g, m, sp, s: TimedState, dt) {
      const p = g.player;
      s.t += dt;
      if (!s.done) {
        face(m, p.x, p.z);
        pose(m, 0.4 * Math.min(1, s.t / s.wind));
        if (s.t >= s.wind) {
          s.done = true; s.t = 0;
          const d = Math.hypot(p.x - m.x, p.z - m.z) || 1;
          g.hazards.shot(m, (p.x - m.x) / d, (p.z - m.z) / d, sp);
          if (m.boss) for (const turn of [-0.3, 0.3]) {
            const dx = (p.x - m.x) / d, dz = (p.z - m.z) / d, c = Math.cos(turn), sn = Math.sin(turn);
            g.hazards.shot(m, dx * c - dz * sn, dz * c + dx * sn, sp);
          }
        }
        return still;
      }
      pose(m, 0.5 + 0.5 * Math.min(1, s.t / 0.3));
      if (s.t < 0.3) return still;
      rest(m);
      return finished;
    },
  },

  slam: {
    begin(g, m, sp): TimedState {
      const r = num(sp.r) * reach(m), wind = windup(g, m, sp.windup);
      warn(g, m.x, m.z, r, wind);
      return { t: 0, wind, r, done: false };
    },
    update(g, m, sp, s: TimedState, dt) {
      const p = g.player, recover = num(sp.recover, 1);
      s.t += dt;
      if (!s.done) {
        pose(m, 0.4 * Math.min(1, s.t / s.wind));
        if (s.t >= s.wind) {
          s.done = true; s.t = 0;
          g.bus.emit('slam', { x: m.x, y: m.y, z: m.z, r: s.r, heavy: true });
          if (!p.dead && Math.hypot(p.x - m.x, p.z - m.z) < s.r) g.combat.hurtHero(m, sp.mult, false, sp.element);
          else if (!p.dead && Math.hypot(p.x - m.x, p.z - m.z) < s.r + 3) g.bus.emit('miss', { target: p, text: 'Dodged' });
        }
        return still;
      }
      pose(m, Math.min(1, 0.45 + 0.55 * s.t / recover));
      if (s.t < recover) return still;
      rest(m);
      return finished;
    },
  },

  guard: {
    begin(g, m, sp): GuardState {
      m.guard = true;
      const hold = num(sp.hold, 1.5) * g.settings.telegraphScale;
      g.bus.emit('miss', { target: m, text: 'Guarding' });
      g.bus.emit('guard', { entity: m, t: hold });
      return { t: 0, warned: false, r: num(sp.r) * reach(m), snapped: false };
    },
    update(g, m, sp, s: GuardState, dt) {
      const p = g.player, hold = num(sp.hold, 1.5) * g.settings.telegraphScale, wind = windup(g, m, sp.windup);
      s.t += dt;
      if (!s.snapped) {
        m.action = 3; m.actionDur = 1e3; m.actionT = 0.2;
        if (!s.warned && s.t >= hold - wind) { s.warned = true; warn(g, m.x, m.z, s.r, wind); }
        if (s.t >= hold) {
          s.snapped = true; s.t = 0; m.guard = false;
          g.bus.emit('slam', { x: m.x, y: m.y, z: m.z, r: s.r });
          if (!p.dead && Math.hypot(p.x - m.x, p.z - m.z) < s.r) g.combat.hurtHero(m, sp.mult, false, sp.element);
        }
        return still;
      }
      pose(m, 0.5 + 0.5 * Math.min(1, s.t / 0.45));
      if (s.t < 0.45) return still;
      rest(m);
      return finished;
    },
  },
};
