import type { Monster } from '../types';
import type { BehaviorId } from '../content/skills';
import { ELEMENT_COLOR, FX_COLORS } from '../fx';
import { yawFromDir } from '../entities';
import type { Blast, CastCtx, Shot, Skills, Trap, Zone } from './skills';

export interface Behavior {
  instant?: boolean;
  fire(sk: Skills, ctx: CastCtx): void;
  onShotHit?(sk: Skills, shot: Shot, m: Monster): void;
  land?(sk: Skills, b: Blast): void;
  tick?(sk: Skills, z: Zone): void;
  spring?(sk: Skills, t: Trap): void;
}

const near = (sk: Skills, x: number, z: number, r: number): Monster[] =>
  sk.game.monsters.filter((m) => !m.dead && Math.hypot(m.x - x, m.z - z) < r + m.radius);

function meleeStrike(sk: Skills, ctx: CastCtx, mult: number): void {
  const g = sk.game, p = g.player, P = ctx.P, aim = ctx.aim;
  const reach = P.reach ?? 1.9, arc = P.arc ?? 0.3, targets = Math.max(1, Math.round(P.targets ?? 1));
  const victims: { m: Monster; d: number }[] = [];
  for (const m of g.monsters) {
    if (m.dead) continue;
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    if (d > reach + m.radius) continue;
    if (d > 0.6 && (dx * aim.dirX + dz * aim.dirZ) / d < arc) continue;
    victims.push({ m, d: m === aim.target ? -1 : d });
  }
  victims.sort((a, b) => a.d - b.d);
  for (const v of victims.slice(0, targets)) sk.hit(ctx, v.m, 'coef', mult);
}

