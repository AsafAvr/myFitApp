import type { Game } from '../game';
import type { Element, Missile, Monster, Player, SkillId, SkillTag } from '../types';
import type { SkillDef, SkillParams } from '../content/skills';
import type { SkillState, TriggerRule } from '../rules/build';
import type { TriggerOn } from '../content/effects';
import type { Particle } from '../fx';
import { ELEMENT_COLOR, FX_COLORS } from '../fx';
import { STATUSES } from '../content/statuses';
import { baseEntity, yawFromDir, dirFromYaw } from '../entities';
import { BEHAVIORS } from './behaviors';

export interface Aim { x: number; z: number; dirX: number; dirZ: number; target: Monster | null }

export interface CastCtx {
  skill: SkillState;
  def: SkillDef;
  P: SkillParams;
  aim: Aim;
  more: number;
  critBonus: number;
}

export interface Shot {
  x: number; y: number; z: number; vx: number; vz: number; life: number; radius: number;
  y0: number; life0: number; arc: number; px: number; py: number; pz: number;
  pierce: number; hit: Set<number>; ctx: CastCtx; mult: number;
  particle: Particle | null; ent: Missile | null; kind: 'orb' | 'arrow'; element: Element;
  plain?: boolean;
}
export interface Blast { x: number; z: number; r: number; t: number; delay: number; ctx: CastCtx; mult: number; echo: boolean; fall?: Particle | null }
export interface Zone { x: number; z: number; r: number; left: number; tick: number; next: number; ctx: CastCtx; coef: number; follow: boolean; slow: number; volley: boolean; element: Element; particle: Particle | null }
export interface Trap { x: number; z: number; r: number; arm: number; left: number; ctx: CastCtx; particle: Particle | null }

const BUFFER = 0.3;
export const EVADE = { distance: 4.2, speed: 22, invuln: 0.32, cooldown: 4 };

export class Skills {
  readonly game: Game;
  shots: Shot[] = [];
  blasts: Blast[] = [];
  zones: Zone[] = [];
  traps: Trap[] = [];
  private buffered: { slot: number; left: number } | null = null;
  private timers: { t: number; fn: () => void }[] = [];
  private stuck: { ent: Missile; left: number }[] = [];
  dashCtx: CastCtx | null = null;
  onDashEnd: (() => void) | null = null;
  private readonly icd = new Map<number, number>();
  private lastDeny = '';
  private denyTimer = 0;

  constructor(game: Game) { this.game = game; }

  reset(): void {
    for (const s of this.shots) this.game.fx.release(s.particle);
    for (const z of this.zones) this.game.fx.release(z.particle);
    for (const t of this.traps) this.game.fx.release(t.particle);
    this.shots = []; this.blasts = []; this.zones = []; this.traps = []; this.stuck = [];
    this.buffered = null;
    this.timers = [];
    this.dashCtx = null; this.onDashEnd = null;
    this.icd.clear();
  }

  later(seconds: number, fn: () => void): void { this.timers.push({ t: seconds, fn }); }

  dashEnded(): void {
    const f = this.onDashEnd;
    this.onDashEnd = null; this.dashCtx = null;
    f?.();
  }

  skillInSlot(slot: number): SkillState | null {
    const id = this.game.player.char.bar[slot];
    return (id && this.game.player.build.skills.get(id)) || null;
  }

  cooldown(id: SkillId): { left: number; frac: number } {
    const p = this.game.player, left = p.cooldowns[id] ?? 0;
    const total = p.build.skills.get(id)?.params.cooldown ?? 0;
    return { left, frac: total > 0 ? Math.min(1, left / total) : 0 };
  }

  canAfford(s: SkillState): boolean { return (s.params.cost ?? 0) <= this.game.player.resource + 1e-6; }

  useSlot(slot: number, opts: { target?: Monster | null; quiet?: boolean } = {}): boolean {
    const g = this.game, p = g.player;
    const s = this.skillInSlot(slot);
    if (!s) return false;
    if (p.cast && p.cast.t < p.cast.hitAt) { this.buffered = { slot, left: BUFFER }; return false; }
    return this.cast(s, opts.target ?? null, opts.quiet);
  }

