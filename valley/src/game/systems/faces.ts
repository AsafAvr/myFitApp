import type { Game } from '../game';
import type { Npc } from '../types';

export const FACE = { content: 0, focused: 1, hurt: 2, joy: 3, worried: 4, surprised: 5, fallen: 6 } as const;
export type Face = typeof FACE[keyof typeof FACE];

const WEIGHT: Record<Face, number> = { 0: 0, 1: 1, 4: 2, 3: 3, 5: 4, 2: 5, 6: 6 };

export class Faces {
  private readonly game: Game;
  private moment: Face = FACE.content;
  private left = 0;
  private readonly cheer = new Map<Npc, number>();

  constructor(game: Game) {
    this.game = game;
    const bus = game.bus;
    bus.on('damage', (d) => { if (d.target === game.player && !d.dot && !d.blocked && d.amount > 0) this.feel(FACE.hurt, 0.55); });
    bus.on('levelup', () => this.feel(FACE.joy, 2.4));
    bus.on('item:legendary', () => this.feel(FACE.joy, 1.8));
    bus.on('dungeon:cleared', () => this.feel(FACE.joy, 2.4));
    bus.on('bounty:claimed', () => this.feel(FACE.joy, 1.8));
    bus.on('boon', () => this.feel(FACE.joy, 1.4));
    bus.on('evade', () => this.feel(FACE.surprised, 0.4));
    bus.on('boss:spawn', () => this.feel(FACE.surprised, 1.4));
    bus.on('npc:talk', (n) => this.cheer.set(n, 2.6));
  }

  feel(face: Face, seconds: number): void {
    if (this.left > 0 && WEIGHT[face] < WEIGHT[this.moment]) return;
    this.moment = face;
    this.left = seconds;
  }

  reset(): void {
    this.moment = FACE.content;
    this.left = 0;
    this.cheer.clear();
  }

  update(dt: number): void {
    const p = this.game.player;
    this.left = Math.max(0, this.left - dt);
    p.face = p.dead ? FACE.fallen
      : this.left > 0 ? this.moment
      : p.cast ? FACE.focused
      : p.hp < p.maxHp * 0.3 ? FACE.worried
      : FACE.content;
    for (const [npc, t] of this.cheer) {
      const left = t - dt;
      if (left <= 0 || npc.gone) { npc.face = FACE.content; this.cheer.delete(npc); }
      else { npc.face = FACE.joy; this.cheer.set(npc, left); }
    }
  }
}
