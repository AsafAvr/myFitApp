import { describe, expect, it } from 'vitest';
import { SaveStore, type KeyValue } from './store';
import { sanitizeCharacter } from './migrate';
import { newCharacter, BAG_SIZE } from '../state/character';
import { createDungeonGen } from '../../world/dungeon.js';

class Memory implements KeyValue {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('saves', () => {
  it('brings the first version’s hero across as a Warden', () => {
    const kv = new Memory();
    kv.setItem('brushwild.save.v1', JSON.stringify({
      seed: 77, hour: 13, x: 120, z: -40, hp: 50,
      sheet: { level: 9, xp: 40, glint: 315, found: { 'f1,2': 1 }, lands: { meadow: 1, grove: 1 }, charms: ['charm_might'],
        bag: [{ id: 'tonic', n: 2 }, { id: 'hog_bristle', n: 5 }, { id: 'charm_grace', n: 1 }], bountiesDone: 3 },
    }));
    const store = new SaveStore(kv);
    const account = store.loadAccount();
    expect(account.seed).toBe(77);
    expect(account.heroes.length).toBe(1);
    const hero = store.loadCharacter(account.heroes[0])!;
    expect(hero.classId).toBe('warden');
    expect(hero.level).toBe(9);
    expect(hero.gold).toBe(315);
    expect(hero.materials.hog_bristle).toBe(5);
    expect(hero.equipment.ring1?.affixes[0].id).toBe('might');
    expect(hero.equipment.ring2?.affixes[0].id).toBe('grace');
    expect(hero.journey.lands.grove).toBe(1);
    expect(hero.pos).toEqual({ x: 120, z: -40 });
    expect(kv.getItem('brushwild.save.v1')).toBeTruthy();
  });

  it('repairs a damaged or older hero record', () => {
    const c = newCharacter('strider', 'Kit', 3) as unknown as Record<string, unknown>;
    delete c.journey; delete c.tally;
    c.bag = [null]; c.tree = { quickshot: 9, gone: 2 }; c.bar = ['quickshot', 'gone'];
    const fixed = sanitizeCharacter(c)!;
    expect(fixed.bag.length).toBe(BAG_SIZE);
    expect(fixed.tree.quickshot).toBe(5);
    expect(fixed.tree.gone).toBeUndefined();
    expect(fixed.bar[1]).toBeNull();
    expect(fixed.journey.ways.length).toBeGreaterThan(0);
  });

  it('exports and imports everything', () => {
    const a = new SaveStore(new Memory()), b = new SaveStore(new Memory());
    const acc = a.loadAccount();
    a.saveCharacter(newCharacter('emberwright', 'Ash', 5), acc);
    expect(b.importAll(a.exportAll(acc))).toBe(true);
    expect(b.summaries(b.loadAccount())[0].name).toBe('Ash');
    expect(b.importAll('not a save')).toBe(false);
  });
});

describe('dungeons', () => {
  it('makes the same dungeon from the same seed, with a way in, a boss and a hoard', () => {
    for (const theme of ['crypt', 'cave']) {
      const a = createDungeonGen({ seed: 1234, theme }), b = createDungeonGen({ seed: 1234, theme });
      expect(a.rooms.length).toBeGreaterThanOrEqual(4);
      expect(a.entrance).toBeTruthy();
      expect(a.boss).toBeTruthy();
      expect(a.boss).not.toBe(a.entrance);
      expect(a.rooms.map((r: { x: number }) => r.x)).toEqual(b.rooms.map((r: { x: number }) => r.x));
      expect(a.open(a.entrance!.x + 1, a.entrance!.z + 1)).toBe(true);
      expect(a.height(-20, -20)).toBeGreaterThan(5);
      const chunk = a.generateChunk(0, 0);
      expect(chunk.height.length).toBe(32 * 32 * 4);
    }
  });

  it('can walk from the way in to the boss', () => {
    const g = createDungeonGen({ seed: 99, theme: 'crypt' });
    const T = 4, seen = new Set<string>(), q: [number, number][] = [[Math.floor(g.entrance!.x / T), Math.floor(g.entrance!.z / T)]];
    while (q.length) {
      const [x, z] = q.pop()!;
      const k = x + ',' + z;
      if (seen.has(k) || !g.open(x * T + 2, z * T + 2)) continue;
      seen.add(k);
      q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    expect(seen.has(Math.floor(g.boss!.x / T) + "," + Math.floor(g.boss!.z / T))).toBe(true);
  });
});
