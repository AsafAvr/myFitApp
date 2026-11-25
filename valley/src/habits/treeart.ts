import { penRun, lay, tooth, artRng, artHash, artShade, INK, PAPER, SLANT, LIGHT } from '../ui/art';
import { FT, type Scene, type Model, type Pt3 } from './fittree';

interface Pt { x: number; y: number }
export interface TreeHit { x: number; y: number; r: number; text: string }
export interface TreeDrawing { frames: HTMLCanvasElement[]; hits: TreeHit[] }
type Rand = () => number;

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}
const BARK = { base: '#b07c4f', deep: '#5a3824' };
const ROOT = { base: '#c49a6c', deep: '#6e4a2c' };
const FRUIT: Record<string, string> = { easy: '#d8443a', long: '#e0562e', tempo: '#ef9a2a', hill: '#7a4c9c', race: '#e9b92c' };
const KIND_WORD: Record<string, string> = { easy: 'cherries · an easy run', long: 'an apple · a long run', tempo: 'an orange · a fast run', hill: 'plums · a hilly run', race: 'a golden apple · a race' };
const DAYS: Record<string, string> = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' };

function boxOf(pts: Pt[]) {
  const b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (const p of pts) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); }
  return b;
}
// coloured pencil laid at the page's slant, a deeper pencil on the side away from the light, then the pen
function pencilShape(ctx: CanvasRenderingContext2D, poly: Pt[], base: string, deep: string, amount: number, gap: number, lw: number, pen: number, r: Rand, outline = true): void {
  if (poly.length < 3) return;
  const box = boxOf(poly), path = new Path2D();
  path.moveTo(poly[0].x, poly[0].y); for (const p of poly) path.lineTo(p.x, p.y); path.closePath();
  ctx.save(); ctx.clip(path);
  ctx.globalAlpha = 0.22; ctx.fillStyle = base; ctx.fill(path);
  lay(ctx, box, gap, SLANT, 0.95, () => 0.92, base, 0.9, lw, r);
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const ext = ((box.x1 - box.x0) * LIGHT.x + (box.y1 - box.y0) * LIGHT.y) / 2 || 1;
  lay(ctx, box, gap * 1.12, SLANT + 0.16, 0.9, (x, y) => smooth(-0.2, 0.5, ((x - cx) * LIGHT.x + (y - cy) * LIGHT.y) / ext) * amount, deep, 0.82, lw, r);
  ctx.restore();
  if (outline) penRun(ctx, poly.concat([poly[0]]), true, pen, INK, 0.95, 0.55, r);
  ctx.globalAlpha = 1;
}
const circle = (cx: number, cy: number, rad: number, n = 18): Pt[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos(i / n * Math.PI * 2) * rad, y: cy + Math.sin(i / n * Math.PI * 2) * rad }));

