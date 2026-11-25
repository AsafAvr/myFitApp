import type { Game } from '../game';

const LOSS = 0.2;

export class Stakes {
  private readonly game: Game;
  private dark = false;

  constructor(game: Game) {
    this.game = game;
    game.bus.on('player:died', () => this.fall());
  }

  reset(): void {
    const j = this.game.player.char.journey;
    this.dark = this.night() > 0.5;
    if (j.satchel && this.game.world === this.game.overworld) this.leave(j.satchel.x, j.satchel.z, j.satchel.n, true);
  }

  night(): number { return this.game.world === this.game.overworld ? this.game.env.night || 0 : 0; }

  private fall(): void {
    const g = this.game, p = g.player, c = p.char, j = c.journey;
    const lost = Math.floor(c.gold * LOSS);
    if (j.satchel) { for (const d of g.loot.drops) if (d.satchel) d.gone = true; j.satchel = null; }
    if (lost < 1 || g.world !== g.overworld) { g.bus.emit('fallen', { lost: 0 }); return; }
    c.gold -= lost;
    j.satchel = { x: p.x, z: p.z, n: lost };
    this.leave(p.x, p.z, lost, false);
    g.bus.emit('fallen', { lost });
  }

  private leave(x: number, z: number, n: number, resting: boolean): void {
    const d = this.game.loot.spawn({ type: 'gold', n }, x, z, x, z, true);
    d.satchel = true; d.scale = 1.5; d.name = `Your glint ×${n}`;
    if (resting) { d.age = 1; d.grow = 1; }
  }

  update(): void {
    const g = this.game, j = g.player.char.journey;
    const dark = this.night() > 0.5;
    if (dark !== this.dark) {
      this.dark = dark;
      if (!g.paused && g.world === g.overworld) g.bus.emit(dark ? 'nightfall' : 'daybreak');
    }
    if (j.satchel && g.world === g.overworld && !g.loot.drops.some((d) => d.satchel && !d.gone)) {
      const back = j.satchel.n;
      j.satchel = null;
      if (!g.player.dead) g.bus.emit('recovered', { n: back });
    }
  }
}
