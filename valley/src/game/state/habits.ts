import { FT, type Genome, type Model } from '../../world/runtree';
import { setValley } from '../../world/valley.js';
import { shapeGreatTree, leafPaletteFor } from '../../gfx/greattree.js';
import { HABITS, STAGES } from '../content/habits';
import { computeHabits, toggleDay, type Habit, type HabitInput, type HabitLog } from '../rules/habits';
import { loadHabitLog, saveHabitLog } from '../save/habits';

export const habits = {
  genome: null as Genome | null,
  model: null as Model | null,
  input: null as HabitInput | null,
  log: loadHabitLog() as HabitLog,
  list: [] as Habit[],
};

const seedOf = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

function inputFrom(M: Model): HabitInput {
  return {
    runDays: M.runs.map((r) => r.day), sports: M.others.map((o) => ({ day: o.day, sport: o.sport })),
    today: Math.floor(M.today), weekStart: M.weeks.length ? Math.floor(M.weeks[0].day) : 0, seed: seedOf(M.seed),
  };
}

export function toggleToday(key: string): void {
  const def = HABITS.find((h) => h.key === key);
  if (!def || !habits.input) return;
  habits.log = toggleDay(def, habits.input, habits.log, habits.input.today);
  saveHabitLog(habits.log);
  habits.list = computeHabits(habits.input, habits.log, habits.input.today);
}

export async function loadHabits(): Promise<boolean> {
  try {
    const res = await fetch('./genome.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const g = (await res.json()) as Genome;
    const M = FT.prepare(g);
    habits.genome = g;
    habits.model = M;
    habits.input = inputFrom(M);
    habits.list = computeHabits(habits.input, habits.log, habits.input.today);
    const S = FT.grow(M, M.today);
    const run = habits.list.find((h) => h.kind === 'tree');
    shapeGreatTree(S, run?.m.stage ?? 1);
    const pal = leafPaletteFor(S.season, S.heat, S.st.dormant);
    setValley(habits.list.map((h) => ({
      habit: h.key, kind: h.kind, stage: h.m.stage, neglected: h.m.neglected, label: h.name, title: STAGES[h.kind][h.m.stage], pal,
    })));
    return true;
  } catch (e) {
    console.warn('No habit data was found, so the valley stays as Hearthmere.', e);
    return false;
  }
}
