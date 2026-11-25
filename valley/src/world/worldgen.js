import { WORLD } from '../config.js';
import { noise2, fbm2, ridged2, hash01 } from '../core/rng.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { BIOMES } from './biomes.js';
import { propById } from './props.js';
import { createSites } from './sites.js';
import { createFinds } from './finds.js';

const N = WORLD.CHUNK, CELL = WORLD.CELL, CPC = N / CELL;
const L = WORLD.ROAD_L;

export function createWorldGen(seed) {
  const S = seed | 0;

  function land(x, z) {
    const wx = x + 60 * noise2(x * 0.003, z * 0.003, S + 1);
    const wz = z + 60 * noise2(x * 0.003 + 31.7, z * 0.003 - 12.3, S + 2);
    return fbm2(wx * 0.0019, wz * 0.0019, 4, S + 3) * 1.6 + 0.2 + 0.75 * Math.exp(-(x * x + z * z) / 90000);
  }

  const moisture = (x, z) => clamp(0.5 + 0.95 * fbm2(x * 0.0014 - 500, z * 0.0014 + 150, 2, S + 12), 0, 1);

  function naturalHeight(x, z) {
    const e = land(x, z);
    const r0 = Math.hypot(x, z);
    let h = e < 0 ? Math.max(e * 14, -7) : 7 * (1 - Math.exp(-e * 3.0));
    const onLand = smoothstep(0, 0.12, e);
    const hillAmp = 1 + 2.6 * smoothstep(-0.2, 0.5, noise2(x * 0.0031 + 5.1, z * 0.0031 + 9.2, S + 4));
    h += fbm2(x * 0.011, z * 0.011, 4, S + 5) * hillAmp * onLand;
    let mm = smoothstep(0.08, 0.5, fbm2(x * 0.0016 + 90.1, z * 0.0016 - 40.7, 3, S + 6) + 0.12);
    mm *= smoothstep(0.1, 0.4, e) * smoothstep(150, 330, r0);
    if (mm > 0) h += mm * mm * (ridged2(x * 0.0058, z * 0.0058, 4, S + 7) * 38 + 4);
    const rv = Math.abs(fbm2(x * 0.0027 + 200.3, z * 0.0027 + 77.7, 2, S + 8));
    const chan = (1 - smoothstep(0.008, 0.04, rv)) * (1 - smoothstep(5, 10, h)) * smoothstep(70, 150, r0);
    if (chan > 0) h = lerp(h, Math.min(h, -0.55), chan);
    const basin = smoothstep(0.66, 0.82, 0.5 + 0.5 * fbm2(x * 0.006 + 70, z * 0.006 - 30, 2, S + 17)) * onLand * smoothstep(170, 300, r0) * (1 - mm);
    if (basin > 0) h = lerp(h, Math.min(h, -2.4), basin * 0.92);
    const wet = smoothstep(0.68, 0.84, moisture(x, z)) * (1 - smoothstep(3, 7.5, h)) * onLand * smoothstep(130, 250, r0);
    if (wet > 0) h = lerp(h, 0.32 + 1.15 * fbm2(x * 0.05, z * 0.05, 2, S + 16), wet);
    return h;
  }

  const sites = createSites(S, naturalHeight, (x, z, h) => BIOMES[biomeWeights(sampleClimate(x, z, h))].id);
  const finds = createFinds(S, (x, z) => height(x, z), sites);
  const opened = new Set();

  function height(x, z) {
    let h = naturalHeight(x, z);
    const s = sites.near(x, z);
    if (s) {
      const k = 1 - smoothstep(s.r, s.r + s.fade, Math.hypot(x - s.x, z - s.z));
      if (k > 0) h = lerp(h, s.h, k);
    }
    return h;
  }

  function roadDist(x, z) {
    const dx0 = x - Math.round(x / L) * L, dz0 = z - Math.round(z / L) * L;
    const f = smoothstep(24, 96, Math.hypot(dx0, dz0));
    const ax = x + 26 * f * noise2(x * 0.007, z * 0.007, S + 9);
    const az = z + 26 * f * noise2(x * 0.007 + 50, z * 0.007 + 50, S + 10);
    return Math.min(Math.abs(ax - Math.round(ax / L) * L), Math.abs(az - Math.round(az / L) * L));
  }

  const climate = { elev: 0, temp: 0, moist: 0, magic: 0, wild: 0, far: 0 };
  function sampleClimate(x, z, elev) {
    const r0 = Math.hypot(x, z);
    const home = 1 - smoothstep(110, 250, r0);
    climate.elev = elev;
    climate.temp = lerp(clamp(0.5 + 1.05 * fbm2(x * 0.0013 + 300, z * 0.0013 + 300, 2, S + 11), 0, 1), 0.5, home);
    climate.moist = lerp(moisture(x, z), 0.5, home);
    climate.magic = lerp(clamp(0.5 + 1.0 * fbm2(x * 0.0024 + 900, z * 0.0024 - 900, 2, S + 13), 0, 1), 0.45, home);
    climate.wild = lerp(clamp(0.5 + 1.05 * fbm2(x * 0.0019 + 1300, z * 0.0019 + 700, 2, S + 15), 0, 1), 0.45, home);
    climate.far = smoothstep(150, 330, r0);
    return climate;
  }

  const weights = new Float32Array(16);
  function biomeWeights(c) {
    let best = 0, bestScore = -1e9, sum = 0;
    for (let i = 0; i < BIOMES.length; i++) {
      const s = BIOMES[i].score(c);
      weights[i] = s;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    for (let i = 0; i < BIOMES.length; i++) {
      const w = Math.exp(Math.max(-30, 9 * (weights[i] - bestScore)));
      weights[i] = w; sum += w;
    }
    for (let i = 0; i < BIOMES.length; i++) weights[i] /= sum;
    return best;
  }

  const forest = (x, z) => smoothstep(-0.12, 0.3, fbm2(x * 0.009, z * 0.009, 3, S + 14));

  function cellProp(ccx, ccz) {
    const cxw = (ccx + 0.5) * CELL, czw = (ccz + 0.5) * CELL;
    const site = sites.near(cxw, czw);
    if (site && Math.hypot(cxw - site.x, czw - site.z) < site.clear) return null;
    const find = finds.near(cxw, czw);
    if (find && Math.hypot(cxw - find.x, czw - find.z) < find.clear) return null;
    const h0 = height(cxw, czw);
    if (h0 < 0.3) return null;
    if (roadDist(cxw, czw) < 4.2) return null;
    const c = sampleClimate(cxw, czw, h0);
    biomeWeights(c);
    let roll = hash01(ccx, ccz, S + 21), bi = 0;
    for (; bi < BIOMES.length - 1; bi++) { roll -= weights[bi]; if (roll <= 0) break; }
    const table = BIOMES[bi].props;
    const f = forest(cxw, czw);
    let pick = hash01(ccx, ccz, S + 22), row = null;
    for (let i = 0; i < table.length; i++) {
      pick -= lerp(table[i][1], table[i][2], f);
      if (pick <= 0) { row = table[i]; break; }
    }
    if (!row) return null;
    const def = propById(row[0]);
    const scale = lerp(def.scale[0], def.scale[1], hash01(ccx, ccz, S + 23));
    const room = Math.max(0, CELL / 2 - def.reach * scale - 0.04);
    const x = cxw + (hash01(ccx, ccz, S + 24) * 2 - 1) * room;
    const z = czw + (hash01(ccx, ccz, S + 25) * 2 - 1) * room;
    const y = height(x, z);
    if (y < (def.id === 'reeds' ? 0.05 : 0.5)) return null;
    const slope = Math.hypot(height(x + 1, z) - y, height(x, z + 1) - y);
    if (slope > (def.id === 'rock' ? 1.1 : 0.62)) return null;
    if (def.id !== 'rock' && def.id !== 'crystal' && def.id !== 'cairn' && y > 23 + 3 * hash01(ccx, ccz, S + 27)) return null;
    let pal = row[3];
    if (pal === undefined) {
      const set = BIOMES[bi].leaf;
      const district = 0.5 + 0.5 * fbm2(x * 0.004 + 40, z * 0.004 - 80, 2, S + 29);
      const stray = hash01(ccx, ccz, S + 30);
      pal = set[Math.floor((stray < 0.22 ? hash01(ccx, ccz, S + 31) : clamp(district * 1.6 - 0.3, 0, 0.999)) * set.length)];
    }
    return {
      def, type: def.type, x, y: y - 0.06, z, scale,
      rot: hash01(ccx, ccz, S + 26) * 6.2832, seed: hash01(ccx, ccz, S + 28), pal,
    };
  }

  function structureProps(site) {
    if (site.built) return site.built;
    site.built = site.structures.map((s, i) => {
      const def = propById(s.id);
      return {
        def, type: def.type, x: s.x, y: height(s.x, s.z) - 0.04, z: s.z, scale: s.scale || 1,
        rot: s.rot || 0, seed: s.seed ?? hash01(i, site.i * 31 + site.j, S + 40), pal: s.pal || 0, site,
        ...(def.id === 'chest' && opened.has(site.key) ? { pal: 1 } : null),
      };
    });
    return site.built;
  }

  function generateChunk(cx, cz) {
    const x0 = cx * N, z0 = cz * N;
    const M = N + 2;
    const hgrid = new Float32Array(M * M);
    let minH = 1e9, maxH = -1e9;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const h = height(x0 + i - 1, z0 + j - 1);
      hgrid[j * M + i] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }

    const Q = 4, QN = N / Q + 1;
    const clim = new Float32Array(QN * QN * 4);
    for (let j = 0; j < QN; j++) for (let i = 0; i < QN; i++) {
      const c = sampleClimate(x0 + i * Q, z0 + j * Q, 0);
      clim.set([c.temp, c.moist, c.magic, c.wild], (j * QN + i) * 4);
    }
    const climAt = (i, j, k) => {
      const fx = i / Q, fz = j / Q, ix = Math.min(fx | 0, QN - 2), iz = Math.min(fz | 0, QN - 2);
      const tx = fx - ix, tz = fz - iz, o = (iz * QN + ix) * 4 + k;
      const a = lerp(clim[o], clim[o + 4], tx), b = lerp(clim[o + QN * 4], clim[o + QN * 4 + 4], tx);
      return lerp(a, b, tz);
    };

    const chunk = {
      cx, cz, minH, maxH,
      height: new Float32Array(N * N * 4),
      color: new Uint8Array(N * N * 4),
      mat: new Uint8Array(N * N * 4),
      propsA: new Float32Array(CPC * CPC * 4),
      propsB: new Uint8Array(CPC * CPC * 4),
      biome: new Uint8Array(N * N),
      props: [],
    };

    const site = sites.near(x0 + N / 2, z0 + N / 2);
    const far = smoothstep(150, 330, Math.hypot(x0 + N / 2, z0 + N / 2));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + i, z = z0 + j, o = (j * N + i) * 4;
      const h = hgrid[(j + 1) * M + i + 1];
      const slope = Math.hypot((hgrid[(j + 1) * M + i + 2] - hgrid[(j + 1) * M + i]) / 2,
                               (hgrid[(j + 2) * M + i + 1] - hgrid[j * M + i + 1]) / 2);
      climate.elev = h; climate.temp = climAt(i, j, 0); climate.moist = climAt(i, j, 1); climate.magic = climAt(i, j, 2);
      climate.wild = climAt(i, j, 3); climate.far = far;
      chunk.biome[j * N + i] = biomeWeights(climate);

      const vary = 0.5 + 0.5 * fbm2(x * 0.045, z * 0.045, 2, S + 30);
      let r = 0, g = 0, b = 0, grass = 0, sand = 0, flowers = 0, rr = 0, rg = 0, rb = 0, cold = 0;
      for (let k = 0; k < BIOMES.length; k++) {
        const w = weights[k];
        if (w < 0.004) continue;
        const B = BIOMES[k];
        r += w * lerp(B.ground[0], B.ground2[0], vary);
        g += w * lerp(B.ground[1], B.ground2[1], vary);
        b += w * lerp(B.ground[2], B.ground2[2], vary);
        rr += w * B.rock[0]; rg += w * B.rock[1]; rb += w * B.rock[2];
        grass += w * B.grass; sand += w * B.sand; flowers += w * B.flowers; cold += w * B.snow;
      }

      const beach = 1 - smoothstep(0.35, 1.3, h);
      if (beach > 0) { r = lerp(r, 0.886, beach); g = lerp(g, 0.76, beach); b = lerp(b, 0.55, beach); }
      sand = Math.max(sand, beach); grass *= 1 - beach;
      const rock = smoothstep(0.62, 1.0, slope) * smoothstep(0.2, 1.5, h);
      r = lerp(r, rr, rock); g = lerp(g, rg, rock); b = lerp(b, rb, rock);
      const drift = noise2(x * 0.05, z * 0.05, S + 31);
      const snow = Math.max(smoothstep(21, 26, h + 3 * drift), cold * smoothstep(-0.75, 0.1, drift + (h > 0.3 ? 0.4 : -1))) * (1 - rock * 0.75);
      r = lerp(r, 0.93, snow); g = lerp(g, 0.95, snow); b = lerp(b, 1.0, snow);

      let path = (1 - smoothstep(1.3, 2.6, roadDist(x, z))) * smoothstep(0.1, 0.5, h) * (1 - smoothstep(0.55, 0.8, slope));
      let paved = 0;
      if (site) {
        const d = Math.hypot(x - site.x, z - site.z);
        const yard = 1 - smoothstep(site.plaza - 1.2, site.plaza + 0.6, d + 1.2 * noise2(x * 0.3, z * 0.3, S + 32));
        if (site.ground === 'dirt') path = Math.max(path, yard);
        else paved = yard;
      }
      if (path > 0) { r = lerp(r, 0.886, path * 0.9); g = lerp(g, 0.737, path * 0.9); b = lerp(b, 0.51, path * 0.9); }
      if (paved > 0) { r = lerp(r, 0.925, paved); g = lerp(g, 0.78, paved); b = lerp(b, 0.69, paved); }
      path = Math.max(path * 0.5, paved);
      const bare = Math.max(rock, snow, Math.max(path * 2, paved));
      grass *= 1 - Math.min(1, bare);

      chunk.height[o] = h;
      chunk.height[o + 2] = flowers * grass;
      chunk.height[o + 3] = smoothstep(0.9, 0.0, h);
      chunk.color[o] = r * 255; chunk.color[o + 1] = g * 255; chunk.color[o + 2] = b * 255; chunk.color[o + 3] = path * 255;
      chunk.mat[o] = grass * 255; chunk.mat[o + 1] = sand * (1 - rock) * 255; chunk.mat[o + 2] = snow * 255; chunk.mat[o + 3] = rock * 255;
    }

    const gcx = cx * CPC, gcz = cz * CPC;
    const shade = (p) => {
      const R = p.def.reach * p.scale * 1.35, strength = Math.min(0.85, 0.3 + p.def.height * 0.12);
      const i0 = Math.max(0, Math.floor(p.x - R - x0)), i1 = Math.min(N - 1, Math.ceil(p.x + R - x0));
      const j0 = Math.max(0, Math.floor(p.z - R - z0)), j1 = Math.min(N - 1, Math.ceil(p.z + R - z0));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const v = strength * (1 - smoothstep(0.35 * R, R, Math.hypot(x0 + i - p.x, z0 + j - p.z)));
        const o = (j * N + i) * 4 + 1;
        if (v > chunk.height[o]) chunk.height[o] = v;
      }
    };
    const stamp = (p, ci, cj) => {
      const o = (cj * CPC + ci) * 4;
      if (chunk.propsA[o + 3] !== 0) return false;
      chunk.propsA[o] = p.x - (x0 + (ci + 0.5) * CELL);
      chunk.propsA[o + 1] = p.z - (z0 + (cj + 0.5) * CELL);
      chunk.propsA[o + 2] = p.y;
      chunk.propsA[o + 3] = p.type;
      chunk.propsB[o] = ((p.rot / 6.2832) % 1 + 1) % 1 * 255;
      chunk.propsB[o + 1] = clamp(p.scale / 2, 0, 1) * 255;
      chunk.propsB[o + 2] = p.seed * 255;
      chunk.propsB[o + 3] = p.pal;
      return true;
    };

    const made = [];
    if (site && Math.hypot(site.x - (x0 + N / 2), site.z - (z0 + N / 2)) < site.clear + N) made.push(site);
    for (const f of finds.inRange(x0 + N / 2, z0 + N / 2, N)) made.push(f);
    for (const site of made) {
      for (const p of structureProps(site)) {
        const R = p.def.reach * p.scale;
        if (p.x + R < x0 - 2 || p.x - R > x0 + N + 2 || p.z + R < z0 - 2 || p.z - R > z0 + N + 2) continue;
        shade(p);
        if (p.x >= x0 && p.x < x0 + N && p.z >= z0 && p.z < z0 + N) chunk.props.push(p);
        for (let cj = 0; cj < CPC; cj++) for (let ci = 0; ci < CPC; ci++) {
          const nx = clamp(p.x, x0 + ci * CELL, x0 + (ci + 1) * CELL), nz = clamp(p.z, z0 + cj * CELL, z0 + (cj + 1) * CELL);
          if (Math.hypot(nx - p.x, nz - p.z) < R && !stamp(p, ci, cj)) {
            console.warn(`${site.name}: ${p.def.id} overlaps another structure in one cell`);
          }
        }
      }
    }
    for (let cj = -1; cj <= CPC; cj++) for (let ci = -1; ci <= CPC; ci++) {
      const p = cellProp(gcx + ci, gcz + cj);
      if (!p) continue;
      shade(p);
      if (ci < 0 || cj < 0 || ci >= CPC || cj >= CPC) continue;
      if (stamp(p, ci, cj)) chunk.props.push(p);
    }
    for (const p of chunk.props) if (p.y + p.def.height * p.scale > chunk.maxH) chunk.maxH = p.y + p.def.height * p.scale;
    return chunk;
  }

  return { seed: S, height, naturalHeight, roadDist, sampleClimate, biomeWeights, generateChunk, sites, finds, opened, forest };
}
