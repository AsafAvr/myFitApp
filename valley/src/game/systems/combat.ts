import type { Game } from '../game';
import type { Element, Fighter, Monster, Player, SkillTag, StatusId } from '../types';
import type { SkillState } from '../rules/build';
import type { SkillParams } from '../content/skills';
import { ELITE_AFFIXES } from '../content/monsters';
import { resolveHit, type AttackerView, type DefenderView, type HitResult } from '../rules/damage';
import { LEVEL_CAP, xpFactor, xpToNext } from '../rules/stats';
import { NIGHT_BONUS } from '../rules/loot';

const HOLD = { hit: 0.03, crit: 0.06, kill: 0.07, elder: 0.13, taken: 0.05 };

export interface HeroHit {
  skill: SkillState | null;
  base: number;
  element: Element;
  tags: readonly SkillTag[];
  critBonus?: number;
  more?: number;
  fromX: number; fromZ: number;
  params?: SkillParams;
  noTriggers?: boolean;
}

export class Combat {
  private readonly game: Game;

  constructor(game: Game) { this.game = game; }

  heroAttacker(): AttackerView {
    const p = this.game.player, d = p.build.derived;
    return { level: p.level, totals: p.build.totals, mainMult: d.mainMult, critChance: d.critChance, critMult: d.critMult, hpFrac: p.hp / p.maxHp, isPlayer: true };
  }
  monsterDefender(m: Monster, distance: number): DefenderView {
    return {
      level: m.level, armor: m.armor, resist: m.def.resist ?? {}, taken: 1 - m.dr, dodge: 0, block: 0,
      statuses: m.statuses, hpFrac: m.hp / m.maxHp, elite: m.elite, isPlayer: false, distance,
    };
  }
  private monsterAttacker(m: Monster): AttackerView {
    return { level: m.level, totals: null, mainMult: 1, critChance: 0, critMult: 1, hpFrac: m.hp / m.maxHp, isPlayer: false };
  }
  private heroDefender(distance: number): DefenderView {
    const p = this.game.player, d = p.build.derived;
    return {
      level: p.level, armor: d.armor, resist: d.resist, taken: d.taken, dodge: d.dodge, block: d.block,
      statuses: p.statuses, hpFrac: p.hp / p.maxHp, elite: false, isPlayer: true, distance,
    };
  }

  weaponRoll(): number {
    const w = this.game.player.build.derived.weapon;
    return this.game.rng.range(w.min, w.max + 1);
  }

  heroHit(m: Monster, h: HeroHit): HitResult | null {
    const g = this.game, p = g.player;
    if (!m || m.dead) return null;
    const dist = Math.hypot(m.x - p.x, m.z - p.z);
    const P = h.params;
    let more = h.more ?? 0;
    if (P) {
      const has = (id: StatusId) => m.statuses.some((s) => s.id === id);
      if (P.moreVsCC && (has('stun') || has('freeze'))) more += P.moreVsCC;
      if (P.moreVsChilled && (has('chill') || has('freeze'))) more += P.moreVsChilled;
      if (P.moreVsVulnerable && has('vulnerable')) more += P.moreVsVulnerable;
      if (P.moreVsBurning && has('burn')) more += P.moreVsBurning;
      if (P.more) more += P.more;
    }
    const res = resolveHit(this.heroAttacker(), this.monsterDefender(m, dist), {
      base: h.base, element: h.element, tags: h.tags, canCrit: true, critBonus: (h.critBonus ?? 0) + (P?.crit ?? 0), more,
    }, g.rng);
    const wasChilled = m.statuses.some((s) => s.id === 'chill');
    this.damage(m, res.amount, p, res.crit, h.element, res.blocked);
    if (P) this.leaveStatuses(m, P, res.amount, wasChilled);
    this.applyOnHitRules(m, h, res.amount);
    const knock = P?.knock ?? 0, pull = P?.pull ?? 0;
    if ((knock || pull) && !m.dead && m.ai.state !== 'special' && !m.guard && !m.affixes.includes('stonehide') && !m.boss) {
      const dx = m.x - h.fromX, dz = m.z - h.fromZ, d = Math.hypot(dx, dz) || 1;
      const k = pull ? -Math.min(6, d * 3) : knock * (res.crit ? 1.6 : 1);
      m.ai.pushX = dx / d * k; m.ai.pushZ = dz / d * k;
    }
    const d = p.build.derived;
    if (d.lifeOnHit) this.healHero(d.lifeOnHit, true);
    if (P?.genPerHit) this.gain(P.genPerHit);
    if (!h.noTriggers) {
      g.skills.fireTriggers('hit', h.skill?.def ?? null, m, res.amount);
      if (res.crit) g.skills.fireTriggers('crit', h.skill?.def ?? null, m, res.amount);
    }
    if (m.dead && !h.noTriggers) g.skills.fireTriggers('kill', h.skill?.def ?? null, m, res.amount);
    return res;
  }

