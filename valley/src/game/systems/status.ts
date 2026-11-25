import type { Game } from '../game';
import type { Fighter, Monster, StatusId, StatusInstance } from '../types';
import { FREEZE_AT, STATUSES } from '../content/statuses';
import { FX_COLORS } from '../fx';

const TICK = 0.5;
const CC: StatusId[] = ['stun', 'freeze', 'chill', 'slow'];

export class StatusSystem {
  private readonly game: Game;
  private fxTimer = 0;
  constructor(game: Game) { this.game = game; }

  has(t: Fighter, id: StatusId): boolean { return t.statuses.some((s) => s.id === id); }
  stopped(t: Fighter): boolean { return t.statuses.some((s) => s.id === 'stun' || s.id === 'freeze'); }

  speedMul(m: Monster): number {
    let k = 1;
    for (const s of m.statuses) {
      if (s.id === 'chill') k *= 1 - Math.min(0.6, s.potency);
      else if (s.id === 'slow') k *= 1 - Math.min(0.7, s.potency);
    }
    return k;
  }

  apply(t: Fighter, id: StatusId, duration: number, potency = 0, stacks = 1, src?: number): void {
    if (t.dead || duration <= 0) return;
    const def = STATUSES[id];
    const g = this.game;
    if (t.kind === 'player') {
      if (CC.includes(id) && this.has(t, 'unstoppable')) return;
      if (id === 'stun' || id === 'freeze') duration = Math.min(1, duration * t.build.derived.ccTaken);
      if (id === 'chill') potency = Math.min(potency, 0.6);
      if (id === 'unstoppable') this.clear(t, CC);
    } else {
      const m = t as Monster;
      if ((id === 'stun' || id === 'freeze') && m.boss) duration *= 0.35;
      else if ((id === 'stun' || id === 'freeze') && m.elite) duration *= 0.6;
    }
    let s = t.statuses.find((x) => x.id === id);
    if (!s) {
      s = { id, left: duration, dur: duration, potency, stacks: Math.min(stacks, def.maxStacks ?? 99), tick: TICK, src };
      t.statuses.push(s);
    } else if (def.stacking === 'stack') {
      const max = def.maxStacks ?? 99;
      if (s.stacks < max) { s.stacks = Math.min(max, s.stacks + stacks); s.potency += potency; }
      else s.potency += potency * 0.2;
      s.left = Math.max(s.left, duration); s.dur = Math.max(s.dur, duration);
    } else {
      s.potency = Math.max(s.potency, potency);
      s.stacks = Math.max(s.stacks, stacks);
      s.left = Math.max(s.left, duration); s.dur = Math.max(s.dur, s.left);
    }
    if (id === 'chill' && t.kind === 'monster' && s.potency >= FREEZE_AT) {
      this.clear(t, ['chill']);
      this.apply(t, 'freeze', 1.5);
      g.bus.emit('miss', { target: t, text: 'Frozen' });
    }
    if (t.kind === 'player' && def.mods) t.dirty = true;
  }

  applyDot(t: Fighter, id: 'burn' | 'bleed' | 'poison', hitAmount: number, fraction: number, duration: number): void {
    if (fraction <= 0 || duration <= 0) return;
    const p = this.game.player;
    const bonus = t.kind === 'monster' ? 1 + p.build.totals.add.dmgDot : 1;
    const elemMore = t.kind === 'monster' ? p.build.totals.more[id === 'poison' ? 'dmgPoison' : id === 'burn' ? 'dmgFire' : 'dmgPhysical'] : 1;
    this.apply(t, id, duration, hitAmount * fraction / duration * bonus * elemMore, 1, p.id);
  }

  clear(t: Fighter, ids: StatusId[]): void {
    const before = t.statuses.length;
    t.statuses = t.statuses.filter((s) => !ids.includes(s.id));
    if (t.kind === 'player' && t.statuses.length !== before) t.dirty = true;
  }

  consume(s: StatusInstance): void {
    s.stacks--;
    if (s.stacks <= 0) s.left = 0;
  }

  update(dt: number): void {
    const g = this.game;
    this.run(g.player, dt);
    for (const m of g.monsters) if (!m.dead) this.run(m, dt);
    if ((this.fxTimer -= dt) <= 0) {
      this.fxTimer = 0.18;
      for (const m of g.monsters) {
        if (m.dead || !m.statuses.length) continue;
        const top = m.y + m.height * m.scale + 0.1;
        for (const s of m.statuses) {
          if (s.id === 'burn' && Math.random() < 0.6) g.fx.spawn('spark', m.x + (Math.random() - 0.5) * 0.5, m.y + 0.5, m.z + (Math.random() - 0.5) * 0.5, { size: 0.15, life: 0.5, color: FX_COLORS.FLAME, vy: 1.6, drag: 1 });
          else if (s.id === 'poison' && Math.random() < 0.4) g.fx.spawn('mote', m.x + (Math.random() - 0.5) * 0.6, m.y + 0.4, m.z + (Math.random() - 0.5) * 0.6, { size: 0.09, life: 0.8, color: FX_COLORS.POISON, vy: 0.8 });
          else if ((s.id === 'stun' || s.id === 'freeze') && Math.random() < 0.5) {
            const a = g.time * 6 + Math.random();
            g.fx.spawn('spark', m.x + Math.cos(a) * 0.4, top, m.z + Math.sin(a) * 0.4, { size: 0.14, life: 0.3, color: s.id === 'freeze' ? FX_COLORS.FROST : FX_COLORS.GOLD });
          }
        }
      }
    }
  }

  private run(t: Fighter, dt: number): void {
    const g = this.game;
    let changed = false, tint: [number, number, number] | null = null;
    let w = 0;
    for (const s of t.statuses) {
      s.left -= dt;
      const def = STATUSES[s.id];
      if (def.dot && s.potency > 0) {
        s.tick -= dt;
        while (s.tick <= 0 && !t.dead) {
          s.tick += TICK;
          const resist = t.kind === 'monster' ? Math.min(0.7, (t as Monster).def.resist?.[def.dot] ?? 0) : t.build.derived.resist[def.dot];
          const vuln = this.has(t, 'vulnerable') ? 1.2 : 1;
          const amount = Math.max(1, Math.round(s.potency * TICK * (1 - resist) * vuln * (t.kind === 'monster' ? 1 - (t as Monster).dr : 1)));
          g.combat.damage(t, amount, t.kind === 'monster' ? g.player : null, false, def.dot, false, true);
        }
      }
      if (s.id === 'mending' && t.kind === 'player') g.combat.healHero(s.potency * dt, true);
      if (s.left <= 0) {
        if (s.id === 'warded') t.barrier = 0;
        if (t.kind === 'player' && def.mods) changed = true;
        continue;
      }
      if (def.tint && !tint) tint = def.tint;
      t.statuses[w++] = s;
    }
    t.statuses.length = w;
    t.tint = tint;
    if (changed && t.kind === 'player') t.dirty = true;
  }
}
