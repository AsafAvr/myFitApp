import { WORLD } from '../config.js';
import { BIOMES } from './biomes.js';
import { createWorldGen } from './worldgen.js';

const N = WORLD.CHUNK;
const keyOf = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

export class World {
  constructor(seed, gen) {
    this.seed = seed;
    this.gen = gen || createWorldGen(seed);
    this.sites = this.gen.sites;
    this.finds = this.gen.finds;
    this.chunks = new Map();
    this.last = null;
  }

  chunk(cx, cz) {
    const last = this.last;
    if (last && last.cx === cx && last.cz === cz) return last;
    const k = keyOf(cx, cz);
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = this.gen.generateChunk(cx, cz)));
    return (this.last = c);
  }

  openFind(find) {
    this.gen.opened.add(find.key);
    find.built = null;
    const cx = Math.floor(find.x / N), cz = Math.floor(find.z / N);
    this.chunks.delete(keyOf(cx, cz));
    this.last = null;
    return [cx, cz];
  }

  refreshAt(x, z) {
    const cx = Math.floor(x / N), cz = Math.floor(z / N);
    this.chunks.delete(keyOf(cx, cz));
    this.last = null;
    return [cx, cz];
  }

  prune(x, z, keepChunks = 14) {
    if (this.chunks.size < 700) return;
    const pcx = Math.floor(x / N), pcz = Math.floor(z / N);
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > keepChunks || Math.abs(c.cz - pcz) > keepChunks) this.chunks.delete(k);
    }
    this.last = null;
  }

  texel(ix, iz) {
    const cx = Math.floor(ix / N), cz = Math.floor(iz / N);
    return this.chunk(cx, cz).height[((iz - cz * N) * N + (ix - cx * N)) * 4];
  }

  height(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const a = this.texel(ix, iz), b = this.texel(ix + 1, iz);
    const c = this.texel(ix, iz + 1), d = this.texel(ix + 1, iz + 1);
    return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fz;
  }

  surface(x, z) { return Math.max(this.height(x, z), WORLD.SEA); }
  waterDepth(x, z) { return Math.max(0, WORLD.SEA - this.height(x, z)); }

  slope(x, z) {
    return Math.hypot(this.height(x + 0.6, z) - this.height(x - 0.6, z), this.height(x, z + 0.6) - this.height(x, z - 0.6)) / 1.2;
  }

  biome(x, z) {
    const ix = Math.round(x), iz = Math.round(z);
    const cx = Math.floor(ix / N), cz = Math.floor(iz / N);
    return BIOMES[this.chunk(cx, cz).biome[(iz - cz * N) * N + (ix - cx * N)]];
  }

  walkable(x, z) {
    return this.height(x, z) > WORLD.SEA - 0.75 && this.slope(x, z) < 0.95;
  }

  forEachProp(x, z, radius, fn) {
    const m = radius + 4;
    const cx0 = Math.floor((x - m) / N), cx1 = Math.floor((x + m) / N);
    const cz0 = Math.floor((z - m) / N), cz1 = Math.floor((z + m) / N);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const props = this.chunk(cx, cz).props;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz <= m * m) fn(p);
      }
    }
  }

  moveCircle(x, z, dx, dz, radius, out) {
    let nx = x + dx, nz = z + dz;
    if (!this.walkable(nx, nz)) {
      if (this.walkable(nx, z)) nz = z;
      else if (this.walkable(x, nz)) nx = x;
      else { nx = x; nz = z; }
    }
    this.forEachProp(nx, nz, radius, (p) => {
      const cr = p.def.collide * p.scale;
      if (cr <= 0) return;
      const ox = nx - p.x, oz = nz - p.z, d = Math.hypot(ox, oz), min = cr + radius;
      if (d < min && d > 1e-4) { nx = p.x + ox / d * min; nz = p.z + oz / d * min; }
    });
    out.x = nx; out.z = nz;
    return out;
  }

  raycast(ro, rd, maxDist = 220) {
    let t = 0;
    for (let i = 0; i < 260 && t < maxDist; i++) {
      const x = ro[0] + rd[0] * t, y = ro[1] + rd[1] * t, z = ro[2] + rd[2] * t;
      const above = y - this.surface(x, z);
      if (above < 0.02) return { x, y: y - above, z, t };
      t += Math.max(0.05, above * 0.45);
    }
    return null;
  }
}