export function drawTree(S: Scene, M: Model, w: number, h: number, dpr: number, nFrames = 3): TreeDrawing {
  const gy = h * 0.7, top = 18;
  const bb = S.bbox;
  const k = Math.min((gy - top) / Math.max(60, -bb.y0 + 10), (w - 30) / Math.max(60, bb.x1 - bb.x0 + 20));
  const ox = w / 2 - k * (bb.x0 + bb.x1) / 2 * 0.9;
  const P = (x: number, y: number): Pt => ({ x: ox + x * k, y: gy + y * k });
  const maxDepth = Math.max(1, ...S.roots.map((r) => Math.max(...r.pts.map((p) => p.y))));
  const rootFit = Math.min(1, (h - gy - 40) / (maxDepth * k));
  const R = (x: number, y: number): Pt => ({ x: ox + x * k, y: gy + y * k * rootFit });
  const outlineOf = (pts: Pt3[], map: (x: number, y: number) => Pt): Pt[] => { const [l, r] = FT.geom.outline(pts); return [...l, ...r.slice().reverse()].map(([x, y]) => map(x, y)); };
  const hits: TreeHit[] = [];
  const unit = { gap: Math.max(1.6, Math.min(2.6, k * 4)), lw: 1.1, pen: Math.max(1.1, Math.min(2.2, k * 3)) };
  const days = (d: number) => new Date(M.origin + Math.floor(d) * 86400000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < nFrames; f++) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = artRng(artHash(M.seed + ':tree:' + f));
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);

    // ---- soil and roots: one root per weekday
    const m = S.moisture;
    ctx.save(); ctx.beginPath(); ctx.rect(0, gy, w, h - gy); ctx.clip();
    lay(ctx, { x0: 0, y0: gy, x1: w, y1: h }, unit.gap * 1.4, SLANT, 0.85, (_x, y) => (y < gy ? 0 : (0.25 + 0.45 * m) * (1 - smooth(gy, h, y) * 0.6)), m > 0.5 ? '#8a6a48' : '#c2a27c', 0.55, 1, r);
    ctx.restore();
    for (let i = 0; i < 260; i++) { ctx.globalAlpha = 0.15 + r() * 0.3; ctx.fillStyle = INK; ctx.fillRect(r() * w, gy + 4 + Math.pow(r(), 1.4) * (h - gy - 8), 0.9, 0.9); }
    ctx.globalAlpha = 1;
    S.roots.forEach((rt) => {
      rt.subs.forEach((sp) => penRun(ctx, sp.map((p) => R(p.x, p.y)), false, unit.pen * 0.6, '#5a3a22', 0.7, 0.5, r));
      const poly = outlineOf(rt.pts, R);
      pencilShape(ctx, poly, rt.strongest ? '#d8a868' : ROOT.base, ROOT.deep, 0.5, unit.gap, unit.lw, unit.pen * 0.9, r);
      const tip = R(rt.pts[rt.pts.length - 1].x, rt.pts[rt.pts.length - 1].y);
      hits.push({ x: tip.x, y: tip.y, r: 18, text: `${DAYS[rt.day] || rt.day}: ${rt.runs} runs, ${rt.km.toFixed(0)} km${rt.strongest ? ' — your anchor day' : ''}` });
    });
    ctx.font = '15px "Patrick Hand", "Segoe Print", cursive'; ctx.textAlign = 'center'; ctx.fillStyle = INK;
    const span = Math.min(w - 50, 560);
    S.roots.forEach((rt, i) => { ctx.globalAlpha = rt.strongest ? 1 : 0.7; ctx.fillText(rt.day + (rt.runs ? ` ${rt.runs}` : ''), w / 2 + (i - 3) / 3 * span / 2, h - 12); });
    ctx.globalAlpha = 1;

    // ---- the ground line and grass, in pen
    const gl: Pt[] = []; for (let x = -4; x <= w + 4; x += 7) gl.push({ x, y: gy + Math.sin(x / 37) * 1.4 });
    penRun(ctx, gl, false, unit.pen, INK, 0.9, 0.55, r);
    const [gh, gs, gl2] = FT.geom.interpStops(FT.geom.SEASON_STOPS, Math.min(1, S.season * 0.85 + 0.12));
    const grass = S.winter ? '#a39478' : hex(gh, gs * 0.8, gl2);
    for (let x = 4; x < w; x += 4 + r() * 6) penRun(ctx, [{ x, y: gy }, { x: x + (r() - 0.5) * 4, y: gy - 3 - r() * 8 }], false, 1, grass, 0.85, 0.3, r);

    // ---- trunk: hatched bark, knots where you paused, amber for milestones
    const trunk = outlineOf(S.trunk, P);
    pencilShape(ctx, trunk, BARK.base, BARK.deep, 0.65, unit.gap, unit.lw, unit.pen * 1.15, r);
    for (let i = 0; i < 10 + S.wood / 3; i++) {
      const u = r() * 0.9, p = S.trunkPt(u), wv = (r() * 2 - 1) * p.r * 0.7;
      const a = P(p.x + wv, p.y), b = P(p.x + wv + (r() - 0.5) * 1.5, p.y - 6 - r() * 14);
      penRun(ctx, [a, b], false, unit.pen * 0.5, INK, 0.45, 0.4, r);
    }
    S.knots.forEach((kn) => {
      const p = S.trunkPt(kn.u), c = P(p.x + kn.side * p.r * 0.4, p.y), rr = Math.max(2, p.r * k * kn.size * 0.6);
      penRun(ctx, circle(c.x, c.y, rr, 12).map((q) => ({ x: q.x, y: c.y + (q.y - c.y) * 1.6 })), true, unit.pen * 0.8, INK, 0.85, 0.4, r);
      hits.push({ x: c.x, y: c.y, r: 10, text: kn.kind === 'scar' ? `an old limb, shed: ${kn.label}` : kn.kind === 'bud' ? `a dormant bud: ${kn.label}` : `a knot: ${kn.label}` });
    });
    S.rings.forEach((ring) => {
      const p = S.trunkPt(ring.u), c = P(p.x, p.y), rr = Math.max(1.6, p.r * k * (ring.major ? 0.18 : 0.11));
      pencilShape(ctx, circle(c.x + p.r * k * 0.3, c.y, rr, 10), '#f0b040', '#b06a10', 0.4, 1.2, 0.8, 0.8, r);
      hits.push({ x: c.x, y: c.y, r: Math.max(8, p.r * k * 0.6), text: `amber: ${ring.label}` });
    });
    if (S.carving) {
      const p = S.trunkPt(S.carving.u), c = P(p.x, p.y), s = Math.max(5, p.r * k * 0.5);
      const heart: Pt[] = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2; heart.push({ x: c.x + s * 0.06 * 16 * Math.pow(Math.sin(t), 3), y: c.y - s * 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) }); }
      penRun(ctx, heart, true, unit.pen * 0.8, '#8a2a1a', 0.9, 0.3, r);
      ctx.font = `${Math.round(s * 0.8)}px "Patrick Hand", cursive`; ctx.fillStyle = '#5a1f12'; ctx.fillText(S.carving.initial, c.x, c.y + s * 0.25);
      hits.push({ x: c.x, y: c.y, r: s + 4, text: `carved after 12 running weeks: ${S.carving.initial} · ${S.carving.year}` });
    }

    // ---- limbs (months) and branches (weeks)
    S.limbs.forEach((l) => {
      pencilShape(ctx, outlineOf(l.pts, P), BARK.base, BARK.deep, 0.55, unit.gap, unit.lw, unit.pen, r);
      const mid = P(l.pts[Math.floor(l.pts.length * 0.4)].x, l.pts[Math.floor(l.pts.length * 0.4)].y);
      hits.push({ x: mid.x, y: mid.y, r: 9, text: `${l.m.label}: ${l.runs} runs, ${l.km.toFixed(0)} km` });
    });
    S.branches.forEach((b) => {
      const poly = outlineOf(b.pts, P);
      if (b.pts[0].r * k > 1.3) pencilShape(ctx, poly, BARK.base, BARK.deep, 0.5, unit.gap, unit.lw, unit.pen * 0.8, r);
      else penRun(ctx, b.pts.map((p) => P(p.x, p.y)), false, Math.max(0.8, b.pts[0].r * k * 2), INK, 0.85, 0.4, r);
    });
    S.twigs.forEach((t) => {
      penRun(ctx, t.pts.map((p) => P(p.x, p.y)), false, unit.pen * 0.55, INK, 0.75, 0.35, r);
      for (const fk of [...t.forks, ...t.fine]) penRun(ctx, fk.map((p) => P(p.x, p.y)), false, unit.pen * 0.4, INK, 0.6, 0.3, r);
    });

    // ---- leaves: a cluster of coloured pencil per run, darker on the shaded side
    const byTwig = new Map<number, typeof S.leaves>();
    S.leaves.forEach((L) => { const list = byTwig.get(L.ti) || []; list.push(L); byTwig.set(L.ti, list); });
    byTwig.forEach((list) => {
      const path = new Path2D(), pts: Pt[] = [];
      let hs = 0, ss = 0, ls = 0;
      list.forEach((L) => {
        const c = P(L.x + Math.cos(L.ang) * L.size * 0.5, L.y + Math.sin(L.ang) * L.size * 0.5), rad = Math.max(2.2, L.size * k * 0.62);
        path.moveTo(c.x + rad, c.y); path.arc(c.x, c.y, rad, 0, Math.PI * 2);
        pts.push({ x: c.x - rad, y: c.y - rad }, { x: c.x + rad, y: c.y + rad });
        hs += L.h; ss += L.s; ls += L.l;
      });
      const n = list.length, box = boxOf(pts), base = hex(hs / n, ss / n * 0.9, Math.min(70, ls / n + 10)), deep = hex(hs / n + 12, ss / n * 0.8, ls / n * 0.6);
      ctx.save(); ctx.clip(path);
      ctx.globalAlpha = 0.18; ctx.fillStyle = base; ctx.fill(path);
      lay(ctx, box, unit.gap * 0.9, SLANT, 0.97, () => 0.94, base, 0.95, unit.lw, r);
      const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, ext = ((box.x1 - box.x0) * LIGHT.x + (box.y1 - box.y0) * LIGHT.y) / 2 || 1;
      lay(ctx, box, unit.gap, SLANT + 0.16, 0.9, (x, y) => smooth(-0.3, 0.55, ((x - cx) * LIGHT.x + (y - cy) * LIGHT.y) / ext) * 0.7, deep, 0.8, unit.lw, r);
      ctx.restore();
      list.forEach((L, i) => {
        if (i % 3) return;
        const c = P(L.x, L.y), len = Math.max(4, L.size * k * 1.15), a = L.ang;
        const tipx = c.x + Math.cos(a) * len, tipy = c.y + Math.sin(a) * len, nx = -Math.sin(a) * len * 0.3, ny = Math.cos(a) * len * 0.3;
        penRun(ctx, [c, { x: (c.x + tipx) / 2 + nx, y: (c.y + tipy) / 2 + ny }, { x: tipx, y: tipy }, { x: (c.x + tipx) / 2 - nx, y: (c.y + tipy) / 2 - ny }, c], false, 0.7, artShade(deep, -0.3), 0.6, 0.25, r);
      });
    });
    S.twigs.forEach((t) => { const tip = P(t.tip.x, t.tip.y); hits.push({ x: tip.x, y: tip.y, r: 8 + Math.sqrt(t.run.km) * 1.2, text: `${t.run.name || 'Run'} · ${days(t.run.day)} · ${t.run.km.toFixed(1)} km${t.run.pace ? ` · ${Math.floor(t.run.pace / 60)}:${String(Math.round(t.run.pace % 60)).padStart(2, '0')}/km` : ''}` }); });

    // ---- blossoms, fruit, nest, swing
    S.blossoms.forEach((b) => { const c = P(b.x, b.y), rad = Math.max(1.6, b.size * k * 0.45); for (let i = 0; i < 5; i++) { const a = b.rot + i * Math.PI * 0.4; pencilShape(ctx, circle(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad, rad * 0.75, 8), '#f6c3d2', '#c8627e', 0.3, 1.1, 0.7, 0.5, r, false); } });
    S.fruits.forEach((fr) => {
      const at = P(fr.x, fr.y), rad = Math.max(3, fr.size * k * 0.8), c = { x: at.x, y: at.y + fr.stem * k + rad };
      penRun(ctx, [at, { x: c.x, y: c.y - rad }], false, 0.9, INK, 0.9, 0.2, r);
      pencilShape(ctx, circle(c.x, c.y, rad, 16), FRUIT[fr.kind] || '#d8443a', artShade(FRUIT[fr.kind] || '#d8443a', -0.5), 0.6, 1.4, 0.9, unit.pen * 0.8, r);
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(c.x - rad * 0.35, c.y - rad * 0.35, rad * 0.22, rad * 0.14, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      hits.push({ x: c.x, y: c.y, r: rad + 6, text: `${KIND_WORD[fr.kind] || fr.kind}: ${fr.run.km.toFixed(1)} km on ${days(fr.run.day)}${fr.latest ? ' (latest)' : ''}` });
    });
    if (S.nest) {
      const c = P(S.nest.x, S.nest.y), s = 9 * S.nest.scale * k * 1.1 + 4;
      pencilShape(ctx, [{ x: c.x - s, y: c.y - 1 }, { x: c.x + s, y: c.y - 1 }, { x: c.x + s * 0.7, y: c.y + s * 0.45 }, { x: c.x - s * 0.7, y: c.y + s * 0.45 }], '#a67a48', '#5a3a1e', 0.5, 1.3, 0.8, unit.pen * 0.8, r);
      for (let e = 0; e < S.nest.eggs; e++) pencilShape(ctx, circle(c.x - s * 0.6 + e * (s * 1.2 / Math.max(1, S.nest.eggs - 1)), c.y - s * 0.2, s * 0.17, 10), '#a8d8e6', '#4a8aa0', 0.3, 1, 0.6, 0.6, r);
      hits.push({ x: c.x, y: c.y, r: s + 4, text: `nest: a ${S.nest.streak}-week streak, ${S.nest.eggs} egg${S.nest.eggs > 1 ? 's' : ''}` });
    }
    if (S.swing) {
      const t0 = P(S.swing.x, S.swing.y), hw = S.swing.w * k / 2, by = t0.y + S.swing.len * k;
      penRun(ctx, [{ x: t0.x - hw, y: t0.y }, { x: t0.x - hw, y: by }], false, 0.9, INK, 0.85, 0.3, r);
      penRun(ctx, [{ x: t0.x + hw, y: t0.y }, { x: t0.x + hw, y: by }], false, 0.9, INK, 0.85, 0.3, r);
      pencilShape(ctx, [{ x: t0.x - hw - 3, y: by - 2 }, { x: t0.x + hw + 3, y: by - 2 }, { x: t0.x + hw + 3, y: by + 2 }, { x: t0.x - hw - 3, y: by + 2 }], '#c58e57', '#70462a', 0.5, 1.2, 0.8, 0.9, r);
      hits.push({ x: t0.x, y: by, r: hw + 8, text: 'the swing: 26 weeks with a run' });
    }

    // ---- hand-lettered notes with pen leaders
    const notes: { at: Pt; text: string }[] = [];
    const strong = S.roots.find((x) => x.strongest);
    if (strong) notes.push({ at: R(strong.pts[strong.pts.length - 1].x, strong.pts[strong.pts.length - 1].y), text: `${DAYS[strong.day] || strong.day}: your anchor day` });
    const tm = S.trunkPt(0.35); notes.push({ at: P(tm.x + tm.r, tm.y), text: `${S.st.activeWeeks} growth rings` });
    const lf = S.fruits.find((x) => x.latest);
    if (lf) notes.push({ at: P(lf.x, lf.y + lf.stem + lf.size), text: `latest: ${lf.run.km.toFixed(1)} km` });
    if (S.nest) notes.push({ at: P(S.nest.x, S.nest.y), text: `${S.nest.streak}-week streak` });
    ctx.font = '16px "Patrick Hand", "Segoe Print", cursive';
    notes.forEach((nt, i) => {
      const left = nt.at.x > w / 2, tx = left ? w - 14 : 14, ty = 30 + i * 26 + (i > 1 ? gy * 0.35 : 0);
      ctx.textAlign = left ? 'right' : 'left';
      ctx.globalAlpha = 0.92; ctx.fillStyle = PAPER; const tw = ctx.measureText(nt.text).width; ctx.fillRect(left ? tx - tw - 3 : tx - 3, ty - 14, tw + 6, 19);
      ctx.globalAlpha = 1; ctx.fillStyle = '#4a2e18'; ctx.fillText(nt.text, tx, ty);
      const sx = left ? tx - tw - 6 : tx + tw + 6, mx = (sx + nt.at.x) / 2;
      penRun(ctx, Array.from({ length: 9 }, (_, j) => { const t = j / 8; return { x: (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * nt.at.x, y: (1 - t) * (1 - t) * (ty - 5) + 2 * (1 - t) * t * (ty - 20) + t * t * nt.at.y }; }), false, 0.8, INK, 0.55, 0.4, r);
    });
    tooth(ctx, w, h, r);
    frames.push(cv);
  }
  return { frames, hits };
}
