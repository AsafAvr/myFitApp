import type { SkillId } from '../types';
import type { Effect } from '../content/effects';
import { CLUSTERS, SKILL_MAX_RANK, START_POINTS, type ClassDef, type ClusterId } from '../content/skills';

export type NodeKind = 'skill' | 'enhance' | 'upgrade' | 'passive' | 'key';

export interface TreeNode {
  id: string;
  kind: NodeKind;
  cluster: ClusterId;
  max: number;
  requires?: string;
  exclusive?: string;
  skill?: SkillId;
  name: string;
  desc: string;
  effects: Effect[];
  icon: string;
}

export interface Tree {
  classId: string;
  nodes: Map<string, TreeNode>;
  byCluster: Map<ClusterId, string[]>;
}

export type Allocation = Record<string, number>;

const clusterIndex = new Map(CLUSTERS.map((c, i) => [c.id, i]));
const treeCache = new Map<string, Tree>();

export function buildTree(cls: ClassDef): Tree {
  const cached = treeCache.get(cls.id);
  if (cached) return cached;
  const nodes = new Map<string, TreeNode>();
  const byCluster = new Map<ClusterId, string[]>(CLUSTERS.map((c) => [c.id, []]));
  const add = (n: TreeNode) => { nodes.set(n.id, n); byCluster.get(n.cluster)!.push(n.id); };

  for (const s of cls.skills) {
    add({ id: s.id, kind: 'skill', cluster: s.category, max: SKILL_MAX_RANK, skill: s.id, name: s.name, desc: s.desc, effects: [], icon: s.icon,
      exclusive: s.category === 'ultimate' ? 'ultimate' : undefined });
    add({ id: `${s.id}+`, kind: 'enhance', cluster: s.category, max: 1, requires: s.id, skill: s.id, name: `Enhanced ${s.name}`, desc: s.enhance.desc, effects: s.enhance.effects, icon: s.icon });
    s.upgrades.forEach((u, i) => add({
      id: `${s.id}:${i ? 'b' : 'a'}`, kind: 'upgrade', cluster: s.category, max: 1, requires: `${s.id}+`, exclusive: `${s.id}:up`, skill: s.id,
      name: u.name, desc: u.desc, effects: u.effects, icon: s.icon,
    }));
  }
  for (const p of cls.passives) add({ id: p.id, kind: 'passive', cluster: p.cluster, max: p.max, name: p.name, desc: p.desc, effects: p.effects, icon: p.icon });
  for (const k of cls.keys) add({ id: k.id, kind: 'key', cluster: 'key', max: 1, exclusive: 'key', name: k.name, desc: k.desc, effects: k.effects, icon: k.icon });

  const tree = { classId: cls.id, nodes, byCluster };
  treeCache.set(cls.id, tree);
  return tree;
}

export const rankOf = (a: Allocation, id: string): number => a[id] ?? 0;
export const pointsSpent = (a: Allocation): number => Object.values(a).reduce((n, r) => n + r, 0);
export const pointsEarned = (level: number, bonus: number): number => level - 1 + START_POINTS + bonus;

export function pointsAbove(tree: Tree, a: Allocation, cluster: ClusterId): number {
  const k = clusterIndex.get(cluster)!;
  let n = 0;
  for (const [id, r] of Object.entries(a)) {
    const node = tree.nodes.get(id);
    if (node && clusterIndex.get(node.cluster)! < k) n += r;
  }
  return n;
}

export function clusterOpen(tree: Tree, a: Allocation, cluster: ClusterId): boolean {
  return pointsAbove(tree, a, cluster) >= CLUSTERS[clusterIndex.get(cluster)!].req;
}

export interface Verdict { ok: boolean; reason?: string }

export function canAllocate(tree: Tree, a: Allocation, id: string, available: number): Verdict {
  const n = tree.nodes.get(id);
  if (!n) return { ok: false, reason: 'No such skill.' };
  if (available <= 0) return { ok: false, reason: 'No skill points to spend. Gain a level.' };
  if (rankOf(a, id) >= n.max) return { ok: false, reason: 'Already at its highest rank.' };
  if (!clusterOpen(tree, a, n.cluster)) {
    const c = CLUSTERS[clusterIndex.get(n.cluster)!];
    return { ok: false, reason: `Spend ${c.req - pointsAbove(tree, a, n.cluster)} more points in the branches above to open ${c.name}.` };
  }
  if (n.requires && rankOf(a, n.requires) < 1) return { ok: false, reason: `Requires ${tree.nodes.get(n.requires)!.name}.` };
  if (n.exclusive) {
    for (const other of tree.nodes.values()) {
      if (other.id !== id && other.exclusive === n.exclusive && rankOf(a, other.id) > 0) {
        return { ok: false, reason: `You have chosen ${other.name}. Refund it to choose this instead.` };
      }
    }
  }
  return { ok: true };
}

export function canRefund(tree: Tree, a: Allocation, id: string, locked: readonly string[] = []): Verdict {
  const n = tree.nodes.get(id);
  if (!n || rankOf(a, id) <= 0) return { ok: false, reason: 'No points to refund.' };
  const after: Allocation = { ...a, [id]: rankOf(a, id) - 1 };
  if (after[id] === 0) {
    delete after[id];
    for (const other of tree.nodes.values()) {
      if (other.requires === id && rankOf(after, other.id) > 0) return { ok: false, reason: `Refund ${other.name} first.` };
    }
    if (locked.includes(id)) return { ok: false, reason: 'Keep at least one Basic skill.' };
  }
  for (const [other, r] of Object.entries(after)) {
    if (r <= 0) continue;
    const node = tree.nodes.get(other);
    if (node && !clusterOpen(tree, after, node.cluster)) return { ok: false, reason: `${node.name} would no longer have enough points above it.` };
  }
  return { ok: true };
}

export function lockedNodes(tree: Tree, a: Allocation): string[] {
  const basics = [...tree.nodes.values()].filter((n) => n.kind === 'skill' && n.cluster === 'basic' && rankOf(a, n.id) > 0);
  return basics.length === 1 ? [basics[0].id] : [];
}

export const refundCost = (level: number): number => (level < 8 ? 0 : Math.round(4 + level * 2.5));

