import { damp, dampAngle } from '../../core/math.js';
import type { Game } from '../game';
import type { Monster } from '../types';
import { yawFromDir } from '../entities';
import { SPECIALS } from './specials';
import { Combat } from './combat';
import { DIFFICULTY } from '../content/monsters';

const LEASH = 24, HIT_AT = 0.5;
const out = { x: 0, z: 0 };
const NIGHT_AGGRO = 0.45;

export class MonsterAI {
  private readonly game: Game;
  constructor(game: Game) { this.game = game; }

  update(dt: number): void {
    const g = this.game, p = g.player;
    const mons = g.monsters;
    const night = g.stakes.night();
    const leash = g.world === g.overworld ? LEASH : 60;
    const tele = g.settings.telegraphScale * DIFFICULTY[p.char.difficulty].telegraph;
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      m.flash = Math.max(0, m.flash - dt * 5);
      if (m.dead) {
        m.deathT += dt;
        m.grow = Math.max(0, 1 - m.deathT * 3.2);
        if (m.deathT > 0.4) m.gone = true;
        continue;
      }
      m.grow = Math.min(1, m.grow + dt * 3);
      const ai = m.ai, def = m.def, sp = def.special;
      const held = g.status.stopped(m);
      if (m.action && !held) {
        m.actionT += dt / m.actionDur;
        if (m.actionT >= 1) m.action = 0;
      }
      const aff = Combat.affixNumbers(m.affixes);
      const speed = def.speed * aff.speed * g.status.speedMul(m) * (ai.phase === 2 ? 1.25 : 1);
      ai.cd -= dt;
      ai.scd = (ai.scd ?? 1 + g.rng.next() * 2.5) - dt;
      let dx = 0, dz = 0;
      const toP = Math.hypot(p.x - m.x, p.z - m.z);
      const fromHome = Math.hypot(m.x - ai.hx, m.z - ai.hz);
      const fair = !p.dead && !p.safe;
      this.affixes(m, dt, toP);

      if (held) {
        if (ai.state === 'special' || ai.state === 'attack') { ai.state = 'chase'; ai.sp = undefined; m.guard = false; m.lift = 0; m.action = 0; }
      } else if (ai.stun > 0) {
        ai.stun -= dt;
      } else if (ai.state === 'idle') {
        ai.timer -= dt;
        if (ai.timer <= 0) {
          ai.timer = 2 + g.rng.next() * 5;
          if (g.rng.chance(0.7)) {
            const a = g.rng.angle(), r = 1.5 + g.rng.next() * 5;
            ai.gx = ai.hx + Math.cos(a) * r; ai.gz = ai.hz + Math.sin(a) * r; ai.going = true;
          }
        }
        if (ai.going) {
          const d = Math.hypot(ai.gx - m.x, ai.gz - m.z);
          if (d < 0.3) ai.going = false;
          else { dx = (ai.gx - m.x) / d * speed * 0.4; dz = (ai.gz - m.z) / d * speed * 0.4; }
        }
        const notice = def.aggro > 0 && toP < def.aggro * (m.elite ? 1.3 : 1) * (1 + NIGHT_AGGRO * night) * (m.resident ? 1.6 : 1);
        if (fair && (notice || ai.provoked)) { ai.state = 'chase'; ai.target = p; g.bus.emit('monster:alert', m); }
      } else if (ai.state === 'chase') {
        const reach = def.range + m.radius * 0.5;
        if (!fair || fromHome > leash) { ai.state = 'home'; ai.provoked = false; }
        else if (def.keep && toP < def.keep[1]) {
          const away = toP < def.keep[0] ? -0.75 : 0, side = (m.id % 2 ? 1 : -1) * 0.35;
          dx = ((p.x - m.x) * away - (p.z - m.z) * side) / toP * speed;
          dz = ((p.z - m.z) * away + (p.x - m.x) * side) / toP * speed;
        }
        else if (toP > reach * 0.9) { dx = (p.x - m.x) / toP * speed; dz = (p.z - m.z) / toP * speed; }
        if (sp && ai.state === 'chase' && ai.scd <= 0 && toP >= sp.min && toP <= sp.max && (!sp.below || m.hp < m.maxHp * (sp.below as number))) {
          ai.state = 'special';
          ai.sp = SPECIALS[sp.kind].begin(g, m, sp);
          g.bus.emit('monster:special', m);
        } else if (toP <= reach && ai.cd <= 0 && ai.state === 'chase') {
          ai.state = 'attack'; ai.struck = false;
          m.action = 1; m.actionT = 0; m.actionDur = def.attackTime * tele;
          g.bus.emit('telegraph', { x: m.x, y: m.y, z: m.z, r: def.range + m.radius + 0.4, t: def.attackTime * tele * HIT_AT });
        }
        m.yaw = dampAngle(m.yaw, yawFromDir(p.x - m.x, p.z - m.z), 9, dt);
      } else if (ai.state === 'attack') {
        if (!ai.struck && m.actionT >= HIT_AT) { ai.struck = true; g.combat.maul(m); g.bus.emit('monster:strike', m); }
        if (m.action !== 1) { ai.state = 'chase'; ai.cd = def.cooldown * aff.cd * (0.8 + g.rng.next() * 0.4); }
      } else if (ai.state === 'special' && sp) {
        const mv = SPECIALS[sp.kind].update(g, m, sp, ai.sp, dt);
        dx = mv.dx; dz = mv.dz;
        if (mv.done) {
          ai.state = 'chase'; ai.sp = undefined;
          ai.scd = sp.every * (m.boss ? 0.45 : m.elite ? 0.6 : 1) * (ai.phase === 2 ? 0.7 : 1) * (0.85 + g.rng.next() * 0.3);
          ai.cd = Math.max(ai.cd, 0.6);
        }
      } else if (ai.state === 'home') {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
        if (fromHome < 1.2) { ai.state = 'idle'; ai.timer = 1; }
        else { dx = (ai.hx - m.x) / fromHome * speed; dz = (ai.hz - m.z) / fromHome * speed; }
      }

      if (ai.pushX || ai.pushZ) {
        dx += ai.pushX; dz += ai.pushZ;
        const k = Math.exp(-9 * dt);
        ai.pushX *= k; ai.pushZ *= k;
        if (Math.abs(ai.pushX) + Math.abs(ai.pushZ) < 0.05) ai.pushX = ai.pushZ = 0;
      }
      for (let j = 0; j < mons.length; j++) {
        const o = mons[j];
        if (o === m || o.dead) continue;
        const ox = m.x - o.x, oz = m.z - o.z, d = Math.hypot(ox, oz), min = m.radius + o.radius;
        if (d < min && d > 1e-3) { dx += ox / d * (min - d) * 4; dz += oz / d * (min - d) * 4; }
      }
      const pd = m.radius + p.radius;
      if (toP < pd && toP > 1e-3 && !p.dead) { dx += (m.x - p.x) / toP * (pd - toP) * 6; dz += (m.z - p.z) / toP * (pd - toP) * 6; }

      const mx = m.x, mz = m.z;
      if (dx || dz) {
        g.world.moveCircle(m.x, m.z, dx * dt, dz * dt, m.radius, out);
        m.x = out.x; m.z = out.z;
      }
      const moved = Math.hypot(m.x - mx, m.z - mz);
      if (ai.state !== 'chase' && ai.state !== 'attack' && ai.state !== 'special' && moved > 1e-4 && !ai.pushX) m.yaw = dampAngle(m.yaw, yawFromDir(m.x - mx, m.z - mz), 8, dt);
      m.walk += moved * def.stride;
      m.move = damp(m.move, Math.min(1, moved / Math.max(dt, 1e-4) / (def.speed * 0.5)), 10, dt);
      if (!m.lift) m.y = damp(m.y, g.world.surface(m.x, m.z), 18, dt);
    }
  }

  private affixes(m: Monster, dt: number, toP: number): void {
    const g = this.game, ai = m.ai;
    if (m.affixes.length) {
      ai.affixT = (ai.affixT ?? 2) - dt;
      if (ai.affixT <= 0) {
        ai.affixT = 3.5;
        const fighting = ai.state === 'chase' || ai.state === 'attack' || ai.state === 'special';
        if (m.affixes.includes('blazing') && fighting && toP < 14) g.hazards.patch(m, 1.6, 4, 0.3, 'fire');
        if (m.affixes.includes('warded') && m.barrier <= 0 && m.calmT !== undefined && m.calmT > 6) m.barrier = m.maxHp * 0.3;
      }
      m.calmT = (m.calmT ?? 0) + dt;
    }
    if (m.boss && ai.phase !== 2 && m.hp < m.maxHp * 0.5) {
      ai.phase = 2;
      g.bus.emit('miss', { target: m, text: 'Enraged' });
      g.bus.emit('log', { text: `<em>${m.name}</em> calls for help!` });
      g.shake(0.6);
      g.spawner.summonAround(m, 3);
    }
  }
}
