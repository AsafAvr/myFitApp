import { useState } from 'preact/hooks';
import { ui, getGame, closePanel, log } from './store';
import { Icon, confirmThen } from './components';
import { skillIcon, glyph } from './icons';
import { bindingLabel } from './hud';
import { CLUSTERS, SKILL_MAX_RANK, type SkillDef } from '../game/content/skills';
import { buildTree, canAllocate, canRefund, clusterOpen, lockedNodes, pointsAbove, pointsEarned, pointsSpent, rankOf, refundCost, type TreeNode } from '../game/rules/tree';
import { skillDef } from '../game/content/classes';
import { BAR_SIZE } from '../game/state/character';
import type { ActionId } from '../engine/bindings';

const SLOT_ACTIONS: ActionId[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'];
const PCT_KEYS = new Set(['stunChance', 'potency', 'pct', 'barrierPct', 'chill', 'slow', 'burn', 'bleed', 'poison', 'explodeCoef', 'zoneCoef', 'echo', 'crit', 'vulnChance', 'hasteSelf', 'falloff']);
const SEC_KEYS = new Set(['duration', 'cooldown', 'stun', 'freeze', 'delay', 'vuln', 'burnDur', 'bleedDur', 'poisonDur', 'zoneDur', 'arm', 'barrierDur', 'slowDur']);

export function skillText(def: SkillDef, params: Record<string, number> | null): string {
  const P = params ?? def.params;
  return def.desc.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = P[k];
    if (v === undefined) return '?';
    if (k.startsWith('coef')) return `${Math.round(v * 100)}%`;
    if (PCT_KEYS.has(k)) return `${Math.round(v * 100)}%`;
    if (SEC_KEYS.has(k)) return `${+v.toFixed(1)}`;
    return `${+v.toFixed(1)}`;
  });
}

