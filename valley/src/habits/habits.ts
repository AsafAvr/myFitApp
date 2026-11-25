import { FT, type Genome, type Model, type Scene } from './fittree';
import { setValley } from '../world/valley.js';
import { GREAT_TREE } from '../gfx/greattree.js';

export type PlaceKind = 'tree' | 'trail' | 'windmill' | 'pond' | 'tower' | 'garden' | 'library' | 'cairn' | 'well';
export interface HabitDef { key: string; name: string; kind: PlaceKind; target: number; src: 'runs' | 'sport' | 'manual'; example?: boolean }
export interface Metrics { wood: number; stage: number; dormant: number; vit: number; streak: number; thisWeek: number; spark: number[]; total: number; today: boolean; week7: number; next: number; neglected: boolean }
export interface Habit extends HabitDef { days: number[]; m: Metrics }

export const STAGES: Record<PlaceKind, { place: string; stages: string[] }> = {
  tree: { place: 'The great tree', stages: ['a seed', 'a sprout', 'a sapling', 'a young tree', 'a tree', 'a great tree', 'an ancient tree'] },
  trail: { place: 'The trail', stages: ['a plot to explore', 'a deer track', 'a footpath', 'a fenced path', 'a path with a signpost', 'a well-trodden lane', 'the old pilgrims’ way'] },
  windmill: { place: 'The windmill', stages: ['a plot to build on', 'a pile of hay', 'a stack of timber', 'a small mill', 'a windmill', 'a tall windmill', 'the great mill'] },
  pond: { place: 'The pond', stages: ['a dry hollow', 'a puddle', 'a pond', 'a pond with reeds', 'a reedy pond', 'a lake', 'a lake with an island'] },
  tower: { place: 'The stone circle', stages: ['a plot of stones', 'a single stone', 'two pillars', 'three pillars', 'a ring of pillars', 'a full ring', 'a ring with a beacon'] },
  garden: { place: 'The garden', stages: ['bare earth', 'a bush', 'a hedge', 'a quiet garden', 'a garden with lamps', 'a lantern garden', 'a temple garden'] },
  library: { place: 'The library', stages: ['an empty plot', 'a book stall', 'a busy stall', 'a reading nook', 'a book cottage', 'a library', 'the grand library'] },
  cairn: { place: 'The cairn', stages: ['an empty plot', 'a pebble', 'a small cairn', 'a cairn', 'a tall cairn', 'a great cairn', 'a standing stone'] },
  well: { place: 'The well', stages: ['an empty plot', 'a hole', 'a ring of stones', 'a well', 'a deep well', 'a garden well', 'the spring'] },
};
const SPORT: Record<string, string> = { Walk: 'walk', Hike: 'walk', Ride: 'ride', VirtualRide: 'ride', EBikeRide: 'ride', GravelRide: 'ride', MountainBikeRide: 'ride',
  Swim: 'swim', Workout: 'strength', WeightTraining: 'strength', Crossfit: 'strength', Rowing: 'strength', Yoga: 'yoga', Pilates: 'yoga' };
const BASE: HabitDef[] = [
  { key: 'run', name: 'Running', kind: 'tree', target: 3, src: 'runs' },
  { key: 'walk', name: 'Walking', kind: 'trail', target: 3, src: 'sport' },
  { key: 'ride', name: 'Cycling', kind: 'windmill', target: 2, src: 'sport' },
  { key: 'swim', name: 'Swimming', kind: 'pond', target: 1, src: 'sport' },
  { key: 'strength', name: 'Strength', kind: 'tower', target: 2, src: 'sport' },
  { key: 'yoga', name: 'Yoga', kind: 'garden', target: 2, src: 'sport' },
  { key: 'read', name: 'Reading', kind: 'library', target: 5, src: 'manual', example: true },
  { key: 'meditate', name: 'Meditation', kind: 'cairn', target: 4, src: 'manual', example: true },
];
const THRESH = [0.01, 1.2, 4, 9, 17, 28, 44];

interface Store { logs: Record<string, number[]>; off: Record<string, boolean> }
const KEY = 'valley:habits';
function loadStore(): Store {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { logs: s.logs || {}, off: s.off || {} }; } catch { return { logs: {}, off: {} }; }
}
function saveStore(s: Store): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: kept for this visit */ } }

export const state = {
  genome: null as Genome | null,
  model: null as Model | null,
  habits: [] as Habit[],
  T: 0,
  store: loadStore(),
  name: 'Your',
};