  touch(m: Monster, P: SkillParams): void {
    if (m.dead) return;
    m.ai.target = this.game.player; m.ai.provoked = true;
    this.leaveStatuses(m, P, 0, m.statuses.some((s) => s.id === 'chill'));
  }

  private leaveStatuses(m: Monster, P: SkillParams, amount: number, wasChilled: boolean): void {
    if (m.dead) return;
    const st = this.game.status, rng = this.game.rng, d = this.game.player.build.derived.statusDuration;
    if (P.stun && rng.chance(P.stunChance ?? 1)) st.apply(m, 'stun', P.stun * d);
    if (P.freeze) st.apply(m, 'freeze', P.freeze * d);
    if (P.freezeChilled && wasChilled) st.apply(m, 'freeze', P.freezeChilled * d);
    if (P.vuln && rng.chance(P.vulnChance ?? 1)) st.apply(m, 'vulnerable', P.vuln * d);
    if (P.burn) st.applyDot(m, 'burn', amount, P.burn, (P.burnDur ?? 3) * d);
    if (P.bleed) st.applyDot(m, 'bleed', amount, P.bleed, (P.bleedDur ?? 4) * d);
    if (P.poison) st.applyDot(m, 'poison', amount, P.poison, (P.poisonDur ?? 4) * d);
    if (P.chill) st.apply(m, 'chill', 3 * d, P.chill);
    if (P.slow) st.apply(m, 'slow', (P.slowDur ?? 2) * d, P.slow);
  }

  private applyOnHitRules(m: Monster, h: HeroHit, amount: number): void {
    if (m.dead) return;
    const g = this.game, p = g.player, st = g.status, d = p.build.derived.statusDuration;
    const def = h.skill?.def;
    for (const r of p.build.onHit) {
      if (r.skill && r.skill !== def?.id) continue;
      if (r.tag && !h.tags.includes(r.tag)) continue;
      if (!g.rng.chance(r.chance)) continue;
      if (r.status === 'burn' || r.status === 'bleed' || r.status === 'poison') st.applyDot(m, r.status, amount, r.potency, r.duration * d);
      else st.apply(m, r.status, r.duration * d, r.potency, r.stacks);
    }
    if (h.tags.includes('melee') && p.statuses.some((s) => s.id === 'brand')) st.applyDot(m, 'burn', amount, 0.5, 3 * d);
  }

  maul(m: Monster): void {
    const g = this.game, p = g.player;
    if (p.dead || p.invuln > 0) return;
    if (Math.hypot(p.x - m.x, p.z - m.z) > m.def.range + m.radius + 0.55) {
      g.bus.emit('miss', { target: p, text: 'Dodged' });
      return;
    }
    this.hurtHero(m, 1);
  }

  hurtHero(m: Monster, mult = 1, quiet = false, element: Element = 'physical'): boolean {
    const g = this.game, p = g.player;
    if (p.dead) return false;
    if (p.invuln > 0) { if (!quiet) g.bus.emit('miss', { target: p, text: 'Untouched' }); return false; }
    const night = 1 + 0.2 * g.stakes.night();
    const res = resolveHit(this.monsterAttacker(m), this.heroDefender(Math.hypot(p.x - m.x, p.z - m.z)), {
      base: m.atk * mult * night * (0.85 + g.rng.next() * 0.3), element, tags: [], canCrit: false,
    }, g.rng);
    if (res.dodged) { if (!quiet) g.bus.emit('miss', { target: p, text: 'Dodged' }); return false; }
    this.damage(p, res.amount, m, false, element, res.blocked);
    if (m.affixes.includes('frostbound')) g.status.apply(p, 'chill', 2, 0.3);
    if (m.affixes.includes('vampiric')) m.hp = Math.min(m.maxHp, m.hp + res.amount * 1.5);
    const barbs = p.statuses.find((s) => s.id === 'thorns');
    const thorns = p.build.derived.thorns + (barbs ? res.amount * barbs.potency : 0);
    if (thorns > 0 && !m.dead && Math.hypot(p.x - m.x, p.z - m.z) < 4) this.damage(m, Math.round(thorns), p, false, 'physical');
    g.skills.fireTriggers('hurt', null, m, res.amount);
    return true;
  }

