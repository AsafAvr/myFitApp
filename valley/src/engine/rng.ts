export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  static hash(text: string, salt = 0): number {
    let h = (0x811c9dc5 ^ salt) >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  angle(): number { return this.next() * Math.PI * 2; }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }

  weighted<T>(rows: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const r of rows) total += Math.max(0, r[1]);
    let roll = this.next() * total;
    for (const r of rows) {
      roll -= Math.max(0, r[1]);
      if (roll < 0) return r[0];
    }
    return rows[rows.length - 1][0];
  }

  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  uid(prefix = ''): string {
    const a = Math.floor(this.next() * 0xffffffff).toString(36);
    const b = Math.floor(this.next() * 0xffffffff).toString(36);
    return prefix + a + b;
  }
}