function exampleDays(key: string, today: number, seed: string): number[] {
  const r = FT.rng(seed + ':ex:' + key), out: number[] = [];
  const p = key === 'read' ? 0.62 : 0.42, start = key === 'read' ? 0 : Math.floor(today * 0.35);
  const gap = Math.floor(today * (0.45 + r() * 0.2)), gapLen = 18 + Math.floor(r() * 10);
  for (let d = start; d <= today; d++) {
    if (d >= gap && d < gap + gapLen) continue;
    if (r() < p) out.push(d);
  }
  return out;
}

export function metrics(h: { days: number[]; target: number }, T: number, w0: number): Metrics {
  const days = h.days.filter((d) => d <= T);
  const weekOf = (d: number) => Math.floor((d - w0) / 7);
  const wNow = weekOf(Math.floor(T));
  const counts: Record<number, number> = {};
  days.forEach((d) => { const w = weekOf(d); counts[w] = (counts[w] || 0) + 1; });
  const first = days.length ? weekOf(days[0]) : wNow;
  let wood = 0, streak = 0;
  for (let w = first; w <= wNow; w++) {
    const c = counts[w] || 0;
    if (c) streak++; else if (w < wNow) streak = 0;
    wood += Math.min(1, c / h.target) * (1 + 0.06 * Math.min(streak, 10));
  }
  let stage = 0;
  THRESH.forEach((t, i) => { if (wood >= t) stage = i; });
  stage = days.length ? Math.max(1, stage) : 0;
  const last = days.length ? days[days.length - 1] : -1e9;
  const dormant = Math.floor(T) - last;
  const recent = days.filter((d) => d > T - 14).length;
  const vit = days.length ? Math.min(1, recent / (h.target * 2)) * (dormant > 21 ? 0 : 1) : 0;
  const spark: number[] = [];
  for (let w = wNow - 11; w <= wNow; w++) spark.push(counts[w] || 0);
  return { wood, stage, dormant, vit, streak, thisWeek: counts[wNow] || 0, spark, total: days.length, today: days.includes(Math.floor(T)),
    week7: days.filter((d) => d > T - 7).length, next: THRESH[stage + 1] ?? THRESH[6], neglected: days.length > 0 && dormant > 21 };
}

export const stageFloor = (stage: number) => [0, 0.01, 1.2, 4, 9, 17, 28][stage] ?? 0;

export function computeHabits(T: number): Habit[] {
  const M = state.model!;
  const today = Math.floor(M.today), w0 = M.weeks.length ? Math.floor(M.weeks[0].day) : 0;
  const out: Habit[] = [];
  for (const b of BASE) {
    let days: number[] = [];
    if (b.src === 'runs') days = M.runs.map((r) => Math.floor(r.day));
    else if (b.src === 'sport') days = M.others.filter((o) => SPORT[o.sport] === b.key).map((o) => Math.floor(o.day));
    else {
      const own = state.store.logs[b.key] || [];
      days = b.example && !state.store.off[b.key] ? exampleDays(b.key, today, M.seed).concat(own) : own;
    }
    days = [...new Set(days)].sort((a, c) => a - c);
    if (b.src === 'sport' && !days.length) continue;
    out.push({ ...b, days, m: metrics({ days, target: b.target }, T, w0) });
  }
  return out;
}

export function toggleToday(key: string): void {
  const M = state.model!, d = Math.floor(state.T), s = state.store;
  const logs = (s.logs[key] = s.logs[key] || []);
  const h = state.habits.find((q) => q.key === key);
  if (h?.example && !s.off[key]) { s.off[key] = true; for (const x of exampleDays(key, Math.floor(M.today), M.seed)) if (!logs.includes(x)) logs.push(x); }
  const i = logs.indexOf(d);
  if (i >= 0) logs.splice(i, 1); else logs.push(d);
  saveStore(s);
  state.habits = computeHabits(state.T);
}

// ------------------------------------------------------------------ the valley layout (world units around the home site)
export interface Placement { id: string; dx: number; dz: number; rot?: number; scale?: number; seed?: number }
export interface ValleyPlace { habit: string; name: string; title: string; dx: number; dz: number; structures: Placement[] }

