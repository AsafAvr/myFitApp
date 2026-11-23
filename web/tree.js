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
    const di = clamp(Math.floor(T), 0, (M.g.days && M.g.days.season.length - 1) || 0);
    const days = M.g.days || { season: [0.8], heat: [0], ratio: [1] };
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
      const limb = { pts, m, vigor, side, L, km, runs: mr.length, u };
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
        S.branches.push({ pts: bpts, runs: wr.length, km: wkm });
        // ---- run twigs: placed along the week branch by weekday
        const sameDay = {};
        wr.forEach((r) => {
          const n2 = (sameDay[r.dow] = (sameDay[r.dow] || 0) + 1) - 1;
          twig(r, bpts, 0.14 + 0.8 * (r.dow + 0.5) / 7 + n2 * 0.04, (r.dow % 2 ? 1 : -1) * (n2 % 2 ? -1 : 1));
        });
      });
    });

    function twig(r, bpts, s, tside) {
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
      const tw = { pts, forks, run: r };
      S.twigs.push(tw);
      const tip = pts[pts.length - 1];
      const age = T - r.day;
      S.hits.push({ type: 'run', x: tip.x, y: tip.y, r: 7 + Math.sqrt(r.km) * 1.5, data: r });

      // ---- leaves (~1.6 per km)
      const nL = leafCount(r.km);
      const paths = [pts, ...forks];
      const effort = clamp(r.min / 70);
      for (let k = 0; k < nL; k++) {
        const path = paths[k % paths.length];
        const tpos = k < paths.length ? 1 : 0.28 + 0.72 * rt();
        const a = samplePolyline(path, tpos);
        const lside = k % 2 ? 1 : -1;
        const base = Math.atan2(a.dir.y, a.dir.x);
        const ang = tpos >= 0.999 ? base + (rt() - 0.5) * 0.6 : base + lside * (0.6 + rt() * 0.6);
        S.leaves.push({
          x: a.x, y: a.y, ang, size: (5.0 + 2.8 * rt()) * (0.88 + 0.3 * effort) * OS,
          sens: rt(), drop: rt(), hueJ: rt() - 0.5, lightJ: rt() - 0.5, back: rt() < 0.38, keep: rt(),
          age, run: r.i,
        });
        grow_bb(a.x + Math.cos(ang) * 8, a.y + Math.sin(ang) * 8);
      }

      // ---- blossoms for PRs / milestones / achievements (fade after ~2 months)
      const bloom = (r.pr || 0) + (r.ms ? r.ms.length : 0);
      if ((bloom || r.ach) && age < 70 && st.season > 0.3) {
        const nb = Math.min(4, Math.max(1, bloom));
        for (let k = 0; k < nb; k++) {
          const a = samplePolyline(pts, 0.4 + 0.5 * rt());
          S.blossoms.push({ x: a.x + (rt() - 0.5) * 6 * OS, y: a.y + (rt() - 0.5) * 6 * OS, size: (bloom ? 3.2 + rt() * 1.5 : 2) * OS, bud: !bloom, rot: rt() * TAU, fade: smooth(45, 70, age) });
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
      S.fruits.push({ x: src.x, y: src.y, size, kind: r.kind, ripe, latest: lastRun && r.i === lastRun.i, run: r, stem: 3 * OS + size * 0.9 });
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
          hueJ: rl() - 0.5, lightJ: rl() - 0.5, back: false, keep: 0, age: recent ? 1 : st.dormant, run: -1 });
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
      S.nest = { x: at.x, y: at.y - 1, eggs: Math.min(6, st.streak), bird: st.streak >= 8, streak: st.streak, side: limb.side, scale: OS };
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

    // ---- leaf colour & fall for this moment
    const sT = st.season, heat = st.heat;
    const kept = [];
    const rf = rng(M.seed + ':fall');
    S.leaves.forEach((L) => {
      if (L.age > 150 && L.keep > 0.6) return;               // old inner growth thins out
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

  function samplePolyline(pts, s) {
    const n = pts.length - 1;
    const f = clamp(s) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const t = f - i;
    const a = pts[i], b = pts[i + 1];
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), r: lerp(a.r, b.r, t), dir: norm({ x: b.x - a.x, y: b.y - a.y }) };
  }

  // --------------------------------------------------------------- render
  const SKIES = {
    dawn: [[0, 236, 52, 60], [0.45, 18, 80, 72], [0.75, 36, 90, 78], [1, 45, 90, 84]],
    morning: [[0, 205, 70, 62], [0.6, 200, 70, 78], [1, 50, 70, 88]],
    midday: [[0, 208, 80, 56], [0.7, 200, 75, 74], [1, 190, 60, 86]],
    afternoon: [[0, 210, 60, 60], [0.6, 30, 70, 78], [1, 42, 85, 80]],
    evening: [[0, 250, 40, 30], [0.45, 330, 45, 52], [0.75, 22, 85, 62], [1, 40, 90, 70]],
    night: [[0, 230, 50, 9], [0.6, 228, 45, 18], [1, 250, 35, 28]],
  };

  function makeLeafPath() {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.25, -0.34, 0.7, -0.3, 1, 0);
    p.bezierCurveTo(0.7, 0.3, 0.25, 0.34, 0, 0);
    return p;
  }
  let LEAF = null;

  function render(ctx, S, W, Hc, opts) {
    opts = opts || {};
    LEAF = LEAF || makeLeafPath();
    const M = opts.model;
    const period = (M && M.g.sky && M.g.sky.period) || 'morning';
    const groundY = Math.round(Hc * (opts.groundFrac || 0.72));
    const top = opts.topPad || 34;
    const treeH = Math.max(150, -S.bbox.y0 + 14);
    const treeW = Math.max(140, S.bbox.x1 - S.bbox.x0 + 30);
    const z = Math.min((groundY - top) / treeH, (W - 40) / treeW, opts.maxZoom || 2.6);
    const cx = W / 2 - z * (S.bbox.x0 + S.bbox.x1) / 2 * 0.85;
    const view = { z, cx, gy: groundY, W, H: Hc };
    S.view = view;
    const rs = rng((M ? M.seed : 's') + ':sky');

    // ---- sky
    ctx.setTransform(opts.dpr || 1, 0, 0, opts.dpr || 1, 0, 0);
    const dpr = opts.dpr || 1;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    const desat = S.winter ? 0.45 : 1;
    SKIES[period].forEach(([o, h, s, l]) => sky.addColorStop(o, hsl(h, s * desat, S.winter ? lerp(l, 80, 0.25) : l)));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY + 2);
    const night = period === 'night' || period === 'evening';
    if (period === 'night') {
      for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,255,240,${0.25 + rs() * 0.6})`; ctx.fillRect(rs() * W, rs() * groundY * 0.8, rs() < 0.1 ? 2 : 1.1, rs() < 0.1 ? 2 : 1.1); }
    }
    // sun or moon
    {
      const pos = { dawn: [0.18, 0.62], morning: [0.24, 0.26], midday: [0.6, 0.12], afternoon: [0.8, 0.3], evening: [0.84, 0.56], night: [0.8, 0.16] }[period];
      const sx = W * pos[0], sy = groundY * pos[1];
      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, Math.min(W, Hc) * 0.42);
      const gc = period === 'night' ? [220, 40, 85] : [44, 100, 70];
      glow.addColorStop(0, hsl(gc[0], gc[1], gc[2], period === 'night' ? 0.35 : 0.55));
      glow.addColorStop(1, hsl(gc[0], gc[1], gc[2], 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, groundY);
      if (period === 'night') {
        ctx.fillStyle = '#f4f1de'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, TAU); ctx.fill();
        ctx.fillStyle = hsl(230, 50, 12); ctx.beginPath(); ctx.arc(sx + 7, sy - 4, 14, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = hsl(46, 100, period === 'midday' ? 92 : 80, 0.95); ctx.beginPath(); ctx.arc(sx, sy, 20, 0, TAU); ctx.fill();
      }
    }
    // clouds
    for (let i = 0; i < 5; i++) {
      const cxp = rs() * W, cyp = 30 + rs() * groundY * 0.4, cw = 50 + rs() * 90;
      ctx.fillStyle = period === 'night' ? 'rgba(200,210,255,0.06)' : `rgba(255,255,255,${0.22 + rs() * 0.25})`;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(cxp + (k - 2) * cw * 0.28, cyp + Math.sin(k * 2.1) * 6, cw * 0.32, cw * 0.17, 0, 0, TAU); ctx.fill(); }
    }
    // distant hills
    const seasonGreen = interpStops(SEASON_STOPS, clamp(S.season * 0.9 + 0.05));
    for (let layer = 0; layer < 3; layer++) {
      const base = groundY - 30 + layer * 12;
      ctx.beginPath(); ctx.moveTo(0, groundY + 2);
      const ph = rs() * 10, amp = 28 - layer * 7;
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin(x / W * 5 + ph)) * (0.7 + 0.3 * Math.sin(x / W * 13 + ph * 2)));
      ctx.lineTo(W, groundY + 2); ctx.closePath();
      const l = period === 'night' ? 12 + layer * 4 : lerp(68, seasonGreen[2] + 8, layer / 2.5);
      ctx.fillStyle = hsl(lerp(210, seasonGreen[0], 0.35 + layer * 0.25), (period === 'night' ? 20 : 25 + layer * 8) * desat, l, 0.9);
      ctx.fill();
    }

    // ---- soil cross-section
    const soil = ctx.createLinearGradient(0, groundY, 0, Hc);
    soil.addColorStop(0, '#5a3d27'); soil.addColorStop(0.25, '#4a3221'); soil.addColorStop(1, '#2a1c13');
    ctx.fillStyle = soil; ctx.fillRect(0, groundY, W, Hc - groundY);
    for (let i = 0; i < 4; i++) {   // strata
      ctx.strokeStyle = `rgba(0,0,0,${0.12 + i * 0.03})`; ctx.lineWidth = 1;
      ctx.beginPath(); const yy = groundY + (Hc - groundY) * (0.22 + i * 0.2); const ph = rs() * 9;
      for (let x = 0; x <= W; x += 10) ctx.lineTo(x, yy + Math.sin(x / 60 + ph) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 70; i++) {  // pebbles
      const px = rs() * W, py = groundY + 8 + rs() * (Hc - groundY - 10), pr = 1 + rs() * 3.5;
      ctx.fillStyle = `hsla(${25 + rs() * 20}, ${10 + rs() * 15}%, ${30 + rs() * 25}%, 0.7)`;
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.3, pr, rs() * 3, 0, TAU); ctx.fill();
    }

    const W2S = (x, y) => [cx + x * z, groundY + y * z];
    const setT = () => ctx.setTransform(z * dpr, 0, 0, z * dpr, cx * dpr, groundY * dpr);

    // ---- roots (scaled to fit the soil)
    setT();
    const maxDepth = Math.max(1, ...S.roots.map((r) => Math.max(...r.pts.map((p) => p.y))));
    const rootBottom = opts.rootBottom || Hc;
    const rootFit = Math.min(1, (rootBottom - groundY - 22) / (maxDepth * z));
    ctx.save(); ctx.scale(1, rootFit);
    S.roots.forEach((rt) => {
      const col = rt.strongest ? '#c79a64' : '#9b7350';
      rt.subs.forEach((sp) => taper(ctx, sp, '#7d5a3c', null));
      taper(ctx, rt.pts, col, 'rgba(255,230,190,0.25)');
      const tip = rt.pts[rt.pts.length - 1];
      ctx.strokeStyle = 'rgba(220,190,150,0.35)'; ctx.lineWidth = 0.35;
      for (let k = 0; k < 6; k++) { const a = k * 1.1; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + Math.cos(a) * 4, tip.y + Math.sin(a) * 4); ctx.stroke(); }
    });
    ctx.restore();
    // weekday labels at root tips (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${Math.round(clamp(W / 52, 10, 15))}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
    {
      const tips = S.roots.map((rt) => { const t = rt.pts[rt.pts.length - 1]; return W2S(t.x, t.y * rootFit); });
      const span = clamp(W * 0.84, 240, 760);
      const ly = clamp(Math.max(...tips.map((t) => t[1])) + 18, groundY + 30, rootBottom - 8);
      S.roots.forEach((rt, i) => {
        const lx = clamp(cx + (i - 3) / 3 * span / 2, 22, W - 22);
        const [sx, sy] = tips[i];
        ctx.strokeStyle = rt.strongest ? 'rgba(255,214,150,0.45)' : 'rgba(240,220,200,0.18)';
        ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy + 3); ctx.lineTo(lx, ly - 12); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rt.strongest ? 'rgba(255,214,150,0.98)' : 'rgba(240,220,200,0.62)';
        ctx.fillText(rt.day + (rt.runs ? ` · ${rt.runs}` : ''), lx, ly);
      });
    }
    S.rootFit = rootFit;

    // ---- ground surface & shadow
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [g0, g1, g2] = interpStops(SEASON_STOPS, clamp(S.season * 0.85 + 0.1));
    const gr = ctx.createLinearGradient(0, groundY - 6, 0, groundY + 10);
    gr.addColorStop(0, S.winter ? '#e8eef2' : hsl(g0, g1 * 0.8, g2 + 4)); gr.addColorStop(1, S.winter ? '#b9c3c9' : hsl(g0, g1 * 0.7, g2 - 8));
    ctx.fillStyle = gr; ctx.fillRect(0, groundY - 3, W, 12);
    const sh = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, Math.max(40, (S.bbox.x1 - S.bbox.x0) * z * 0.5));
    sh.addColorStop(0, 'rgba(20,30,10,0.35)'); sh.addColorStop(1, 'rgba(20,30,10,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, groundY + 2, Math.max(40, (S.bbox.x1 - S.bbox.x0) * z * 0.5), 10, 0, 0, TAU); ctx.fill();

    // grass (back)
    const grs = rng((M ? M.seed : 's') + ':grass');
    const blades = 140 + Math.min(700, S.runsN * 3);
    const grassCol = S.winter ? [100, 10, 70] : [g0, g1 * 0.85, g2];
    const drawGrass = (front) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      for (let i = 0; i < blades; i++) {
        const x = grs() * W, h = (5 + grs() * 11) * Math.min(1.6, 0.7 + z * 0.3), lean = (grs() - 0.5) * 6, f = grs() < 0.5;
        if (f !== front) continue;
        ctx.strokeStyle = hsl(grassCol[0] + (grs() - 0.5) * 16, grassCol[1], grassCol[2] + (grs() - 0.5) * 14 + (front ? 4 : -4));
        ctx.lineWidth = 1 + grs() * 0.9;
        ctx.beginPath(); ctx.moveTo(x, groundY + 2); ctx.quadraticCurveTo(x + lean * 0.3, groundY - h * 0.6, x + lean, groundY - h); ctx.stroke();
      }
    };
    drawGrass(false);

    // fallen leaves on the ground
    setT();
    S.fallen.forEach((f) => leaf(ctx, f.x, f.y - 1, f.ang, f.size, hsl(f.h, f.s, f.l), z, dpr, cx, groundY, false));

    // ---- canopy volume: soft shade behind each leaf cluster
    setT();
    S.twigs.forEach((t) => {
      if (!t.nLeaves) return;
      const tip = t.tip, rad = (6 + Math.sqrt(t.nLeaves) * 3.2) * S.OS;
      const cx2 = (t.pts[1].x + tip.x) / 2, cy2 = (t.pts[1].y + tip.y) / 2;
      const g = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, rad);
      g.addColorStop(0, hsl(t.h, t.s * 0.8, Math.max(8, t.l - 16), 0.30)); g.addColorStop(1, hsl(t.h, t.s * 0.8, Math.max(8, t.l - 16), 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx2, cy2, rad, 0, TAU); ctx.fill();
    });
    // ---- back leaves
    S.leaves.forEach((L) => { if (L.back) leaf(ctx, L.x, L.y, L.ang, L.size, hsl(L.h, L.s, L.l), z, dpr, cx, groundY, false); });

    // ---- wood: limbs, branches, twigs, then trunk
    setT();
    const youngWood = clamp(1 - S.wood / 40);
    const bark = hsl(lerp(26, 32, youngWood), lerp(16, 30, youngWood), lerp(30, 36, youngWood));
    const barkHi = hsl(lerp(30, 38, youngWood), 22, lerp(48, 52, youngWood), 0.55);
    S.limbs.forEach((l) => taper(ctx, l.pts, bark, barkHi));
    S.branches.forEach((b) => taper(ctx, b.pts, bark, barkHi));
    ctx.lineCap = 'round';
    S.twigs.forEach((t) => {
      t.forks.forEach((f) => taper(ctx, f, hsl(28, 24, 34), null));
      taper(ctx, t.pts, hsl(28, 26, 33), null);
    });
    drawTrunk(ctx, S, bark, barkHi, M);
    // snow on wood in winter
    if (S.winter) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round';
      S.limbs.forEach((l) => { ctx.lineWidth = Math.max(0.8, l.pts[0].r * 0.5); ctx.beginPath(); l.pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y - p.r * 0.9) : ctx.moveTo(p.x, p.y - p.r * 0.9))); ctx.stroke(); });
    }

    // ---- front leaves
    S.leaves.forEach((L) => { if (!L.back) leaf(ctx, L.x, L.y, L.ang, L.size, hsl(L.h, L.s, L.l), z, dpr, cx, groundY, z * L.size > 7); });

    // ---- blossoms & fruit
    setT();
    S.blossoms.forEach((b) => blossom(ctx, b));
    S.fruits.forEach((f) => fruit(ctx, f));
    if (S.nest) nest(ctx, S.nest);

    // ---- meadow
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.flowers.forEach((f) => flower(ctx, cx + f.x * Math.min(z, 1.8), groundY, f));
    drawGrass(true);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return view;
  }

  function taper(ctx, pts, fill, hi) {
    if (pts.length < 2) return;
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const d = norm({ x: b.x - a.x, y: b.y - a.y });
      const nx = -d.y, ny = d.x, r = pts[i].r;
      L.push([pts[i].x + nx * r, pts[i].y + ny * r]); Rr.push([pts[i].x - nx * r, pts[i].y - ny * r]);
    }
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    const e = pts[pts.length - 1];
    ctx.arc(e.x, e.y, e.r, 0, TAU);
    for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (pts[0].r > 1.2) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, pts[0].r, 0, TAU); ctx.fill(); }
    if (hi && pts[0].r > 0.9) {
      ctx.strokeStyle = hi; ctx.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        ctx.lineWidth = Math.max(0.3, p.r * 0.45);
        ctx.beginPath(); ctx.moveTo(p.x - p.r * 0.35, p.y - p.r * 0.25); ctx.lineTo(q.x - q.r * 0.35, q.y - q.r * 0.25); ctx.stroke();
      }
    }
  }

  function drawTrunk(ctx, S, bark, barkHi, M) {
    const pts = S.trunk;
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const d = norm({ x: b.x - a.x, y: b.y - a.y });
      L.push([pts[i].x - d.y * pts[i].r, pts[i].y + d.x * pts[i].r]); Rr.push([pts[i].x + d.y * pts[i].r, pts[i].y - d.x * pts[i].r]);
    }
    const path = new Path2D();
    path.moveTo(L[0][0], L[0][1] + 2);
    L.forEach((p) => path.lineTo(p[0], p[1]));
    const tp = pts[pts.length - 1];
    path.arc(tp.x, tp.y, tp.r, 0, TAU);
    for (let i = Rr.length - 1; i >= 0; i--) path.lineTo(Rr[i][0], Rr[i][1]);
    path.lineTo(Rr[0][0], Rr[0][1] + 2);
    path.closePath();
    const g = ctx.createLinearGradient(-S.R * 1.3, 0, S.R * 1.3, 0);
    g.addColorStop(0, 'rgba(255,240,220,0.0)');
    ctx.fillStyle = bark; ctx.fill(path);
    // shading: light from upper-left
    const sh = ctx.createLinearGradient(-S.R * 1.5, 0, S.R * 1.5, 0);
    sh.addColorStop(0, 'rgba(255,235,200,0.22)'); sh.addColorStop(0.45, 'rgba(255,235,200,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = sh; ctx.fillRect(-S.R * 4, -S.H - 10, S.R * 8, S.H + 14);
    // bark furrows deepen with age (wood)
    const rb = rng((M ? M.seed : 's') + ':bark');
    const nf = Math.min(22, 3 + Math.floor(S.wood / 4));
    ctx.lineCap = 'round';
    for (let k = 0; k < nf; k++) {
      const off = (k + 0.5) / nf * 2 - 1;
      ctx.strokeStyle = `rgba(20,12,6,${0.18 + rb() * 0.22})`; ctx.lineWidth = 0.4 + rb() * 0.8 * Math.min(1, S.R / 15);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i]; const w = off + Math.sin(i * 0.7 + k * 3.1) * 0.06 * (1 + rb() * 0.4);
        const x = p.x + w * p.r, y = p.y;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        if (rb() < 0.06) { ctx.stroke(); ctx.beginPath(); started = false; }
      }
      ctx.stroke();
    }
    // knots (missed weeks / old pruned limbs / dormant months)
    S.knots.forEach((k) => {
      const p = S.trunkPt(k.u); const kx = p.x + k.side * p.r * 0.42; const kr = Math.max(0.7, p.r * k.size * 0.55);
      // swollen bark collar, then the dark eye of the knot
      ctx.fillStyle = 'rgba(255,225,190,0.10)';
      ctx.beginPath(); ctx.ellipse(kx, p.y, kr * 1.05, kr * 1.7, k.side * 0.15, 0, TAU); ctx.fill();
      ctx.fillStyle = k.kind === 'bud' ? 'rgba(55,36,22,0.55)' : 'rgba(28,17,9,0.7)';
      ctx.beginPath(); ctx.ellipse(kx, p.y, kr * 0.45, kr * (k.kind === 'scar' ? 0.75 : 1.05), k.side * 0.15, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(20,12,6,0.35)'; ctx.lineWidth = Math.max(0.2, kr * 0.1);
      ctx.beginPath(); ctx.ellipse(kx, p.y, kr * 0.75, kr * 1.35, k.side * 0.15, 0, TAU); ctx.stroke();
    });
    // amber rings for milestones
    S.rings.forEach((r) => {
      const p = S.trunkPt(r.u);
      if (r.major) {
        ctx.strokeStyle = 'rgba(255,190,70,0.85)'; ctx.lineWidth = Math.max(0.5, p.r * 0.07);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.98, p.r * 0.2, 0, 0.15, Math.PI - 0.15); ctx.stroke();
      }
      const bx = p.x + r.off * p.r * 0.75, by = p.y + p.r * 0.12, br = Math.max(0.7, Math.min(3.2, p.r * (r.major ? 0.16 : 0.1)));
      const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0.1, bx, by, br * 2.4);
      g.addColorStop(0, 'rgba(255,236,160,1)'); g.addColorStop(0.35, 'rgba(240,160,40,0.95)'); g.addColorStop(1, 'rgba(240,160,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br * 2.4, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  function leaf(ctx, x, y, ang, size, color, z, dpr, cx, gy, rib) {
    const c = Math.cos(ang) * size * z * dpr, s = Math.sin(ang) * size * z * dpr;
    ctx.setTransform(c, s, -s, c, (cx + x * z) * dpr, (gy + y * z) * dpr);
    ctx.fillStyle = color; ctx.fill(LEAF);
    if (rib) { ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.05, 0); ctx.lineTo(0.85, 0); ctx.stroke(); }
  }

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
        P.push({ k: 'leaf', x: view.cx + L.x * view.z, y: view.gy + L.y * view.z, vx: (r() - 0.5) * 0.4, vy: 0.3 + r() * 0.5, a: r() * TAU, va: (r() - 0.5) * 0.08, s: L.size * view.z * 0.9, c: hsl(L.h, L.s, L.l), life: 1 });
      } else if (kind === 'snow') {
        P.push({ k: 'snow', x: r() * view.W, y: -5, vx: (r() - 0.5) * 0.3, vy: 0.4 + r() * 0.7, s: 1 + r() * 2, life: 1 });
      } else if (kind === 'fly') {
        P.push({ k: 'fly', x: view.cx + (r() - 0.5) * (scene.bbox.x1 - scene.bbox.x0) * view.z, y: view.gy + (scene.bbox.y0 * r()) * view.z, ph: r() * TAU, life: 1, t: 0 });
      } else if (kind === 'pollen') {
        P.push({ k: 'pollen', x: view.cx + (r() - 0.5) * (scene.bbox.x1 - scene.bbox.x0) * view.z, y: view.gy + scene.bbox.y0 * view.z * r(), vx: (r() - 0.5) * 0.2, vy: -0.1 - r() * 0.2, life: 1 });
      } else if (kind === 'butterfly') {
        P.push({ k: 'bf', x: r() * view.W, y: view.gy - 40 - r() * 160, ph: r() * TAU, h: [200, 45, 320, 28][(r() * 4) | 0], life: 1, dir: r() < 0.5 ? -1 : 1 });
      }
    }
    const nButterflies = Math.min(5, Math.floor(kudos28 / 6));
    for (let i = 0; i < nButterflies; i++) spawn('butterfly');
    return {
      step(ctx, dpr, t) {
        const fallRate = scene.winter ? 0 : clamp((0.55 - scene.season) * 0.5, 0, 0.25) + 0.01;
        if (r() < fallRate) spawn('leaf');
        if (scene.winter && r() < 0.6) spawn('snow');
        if (night && P.filter((p) => p.k === 'fly').length < 14 && r() < 0.05) spawn('fly');
        if (scene.season > 0.85 && r() < 0.06) spawn('pollen');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, view.W, view.H);
        for (let i = P.length - 1; i >= 0; i--) {
          const p = P[i];
          if (p.k === 'leaf') {
            p.x += p.vx + Math.sin(t / 600 + p.a) * 0.4; p.y += p.vy; p.a += p.va;
            if (p.y > view.gy + 2) { p.life -= 0.02; p.vy = 0; p.vx = 0; p.va = 0; }
            const c = Math.cos(p.a) * p.s, s = Math.sin(p.a) * p.s;
            ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, p.x * dpr, p.y * dpr);
            ctx.globalAlpha = clamp(p.life); ctx.fillStyle = p.c; ctx.fill(LEAF);
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

  const api = { prepare, grow, render, Ambient, drawRings, stateAt, woodAt, KIND_LABEL, leafCount, rng, hash, dayIdx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FitTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
