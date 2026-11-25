import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ui, closePanel } from './store';
import { habits, toggleToday } from '../game/state/habits';
import { STAGES } from '../game/content/habits';
import { stageFloor, type Habit } from '../game/rules/habits';
import { FT } from '../world/runtree';
import { drawTree, type TreeDrawing } from './treeart';

const SEASON = (s: number, heat: number, dormant: number) => (dormant >= 21 || s < 0.08 ? 'winter' : s < 0.3 ? 'late autumn' : s < 0.5 ? 'autumn' : s < 0.68 ? 'late summer' : heat > 0.45 ? 'a heatwave' : s > 0.9 ? 'a spring flush' : 'summer');
const fmt = (T: number) => (habits.model ? new Date(habits.model.origin + Math.floor(T) * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

function Spark({ spark }: { spark: number[] }) {
  const mx = Math.max(1, ...spark);
  return (
    <svg class="habit-spark" viewBox={`0 0 ${spark.length * 9} 30`} width={spark.length * 9} height={30} role="img" aria-label={`Last ${spark.length} weeks: ${spark.join(', ')}`}>
      {spark.map((c, i) => <rect x={i * 9} y={30 - Math.max(2, (c / mx) * 30)} width={6} height={Math.max(2, (c / mx) * 30)} rx={1.5} fill={c ? '#3d7332' : '#d8ccb4'} />)}
    </svg>
  );
}

function TreeView() {
  const M = habits.model!;
  const [T, setT] = useState(M.today);
  const cv = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const S = useMemo(() => FT.grow(M, T), [T]);
  const drawing = useRef<TreeDrawing | null>(null);
  useEffect(() => {
    const el = cv.current!, box = wrap.current!.getBoundingClientRect();
    const w = Math.round(box.width), h = Math.round(box.height), dpr = Math.min(2, devicePixelRatio || 1);
    el.width = w * dpr; el.height = h * dpr;
    drawing.current = drawTree(S, M, w, h, dpr);
    const ctx = el.getContext('2d')!;
    let i = 0;
    const show = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(drawing.current!.frames[i % drawing.current!.frames.length], 0, 0); i++; };
    show();
    const steady = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = steady ? 0 : window.setInterval(show, 166);
    return () => window.clearInterval(id);
  }, [S]);
  const move = (e: PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null as null | { x: number; y: number; r: number; text: string }, bd = 1e9;
    for (const hh of drawing.current?.hits ?? []) { const d = Math.hypot(hh.x - x, hh.y - y); if (d < hh.r && d < bd) { bd = d; best = hh; } }
    setTip(best ? { x, y, text: best.text } : null);
  };
  const st = S.st, kinds: Record<string, number> = {};
  S.fruits.forEach((f) => { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
  return (
    <div class="tree-view">
      <div class="tree-canvas" ref={wrap} onPointerMove={move} onPointerLeave={() => setTip(null)}>
        <canvas ref={cv} aria-label="The great tree, drawn from every run" role="img" />
        {tip && <div class="tree-tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>{tip.text}</div>}
      </div>
      <div class="tree-side">
        <div class="tree-stats">
          <div><b>{S.runsN}</b><span>runs, one twig each</span></div>
          <div><b>{Math.round(S.kmT)}</b><span>km of leaves</span></div>
          <div><b>{st.activeWeeks}</b><span>growth rings of {st.weeksTotal} weeks</span></div>
          <div><b>{st.streak}</b><span>week streak</span></div>
        </div>
        <p class="tree-line">Leaves are in <b>{SEASON(S.season, S.heat, st.dormant)}</b>: your last ten days at {Math.round(st.ratio * 100)}% of your usual load{st.dormant >= 1 ? `, ${Math.floor(st.dormant)} day${Math.floor(st.dormant) === 1 ? '' : 's'} since the last run` : ''}.</p>
        <p class="tree-line">{S.limbs.length} limbs, one a month · {S.branches.length} branches, one a week · {S.fruits.length} fruit from the last three weeks{Object.keys(kinds).length ? ` (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''} · {S.rings.length} amber marks for milestones.</p>
        <p class="tree-line dim">Roots are your weekdays, as thick as the share of runs on that day. Knots are weeks you paused. Hover anything to read the run behind it.</p>
        <label class="tree-time">
          <span>{fmt(T)}</span>
          <input type="range" min={0} max={Math.floor(M.today)} step={1} value={Math.floor(T)} onInput={(e) => setT(+(e.target as HTMLInputElement).value)} aria-label="Grow the tree to a date" />
        </label>
        <div class="tree-actions">
          <button type="button" class="btn" onClick={() => setT(Math.max(0, T - 30))}>A month back</button>
          <button type="button" class="btn" onClick={() => setT(M.today)}>Today</button>
        </div>
      </div>
    </div>
  );
}

function PlaceView({ h }: { h: Habit }) {
  const [, bump] = useState(0);
  const m = h.m, k = STAGES[h.kind];
  const prog = m.stage >= 6 ? 1 : Math.max(0, Math.min(1, (m.wood - stageFloor(m.stage)) / (m.next - stageFloor(m.stage))));
  return (
    <div class="place-view">
      <p class="place-stage">{h.name}: <b>{k[m.stage]}</b> <span class="dim">(stage {m.stage} of 6)</span></p>
      <div class="place-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog * 100)} aria-label="Progress to the next stage"><i style={{ width: `${prog * 100}%` }} /></div>
      <p>{!m.total ? 'Not started yet. The first check-in plants it.' : m.neglected ? `Overgrown: ${m.dormant} days since the last time, and an elder has made its den here. Come back to the habit and the place clears.` : `${m.streak}-week streak · ${m.thisWeek} of ${h.target} this week · ${m.total} in all.`}</p>
      <Spark spark={m.spark} />
      <p class="dim">Each week you keep it adds to its growth, more for a streak, toward a weekly target of {h.target}. Places never shrink. Leave one for three weeks and it gets overgrown, and creatures gather there.</p>
      {h.src === 'manual' && (
        <button type="button" class="btn" aria-pressed={m.today} onClick={() => { toggleToday(h.key); bump((x) => x + 1); }}>{m.today ? 'Done today ✓' : 'Log today'}</button>
      )}
      {h.src === 'manual' && <p class="dim">{h.example && !habits.log.off[h.key] ? 'Starts with example check-ins. ' : ''}Check-ins are kept in this browser; the place regrows next time the valley loads.</p>}
    </div>
  );
}

export function HabitPanel() {
  const key = ui.habit.value;
  const h = habits.list.find((x) => x.key === key);
  const title = h ? `${h.name} · ${STAGES[h.kind][h.m.stage]}` : 'A place in the valley';
  return (
    <section class="overlay plate habit-panel" role="dialog" aria-label={title}>
      <header><h2>{title}</h2><div class="head-actions"><button type="button" class="x" aria-label="Close" onClick={() => closePanel('habit')}>×</button></div></header>
      <div class="body">
        {!habits.model ? <p>No habit data was found, so the valley is still a seed.</p> : h?.kind === 'tree' ? <TreeView /> : h ? <PlaceView h={h} /> : null}
      </div>
    </section>
  );
}