export function SkillTree() {
  ui.rev.value;
  const g = getGame(), p = g.player, c = p.char, cls = p.build.cls;
  const tree = buildTree(cls);
  const a = c.tree;
  const spent = pointsSpent(a), earned = pointsEarned(c.level, c.bonusPoints), left = earned - spent;
  const [sel, setSel] = useState<string>(c.bar[0] ?? cls.start[0]);
  const node = tree.nodes.get(sel)!;
  const locked = lockedNodes(tree, a);

  const changed = () => { p.dirty = true; g.playerSystem.recompile(true); g.bus.emit('tree:changed'); };
  const learn = (id: string) => {
    const v = canAllocate(tree, a, id, left);
    if (!v.ok) { log(v.reason!); g.bus.emit('deny'); return; }
    a[id] = rankOf(a, id) + 1;
    const n = tree.nodes.get(id)!;
    if (n.kind === 'skill' && a[id] === 1 && !c.bar.includes(id)) { const free = c.bar.indexOf(null); if (free >= 0) c.bar[free] = id; }
    g.bus.emit('ui:click');
    changed();
  };
  const refund = (id: string) => {
    const v = canRefund(tree, a, id, locked);
    if (!v.ok) { log(v.reason!); g.bus.emit('deny'); return; }
    const cost = refundCost(c.level);
    if (c.gold < cost) { log(`Refunding a point costs ${cost} glint.`); g.bus.emit('deny'); return; }
    c.gold -= cost;
    a[id] = rankOf(a, id) - 1;
    if (a[id] <= 0) { delete a[id]; c.bar = c.bar.map((s) => (s === id ? null : s)); }
    changed();
  };
  const resetAll = () => {
    const cost = refundCost(c.level) * Math.max(0, spent - cls.start.length);
    confirmThen('Refund every point?', `Every point goes back to you${cost ? ` for ${cost} glint` : ''}, except your starting skills. Your bar keeps only those.`, 'Refund all', () => {
      if (c.gold < cost) { log(`That costs ${cost} glint.`); return; }
      c.gold -= cost;
      for (const k of Object.keys(a)) delete a[k];
      for (const id of cls.start) a[id] = 1;
      c.bar = c.bar.map((s) => (s && a[s] ? s : null));
      changed();
    });
  };
  const assign = (slot: number, id: string) => {
    if (!rankOf(a, id)) { log('Learn the skill first.'); g.bus.emit('deny'); return; }
    const was = c.bar.indexOf(id);
    if (was >= 0) c.bar[was] = c.bar[slot];
    c.bar[slot] = id;
    changed();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') return;
    if (e.key === 'Backspace' || e.key === '-') { e.preventDefault(); refund(sel); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); learn(sel); }
    else if (/^[1-6]$/.test(e.key) && node.kind === 'skill') { e.preventDefault(); assign(+e.key - 1, sel); }
  };

  return (
    <section class="overlay plate skilltree" role="dialog" aria-label={`${cls.name} skill tree`} onKeyDown={onKey}>
      <header>
        <h2>{cls.name} skills</h2>
        <div class="head-actions">
          <span class={left > 0 ? 'points' : 'dim'} aria-live="polite">{left > 0 ? `${left} point${left === 1 ? '' : 's'} to spend` : `${spent} points spent`}</span>
          <button type="button" class="btn small" onClick={resetAll}>Refund all</button>
          <button type="button" class="x" aria-label="Close the skill tree" onClick={() => closePanel('skills')}>×</button>
        </div>
      </header>
      <div class="tree-layout">
        <div class="branches">
          {CLUSTERS.map((cl) => {
            const open = clusterOpen(tree, a, cl.id);
            const ids = tree.byCluster.get(cl.id) ?? [];
            const skills = ids.filter((id) => tree.nodes.get(id)!.kind === 'skill');
            const passives = ids.filter((id) => ['passive', 'key'].includes(tree.nodes.get(id)!.kind));
            return (
              <section class={`branch ${open ? 'open' : 'shut'}`} aria-label={`${cl.name}${open ? '' : `, opens with ${cl.req} points above`}`}>
                <h3>{cl.name}{!open && <small> · {cl.req - pointsAbove(tree, a, cl.id)} more points above to open</small>}</h3>
                <div class="nodes">
                  {skills.map((id) => (
                    <div class="skill-group">
                      <NodeButton node={tree.nodes.get(id)!} sel={sel} onSel={setSel} onLearn={learn} big />
                      <div class="subs">
                        <NodeButton node={tree.nodes.get(`${id}+`)!} sel={sel} onSel={setSel} onLearn={learn} />
                        <NodeButton node={tree.nodes.get(`${id}:a`)!} sel={sel} onSel={setSel} onLearn={learn} />
                        <NodeButton node={tree.nodes.get(`${id}:b`)!} sel={sel} onSel={setSel} onLearn={learn} />
                      </div>
                    </div>
                  ))}
                  {passives.map((id) => <NodeButton node={tree.nodes.get(id)!} sel={sel} onSel={setSel} onLearn={learn} />)}
                </div>
              </section>
            );
          })}
        </div>
        <aside class="detail" aria-live="polite">
          <NodeDetail node={node} onLearn={learn} onRefund={refund} onAssign={assign} left={left} />
        </aside>
      </div>
    </section>
  );
}

function NodeButton({ node, sel, onSel, onLearn, big = false }: { node: TreeNode; sel: string; onSel: (id: string) => void; onLearn: (id: string) => void; big?: boolean }) {
  const g = getGame(), c = g.player.char, tree = buildTree(g.player.build.cls);
  const r = rankOf(c.tree, node.id);
  const can = canAllocate(tree, c.tree, node.id, pointsEarned(c.level, c.bonusPoints) - pointsSpent(c.tree)).ok;
  const def = node.skill ? skillDef(node.skill) : null;
  const icon = def ? skillIcon(def.icon, def.element) : glyph(node.icon, node.kind === 'key' ? '#d64634' : '#e2bc82');
  const kind = node.kind === 'enhance' ? '+' : node.kind === 'upgrade' ? (node.id.endsWith(':a') ? 'A' : 'B') : '';
  return (
    <button type="button"
      class={`node k-${node.kind} ${big ? 'big' : ''} ${r > 0 ? 'has' : ''} ${can ? 'can' : ''} ${sel === node.id ? 'sel' : ''}`}
      aria-label={`${node.name}, ${node.kind === 'skill' ? 'skill' : node.kind === 'key' ? 'key passive' : node.kind}, rank ${r} of ${node.max}${can ? ', can learn' : ''}`}
      aria-pressed={sel === node.id}
      onClick={() => { if (sel === node.id && can) onLearn(node.id); else onSel(node.id); }}
      onDblClick={() => onLearn(node.id)}
      onFocus={() => onSel(node.id)}>
      <Icon svg={icon} />
      {kind && <span class="tag">{kind}</span>}
      {node.max > 1 && <span class="rank">{r}/{node.max}</span>}
    </button>
  );
}

