import { safeLocalStorage, type KeyValue } from './store';
import type { HabitLog } from '../rules/habits';

const KEY = 'valley.v1.habits';

export function loadHabitLog(kv: KeyValue | null = safeLocalStorage()): HabitLog {
  try {
    const raw = kv?.getItem(KEY);
    const s = raw ? JSON.parse(raw) as Partial<HabitLog> : {};
    return { logs: s.logs ?? {}, off: s.off ?? {} };
  } catch { return { logs: {}, off: {} }; }
}

export function saveHabitLog(log: HabitLog, kv: KeyValue | null = safeLocalStorage()): boolean {
  try { kv?.setItem(KEY, JSON.stringify(log)); return true; } catch { return false; }
}