  cast(s: SkillState, target: Monster | null, quiet = false): boolean {
    const g = this.game, p = g.player, P = s.params, def = s.def;
    if (p.dead || g.status.stopped(p) || p.dash) return false;
    if ((p.cooldowns[def.id] ?? 0) > 0) return false;
    if (!this.canAfford(s)) { if (!quiet) this.deny(`Not enough ${p.build.cls.resource.name}.`); return false; }

    const aim = this.aim(def, target);
    p.resource -= P.cost ?? 0;
    if (P.generate) g.combat.gain(P.generate);
    if (P.cooldown) p.cooldowns[def.id] = P.cooldown;
    p.calm = Math.min(p.calm, 2);
    p.moveTo = null;

    let more = 0, critBonus = 0;
    for (const st of p.statuses) {
      const cb = STATUSES[st.id].castBonus;
      if (!cb || st.left <= 0 || st.stacks <= 0) continue;
      if (cb.tag && !def.tags.includes(cb.tag)) continue;
      if (!cb.tag && !def.tags.some((t) => t === 'melee' || t === 'ranged' || t === 'area' || t === 'projectile')) continue;
      more += cb.more ?? 0; critBonus += cb.crit ?? 0;
      if (cb.consume) g.status.consume(st);
    }
    const ctx: CastCtx = { skill: s, def, P, aim, more, critBonus };

    if (def.targeting !== 'self' || def.behavior === 'nova') p.yaw = yawFromDir(aim.dirX, aim.dirZ);
    const basic = def.category === 'basic';
    const speed = p.build.derived.attackSpeed * (basic ? p.build.derived.weapon.speed / 1.2 : 1);
    const dur = (P.castTime ?? 0.4) / Math.max(0.3, speed);
    p.action = def.anim === 'swing' ? 1 : def.anim === 'lunge' ? 4 : def.anim === 'shoot' ? 5 : 2;
    p.actionT = 0; p.actionDur = dur;
    const behave = BEHAVIORS[def.behavior];
    const hitAt = behave.instant ? 0 : dur * (P.hitAt ?? (def.anim === 'shoot' ? 0.56 : 0.45));
    p.cast = { skill: def.id, t: 0, dur, hitAt, fire: () => behave.fire(this, ctx) };
    if (P.invuln) p.invuln = Math.max(p.invuln, P.invuln);
    if (hitAt <= 0) { const f = p.cast.fire; p.cast.fire = null; f?.(); }

    g.bus.emit('skill', { id: def.id, element: def.element, behavior: def.behavior, category: def.category });
    g.bus.emit('cast', { id: def.id, element: def.element, behavior: def.behavior, category: def.category, x: p.x, y: p.y, z: p.z });
    this.fireTriggers('cast', def, null, 0);
    return true;
  }

  evade(dirX?: number, dirZ?: number): boolean {
    const g = this.game, p = g.player;
    if (p.dead || p.evadeCd > 0 || p.dash || g.status.stopped(p)) return false;
    let dx = dirX ?? 0, dz = dirZ ?? 0;
    if (!dx && !dz) { [dx, dz] = dirFromYaw(p.yaw); }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    p.cast = null;
    p.dash = { x: dx, z: dz, speed: EVADE.speed, t: EVADE.distance / EVADE.speed };
    p.invuln = Math.max(p.invuln, EVADE.invuln);
    p.evadeCd = EVADE.cooldown;
    p.yaw = yawFromDir(dx, dz);
    p.action = 4; p.actionT = 0; p.actionDur = EVADE.distance / EVADE.speed + 0.05;
    p.moveTo = null;
    g.bus.emit('evade', { x: p.x, y: p.y, z: p.z });
    this.fireTriggers('cast', { id: 'evade', tags: ['mobility', 'movement'] } as unknown as SkillDef, null, 0);
    return true;
  }

  private deny(text: string): void {
    if (this.lastDeny === text && this.denyTimer > 0) return;
    this.lastDeny = text; this.denyTimer = 1.5;
    this.game.bus.emit('log', { text });
    this.game.bus.emit('deny');
  }

