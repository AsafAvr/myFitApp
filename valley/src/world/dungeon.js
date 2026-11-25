import { WORLD } from '../config.js';
import { hash01, mulberry32, noise2 } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';
import { biomeById } from './biomes.js';
import { propById } from './props.js';

const N = WORLD.CHUNK, CELL = WORLD.CELL, CPC = N / CELL;
export const TILE = CELL;
const GRID = 30;
const FLOOR = 2, WALL = 6.2;
const ROCK = 0, OPEN = 1, POOL = 2;

export const DUNGEON_THEMES = {
  crypt: {
    biome: 'crypt', floor: [0.70, 0.65, 0.58], floor2: [0.62, 0.59, 0.54], path: 1, sand: 0, moss: 0.05,
    wobble: 0, torch: 0.9, decor: [['pillar', 1.0], ['cairn', 0.35], ['stone', 0.35]], pools: 0,
  },
  cave: {
    biome: 'cave', floor: [0.62, 0.54, 0.44], floor2: [0.55, 0.50, 0.43], path: 0.5, sand: 0.35, moss: 0.25,
    wobble: 1.7, torch: 0.45, decor: [['rock', 1.0], ['crystal', 0.3], ['mushroom', 0.35], ['stump', 0.15]], pools: 2,
  },
};