function NodeDetail({ node, onLearn, onRefund, onAssign, left }: { node: TreeNode; onLearn: (id: string) => void; onRefund: (id: string) => void; onAssign: (slot: number, id: string) => void; left: number }) {
  const g = getGame(), p = g.player, c = p.char, tree = buildTree(p.build.cls);
  const r = rankOf(c.tree, node.id);
  const def = node.skill ? skillDef(node.skill) : null;
  const state = node.skill ? p.build.skills.get(node.skill) : null;
  const can = canAllocate(tree, c.tree, node.id, left);
  const back = canRefund(tree, c.tree, node.id, lockedNodes(tree, c.tree));
  const cost = refundCost(c.level);
  return (
    <div class="node-detail">
      <h3>{node.name}</h3>
      <div class="dim">{node.kind === 'skill' && def ? `${def.category[0].toUpperCase()}${def.category.slice(1)} skill · ${def.element}` : node.kind === 'enhance' ? 'Enhancement' : node.kind === 'upgrade' ? 'Upgrade (choose one of two)' : node.kind === 'key' ? 'Key passive (choose one)' : 'Passive'}
        {node.max > 1 ? ` · rank ${r} of ${node.max}` : r ? ' · learned' : ''}</div>
      {def && node.kind === 'skill' ? <>
        <p>{skillText(def, state?.params ?? null)}</p>
        <div class="sheet small">
          {state?.params.cost ? <div><span>Costs</span>{state.params.cost} {p.build.cls.resource.name}</div> : null}
          {state?.params.generate || def.params.generate ? <div><span>Gives</span>{state?.params.generate ?? def.params.generate} {p.build.cls.resource.name}</div> : null}
          {(state?.params.cooldown ?? def.params.cooldown) ? <div><span>Cooldown</span>{(state?.params.cooldown ?? def.params.cooldown).toFixed(1)}s</div> : null}
          {state && state.rank > r ? <div><span>Rank</span>{state.rank} ({state.rank - r} from gear)</div> : null}
        </div>
        {r < SKILL_MAX_RANK && <p class="dim small">Each rank: 10% more damage.</p>}
      </> : <p>{node.desc}</p>}
      <div class="pair">
        <button type="button" class="btn primary" disabled={!can.ok} onClick={() => onLearn(node.id)}>{r ? 'Add a point' : 'Learn'}</button>
        <button type="button" class="btn" disabled={!back.ok} onClick={() => onRefund(node.id)}>Refund{cost ? ` · ${cost}` : ''}</button>
      </div>
      {!can.ok && <p class="dim small">{can.reason}</p>}
      {node.kind === 'skill' && r > 0 && <>
        <div class="label">Put on the bar</div>
        <div class="bar-slots">
          {Array.from({ length: BAR_SIZE }, (_, i) => {
            const id = c.bar[i], d = id ? skillDef(id) : null;
            return <button type="button" class={`btn slotpick ${id === node.id ? 'on' : ''}`} aria-label={`Slot ${i + 1} (${bindingLabel(SLOT_ACTIONS[i])}): ${d ? d.name : 'empty'}`} onClick={() => onAssign(i, node.id)}>
              <b>{bindingLabel(SLOT_ACTIONS[i])}</b><span>{d ? d.name : '—'}</span>
            </button>;
          })}
        </div>
      </>}
    </div>
  );
}
