import '../../../web/tree.js';

export interface FitTreeApi {
  prepare(g: Genome): Model;
  grow(m: Model, T: number): Scene;
  geom: { outline(pts: Pt3[]): [number[][], number[][]]; SEASON_STOPS: number[][]; interpStops(stops: number[][], x: number): number[] };
  leafCount(km: number): number;
  rng(seed: string | number): () => number;
  KIND_LABEL: Record<string, string>;
}
export interface Pt3 { x: number; y: number; r: number }
export interface Run { id: number; i: number; t: string; day: number; km: number; min: number; elev: number; pace: number | null; hr: number | null; kind: string; name?: string; pr?: number; ms?: string[]; pb?: string[]; dow: number; mkey: string }
export interface Genome {
  athlete: { id?: string | number; first_name?: string; name?: string; source?: string };
  as_of: string; first_day?: string; runs: Run[]; weeks: { start: string; runs: number; km: number; strength: number; streak: number; wood: number }[];
  others: { t: string; sport: string; min: number }[]; summary?: Record<string, unknown>; target_runs?: number; weekday_names?: string[];
  sky?: { period: string };
}
export interface Model { g: Genome; today: number; origin: number; runs: Run[]; others: { day: number; sport: string; t: string }[]; weeks: { day: number }[]; ms: { day: number; label: string; t: string }[]; seed: string; dayNames: string[]; name: string; since: string }
export interface Leaf { x: number; y: number; ang: number; size: number; h: number; s: number; l: number; ti: number; age: number; run: number; back: boolean }
export interface Twig { pts: Pt3[]; forks: Pt3[][]; fine: Pt3[][]; run: Run; li: number; bi: number; ti: number; tip: Pt3; nLeaves?: number; h?: number; s?: number; l?: number }
export interface Limb { pts: Pt3[]; li: number; vigor: number; side: number; km: number; runs: number; m: { label: string }; u: number }
export interface Scene {
  T: number; H: number; R: number; OS: number; wood: number; kmT: number; runsN: number; season: number; heat: number; winter: boolean; moisture: number;
  st: { streak: number; dormant: number; activeWeeks: number; weeksTotal: number; ratio: number; season: number };
  trunk: Pt3[]; trunkPt(u: number): Pt3; limbs: Limb[]; branches: { pts: Pt3[]; li: number }[]; twigs: Twig[]; leaves: Leaf[];
  fruits: { x: number; y: number; size: number; kind: string; stem: number; latest: boolean; run: Run; ti: number }[];
  blossoms: { x: number; y: number; size: number; rot: number; ti: number }[];
  roots: { pts: Pt3[]; subs: Pt3[][]; day: string; runs: number; km: number; share: number; strongest: boolean }[];
  knots: { u: number; side: number; size: number; kind: string; label: string }[];
  rings: { u: number; label: string; t: string; major?: boolean }[];
  nest: { x: number; y: number; eggs: number; streak: number; scale: number } | null;
  swing: { x: number; y: number; len: number; w: number } | null;
  carving: { u: number; initial: string; year: string } | null;
  bbox: { x0: number; x1: number; y0: number; y1: number };
}

export const FT = (globalThis as unknown as { FitTree: FitTreeApi }).FitTree;