function placeFor(h: Habit, dx: number, dz: number): Placement[] {
  const s = h.m.stage, out: Placement[] = [];
  const at = (id: string, ox: number, oz: number, extra: Partial<Placement> = {}) => out.push({ id, dx: dx + ox, dz: dz + oz, ...extra });
  const ring = (id: string, n: number, r: number, extra: (k: number) => Partial<Placement> = () => ({})) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + 0.4; at(id, Math.cos(a) * r, Math.sin(a) * r, extra(k)); } };
  if (s === 0) { at('signpost', 0, 0); return out; }
  switch (h.kind) {
    case 'trail':
      for (let k = 0; k < Math.min(3, Math.ceil((s + 1) / 2)); k++) at('fence', k * 6 - 6, 2 + Math.sin(k) * 0.8, { rot: 0.1 * Math.sin(k) });
      if (s >= 4) at('signpost', -6, 4.4);
      if (s >= 5) at('lamp', 6, 4.4);
      break;
    case 'windmill':
      if (s <= 1) at('haystack', 0, 0, { scale: 0.9 });
      else if (s === 2) { at('haystack', -1.2, 0, { scale: 0.8 }); at('stump', 1.4, 0.4); }
      else at('windmill', 0, 0, { scale: Math.min(1.6, 0.7 + (s - 3) * 0.28) });
      break;
    case 'pond':
      ring('reeds', Math.min(9, 2 + s), 3 + s * 0.45, (k) => ({ seed: (k * 0.37) % 1 }));
      if (s >= 5) at('rock', 0, 0, { scale: 0.9 });
      break;
    case 'tower':
      ring('pillar', Math.min(7, s + (s >= 5 ? 1 : 0)), 4.6, (k) => ({ seed: (k * 0.29) % 1 }));
      if (s >= 6) at('beacon', 0, 0, { scale: 0.8 });
      else at('stone', 0, 0);
      break;
    case 'garden':
      ring('bush', Math.min(6, 1 + s), 4.2, (k) => ({ seed: (k * 0.41) % 1 }));
      if (s >= 4) { at('lamp', -2.6, 2.6); at('lamp', 2.6, -2.6); }
      if (s >= 5) at('birch', 0, 0, { scale: 1.1 });
      break;
    case 'library':
      if (s <= 3) at('stall', 0, 0, { seed: 0.33 });
      else at('house', 0, 0, { scale: Math.min(1.25, 0.8 + (s - 4) * 0.2), seed: 0.62 });
      break;
    case 'cairn':
      at('cairn', 0, 0, { scale: Math.min(1.9, 0.6 + s * 0.2) });
      if (s >= 6) at('stone', 4.4, 0.6, { scale: 1.2 });
      break;
    case 'well':
      if (s >= 2) at('well', 0, 0, { scale: Math.min(1.4, 0.7 + s * 0.12) });
      else at('stump', 0, 0);
      break;
    default: break;
  }
  if (h.m.neglected) for (let k = 0; k < 3; k++) at(k ? 'bush' : 'deadtree', Math.cos(k * 2.1 + 0.5) * 6, Math.sin(k * 2.1 + 0.5) * 6, { scale: 0.7, seed: k * 0.3 });
  return out;
}

export function buildValley(): void {
  const hs = state.habits, others = hs.filter((h) => h.kind !== 'tree');
  const places: ValleyPlace[] = [];
  const tree = hs.find((h) => h.kind === 'tree');
  if (tree) places.push({ habit: tree.key, name: tree.name, title: STAGES.tree.stages[tree.m.stage], dx: 2.6, dz: 3.2, structures: [] });
  others.forEach((h, i) => {
    const a = (i + 0.5) / Math.max(1, others.length) * Math.PI * 2 + Math.PI * 0.62;
    const r = 18 + (i % 2) * 3;
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
    places.push({ habit: h.key, name: h.name, title: STAGES[h.kind].stages[h.m.stage], dx: dx * 0.82, dz: dz * 0.82, structures: placeFor(h, dx, dz) });
  });
  setValley({ ready: true, name: `${state.name === 'Your' ? 'Your' : state.name + '’s'} Valley`, places });
}

// ------------------------------------------------------------------ the great tree, as data for the world shader
const hexRgb = (h: number, s: number, l: number): number[] => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