  damage(target: Fighter, amount: number, source: Fighter | null, crit: boolean, element: Element, blocked = false, dot = false): void {
    const g = this.game;
    if (target.dead) return;
    if ((target as Monster).guard) amount = Math.max(1, Math.round(amount * 0.2));
    if (target.barrier > 0) {
      const soak = Math.min(target.barrier, amount);
      target.barrier -= soak;
      amount -= soak;
      if (target.barrier <= 0) target.statuses = target.statuses.filter((s) => s.id !== 'warded');
    }
    target.hp = Math.max(0, target.hp - amount);
    if (!dot) target.flash = 1;
    if (!dot && target.action !== 1 && !(target.kind === 'monster' && target.ai.state === 'special')) { target.action = 3; target.actionT = 0; target.actionDur = 0.22; }
    g.bus.emit('damage', { target, amount, crit, source, element, blocked, dot });
    if (target.kind === 'monster') {
      const ai = target.ai;
      ai.target = g.player; ai.provoked = true;
      target.calmT = 0;
      const fell = target.hp <= 0;
      if (!dot && !target.guard) g.hold(fell ? (target.elite ? HOLD.elder : HOLD.kill) : crit ? HOLD.crit : HOLD.hit);
      if (!dot && (crit || (fell && target.elite))) { g.shake(fell && target.elite ? 0.55 : 0.32); g.rumble(fell && target.elite ? 0.6 : 0.3, 90); }
      if (fell) this.slay(target);
    } else {
      const p = target as Player;
      p.calm = 0;
      if (dot) return void (p.hp <= 0 && this.fall(p));
      const heavy = amount >= p.maxHp * 0.08;
      if (heavy) g.hold(HOLD.taken);
      g.shake(heavy ? 0.5 : 0.25);
      g.rumble(heavy ? 0.7 : 0.35, heavy ? 160 : 80);
      g.look.hurt = 1;
      const gainPer = p.build.cls.resource.onHurt;
      if (gainPer) this.gain((amount / p.maxHp) * 100 * gainPer, false);
      if (p.hp <= 0) this.fall(p);
    }
  }

  healHero(amount: number, quiet = false): void {
    const p = this.game.player;
    if (p.dead || amount <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount * p.build.derived.healing);
    if (!quiet && p.hp > before) this.game.bus.emit('heal', { entity: p, amount: p.hp - before });
  }

  gain(amount: number, scaled = true): void {
    const p = this.game.player;
    p.resource = Math.min(p.build.derived.maxResource, p.resource + amount * (scaled ? p.build.derived.genMul : 1));
  }

  barrierHero(pct: number, duration: number): void {
    const p = this.game.player;
    p.barrier = Math.max(p.barrier, p.maxHp * pct * p.build.derived.barrierGen);
    this.game.status.apply(p, 'warded', duration, p.barrier);
  }

  slay(m: Monster): void {
    const g = this.game, p = g.player, c = p.char;
    m.dead = true; m.deathT = 0;
    if (p.target === m) p.target = null;
    const gained = Math.max(1, Math.round(m.xp * xpFactor(p.level, m.level) * (1 + NIGHT_BONUS.xp * g.stakes.night()) * p.build.derived.xpMul));
    c.tally.kills++;
    if (m.rank === 'elite') c.tally.elites++;
    if (m.rank === 'boss') c.tally.bosses++;
    g.bus.emit('monster:died', m);
    const d = p.build.derived;
    if (d.lifeOnKill) this.healHero(d.lifeOnKill, true);
    if (d.resourceOnKill) this.gain(d.resourceOnKill, false);
    if (!m.practice) g.loot.dropFrom(m);
    this.grantXp(gained);
    g.bounties.onKill(m);
    g.zones.onKill(m);
    if (m.affixes.includes('blazing')) g.hazards.patch(m, 2.2, 3, 0.35, 'fire');
  }

  grantXp(n: number): void {
    const g = this.game, c = g.player.char;
    if (c.level >= LEVEL_CAP) return;
    c.xp += n;
    g.bus.emit('xp', { amount: n });
    while (c.level < LEVEL_CAP && c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level);
      c.level++;
      g.playerSystem.recompile(true);
      g.player.hp = g.player.maxHp;
      g.player.resource = Math.max(g.player.resource, g.player.build.cls.resource.startFull ? g.player.build.derived.maxResource : 0);
      g.bus.emit('levelup', { level: c.level });
    }
    if (c.level >= LEVEL_CAP) c.xp = 0;
  }

  fall(p: Player): void {
    const g = this.game;
    if (p.dead) return;
    p.dead = true; p.respawn = 3.2; p.target = null; p.moveTo = null; p.cast = null; p.dash = null;
    p.char.tally.deaths++;
    g.bus.emit('player:died');
  }

  static affixNumbers(affixes: string[]): { speed: number; cd: number; taken: number } {
    let speed = 1, cd = 1, taken = 1;
    for (const id of affixes) {
      const a = ELITE_AFFIXES[id];
      if (!a) continue;
      speed *= a.speedMul ?? 1; cd *= a.cdMul ?? 1; taken *= a.taken ?? 1;
    }
    return { speed, cd, taken };
  }
}