export const BEHAVIORS: Record<BehaviorId, Behavior> = {
  melee: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const col = ctx.def.element === 'physical' ? (P.heavy ? FX_COLORS.GOLD : FX_COLORS.WHITE) : ELEMENT_COLOR[ctx.def.element];
      p.yaw = yawFromDir(ctx.aim.dirX, ctx.aim.dirZ);
      g.bus.emit('swing', { entity: p, radius: (P.reach ?? 1.9) * (P.arc !== undefined && P.arc < -0.5 ? 1.05 : 1), color: col, heavy: !!P.heavy });
      if (P.heavy) g.shake(0.3);
      const hits = Math.max(1, Math.round(P.hits ?? 1));
      meleeStrike(sk, ctx, 1);
      for (let i = 1; i < hits; i++) sk.later(0.09 * i, () => { g.bus.emit('swing', { entity: p, radius: (P.reach ?? 1.9) * 0.9, color: col }); meleeStrike(sk, ctx, 1); });
      if (P.echo) sk.later(0.22, () => { g.bus.emit('swing', { entity: p, radius: P.reach ?? 1.9, color: FX_COLORS.GOLD, heavy: true }); meleeStrike(sk, ctx, P.echo); });
    },
  },

  projectile: {
    fire(sk, ctx) {
      const p = sk.game.player, P = ctx.P;
      const count = Math.max(1, Math.round(P.count ?? 1)), spread = P.spread ?? 0.13;
      const shoot = (mult: number) => {
        for (let i = 0; i < count; i++) {
          const turn = (i - (count - 1) / 2) * spread;
          const c = Math.cos(turn), s = Math.sin(turn);
          const dx = ctx.aim.dirX * c - ctx.aim.dirZ * s, dz = ctx.aim.dirZ * c + ctx.aim.dirX * s;
          sk.launch(ctx, p.x + dx * 0.6, p.z + dz * 0.6, dx, dz, { mult });
        }
      };
      shoot(1);
      if (P.echo) sk.later(0.25, () => shoot(P.echo));
    },
    onShotHit(sk, shot, m) {
      const g = sk.game, ctx = shot.ctx, P = ctx.P;
      sk.hit(ctx, m, 'coef', shot.mult, shot.x - shot.vx * 0.05, shot.z - shot.vz * 0.05, shot.plain);
      if (P.explode && !shot.plain) {
        g.bus.emit('blast', { x: shot.x, y: shot.y - 0.6, z: shot.z, r: P.explode, element: ctx.def.element });
        for (const o of near(sk, shot.x, shot.z, P.explode)) if (o !== m) sk.hit(ctx, o, 'explodeCoef', shot.mult, shot.x, shot.z);
      }
      if (P.chain && !shot.plain) {
        let from: Monster = m;
        const struck = new Set([m.id]);
        for (let j = 0; j < Math.round(P.chain); j++) {
          const next = g.monsters.filter((o) => !o.dead && !struck.has(o.id) && Math.hypot(o.x - from.x, o.z - from.z) < 6)
            .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
          if (!next) break;
          struck.add(next.id);
          const a = from;
          sk.later(0.06 * (j + 1), () => {
            g.bus.emit('chain', { from: { x: a.x, y: a.y + 0.9, z: a.z }, to: { x: next.x, y: next.y + 0.9, z: next.z }, element: ctx.def.element });
            sk.hit(ctx, next, 'coef', shot.mult * 0.7, a.x, a.z);
          });
          from = next;
        }
      }
    },
  },

  nova: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const r = P.radius ?? 3;
      const pulse = (mult: number) => {
        g.fx.nova(p.x, p.y, p.z, r, ctx.def.element === 'physical' ? FX_COLORS.WHITE : ELEMENT_COLOR[ctx.def.element]);
        if (ctx.def.tags.includes('melee')) g.bus.emit('swing', { entity: p, radius: r, color: FX_COLORS.GOLD, heavy: true });
        if (P.heavy) g.shake(0.4);
        for (const m of near(sk, p.x, p.z, r)) sk.hit(ctx, m, 'coef', mult);
      };
      pulse(1);
      if (P.echo) sk.later(0.35, () => pulse(P.echo));
      if (P.barrierPct) g.combat.barrierHero(P.barrierPct, P.barrierDur ?? 5);
      if (P.hasteSelf) g.status.apply(p, 'haste', P.hasteDur ?? 3, P.hasteSelf);
    },
  },

  blast: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P, aim = ctx.aim;
      const count = Math.max(1, Math.round(P.count ?? 1)), scatter = P.scatter ?? 0, r = P.radius ?? 3;
      const self = ctx.def.targeting === 'self';
      for (let i = 0; i < count; i++) {
        let x = self ? p.x : aim.x, z = self ? p.z : aim.z;
        if (scatter && (i > 0 || self)) { const a = g.rng.angle(), d = scatter * (0.35 + 0.65 * g.rng.next()); x += Math.cos(a) * d; z += Math.sin(a) * d; }
        const delay = (P.delay ?? 0.5) + (P.stagger ?? 0) * i;
        const y = g.world.surface(x, z);
        const col = ctx.def.element === 'physical' ? FX_COLORS.WHITE : ELEMENT_COLOR[ctx.def.element];
        g.fx.spawn('zone', x, y + 0.08, z, { size: r, life: delay, color: col, ground: true, alpha: 0.9 });
        const fall = ctx.def.element === 'fire' || ctx.def.icon === 'meteor'
          ? g.fx.spawn('orb', x, y + 9, z, { size: 0.5 + r * 0.18, color: ctx.def.element === 'physical' ? FX_COLORS.DUST : col, hold: true })
          : null;
        sk.blasts.push({ x, z, r, t: 0, delay, ctx, mult: 1, echo: !!P.echo, fall });
      }
    },
    land(sk, b) {
      const g = sk.game, P = b.ctx.P;
      const y = g.world.surface(b.x, b.z);
      g.bus.emit('blast', { x: b.x, y, z: b.z, r: b.r, element: b.ctx.def.element, heavy: !!P.heavy });
      g.rumble(0.5, 120);
      for (const m of near(sk, b.x, b.z, b.r)) sk.hit(b.ctx, m, 'coef', b.mult, b.x, b.z);
      if (P.zoneDur) {
        const fire = P.zoneFire || b.ctx.def.element === 'fire';
        sk.zones.push({
          x: b.x, z: b.z, r: b.r, left: P.zoneDur, tick: 0.5, next: 0.5, ctx: b.ctx, coef: P.zoneCoef ? 1 : 0, follow: false, slow: P.zoneSlow ?? 0, volley: false,
          element: fire ? 'fire' : b.ctx.def.element,
          particle: g.fx.spawn('cloud', b.x, y + 0.12, b.z, { size: b.r, life: P.zoneDur, color: fire ? FX_COLORS.FLAME : FX_COLORS.DUST, ground: true }),
        });
      }
      if (b.echo) sk.blasts.push({ x: b.x, z: b.z, r: b.r, t: 0, delay: 0.6, ctx: b.ctx, mult: P.echo, echo: false });
    },
  },

  zone: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const follow = !!P.follow || ctx.def.targeting === 'self';
      const x = follow ? p.x : ctx.aim.x, z = follow ? p.z : ctx.aim.z, r = P.radius ?? 4;
      const color = ctx.def.element === 'physical' ? FX_COLORS.WHITE : ELEMENT_COLOR[ctx.def.element];
      sk.zones.push({
        x, z, r, left: P.duration ?? 4, tick: P.tick ?? 0.5, next: 0.05, ctx, coef: 1, follow, slow: 0, volley: !!P.volley,
        element: ctx.def.element,
        particle: P.volley ? null : g.fx.spawn('cloud', x, g.world.surface(x, z) + 0.12, z, { size: r, life: P.duration ?? 4, color, ground: true, hold: false }),
      });
    },
    tick(sk, z) {
      const g = sk.game, p = g.player;
      if (z.volley) {
        const in_ = near(sk, z.x, z.z, z.r);
        if (!in_.length) return;
        const m = in_[Math.floor(g.rng.next() * in_.length)];
        const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 1;
        sk.launch(z.ctx, p.x + dx / d * 0.6, p.z + dz / d * 0.6, dx / d, dz / d);
        return;
      }
      const y = g.world.surface(z.x, z.z);
      for (let i = 0; i < 3; i++) {
        const a = g.rng.angle(), d = z.r * Math.sqrt(g.rng.next());
        const col = ELEMENT_COLOR[z.element];
        if (z.element === 'frost') g.fx.spawn('mote', z.x + Math.cos(a) * d, y + 2.2, z.z + Math.sin(a) * d, { size: 0.08, life: 0.7, color: FX_COLORS.WHITE, vy: -3 });
        else if (z.element === 'fire') g.fx.spawn('spark', z.x + Math.cos(a) * d, y + 0.3, z.z + Math.sin(a) * d, { size: 0.2, life: 0.5, color: col, vy: 2 });
        else if (z.coef) g.fx.spawn('spark', z.x + Math.cos(a) * d, y + 1.5, z.z + Math.sin(a) * d, { size: 0.16, life: 0.25, color: col, vy: -8 });
      }
      for (const m of near(sk, z.x, z.z, z.r)) {
        if (z.coef) sk.hit(z.ctx, m, z.ctx.P.zoneCoef && z.ctx.def.behavior !== 'zone' ? 'zoneCoef' : 'coef', 1, z.x, z.z, z.ctx.def.behavior !== 'zone');
        if (z.slow) g.status.apply(m, 'slow', 0.6, z.slow);
        if (z.element === 'fire' && z.ctx.def.behavior !== 'zone') g.status.apply(m, 'burn', 1.5, g.player.build.derived.weapon.max * 0.3);
      }
    },
  },

  dash: {
    instant: true,
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const dist = P.distance ?? 6, speed = P.speed ?? 26;
      p.dash = { x: ctx.aim.dirX, z: ctx.aim.dirZ, speed, t: dist / speed, skill: ctx.def.id, hit: new Set(), coef: P.coef ?? 0, width: P.width ?? 1.2 };
      sk.dashCtx = ctx;
      p.moveTo = null;
      g.bus.emit('dash', { x: p.x, y: p.y, z: p.z });
      if (P.zoneDur) {
        sk.zones.push({
          x: p.x, z: p.z, r: P.radius ?? 2.2, left: P.zoneDur, tick: 0.4, next: 0.05, ctx, coef: 0, follow: false, slow: P.zoneSlow ?? 0.4, volley: false, element: 'physical',
          particle: g.fx.spawn('cloud', p.x, p.y + 0.12, p.z, { size: P.radius ?? 2.2, life: P.zoneDur, color: FX_COLORS.DUST, ground: true }),
        });
      }
    },
  },

  leap: {
    instant: true,
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const dx = ctx.aim.x - p.x, dz = ctx.aim.z - p.z, d = Math.min(P.distance ?? 8, Math.hypot(dx, dz));
      const air = 0.5;
      const l = Math.hypot(dx, dz) || 1;
      p.dash = { x: dx / l, z: dz / l, speed: d / air, t: air, skill: ctx.def.id, leap: true, total: air };
      p.invuln = Math.max(p.invuln, air + 0.05);
      sk.dashCtx = ctx;
      sk.onDashEnd = () => {
        const y = g.world.surface(p.x, p.z);
        g.bus.emit('blast', { x: p.x, y, z: p.z, r: P.radius ?? 2.6, element: ctx.def.element, heavy: true });
        g.bus.emit('slam', { x: p.x, y, z: p.z, r: P.radius ?? 2.6, heavy: true });
        for (const m of near(sk, p.x, p.z, P.radius ?? 2.6)) sk.hit(ctx, m, 'coef', 1, p.x, p.z);
        if (P.zoneDur) {
          sk.zones.push({
            x: p.x, z: p.z, r: P.radius ?? 2.6, left: P.zoneDur, tick: 0.5, next: 0.5, ctx, coef: 1, follow: false, slow: 0, volley: false, element: 'fire',
            particle: g.fx.spawn('cloud', p.x, y + 0.12, p.z, { size: P.radius ?? 2.6, life: P.zoneDur, color: FX_COLORS.FLAME, ground: true }),
          });
        }
      };
    },
  },

  buff: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      if (ctx.def.status) g.status.apply(p, ctx.def.status, P.duration ?? 6, P.potency ?? 0);
      g.fx.nova(p.x, p.y, p.z, ctx.def.tags.includes('shout') ? 4 : 2, ctx.def.element === 'physical' ? FX_COLORS.GOLD : ELEMENT_COLOR[ctx.def.element]);
      if (ctx.def.tags.includes('shout')) g.bus.emit('slam', { x: p.x, y: p.y, z: p.z, r: 4, color: FX_COLORS.GOLD });
    },
  },
  heal: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      const dur = P.duration ?? 3;
      g.status.apply(p, 'mending', dur, p.maxHp * (P.pct ?? 0.3) / dur);
      g.bus.emit('heal', { entity: p });
    },
  },
  barrier: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      g.combat.barrierHero(P.pct ?? 0.25, P.duration ?? 5);
      g.fx.nova(p.x, p.y, p.z, 1.8, FX_COLORS.SKY);
      g.bus.emit('heal', { entity: p, focus: true });
    },
  },

  chain: {
    fire(sk, ctx) {
      const g = sk.game, p = g.player, P = ctx.P;
      let first = ctx.aim.target && !ctx.aim.target.dead ? ctx.aim.target : null;
      if (!first) first = near(sk, ctx.aim.x, ctx.aim.z, 4).sort((a, b) => Math.hypot(a.x - ctx.aim.x, a.z - ctx.aim.z) - Math.hypot(b.x - ctx.aim.x, b.z - ctx.aim.z))[0] ?? null;
      if (!first || Math.hypot(first.x - p.x, first.z - p.z) > ctx.def.range + 2) {
        g.bus.emit('chain', { from: { x: p.x, y: p.y + 1.2, z: p.z }, to: { x: ctx.aim.x, y: g.world.surface(ctx.aim.x, ctx.aim.z) + 0.5, z: ctx.aim.z }, element: ctx.def.element });
        return;
      }
      const struck = new Set<number>();
      let from = { x: p.x, y: p.y + 1.2, z: p.z }, mult = 1, cur: Monster | null = first;
      const jumps = Math.round(P.jumps ?? 4), range = P.jumpRange ?? 6;
      for (let j = 0; j <= jumps && cur; j++) {
        const m: Monster = cur, a = from, k = mult;
        struck.add(m.id);
        sk.later(0.05 * j, () => {
          if (m.dead) return;
          g.bus.emit('chain', { from: a, to: { x: m.x, y: m.y + 0.9, z: m.z }, element: ctx.def.element });
          sk.hit(ctx, m, 'coef', k, a.x, a.z);
        });
        from = { x: m.x, y: m.y + 0.9, z: m.z };
        mult *= P.falloff ?? 0.9;
        cur = g.monsters.filter((o) => !o.dead && !struck.has(o.id) && Math.hypot(o.x - m.x, o.z - m.z) < range)
          .sort((x, y) => Math.hypot(x.x - m.x, x.z - m.z) - Math.hypot(y.x - m.x, y.z - m.z))[0] ?? null;
      }
    },
  },

  trap: {
    fire(sk, ctx) {
      const g = sk.game, P = ctx.P, x = ctx.aim.x, z = ctx.aim.z;
      sk.traps.push({
        x, z, r: P.radius ?? 2.4, arm: P.arm ?? 0.6, left: P.duration ?? 15, ctx,
        particle: g.fx.spawn('mark', x, g.world.surface(x, z) + 0.1, z, { size: (P.radius ?? 2.4) * 0.7, color: FX_COLORS.INK, ground: true, hold: true, alpha: 1 }),
      });
    },
    spring(sk, t) {
      const g = sk.game, y = g.world.surface(t.x, t.z);
      g.bus.emit('blast', { x: t.x, y, z: t.z, r: t.r, element: t.ctx.def.element });
      g.bus.emit('slam', { x: t.x, y, z: t.z, r: t.r });
      for (const m of near(sk, t.x, t.z, t.r)) sk.hit(t.ctx, m, 'coef', 1, t.x, t.z);
    },
  },
  mark: {
    fire(sk, ctx) {
      const g = sk.game, P = ctx.P;
      const t = ctx.aim.target;
      if (!t || t.dead) return;
      const list = P.radius ? near(sk, t.x, t.z, P.radius) : [t];
      for (const m of list) {
        g.status.apply(m, 'marked', P.duration ?? 8, P.potency ?? 0.3);
        g.fx.spawn('mark', m.x, m.y + 0.1, m.z, { size: m.radius * 2.6, life: P.duration ?? 8, color: FX_COLORS.INK, ground: true, follow: m, dy: 0.1 });
      }
      g.bus.emit('chain', { from: { x: g.player.x, y: g.player.y + 1.2, z: g.player.z }, to: { x: t.x, y: t.y + 0.9, z: t.z }, element: 'shadow' });
    },
  },
};