export function buildGreatTree(S: Scene, stage: number): void {
  const G = GREAT_TREE;
  if (!S.runsN) { G.on = 0; return; }
  const H3 = 5.2 + stage * 1.2, k = H3 / Math.max(60, -S.bbox.y0 + 10);
  const trunkH = Math.min(H3 * 0.62, S.H * k * 0.75);
  const trunkR = Math.max(0.16, S.R * k * 1.25);
  const la: number[] = [], lb: number[] = [], f: number[] = [];
  const limbs = S.limbs.slice().sort((a, b) => b.vigor - a.vigor).slice(0, 12);
  const leavesOn: Record<number, number> = {};
  S.leaves.forEach((L) => { if (L.ti >= 0) { const li = S.twigs[L.ti]?.li; if (li != null) leavesOn[li] = (leavesOn[li] || 0) + 1; } });
  let bx = trunkR + 1, by = trunkH + 1;
  limbs.forEach((l, i) => {
    const phi = i * 2.39996 + 0.5;
    const n = l.pts.length;
    const p0 = l.pts[0], pm = l.pts[Math.floor(n * 0.45)], p1 = l.pts[n - 1];
    const to3 = (p: { x: number; y: number }) => {
      const r = Math.abs(p.x - p0.x) * k * 1.05, h = Math.min(-p.y * k, H3);
      return [Math.cos(phi) * r, h, Math.sin(phi) * r];
    };
    const a = [0, Math.min(-p0.y * k, trunkH * 0.98), 0], m = to3(pm), e = to3(p1);
    m[1] = Math.max(m[1], a[1] + 0.3); e[1] = Math.max(e[1], m[1] + 0.2);
    const r0 = Math.max(0.07, Math.min(trunkR * 0.7, p0.r * k * 1.6)), r1 = r0 * 0.6, r2 = Math.max(0.04, r0 * 0.25);
    la.push(a[0], a[1], a[2], r0); lb.push(m[0], m[1], m[2], r1);
    la.push(m[0], m[1], m[2], r1); lb.push(e[0], e[1], e[2], r2);
    const lv = leavesOn[l.li] || 0;
    if (!S.winter && lv > 0) {
      const rad = Math.min(2.3, (0.55 + 0.42 * Math.sqrt(lv / 12)) * (H3 / 10) * 1.6);
      f.push(e[0], e[1] + rad * 0.15, e[2], rad);
      bx = Math.max(bx, Math.hypot(e[0], e[2]) + rad); by = Math.max(by, e[1] + rad);
    }
    bx = Math.max(bx, Math.hypot(e[0], e[2]) + 0.4); by = Math.max(by, e[1] + 0.4);
  });
  if (!S.winter && S.leaves.length) {
    const rad = Math.min(2.6, 1.0 + 0.25 * stage);
    f.push(0, trunkH + rad * 0.55, 0, rad);
    by = Math.max(by, trunkH + rad * 1.6);
  }
  const [h, s, l] = FT.geom.interpStops(FT.geom.SEASON_STOPS, Math.max(0, Math.min(1, S.season)));
  // the prop is stamped into every cell within its reach (6.6): keep the crown inside it
  const fit = Math.min(1, 6.2 / (bx + 0.6));
  if (fit < 1) {
    for (let i = 0; i < la.length; i += 4) { la[i] *= fit; la[i + 2] *= fit; lb[i] *= fit; lb[i + 2] *= fit; }
    for (let i = 0; i < f.length; i += 4) { f[i] *= fit; f[i + 2] *= fit; f[i + 3] *= Math.max(0.8, fit); }
    bx = 6.2 - 0.6;
  }
  G.on = 1;
  G.bound = [bx + 0.6, by + 0.6, trunkH, trunkR];
  G.la = new Float32Array(Array.from({ length: 96 }, (_, i) => la[i] ?? 0));
  G.lb = new Float32Array(Array.from({ length: 96 }, (_, i) => lb[i] ?? 0));
  G.f = new Float32Array(Array.from({ length: 64 }, (_, i) => f[i] ?? 0));
  G.nl = la.length / 4; G.nf = f.length / 4;
  G.leaf = [...hexRgb(h, s, l), Math.min(0.32, S.fruits.length / 30)];
}

// ------------------------------------------------------------------ loading
export async function loadHabits(): Promise<boolean> {
  try {
    const res = await fetch('./genome.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const g = (await res.json()) as Genome;
    state.genome = g;
    state.model = FT.prepare(g);
    state.name = g.athlete?.first_name || g.athlete?.name || 'Your';
    state.T = state.model.today;
    state.habits = computeHabits(state.T);
    buildValley();
    const run = state.habits.find((h) => h.kind === 'tree');
    buildGreatTree(FT.grow(state.model, state.T), run?.m.stage ?? 0);
    return true;
  } catch (e) {
    console.warn('No habit data: the valley starts as a seed.', e);
    return false;
  }
}
