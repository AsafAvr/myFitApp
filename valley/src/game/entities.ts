import type { AnyEntity, EntityBase, EntityKind, Pencils, Vec3 } from './types';

export const yawFromDir = (dx: number, dz: number): number => Math.atan2(-dx, dz);
export const dirFromYaw = (yaw: number): [number, number] => [-Math.sin(yaw), Math.cos(yaw)];

export const pencils = (list: [number, number, number][]): Pencils =>
  list.map((c) => c.map((v) => v / 255) as Vec3) as Pencils;

let seedCounter = 1;
const nextSeed = () => { seedCounter = (seedCounter * 16807) % 2147483647; return seedCounter / 2147483647; };

export function baseEntity(kind: EntityKind, archetype: string): EntityBase {
  return {
    id: 0, kind, archetype,
    x: 0, y: 0, z: 0, yaw: 0, scale: 1, grow: 1,
    radius: 0.4, height: 1.4,
    move: 0, walk: 0,
    action: 0, actionT: 0, actionDur: 0.4,
    flash: 0, shade: 1, seed: nextSeed(),
    colors: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], extra: 0, lift: 0,
    ghost: false, hover: false, dead: false, gone: false,
    name: '', level: 1,
  };
}

export class Entities {
  readonly list: AnyEntity[] = [];
  private readonly byId = new Map<number, AnyEntity>();
  private nextId = 1;

  add<T extends AnyEntity>(e: T): T {
    e.id = this.nextId++;
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  sweep(): void {
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.gone) this.byId.delete(e.id); else list[w++] = e;
    }
    list.length = w;
  }

  clear(keep: (e: AnyEntity) => boolean): void {
    for (const e of this.list) if (!keep(e)) e.gone = true;
    this.sweep();
  }

  nearest<K extends EntityKind>(kind: K, x: number, z: number, range: number, filter?: (e: Extract<AnyEntity, { kind: K }>) => boolean): Extract<AnyEntity, { kind: K }> | null {
    let best: Extract<AnyEntity, { kind: K }> | null = null, bd = range;
    for (const e of this.list) {
      if (e.kind !== kind || e.dead) continue;
      const t = e as Extract<AnyEntity, { kind: K }>;
      if (filter && !filter(t)) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
}
