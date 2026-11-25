import type { Game } from '../game';
import type { Monster } from '../types';
import type { Bounty, Character } from '../state/character';
import { MONSTERS } from '../content/monsters';
import { MATERIAL } from '../content/items';
import { materialCount, spendMaterial } from '../rules/inventory';

const POOL = ['sproutling', 'puffcap', 'bristlehog', 'wisp', 'shellsnap', 'cragling'];
const GOODS = ['sprout_leaf', 'puff_spore', 'hog_bristle', 'snap_claw', 'wisp_ember', 'crag_shard'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Kind {
  offer(g: Game, c: Character, k: number): Omit<Bounty, 'kind' | 'have'> | null;
  title(b: Bounty): string;
  track(b: Bounty): string;
  have?(g: Game, b: Bounty): number;
  pay?(g: Game, b: Bounty): void;
}

const KINDS: Record<Bounty['kind'], Kind> = {
  cull: {
    offer(_g, c, k) {
      const j = c.journey, tier = Math.min(POOL.length - 3, Math.floor(c.level / 3));
      const id = POOL[(tier + k + j.bountiesDone) % Math.min(POOL.length, tier + 4)], def = MONSTERS[id];
      const need = 4 + k * 2 + Math.floor(c.level / 2);
      return { monster: id, name: def.name, need, xp: Math.round(def.xp * need * 0.9 * (1 + c.level * 0.25)), glint: Math.round((10 + def.xp) * need * 0.35) };
    },
    title: (b) => `Cull ${plural(b.need, b.name!)}`,
    track: (b) => `${b.name}s: ${b.have} / ${b.need}`,
  },
  gather: {
    offer(_g, c, k) {
      const j = c.journey, tier = Math.min(GOODS.length - 2, Math.floor(c.level / 3));
      const item = GOODS[(tier + k + j.bountiesDone) % Math.min(GOODS.length, tier + 3)], it = MATERIAL[item];
      const need = 3 + Math.floor(c.level / 3);
      return { item, name: it.name, need, xp: Math.round(it.value * need * 2.2 * (1 + c.level * 0.2)), glint: Math.round(it.value * need * 2.5) };
    },
    title: (b) => `Bring ${plural(b.need, b.name!)}`,
    track: (b) => `${b.name}s: ${b.have} / ${b.need}`,
    have: (g, b) => Math.min(b.need, materialCount(g.player.char, b.item!)),
    pay: (g, b) => { spendMaterial(g.player.char, b.item!, b.need); },
  },
  elder: {
    offer(g, c) {
      const j = c.journey;
      const ruins = g.overworld.sites.inRange(0, 0, 900).filter((q: { den?: boolean }) => q.den).sort((a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const ruin = ruins[j.bountiesDone % Math.max(1, Math.min(ruins.length, 2 + Math.floor(c.level / 2)))];
      if (!ruin) return null;
      const far = Math.hypot(ruin.x, ruin.z);
      return { key: ruin.key, x: ruin.x, z: ruin.z, place: ruin.name, need: 1, xp: Math.round(70 + far * 0.25 + c.level * 20), glint: Math.round(40 + far * 0.08 + c.level * 8) };
    },
    title: (b) => `Slay the elder in the ${b.place}`,
    track: (b) => (b.have ? 'The elder is slain' : `The elder in the ${b.place}`),
  },
  scout: {
    offer(g, c) {
      const j = c.journey;
      const sites = g.overworld.sites.inRange(0, 0, 1100).filter((q: { key: string }) => !j.found[q.key]).sort((a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const site = sites[j.bountiesDone % Math.max(1, Math.min(sites.length, 3))];
      if (!site) return null;
      const far = Math.hypot(site.x, site.z);
      return { key: site.key, x: site.x, z: site.z, place: site.name, need: 1, xp: Math.round(30 + far * 0.2 + c.level * 8), glint: Math.round(20 + far * 0.07) };
    },
    title: (b) => `Find ${b.place} and report back`,
    track: (b) => (b.have ? `${b.place} is found` : `Find ${b.place}`),
    have: (g, b) => (g.player.char.journey.found[b.key!] ? 1 : 0),
  },
  delve: {
    offer(g, c) {
      const j = c.journey;
      const holes = g.overworld.sites.inRange(0, 0, 1400).filter((q: { kind: string; key: string }) => q.kind === 'dungeon' && !j.dungeons[q.key])
        .sort((a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const hole = holes[j.bountiesDone % Math.max(1, Math.min(holes.length, 2))];
      if (!hole) return null;
      const far = Math.hypot(hole.x, hole.z);
      return { key: hole.key, x: hole.x, z: hole.z, place: hole.name, need: 1, xp: Math.round(120 + far * 0.3 + c.level * 25), glint: Math.round(60 + far * 0.1 + c.level * 10) };
    },
    title: (b) => `Clear ${b.place}`,
    track: (b) => (b.have ? `${b.place} is cleared` : `Clear ${b.place}`),
    have: (g, b) => (g.player.char.journey.dungeons[b.key!] ? 1 : 0),
  },
};

export class Bounties {
  private readonly game: Game;
  offers: (Bounty | null)[] = [];
  private timer = 0;

  constructor(game: Game) { this.game = game; }

  reset(): void { this.offers = []; this.timer = 0; }

  refresh(): (Bounty | null)[] {
    const g = this.game, c = g.player.char, n = c.journey.bountiesDone;
    const make = (kind: Bounty['kind'], k: number): Bounty | null => {
      const o = KINDS[kind].offer(g, c, k);
      return o ? { kind, have: 0, ...o } as Bounty : null;
    };
    const third = (['elder', 'scout', 'delve'] as const)[n % 3];
    this.offers = [make('cull', 0), make(n % 2 ? 'cull' : 'gather', 1), make(third, 2) || make('scout', 2) || make('cull', 2)];
    return this.offers;
  }

  title(b: Bounty): string { return KINDS[b.kind ?? 'cull'].title(b); }
  track(b: Bounty): string { return b.have >= b.need ? 'Done: return to a warden' : KINDS[b.kind ?? 'cull'].track(b); }

  accept(i: number): void {
    const j = this.game.player.char.journey;
    const o = this.offers[i];
    if (j.bounty || !o) return;
    j.bounty = { ...o };
    this.progress();
    this.game.bus.emit('bounty:changed');
    this.game.bus.emit('log', { text: `Bounty taken: ${this.title(j.bounty)}.` });
  }

  abandon(): void {
    this.game.player.char.journey.bounty = null;
    this.game.bus.emit('bounty:changed');
  }

  private done(b: Bounty): void {
    b.have = b.need;
    this.game.bus.emit('bounty:changed');
    this.game.bus.emit('log', { text: 'Bounty complete. Return to a warden.', big: true });
  }

  onKill(m: Monster): void {
    const b = this.game.player.char.journey.bounty;
    if (!b || b.have >= b.need) return;
    if ((b.kind ?? 'cull') === 'cull' && b.monster === m.defId) {
      b.have++;
      if (b.have >= b.need) this.done(b); else this.game.bus.emit('bounty:changed');
    } else if (b.kind === 'elder' && m.elite && b.x !== undefined && Math.hypot(m.x - b.x, m.z - b.z!) < 40) this.done(b);
  }

  progress(): void {
    const g = this.game, b = g.player.char.journey.bounty;
    const kind = b && KINDS[b.kind ?? 'cull'];
    if (!b || !kind?.have) return;
    const have = kind.have(g, b), was = b.have;
    if (have === was) return;
    b.have = have;
    if (have >= b.need && was < b.need) this.done(b); else g.bus.emit('bounty:changed');
  }

  update(dt: number): void {
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.4;
    this.progress();
  }

  claim(): boolean {
    const g = this.game, c = g.player.char, j = c.journey, b = j.bounty;
    this.progress();
    if (!b || b.have < b.need) return false;
    KINDS[b.kind ?? 'cull'].pay?.(g, b);
    j.bounty = null;
    j.bountiesDone++;
    c.gold += b.glint;
    g.combat.grantXp(b.xp);
    g.bus.emit('bounty:claimed', b);
    g.bus.emit('bounty:changed');
    this.refresh();
    return true;
  }
}
