import type { ClassId, Difficulty, LootPayload, MonsterRank } from '../types';
import type { Rng } from '../../engine/rng';
import type { MonsterDef } from '../content/monsters';
import { DIFFICULTY } from '../content/monsters';
import { generateItem, rollRarity } from './items';

export interface DropContext {
  rank: MonsterRank | 'chest';
  level: number;
  classId: ClassId;
  magicFind: number;
  goldFind: number;
  difficulty: Difficulty;
  night: number;
  def?: MonsterDef;
}

export const NIGHT_BONUS = { gold: 0.6, xp: 0.3 };
const ITEM_CHANCE = { normal: 0.1, elite: 1, boss: 1, chest: 1 };
const GOLD_MUL = { normal: 1, elite: 4, boss: 12, chest: 6 };

export function rollDrops(rng: Rng, c: DropContext): LootPayload[] {
  const out: LootPayload[] = [];
  const d = DIFFICULTY[c.difficulty];
  const mf = c.magicFind * d.find;

  const range = c.def?.gold ?? [6, 12];
  const gold = rng.int(range[0], range[1]) * (1 + (c.level - 1) * 0.3) * GOLD_MUL[c.rank] * c.goldFind * (1 + NIGHT_BONUS.gold * c.night);
  if (gold >= 1) out.push({ type: 'gold', n: Math.round(gold) });

  let items = 0;
  if (c.rank === 'normal') items = rng.chance(ITEM_CHANCE.normal * (0.7 + 0.3 * mf)) ? 1 : 0;
  else if (c.rank === 'elite') items = 1 + (rng.chance(0.5) ? 1 : 0);
  else if (c.rank === 'boss') items = 3 + (rng.chance(0.5) ? 1 : 0);
  else items = 2 + (rng.chance(0.35) ? 1 : 0);
  for (let i = 0; i < items; i++) {
    let rarity = rollRarity(rng, { magicFind: mf, rank: c.rank, ilvl: c.level });
    if (c.rank === 'boss' && i === 0) rarity = rng.chance(0.15) ? 'unique' : 'legendary';
    if ((c.rank === 'chest' || c.rank === 'boss') && rarity === 'common') rarity = 'magic';
    out.push({ type: 'item', item: generateItem(rng, { ilvl: c.level, rarity, classId: rng.chance(0.85) ? c.classId : undefined }) });
  }

  for (const [id, chance, [lo, hi]] of c.def?.mats ?? []) {
    if (rng.chance(Math.min(1, chance * (c.rank === 'normal' ? 1 : 2.5)))) out.push({ type: 'material', id, n: rng.int(lo, hi) });
  }
  const tonic = c.rank === 'boss' ? 1 : c.rank === 'elite' || c.rank === 'chest' ? 0.5 : (c.def?.potion ?? 0.05);
  if (rng.chance(tonic)) out.push({ type: 'potion', n: 1 });
  return out;
}