  aim(def: SkillDef, asked: Monster | null): Aim {
    const g = this.game, p = g.player;
    let target: Monster | null = null;
    const live = (m: Monster | null | undefined): m is Monster => !!m && !m.dead && !m.gone;
    if (live(asked)) target = asked;
    else if (p.target && p.target.kind === 'monster' && live(p.target)) target = p.target;
    let tx: number | undefined, tz: number | undefined;
    if (target) { tx = target.x; tz = target.z; }
    else if (g.controls.ground && g.input.lastDevice === 'mouse') { tx = g.controls.ground.x; tz = g.controls.ground.z; }
    else {
      const assist = this.assistTarget(def.range > 0 ? Math.max(8, def.range) : 11);
      if (assist) { target = assist; tx = assist.x; tz = assist.z; }
    }
    let dx = (tx ?? p.x) - p.x, dz = (tz ?? p.z) - p.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { [dx, dz] = dirFromYaw(p.yaw); d = 1; tx = p.x + dx * 3; tz = p.z + dz * 3; }
    if (def.targeting === 'ground' && def.range > 0 && d > def.range) { tx = p.x + dx / d * def.range; tz = p.z + dz / d * def.range; }
    return { x: tx!, z: tz!, dirX: dx / d, dirZ: dz / d, target };
  }

  assistTarget(range: number): Monster | null {
    const g = this.game, p = g.player;
    const strength = g.settings.aimAssist;
    if (strength <= 0) return g.entities.nearest('monster', p.x, p.z, range * 0.6);
    const it = p.intent;
    let fx: number, fz: number;
    if (it.moveX || it.moveZ) { const l = Math.hypot(it.moveX, it.moveZ); fx = it.moveX / l; fz = it.moveZ / l; } else [fx, fz] = dirFromYaw(p.yaw);
    let best: Monster | null = null, bs = -1e9;
    for (const m of g.monsters) {
      if (m.dead) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = -d / range + facing * strength;
      if (score > bs) { bs = score; best = m; }
    }
    return best;
  }

  fireTriggers(on: TriggerOn, def: Pick<SkillDef, 'id' | 'tags'> | null, target: Monster | null, amount: number): void {
    const g = this.game, p = g.player;
    for (const t of p.build.triggers) {
      if (t.on !== on) continue;
      if (t.skill && t.skill !== def?.id) continue;
      if (t.tag && !def?.tags.includes(t.tag as SkillTag)) continue;
      if (t.when && !p.build.when[t.when] && !this.whenNow(t)) continue;
      if ((this.icd.get(t.id) ?? 0) > g.time) continue;
      if (t.chance < 1 && !g.rng.chance(t.chance)) continue;
      if (t.icd) this.icd.set(t.id, g.time + t.icd);
      this.runActions(t, def, target, amount);
    }
  }

  private whenNow(t: TriggerRule): boolean {
    const p = this.game.player;
    switch (t.when) {
      case 'injured': return p.hp < p.maxHp * 0.35;
      case 'healthy': return p.hp > p.maxHp * 0.8;
      case 'barrier': return p.barrier > 0;
      case 'resourceHigh': return p.resource >= p.build.derived.maxResource * 0.5;
      case 'resourceLow': return p.resource < p.build.derived.maxResource * 0.25;
      default: return true;
    }
  }

