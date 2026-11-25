import { hash01 } from '../../core/rng.js';
import { HABITS, SPORT_HABIT, STAGE_WOOD, NEGLECT_DAYS, type HabitDef } from '../content/habits';

export interface Metrics {
  wood: number; stage: number; dormant: number; vit: number; streak: number; thisWeek: number; spark: number[];
  total: number; today: boolean; week7: number; next: number; neglected: boolean;
}
export interface Habit extends HabitDef { days: number[]; m: Metrics }

export interface HabitLog { logs: Record<string, number[]>; off: Record<string, boolean> }
export interface HabitInput { runDays: number[]; sports: { day: number; sport: string }[]; today: number; weekStart: number; seed: number }

export function metrics(days: number[], target: number, T: number, weekStart: number): Metrics {
  const seen = days.filter((d) => d <= T);
  const weekOf = (d: number) => Math.floor((d - weekStart) / 7);
  const wNow = weekOf(Math.floor(T));
  const counts: Record<number, number> = {};
  for (const d of seen) counts[weekOf(d)] = (counts[weekOf(d)] || 0) + 1;
  const first = seen.length ? weekOf(seen[0]) : wNow;
  let wood = 0, streak = 0;
  for (let w = first; w <= wNow; w++) {
    const c = counts[w] || 0;
    if (c) streak++; else if (w < wNow) streak = 0;
    wood += Math.min(1, c / target) * (1 + 0.06 * Math.min(streak, 10));
  }
  let stage = 0;
  STAGE_WOOD.forEach((t, i) => { if (wood >= t) stage = i; });
  stage = seen.length ? Math.max(1, stage) : 0;
  const last = seen.length ? seen[seen.length - 1] : -1e9;
  const dormant = Math.floor(T) - last;
  const recent = seen.filter((d) => d > T - 14).length;
  const vit = seen.length && dormant <= NEGLECT_DAYS ? Math.min(1, recent / (target * 2)) : 0;
  const spark: number[] = [];
  for (let w = wNow - 11; w <= wNow; w++) spark.push(counts[w] || 0);
  return {
    wood, stage, dormant, vit, streak, thisWeek: counts[wNow] || 0, spark, total: seen.length, today: seen.includes(Math.floor(T)),
    week7: seen.filter((d) => d > T - 7).length, next: STAGE_WOOD[stage + 1] ?? STAGE_WOOD[STAGE_WOOD.length - 1],
    neglected: seen.length > 0 && dormant > NEGLECT_DAYS,
  };
}

export const stageFloor = (stage: number) => (stage > 0 ? STAGE_WOOD[stage - 1] ?? 0 : 0);

export function exampleDays(key: string, today: number, seed: number): number[] {
  const k = key.length * 31 + key.charCodeAt(0);
  const p = key === 'read' ? 0.62 : 0.42, start = key === 'read' ? 0 : Math.floor(today * 0.35);
  const gap = Math.floor(today * (0.45 + hash01(k, 1, seed) * 0.2)), gapLen = 18 + Math.floor(hash01(k, 2, seed) * 10);
  const out: number[] = [];
  for (let d = start; d <= today; d++) {
    if (d >= gap && d < gap + gapLen) continue;
    if (hash01(k, d, seed + 7) < p) out.push(d);
  }
  return out;
}

export function habitDays(def: HabitDef, input: HabitInput, log: HabitLog): number[] {
  let days: number[];
  if (def.src === 'runs') days = input.runDays;
  else if (def.src === 'sport') days = input.sports.filter((s) => SPORT_HABIT[s.sport] === def.key).map((s) => s.day);
  else {
    const own = log.logs[def.key] ?? [];
    days = def.example && !log.off[def.key] ? exampleDays(def.key, input.today, input.seed).concat(own) : own;
  }
  return [...new Set(days.map((d) => Math.floor(d)))].sort((a, b) => a - b);
}

export function computeHabits(input: HabitInput, log: HabitLog, T: number): Habit[] {
  const out: Habit[] = [];
  for (const def of HABITS) {
    const days = habitDays(def, input, log);
    if (def.src === 'sport' && !days.length) continue;
    out.push({ ...def, days, m: metrics(days, def.target, T, input.weekStart) });
  }
  return out;
}

export function toggleDay(def: HabitDef, input: HabitInput, log: HabitLog, day: number): HabitLog {
  const logs = { ...log.logs }, off = { ...log.off };
  const own = [...(logs[def.key] ?? [])];
  if (def.example && !off[def.key]) {
    off[def.key] = true;
    for (const d of exampleDays(def.key, input.today, input.seed)) if (!own.includes(d)) own.push(d);
  }
  const i = own.indexOf(day);
  if (i >= 0) own.splice(i, 1); else own.push(day);
  logs[def.key] = own.sort((a, b) => a - b);
  return { logs, off };
}
