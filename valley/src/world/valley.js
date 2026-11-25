import { WORLD } from '../config.js';
import { propById } from './props.js';

const CELL = WORLD.CELL;
const SLOTS = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
const places = new Map();

export function setValley(list) {
  places.clear();
  list.slice(0, SLOTS.length).forEach((p, k) => places.set(SLOTS[k].join(','), { ...p, i: SLOTS[k][0], j: SLOTS[k][1] }));
}
export const valleyPlaceAt = (i, j) => places.get(i + ',' + j) ?? null;
export const valleyPlaces = () => [...places.values()];

const NAMES = {
  tree: (n) => `${n} Oak`, trail: (n) => `${n} Lane`, windmill: (n) => `${n} Mill`, pond: (n) => `${n} Pond`,
  tower: (n) => `Stones of ${n}`, garden: (n) => `${n} Garden`, library: (n) => `${n} Library`, cairn: (n) => `${n} Cairn`,
};
export const valleySiteName = (kind, name) => (NAMES[kind] ?? ((n) => n))(name);

const at = (from, id, x, z, extra = {}) => ({ from, id, x, z, ...extra });
const RECIPES = {
  tree: [
    at(1, 'greattree', 0, -14, { seed: 0.5, rot: 0 }), at(0, 'bush', 2, -10, { to: 0, scale: 0.55 }),
    at(3, 'stone', -10, -6, { scale: 0.8 }), at(4, 'stone', 10, -6, { scale: 0.8 }), at(5, 'lamp', -6, 6), at(6, 'lamp', 6, -6),
  ],
  trail: [
    at(1, 'stump', -10, 10), at(2, 'fence', -14, 6, { rot: 0 }), at(2, 'fence', -10, 6, { rot: 0 }), at(3, 'fence', -6, 6, { rot: 0 }),
    at(3, 'fence', 6, 6, { rot: 0 }), at(4, 'fence', 10, 6, { rot: 0 }), at(4, 'scarecrow', 10, 10), at(5, 'fence', 14, 6, { rot: 0 }),
    at(5, 'haystack', 14, 10), at(6, 'house', -10, -10, { seed: 0.3 }),
  ],
  windmill: [
    at(1, 'haystack', -10, 10, { scale: 0.85 }), at(2, 'haystack', -14, 14, { scale: 0.95 }),
    at(3, 'windmill', 10, -10, { grow: [0.75, 0.95, 1.15, 1.3] }), at(4, 'scarecrow', -10, -6), at(5, 'fence', -6, 10, { rot: 0 }),
    at(6, 'house', -10, -14, { seed: 0.7 }),
  ],
  pond: [
    at(1, 'reeds', 6, 10), at(2, 'reeds', 10, 10), at(2, 'reeds', 6, 14), at(3, 'reeds', 10, 14), at(3, 'reeds', 14, 10),
    at(4, 'reeds', 14, 14), at(4, 'rock', -10, 10, { scale: 0.8 }), at(5, 'willow', -10, -10), at(6, 'reeds', -6, 14), at(6, 'reeds', -14, 10),
  ],
  tower: [
    at(1, 'pillar', -6, -10), at(2, 'pillar', 6, -10), at(3, 'pillar', -10, -6), at(3, 'stone', -14, -14), at(4, 'pillar', 10, -6),
    at(5, 'pillar', -10, 6), at(5, 'pillar', 10, 6), at(6, 'pillar', -6, 10), at(6, 'pillar', 6, 10), at(6, 'beacon', 14, 14),
  ],
  garden: [
    at(1, 'bush', -6, 10), at(2, 'bush', -10, 10), at(2, 'bush', -14, 10), at(3, 'bush', 6, 10), at(3, 'bush', 10, 10),
    at(4, 'lamp', -6, 6), at(4, 'lamp', 6, 6), at(5, 'lamp', -6, -6), at(5, 'lamp', 6, -6), at(5, 'bush', 14, 10),
    at(6, 'birch', -10, -10), at(6, 'birch', 10, -10),
  ],
  library: [
    at(1, 'stall', 10, -10, { seed: 0.33 }), at(2, 'lamp', 6, -6), at(3, 'stone', 14, -6, { scale: 0.7 }),
    at(4, 'house', -10, -10, { seed: 0.62, grow: [0.85, 0.95, 1.1] }), at(5, 'lamp', -6, 6), at(6, 'stall', -10, 10, { seed: 0.81 }),
  ],
  cairn: [
    at(1, 'cairn', -6, -10, { grow: [0.6, 0.8, 1.0, 1.2, 1.4, 1.5] }), at(3, 'stone', -10, -14, { scale: 0.6 }),
    at(5, 'lamp', -10, -6), at(6, 'stone', 6, -10, { scale: 1.3 }),
  ],
};
const OVERGROWTH = [at(0, 'deadtree', -14, 14), at(0, 'bush', 14, 14, { scale: 0.8 }), at(0, 'bush', -14, -2, { scale: 0.7 }), at(0, 'deadtree', 14, -2)];

export function valleyRecipe(place) {
  const s = place.stage;
  const items = RECIPES[place.kind] ?? [];
  const out = [];
  for (const it of items) {
    if (s < it.from || (it.to != null && s > it.to)) continue;
    const { from, to, grow, ...rest } = it;
    const scale = grow ? grow[Math.min(grow.length - 1, s - from)] : rest.scale;
    out.push({ ...rest, ...(scale ? { scale } : null), ...(it.id === 'greattree' ? { pal: place.pal } : null) });
  }
  if (place.neglected) out.push(...OVERGROWTH.map(({ from, ...rest }) => rest));
  return out;
}

export function fitCells(list) {
  const taken = new Set(), out = [];
  for (const s of list) {
    const R = propById(s.id).reach * (s.scale || 1), cells = [];
    for (let ci = Math.floor((s.x - R) / CELL); ci <= Math.floor((s.x + R) / CELL); ci++) {
      for (let cj = Math.floor((s.z - R) / CELL); cj <= Math.floor((s.z + R) / CELL); cj++) {
        const nx = Math.min(Math.max(s.x, ci * CELL), (ci + 1) * CELL), nz = Math.min(Math.max(s.z, cj * CELL), (cj + 1) * CELL);
        if (Math.hypot(nx - s.x, nz - s.z) < R) cells.push(ci + ',' + cj);
      }
    }
    if (cells.some((c) => taken.has(c))) continue;
    for (const c of cells) taken.add(c);
    out.push(s);
  }
  return out;
}
