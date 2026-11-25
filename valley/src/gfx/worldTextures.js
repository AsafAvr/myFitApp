import { WORLD } from '../config.js';
import { createTexture } from './gl.js';

const T = WORLD.TEX, N = WORLD.CHUNK, S = T / N;
const C = T / WORLD.CELL, CN = N / WORLD.CELL;

export class WorldTextures {
  constructor(gl, world) {
    this.gl = gl;
    this.world = world;
    const tex = (size, internal, type, filter) => createTexture(gl, {
      width: size, height: size, internal, format: gl.RGBA, type, filter, wrap: gl.REPEAT,
    });
    this.height = tex(T, gl.RGBA16F, gl.FLOAT, gl.LINEAR);
    this.color = tex(T, gl.RGBA8, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.mat = tex(T, gl.RGBA8, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.propsA = tex(C, gl.RGBA16F, gl.FLOAT, gl.NEAREST);
    this.propsB = tex(C, gl.RGBA8, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.slots = new Array(S * S).fill(null);
    this.maxY = 40;
    this.pending = [];
  }

  setWorld(world) {
    this.world = world;
    this.slots.fill(null);
  }

  update(x, z, budget = 2) {
    const pcx = Math.floor(x / N + 0.5), pcz = Math.floor(z / N + 0.5);
    const missing = this.pending;
    missing.length = 0;
    let maxY = -1e9;
    for (let cz = pcz - S / 2; cz < pcz + S / 2; cz++) for (let cx = pcx - S / 2; cx < pcx + S / 2; cx++) {
      const si = ((cz % S + S) % S) * S + ((cx % S + S) % S);
      const slot = this.slots[si];
      if (slot && slot.cx === cx && slot.cz === cz) { if (slot.maxH > maxY) maxY = slot.maxH; continue; }
      missing.push({ cx, cz, si, d: Math.hypot(cx + 0.5 - x / N, cz + 0.5 - z / N) });
    }
    missing.sort((a, b) => a.d - b.d);
    const n = Math.min(budget, missing.length);
    for (let i = 0; i < n; i++) {
      const m = missing[i];
      const chunk = this.world.chunk(m.cx, m.cz);
      this.upload(chunk, m.si);
      if (chunk.maxH > maxY) maxY = chunk.maxH;
    }
    this.maxY = maxY + 0.5;
    return missing.length - n;
  }

  refresh(cx, cz) {
    const si = ((cz % S + S) % S) * S + ((cx % S + S) % S);
    const slot = this.slots[si];
    if (slot && slot.cx === cx && slot.cz === cz) this.upload(this.world.chunk(cx, cz), si);
  }

  upload(chunk, si) {
    const gl = this.gl;
    const sx = si % S, sz = (si / S) | 0;
    const put = (tex, size, type, data) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * size, sz * size, size, size, gl.RGBA, type, data);
    };
    put(this.height, N, gl.FLOAT, chunk.height);
    put(this.color, N, gl.UNSIGNED_BYTE, chunk.color);
    put(this.mat, N, gl.UNSIGNED_BYTE, chunk.mat);
    put(this.propsA, CN, gl.FLOAT, chunk.propsA);
    put(this.propsB, CN, gl.UNSIGNED_BYTE, chunk.propsB);
    this.slots[si] = { cx: chunk.cx, cz: chunk.cz, maxH: chunk.maxH };
  }

  bind(program) {
    program.tex('uHeightTex', this.height).tex('uColorTex', this.color).tex('uMatTex', this.mat)
      .tex('uPropTexA', this.propsA).tex('uPropTexB', this.propsB).set('uMaxY', this.maxY);
  }
}
