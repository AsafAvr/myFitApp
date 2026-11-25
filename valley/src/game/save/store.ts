import { GAME } from '../../config.js';
import type { ClassId } from '../types';
import type { Character } from '../state/character';
import { STASH_TAB_SIZE } from '../state/character';
import type { ItemInstance } from '../rules/items';
import { migrateV1, sanitizeCharacter } from './migrate';

export interface Account {
  version: 2;
  seed: number;
  created: number;
  heroes: string[];
  stash: (ItemInstance | null)[][];
}

export interface HeroSummary { id: string; name: string; classId: ClassId; level: number; played: number; difficulty: string }

export interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const ACCOUNT = 'brushwild.v2.account';
const HERO = (id: string) => `brushwild.v2.hero.${id}`;
const V1 = GAME.SAVE_KEY;
export const STASH_TABS = 3;

const emptyStash = () => Array.from({ length: STASH_TABS }, () => new Array<ItemInstance | null>(STASH_TAB_SIZE).fill(null));

export class SaveStore {
  private readonly kv: KeyValue | null;
  failed = false;

  constructor(kv: KeyValue | null = safeLocalStorage()) { this.kv = kv; }

  private read<T>(key: string): T | null {
    try { const raw = this.kv?.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
  }
  private write(key: string, value: unknown): boolean {
    try { this.kv?.setItem(key, JSON.stringify(value)); return true; } catch { this.failed = true; return false; }
  }

  loadAccount(): Account {
    const a = this.read<Partial<Account>>(ACCOUNT);
    if (a && a.version === 2) {
      return {
        version: 2, seed: a.seed ?? GAME.SEED, created: a.created ?? Date.now(), heroes: (a.heroes ?? []).filter((id) => this.read(HERO(id))),
        stash: Array.from({ length: STASH_TABS }, (_, t) => Array.from({ length: STASH_TAB_SIZE }, (_, i) => a.stash?.[t]?.[i] ?? null)),
      };
    }
    const fresh: Account = { version: 2, seed: GAME.SEED, created: Date.now(), heroes: [], stash: emptyStash() };
    const old = this.read<{ seed?: number; sheet?: object }>(V1);
    if (old && old.sheet) {
      fresh.seed = old.seed ?? GAME.SEED;
      const hero = migrateV1(old);
      this.saveCharacter(hero, fresh);
    }
    this.saveAccount(fresh);
    return fresh;
  }

  saveAccount(a: Account): void { this.write(ACCOUNT, a); }

  loadCharacter(id: string): Character | null { return sanitizeCharacter(this.read(HERO(id))); }

  saveCharacter(c: Character, account?: Account): void {
    this.write(HERO(c.id), c);
    if (account && account.heroes[0] !== c.id) {
      account.heroes = [c.id, ...account.heroes.filter((id) => id !== c.id)];
      this.saveAccount(account);
    }
  }

  deleteCharacter(id: string, account: Account): void {
    try { this.kv?.removeItem(HERO(id)); } catch {}
    account.heroes = account.heroes.filter((h) => h !== id);
    this.saveAccount(account);
  }

  summaries(account: Account): HeroSummary[] {
    return account.heroes.map((id) => this.loadCharacter(id)).filter((c): c is Character => !!c)
      .map((c) => ({ id: c.id, name: c.name, classId: c.classId, level: c.level, played: c.played, difficulty: c.difficulty }));
  }

  exportAll(account: Account): string {
    const heroes = account.heroes.map((id) => this.read(HERO(id))).filter(Boolean);
    return JSON.stringify({ brushwild: 2, exported: new Date().toISOString(), account, heroes }, null, 1);
  }

  importAll(text: string): boolean {
    let data: { brushwild?: number; account?: Account; heroes?: unknown[] };
    try { data = JSON.parse(text); } catch { return false; }
    if (data.brushwild !== 2 || !data.account || !Array.isArray(data.heroes)) return false;
    const heroes = data.heroes.map(sanitizeCharacter).filter((c): c is Character => !!c);
    for (const h of heroes) this.write(HERO(h.id), h);
    this.write(ACCOUNT, { ...data.account, heroes: heroes.map((h) => h.id) });
    return true;
  }
}

function safeLocalStorage(): KeyValue | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
