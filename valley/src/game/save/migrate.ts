import type { ClassId } from '../types';
import { EQUIP_SLOTS } from '../types';
import { BAG_SIZE, BAR_SIZE, newCharacter, newJourney, type Character, type Bounty } from '../state/character';
import { CLASSES } from '../content/classes';
import { buildTree } from '../rules/tree';
import { Rng } from '../../engine/rng';
import type { ItemInstance } from '../rules/items';

interface V1 {
  seed?: number; hour?: number; x?: number; z?: number; hp?: number; view?: [number, number];
  sheet?: {
    level?: number; xp?: number; glint?: number; found?: Record<string, 1>; known?: Record<string, [number, number, string]>;
    ways?: { x: number; z: number; name: string }[]; waystone?: { x: number; z: number; name: string };
    lands?: Record<string, 1>; boon?: { id: string; left: number } | null; satchel?: { x: number; z: number; n: number } | null;
    guide?: 'done'; tips?: Record<string, 1>; bounty?: Partial<Bounty> | null; bountiesDone?: number;
    charms?: string[]; bag?: { id: string; n: number }[];
  };
}

const CHARM_AFFIX: Record<string, string> = { charm_might: 'might', charm_grace: 'grace', charm_vigor: 'vigor', charm_mind: 'mind' };
const MATS = new Set(['sprout_leaf', 'puff_spore', 'hog_bristle', 'wisp_ember', 'crag_shard', 'snap_claw']);

export function migrateV1(old: V1): Character {
  const s = old.sheet ?? {};
  const c = newCharacter('warden', 'Wayfarer', (old.seed ?? 1) ^ 0x2f);
  const rng = new Rng((old.seed ?? 1) ^ 0x51);
  c.level = Math.max(1, Math.min(50, s.level ?? 1));
  c.xp = Math.max(0, s.xp ?? 0);
  c.gold = Math.max(0, s.glint ?? 0);
  const j = c.journey;
  Object.assign(j, {
    found: s.found ?? {}, known: s.known ?? {}, lands: s.lands ?? {}, tips: s.tips ?? {},
    ways: s.ways?.length ? s.ways : j.ways, waystone: s.waystone ?? j.waystone,
    boon: s.boon && ['kindled', 'fleet', 'hale'].includes(s.boon.id) ? s.boon : null,
    satchel: s.satchel ?? null, guide: s.guide, bountiesDone: s.bountiesDone ?? 0,
    bounty: s.bounty && s.bounty.need ? { kind: 'cull', have: 0, xp: 0, glint: 0, need: 1, ...s.bounty } as Bounty : null,
  });
  for (const b of s.bag ?? []) {
    if (MATS.has(b.id)) c.materials[b.id] = (c.materials[b.id] ?? 0) + b.n;
    else if (b.id === 'tonic' || b.id === 'draught') c.potions = Math.min(6, c.potions + b.n);
  }
  const charms = [...(s.charms ?? []), ...(s.bag ?? []).filter((b) => CHARM_AFFIX[b.id]).flatMap((b) => Array(b.n).fill(b.id))];
  const rings: ItemInstance[] = charms.filter((id) => CHARM_AFFIX[id]).map((id) => ({
    uid: rng.uid('i'), base: 'ring', rarity: 'magic', ilvl: Math.max(1, c.level - 2), classId: 'warden',
    affixes: [{ id: CHARM_AFFIX[id], roll: 1 }],
  }));
  if (rings[0]) c.equipment.ring1 = rings[0];
  if (rings[1]) c.equipment.ring2 = rings[1];
  for (const r of rings.slice(2)) { const i = c.bag.findIndex((x) => !x); if (i >= 0) c.bag[i] = r; }
  c.pos = { x: Number.isFinite(old.x) ? old.x! : 3.5, z: Number.isFinite(old.z) ? old.z! : 6.5 };
  c.hour = old.hour ?? 9.5;
  c.view = old.view ?? null;
  c.hp = old.hp ?? 1e9;
  return c;
}

export function sanitizeCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Character>;
  const classId = (r.classId && CLASSES[r.classId as ClassId] ? r.classId : 'warden') as ClassId;
  const base = newCharacter(classId, r.name ?? 'Wayfarer', 1);
  const c: Character = { ...base, ...r, classId, version: 2 } as Character;
  c.journey = { ...newJourney(), ...(r.journey ?? {}) };
  c.tally = { ...base.tally, ...(r.tally ?? {}) };
  c.materials = { ...(r.materials ?? {}) };
  c.quests = { ...(r.quests ?? {}) };
  c.bag = Array.from({ length: BAG_SIZE }, (_, i) => r.bag?.[i] ?? null);
  c.bar = Array.from({ length: BAR_SIZE }, (_, i) => r.bar?.[i] ?? null);
  c.equipment = {};
  for (const slot of EQUIP_SLOTS) if (r.equipment?.[slot]) c.equipment[slot] = r.equipment[slot];
  const tree = buildTree(CLASSES[classId]);
  c.tree = {};
  for (const [id, n] of Object.entries(r.tree ?? base.tree)) if (tree.nodes.has(id) && n > 0) c.tree[id] = Math.min(n, tree.nodes.get(id)!.max);
  if (!Object.keys(c.tree).length) c.tree = base.tree;
  c.bar = c.bar.map((id) => (id && c.tree[id] ? id : null));
  if (!c.bar.some(Boolean)) c.bar = base.bar;
  if (!c.pos || !Number.isFinite(c.pos.x) || !Number.isFinite(c.pos.z)) c.pos = base.pos;
  if (!c.zone || (c.zone.kind !== 'overworld' && c.zone.kind !== 'dungeon')) c.zone = { kind: 'overworld' };
  c.level = Math.max(1, Math.min(50, Math.round(c.level || 1)));
  c.gold = Math.max(0, Math.round(c.gold || 0));
  return c;
}