  private runActions(t: TriggerRule, def: Pick<SkillDef, 'id' | 'tags'> | null, target: Monster | null, _amount: number): void {
    const g = this.game, p = g.player;
    for (const a of t.actions) {
      switch (a.do) {
        case 'status':
          if (a.to === 'self') g.status.apply(p, a.status, a.duration, a.potency ?? 0, a.stacks ?? 1);
          else if (target && !target.dead) g.status.apply(target, a.status, a.duration, a.potency ?? 0, a.stacks ?? 1);
          break;
        case 'resource': g.combat.gain(a.amount, false); break;
        case 'heal': g.combat.healHero(p.maxHp * a.pct, a.pct < 0.05); break;
        case 'barrier': g.combat.barrierHero(a.pct, a.duration); break;
        case 'refund': {
          const s = def && p.build.skills.get(def.id);
          if (s?.params.cost) { p.resource = Math.min(p.build.derived.maxResource, p.resource + s.params.cost); g.bus.emit('miss', { target: p, text: 'Overflow' }); }
          break;
        }
        case 'cooldowns':
          for (const id in p.cooldowns) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - a.seconds);
          break;
        case 'explode': {
          const at = target ?? p;
          const y = g.world.surface(at.x, at.z);
          g.bus.emit('blast', { x: at.x, y, z: at.z, r: a.radius, element: a.element });
          const base = g.combat.weaponRoll() * a.coef;
          for (const m of g.monsters) {
            if (m.dead || Math.hypot(m.x - at.x, m.z - at.z) > a.radius + m.radius) continue;
            g.combat.heroHit(m, { skill: null, base, element: a.element, tags: ['area', a.element], fromX: at.x, fromZ: at.z, noTriggers: true });
          }
          break;
        }
      }
    }
  }

  launch(ctx: CastCtx, x: number, z: number, dirX: number, dirZ: number, o: { mult?: number; plain?: boolean } = {}): Shot {
    const g = this.game, P = ctx.P;
    const arrow = ctx.def.tags.includes('physical') && ctx.def.tags.includes('ranged');
    const y = g.world.surface(x, z) + (arrow ? 1.25 : 0.95);
    const element = ctx.def.element;
    const life = P.life ?? 0.8;
    const s: Shot = {
      x, y, z, vx: dirX * (P.speed ?? 18), vz: dirZ * (P.speed ?? 18), life, radius: P.radius ?? 0.45,
      y0: y, life0: life, arc: arrow ? 0.45 : 0, px: x, py: y, pz: z,
      pierce: Math.round(P.pierce ?? 0), hit: new Set(), ctx, mult: o.mult ?? 1, element, plain: o.plain,
      kind: arrow ? 'arrow' : 'orb',
      particle: arrow ? null : g.fx.spawn('orb', x, y, z, { size: element === 'storm' ? 0.4 : 0.55, color: ELEMENT_COLOR[element], hold: true }),
      ent: arrow ? g.entities.add<Missile>({ ...baseEntity('missile', 'arrow'), kind: 'missile', x, y, z, yaw: yawFromDir(dirX, dirZ), radius: 0.12, height: 0.12, colors: [FX_COLORS.RED, FX_COLORS.RED, FX_COLORS.RED] }) : null,
    };
    if (arrow && !o.plain) g.fx.spawn('ring', x, y, z, { size: 0.28, life: 0.14, color: FX_COLORS.WHITE, alpha: 0.8 });
    this.shots.push(s);
    return s;
  }

  update(dt: number): void {
    const g = this.game, p = g.player;
    this.denyTimer -= dt;
    for (const id in p.cooldowns) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt);
    p.evadeCd = Math.max(0, p.evadeCd - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);

    const c = p.cast;
    if (c) {
      c.t += dt;
      if (c.fire && c.t >= c.hitAt) { const f = c.fire; c.fire = null; f(); }
      if (c.t >= c.dur) p.cast = null;
    }
    if (this.buffered) {
      this.buffered.left -= dt;
      if (this.buffered.left <= 0) this.buffered = null;
      else if (!p.cast || p.cast.t >= p.cast.hitAt) { const slot = this.buffered.slot; this.buffered = null; this.useSlot(slot, { quiet: true }); }
    }

    if (this.timers.length) {
      const due: (() => void)[] = [];
      this.timers = this.timers.filter((t) => ((t.t -= dt) > 0 ? true : (due.push(t.fn), false)));
      for (const fn of due) fn();
    }
    const dash = p.dash, dc = this.dashCtx;
    if (dash && dc && dash.hit && ((dash.coef ?? 0) > 0 || dc.P.knock)) {
      for (const m of g.monsters) {
        if (m.dead || dash.hit.has(m.id)) continue;
        if (Math.hypot(m.x - p.x, m.z - p.z) < (dash.width ?? 1.2) + m.radius) { dash.hit.add(m.id); this.hit(dc, m, 'coef'); }
      }
    }

    this.updateShots(dt);
    this.updateBlasts(dt);
    this.updateZones(dt);
    this.updateTraps(dt);
  }

  heading(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const g = this.game, cam = g.camera;
    const a = cam.project(ax, ay, az), b = cam.project(bx, by, bz);
    if (!a || !b) return 0;
    const W = g.renderer.size.cssW, H = g.renderer.size.cssH;
    return Math.atan2((b.x - a.x) * W, -(b.y - a.y) * H);
  }

  private updateShots(dt: number): void {
    const g = this.game;
    let w = 0;
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y; s.pz = s.z;
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.arc) s.y = s.y0 + s.arc * Math.sin(Math.PI * Math.min(1, 1 - s.life / s.life0)) - 0.25 * (1 - s.life / s.life0);
      let done = s.life <= 0 || g.world.surface(s.x, s.z) > s.y - 0.1;
      if (!done) {
        for (const m of g.monsters) {
          if (m.dead || s.hit.has(m.id)) continue;
          if (Math.hypot(m.x - s.x, m.z - s.z) >= m.radius + s.radius) continue;
          s.hit.add(m.id);
          BEHAVIORS.projectile.onShotHit!(this, s, m);
          if (s.pierce-- <= 0) { done = true; break; }
        }
      }
      if (s.ent) {
        const e = s.ent, horiz = Math.hypot(s.x - s.px, s.z - s.pz);
        e.x = s.x; e.y = s.y; e.z = s.z;
        e.walk = Math.atan2(s.y - s.py, horiz || 1e-4);
        if (Math.random() < 0.5) g.fx.spawn('streak', s.x - s.vx * 0.012, s.y, s.z - s.vz * 0.012, { size: 0.42, life: 0.12, color: FX_COLORS.WHITE, alpha: 0.45, rot: this.heading(s.px, s.py, s.pz, s.x, s.y, s.z) });
      }
      if (s.particle) {
        s.particle.x = s.x; s.particle.y = s.y; s.particle.z = s.z;
        if (Math.random() < 0.6) g.fx.spawn('spark', s.x, s.y, s.z, { size: 0.15, life: 0.25, color: ELEMENT_COLOR[s.element], vy: 0.8 });
        g.fx.light(s.x, s.y, s.z, 5, 0.05);
      }
      if (done) {
        g.fx.release(s.particle);
        if (s.ent) {
          if (s.hit.size && s.pierce < 0) s.ent.gone = true;
          else { s.ent.walk = -0.5; s.ent.y = Math.min(s.ent.y, g.world.surface(s.x, s.z) + 0.12); this.stuck.push({ ent: s.ent, left: 1.4 }); }
        }
        if (s.kind === 'orb') g.bus.emit('bolt:hit', { x: s.x, y: s.y, z: s.z, element: s.element });
        continue;
      }
      this.shots[w++] = s;
    }
    this.shots.length = w;
    this.stuck = this.stuck.filter((a) => ((a.left -= dt) > 0 ? true : ((a.ent.gone = true), false)));
  }

  private updateBlasts(dt: number): void {
    let w = 0;
    for (const b of this.blasts) {
      b.t += dt;
      if (b.fall) {
        const k = Math.min(1, b.t / b.delay);
        b.fall.y = this.game.world.surface(b.x, b.z) + 9 * (1 - k * k) + 0.4;
      }
      if (b.t < b.delay) { this.blasts[w++] = b; continue; }
      this.game.fx.release(b.fall ?? null);
      BEHAVIORS.blast.land!(this, b);
    }
    this.blasts.length = w;
  }

  private updateZones(dt: number): void {
    const g = this.game, p = g.player;
    let w = 0;
    for (const z of this.zones) {
      z.left -= dt;
      if (z.follow) { z.x = p.x; z.z = p.z; }
      if (z.particle) { z.particle.x = z.x; z.particle.z = z.z; z.particle.y = g.world.surface(z.x, z.z) + 0.12; }
      z.next -= dt;
      while (z.next <= 0 && z.left > 0) { z.next += z.tick; BEHAVIORS.zone.tick!(this, z); }
      if (z.left <= 0) { g.fx.release(z.particle); continue; }
      this.zones[w++] = z;
    }
    this.zones.length = w;
  }

  private updateTraps(dt: number): void {
    const g = this.game;
    let w = 0;
    for (const t of this.traps) {
      t.left -= dt; t.arm -= dt;
      let sprung = false;
      if (t.arm <= 0) for (const m of g.monsters) if (!m.dead && Math.hypot(m.x - t.x, m.z - t.z) < t.r * 0.6 + m.radius) { sprung = true; break; }
      if (sprung) { BEHAVIORS.trap.spring!(this, t); g.fx.release(t.particle); continue; }
      if (t.left <= 0) { g.fx.release(t.particle); continue; }
      this.traps[w++] = t;
    }
    this.traps.length = w;
  }

  hit(ctx: CastCtx, m: Monster, coefKey: string, mult = 1, fromX?: number, fromZ?: number, plain = false) {
    const g = this.game, p: Player = g.player;
    const base = g.combat.weaponRoll() * (ctx.P[coefKey] ?? 0) * mult;
    if (base <= 0) {
      if (!plain) g.combat.touch(m, ctx.P);
      return null;
    }
    return g.combat.heroHit(m, {
      skill: ctx.skill, base, element: ctx.def.element, tags: ctx.def.tags, critBonus: ctx.critBonus, more: ctx.more,
      fromX: fromX ?? p.x, fromZ: fromZ ?? p.z, params: plain ? undefined : ctx.P,
    });
  }
}