export function createDungeonGen({ seed, theme = 'crypt' }) {
  const S = seed | 0;
  const T = DUNGEON_THEMES[theme] || DUNGEON_THEMES.crypt;
  const biomeIndex = biomeById(T.biome).index;
  const rnd = mulberry32(S);
  const grid = new Uint8Array(GRID * GRID);
  const roomOf = new Int16Array(GRID * GRID).fill(-1);
  const at = (tx, tz) => (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID ? ROCK : grid[tz * GRID + tx]);

  const rooms = [];
  for (let t = 0; t < 400 && rooms.length < 9; t++) {
    const w = 3 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 4);
    const x = 1 + Math.floor(rnd() * (GRID - w - 2)), z = 1 + Math.floor(rnd() * (GRID - h - 2));
    if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
    rooms.push({ x, z, w, h, links: 0 });
  }
  rooms.forEach((r, i) => {
    for (let j = r.z; j < r.z + r.h; j++) for (let k = r.x; k < r.x + r.w; k++) { grid[j * GRID + k] = OPEN; roomOf[j * GRID + k] = i; }
  });
  const centre = (r) => [r.x + Math.floor(r.w / 2), r.z + Math.floor(r.h / 2)];

  const carve = (a, b) => {
    const [ax, az] = centre(a), [bx, bz] = centre(b);
    const across = rnd() < 0.5;
    const run = (x0, z0, x1, z1) => {
      const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
      let x = x0, z = z0;
      for (;;) { if (grid[z * GRID + x] === ROCK) grid[z * GRID + x] = OPEN; if (x === x1 && z === z1) break; if (x !== x1) x += dx; else z += dz; }
    };
    if (across) { run(ax, az, bx, az); run(bx, az, bx, bz); } else { run(ax, az, ax, bz); run(ax, bz, bx, bz); }
    a.links++; b.links++;
  };
  const dist = (a, b) => { const [ax, az] = centre(a), [bx, bz] = centre(b); return Math.abs(ax - bx) + Math.abs(az - bz); };
  const inTree = [0], edges = [];
  while (inTree.length < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.includes(j)) continue;
      const d = dist(rooms[i], rooms[j]);
      if (!best || d < best.d) best = { i, j, d };
    }
    inTree.push(best.j);
    edges.push([best.i, best.j]);
  }
  for (const [i, j] of edges) carve(rooms[i], rooms[j]);
  for (let k = 0; k < 2 && rooms.length > 4; k++) {
    const i = Math.floor(rnd() * rooms.length), j = Math.floor(rnd() * rooms.length);
    if (i !== j && dist(rooms[i], rooms[j]) < 14) carve(rooms[i], rooms[j]);
  }

  const order = rooms.map((_, i) => i).sort((a, b) => (rooms[b].z + rooms[b].h) - (rooms[a].z + rooms[a].h));
  const entrance = order[0];
  const steps = new Int32Array(GRID * GRID).fill(-1);
  {
    const [sx, sz] = centre(rooms[entrance]);
    const q = [sz * GRID + sx];
    steps[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % GRID, z = (c / GRID) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, n = nz * GRID + nx;
        if (at(nx, nz) !== ROCK && steps[n] < 0) { steps[n] = steps[c] + 1; q.push(n); }
      }
    }
  }
  const walk = (i) => { const [x, z] = centre(rooms[i]); return steps[z * GRID + x]; };
  let boss = -1, bs = -1;
  rooms.forEach((r, i) => { if (i === entrance) return; const s = walk(i) + r.w * r.h * 0.4; if (s > bs) { bs = s; boss = i; } });
  let hoard = -1, hs = -1;
  rooms.forEach((r, i) => { if (i === entrance || i === boss) return; const s = walk(i) + (r.links <= 1 ? 20 : 0); if (s > hs) { hs = s; hoard = i; } });
  let pools = T.pools;
  rooms.forEach((r, i) => {
    if (pools <= 0 || i === entrance || i === boss || i === hoard || r.w < 5 || r.h < 4) return;
    pools--;
    const px = r.x + 1 + Math.floor(rnd() * (r.w - 3)), pz = r.z + 1 + Math.floor(rnd() * (r.h - 3));
    for (let j = pz; j < pz + 2; j++) for (let k = px; k < px + 2; k++) grid[j * GRID + k] = POOL;
  });

  const kinds = rooms.map((_, i) => (i === entrance ? 'entrance' : i === boss ? 'boss' : i === hoard ? 'hoard' : 'hall'));
  const world = (tx, tz) => [tx * TILE + TILE / 2, tz * TILE + TILE / 2];
  const roomsOut = rooms.map((r, i) => {
    const [cx, cz] = centre(r), [x, z] = world(cx, cz);
    return { kind: kinds[i], x, z, x0: r.x * TILE, z0: r.z * TILE, x1: (r.x + r.w) * TILE, z1: (r.z + r.h) * TILE, tiles: r.w * r.h, index: i };
  });

  function tileAtWorld(x, z) {
    let sx = x, sz = z;
    if (T.wobble) { sx += noise2(x * 0.19, z * 0.19, S + 3) * T.wobble; sz += noise2(x * 0.19 + 40, z * 0.19 - 17, S + 4) * T.wobble; }
    return at(Math.floor(sx / TILE), Math.floor(sz / TILE));
  }
  function height(x, z) {
    const t = tileAtWorld(x, z);
    if (t === ROCK) return WALL + noise2(x * 0.3, z * 0.3, S + 5) * 0.35;
    if (t === POOL) return -0.55;
    return FLOOR + noise2(x * 0.15, z * 0.15, S + 6) * 0.1;
  }

  const opened = new Set();
  const hoardKey = `d${S}:hoard`;

  function tileProp(tx, tz) {
    const t = at(tx, tz);
    if (t !== OPEN) return null;
    const ri = roomOf[tz * GRID + tx];
    const room = ri >= 0 ? rooms[ri] : null;
    const [cx, cz] = world(tx, tz);
    const h = (k) => hash01(tx * 7 + k, tz * 13 - k, S + 900 + k);
    if (room) {
      const [rx, rz] = centre(room);
      if (tx === rx && tz === rz) {
        if (ri === entrance) return { id: 'waystone', x: cx, z: cz, rot: 0, scale: 0.9, seed: 0.3 };
        if (ri === hoard) return { id: 'chest', x: cx, z: cz, rot: h(1) * 6.28, pal: opened.has(hoardKey) ? 1 : 0, key: hoardKey };
        return null;
      }
      if (ri === boss && theme === 'crypt' && (tx === room.x || tx === room.x + room.w - 1) && (tz === room.z || tz === room.z + room.h - 1)) {
        return { id: 'pillar', x: cx, z: cz, rot: h(2) * 6.28, seed: 0.9 };
      }
    }
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => at(tx + dx, tz + dz) === ROCK);
    if (walls.length && h(3) < T.torch * 0.42 && (tx + tz) % 2 === 0) {
      const [dx, dz] = walls[Math.floor(h(4) * walls.length)];
      const x = cx + dx * 1.35, z = cz + dz * 1.35;
      return { id: 'torch', x, z, rot: Math.atan2(dx, -dz), seed: h(5) };
    }
    if (room && walls.length && h(6) < 0.28) {
      const [id] = T.decor.find(([, w], k) => h(7 + k) < w * 0.5) || [];
      if (!id) return null;
      const def = propById(id);
      const room_ = Math.max(0, CELL / 2 - def.reach * 1 - 0.1);
      return { id, x: cx + (h(12) * 2 - 1) * room_, z: cz + (h(13) * 2 - 1) * room_, rot: h(14) * 6.28, seed: h(15), scale: lerp(def.scale[0], def.scale[1], h(16)) };
    }
    return null;
  }

  function generateChunk(cx, cz) {
    const x0 = cx * N, z0 = cz * N;
    const chunk = {
      cx, cz, minH: 1e9, maxH: -1e9,
      height: new Float32Array(N * N * 4), color: new Uint8Array(N * N * 4), mat: new Uint8Array(N * N * 4),
      propsA: new Float32Array(CPC * CPC * 4), propsB: new Uint8Array(CPC * CPC * 4),
      biome: new Uint8Array(N * N).fill(biomeIndex), props: [],
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + i, z = z0 + j, o = (j * N + i) * 4;
      const h = height(x, z);
      const wall = h > FLOOR + 1.6;
      let near = 0;
      if (!wall) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, -3], [3, -3], [-3, 3]]) if (height(x + dx, z + dz) > FLOOR + 1.6) near++;
      const vary = 0.5 + 0.5 * noise2(x * 0.09, z * 0.09, S + 7);
      chunk.height[o] = h;
      chunk.height[o + 1] = wall ? 0 : Math.min(0.55, near * 0.09);
      chunk.height[o + 2] = 0;
      chunk.height[o + 3] = h < 0.6 ? 1 : 0;
      const g = wall ? [0.55, 0.52, 0.5] : [lerp(T.floor[0], T.floor2[0], vary), lerp(T.floor[1], T.floor2[1], vary), lerp(T.floor[2], T.floor2[2], vary)];
      chunk.color[o] = g[0] * 255; chunk.color[o + 1] = g[1] * 255; chunk.color[o + 2] = g[2] * 255;
      chunk.color[o + 3] = wall || h < 0.6 ? 0 : T.path * 255;
      const moss = wall ? 0 : clamp(T.moss * (0.5 + noise2(x * 0.2, z * 0.2, S + 8)), 0, 1);
      chunk.mat[o] = moss * 255; chunk.mat[o + 1] = wall ? 0 : T.sand * 255; chunk.mat[o + 2] = 0; chunk.mat[o + 3] = wall ? 255 : 0;
      if (h < chunk.minH) chunk.minH = h;
      if (h > chunk.maxH) chunk.maxH = h;
    }
    const gcx = cx * CPC, gcz = cz * CPC;
    for (let cj = 0; cj < CPC; cj++) for (let ci = 0; ci < CPC; ci++) {
      const s = tileProp(gcx + ci, gcz + cj);
      if (!s) continue;
      const def = propById(s.id);
      const p = {
        def, type: def.type, x: s.x, y: height(s.x, s.z) - 0.04, z: s.z, scale: s.scale || 1,
        rot: s.rot || 0, seed: s.seed ?? 0.5, pal: s.pal || 0, key: s.key,
      };
      const o = (cj * CPC + ci) * 4;
      chunk.propsA[o] = p.x - (x0 + (ci + 0.5) * CELL);
      chunk.propsA[o + 1] = p.z - (z0 + (cj + 0.5) * CELL);
      chunk.propsA[o + 2] = p.y;
      chunk.propsA[o + 3] = p.type;
      chunk.propsB[o] = ((p.rot / 6.2832) % 1 + 1) % 1 * 255;
      chunk.propsB[o + 1] = clamp(p.scale / 2, 0, 1) * 255;
      chunk.propsB[o + 2] = p.seed * 255;
      chunk.propsB[o + 3] = p.pal;
      chunk.props.push(p);
      chunk.maxH = Math.max(chunk.maxH, p.y + def.height * p.scale);
    }
    return chunk;
  }

  const none = { siteAt: () => null, near: () => null, inRange: () => [] };
  const room = (kind) => roomsOut.find((r) => r.kind === kind);
  return {
    seed: S, theme, height, generateChunk, opened, hoardKey,
    sites: none, finds: { findAt: () => null, near: () => null, inRange: () => [] },
    rooms: roomsOut,
    entrance: room('entrance'), boss: room('boss'), hoard: room('hoard'),
    size: GRID * TILE,
    open: (x, z) => tileAtWorld(x, z) === OPEN && height(x, z) > 1,
  };
}
