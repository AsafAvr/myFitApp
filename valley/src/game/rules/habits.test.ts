import { describe, expect, it } from 'vitest';
import { HABITS, STAGE_WOOD } from '../content/habits';
import { computeHabits, exampleDays, metrics, toggleDay, type HabitInput } from './habits';

const weekly = (weeks: number, perWeek: number, from = 0) => Array.from({ length: weeks * perWeek }, (_, i) => from + Math.floor(i / perWeek) * 7 + (i % perWeek) * 2);

describe('habits', () => {
  it('grows a stage for every band of weekly persistence', () => {
    const m = metrics(weekly(20, 3), 3, 20 * 7 - 1, 0);
    expect(m.wood).toBeGreaterThan(STAGE_WOOD[4]);
    expect(m.stage).toBe(STAGE_WOOD.reduce((s, t, i) => (m.wood >= t ? i : s), 0));
    expect(m.streak).toBe(20);
    expect(m.neglected).toBe(false);
  });

  it('a first day is a sprout, nothing is a seed', () => {
    expect(metrics([], 3, 10, 0).stage).toBe(0);
    expect(metrics([10], 3, 10, 0).stage).toBe(1);
  });

  it('a habit left for three weeks is neglected and its streak resets', () => {
    const m = metrics(weekly(10, 2), 2, 10 * 7 + 30, 0);
    expect(m.neglected).toBe(true);
    expect(m.streak).toBe(0);
    expect(m.vit).toBe(0);
  });

  it('only counts days up to the moment it is asked about', () => {
    const days = weekly(10, 2);
    expect(metrics(days, 2, 20, 0).total).toBe(days.filter((d) => d <= 20).length);
  });

  it('example days are deterministic and hand over to the log on first use', () => {
    const input: HabitInput = { runDays: [1, 3, 5], sports: [{ day: 2, sport: 'Walk' }], today: 120, weekStart: 0, seed: 7 };
    expect(exampleDays('read', 120, 7)).toEqual(exampleDays('read', 120, 7));
    const read = HABITS.find((h) => h.key === 'read')!;
    const log = toggleDay(read, input, { logs: {}, off: {} }, 120);
    expect(log.off.read).toBe(true);
    const before = computeHabits(input, { logs: {}, off: {} }, 120).find((h) => h.key === 'read')!;
    const after = computeHabits(input, log, 120).find((h) => h.key === 'read')!;
    expect(after.days.filter((d) => d !== 120)).toEqual(before.days.filter((d) => d !== 120));
    expect(after.days.includes(120)).toBe(!before.days.includes(120));
  });

  it('sports only make a place when they were done', () => {
    const input: HabitInput = { runDays: [1], sports: [{ day: 2, sport: 'Swim' }], today: 30, weekStart: 0, seed: 1 };
    const keys = computeHabits(input, { logs: {}, off: {} }, 30).map((h) => h.key);
    expect(keys).toContain('swim');
    expect(keys).not.toContain('ride');
    expect(keys[0]).toBe('run');
  });
});
