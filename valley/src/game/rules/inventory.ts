import type { EquipSlot } from '../types';
import type { Character } from '../state/character';
import { BASE, slotsFor } from '../content/items';
import { CLASSES } from '../content/classes';
import { canEquip, itemPower, rarityRank, type ItemInstance } from './items';

export interface Outcome { ok: boolean; reason?: string }
const fail = (reason: string): Outcome => ({ ok: false, reason });
const OK: Outcome = { ok: true };

export const freeSlots = (bag: (ItemInstance | null)[]): number => bag.reduce((n, s) => n + (s ? 0 : 1), 0);
export const firstFree = (bag: (ItemInstance | null)[]): number => bag.findIndex((s) => !s);

export function addToBag(char: Character, item: ItemInstance): number {
  const i = firstFree(char.bag);
  if (i >= 0) char.bag[i] = item;
  return i;
}

export function defaultSlot(char: Character, item: ItemInstance): EquipSlot {
  const slots = slotsFor(BASE[item.base]);
  return slots.find((s) => !char.equipment[s]) ?? slots[0];
}

const twoHanded = (it: ItemInstance | undefined) => !!it && BASE[it.base]?.hands === 2;

export function equipFromBag(char: Character, index: number, slot?: EquipSlot): Outcome {
  const item = char.bag[index];
  if (!item) return fail('Nothing there.');
  const cls = CLASSES[char.classId];
  const can = canEquip(cls, item, char.level);
  if (!can.ok) return can;
  const target = slot ?? defaultSlot(char, item);
  if (!slotsFor(BASE[item.base]).includes(target)) return fail('It does not go there.');

  const prev = char.equipment[target];
  let evict: EquipSlot | null = null;
  if (target === 'mainhand' && twoHanded(item) && char.equipment.offhand) evict = 'offhand';
  if (target === 'offhand' && twoHanded(char.equipment.mainhand)) evict = 'mainhand';
  if (evict) {
    const room = freeSlots(char.bag) + (prev ? 0 : 1);
    if (room < 1) return fail('Your bag is too full to take off the other hand.');
  }
  char.bag[index] = prev ?? null;
  char.equipment[target] = item;
  item.fresh = false;
  if (evict) {
    const other = char.equipment[evict]!;
    delete char.equipment[evict];
    addToBag(char, other);
  }
  return OK;
}

export function unequip(char: Character, slot: EquipSlot, toIndex?: number): Outcome {
  const item = char.equipment[slot];
  if (!item) return fail('Nothing worn there.');
  const i = toIndex !== undefined && !char.bag[toIndex] ? toIndex : firstFree(char.bag);
  if (i < 0) return fail('Your bag is full.');
  char.bag[i] = item;
  delete char.equipment[slot];
  return OK;
}

const SLOT_ORDER: string[] = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring'];
export function sortBag(char: Character): void {
  const items = char.bag.filter((x): x is ItemInstance => !!x);
  items.sort((a, b) => SLOT_ORDER.indexOf(BASE[a.base].slot) - SLOT_ORDER.indexOf(BASE[b.base].slot)
    || rarityRank(b.rarity) - rarityRank(a.rarity) || itemPower(b) - itemPower(a));
  for (let i = 0; i < char.bag.length; i++) char.bag[i] = items[i] ?? null;
}

export function toStash(char: Character, stash: (ItemInstance | null)[], index: number): Outcome {
  const it = char.bag[index];
  if (!it) return fail('Nothing there.');
  const j = firstFree(stash);
  if (j < 0) return fail('This stash tab is full.');
  stash[j] = it;
  char.bag[index] = null;
  return OK;
}

export function fromStash(char: Character, stash: (ItemInstance | null)[], index: number): Outcome {
  const it = stash[index];
  if (!it) return fail('Nothing there.');
  const j = firstFree(char.bag);
  if (j < 0) return fail('Your bag is full.');
  char.bag[j] = it;
  stash[index] = null;
  return OK;
}

export const materialCount = (char: Character, id: string): number => char.materials[id] ?? 0;
export function addMaterial(char: Character, id: string, n: number): void {
  char.materials[id] = (char.materials[id] ?? 0) + n;
}
export function spendMaterial(char: Character, id: string, n: number): boolean {
  if (materialCount(char, id) < n) return false;
  char.materials[id] -= n;
  if (char.materials[id] <= 0) delete char.materials[id];
  return true;
}

export function compareTarget(char: Character, item: ItemInstance): ItemInstance | null {
  const slots = slotsFor(BASE[item.base]);
  if (slots.length > 1) {
    const worn = slots.map((s) => char.equipment[s]).filter((x): x is ItemInstance => !!x);
    if (worn.length < slots.length) return null;
    return worn.sort((a, b) => itemPower(a) - itemPower(b))[0];
  }
  return char.equipment[slots[0]] ?? null;
}

