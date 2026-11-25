/*!
 * FitTree engine — grows a tree from a running-habit genome.
 *
 *   FitTree.prepare(genome)      -> model (precomputed, cached)
 *   FitTree.grow(model, T)       -> scene for day-index T (0 = first run)
 *   FitTree.render(ctx, scene, w, h, opts)
 *
 * Every element is seeded by what it represents (athlete + run id, month,
 * weekday...), so the same run always grows the same twig and the time-lapse
 * is perfectly continuous: scrubbing to any date regrows the exact tree the
 * athlete had on that day.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ utils
  const TAU = Math.PI * 2;
  const DAY = 86400000;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'string' ? hash(seed) : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  function dayIdx(iso, origin) {
    let f = 0;
    if (iso.length > 10) f = (+iso.slice(11, 13) + (+iso.slice(14, 16)) / 60) / 24;
    return Math.round((utc(iso) - origin) / DAY) + f;
  }
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const hsl = (h, s, l, a) => a == null ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)` : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a.toFixed(3)})`;
  function interpStops(stops, x) {
    if (x <= stops[0][0]) return stops[0].slice(1);
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], t = (x - a[0]) / (b[0] - a[0]);
        return a.slice(1).map((v, k) => lerp(v, b[k + 1], t));
      }
    }
    return stops[stops.length - 1].slice(1);
  }
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

  // Hfun: tree height grows with persistence wood (never shrinks).
  const heightFor = (w) => 60 + 440 * (1 - Math.exp(-w / 40));
  const radiusFor = (w) => 1.2 + 28 * Math.pow(Math.max(0, w) / 100, 0.75);
  // ornaments (leaves, fruit, nest) grow with the tree so they stay legible
  const ornamentFor = (H) => 1 + 1.0 * clamp((H - 140) / 330);
  const leafCount = (km) => Math.max(3, Math.min(48, Math.round(km * 1.6)));  // == story.leaves_for

  // Leaf colour through the seasons: [season, hue, sat, light]
  const SEASON_STOPS = [
    [0.00, 24, 42, 30], [0.10, 10, 68, 38], [0.26, 26, 86, 47], [0.42, 44, 80, 47],
    [0.58, 70, 58, 40], [0.74, 108, 46, 32], [0.88, 100, 52, 38], [1.00, 88, 62, 46],
  ];
  const SPORT_FLOWER = {
    Ride: [212, 80, 62], VirtualRide: [212, 80, 62], EBikeRide: [212, 80, 62], GravelRide: [212, 70, 58], MountainBikeRide: [222, 70, 58],
    Swim: [186, 80, 55], Walk: [50, 20, 96], Hike: [45, 30, 94], Workout: [276, 55, 62], WeightTraining: [276, 55, 58],
    Yoga: [330, 70, 72], Pilates: [330, 60, 70], Crossfit: [290, 55, 58], Rowing: [196, 70, 52],
  };
  const KIND_LABEL = { easy: 'Cherries · easy run', long: 'Apple · long run', tempo: 'Orange · fast run', hill: 'Plums · hilly run', race: 'Golden apple · race' };

  // ------------------------------------------------------------- prepare
  function prepare(g) {
    const origin = utc(g.first_day || g.as_of);
    const seed = String(g.athlete && (g.athlete.id || g.athlete.name) || 'tree');
    const runs = (g.runs || []).map((r, i) => {
      const day = dayIdx(r.t, origin);
      const dom = +r.t.slice(8, 10);
      return Object.assign({}, r, { i, day, mkey: r.t.slice(0, 7), wom: Math.min(4, Math.floor((dom - 1) / 7)) });
    });
    const weeks = (g.weeks || []).map((w) => Object.assign({}, w, { day: dayIdx(w.start, origin) }));
    const months = (g.months || []).map((m) => {
      const d0 = dayIdx(m.start, origin);
      const [y, mo] = m.key.split('-').map(Number);
      const d1 = dayIdx(new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10), origin);
      return Object.assign({}, m, { d0, d1, runsIdx: [] });
    });
    const mIndex = {}; months.forEach((m, i) => (mIndex[m.key] = i));
    runs.forEach((r) => { const m = months[mIndex[r.mkey]]; if (m) m.runsIdx.push(r.i); });
    const monthKm = months.filter((m) => m.km > 0).map((m) => m.km);
    const paces = runs.filter((r) => r.pace && r.km > 1).map((r) => r.pace);
    const today = dayIdx(g.as_of, origin) + 0.999;
    const others = (g.others || []).map((o) => Object.assign({}, o, { day: dayIdx(o.t, origin) }));
    const ms = (g.milestones || []).map((m) => Object.assign({}, m, { day: dayIdx(m.t, origin) }));
    return {
      g, origin, seed, runs, weeks, months, others, ms, today,
      target: g.target_runs || 3,
      kmRef: Math.max(15, median(monthKm) || 30),
      medPace: median(paces) || 360,
      dayNames: g.weekday_names || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      name: (g.athlete && (g.athlete.first_name || g.athlete.name)) || '',
      since: (g.runs && g.runs[0] && g.runs[0].t.slice(0, 4)) || '',
      cache: {},
    };
  }

  function weekAt(M, T) { return M.weeks.length ? clamp(Math.floor((T - M.weeks[0].day) / 7), 0, M.weeks.length - 1) : 0; }
  function woodAt(M, T) {
    if (!M.weeks.length || T < 0) return 0;
    const wk = weekAt(M, T), W = M.weeks[wk];
    const prev = wk > 0 ? M.weeks[wk - 1].wood : 0;
    if (!W.runs) return prev;
    const done = M.runs.filter((r) => r.wk === wk && r.day <= T).length;
    return prev + (W.wood - prev) * (done / W.runs);
  }
  function stateAt(M, T) {
    const wk = weekAt(M, T);
    const runsSoFar = M.runs.filter((r) => r.wk === wk && r.day <= T).length;
    const W = M.weeks[wk] || { streak: 0 };
    const streak = runsSoFar > 0 ? W.streak : wk > 0 ? M.weeks[wk - 1].streak : 0;
    const days = M.g.days && M.g.days.season && M.g.days.season.length ? M.g.days : { season: [0.8], heat: [0], ratio: [0] };
    const di = clamp(Math.floor(T), 0, days.season.length - 1);
    let last = -1e9; for (const r of M.runs) { if (r.day <= T) last = r.day; else break; }
    let active = 0; for (let i = 0; i < wk; i++) if (M.weeks[i].runs) active++;
    if (runsSoFar) active++;
    return { wk, streak, season: days.season[di] ?? 0.8, heat: days.heat[di] ?? 0, ratio: days.ratio[di] ?? 1,
      dormant: T - last, activeWeeks: active, weeksTotal: wk + 1 };
  }

  // ----------------------------------------------------------------- grow
  function grow(M, T) {
    T = Math.min(T, M.today);
    const R0 = rng(M.seed + ':trunk');
    const runsT = M.runs.filter((r) => r.day <= T);
    const st = stateAt(M, T);
    const wT = woodAt(M, T);
    const winter = st.dormant >= 21 || st.season < 0.08;
    const droop = runsT.length ? smooth(3, 16, st.dormant) * 0.55 : 0;   // a thirsty tree lets its leaves hang
    // before the first run there is only a seedling stub
    const H = runsT.length ? heightFor(wT) : 12;
    const R = runsT.length ? radiusFor(wT) : 0.8;
    const kmT = runsT.reduce((a, r) => a + r.km, 0);
    const OS = ornamentFor(H);
    const S = { T, H, R, OS, wood: wT, st, kmT, runsN: runsT.length, limbs: [], branches: [], twigs: [], leaves: [],
      fruits: [], blossoms: [], knots: [], rings: [], roots: [], flowers: [], fallen: [], hits: [], nest: null,
      bbox: { x0: -R * 2, x1: R * 2, y0: -H, y1: 0 } };
    const grow_bb = (x, y) => { const b = S.bbox; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; };

    // ---- trunk spine (shape seeded per athlete, scales with height)
    const a1 = (R0() < 0.5 ? -1 : 1) * (0.05 + R0() * 0.08), f1 = 0.7 + R0() * 0.8, p1 = R0() * TAU;
    const a2 = (R0() - 0.5) * 0.09, f2 = 1.6 + R0(), p2 = R0() * TAU, lean = (R0() - 0.5) * 0.08;
    const spineX = (u) => H * (a1 * Math.sin(Math.PI * u * f1 + p1) * u + a2 * Math.sin(Math.PI * u * f2 + p2) * u * u + lean * u);
    const trunkR = (u) => Math.max(0.7, R * Math.pow(1 - u * 0.88, 0.95) * (1 + 0.6 * Math.pow(1 - u, 10)));
    const trunkPt = (u) => ({ x: spineX(u), y: -H * u, r: trunkR(u) });
    S.trunk = []; for (let k = 0; k <= 48; k++) S.trunk.push(trunkPt(k / 48));
    S.trunkPt = trunkPt;
    // ring/height position of a moment in time on the trunk
    const yAt = (day) => Math.min(H * 0.97, heightFor(woodAt(M, day)) * 0.92);

    // ---- limbs: one per month, living crown = last 18 months
    const living = [];
    M.months.forEach((m, mi) => {
      if (m.d0 > T) return;
      const mr = m.runsIdx.map((i) => M.runs[i]).filter((r) => r.day <= T);
      const age = T - m.d1;
      const yA = yAt(Math.min(T, (m.d0 + m.d1) / 2));
      const u = clamp(yA / H, 0.04, 0.97);
      const rm = rng(M.seed + ':m:' + m.key);
      const side = (mi % 2 ? 1 : -1) * (mi >= 3 && rm() < 0.18 ? -1 : 1);
      if (!mr.length) {   // a month without runs: a dormant bud / knot
        if (m.d1 <= T) S.knots.push({ u, side: side, size: 0.35 + rm() * 0.2, kind: 'bud', label: m.label });
        return;
      }
      if (age > 548) { S.knots.push({ u, side, size: 0.45 + 0.35 * Math.min(1, mr.length / 12), kind: 'scar', label: m.label }); return; }
      living.push({ m, mi, mr, u, side, rm });
    });

    living.forEach(({ m, mr, u, side, rm }) => {
      const km = mr.reduce((a, r) => a + r.km, 0);
      const vigor = clamp(0.5 * mr.length / (M.target * 4.35) + 0.5 * km / M.kmRef, 0.1, 1.3);
      const woodEnd = woodAt(M, Math.min(T, m.d1));
      const growF = 0.68 + 0.32 * (1 - Math.exp(-(wT - woodEnd) / 10));
      const hRel = u;
      const env = 1.0 - 0.5 * Math.pow(hRel, 1.5);
      const L = (40 + 0.66 * H * env) * (0.4 + 0.6 * vigor) * growF;
      const elbowAt = 3 + Math.floor(rm() * 5), elbow = (rm() - 0.5) * 0.7;
      const theta = (lerp(78, 34, hRel) + (rm() - 0.5) * 18) * Math.PI / 180;
      const base = trunkPt(u);
      let dir = { x: side * Math.sin(theta), y: -Math.cos(theta) };
      const r0 = Math.min(base.r * 0.7, 0.8 + 0.2 * R * Math.sqrt(vigor) + 0.4);
      const pts = [{ x: base.x, y: base.y, r: r0 }];
      const n = 11; let p = { x: base.x, y: base.y };
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const sag = (L / 300) * 0.07 * (1 - t) * (1 - t);
        dir = norm({ x: dir.x + (rm() - 0.5) * 0.2, y: dir.y - 0.075 * t + sag });
        if (k === elbowAt) dir = rot(dir, elbow);
        p = { x: p.x + dir.x * L / n, y: p.y + dir.y * L / n };
        pts.push({ x: p.x, y: p.y, r: Math.max(0.35, r0 * (1 - 0.8 * t)) });
        grow_bb(p.x, p.y);
      }
      const li = S.limbs.length;
      const limb = { pts, m, vigor, side, L, km, runs: mr.length, u, li, z: rm() < 0.42 ? -1 : 1, ph: rm() * TAU };
      S.limbs.push(limb);
      S.hits.push({ type: 'limb', x: pts[5].x, y: pts[5].y, r: Math.max(6, r0 * 2), data: { label: m.label, runs: mr.length, km, vigor } });

      // ---- week branches along the limb (week-of-month)
      const groups = {};
      mr.forEach((r) => (groups[r.wom] = groups[r.wom] || []).push(r));
      Object.keys(groups).forEach((wk) => {
        const wr = groups[wk].sort((a, b) => a.day - b.day);
        const w = +wk;
        const rb = rng(M.seed + ':b:' + m.key + ':' + w);
        const s = 0.2 + 0.76 * (w + 0.5) / 5;
        const at = samplePolyline(pts, s);
        const wkm = wr.reduce((a, r) => a + r.km, 0);
        const wstr = clamp(0.6 * Math.min(1, wr.length / M.target) + 0.4 * Math.min(1, wkm / (M.kmRef / 4.35)), 0.15, 1);
        const bside = (w % 2 ? 1 : -1) * (rb() < 0.25 ? -1 : 1);
        let bd = rot(at.dir, bside * (0.62 + rb() * 0.35));
        bd = norm({ x: bd.x, y: bd.y - 0.35 });
        const Lb = 10 + L * (0.22 + 0.36 * wstr) * (1 - 0.32 * s);
        const br0 = Math.min(at.r * 0.85, 0.45 + 1.6 * Math.sqrt(wstr) * Math.sqrt(R / 12));
        const bpts = [{ x: at.x, y: at.y, r: br0 }];
        let q = { x: at.x, y: at.y };
        const bendB = (rb() - 0.5) * 0.18;
        for (let k = 1; k <= 6; k++) {
          bd = norm(rot({ x: bd.x + (rb() - 0.5) * 0.22, y: bd.y - 0.07 }, bendB));
          q = { x: q.x + bd.x * Lb / 6, y: q.y + bd.y * Lb / 6 };
          bpts.push({ x: q.x, y: q.y, r: Math.max(0.3, br0 * (1 - 0.75 * k / 6)) });
          grow_bb(q.x, q.y);
        }
        const bi = S.branches.length;
        S.branches.push({ pts: bpts, runs: wr.length, km: wkm, li, bi, z: limb.z, ph: rb() * TAU });
        // ---- run twigs: placed along the week branch by weekday
        const sameDay = {};
        wr.forEach((r) => {
          const n2 = (sameDay[r.dow] = (sameDay[r.dow] || 0) + 1) - 1;
          twig(r, bpts, 0.14 + 0.8 * (r.dow + 0.5) / 7 + n2 * 0.04, (r.dow % 2 ? 1 : -1) * (n2 % 2 ? -1 : 1), li, bi);
        });
      });
    });

    function twig(r, bpts, s, tside, li, bi) {
      const rt = rng(M.seed + ':r:' + r.id);
      const at = samplePolyline(bpts, clamp(s, 0.05, 1));
      const speed = r.pace ? clamp((M.medPace - r.pace) / (0.12 * M.medPace), -1, 1) : 0;
      let d = rot(at.dir, tside * (0.5 + rt() * 0.45));
      d = norm({ x: d.x, y: d.y - (0.22 + 0.28 * speed) });
      const Lt = (7 + 6.2 * Math.sqrt(r.km)) * (1 + 0.45 * (OS - 1));
      const epk = r.km > 0.5 ? r.elev / r.km : 0;
      const kink = clamp(epk / 32) * 0.75 + (r.sport === 'TrailRun' ? 0.25 : 0);
      const tr0 = Math.min(at.r * 0.9, 0.35 + 0.13 * Math.sqrt(r.km));
      const pts = [{ x: at.x, y: at.y, r: tr0 }];
      let p = { x: at.x, y: at.y };
      const n = 4;
      for (let k = 1; k <= n; k++) {
        const dd = rot(d, (rt() - 0.5) * kink * 1.4);
        p = { x: p.x + dd.x * Lt / n, y: p.y + dd.y * Lt / n };
        pts.push({ x: p.x, y: p.y, r: Math.max(0.22, tr0 * (1 - 0.7 * k / n)) });
        grow_bb(p.x, p.y);
      }
      const forks = [];
      const nf = r.km >= 7 ? Math.min(3, Math.floor(r.km / 6)) : 0;
      for (let f = 0; f < nf; f++) {
        const fs = 0.45 + 0.17 * f;
        const fa = samplePolyline(pts, fs);
        const fd = norm(rot(fa.dir, (f % 2 ? 1 : -1) * (0.55 + rt() * 0.3)));
        const fl = Lt * (0.45 + rt() * 0.2);
        const fp = [{ x: fa.x, y: fa.y, r: fa.r * 0.8 }, { x: fa.x + fd.x * fl * 0.5, y: fa.y + fd.y * fl * 0.5 - 1, r: fa.r * 0.55 },
          { x: fa.x + fd.x * fl, y: fa.y + fd.y * fl - 2, r: 0.2 }];
        forks.push(fp); grow_bb(fp[2].x, fp[2].y);
      }
      // fine twiglets: the dense, brushy texture of a real crown
      const fine = [];
      const nfine = 1 + Math.floor(rt() * 2) + (r.km > 5 ? 1 : 0);
      for (let f = 0; f < nfine; f++) {
        const fa = samplePolyline(pts, 0.35 + rt() * 0.6);
        const fd = norm(rot(fa.dir, (rt() < 0.5 ? -1 : 1) * (0.5 + rt() * 0.55)));
        const fl = Lt * (0.24 + rt() * 0.22);
        fine.push([{ x: fa.x, y: fa.y, r: Math.max(0.14, fa.r * 0.55) }, { x: fa.x + fd.x * fl * 0.55, y: fa.y + fd.y * fl * 0.55 - 0.4, r: 0.16 },
          { x: fa.x + fd.x * fl, y: fa.y + fd.y * fl - 1.1, r: 0.1 }]);
      }
      const ti = S.twigs.length;
      const tw = { pts, forks, fine, run: r, li, bi, ti, ph: rt() * TAU };
      S.twigs.push(tw);
      const tip = pts[pts.length - 1];
      const age = T - r.day;
      S.hits.push({ type: 'run', x: tip.x, y: tip.y, r: 7 + Math.sqrt(r.km) * 1.5, data: r });

      // ---- leaves (~1.6 per km)
      const nL = leafCount(r.km);
      const paths = [pts, ...forks, ...fine];
      const effort = clamp(r.min / 70);
      for (let k = 0; k < nL; k++) {
        const path = paths[k % paths.length];
        const tpos = k < paths.length ? 1 : 0.28 + 0.72 * rt();
        const a = samplePolyline(path, tpos);
        const lside = k % 2 ? 1 : -1;
        const base = Math.atan2(a.dir.y, a.dir.x);
        let ang = tpos >= 0.999 ? base + (rt() - 0.5) * 0.6 : base + lside * (0.6 + rt() * 0.6);
        ang = blendAngle(ang, Math.PI / 2, 0.16 + droop);          // leaves hang; more when thirsty
        S.leaves.push({
          x: a.x, y: a.y, ang, size: (5.6 + 3.0 * rt()) * (0.9 + 0.3 * effort) * OS,
          sens: rt(), drop: rt(), hueJ: rt() - 0.5, lightJ: rt() - 0.5, back: rt() < 0.38, keep: rt(),
          age, run: r.i, ti, shape: (rt() * 4) | 0, fore: 0.55 + rt() * 0.45, flut: rt() * TAU,
        });
        grow_bb(a.x + Math.cos(ang) * 8, a.y + Math.sin(ang) * 8);
      }

      // ---- blossoms for PRs / milestones / achievements (fade after ~2 months)
      const bloom = (r.pr || 0) + (r.ms ? r.ms.length : 0);
      if ((bloom || r.ach) && age < 70 && st.season > 0.3) {
        const nb = Math.min(4, Math.max(1, bloom));
        for (let k = 0; k < nb; k++) {
          const a = samplePolyline(pts, 0.4 + 0.5 * rt());
          S.blossoms.push({ ti, x: a.x + (rt() - 0.5) * 6 * OS, y: a.y + (rt() - 0.5) * 6 * OS, size: (bloom ? 3.2 + rt() * 1.5 : 2) * OS, bud: !bloom, rot: rt() * TAU, fade: smooth(45, 70, age) });
        }
      }
      tw.tip = tip;
    }

    // ---- fruit: latest runs (last 3 weeks, and always the last 3 runs)
    const recentIdx = new Set();
    if (!winter) {
      runsT.forEach((r) => { if (T - r.day <= 21) recentIdx.add(r.i); });
      runsT.slice(-3).forEach((r) => { if (T - r.day <= 30) recentIdx.add(r.i); });
    }
    const lastRun = runsT[runsT.length - 1];
    S.twigs.forEach((tw) => {
      if (!recentIdx.has(tw.run.i)) return;
      const r = tw.run;
      const src = tw.forks.length ? tw.forks[0][2] : tw.tip;
      const size = (2.4 + 1.15 * Math.sqrt(r.km)) * OS;
      const ripe = smooth(0, 10, T - r.day);
      S.fruits.push({ ti: tw.ti, x: src.x, y: src.y, size, kind: r.kind, ripe, latest: lastRun && r.i === lastRun.i, run: r,
        stem: 3 * OS + size * 0.9, ph: (r.id % 97) / 97 * TAU, shrivel: droop });
      S.hits.push({ type: 'run', x: src.x, y: src.y + 3 + size * 1.6, r: size + 6, data: r });
    });

    // ---- leader shoot (the newest growth at the top of the trunk)
    {
      const top = trunkPt(1);
      const rl = rng(M.seed + ':leader:' + Math.floor(wT * 2));
      const recent = runsT.filter((r) => T - r.day <= 7).length;
      const n = 3 + Math.min(8, recent * 2);
      for (let k = 0; k < n; k++) {
        const ang = -Math.PI / 2 + (rl() - 0.5) * 2.2;
        S.leaves.push({ x: top.x + (rl() - 0.5) * 3, y: top.y - rl() * 6, ang, size: (4.5 + rl() * 2.5) * OS, sens: rl(), drop: rl(),
          hueJ: rl() - 0.5, lightJ: rl() - 0.5, back: false, keep: 0, age: recent ? 1 : st.dormant, run: -1, ti: -1,
          shape: (rl() * 4) | 0, fore: 0.6 + rl() * 0.4, flut: rl() * TAU });
      }
      grow_bb(top.x, top.y - 12);
    }

    // ---- knots for missed weeks (consecutive gaps merge)
    let gapStart = -1;
    for (let w = 0; w <= st.wk; w++) {
      const W = M.weeks[w];
      const done = W && W.runs && (w < st.wk || M.runs.some((r) => r.wk === w && r.day <= T));
      const closed = w < st.wk;
      if (!done && closed) { if (gapStart < 0) gapStart = w; }
      else if (gapStart >= 0) {
        const len = w - gapStart; const rk = rng(M.seed + ':gap:' + gapStart);
        S.knots.push({ u: clamp(yAt(M.weeks[gapStart].day) / H, 0.03, 0.95), side: rk() < 0.5 ? -1 : 1, size: 0.3 + Math.min(0.55, len * 0.09), kind: 'gap', label: `${len} week${len > 1 ? 's' : ''} without a run` });
        gapStart = -1;
      }
    }

    // ---- amber rings: milestones on the trunk
    M.ms.forEach((m) => {
      if (m.day > T) return;
      S.rings.push({ u: clamp(yAt(m.day) / H, 0.02, 0.96), label: m.label, t: m.t });
    });
    // merge rings that landed on the same spot
    S.rings.sort((a, b) => a.u - b.u);
    const merged = [];
    S.rings.forEach((r) => { const l = merged[merged.length - 1]; if (l && Math.abs(l.u - r.u) < 0.012) l.label += ' · ' + r.label; else merged.push(Object.assign({}, r)); });
    S.rings = merged;
    S.rings.forEach((r) => {
      r.major = /^First|marathon/i.test(r.label);
      r.off = (rng(M.seed + ':ring:' + r.t)() - 0.5) * 1.6;
      const p = trunkPt(r.u); S.hits.push({ type: 'ring', x: p.x + r.off * p.r * 0.75, y: p.y, r: Math.max(6, p.r * 0.5), data: r });
    });
    S.knots.forEach((k) => { const p = trunkPt(k.u); S.hits.push({ type: 'knot', x: p.x + k.side * p.r * 0.5, y: p.y, r: 7, data: k }); });

    // ---- roots: one per weekday, thickness = share of runs on that day
    {
      const counts = [0, 0, 0, 0, 0, 0, 0], kms = [0, 0, 0, 0, 0, 0, 0];
      runsT.forEach((r) => { counts[r.dow]++; kms[r.dow] += r.km; });
      const maxC = Math.max(1, ...counts);
      const scale = 34 + 210 * (1 - Math.exp(-kmT / 350));
      for (let i = 0; i < 7; i++) {
        const rr = rng(M.seed + ':root:' + i);
        const share = counts[i] / Math.max(1, runsT.length);
        const phi = (lerp(162, 18, i / 6) + (rr() - 0.5) * 10) * Math.PI / 180;
        let d = { x: Math.cos(phi), y: Math.sin(phi) };
        const Lr = scale * (counts[i] ? 0.32 + 0.68 * Math.sqrt(counts[i] / maxC) : 0.12);
        const r0 = Math.max(0.6, R * (0.16 + 0.62 * Math.sqrt(share)));
        const pts = [{ x: (i - 3) / 3 * R * 0.7, y: 1, r: r0 }];
        let p = { x: pts[0].x, y: 1 };
        for (let k = 1; k <= 12; k++) {
          d = norm({ x: d.x + (rr() - 0.5) * 0.32, y: d.y + 0.05 });
          p = { x: p.x + d.x * Lr / 12, y: p.y + d.y * Lr / 12 };
          pts.push({ x: p.x, y: p.y, r: Math.max(0.25, r0 * (1 - 0.92 * k / 12)) });
        }
        const subs = [];
        const ns = Math.min(9, Math.floor(counts[i] / 2));
        for (let k = 0; k < ns; k++) {
          const a = samplePolyline(pts, 0.2 + 0.7 * rr());
          let sd = norm(rot(a.dir, (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.6)));
          const sl = Lr * (0.2 + rr() * 0.3);
          const sp = [{ x: a.x, y: a.y, r: a.r * 0.6 }]; let q = { x: a.x, y: a.y };
          for (let j = 1; j <= 5; j++) {
            sd = norm({ x: sd.x + (rr() - 0.5) * 0.4, y: sd.y + 0.08 });
            q = { x: q.x + sd.x * sl / 5, y: q.y + sd.y * sl / 5 };
            sp.push({ x: q.x, y: q.y, r: Math.max(0.15, a.r * 0.6 * (1 - j / 5.5)) });
          }
          subs.push(sp);
        }
        S.roots.push({ pts, subs, day: M.dayNames[i], runs: counts[i], km: kms[i], share, strongest: counts[i] === maxC && counts[i] > 0 });
        const tip = pts[pts.length - 1];
        S.hits.push({ type: 'root', x: tip.x, y: tip.y, r: 14, data: S.roots[i] });
        S.hits.push({ type: 'root', x: pts[6].x, y: pts[6].y, r: 10, data: S.roots[i] });
      }
    }

    // ---- nest on a strong crotch; eggs = weekly streak
    if (st.streak >= 2 && S.limbs.length) {
      const cand = S.limbs.slice(-8).sort((a, b) => (b.vigor * (0.6 + b.u)) - (a.vigor * (0.6 + a.u)));
      const limb = cand[0];
      const at = samplePolyline(limb.pts, 0.16);
      S.nest = { x: at.x, y: at.y - 1, eggs: Math.min(6, st.streak), bird: st.streak >= 8, streak: st.streak, side: limb.side, scale: OS, li: limb.li };
      S.hits.push({ type: 'nest', x: at.x, y: at.y - 4, r: 12, data: S.nest });
    }

    // ---- meadow: cross-training in the last 90 days becomes wildflowers
    M.others.forEach((o) => {
      const age = T - o.day;
      if (age < 0 || age > 90) return;
      const rf = rng(M.seed + ':f:' + o.t + o.sport);
      const sideF = rf() < 0.5 ? -1 : 1;
      S.flowers.push({ x: sideF * (R * 1.6 + 14 + rf() * 170), h: 9 + rf() * 13, sway: (rf() - 0.5) * 0.4,
        color: SPORT_FLOWER[o.sport] || [48, 90, 60], wilt: smooth(55, 90, age), petals: 5 + Math.floor(rf() * 3), sport: o.sport });
    });

    // ---- smooth the wood into organic curves
    S.limbs.forEach((l) => { l.pts = chaikin(chaikin(l.pts)); });
    S.branches.forEach((b) => { b.pts = chaikin(b.pts); });

    // ---- keepsakes earned by persistence
    if (st.activeWeeks >= 12) {
      const first = M.runs[0] ? M.runs[0].t.slice(0, 4) : '';
      S.carving = { u: clamp(62 / H, 0.1, 0.38), initial: String(M.name || '?').slice(0, 1).toUpperCase(), year: first, weeks: 12 };
      const p = trunkPt(S.carving.u);
      S.hits.push({ type: 'carving', x: p.x, y: p.y, r: Math.max(8, p.r * 0.6), data: S.carving });
    }
    if (st.activeWeeks >= 26 && S.limbs.length) {
      let best = null, bestScore = 0;
      S.limbs.forEach((l) => {
        const at = samplePolyline(l.pts, 0.55);
        const len = -at.y - 26;
        if (len < 32 || len > H * 0.62 || Math.abs(at.x - trunkPt(at.y / -H).x) < S.R * 2.5 + 16) return;
        const score = l.vigor * l.L * (Math.abs(at.dir.x) + 0.2);
        if (score > bestScore) { bestScore = score; best = { l, at, len }; }
      });
      if (best) {
        S.swing = { li: best.l.li, x: best.at.x, y: best.at.y, len: best.len, w: 15, side: best.l.side };
        S.hits.push({ type: 'swing', x: best.at.x, y: best.at.y + best.len, r: 14, data: { weeks: st.activeWeeks } });
      }
    }
    // last month's harvest lies in the grass
    S.fallenFruit = [];
    runsT.forEach((r) => {
      const age = T - r.day;
      if (age <= 21 || age > 50) return;
      const tw = S.twigs.find((t) => t.run.i === r.i);
      const rr = rng(M.seed + ':ff:' + r.id);
      const x = tw ? tw.tip.x * 0.8 + (rr() - 0.5) * 30 : (rr() - 0.5) * 120;
      S.fallenFruit.push({ x, y: 1 + rr() * 4, kind: r.kind, size: (2.2 + 1.0 * Math.sqrt(r.km)) * OS, rot: rr() * TAU, decay: smooth(21, 50, age) });
    });
    // soil moisture: every run waters the tree
    S.moisture = runsT.length ? 1 - smooth(1.5, 12, st.dormant) : 0.2;
    S.hours = runsT.reduce((a, r) => a + r.min, 0) / 60;
    S.droop = droop;

    // ---- leaf colour & fall for this moment
    const sT = st.season, heat = st.heat;
    const kept = [];
    const rf = rng(M.seed + ':fall');
    S.leaves.forEach((L) => {
      if (L.age > 300 && L.keep > 0.7) return;               // very old inner growth thins out
      let sEff = clamp(sT + (L.sens - 0.5) * 0.3 + (L.age < 12 ? 0.14 * (1 - L.age / 12) : 0));
      if (L.run === -1 && st.dormant > 10) sEff = Math.min(sEff, sT);
      let [h, s, l] = interpStops(SEASON_STOPS, sEff);
      h += L.hueJ * 10; l += L.lightJ * 7; s += L.lightJ * 6;
      if (L.age > 200) l -= 3;
      if (heat > 0 && L.sens > 0.55) { h = lerp(h, 6, heat * 0.75); s = lerp(s, 80, heat * 0.6); }
      L.h = h; L.s = s; L.l = L.back ? l - 9 : l;
      if (winter || sEff < 0.04 + 0.24 * L.drop) {
        const fx = L.x * 0.75 + (rf() - 0.5) * 40;
        const [fh, fs, fl] = interpStops(SEASON_STOPS, clamp(0.05 + L.sens * 0.3));
        S.fallen.push({ x: fx, y: 1 + rf() * 5, ang: rf() * TAU, size: L.size * 0.9, h: fh + L.hueJ * 12, s: fs - 10, l: fl - 6 + L.lightJ * 6 });
      } else kept.push(L);
    });
    S.leaves = kept;
    const tw = {};
    kept.forEach((L) => { if (L.run >= 0) { const o = (tw[L.run] = tw[L.run] || { n: 0, h: 0, s: 0, l: 0 }); o.n++; o.h += L.h; o.s += L.s; o.l += L.l; } });
    S.twigs.forEach((t) => { const o = tw[t.run.i]; if (o) { t.nLeaves = o.n; t.h = o.h / o.n; t.s = o.s / o.n; t.l = o.l / o.n; } });
    S.winter = winter;
    S.season = sT; S.heat = heat;
    return S;
  }

  function chaikin(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, r: a.r * 0.75 + b.r * 0.25 });
      if (i < pts.length - 2) out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, r: a.r * 0.25 + b.r * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function blendAngle(a, target, t) {
    let d = target - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return a + d * clamp(t);
  }

  function samplePolyline(pts, s) {
    const n = pts.length - 1;
    const f = clamp(s) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const t = f - i;
    const a = pts[i], b = pts[i + 1];
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), r: lerp(a.r, b.r, t), dir: norm({ x: b.x - a.x, y: b.y - a.y }) };
  }

  // --------------------------------------------------------------- render
  // A painterly, photographic pipeline:
  //   background layer (sky, light, clouds, hills, meadow, soil, roots)  — cached
  //   trunk layer (bark, moss, knots, amber, carving)                     — cached
  //   living layer (limbs, branches, twigs, leaves, fruit) — redrawn every frame with wind
  //   foreground layer (grass, flowers, fallen leaves & fruit, name sign) — cached
  //   film post (light shafts, bloom, grade, faded blacks, vignette, grain)

  // Light follows the time of day the athlete usually runs.
  const LIGHT = {
    dawn: { sun: [0.15, 0.62], col: [26, 95, 70], key: 0.92, sz: -0.3, rays: 0.95, grade: [24, 85, 62, 0.13] },
    morning: { sun: [0.2, 0.27], col: [42, 85, 80], key: 1.0, sz: 0.35, rays: 0.65, grade: [40, 75, 66, 0.09] },
    midday: { sun: [0.62, 0.1], col: [50, 55, 90], key: 1.0, sz: 0.7, rays: 0.3, grade: [44, 55, 70, 0.06] },
    afternoon: { sun: [0.83, 0.3], col: [38, 90, 74], key: 1.0, sz: 0.3, rays: 0.75, grade: [36, 80, 62, 0.11] },
    evening: { sun: [0.86, 0.6], col: [22, 95, 64], key: 0.88, sz: -0.32, rays: 1.0, grade: [18, 85, 58, 0.15] },
    night: { sun: [0.8, 0.16], col: [215, 40, 82], key: 0.42, sz: 0.4, rays: 0, grade: [225, 45, 40, 0.12] },
  };
  const SKIES = {
    dawn: [[0, 218, 34, 36], [0.42, 236, 18, 62], [0.7, 22, 62, 76], [0.88, 36, 80, 82], [1, 44, 86, 86]],
    morning: [[0, 208, 52, 58], [0.55, 202, 48, 75], [0.86, 42, 45, 86], [1, 46, 60, 89]],
    midday: [[0, 214, 68, 50], [0.6, 205, 62, 69], [1, 196, 45, 86]],
    afternoon: [[0, 214, 48, 54], [0.55, 210, 35, 72], [0.85, 36, 60, 80], [1, 40, 80, 82]],
    evening: [[0, 226, 32, 28], [0.4, 262, 16, 50], [0.68, 16, 58, 64], [0.88, 30, 84, 70], [1, 40, 90, 76]],
    night: [[0, 230, 55, 7], [0.6, 226, 45, 15], [1, 238, 30, 24]],
  };

  const mkCanvas = (w, h) => {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
  };
  const mixHSL = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
  const IDENT = [1, 0, 0, 1, 0, 0];
  const apply = (A, p) => ({ x: A[0] * p.x + A[2] * p.y + A[4], y: A[1] * p.x + A[3] * p.y + A[5] });
  const mul = (B, A) => [B[0] * A[0] + B[2] * A[1], B[1] * A[0] + B[3] * A[1], B[0] * A[2] + B[2] * A[3],
    B[1] * A[2] + B[3] * A[3], B[0] * A[4] + B[2] * A[5] + B[4], B[1] * A[4] + B[3] * A[5] + B[5]];
  function affRot(A, p0, ang) {   // rotate everything under A about the moved pivot
    const P = apply(A, p0), c = Math.cos(ang), s = Math.sin(ang);
    return mul([c, s, -s, c, P.x - c * P.x + s * P.y, P.y - s * P.x - c * P.y], A);
  }
  const xf = (A, pts) => pts.map((p) => { const q = apply(A, p); q.r = p.r; return q; });

  // Leaf sprays: one counted leaf is drawn as a small compound leaf.
  let SPRAY = null, SPRAY_HI = null;
  function blade(p, ox, oy, a, sc, half) {
    const c = Math.cos(a) * sc, s = Math.sin(a) * sc;
    const T = (x, y) => [ox + x * c - y * s, oy + x * s + y * c];
    p.moveTo(...T(0, 0));
    p.bezierCurveTo(...T(0.2, -0.34), ...T(0.66, -0.34), ...T(1, 0));
    if (half) { p.lineTo(...T(0.04, 0.0)); p.closePath(); return; }
    p.bezierCurveTo(...T(0.66, 0.3), ...T(0.2, 0.32), ...T(0, 0));
    p.closePath();
  }
  function sprays() {
    if (SPRAY) return;
    // each counted leaf is a leafy sprig: a few leaflets on one short shoot
    const layouts = [
      [[0.12, 0, 0, 0.95], [0.04, 0, -0.95, 0.5], [0.05, 0, 0.9, 0.48]],
      [[0.2, 0, 0, 0.82], [0.12, 0, -0.75, 0.6], [0.12, 0, 0.78, 0.6], [0.02, 0, -1.5, 0.42], [0.03, 0, 1.45, 0.42]],
      [[0.05, 0, -0.38, 0.86], [0.05, 0, 0.42, 0.8], [0.3, 0, 0.02, 0.55]],
      [[0.42, 0, 0, 0.6], [0.1, 0, -0.7, 0.48], [0.14, 0, 0.66, 0.48], [0.22, 0, -0.56, 0.46], [0.26, 0, 0.6, 0.44],
        [0.34, 0, -0.42, 0.4], [0.36, 0, 0.46, 0.4]],
    ];
    SPRAY = []; SPRAY_HI = [];
    layouts.forEach((lay) => {
      const p = new Path2D(), q = new Path2D();
      lay.forEach(([ox, oy, a, sc]) => { blade(p, ox, oy, a, sc, false); blade(q, ox, oy, a, sc, true); });
      SPRAY.push(p); SPRAY_HI.push(q);
    });
  }

  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    NOISE = mkCanvas(256, 256);
    const x = NOISE.getContext('2d'), img = x.createImageData(256, 256), r = rng('grain');
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() + r() + r() - 1.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return NOISE;
  }

  function layout(S, W, Hc, opts) {
    const groundY = Math.round(Hc * (opts.groundFrac || 0.72));
    const top = opts.topPad || 34;
    const treeH = Math.max(150, -S.bbox.y0 + 14);
    const treeW = Math.max(140, S.bbox.x1 - S.bbox.x0 + 30);
    const z = Math.min((groundY - top) / treeH, (W - 40) / treeW, opts.maxZoom || 2.6);
    const cx = W / 2 - z * (S.bbox.x0 + S.bbox.x1) / 2 * 0.85;
    return { z, cx, gy: groundY, W, H: Hc };
  }
  const worldT = (c, R) => c.setTransform(R.v.z * R.dpr, 0, 0, R.v.z * R.dpr, R.v.cx * R.dpr, R.v.gy * R.dpr);
  const screenT = (c, R) => c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);

  function prepareRender(S, W, Hc, opts) {
    opts = opts || {};
    sprays();
    const M = opts.model, dpr = opts.dpr || 1;
    const period = (M && M.g.sky && M.g.sky.period) || 'morning';
    const Lt = LIGHT[period] || LIGHT.morning;
    const v = layout(S, W, Hc, opts);
    S.view = v;
    const treeOnly = opts.layers === 'tree';
    const R = { S, v, dpr, W, H: Hc, period, Lt, M, seed: M ? M.seed : 's', lite: !!opts.lite, post: opts.post !== false && !treeOnly, treeOnly,
      night: period === 'night', opts, horizon: v.gy - Math.max(24, Hc * 0.034) };
    R.sun = { x: W * Lt.sun[0], y: v.gy * Lt.sun[1] };
    const sw = { x: (R.sun.x - v.cx) / v.z, y: (R.sun.y - v.gy) / v.z };
    let ax = 0, ay = 0;
    S.leaves.forEach((L) => { ax += L.x; ay += L.y; });
    const C = S.leaves.length ? { x: ax / S.leaves.length, y: ay / S.leaves.length } : { x: 0, y: -S.H * 0.75 };
    let rx = 20, ry = 20;
    S.leaves.forEach((L) => { rx = Math.max(rx, Math.abs(L.x - C.x)); ry = Math.max(ry, Math.abs(L.y - C.y)); });
    R.crown = { x: C.x, y: C.y, rx, ry };
    R.sunDir = norm({ x: sw.x - C.x, y: sw.y - C.y });
    const k = Math.sqrt(Math.max(0, 1 - Lt.sz * Lt.sz));
    R.sun3 = { x: R.sunDir.x * k, y: R.sunDir.y * k, z: Lt.sz };
    R.sunSide = Math.sign(sw.x - S.trunk[0].x) || 1;
    R.wind = (0.8 + 0.7 * clamp(0.55 - S.season)) * (opts.wind == null ? 1 : opts.wind);
    shadeLeaves(R);
    R.backLeaves = S.leaves.filter((L) => L.back);
    R.frontLeaves = S.leaves.filter((L) => !L.back);
    R.bark = barkColors(R);
    R.cw = Math.max(1, Math.round(W * dpr)); R.ch = Math.max(1, Math.round(Hc * dpr));
    R.bg = mkCanvas(R.cw, R.ch); drawBackground(R.bg.getContext('2d'), R);
    R.trunkLayer = mkCanvas(R.cw, R.ch);
    { const c = R.trunkLayer.getContext('2d'); worldT(c, R); drawTrunk(c, R); }
    R.fg = mkCanvas(R.cw, R.ch); drawForeground(R.fg.getContext('2d'), R);
    if (!R.lite && R.post) {
      R.vig = makeVignette(R);
      R.bloom = mkCanvas(Math.max(1, R.cw >> 3), Math.max(1, R.ch >> 3));
    }
    return R;
  }

  function shadeLeaves(R) {
    const { S, crown: C, sun3, Lt } = R;
    const key = Lt.key * (S.winter ? 0.7 : 1);
    const backlit = Lt.sz < 0;
    S.leaves.forEach((L) => {
      const nx = (L.x - C.x) / (C.rx * 1.05), ny = (L.y - C.y) / (C.ry * 1.05);
      const r2 = Math.min(1, nx * nx + ny * ny);
      const nz = Math.sqrt(1 - r2) * (L.back ? -0.6 : 1);
      const lam = clamp(0.5 + 0.5 * (nx * sun3.x + ny * sun3.y + nz * sun3.z));
      const ao = 0.45 + 0.55 * smooth(0.05, 0.95, Math.sqrt(r2));
      const light = clamp(lam * ao * key * 1.15 + 0.07 * L.lightJ);
      let h = L.h + (0.5 - light) * 18;
      let s = L.s * (0.78 + 0.38 * light);
      let l = L.l * (0.5 + 0.85 * light);
      if (backlit && lam > 0.6) { const g = (lam - 0.6) / 0.4 * key; h = lerp(h, 64, g * 0.45); s += 16 * g; l += 13 * g; }
      if (R.night) { h = lerp(h, 215, 0.35); s *= 0.55; l *= 0.62; }
      h = lerp(h, Lt.col[0], 0.1 * light);
      if (L.back) { l *= 0.76; s *= 0.88; }
      l = clamp(l, 4, 84); s = clamp(s, 5, 96);
      L.c1 = hsl(h, s, l);
      L.c2 = hsl(h - 6, Math.min(100, s + 5), Math.min(92, l + 6 + 9 * light));
      L.lit = light;
    });
  }

  function barkColors(R) {
    const y = clamp(1 - R.S.wood / 40);
    const b = [lerp(24, 30, y), lerp(13, 24, y), lerp(25, 32, y)];
    const [lh, ls, ll] = R.Lt.col;
    const n = R.night ? 0.55 : 1;
    return {
      hsl: b,
      base: hsl(b[0], b[1], b[2] * n),
      hi: hsl(lerp(b[0], lh, 0.55), b[1] + 12, Math.min(72, b[2] + 24), 0.5 * R.Lt.key),
      rim: hsl(lh, ls, Math.min(86, ll + 6), R.Lt.sz < 0 ? 0.6 : 0.2),
      shade: 'rgba(12,7,4,0.42)',
      twig: hsl(b[0] + 3, b[1] + 5, (b[2] + 3) * n),
    };
  }

  // ---------------------------------------------------------- wind pose
  function pose(R, t) {
    const S = R.S, ts = t / 1000, w = R.wind;
    const g = 0.62 + 0.38 * Math.sin(ts * 0.53) * Math.sin(ts * 0.29 + 1.3);
    const wave = (x) => ts * 1.15 - x * 0.006;          // gusts roll across the crown
    const LA = [], BA = [], TA = [], TR = [], la = [], ba = [];
    S.limbs.forEach((l, i) => {
      const a = w * g * 0.011 * Math.sin(wave(l.pts[l.pts.length - 1].x) + l.ph) / Math.sqrt(1 + l.pts[0].r * 0.25);
      LA[i] = affRot(IDENT, l.pts[0], a); la[i] = a;
    });
    S.branches.forEach((b) => {
      const a = w * g * 0.022 * Math.sin(wave(b.pts[b.pts.length - 1].x) * 1.4 + b.ph);
      BA[b.bi] = affRot(LA[b.li], b.pts[0], a); ba[b.bi] = la[b.li] + a;
    });
    S.twigs.forEach((tw) => {
      const a = w * g * 0.036 * Math.sin(wave(tw.tip.x) * 1.9 + tw.ph);
      TA[tw.ti] = affRot(BA[tw.bi], tw.pts[0], a); TR[tw.ti] = ba[tw.bi] + a;
    });
    return { LA, BA, TA, TR, ts, g };
  }

  function drawFrame(ctx, R, t) {
    t = t || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(R.bg, 0, 0);
    const P = pose(R, t);
    drawLeaves(ctx, R, P, R.backLeaves);
    worldT(ctx, R); drawWood(ctx, R, P, -1);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(R.trunkLayer, 0, 0);
    worldT(ctx, R); drawWood(ctx, R, P, 1);
    drawLeaves(ctx, R, P, R.frontLeaves);
    worldT(ctx, R); drawOrnaments(ctx, R, P);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(R.fg, 0, 0);
    post(ctx, R, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // CSS equivalents of the film post, for a GPU-composited live view
  function postStyle(R) {
    const g = R.Lt.grade;
    return {
      grade: hsl(g[0], g[1], g[2]), gradeAlpha: Math.min(1, g[3] * 1.7),
      lift: R.night ? 'rgb(14,16,30)' : 'rgb(27,21,22)',
      vignette: R.night ? 'rgba(20,24,50,0.9)' : 'rgba(80,52,40,0.85)',
      bloom: 0.14 + 0.1 * R.Lt.key,
    };
  }

  function render(ctx, S, W, Hc, opts) {
    const R = prepareRender(S, W, Hc, opts);
    drawFrame(ctx, R, (opts && opts.time) || 0);
    return R.v;
  }

  // ------------------------------------------------------------- wood
  function outline(pts) {
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const d = norm({ x: b.x - a.x, y: b.y - a.y });
      const r = pts[i].r;
      L.push([pts[i].x - d.y * r, pts[i].y + d.x * r]); Rr.push([pts[i].x + d.y * r, pts[i].y - d.x * r]);
    }
    return [L, Rr];
  }
  function taperFill(ctx, pts, fill) {
    if (pts.length < 2) return;
    const [L, Rr] = outline(pts);
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    const e = pts[pts.length - 1];
    ctx.arc(e.x, e.y, e.r, 0, TAU);
    for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  // cylindrical shading: a warm highlight toward the sun, a shadow away from it
  function taperShaded(ctx, pts, B, R) {
    taperFill(ctx, pts, B.base);
    if (pts[0].r * R.v.z < 0.9) return;
    const sd = R.sunDir, half = Math.ceil(pts.length / 2);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [pts.slice(0, half + 1), pts.slice(half)].forEach((seg) => {
      if (seg.length < 2) return;
      const a = seg[0], b = seg[seg.length - 1];
      const d = norm({ x: b.x - a.x, y: b.y - a.y });
      let n = { x: -d.y, y: d.x };
      if (n.x * sd.x + n.y * sd.y < 0) n = { x: -n.x, y: -n.y };
      const r = Math.min(...seg.map((p) => p.r));
      const line = (off, width, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.15, width);
        ctx.beginPath();
        seg.forEach((p, i) => { const x = p.x + n.x * p.r * off, y = p.y + n.y * p.r * off; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      };
      line(-0.5, r * 0.75, B.shade);
      line(0.42, r * 0.5, B.hi);
      if (R.Lt.sz < 0) line(0.82, r * 0.2, B.rim);
    });
  }
  function collar(ctx, p0, p1, B) {
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(ang);
    ctx.fillStyle = B.base; ctx.beginPath(); ctx.ellipse(p0.r * 0.2, 0, p0.r * 1.45, p0.r * 1.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(15,8,4,0.28)'; ctx.lineWidth = p0.r * 0.18;
    ctx.beginPath(); ctx.ellipse(p0.r * 0.15, 0, p0.r * 1.3, p0.r * 1.05, 0, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    ctx.restore();
  }
  function drawWood(ctx, R, P, zs) {
    const S = R.S, B = R.bark;
    S.limbs.forEach((l, i) => {
      if (l.z !== zs) return;
      const pts = xf(P.LA[i], l.pts);
      if (zs > 0) collar(ctx, pts[0], pts[1], B);
      taperShaded(ctx, pts, B, R);
    });
    S.branches.forEach((b) => { if (S.limbs[b.li].z === zs) taperShaded(ctx, xf(P.BA[b.bi], b.pts), B, R); });
    if (S.winter) {     // a line of snow along the upper side of the wood
      ctx.strokeStyle = 'rgba(248,250,255,0.9)'; ctx.lineCap = 'round';
      const snowy = (pts) => {
        ctx.lineWidth = Math.max(0.4, pts[0].r * 0.55);
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - p.r * 0.85) : ctx.moveTo(p.x, p.y - p.r * 0.85))); ctx.stroke();
      };
      S.limbs.forEach((l, i) => { if (l.z === zs) snowy(xf(P.LA[i], l.pts).slice(0, -3)); });
      S.branches.forEach((b) => { if (S.limbs[b.li].z === zs) snowy(xf(P.BA[b.bi], b.pts).slice(0, -2)); });
    }
    S.twigs.forEach((t) => {
      if (S.limbs[t.li].z !== zs) return;
      const A = P.TA[t.ti];
      taperFill(ctx, xf(A, t.pts), B.twig);
      t.forks.forEach((f) => taperFill(ctx, xf(A, f), B.twig));
      t.fine.forEach((f) => taperFill(ctx, xf(A, f), B.twig));
    });
  }

  function drawLeaves(ctx, R, P, list) {
    const z = R.v.z * R.dpr, ox = R.v.cx * R.dpr, oy = R.v.gy * R.dpr;
    const fl = 0.11 * R.wind * P.g, ts = P.ts;
    for (let i = 0; i < list.length; i++) {
      const L = list[i];
      const A = L.ti >= 0 ? P.TA[L.ti] : IDENT;
      const px = A[0] * L.x + A[2] * L.y + A[4], py = A[1] * L.x + A[3] * L.y + A[5];
      const ang = L.ang + (L.ti >= 0 ? P.TR[L.ti] : 0) + fl * Math.sin(ts * 4.3 + L.flut);
      const sc = L.size * z, c = Math.cos(ang) * sc, s = Math.sin(ang) * sc, f = L.fore;
      ctx.setTransform(c, s, -s * f, c * f, ox + px * z, oy + py * z);
      ctx.fillStyle = L.c1; ctx.fill(SPRAY[L.shape]);
      if (sc > 6 && (!L.back || L.lit > 0.55)) { ctx.fillStyle = L.c2; ctx.fill(SPRAY_HI[L.shape]); }
    }
  }

  function drawOrnaments(ctx, R, P) {
    const S = R.S, ts = P.ts;
    S.blossoms.forEach((b) => { const p = apply(P.TA[b.ti], b); blossom(ctx, Object.assign({}, b, p)); });
    S.fruits.forEach((f) => {
      const p = apply(P.TA[f.ti], f);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(0.08 * R.wind * P.g * Math.sin(ts * 1.5 + f.ph) + (f.shrivel || 0) * 0.1);
      fruit(ctx, Object.assign({}, f, { x: 0, y: 0 }));
      ctx.restore();
    });
    if (S.nest) {
      const p = apply(P.LA[S.nest.li], S.nest);
      nest(ctx, Object.assign({}, S.nest, p, { bob: Math.sin(ts * 2.1) * 0.25 }));
    }
    if (S.swing) swing(ctx, R, P);
  }

  function swing(ctx, R, P) {
    const sw = R.S.swing, ts = P.ts;
    const top = apply(P.LA[sw.li], sw);
    const a = 0.05 * R.wind * Math.sin(ts * 0.85) + 0.012 * Math.sin(ts * 2.3);
    const dx = Math.sin(a) * sw.len, dy = Math.cos(a) * sw.len;
    const seat = { x: top.x + dx, y: top.y + dy };
    const hw = sw.w / 2;
    ctx.lineCap = 'round';
    // ropes, with a hint of twist
    [-1, 1].forEach((s) => {
      ctx.strokeStyle = 'rgba(60,40,22,0.6)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(top.x + s * hw * 0.9, top.y + 0.6); ctx.lineTo(seat.x + s * hw, seat.y); ctx.stroke();
      ctx.strokeStyle = '#e2cfa4'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(top.x + s * hw * 0.9, top.y + 0.4); ctx.lineTo(seat.x + s * hw, seat.y - 0.2); ctx.stroke();
      ctx.strokeStyle = '#a88d62'; ctx.lineWidth = 0.9;   // knot around the limb
      ctx.beginPath(); ctx.ellipse(top.x + s * hw * 0.9, top.y, 1.6, 2.2, 0, 0, TAU); ctx.stroke();
    });
    ctx.save(); ctx.translate(seat.x, seat.y); ctx.rotate(-a * 0.6);
    const g = ctx.createLinearGradient(0, -1.4, 0, 1.6);
    g.addColorStop(0, '#b98a57'); g.addColorStop(1, '#6e4a2a');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-hw - 1.2, 1.3, sw.w + 2.4, 1.2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.rect(-hw - 1.5, -1.6, sw.w + 3, 3.2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,15,0.5)'; ctx.lineWidth = 0.2;
    ctx.beginPath(); ctx.moveTo(-hw, -0.2); ctx.bezierCurveTo(-hw / 2, -0.6, hw / 2, 0.3, hw, -0.1); ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------- post
  function makeVignette(R) {
    const c = mkCanvas(R.cw, R.ch), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, R.cw, R.ch);
    const g = x.createRadialGradient(R.cw / 2, R.ch * 0.42, Math.min(R.cw, R.ch) * 0.32, R.cw / 2, R.ch * 0.5, Math.hypot(R.cw, R.ch) * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, R.night ? 'rgba(20,24,50,0.9)' : 'rgba(80,52,40,0.85)');
    x.fillStyle = g; x.fillRect(0, 0, R.cw, R.ch);
    return c;
  }
  function rays(ctx, R, t) {
    const sx = R.sun.x * R.dpr, sy = R.sun.y * R.dpr, len = Math.hypot(R.cw, R.ch) * 1.1;
    const cx = (R.v.cx + R.crown.x * R.v.z) * R.dpr, cy = (R.v.gy + R.crown.y * R.v.z) * R.dpr;
    const base = Math.atan2(cy - sy, cx - sx), rr = rng(R.seed + ':rays');
    const [h, s, l] = R.Lt.col;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, R.cw, R.v.gy * R.dpr); ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 8; i++) {
      const ang = base + (rr() - 0.5) * 1.1, w = 0.03 + rr() * 0.06;
      const a = (0.03 + rr() * 0.05) * R.Lt.rays * (0.7 + 0.3 * Math.sin(t / 1900 + i * 1.7));
      const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      g.addColorStop(0, hsl(h, s, l, 0)); g.addColorStop(0.08, hsl(h, s, l, a)); g.addColorStop(0.7, hsl(h, s, l, a * 0.35)); g.addColorStop(1, hsl(h, s, l, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang - w) * len, sy + Math.sin(ang - w) * len);
      ctx.lineTo(sx + Math.cos(ang + w) * len, sy + Math.sin(ang + w) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function post(ctx, R, t) {
    if (R.lite || R.treeOnly) return;
    const { cw, ch, Lt, S } = R;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (Lt.rays > 0 && !S.winter) rays(ctx, R, t);
    if (!R.post) return;        // the live viewer composites the film look with CSS layers instead
    // bloom: a soft, downsampled copy screened back on top
    const b = R.bloom, bc = b.getContext('2d');
    bc.globalCompositeOperation = 'copy'; bc.drawImage(ctx.canvas, 0, 0, b.width, b.height);
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.14 + 0.1 * Lt.key;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b, 0, 0, cw, ch);
    // warm colour grade, faded film blacks, vignette, grain
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Lt.grade[3] * 1.7;
    ctx.fillStyle = hsl(Lt.grade[0], Lt.grade[1], Lt.grade[2]); ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighten'; ctx.globalAlpha = 1;
    ctx.fillStyle = R.night ? 'rgb(14,16,30)' : 'rgb(27,21,22)'; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(R.vig, 0, 0);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.11;
    const pat = ctx.createPattern(noise(), 'repeat');
    const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
    ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(ox, oy, cw, ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // --------------------------------------------------------- background
  function drawBackground(c, R) {
    if (R.treeOnly) { canopyShade(c, R); return; }   // just the tree, on a transparent ground
    const rs = rng(R.seed + ':sky');
    screenT(c, R);
    sky(c, R, rs);
    clouds(c, R, rs);
    if (!R.night) farBirds(c, R, rs);
    hills(c, R, rs);
    meadow(c, R, rs);
    soil(c, R, rng(R.seed + ':soil'));
    roots(c, R);
    grass(c, R, false);
    canopyShade(c, R);
  }

  // soft shade inside the crown, so leaf clusters read as volumes
  function canopyShade(c, R) {
    const S = R.S;
    worldT(c, R);
    S.twigs.forEach((t) => {
      if (!t.nLeaves) return;
      const tip = t.tip, x = (t.pts[1].x + tip.x) / 2, y = (t.pts[1].y + tip.y) / 2;
      // deeper inside the crown = darker; at the rim the shade fades out so it never haloes the sky
      const C = R.crown, d = Math.min(1, Math.hypot((x - C.x) / C.rx, (y - C.y) / C.ry));
      const rad = (5 + Math.sqrt(t.nLeaves) * 2.8) * S.OS * (1 - 0.35 * d);
      const a = 0.4 * (1 - smooth(0.45, 0.95, d));
      if (a < 0.02) return;
      const l = Math.max(5, t.l * (R.night ? 0.25 : 0.42));
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, hsl(t.h + 8, t.s * 0.7, l, a)); g.addColorStop(0.5, hsl(t.h + 8, t.s * 0.7, l, a * 0.45)); g.addColorStop(1, hsl(t.h, t.s * 0.7, l, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
    });
  }

  function sky(c, R, rs) {
    const { W, v, S, Lt } = R, gy = v.gy, winter = S.winter;
    const g = c.createLinearGradient(0, 0, 0, R.horizon + 4);
    (SKIES[R.period] || SKIES.morning).forEach(([o, h, s, l]) => g.addColorStop(o, hsl(h, s * (winter ? 0.42 : 1), winter ? lerp(l, 80, 0.25) : l)));
    c.fillStyle = g; c.fillRect(0, 0, W, gy + 2);
    if (R.night) {
      for (let i = 0; i < 220; i++) {
        const a = 0.2 + rs() * 0.7, big = rs() < 0.07;
        c.fillStyle = `rgba(255,250,235,${a})`; c.beginPath(); c.arc(rs() * W, rs() * R.horizon * 0.85, big ? 1.3 : 0.7, 0, TAU); c.fill();
      }
    }
    const { x: sx, y: sy } = R.sun, [h, s, l] = Lt.col, k = winter ? 0.5 : 1;
    let gg = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, gy) * 0.85);
    gg.addColorStop(0, hsl(h, s, Math.min(94, l + 14), (R.night ? 0.22 : 0.6) * k));
    gg.addColorStop(0.22, hsl(h, s, l, (R.night ? 0.07 : 0.22) * k));
    gg.addColorStop(1, hsl(h, s, l, 0));
    c.fillStyle = gg; c.fillRect(0, 0, W, gy);
    if (R.night) {
      gg = c.createRadialGradient(sx, sy, 10, sx, sy, 60);
      gg.addColorStop(0, 'rgba(230,235,255,0.25)'); gg.addColorStop(1, 'rgba(230,235,255,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(sx, sy, 60, 0, TAU); c.fill();
      c.fillStyle = '#f3efdc'; c.beginPath(); c.arc(sx, sy, 15, 0, TAU); c.fill();
      c.fillStyle = 'rgba(180,175,160,0.35)';
      [[-4, -3, 3], [3, 4, 2.2], [5, -5, 1.6]].forEach(([dx, dy, r]) => { c.beginPath(); c.arc(sx + dx, sy + dy, r, 0, TAU); c.fill(); });
    } else {
      gg = c.createRadialGradient(sx, sy, 0, sx, sy, 30);
      gg.addColorStop(0, 'rgba(255,253,244,1)'); gg.addColorStop(0.5, hsl(h, 100, 90, 0.95 * k)); gg.addColorStop(1, hsl(h, 100, 82, 0));
      c.fillStyle = gg; c.beginPath(); c.arc(sx, sy, 30, 0, TAU); c.fill();
    }
  }

  function clouds(c, R, rs) {
    const { W, Lt, S } = R;
    const n = 3 + ((rs() * 3) | 0);
    const warm = R.period === 'evening' || R.period === 'dawn';
    const lit = R.night ? [225, 20, 55] : S.winter ? [210, 8, 95] : [Lt.col[0], 85, 96];
    const shade = R.night ? [230, 25, 22] : S.winter ? [212, 8, 78] : warm ? [14, 38, 74] : [214, 26, 84];
    for (let i = 0; i < n; i++) {
      const cx = rs() * W, cy = 30 + rs() * R.horizon * 0.42, w = 110 + rs() * 230, h = w * (0.2 + rs() * 0.12);
      const base = cy + h * 0.28, alpha = (R.night ? 0.28 : 0.62) * (0.7 + rs() * 0.3);
      const puffs = 11 + ((rs() * 8) | 0);
      for (let k = 0; k < puffs; k++) {
        const dx = (rs() - 0.5) * 1.8, bump = Math.max(0, 1 - dx * dx);
        const px = cx + dx * w * 0.5, py = cy - bump * h * (0.25 + rs() * 0.55);
        const pr = Math.max(4, Math.min(h * (0.3 + bump * 0.45) * (0.7 + rs() * 0.5), base - py + h * 0.08));
        const lx = px + R.sunDir.x * pr * 0.4, ly = py - pr * 0.45;
        const g = c.createRadialGradient(lx, ly, pr * 0.05, px, py, pr);
        g.addColorStop(0, hsl(...lit, alpha)); g.addColorStop(0.55, hsl(...mixHSL(lit, shade, 0.6), alpha * 0.8)); g.addColorStop(1, hsl(...shade, 0));
        c.fillStyle = g; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
      }
    }
  }

  function farBirds(c, R, rs) {
    if (rs() < 0.35) return;
    const n = 2 + ((rs() * 4) | 0), x0 = R.W * (0.15 + rs() * 0.7), y0 = R.horizon * (0.2 + rs() * 0.3);
    c.strokeStyle = R.S.winter ? 'rgba(60,60,70,0.5)' : 'rgba(50,40,50,0.45)'; c.lineWidth = 1; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (9 + rs() * 8), y = y0 + (i % 2) * 5 + rs() * 4, s = 2.6 + rs() * 1.6;
      c.beginPath(); c.moveTo(x - s, y - s * 0.4); c.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y); c.quadraticCurveTo(x + s * 0.4, y - s * 0.7, x + s, y - s * 0.4); c.stroke();
    }
  }

  function seasonGround(R) {
    const S = R.S;
    let g = interpStops(SEASON_STOPS, clamp(S.season * 0.8 + 0.12));
    g = mixHSL(g, [44, 40, 58], (1 - S.moisture) * 0.45);     // dry grass turns to straw
    if (S.winter) g = [90, 8, 78];
    return g;
  }

  function hills(c, R, rs) {
    const { W, S } = R, hy = R.horizon;
    const skyL = (SKIES[R.period] || SKIES.morning).slice(-1)[0].slice(1);
    const haze = S.winter ? [210, 10, 80] : R.night ? [230, 30, 18] : [skyL[0], skyL[1] * 0.45, skyL[2] * 0.82];
    const g = seasonGround(R);
    for (let layer = 0; layer < 3; layer++) {
      const hz = [0.72, 0.5, 0.28][layer];
      const col = mixHSL([g[0] + 14, g[1] * 0.55, g[2] * 0.72], haze, hz);
      if (R.night) col[2] *= 0.6;
      const base = hy - [44, 26, 10][layer], amp = [24, 16, 9][layer];
      const ph = rs() * 10, ph2 = rs() * 10;
      const ridge = (x) => base - amp * (0.55 + 0.45 * Math.sin(x / W * 4.2 + ph)) * (0.75 + 0.25 * Math.sin(x / W * 11 + ph2));
      c.fillStyle = hsl(...col);
      c.beginPath(); c.moveTo(0, hy + 2);
      for (let x = 0; x <= W + 8; x += 6) c.lineTo(x, ridge(x));
      c.lineTo(W, hy + 2); c.closePath(); c.fill();
      if (layer >= 1) {      // a soft treeline along the ridge
        const tc = mixHSL(col, [col[0] + 8, col[1] + 6, col[2] * 0.82], 0.7);
        c.fillStyle = hsl(...tc);
        const sc = layer === 1 ? 0.6 : 1;
        for (let x = rs() * 30; x < W; ) {
          if (rs() < 0.35) { x += 30 + rs() * 90; continue; }          // open fields between copses
          const len = 12 + rs() * 60;
          for (let xx = x; xx < x + len; xx += 2 + rs() * 4) {
            const y = ridge(xx), r = (3 + rs() * 6) * sc;
            if (rs() < 0.12) { c.beginPath(); c.ellipse(xx, y - r * 1.6, r * 0.45, r * 1.8, 0, 0, TAU); c.fill(); }   // a poplar
            else { c.beginPath(); c.arc(xx, y - r * 0.5, r, 0, TAU); c.fill(); }
          }
          x += len + 10 + rs() * 50;
        }
      }
    }
    const hg = c.createLinearGradient(0, hy - 70, 0, hy + 2);
    hg.addColorStop(0, hsl(...haze, 0)); hg.addColorStop(1, hsl(...haze, R.night ? 0.2 : 0.38));
    c.fillStyle = hg; c.fillRect(0, hy - 70, W, 72);
  }

  function meadow(c, R, rs) {
    const { W, v, S, Lt } = R, hy = R.horizon, gy = v.gy;
    const g = seasonGround(R);
    const n = R.night ? 0.45 : 1;
    const grd = c.createLinearGradient(0, hy, 0, gy);
    grd.addColorStop(0, hsl(g[0] + 8, g[1] * 0.55, Math.min(70, g[2] * 1.05) * n));
    grd.addColorStop(1, hsl(g[0], g[1] * 0.85, g[2] * 0.8 * n));
    c.fillStyle = grd; c.fillRect(0, hy, W, gy - hy + 1);
    // the tree's long shadow across the meadow, away from the sun
    const crownW = Math.max(30, (S.bbox.x1 - S.bbox.x0) * v.z);
    const shx = v.cx + (R.crown.x - R.sunDir.x * (gy - hy) * 2.2) * v.z * 0.6, shy = gy - (gy - hy) * 0.32;
    c.save(); c.translate(shx, shy); c.scale(1, Math.max(0.05, (gy - hy) * 0.55 / crownW));
    const sg = c.createRadialGradient(0, 0, 0, 0, 0, crownW * 0.62);
    sg.addColorStop(0, `rgba(20,30,12,${0.32 * Lt.key})`); sg.addColorStop(0.7, `rgba(20,30,12,${0.18 * Lt.key})`); sg.addColorStop(1, 'rgba(20,30,12,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(0, 0, crownW * 0.62, 0, TAU); c.fill(); c.restore();
    // fine grass texture with perspective
    for (let i = 0; i < 900; i++) {
      const t = rs(), y = hy + (gy - hy) * t * t, x = rs() * W, h = 0.8 + t * 3.2;
      c.strokeStyle = hsl(g[0] + (rs() - 0.5) * 18, g[1] * 0.8, g[2] * (0.75 + rs() * 0.4) * n, 0.55);
      c.lineWidth = 0.5 + t * 0.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rs() - 0.5) * 1.5, y - h); c.stroke();
    }
    if (!S.winter && S.season > 0.4) for (let i = 0; i < 70; i++) {   // distant flower specks
      const t = rs(); c.fillStyle = ['rgba(255,250,240,0.8)', 'rgba(250,210,80,0.8)', 'rgba(230,140,180,0.7)'][(rs() * 3) | 0];
      c.beginPath(); c.arc(rs() * W, hy + (gy - hy) * t * t, 0.6 + t, 0, TAU); c.fill();
    }
  }

  function soil(c, R, rs) {
    const { W, H, v, S } = R, gy = v.gy, m = S.moisture;
    const top = mixHSL([32, 30, 50], [24, 44, 19], m);
    const g = c.createLinearGradient(0, gy, 0, H);
    g.addColorStop(0, hsl(...top)); g.addColorStop(0.12, hsl(top[0] - 2, top[1] * 0.9, top[2] * 0.82));
    g.addColorStop(0.4, hsl(22, 34, 15)); g.addColorStop(1, hsl(18, 30, 7));
    c.fillStyle = g; c.fillRect(0, gy, W, H - gy);
    for (let i = 0; i < 1400; i++) {      // humus grain
      const y = gy + rs() * (H - gy), d = (y - gy) / (H - gy);
      c.fillStyle = rs() < 0.5 ? `rgba(0,0,0,${0.12 + rs() * 0.2})` : `rgba(255,220,170,${(0.05 + rs() * 0.08) * (1 - d)})`;
      c.fillRect(rs() * W, y, 0.6 + rs() * 1.2, 0.6 + rs() * 1);
    }
    for (let i = 0; i < 4; i++) {        // strata
      const yy = gy + (H - gy) * (0.18 + i * 0.21), ph = rs() * 9;
      c.strokeStyle = `rgba(0,0,0,${0.14 + i * 0.03})`; c.lineWidth = 1 + rs();
      c.beginPath(); for (let x = 0; x <= W; x += 8) c.lineTo(x, yy + Math.sin(x / 55 + ph) * 3 + Math.sin(x / 13 + ph) * 1); c.stroke();
    }
    for (let i = 0; i < 26; i++) {       // stones with light from above
      const px = rs() * W, py = gy + 14 + rs() * (H - gy - 18), pr = 2 + rs() * 6, ro = rs() * 3;
      c.fillStyle = `hsl(${25 + rs() * 25} ${6 + rs() * 10}% ${22 + rs() * 16}%)`;
      c.beginPath(); c.ellipse(px, py, pr * 1.35, pr, ro, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,240,220,0.16)'; c.beginPath(); c.ellipse(px - pr * 0.3, py - pr * 0.35, pr * 0.7, pr * 0.4, ro, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(px + pr * 0.2, py + pr * 0.55, pr * 1.1, pr * 0.35, ro, 0, TAU); c.fill();
    }
    // mycelium: pale threads — the hours you've spent on your feet
    const threads = Math.min(90, Math.round(S.hours / 2.5));
    c.lineWidth = 0.6;
    for (let i = 0; i < threads; i++) {
      const x0 = v.cx + (rs() - 0.5) * W * 0.8, y0 = gy + 10 + rs() * (H - gy) * 0.6;
      c.strokeStyle = `rgba(245,238,220,${0.08 + rs() * 0.14})`;
      c.beginPath(); c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + (rs() - 0.5) * 60, y0 + (rs() - 0.5) * 30, x0 + (rs() - 0.5) * 80, y0 + (rs() - 0.5) * 30, x0 + (rs() - 0.5) * 100, y0 + (rs() - 0.5) * 25);
      c.stroke();
    }
    if (m > 0.55) {      // moist soil has worms and droplets
      const wx = v.cx + (rs() < 0.5 ? -1 : 1) * (60 + rs() * W * 0.3), wy = gy + 24 + rs() * 30;
      c.strokeStyle = 'rgba(200,120,120,0.85)'; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(wx, wy); c.bezierCurveTo(wx + 6, wy - 5, wx + 10, wy + 5, wx + 16, wy + 1); c.bezierCurveTo(wx + 20, wy - 2, wx + 23, wy + 3, wx + 26, wy + 1); c.stroke();
      c.strokeStyle = 'rgba(255,200,200,0.4)'; c.lineWidth = 0.6; c.stroke();
      for (let i = 0; i < Math.round(28 * m); i++) {
        const dx = rs() * W, dy = gy + 4 + rs() * 22;
        c.fillStyle = 'rgba(190,215,235,0.35)'; c.beginPath(); c.arc(dx, dy, 0.9 + rs(), 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(dx - 0.4, dy - 0.6, 0.6, 0.6);
      }
    }
    if (m < 0.42) {      // dry: the topsoil cracks
      c.strokeStyle = `rgba(30,18,10,${0.5 * (1 - m)})`; c.lineWidth = 1;
      for (let i = 0; i < Math.round(30 * (1 - m)); i++) {
        let x = rs() * W, y = gy + 1; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rs() - 0.5) * 6; y += 3 + rs() * 5; c.lineTo(x, y); }
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(40,30,20,0.35)'; c.lineWidth = 0.6;      // grass roots under the turf
    for (let x = 0; x < W; x += 2 + rs() * 3) { c.beginPath(); c.moveTo(x, gy + 2); c.lineTo(x + (rs() - 0.5) * 2, gy + 4 + rs() * 7); c.stroke(); }
    const lip = c.createLinearGradient(0, gy - 1, 0, gy + 6);
    lip.addColorStop(0, 'rgba(0,0,0,0.45)'); lip.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lip; c.fillRect(0, gy - 1, W, 7);
  }

  function roots(c, R) {
    const { S, v, dpr, W } = R, gy = v.gy, z = v.z;
    const rootBottom = (R.opts.rootBottom || R.H);
    const maxDepth = Math.max(1, ...S.roots.map((r) => Math.max(...r.pts.map((p) => p.y))));
    const rootFit = Math.min(1, (rootBottom - gy - 22) / (maxDepth * z));
    S.rootFit = rootFit;
    worldT(c, R); c.scale(1, rootFit);
    const base = R.bark.hsl;
    const rc = (k) => hsl(base[0] + 4, base[1] + 8, base[2] * k * (R.night ? 0.6 : 1));
    S.roots.forEach((rt) => {
      rt.subs.forEach((sp) => taperFill(c, sp, rc(1.25)));
      const col = rc(rt.strongest ? 2.2 : 1.6);
      taperFill(c, rt.pts, col);
      c.lineCap = 'round';
      for (let i = 1; i < rt.pts.length; i++) {
        const p = rt.pts[i - 1], q = rt.pts[i];
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = Math.max(0.2, q.r * 0.55);
        c.beginPath(); c.moveTo(p.x, p.y + p.r * 0.45); c.lineTo(q.x, q.y + q.r * 0.45); c.stroke();
        c.strokeStyle = rt.strongest ? 'rgba(255,225,170,0.4)' : 'rgba(255,225,190,0.22)'; c.lineWidth = Math.max(0.15, q.r * 0.3);
        c.beginPath(); c.moveTo(p.x, p.y - p.r * 0.5); c.lineTo(q.x, q.y - q.r * 0.5); c.stroke();
      }
      const tip = rt.pts[rt.pts.length - 1];
      c.strokeStyle = 'rgba(230,205,170,0.35)'; c.lineWidth = 0.3;
      for (let k = 0; k < 7; k++) { const a = 0.3 + k * 0.4; c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(tip.x + Math.cos(a) * 5, tip.y + Math.sin(a) * 5); c.stroke(); }
    });
    // weekday labels in a row under the roots
    screenT(c, R);
    c.font = `600 ${Math.round(clamp(W / 52, 10, 15))}px ui-sans-serif, system-ui, sans-serif`; c.textAlign = 'center';
    const tips = S.roots.map((rt) => { const t = rt.pts[rt.pts.length - 1]; return [v.cx + t.x * z, gy + t.y * rootFit * z]; });
    const span = clamp(W * 0.84, 240, 760);
    const ly = clamp(Math.max(...tips.map((t) => t[1])) + 18, gy + 30, rootBottom - 8);
    S.roots.forEach((rt, i) => {
      const lx = clamp(v.cx + (i - 3) / 3 * span / 2, 22, W - 22);
      const [sx, sy] = tips[i];
      c.strokeStyle = rt.strongest ? 'rgba(255,214,150,0.45)' : 'rgba(240,220,200,0.16)';
      c.setLineDash([2, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx, sy + 3); c.lineTo(lx, ly - 12); c.stroke(); c.setLineDash([]);
      c.fillStyle = rt.strongest ? 'rgba(255,214,150,0.98)' : 'rgba(240,220,200,0.62)';
      c.fillText(rt.day + (rt.runs ? ` · ${rt.runs}` : ''), lx, ly);
    });
  }

  function grass(c, R, front) {
    const { W, v, S } = R, gy = v.gy;
    const rs = rng(R.seed + (front ? ':grassF' : ':grassB'));
    const g = seasonGround(R), n = R.night ? 0.5 : 1;
    const blades = (front ? 260 : 340) + Math.min(700, S.runsN * 3);
    const tall = Math.min(1.7, 0.75 + v.z * 0.32);
    screenT(c, R); c.lineCap = 'round';
    for (let i = 0; i < blades; i++) {
      const x = rs() * W, h = (front ? 6 + rs() * 15 : 4 + rs() * 9) * tall, lean = (rs() - 0.5) * 7;
      const lit = rs();
      c.strokeStyle = S.winter ? hsl(40 + rs() * 12, 12 + rs() * 14, (46 + lit * 24) * n)
        : hsl(g[0] + (rs() - 0.5) * 18, g[1] * (0.8 + lit * 0.3), (g[2] * (0.7 + lit * 0.5) + (front ? 2 : -6)) * n);
      c.lineWidth = (front ? 1.1 : 0.8) + rs() * 1;
      c.beginPath(); c.moveTo(x, gy + 2); c.quadraticCurveTo(x + lean * 0.25, gy - h * 0.6, x + lean, gy - h); c.stroke();
      if (S.winter && rs() < 0.35) {      // hoarfrost on the tips
        c.strokeStyle = 'rgba(240,246,252,0.85)'; c.lineWidth *= 0.8;
        c.beginPath(); c.moveTo(x + lean * 0.7, gy - h * 0.75); c.lineTo(x + lean, gy - h); c.stroke();
      }
    }
    if (front && !S.winter) {     // seed heads catching the light
      for (let i = 0; i < 26; i++) {
        const x = rs() * W, h = (16 + rs() * 16) * tall, lean = (rs() - 0.5) * 10;
        c.strokeStyle = hsl(g[0] + 10, g[1] * 0.5, g[2] * 1.05 * n, 0.8); c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(x, gy + 2); c.quadraticCurveTo(x + lean * 0.2, gy - h * 0.6, x + lean, gy - h); c.stroke();
        c.fillStyle = hsl(42, 45, 70 * n, 0.85);
        c.beginPath(); c.ellipse(x + lean, gy - h - 2.5, 1.3, 3.2, lean * 0.04, 0, TAU); c.fill();
      }
    }
  }

  // ------------------------------------------------------------ trunk
  function drawTrunk(c, R) {
    const S = R.S, B = R.bark, pts = S.trunk, rb = rng(R.seed + ':bark');
    if (!pts.length) return;
    const R0 = pts[0].r;
    // surface root flares, buried at the tips
    const nfl = S.runsN ? 3 + (S.wood > 25 ? 2 : 0) : 0;
    for (let i = 0; i < nfl; i++) {
      const sd = i % 2 ? 1 : -1, sp = 0.5 + rb() * 0.9;
      const fp = [{ x: sd * R0 * 0.35, y: -R0 * 0.9, r: R0 * 0.42 }, { x: sd * R0 * (0.9 + sp * 0.4), y: -R0 * 0.15, r: R0 * 0.3 },
        { x: sd * R0 * (1.4 + sp), y: 2.5, r: R0 * 0.14 }, { x: sd * R0 * (1.7 + sp * 1.2), y: 6, r: 0.3 }];
      taperFill(c, fp, B.base);
    }
    const [L, Rr] = outline(pts);
    const path = new Path2D();
    path.moveTo(L[0][0], L[0][1] + 3);
    L.forEach((p) => path.lineTo(p[0], p[1]));
    const tp = pts[pts.length - 1];
    path.arc(tp.x, tp.y, tp.r, 0, TAU);
    for (let i = Rr.length - 1; i >= 0; i--) path.lineTo(Rr[i][0], Rr[i][1]);
    path.lineTo(Rr[0][0], Rr[0][1] + 3);
    path.closePath();
    c.fillStyle = B.base; c.fill(path);
    c.save(); c.clip(path);
    // cylinder shading toward the sun, darker where it meets the ground
    const ss = R.sunSide;
    const sh = c.createLinearGradient(-ss * R0 * 1.4, 0, ss * R0 * 1.4, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(0.45, 'rgba(0,0,0,0.08)');
    sh.addColorStop(0.78, hsl(R.Lt.col[0], 60, 70, 0.22 * R.Lt.key)); sh.addColorStop(1, hsl(R.Lt.col[0], 80, 75, 0.1));
    c.fillStyle = sh; c.fillRect(-R0 * 6, -S.H - 20, R0 * 12, S.H + 30);
    const vg = c.createLinearGradient(0, 0, 0, -S.H * 0.35);
    vg.addColorStop(0, 'rgba(10,6,2,0.45)'); vg.addColorStop(1, 'rgba(10,6,2,0)');
    c.fillStyle = vg; c.fillRect(-R0 * 6, -S.H * 0.35, R0 * 12, S.H * 0.35 + 6);
    // bark: young bark is smooth with lenticels, old bark is furrowed into plates
    const age = clamp(S.wood / 50);
    if (age < 0.35) {
      c.fillStyle = 'rgba(230,210,180,0.28)';
      for (let i = 0; i < 40 + S.wood * 8; i++) {
        const u = rb(), p = S.trunkPt(u * 0.95), w = (rb() * 2 - 1) * p.r * 0.85;
        c.fillRect(p.x + w - p.r * 0.12, p.y, p.r * 0.24, Math.max(0.25, p.r * 0.04));
      }
    }
    const nf = Math.min(30, 2 + Math.floor(S.wood / 3));
    for (let k = 0; k < nf; k++) {
      const off = ((k + 0.5) / nf) * 2 - 1;
      const wdt = (0.35 + rb() * 0.9) * Math.min(1.3, R0 / 14);
      let seg = [];
      const flush = () => {
        if (seg.length < 2) { seg = []; return; }
        c.strokeStyle = `rgba(18,10,5,${0.25 + rb() * 0.3})`; c.lineWidth = wdt;
        c.beginPath(); seg.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
        c.strokeStyle = hsl(R.Lt.col[0], 30, 62, 0.16 * R.Lt.key); c.lineWidth = wdt * 0.6;
        c.beginPath(); seg.forEach(([x, y], i) => (i ? c.lineTo(x + ss * wdt * 0.9, y) : c.moveTo(x + ss * wdt * 0.9, y))); c.stroke();
        seg = [];
      };
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], w = off + Math.sin(i * 0.8 + k * 3.1) * 0.05 + (rb() - 0.5) * 0.03;
        seg.push([p.x + w * p.r, p.y]);
        if (rb() < 0.07 + 0.08 * age) flush();
      }
      flush();
    }
    // plate cracks between furrows
    c.strokeStyle = 'rgba(15,8,4,0.32)';
    for (let i = 0; i < Math.round(S.wood * 2.2 * age); i++) {
      const p = S.trunkPt(rb() * 0.9), w = (rb() * 2 - 1) * p.r * 0.8;
      c.lineWidth = 0.3 + rb() * 0.5; c.beginPath(); c.moveTo(p.x + w, p.y); c.lineTo(p.x + w + p.r * 0.25 * (rb() - 0.3), p.y + 0.6); c.stroke();
    }
    // moss on the shaded side low down, lichen higher up
    const moss = Math.round(30 + 260 * age);
    for (let i = 0; i < moss; i++) {
      const u = Math.pow(rb(), 2.2) * (0.25 + 0.2 * age), p = S.trunkPt(u);
      const w = -ss * (0.35 + rb() * 0.7) * p.r;
      c.fillStyle = hsl(78 + rb() * 30, 38 + rb() * 20, 22 + rb() * 18, 0.35 + rb() * 0.45);
      c.beginPath(); c.arc(p.x + w, p.y + (rb() - 0.5) * 3, 0.3 + rb() * Math.min(1.6, p.r * 0.08), 0, TAU); c.fill();
    }
    for (let i = 0; i < Math.round(3 + 8 * age); i++) {
      const p = S.trunkPt(0.15 + rb() * 0.6), w = (rb() * 2 - 1) * p.r * 0.6, sz = 0.6 + rb() * Math.min(3, p.r * 0.14);
      c.fillStyle = hsl(80 + rb() * 40, 18, 68, 0.38);
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(p.x + w + (rb() - 0.5) * sz, p.y + (rb() - 0.5) * sz, sz * (0.4 + rb() * 0.5), 0, TAU); c.fill(); }
    }
    // knots (missed weeks / old pruned limbs / dormant months)
    S.knots.forEach((k) => {
      const p = S.trunkPt(k.u); const kx = p.x + k.side * p.r * 0.42; const kr = Math.max(0.7, p.r * k.size * 0.55);
      c.fillStyle = 'rgba(255,225,190,0.10)';
      c.beginPath(); c.ellipse(kx, p.y, kr * 1.05, kr * 1.7, k.side * 0.15, 0, TAU); c.fill();
      c.fillStyle = k.kind === 'bud' ? 'rgba(55,36,22,0.55)' : 'rgba(28,17,9,0.75)';
      c.beginPath(); c.ellipse(kx, p.y, kr * 0.45, kr * (k.kind === 'scar' ? 0.75 : 1.05), k.side * 0.15, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(20,12,6,0.4)'; c.lineWidth = Math.max(0.2, kr * 0.1);
      c.beginPath(); c.ellipse(kx, p.y, kr * 0.75, kr * 1.35, k.side * 0.15, 0, TAU); c.stroke();
    });
    // amber: milestone rings and beads of sap
    S.rings.forEach((r) => {
      const p = S.trunkPt(r.u);
      if (r.major) {
        c.strokeStyle = 'rgba(255,190,70,0.8)'; c.lineWidth = Math.max(0.5, p.r * 0.07);
        c.beginPath(); c.ellipse(p.x, p.y, p.r * 0.98, p.r * 0.2, 0, 0.15, Math.PI - 0.15); c.stroke();
      }
      const bx = p.x + r.off * p.r * 0.75, by = p.y + p.r * 0.12, br = Math.max(0.7, Math.min(3.2, p.r * (r.major ? 0.16 : 0.1)));
      const g = c.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0.1, bx, by, br * 2.4);
      g.addColorStop(0, 'rgba(255,238,165,1)'); g.addColorStop(0.35, 'rgba(235,150,35,0.95)'); g.addColorStop(1, 'rgba(235,150,35,0)');
      c.fillStyle = g; c.beginPath(); c.arc(bx, by, br * 2.4, 0, TAU); c.fill();
    });
    // initials carved after 12 weeks with a run
    if (S.carving) {
      const p = S.trunkPt(S.carving.u);
      if (p.r * R.v.z > 9) {
        const s = p.r * 0.66, x0 = p.x + ss * p.r * 0.1, y0 = p.y;
        const heart = (dy) => {
          c.beginPath(); c.moveTo(x0, y0 + s * 0.75 + dy);
          c.bezierCurveTo(x0 - s * 1.25, y0 + dy, x0 - s * 0.75, y0 - s * 0.95 + dy, x0, y0 - s * 0.35 + dy);
          c.bezierCurveTo(x0 + s * 0.75, y0 - s * 0.95 + dy, x0 + s * 1.25, y0 + dy, x0, y0 + s * 0.75 + dy);
        };
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = 'rgba(255,228,190,0.32)'; c.lineWidth = s * 0.09; heart(s * 0.06); c.stroke();
        c.strokeStyle = 'rgba(28,14,6,0.78)'; c.lineWidth = s * 0.08; heart(0); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `700 ${s * 0.62}px Caveat, "Bradley Hand", "Segoe Print", cursive`;
        c.fillStyle = 'rgba(255,228,190,0.32)'; c.fillText(S.carving.initial, x0, y0 + s * 0.05 + s * 0.05);
        c.fillStyle = 'rgba(28,14,6,0.8)'; c.fillText(S.carving.initial, x0, y0 + s * 0.05);
        c.font = `700 ${s * 0.3}px Caveat, "Bradley Hand", cursive`;
        c.fillText(S.carving.year, x0, y0 + s * 1.15);
        c.textBaseline = 'alphabetic';
      }
    }
    c.restore();
  }

  // -------------------------------------------------------- foreground
  function drawForeground(c, R) {
    const S = R.S, v = R.v;
    if (R.treeOnly) return;
    worldT(c, R);
    S.fallen.forEach((f) => {
      const sc = f.size * v.z * R.dpr, a = f.ang;
      c.setTransform(Math.cos(a) * sc, Math.sin(a) * sc, -Math.sin(a) * sc * 0.6, Math.cos(a) * sc * 0.6,
        (v.cx + f.x * v.z) * R.dpr, (v.gy + (f.y - 1) * v.z) * R.dpr);
      c.fillStyle = hsl(f.h, f.s, f.l * (R.night ? 0.6 : 1)); c.fill(SPRAY[0]);
    });
    worldT(c, R);
    (S.fallenFruit || []).forEach((f) => {
      const r = f.size * 0.7, col = { easy: [352, 70, 30], long: [8, 65, 34], tempo: [30, 80, 40], hill: [270, 40, 26], race: [44, 70, 45] }[f.kind];
      const l = col[2] * (1 - f.decay * 0.45);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(f.x + 1, f.y + r * 0.6, r * 1.3, r * 0.35, 0, 0, TAU); c.fill();
      const g = c.createRadialGradient(f.x - r * 0.3, f.y - r * 0.3, 0.1, f.x, f.y, r);
      g.addColorStop(0, hsl(col[0], col[1] * (1 - f.decay * 0.5), l + 18)); g.addColorStop(1, hsl(col[0] + f.decay * 15, col[1] * (1 - f.decay * 0.5), l));
      c.fillStyle = g; c.beginPath(); c.ellipse(f.x, f.y, r, r * 0.88, f.rot, 0, TAU); c.fill();
    });
    screenT(c, R);
    S.flowers.forEach((f) => flower(c, v.cx + f.x * Math.min(v.z, 1.8), v.gy, f));
    grass(c, R, true);
    nameSign(c, R);
  }

  function nameSign(c, R) {
    const M = R.M, S = R.S, v = R.v;
    if (!M || !M.name || !S.runsN) return;
    const k = clamp(R.W / 720, 0.75, 1.5);
    const side = S.swing ? -S.swing.side : -R.sunSide;
    let x = v.cx + side * (S.R * v.z * 2.4 + 58 * k);
    x = clamp(x, 52 * k, R.W - 52 * k);
    const y = v.gy + 4;
    c.save(); c.translate(x, y); c.rotate(side * 0.035);
    const post = c.createLinearGradient(-3 * k, 0, 3 * k, 0);
    post.addColorStop(0, '#5b3d22'); post.addColorStop(1, '#3a2614');
    c.fillStyle = post; c.fillRect(-2.6 * k, -40 * k, 5.2 * k, 44 * k);
    const pw = 82 * k, ph = 30 * k, py = -48 * k;
    const g = c.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, '#b78a56'); g.addColorStop(1, '#8a6038');
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-pw / 2 + 2, py + 2, pw, ph);
    c.fillStyle = g; c.fillRect(-pw / 2, py, pw, ph);
    c.strokeStyle = 'rgba(70,40,18,0.35)'; c.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) { const yy = py + ph * (0.2 + i * 0.2); c.beginPath(); c.moveTo(-pw / 2 + 3, yy); c.bezierCurveTo(-pw / 4, yy - 1.5, pw / 4, yy + 1.5, pw / 2 - 3, yy); c.stroke(); }
    c.fillStyle = '#3b2a1c'; [[-pw / 2 + 4, py + 4], [pw / 2 - 4, py + 4]].forEach(([a, b]) => { c.beginPath(); c.arc(a, b, 1.2 * k, 0, TAU); c.fill(); });
    c.textAlign = 'center';
    c.font = `700 ${17 * k}px Caveat, "Bradley Hand", "Segoe Print", cursive`;
    c.fillStyle = 'rgba(255,235,200,0.35)'; c.fillText(M.name, 0.6, py + ph * 0.56 + 0.8);
    c.fillStyle = '#3a2412'; c.fillText(M.name, 0, py + ph * 0.56);
    c.font = `600 ${10 * k}px Caveat, "Bradley Hand", cursive`;
    c.fillText(`since ${M.since}`, 0, py + ph * 0.9);
    c.restore();
  }

  // ------------------------------------------------------ ornaments
  function ball(ctx, x, y, r, c0, c1) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  function fruit(ctx, f) {
    const sx = f.x, sy = f.y, r = f.size * (0.6 + 0.4 * (0.4 + 0.6 * f.ripe));
    const fy = sy + f.stem + r;
    ctx.strokeStyle = '#4b3a22'; ctx.lineWidth = 0.5; ctx.lineCap = 'round';
    if (f.latest) {
      const g = ctx.createRadialGradient(sx, fy, r * 0.5, sx, fy, r * 3.2);
      g.addColorStop(0, 'rgba(255,240,170,0.55)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, fy, r * 3.2, 0, TAU); ctx.fill();
    }
    switch (f.kind) {
      case 'easy': {   // cherries
        const rr = r * 0.62;
        [[-1, 0], [1, 0.25]].forEach(([s, dy]) => {
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + s * rr, sy + f.stem * 0.5, sx + s * rr * 1.1, fy + dy * rr - rr * 0.6); ctx.stroke();
          ball(ctx, sx + s * rr * 1.1, fy + dy * rr, rr, hsl(355, 85, lerp(62, 58, f.ripe)), hsl(350, 80, lerp(40, 28, f.ripe)));
        });
        break;
      }
      case 'long': {   // apple
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, fy - r * 0.8); ctx.stroke();
        ball(ctx, sx, fy, r, hsl(lerp(70, 8, f.ripe), 80, 62), hsl(lerp(85, 356, f.ripe), 75, 34));
        ctx.fillStyle = hsl(110, 45, 36); ctx.beginPath(); ctx.ellipse(sx + r * 0.45, fy - r * 1.0, r * 0.45, r * 0.18, -0.5, 0, TAU); ctx.fill();
        break;
      }
      case 'tempo': {  // orange
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, fy - r * 0.9); ctx.stroke();
        ball(ctx, sx, fy, r, hsl(lerp(70, 38, f.ripe), 95, 66), hsl(lerp(80, 26, f.ripe), 90, 44));
        ctx.fillStyle = 'rgba(120,60,0,0.25)';
        for (let k = 0; k < 7; k++) { const a = k * 2.4; ctx.fillRect(sx + Math.cos(a) * r * 0.55, fy + Math.sin(a) * r * 0.55, 0.35, 0.35); }
        ctx.fillStyle = hsl(110, 45, 34); ctx.beginPath(); ctx.arc(sx, fy - r * 0.9, r * 0.2, 0, TAU); ctx.fill();
        break;
      }
      case 'hill': {   // plums
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, fy - r); ctx.stroke();
        const g = ctx.createRadialGradient(sx - r * 0.3, fy - r * 0.3, r * 0.1, sx, fy, r * 1.1);
        g.addColorStop(0, hsl(275, 40, lerp(70, 62, f.ripe))); g.addColorStop(1, hsl(265, 55, lerp(42, 26, f.ripe)));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, fy, r * 0.85, r * 1.05, 0.15, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(230,220,255,0.25)'; ctx.beginPath(); ctx.ellipse(sx - r * 0.25, fy - r * 0.2, r * 0.3, r * 0.55, 0.2, 0, TAU); ctx.fill();
        break;
      }
      case 'race': {   // golden apple
        const g = ctx.createRadialGradient(sx, fy, r * 0.4, sx, fy, r * 3);
        g.addColorStop(0, 'rgba(255,215,90,0.6)'); g.addColorStop(1, 'rgba(255,215,90,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, fy, r * 3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, fy - r * 0.8); ctx.stroke();
        ball(ctx, sx, fy, r * 1.05, '#fff4c2', '#c88a12');
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.35;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(sx + r * 0.9 + Math.cos(a) * r * 0.5, fy - r * 0.9 + Math.sin(a) * r * 0.5); ctx.lineTo(sx + r * 0.9 - Math.cos(a) * r * 0.5, fy - r * 0.9 - Math.sin(a) * r * 0.5); ctx.stroke(); }
        break;
      }
    }
    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(sx - r * 0.3, fy - r * 0.35, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
  }

  function blossom(ctx, b) {
    const a = 1 - b.fade;
    if (a <= 0.02) return;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.globalAlpha = a;
    if (b.bud) { ctx.fillStyle = '#fff3f6'; ctx.beginPath(); ctx.ellipse(0, 0, b.size * 0.5, b.size * 0.8, 0, 0, TAU); ctx.fill(); ctx.restore(); return; }
    for (let k = 0; k < 5; k++) {
      ctx.rotate(TAU / 5);
      const g = ctx.createRadialGradient(0, -b.size * 0.6, 0.1, 0, -b.size * 0.6, b.size * 0.75);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#f6a8c2');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -b.size * 0.6, b.size * 0.42, b.size * 0.62, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, b.size * 0.25, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function nest(ctx, n) {
    ctx.save(); ctx.translate(n.x, n.y); ctx.scale(n.scale || 1, n.scale || 1);
    const x = 0, y = 0, w = 9, h = 4.2;
    // eggs peeking
    for (let i = 0; i < n.eggs; i++) {
      const ex = x - w * 0.62 + (i + 0.5) * (w * 1.24 / n.eggs), ey = y - h * 0.55 - (i % 2) * 0.6;
      ball(ctx, ex, ey, 1.55, '#e9fbff', '#7cc4d4');
      ctx.fillStyle = 'rgba(60,80,90,0.5)'; ctx.fillRect(ex - 0.5, ey - 0.3, 0.3, 0.3); ctx.fillRect(ex + 0.3, ey + 0.4, 0.25, 0.25);
    }
    // woven bowl
    ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 0.4, w, h * 0.45, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(210,170,110,0.75)'; ctx.lineWidth = 0.35;
    for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.ellipse(x + (k % 3 - 1) * 0.6, y + (k % 4) * 0.5 - 0.6, w * (0.75 + (k % 5) * 0.06), h * 0.75, (k % 2 ? 0.08 : -0.08), 0.1, Math.PI - 0.1); ctx.stroke(); }
    if (n.bird) {   // a robin keeps watch on long streaks
      const bx = x + w * 1.2 * (n.side > 0 ? 1 : -1), by = y - 7, s = n.side > 0 ? 1 : -1;
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, 1);
      ctx.fillStyle = '#5b4636'; ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 4, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e36a2e'; ctx.beginPath(); ctx.ellipse(1.6, 1.2, 3, 2.6, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b4636'; ctx.beginPath(); ctx.arc(4.4, -2.8, 2.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4.5, -0.5); ctx.lineTo(-9, -2.5); ctx.lineTo(-8.5, 0.8); ctx.fill();
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(6.6, -3); ctx.lineTo(8.6, -2.5); ctx.lineTo(6.6, -2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -3.4, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(5.1, -3.4, 0.35, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, 3.6); ctx.lineTo(0, 6.5); ctx.moveTo(1.5, 3.6); ctx.lineTo(1.5, 6.5); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function flower(ctx, x, gy, f) {
    const h = f.h * (1 - f.wilt * 0.4);
    const tx = x + f.sway * h + f.wilt * 5, ty = gy - h;
    ctx.strokeStyle = hsl(100, 35, 32); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x, gy + 2); ctx.quadraticCurveTo(x, gy - h * 0.6, tx, ty); ctx.stroke();
    const [hh, ss, ll] = f.color;
    const pr = 4.2;
    for (let k = 0; k < f.petals; k++) {
      const a = k * TAU / f.petals;
      ctx.fillStyle = hsl(lerp(hh, 30, f.wilt), ss * (1 - f.wilt * 0.6), ll - f.wilt * 20, 0.95);
      ctx.beginPath(); ctx.ellipse(tx + Math.cos(a) * pr, ty + Math.sin(a) * pr, pr * 0.85, pr * 0.5, a, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#f7c948'; ctx.beginPath(); ctx.arc(tx, ty, 1.6, 0, TAU); ctx.fill();
  }

  // -------------------------------------------------------- living layer
  // Particles for the overlay canvas: falling leaves, fireflies, snow,
  // pollen, butterflies. Purely decorative, driven by the scene state.
  function Ambient(scene, view, model) {
    const P = [];
    const r = Math.random;
    const kudos28 = model ? model.runs.filter((x) => scene.T - x.day <= 28 && x.day <= scene.T).reduce((a, x) => a + (x.kudos || 0), 0) : 0;
    const night = model && ['night', 'evening'].includes(model.g.sky && model.g.sky.period);
    const leaves = scene.leaves;
    function spawn(kind) {
      if (kind === 'leaf' && leaves.length) {
        const L = leaves[(r() * leaves.length) | 0];
        P.push({ k: 'leaf', x: view.cx + L.x * view.z, y: view.gy + L.y * view.z, vx: (r() - 0.5) * 0.4, vy: 0.3 + r() * 0.5, a: r() * TAU, va: (r() - 0.5) * 0.08, s: L.size * view.z * 0.9, c: L.c1 || hsl(L.h, L.s, L.l), life: 1 });
      } else if (kind === 'snow') {
        P.push({ k: 'snow', x: r() * view.W, y: -5, vx: (r() - 0.5) * 0.3, vy: 0.4 + r() * 0.7, s: 1 + r() * 2, life: 1 });
      } else if (kind === 'fly') {
        P.push({ k: 'fly', x: view.cx + (r() - 0.5) * (scene.bbox.x1 - scene.bbox.x0) * view.z, y: view.gy + (scene.bbox.y0 * r()) * view.z, ph: r() * TAU, life: 1, t: 0 });
      } else if (kind === 'pollen') {
        P.push({ k: 'pollen', x: view.cx + (r() - 0.5) * (scene.bbox.x1 - scene.bbox.x0) * view.z, y: view.gy + scene.bbox.y0 * view.z * r(), vx: (r() - 0.5) * 0.2, vy: -0.1 - r() * 0.2, life: 1 });
      } else if (kind === 'mote') {
        // dust drifting in the light, on the sun side of the crown
        const C = scene.view && R0crown;
        P.push({ k: 'mote', x: view.cx + ((C ? C.x : 0) + (r() - 0.5 + sunSide * 0.3) * (scene.bbox.x1 - scene.bbox.x0)) * view.z,
          y: view.gy + scene.bbox.y0 * view.z * (0.2 + r() * 0.9), vx: (r() - 0.5) * 0.12, vy: (r() - 0.6) * 0.1, ph: r() * TAU, life: 1 });
      } else if (kind === 'butterfly') {
        P.push({ k: 'bf', x: r() * view.W, y: view.gy - 40 - r() * 160, ph: r() * TAU, h: [200, 45, 320, 28][(r() * 4) | 0], life: 1, dir: r() < 0.5 ? -1 : 1 });
      }
    }
    const LT = model && model.g.sky ? model.g.sky.period : 'morning';
    const sunny = ['dawn', 'morning', 'afternoon', 'evening'].includes(LT) && !scene.winter;
    const sunSide = LT === 'dawn' || LT === 'morning' ? -1 : 1;
    const R0crown = null;
    // dew on the newest leaves: the run you just did, still glistening
    const dew = leaves.filter((L) => L.age < 1.5).slice(0, 10).map((L) => ({ x: view.cx + L.x * view.z, y: view.gy + L.y * view.z, ph: r() * TAU }));
    const nButterflies = Math.min(5, Math.floor(kudos28 / 6));
    for (let i = 0; i < nButterflies; i++) spawn('butterfly');
    return {
      step(ctx, dpr, t) {
        const fallRate = scene.winter ? 0 : clamp((0.55 - scene.season) * 0.5, 0, 0.25) + 0.01;
        if (r() < fallRate) spawn('leaf');
        if (scene.winter && r() < 0.6) spawn('snow');
        if (night && P.filter((p) => p.k === 'fly').length < 14 && r() < 0.05) spawn('fly');
        if (scene.season > 0.85 && r() < 0.06) spawn('pollen');
        if (sunny && P.filter((p) => p.k === 'mote').length < 40 && r() < 0.12) spawn('mote');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, view.W, view.H);
        for (let i = P.length - 1; i >= 0; i--) {
          const p = P[i];
          if (p.k === 'leaf') {
            p.x += p.vx + Math.sin(t / 600 + p.a) * 0.4; p.y += p.vy; p.a += p.va;
            if (p.y > view.gy + 2) { p.life -= 0.02; p.vy = 0; p.vx = 0; p.va = 0; }
            const c = Math.cos(p.a) * p.s, s = Math.sin(p.a) * p.s;
            ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, p.x * dpr, p.y * dpr);
            ctx.globalAlpha = clamp(p.life); ctx.fillStyle = p.c; ctx.fill(SPRAY[0]);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
          } else if (p.k === 'snow') {
            p.x += p.vx + Math.sin(t / 900 + p.y / 40) * 0.2; p.y += p.vy;
            if (p.y > view.gy + 4) p.life = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
          } else if (p.k === 'fly') {
            p.t += 1; p.x += Math.cos(t / 900 + p.ph) * 0.3; p.y += Math.sin(t / 700 + p.ph * 2) * 0.25;
            const a = 0.5 + 0.5 * Math.sin(t / 300 + p.ph);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
            g.addColorStop(0, `rgba(255,250,170,${0.9 * a})`); g.addColorStop(1, 'rgba(255,250,170,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill();
            if (p.t > 900) p.life = 0;
          } else if (p.k === 'pollen') {
            p.x += p.vx + Math.sin(t / 500 + p.y) * 0.15; p.y += p.vy; p.life -= 0.003;
            ctx.fillStyle = `rgba(255,245,180,${0.7 * p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, TAU); ctx.fill();
          } else if (p.k === 'mote') {
            p.x += p.vx + Math.sin(t / 2100 + p.ph) * 0.08; p.y += p.vy + Math.cos(t / 1700 + p.ph) * 0.06; p.life -= 0.0015;
            const a = (0.25 + 0.35 * Math.sin(t / 600 + p.ph * 3)) * Math.min(1, p.life * 3);
            ctx.fillStyle = `rgba(255,240,200,${Math.max(0, a)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 0.9, 0, TAU); ctx.fill();
          } else if (p.k === 'bf') {
            p.x += p.dir * 0.5 + Math.cos(t / 400 + p.ph) * 0.6; p.y += Math.sin(t / 300 + p.ph) * 0.5;
            if (p.x < -20) p.x = view.W + 10; if (p.x > view.W + 20) p.x = -10;
            const flap = Math.abs(Math.sin(t / 90 + p.ph));
            ctx.fillStyle = hsl(p.h, 85, 60, 0.95);
            ctx.beginPath(); ctx.ellipse(p.x - 3 * flap, p.y, 4 * flap + 0.6, 3, -0.4, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(p.x + 3 * flap, p.y, 4 * flap + 0.6, 3, 0.4, 0, TAU); ctx.fill();
            ctx.fillStyle = '#2b2b2b'; ctx.fillRect(p.x - 0.5, p.y - 2.5, 1, 5);
          }
          if (p.life <= 0 || p.y > view.H) P.splice(i, 1);
        }
        // dew glints twinkle on the freshest leaves
        dew.forEach((d) => {
          const a = Math.max(0, Math.sin(t / 700 + d.ph * 5)) ** 6;
          if (a < 0.02) return;
          ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(d.x - 3.5 * a, d.y); ctx.lineTo(d.x + 3.5 * a, d.y); ctx.moveTo(d.x, d.y - 3.5 * a); ctx.lineTo(d.x, d.y + 3.5 * a); ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(d.x, d.y, 1, 0, TAU); ctx.fill();
        });
        // the latest fruit gently pulses
        const lf = scene.fruits.find((f) => f.latest);
        if (lf) {
          const fx = view.cx + lf.x * view.z, fy = view.gy + (lf.y + lf.stem + lf.size) * view.z;
          const a = 0.18 + 0.14 * Math.sin(t / 420);
          const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, lf.size * view.z * 4);
          g.addColorStop(0, `rgba(255,244,190,${a})`); g.addColorStop(1, 'rgba(255,244,190,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, lf.size * view.z * 4, 0, TAU); ctx.fill();
        }
      },
    };
  }

  // Tree-ring slice: one ring per week (thick = strong week, dark = missed)
  function drawRings(ctx, M, T, size, dpr) {
    const wk = weekAt(M, T);
    const weeks = M.weeks.slice(0, wk + 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const total = weeks.reduce((a, w) => a + 0.35 + (w.runs ? w.strength : 0), 0) || 1;
    const maxR = c - 6;
    const rr = rng(M.seed + ':slice');
    // bark
    ctx.fillStyle = '#4a3324'; ctx.beginPath(); ctx.arc(c, c, maxR + 5, 0, TAU); ctx.fill();
    let r = maxR;
    const wobble = (a, k) => 1 + 0.025 * Math.sin(a * 3 + k * 0.7) + 0.018 * Math.sin(a * 7 + k * 1.3);
    for (let i = weeks.length - 1; i >= 0; i--) {
      const w = weeks[i];
      const width = (0.35 + (w.runs ? w.strength : 0)) / total * maxR;
      const light = w.runs ? 70 - w.strength * 14 : 38;
      ctx.fillStyle = w.runs ? hsl(34, 48, light) : hsl(25, 35, 34);
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.01; a += 0.08) { const rad = r * wobble(a, i); const x = c + Math.cos(a) * rad, y = c + Math.sin(a) * rad; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,55,30,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
      r -= width;
    }
    ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(c, c, Math.max(1.5, r), 0, TAU); ctx.fill();
    // radial cracks
    ctx.strokeStyle = 'rgba(60,35,20,0.35)'; ctx.lineWidth = 0.7;
    for (let k = 0; k < 3; k++) { const a = rr() * TAU; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * maxR * 0.2, c + Math.sin(a) * maxR * 0.2); ctx.lineTo(c + Math.cos(a) * maxR * (0.5 + rr() * 0.4), c + Math.sin(a) * maxR * (0.5 + rr() * 0.4)); ctx.stroke(); }
  }

  const geom = { outline, samplePolyline, SEASON_STOPS, interpStops };
  const api = { geom, prepare, grow, render, prepareRender, drawFrame, postStyle, noise, Ambient, drawRings, stateAt, woodAt, KIND_LABEL, leafCount, rng, hash, dayIdx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FitTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
