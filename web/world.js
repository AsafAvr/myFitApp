/*!
 * The valley: a hand-drawn world grown from many habits.
 * Every habit is a place on a floating island. Places grow through seven
 * stages from that habit's own persistence, fade and get overgrown when
 * neglected, and trails wear in between habits you keep on the same days.
 */
(function () {
  'use strict';
  const G = window.__GENOME__, FT = window.FitTree;
  const M = FT.prepare(G);
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2, DAY = 86400000;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hsl = (h, s, l, a) => a == null ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)` : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a.toFixed(3)})`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const name = (G.athlete && (G.athlete.first_name || G.athlete.name)) || 'Your';
  const fmtDate = (T, o) => new Date(M.origin + Math.floor(T) * DAY).toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, o || {}));
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const seasonHSL = (s) => FT.geom.interpStops(FT.geom.SEASON_STOPS, clamp(s));
  const TODAY = Math.floor(M.today);

  // ----------------------------------------------------------------- places
  const KINDS = {
    tree: { place: 'The great tree', stages: ['a seed', 'a sprout', 'a sapling', 'a young tree', 'a tree', 'a great tree', 'an ancient tree'] },
    trail: { place: 'The trail', stages: ['a plot to explore', 'a deer track', 'a footpath', 'a stone path', 'a path with a bench', 'a bridge over the brook', 'the old pilgrims’ way'] },
    windmill: { place: 'The windmill', stages: ['a plot to build on', 'a pile of timber', 'a stone base', 'a mill tower', 'a windmill', 'a windmill with a door', 'the great mill'] },
    pond: { place: 'The pond', stages: ['a dry hollow', 'a puddle', 'a pond', 'a pond with reeds', 'a pond with a dock', 'a lake with a boat', 'a lake with an island'] },
    tower: { place: 'The tower', stages: ['a plot of stones', 'a single stone', 'a low wall', 'a watchtower', 'a tall tower', 'a tower with a banner', 'a keep'] },
    garden: { place: 'The garden', stages: ['bare earth', 'raked sand', 'sand and a stone', 'a quiet garden', 'a garden with lanterns', 'a garden with a blossom tree', 'a temple garden'] },
    library: { place: 'The library', stages: ['an empty plot', 'a book', 'a stack of books', 'a reading nook', 'a book cottage', 'a library', 'the grand library'] },
    cairn: { place: 'The cairn', stages: ['an empty plot', 'a pebble', 'two stones', 'three stones', 'a cairn', 'a tall cairn', 'a standing stone'] },
    well: { place: 'The well', stages: ['an empty plot', 'a hole', 'a ring of stones', 'a well', 'a well with a roof', 'a well with a bucket', 'the spring'] },
  };
  const SPORT = { Walk: 'walk', Hike: 'walk', Ride: 'ride', VirtualRide: 'ride', EBikeRide: 'ride', GravelRide: 'ride', MountainBikeRide: 'ride',
    Swim: 'swim', Workout: 'strength', WeightTraining: 'strength', Crossfit: 'strength', Rowing: 'strength', Yoga: 'yoga', Pilates: 'yoga' };
  const BASE = [
    { key: 'run', name: 'Running', kind: 'tree', target: 3, src: 'runs' },
    { key: 'walk', name: 'Walking', kind: 'trail', target: 3, src: 'sport' },
    { key: 'ride', name: 'Cycling', kind: 'windmill', target: 2, src: 'sport' },
    { key: 'swim', name: 'Swimming', kind: 'pond', target: 1, src: 'sport' },
    { key: 'strength', name: 'Strength', kind: 'tower', target: 2, src: 'sport' },
    { key: 'yoga', name: 'Yoga', kind: 'garden', target: 2, src: 'sport' },
    { key: 'read', name: 'Reading', kind: 'library', target: 5, src: 'manual', example: true },
    { key: 'meditate', name: 'Meditation', kind: 'cairn', target: 4, src: 'manual', example: true },
  ];
  const STORE = 'valley:' + ((G.athlete && G.athlete.id) || 'me');
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* private mode: changes last for this visit */ } };
  let store = load();
  store.logs = store.logs || {}; store.custom = store.custom || []; store.off = store.off || {};

  // example logs for the manual habits, so the valley isn't empty on day one
  function exampleDays(key) {
    const r = FT.rng(M.seed + ':ex:' + key), out = [];
    const p = key === 'read' ? 0.62 : 0.42, start = key === 'read' ? 0 : Math.floor(TODAY * 0.35);
    let gap = Math.floor(TODAY * (0.45 + r() * 0.2)), gapLen = 18 + Math.floor(r() * 10);
    for (let d = start; d <= TODAY; d++) {
      if (d >= gap && d < gap + gapLen) continue;
      if (r() < p + (key === 'read' && (d % 7) >= 5 ? 0.2 : 0)) out.push(d);
    }
    return out;
  }
  function habits() {
    const hs = BASE.map((b) => Object.assign({}, b)).concat(store.custom.map((c) => Object.assign({ src: 'manual' }, c)));
    hs.forEach((h) => {
      let days = [];
      if (h.src === 'runs') days = M.runs.map((r) => Math.floor(r.day));
      else if (h.src === 'sport') days = M.others.filter((o) => SPORT[o.sport] === h.key).map((o) => Math.floor(o.day));
      else {
        const own = store.logs[h.key] || [];
        days = h.example && !store.off[h.key] ? exampleDays(h.key).concat(own) : own;
      }
      h.days = [...new Set(days)].sort((a, b) => a - b);
    });
    return hs.filter((h) => h.src !== 'sport' || h.days.length);   // a sport you never did isn't a place yet
  }

  // ------------------------------------------------------------- the metrics
  const w0 = M.weeks.length ? Math.floor(M.weeks[0].day) : 0;
  const weekOf = (d) => Math.floor((d - w0) / 7);
  function metrics(h, T) {
    const days = h.days.filter((d) => d <= T);
    const wNow = weekOf(Math.floor(T));
    const counts = {};
    days.forEach((d) => { const w = weekOf(d); counts[w] = (counts[w] || 0) + 1; });
    const first = days.length ? weekOf(days[0]) : wNow;
    let wood = 0, streak = 0;
    for (let w = first; w <= wNow; w++) {
      const c = counts[w] || 0;
      if (c) streak++; else if (w < wNow) streak = 0;
      wood += Math.min(1, c / h.target) * (1 + 0.06 * Math.min(streak, 10));
    }
    const TH = [0.01, 1.2, 4, 9, 17, 28, 44];
    let stage = 0; TH.forEach((t, i) => { if (wood >= t) stage = i; });
    if (!days.length) stage = 0; else stage = Math.max(1, stage);
    const last = days.length ? days[days.length - 1] : -1e9;
    const dormant = Math.floor(T) - last;
    const recent = days.filter((d) => d > T - 14).length;
    const vit = days.length ? clamp(recent / (h.target * 2)) * (dormant > 21 ? 0 : 1) : 0;
    const spark = []; for (let w = wNow - 11; w <= wNow; w++) spark.push(counts[w] || 0);
    return { wood, stage, dormant, vit, streak, thisWeek: counts[wNow] || 0, spark, total: days.length, today: days.includes(Math.floor(T)),
      week7: days.filter((d) => d > T - 7).length, next: TH[stage + 1], neglected: days.length > 0 && dormant > 21 };
  }

  // ------------------------------------------------------------- pencil kit
  function pen(x, pts, rnd, col, w, jit, alpha, passes = 2) {
    for (let p = 0; p < passes; p++) {
      x.beginPath();
      pts.forEach((q, i) => { const X = q[0] + (rnd() - 0.5) * jit, Y = q[1] + (rnd() - 0.5) * jit; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.strokeStyle = col; x.globalAlpha = alpha * (0.6 + rnd() * 0.4); x.lineWidth = w * (0.75 + rnd() * 0.5); x.stroke();
    }
    x.globalAlpha = 1;
  }
  function hatch(x, poly, rnd, ang, gap, col, w, alpha) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    poly.forEach(([a, b]) => { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); });
    x.save(); x.beginPath(); poly.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
    const c = Math.cos(ang), s = Math.sin(ang), diag = Math.hypot(x1 - x0, y1 - y0) + 4, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    x.strokeStyle = col; x.lineWidth = w;
    for (let d = -diag / 2; d < diag / 2; d += gap * (0.8 + rnd() * 0.4)) {
      x.globalAlpha = alpha * (0.55 + rnd() * 0.45);
      x.beginPath(); x.moveTo(mx - c * diag / 2 - s * d + (rnd() - 0.5) * 2, my - s * diag / 2 + c * d); x.lineTo(mx + c * diag / 2 - s * d, my + s * diag / 2 + c * d + (rnd() - 0.5) * 2); x.stroke();
    }
    x.restore(); x.globalAlpha = 1;
  }
  const ell = (cx, cy, rx, ry, n = 24, a0 = 0, a1 = TAU) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const rect = (a, b, w, h) => [[a, b], [a + w, b], [a + w, b + h], [a, b + h], [a, b]];
  const INK = 'rgba(46,34,24,0.9)';
  // colours fade toward grey when a place is neglected
  const tint = (h, s, l, vit) => hsl(h, s * (0.25 + 0.75 * vit), lerp(62, l, 0.35 + 0.65 * vit));

  // ------------------------------------------------------------- state
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d'), tip = $('tip');
  let W = 0, Hh = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  let T = M.today, HS = [], places = [], frames = [], fi = 0, lastBoil = 0, walkers = [], sel = null, isl = null, S = null, overall = 0.5;

  $('lede').textContent = `Every habit is a place in ${name === 'Your' ? 'your' : name + '’s'} valley. Keep a habit and its place grows through seven stages; let it slip and it fades and gets overgrown. Trails wear in between habits you keep on the same days, and the little folk walking them are this week’s check-ins.`;
  $('title').textContent = name === 'Your' ? 'Your valley' : `${name}’s valley`;

  function build() {
    if (!W) return;
    HS = habits();
    HS.forEach((h) => (h.m = metrics(h, T)));
    S = FT.grow(M, T);
    const act = HS.filter((h) => h.m.total);
    overall = act.length ? act.reduce((a, h) => a + h.m.vit, 0) / act.length : 0;
    layout();
    frames = [0, 1, 2].map((i) => drawStatic(i));
    walkers = makeWalkers();
    renderList();
  }

  function layout() {
    const sumStage = HS.reduce((a, h) => a + h.m.stage, 0);
    const rx = W * (0.36 + 0.07 * clamp(sumStage / 30)), ry = rx * 0.6;
    const cx = W * 0.5, cy = Hh * 0.5;
    const r = FT.rng(M.seed + ':island');
    const harm = [1, 2, 3, 5].map((k) => [k, r() * TAU, (0.04 + r() * 0.05) / Math.sqrt(k)]);
    const edge = (a) => 1 + harm.reduce((s, [k, p, amp]) => s + Math.sin(a * k + p) * amp, 0);
    isl = { cx, cy, rx, ry, edge, depth: ry * 0.5 };
    const others = HS.filter((h) => h.kind !== 'tree');
    places = [];
    const tree = HS.find((h) => h.kind === 'tree');
    if (tree) places.push({ h: tree, x: cx, y: cy - ry * 0.08, s: 1 });
    // places in slots around the tree (never hidden behind it), then nudged apart by size
    const SLOTS = [0.28, 0.72, 0.02, 0.98, 1.2, 1.8, 0.5, 0.15, 0.85, 1.1, 1.9, 0.38, 0.62].map((f) => f * Math.PI);
    others.forEach((h, i) => {
      const a = SLOTS[i % SLOTS.length], rr = i < SLOTS.length ? 0.7 : 0.45;
      places.push({ h, x: cx + Math.cos(a) * rx * rr, y: cy + Math.sin(a) * ry * rr * 0.95 + ry * 0.08, s: 1 });
    });
    places.forEach((p) => {
      const st = p.h.m.stage, u0 = W * 0.013 * (0.8 + 0.07 * st);
      p.u = u0;
      p.rad = p.h.kind === 'tree' ? W * 0.11 : p.h.kind === 'pond' ? u0 * (2 + st * 1.2) : p.h.kind === 'trail' ? u0 * 4 : u0 * 4.6;
    });
    for (let it = 0; it < 60; it++) places.forEach((p, i) => places.forEach((q, j) => {
      if (i >= j) return;
      const dx = q.x - p.x, dy = (q.y - p.y) * 1.7, d = Math.hypot(dx, dy), min = p.rad + q.rad + W * 0.03;
      if (d < min && d > 0.01) {
        const f = (min - d) / d * 0.25;
        if (p.h.kind !== 'tree') { p.x -= dx * f; p.y -= dy * f / 1.6; }
        if (q.h.kind !== 'tree') { q.x += dx * f; q.y += dy * f / 1.6; }
      }
    }));
    places.forEach((p) => {        // stay on the island
      const dx = (p.x - cx) / (rx * 0.8), dy = (p.y - cy) / (ry * 0.78), d = Math.hypot(dx, dy);
      if (d > 1) { p.x = cx + dx / d * rx * 0.8; p.y = cy + dy / d * ry * 0.78; }
    });
  }

  // -------------------------------------------------------------- static drawing
  function drawStatic(i) {
    const c = mk(W * dpr, Hh * dpr), x = c.getContext('2d'), rnd = FT.rng('valley' + i);
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round';
    paperBg(x);
    x.globalCompositeOperation = 'multiply';
    clouds(x, rnd);
    island(x, rnd);
    trails(x, rnd);
    places.slice().sort((a, b) => a.y - b.y).forEach((p) => { drawPlace(x, rnd, p); });
    x.globalCompositeOperation = 'source-over';
    const taken = [];
    places.slice().sort((a, b) => b.y - a.y).forEach((p) => label(x, p, taken));
    return c;
  }
  let paperC = null;
  function paperBg(x) {
    if (!paperC || paperC.width !== Math.round(W * dpr)) {
      paperC = mk(W * dpr, Hh * dpr); const p = paperC.getContext('2d'); p.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = p.createRadialGradient(W * 0.5, Hh * 0.45, W * 0.1, W * 0.5, Hh * 0.5, W * 0.85);
      g.addColorStop(0, '#f8f2e0'); g.addColorStop(1, '#e3d4b0'); p.fillStyle = g; p.fillRect(0, 0, W, Hh);
      const r = FT.rng('vpaper'); for (let i = 0; i < 2600; i++) { p.fillStyle = r() < 0.5 ? `rgba(120,95,60,${r() * 0.07})` : `rgba(255,255,255,${r() * 0.2})`; p.fillRect(r() * W, r() * Hh, 1 + r() * 2, 0.6); }
    }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(paperC, 0, 0); x.restore();
  }
  function clouds(x, rnd) {
    const r = FT.rng('vclouds');
    for (let i = 0; i < 5; i++) {
      const cx = r() * W, cy = r() < 0.5 ? Hh * (0.06 + r() * 0.1) : Hh * (0.86 + r() * 0.08), w = W * (0.08 + r() * 0.1);
      for (let k = 0; k < 4; k++) pen(x, ell(cx + (k - 1.5) * w * 0.35, cy - Math.sin(k) * w * 0.08, w * 0.28, w * 0.16, 14, Math.PI, TAU), rnd, 'rgba(120,140,160,0.5)', 0.8, 0.8, 0.6, 1);
      pen(x, [[cx - w * 0.75, cy], [cx + w * 0.75, cy]], rnd, 'rgba(120,140,160,0.45)', 0.8, 0.8, 0.6, 1);
    }
  }
  function island(x, rnd) {
    const { cx, cy, rx, ry, edge, depth } = isl;
    const top = [], N = 90;
    for (let i = 0; i <= N; i++) { const a = i / N * TAU, e = edge(a); top.push([cx + Math.cos(a) * rx * e, cy + Math.sin(a) * ry * e]); }
    // earth underneath, with roots hanging into the air
    const front = top.filter(([, y]) => y >= cy - 2).sort((a, b) => a[0] - b[0]);
    const r = FT.rng('vroots');
    const under = front.map(([X, Y]) => { const t = (X - (cx - rx)) / (2 * rx); return [X, Y + depth * Math.sin(Math.PI * clamp(t)) * (0.75 + r() * 0.15) + 4]; });
    const earth = front.concat(under.slice().reverse());
    hatch(x, earth, rnd, 0.9, 2.6, 'rgba(120,82,48,0.9)', 0.8, 0.75);
    hatch(x, earth, rnd, -0.8, 4, 'rgba(70,48,30,0.9)', 0.7, 0.35);
    for (let k = 1; k < 4; k++) pen(x, front.map(([X, Y], i) => [X, lerp(Y, under[i][1], k / 4) + Math.sin(X / 23 + k) * 2]), rnd, 'rgba(90,60,35,0.45)', 0.7, 0.6, 0.6, 1);
    pen(x, under, rnd, INK, 1.2, 1, 0.9);
    for (let i = 0; i < 9; i++) {
      const j = Math.floor(r() * under.length), [X, Y] = under[j], L = depth * (0.4 + r() * 0.7);
      const pts = []; for (let k = 0; k <= 6; k++) pts.push([X + Math.sin(k * 0.9 + i) * 4, Y - 2 + L * k / 6]);
      pen(x, pts, rnd, 'rgba(100,70,40,0.75)', 1, 0.6, 0.75, 1);
    }
    // grass on top, coloured by how your habits are going overall
    const [gh, gs, gl] = seasonHSL(0.25 + overall * 0.75);
    hatch(x, top, rnd, 0.35, 2.8, hsl(gh, Math.min(70, gs * 1.05), gl + 12), 1.2, 0.6);
    hatch(x, top, rnd, -0.5, 4.5, hsl(gh + 8, gs * 0.8, gl), 0.9, 0.35);
    pen(x, top, rnd, INK, 1.4, 1.2, 0.9);
    for (let i = 0; i < 160; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.93, X = cx + Math.cos(a) * rx * d * edge(a), Y = cy + Math.sin(a) * ry * d * edge(a);
      pen(x, [[X, Y], [X + (r() - 0.5) * 3, Y - 3 - r() * 4]], rnd, hsl(gh, gs * 0.7, gl * 0.8), 0.8, 0.3, 0.7, 1);
    }
  }
  // trails: every place connects home to the tree; habits kept on the same days wear a path between them
  function trails(x, rnd) {
    const tree = places.find((p) => p.h.kind === 'tree');
    const link = (a, b, wgt, home) => {
      const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.15, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.08;
      const pts = []; for (let k = 0; k <= 18; k++) { const t = k / 18; pts.push([(1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x, (1 - t) * (1 - t) * (a.y + 3) + 2 * (1 - t) * t * my + t * t * (b.y + 3)]); }
      const w = home ? 1.6 : 1.4 + Math.min(3, wgt) * 0.8;
      pen(x, pts, rnd, home ? 'rgba(232,214,170,0.85)' : 'rgba(222,196,145,0.95)', w * 2, 0.5, 0.8, 1);
      if (!home) { pen(x, pts.map(([X, Y]) => [X, Y - w]), rnd, 'rgba(120,90,55,0.5)', 0.6, 0.6, 0.55, 1); pen(x, pts.map(([X, Y]) => [X, Y + w]), rnd, 'rgba(120,90,55,0.5)', 0.6, 0.6, 0.55, 1); }
      return pts;
    };
    isl.paths = [];
    places.forEach((p) => { if (tree && p !== tree && p.h.m.total) isl.paths.push({ a: tree, b: p, pts: link(tree, p, 0, true) }); });
    const pairs = [];
    for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
      const a = places[i], b = places[j];
      if (a.h.kind === 'tree' || b.h.kind === 'tree') continue;
      const set = new Set(a.h.days.filter((d) => d <= T && d > T - 120));
      const both = b.h.days.filter((d) => set.has(d)).length;
      if (both >= 4) pairs.push({ a, b, both });
    }
    pairs.sort((p, q) => q.both - p.both).slice(0, 4).forEach((p) => isl.paths.push(Object.assign(p, { pts: link(p.a, p.b, Math.log2(p.both)) })));
  }

  function label(x, p, taken) {
    const h = p.h, k = KINDS[h.kind], fs = Math.max(13, Math.round(W * 0.026));
    x.font = `700 ${fs}px Caveat, cursive`; x.textAlign = 'center';
    const txt = h.name, tw = x.measureText(txt).width + 10, X = p.x;
    let Y = p.y + p.u * 1.6 + fs * 0.9;
    const clash = (y) => taken.some((r) => Math.abs(r.x - X) < (r.w + tw) / 2 && Math.abs(r.y - y) < fs * 1.05);
    for (let k2 = 0; k2 < 6 && clash(Y); k2++) Y += fs * 0.95;
    taken.push({ x: X, y: Y, w: tw });
    x.fillStyle = 'rgba(247,240,221,0.85)'; x.fillRect(X - tw / 2, Y - fs * 0.85, tw, fs * 1.1);
    x.fillStyle = h.m.neglected ? 'rgba(120,105,90,0.9)' : 'rgba(70,45,25,0.95)'; x.fillText(txt, X, Y);
    p.hit = { x: X, y: p.y - p.u * 3, r: Math.max(p.u * 5, 26) };
    void k;
  }

  // ------------------------------------------------------------- the places
  function drawPlace(x, rnd, p) {
    const h = p.h, m = h.m, u = p.u, X = p.x, Y = p.y, v = Math.max(0.15, m.vit);
    // a little shadow
    hatch(x, ell(X, Y + u * 0.3, u * 4.5, u * 1.1, 16), rnd, 0.2, 2.5, 'rgba(80,90,60,0.8)', 0.7, 0.35);
    if (m.stage === 0 && h.kind !== 'tree') return plot(x, rnd, p);
    ({ tree: drawTree, trail: drawTrail, windmill: drawMill, pond: drawPond, tower: drawTower, garden: drawGarden, library: drawLibrary, cairn: drawCairn, well: drawWell }[h.kind] || drawCairn)(x, rnd, X, Y, u, m.stage, v, p);
    if (m.neglected) {        // overgrown: scribbled weeds and a cobweb
      for (let i = 0; i < 18; i++) { const a = rnd() * TAU, d = u * (2 + rnd() * 3), wx = X + Math.cos(a) * d, wy = Y + Math.sin(a) * d * 0.35; pen(x, [[wx, wy], [wx + (rnd() - 0.5) * 6, wy - 4 - rnd() * 8], [wx + (rnd() - 0.5) * 6, wy - 8 - rnd() * 6]], rnd, 'rgba(110,120,80,0.8)', 0.8, 1, 0.75, 1); }
      const cx = X + u * 2, cy = Y - u * 5;
      for (let k = 0; k < 5; k++) pen(x, [[cx, cy], [cx + Math.cos(k * 0.6) * u * 2.5, cy + Math.sin(k * 0.6) * u * 2.5]], rnd, 'rgba(120,120,120,0.55)', 0.5, 0.3, 0.6, 1);
    }
  }
  function plot(x, rnd, p) {
    const { x: X, y: Y, u } = p;
    pen(x, ell(X, Y, u * 3.5, u * 1.1, 20), rnd, 'rgba(110,85,55,0.6)', 0.8, 0.8, 0.6, 1);
    pen(x, [[X, Y], [X, Y - u * 4]], rnd, 'rgba(110,80,45,0.9)', 1.2, 0.4, 0.9, 1);
    pen(x, rect(X, Y - u * 4, u * 3, u * 1.6), rnd, 'rgba(110,80,45,0.9)', 0.9, 0.4, 0.9, 1);
  }
  function drawTree(x, rnd, X, Y, u, stage, v) {
    if (!S || !S.runsN) { pen(x, ell(X, Y - u * 0.6, u * 1.6, u * 0.8, 12, Math.PI, TAU), rnd, 'rgba(110,80,45,0.9)', 1, 0.5, 0.9); return; }
    const bb = S.bbox, hgt = W * (0.1 + 0.035 * stage), k = Math.min(hgt / (-bb.y0 + 10), W * 0.3 / (bb.x1 - bb.x0 + 10));
    const P = (a, b) => [X + a * k, Y + b * k];
    const [tl, tr] = FT.geom.outline(S.trunk);
    const tp = [...tl, ...tr.slice().reverse()].map(([a, b]) => P(a, b));
    hatch(x, tp, rnd, 1.1, 2.2, 'rgba(110,72,42,0.95)', 0.8, 0.8);
    pen(x, tl.map(([a, b]) => P(a, b)), rnd, INK, 1.2, 0.8, 0.9); pen(x, tr.map(([a, b]) => P(a, b)), rnd, INK, 1.2, 0.8, 0.9);
    S.limbs.forEach((l) => pen(x, l.pts.map((q) => P(q.x, q.y)), rnd, 'rgba(80,55,35,0.85)', Math.max(1, l.pts[0].r * k * 1.3), 0.8, 0.75));
    S.branches.forEach((b) => pen(x, b.pts.map((q) => P(q.x, q.y)), rnd, 'rgba(80,55,35,0.8)', Math.max(0.6, b.pts[0].r * k), 0.6, 0.6, 1));
    S.leaves.forEach((L) => {
      if (rnd() < 0.45) return;
      const [lx, ly] = P(L.x, L.y), len = Math.max(3, L.size * k * 1.4), a = L.ang;
      x.globalAlpha = 0.55; x.strokeStyle = tint(L.h, L.s * 0.85, Math.min(66, L.l + 16), v); x.lineWidth = Math.max(1.4, len * 0.35);
      x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx + Math.cos(a) * len, ly + Math.sin(a) * len); x.stroke();
    });
    x.globalAlpha = 1;
    S.fruits.forEach((f) => { const [fx, fy] = P(f.x, f.y + f.stem + f.size), col = { easy: 352, long: 8, tempo: 32, hill: 272, race: 44 }[f.kind]; hatch(x, ell(fx, fy, 2.6, 2.6, 8), rnd, 0.8, 1, hsl(col, 75, 50), 0.9, 0.9); });
  }
  function drawTrail(x, rnd, X, Y, u, stage, v, p) {
    const len = u * (4 + stage * 2.6), dir = p.x < isl.cx ? 1 : -1, pts = [];
    for (let k = 0; k <= 12; k++) {      // the path winds along the island, never off its edge
      const t = k / 12; let px = X + dir * t * len, py = Y + Math.sin(t * 5) * u * 1.4 - t * u * 1.5;
      const dx = (px - isl.cx) / (isl.rx * 0.86), dy = (py - isl.cy) / (isl.ry * 0.84), d = Math.hypot(dx, dy);
      if (d > 1) { px = isl.cx + dx / d * isl.rx * 0.86; py = isl.cy + dy / d * isl.ry * 0.84; }
      pts.push([px, py]);
    }
    pen(x, pts, rnd, tint(38, 45, 72, v), u * (0.8 + stage * 0.15), 0.6, 0.85, 1);
    pen(x, pts.map(([a, b]) => [a, b - u * 0.5]), rnd, INK, 0.6, 0.6, 0.55, 1);
    for (let s = 0; s < stage; s++) { const q = pts[Math.min(12, 2 + s * 2)]; pen(x, ell(q[0], q[1] - u * 0.8, u * 0.6, u * 0.4, 8), rnd, 'rgba(110,110,105,0.9)', 0.8, 0.4, 0.85, 1); }
    if (stage >= 4) { const [bx, by] = pts[4]; pen(x, [[bx - u * 1.8, by - u * 1.6], [bx + u * 1.8, by - u * 1.6]], rnd, 'rgba(120,80,45,0.95)', 1.6, 0.4, 0.9, 1); pen(x, [[bx - u * 1.5, by - u * 1.6], [bx - u * 1.5, by - u * 0.3]], rnd, INK, 0.8, 0.3, 0.9, 1); pen(x, [[bx + u * 1.5, by - u * 1.6], [bx + u * 1.5, by - u * 0.3]], rnd, INK, 0.8, 0.3, 0.9, 1); }
    if (stage >= 5) { const [bx, by] = pts[9]; pen(x, ell(bx, by + u * 0.4, u * 2.4, u * 1.6, 14, Math.PI, TAU), rnd, 'rgba(120,80,45,0.95)', 1.4, 0.4, 0.9); pen(x, [[bx - u * 3, by + u * 1.5], [bx + u * 3, by + u * 1.5]], rnd, tint(205, 60, 60, v), 1.6, 0.6, 0.8, 1); }
    pen(x, [[X, Y], [X, Y - u * 5]], rnd, 'rgba(110,80,45,0.95)', 1.3, 0.3, 0.9, 1);
    pen(x, [[X, Y - u * 4.6], [X + dir * u * 3, Y - u * 4.3], [X, Y - u * 3.8]], rnd, 'rgba(110,80,45,0.95)', 1, 0.3, 0.9, 1);
  }
  function drawMill(x, rnd, X, Y, u, stage, v, p) {
    if (stage <= 1) { for (let i = 0; i < 5; i++) pen(x, [[X - u * 2.5 + i * u * 0.3, Y - i * u * 0.5], [X + u * 2.5 - i * u * 0.2, Y - i * u * 0.5 - u * 0.2]], rnd, 'rgba(130,90,50,0.95)', 1.4, 0.4, 0.9, 1); return; }
    const hgt = u * (2 + stage * 2.2), bw = u * 2.6, tw = u * 1.6;
    const body = [[X - bw, Y], [X - tw, Y - hgt], [X + tw, Y - hgt], [X + bw, Y], [X - bw, Y]];
    hatch(x, body, rnd, 0.3, 2, tint(30, 25, 82, v), 0.8, 0.6);
    hatch(x, [[X, Y], [X, Y - hgt], [X + tw, Y - hgt], [X + bw, Y]], rnd, -0.9, 2.6, 'rgba(90,70,50,0.8)', 0.7, 0.4);
    pen(x, body, rnd, INK, 1.1, 0.7, 0.9);
    if (stage >= 3) { const cap = ell(X, Y - hgt, tw * 1.3, u * 1.5, 12, Math.PI, TAU); hatch(x, cap.concat([[X - tw * 1.3, Y - hgt]]), rnd, 0.8, 1.6, tint(8, 55, 45, v), 0.8, 0.8); pen(x, cap, rnd, INK, 1, 0.5, 0.9); }
    if (stage >= 5) pen(x, rect(X - u * 0.7, Y - u * 2.4, u * 1.4, u * 2.4), rnd, INK, 0.9, 0.4, 0.9, 1);
    if (stage >= 6) { pen(x, [[X, Y - hgt - u * 1.5], [X, Y - hgt - u * 4]], rnd, INK, 0.8, 0.3, 0.9, 1); }
    p.hub = stage >= 3 ? [X, Y - hgt + u * 0.4] : null; p.sail = u * (2.8 + stage * 0.5);
  }
  function drawPond(x, rnd, X, Y, u, stage, v, p) {
    const rx = u * (2 + stage * 1.2), ry = rx * 0.38;
    const water = ell(X, Y - ry * 0.2, rx, ry, 28);
    hatch(x, water, rnd, 0.05, 1.8, tint(205, 55, 62, v), 0.9, 0.85);
    hatch(x, water, rnd, 0.05, 4.5, 'rgba(40,80,120,0.8)', 0.6, 0.3);
    pen(x, water, rnd, INK, 1, 0.8, 0.85);
    if (stage >= 3) for (let i = 0; i < 6; i++) { const a = -0.3 - i * 0.25, qx = X + Math.cos(a) * rx, qy = Y - ry * 0.2 + Math.sin(a) * ry; pen(x, [[qx, qy], [qx + (rnd() - 0.5) * 2, qy - u * (1.5 + rnd())]], rnd, tint(95, 40, 38, v), 0.9, 0.3, 0.9, 1); }
    if (stage >= 4) { const dx = X - rx * 0.9; pen(x, [[dx, Y - ry * 0.2], [dx + rx * 0.45, Y - ry * 0.25]], rnd, 'rgba(120,80,45,0.95)', u * 0.7, 0.3, 0.9, 1); }
    if (stage >= 6) { hatch(x, ell(X + rx * 0.25, Y - ry * 0.35, rx * 0.16, ry * 0.3, 12), rnd, 0.8, 1.4, tint(100, 40, 40, v), 0.8, 0.9); }
    p.water = { x: X, y: Y - ry * 0.2, rx, ry, boat: stage >= 5 };
  }
  function drawTower(x, rnd, X, Y, u, stage, v, p) {
    const floors = Math.max(1, stage - 1), fh = u * 1.9, w = u * 2.4;
    for (let f = 0; f < floors; f++) {
      const y = Y - f * fh, ww = w * (1 - f * 0.03);
      const r = rect(X - ww, y - fh, ww * 2, fh);
      hatch(x, r, rnd, 0.2, 2.2, tint(35, 12, 70, v), 0.8, 0.55);
      pen(x, r, rnd, INK, 0.9, 0.5, 0.85, 1);
      for (let k = 0; k < 3; k++) pen(x, [[X - ww + (k + (f % 2) * 0.5) * ww * 0.66, y - fh], [X - ww + (k + (f % 2) * 0.5) * ww * 0.66, y]], rnd, 'rgba(80,70,60,0.6)', 0.6, 0.3, 0.6, 1);
    }
    const ty = Y - floors * fh;
    if (stage >= 3) for (let k = -2; k <= 2; k++) pen(x, rect(X + k * w * 0.4 - w * 0.13, ty - u * 0.9, w * 0.26, u * 0.9), rnd, INK, 0.8, 0.3, 0.85, 1);
    if (stage >= 4) pen(x, rect(X - u * 0.4, Y - floors * fh * 0.6, u * 0.8, u * 1.2), rnd, INK, 0.8, 0.3, 0.85, 1);
    p.flag = stage >= 5 ? [X, ty - u * 0.9] : null;
  }
  function drawGarden(x, rnd, X, Y, u, stage, v, p) {
    const rx = u * (2.5 + stage * 0.9), ry = rx * 0.36;
    hatch(x, ell(X, Y - ry * 0.3, rx, ry, 24), rnd, 0.1, 3, tint(42, 35, 80, v), 0.8, 0.5);
    for (let k = 1; k <= Math.min(5, stage + 1); k++) pen(x, ell(X, Y - ry * 0.3, rx * k / 6, ry * k / 6, 22), rnd, 'rgba(140,120,90,0.6)', 0.6, 0.3, 0.6, 1);
    pen(x, ell(X, Y - ry * 0.3, rx, ry, 24), rnd, INK, 0.9, 0.5, 0.8, 1);
    if (stage >= 2) hatch(x, ell(X + rx * 0.2, Y - ry * 0.45, u * 1.1, u * 0.7, 10), rnd, 0.8, 1.3, 'rgba(90,90,90,0.9)', 0.8, 0.9);
    p.lanterns = [];
    if (stage >= 4) [-0.65, 0.65].forEach((s) => { const lx = X + s * rx, ly = Y - ry * 0.3; pen(x, [[lx, ly], [lx, ly - u * 2.6]], rnd, INK, 0.9, 0.3, 0.9, 1); pen(x, rect(lx - u * 0.6, ly - u * 3.6, u * 1.2, u * 1.1), rnd, INK, 0.8, 0.3, 0.9, 1); p.lanterns.push([lx, ly - u * 3.05]); });
    if (stage >= 5) { const bx = X - rx * 0.35, by = Y - ry * 0.6; pen(x, [[bx, by], [bx - u * 0.4, by - u * 3.5]], rnd, 'rgba(100,70,45,0.95)', 1.2, 0.4, 0.9, 1); for (let i = 0; i < 16; i++) { const a = rnd() * TAU, d = rnd() * u * 2; hatch(x, ell(bx - u * 0.4 + Math.cos(a) * d, by - u * 4.2 + Math.sin(a) * d * 0.7, u * 0.6, u * 0.5, 8), rnd, 0.5, 1, tint(335, 65, 78, v), 0.8, 0.85); } }
  }
  function drawLibrary(x, rnd, X, Y, u, stage, v, p) {
    if (stage <= 3) {
      for (let b = 0; b < stage * 2; b++) { const by = Y - b * u * 0.7, bw = u * (2 + (b % 3) * 0.3); hatch(x, rect(X - bw / 2 + (b % 2) * u * 0.3, by - u * 0.7, bw, u * 0.7), rnd, 1.3, 1.2, tint([0, 140, 212, 36][b % 4], 50, 50, v), 0.8, 0.85); pen(x, rect(X - bw / 2 + (b % 2) * u * 0.3, by - u * 0.7, bw, u * 0.7), rnd, INK, 0.7, 0.3, 0.8, 1); }
      if (stage === 3) { pen(x, ell(X + u * 2.4, Y - u * 0.8, u * 0.9, u * 0.6, 10), rnd, 'rgba(160,70,50,0.9)', 1, 0.4, 0.9, 1); }
      p.chimney = null; return;
    }
    const w = u * (3 + (stage - 4) * 0.8), hgt = u * (3.2 + (stage - 4) * 1.2);
    const wall = rect(X - w, Y - hgt, w * 2, hgt);
    hatch(x, wall, rnd, 0.3, 2.4, tint(40, 30, 78, v), 0.8, 0.55); pen(x, wall, rnd, INK, 1, 0.5, 0.9, 1);
    const roof = [[X - w - u * 0.6, Y - hgt], [X, Y - hgt - u * 3], [X + w + u * 0.6, Y - hgt], [X - w - u * 0.6, Y - hgt]];
    hatch(x, roof, rnd, 0.9, 1.6, tint(8, 55, 45, v), 0.8, 0.85); pen(x, roof, rnd, INK, 1, 0.5, 0.9, 1);
    for (let k = -1; k <= 1; k += 2) { const wr = rect(X + k * w * 0.5 - u * 0.6, Y - hgt * 0.75, u * 1.2, u * 1.2); hatch(x, wr, rnd, 0.8, 1.2, 'rgba(230,170,70,0.9)', 0.8, 0.7 * v + 0.2); pen(x, wr, rnd, INK, 0.7, 0.3, 0.9, 1); }
    pen(x, rect(X - u * 0.6, Y - u * 1.8, u * 1.2, u * 1.8), rnd, INK, 0.8, 0.3, 0.9, 1);
    const cxh = X + w * 0.5; pen(x, rect(cxh - u * 0.4, Y - hgt - u * 2.2, u * 0.8, u * 1.6), rnd, INK, 0.8, 0.3, 0.9, 1);
    if (stage >= 6) { pen(x, rect(X - w - u * 1.6, Y - hgt - u * 2, u * 1.8, hgt + u * 2), rnd, INK, 1, 0.4, 0.9, 1); }
    p.chimney = [cxh, Y - hgt - u * 2.2];
  }
  function drawCairn(x, rnd, X, Y, u, stage, v, p) {
    let y = Y;
    for (let s = 0; s < Math.max(1, stage - (stage >= 6 ? 1 : 0)); s++) {
      const rx = u * (1.8 - s * 0.22), ry = u * (0.8 - s * 0.06);
      const st = ell(X + (s % 2 ? 0.3 : -0.3) * u, y - ry, rx, ry, 14);
      hatch(x, st, rnd, 0.6, 1.4, tint(30, 10, 60 + s * 3, v), 0.8, 0.75); pen(x, st, rnd, INK, 0.9, 0.4, 0.9, 1);
      y -= ry * 1.7;
    }
    if (stage >= 6) { const r = rect(X - u * 0.7, y - u * 4, u * 1.4, u * 4); hatch(x, r, rnd, 0.3, 1.5, tint(30, 10, 55, v), 0.8, 0.75); pen(x, r, rnd, INK, 1, 0.4, 0.9, 1); y -= u * 4; }
    p.top = [X, y];
  }
  function drawWell(x, rnd, X, Y, u, stage, v, p) {
    const rx = u * 2.2, ry = u * 0.9;
    if (stage >= 2) { hatch(x, ell(X, Y - ry, rx, ry, 16), rnd, 0.4, 1.4, tint(30, 10, 62, v), 0.8, 0.7); pen(x, ell(X, Y - ry, rx, ry, 16), rnd, INK, 1, 0.4, 0.9, 1); }
    if (stage >= 3) hatch(x, ell(X, Y - ry, rx * 0.7, ry * 0.6, 14), rnd, 0, 1.4, tint(205, 50, 40, v), 0.8, 0.9);
    if (stage >= 4) { [-1, 1].forEach((s) => pen(x, [[X + s * rx * 0.9, Y - ry], [X + s * rx * 0.9, Y - u * 5]], rnd, INK, 1, 0.3, 0.9, 1)); const roof = [[X - rx * 1.3, Y - u * 5], [X, Y - u * 6.8], [X + rx * 1.3, Y - u * 5], [X - rx * 1.3, Y - u * 5]]; hatch(x, roof, rnd, 0.9, 1.6, tint(8, 55, 45, v), 0.8, 0.85); pen(x, roof, rnd, INK, 1, 0.4, 0.9, 1); }
    p.bucket = stage >= 5 ? [X, Y - u * 4.8] : null;
  }

  // ------------------------------------------------------------- the living layer
  function makeWalkers() {
    const W2 = [], paths = (isl.paths || []).filter((q) => q.pts);
    if (!paths.length) return W2;
    const week = HS.reduce((a, h) => a + h.m.week7, 0);
    const n = Math.min(16, Math.max(HS.some((h) => h.m.total && h.m.dormant < 30) ? 1 : 0, week));
    for (let i = 0; i < n; i++) W2.push({ path: paths[i % paths.length], t: (i * 0.37) % 1, dir: i % 2 ? 1 : -1, sp: 0.04 + (i % 5) * 0.008 });
    return W2;
  }
  function seedling(x, X, Y, s, step, face) {
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(60,45,30,0.95)'; x.lineWidth = Math.max(0.8, s * 0.12);
    const k = step ? 0.4 : -0.4;
    x.beginPath(); x.moveTo(X - s * 0.18, Y - s * 0.35); x.lineTo(X - s * 0.18 + k * s * 0.4, Y); x.moveTo(X + s * 0.18, Y - s * 0.35); x.lineTo(X + s * 0.18 - k * s * 0.4, Y); x.stroke();
    x.fillStyle = '#f2e6c8'; x.lineWidth = Math.max(0.8, s * 0.08);
    x.beginPath(); x.ellipse(X, Y - s * 0.72, s * 0.5, s * 0.46, 0, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = 'rgba(40,30,20,0.95)'; x.beginPath(); x.arc(X + face * s * 0.1, Y - s * 0.8, s * 0.06, 0, TAU); x.arc(X + face * s * 0.28, Y - s * 0.8, s * 0.06, 0, TAU); x.fill();
    x.fillStyle = 'hsl(100 45% 45%)';
    x.beginPath(); x.ellipse(X - s * 0.15, Y - s * 1.32, s * 0.2, s * 0.09, -0.5, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(X + s * 0.15, Y - s * 1.34, s * 0.2, s * 0.09, 0.5, 0, TAU); x.fill();
  }
  function live(t) {
    const x = ctx, ts = t / 1000, twos = Math.floor(t / 83) % 2;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    places.forEach((p) => {
      const m = p.h.m, v = Math.max(0.1, m.vit), u = p.u;
      if (p.hub) {          // windmill sails turn with your recent rides
        const a = (m.neglected ? 0.3 : ts * (0.15 + 1.4 * m.vit)) % TAU;
        x.strokeStyle = INK; x.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          const b = a + k * Math.PI / 2, ex = p.hub[0] + Math.cos(b) * p.sail, ey = p.hub[1] + Math.sin(b) * p.sail;
          x.beginPath(); x.moveTo(p.hub[0], p.hub[1]); x.lineTo(ex, ey); x.stroke();
          const nx = -Math.sin(b) * u * 0.9, ny = Math.cos(b) * u * 0.9;
          x.fillStyle = tint(40, 30, 85, v); x.beginPath(); x.moveTo(p.hub[0] + Math.cos(b) * p.sail * 0.25, p.hub[1] + Math.sin(b) * p.sail * 0.25);
          x.lineTo(ex, ey); x.lineTo(ex + nx, ey + ny); x.lineTo(p.hub[0] + Math.cos(b) * p.sail * 0.25 + nx, p.hub[1] + Math.sin(b) * p.sail * 0.25 + ny); x.closePath(); x.fill(); x.stroke();
        }
        x.fillStyle = INK; x.beginPath(); x.arc(p.hub[0], p.hub[1], 1.8, 0, TAU); x.fill();
      }
      if (p.water) {        // ripples, and a boat once the pond is a lake
        const w = p.water, rings = 1 + Math.min(3, m.week7);
        for (let i = 0; i < rings; i++) {
          const ph = (ts * 0.35 + i / rings) % 1, rx = w.rx * 0.15 + ph * w.rx * 0.55;
          x.strokeStyle = `rgba(250,250,255,${0.6 * (1 - ph) * v})`; x.lineWidth = 0.9;
          x.beginPath(); x.ellipse(w.x - w.rx * 0.2, w.y, rx, rx * 0.36, 0, 0, TAU); x.stroke();
        }
        if (w.boat) { const bx = w.x + w.rx * 0.25 + Math.sin(ts * 0.4) * w.rx * 0.2, by = w.y + Math.sin(ts * 1.3) * 0.8; x.fillStyle = 'rgba(130,80,45,0.95)'; x.beginPath(); x.moveTo(bx - u * 1.3, by - u * 0.3); x.lineTo(bx + u * 1.3, by - u * 0.3); x.lineTo(bx + u * 0.9, by + u * 0.3); x.lineTo(bx - u * 0.9, by + u * 0.3); x.closePath(); x.fill(); }
      }
      if (p.flag) { const [fx, fy] = p.flag; x.strokeStyle = INK; x.lineWidth = 0.9; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx, fy - u * 3.5); x.stroke(); x.fillStyle = tint(355, 60, 50, v); x.beginPath(); x.moveTo(fx, fy - u * 3.5); for (let k = 0; k <= 6; k++) x.lineTo(fx + k * u * 0.45, fy - u * 3.2 + Math.sin(ts * 4 + k) * u * 0.25 * (1 + m.vit)); x.lineTo(fx, fy - u * 2.4); x.closePath(); x.fill(); }
      if (p.chimney && m.dormant <= 2) for (let i = 0; i < 3; i++) { const ph = (ts * 0.3 + i / 3) % 1; x.strokeStyle = `rgba(110,100,95,${0.5 * (1 - ph)})`; x.lineWidth = 1.1; x.beginPath(); x.arc(p.chimney[0] + Math.sin(ts + i) * u, p.chimney[1] - ph * u * 6, u * (0.5 + ph), 0, Math.PI * 1.5); x.stroke(); }
      if (p.lanterns && m.vit > 0.2) p.lanterns.forEach(([lx, ly], i) => { const a = (0.3 + 0.25 * Math.sin(ts * 2 + i)) * m.vit; const g = x.createRadialGradient(lx, ly, 0, lx, ly, u * 4); g.addColorStop(0, `rgba(255,200,110,${a})`); g.addColorStop(1, 'rgba(255,200,110,0)'); x.fillStyle = g; x.beginPath(); x.arc(lx, ly, u * 4, 0, TAU); x.fill(); });
      if (p.top && m.today) { const g = x.createRadialGradient(p.top[0], p.top[1], 0, p.top[0], p.top[1], u * 5); g.addColorStop(0, `rgba(255,225,140,${0.45 + 0.2 * Math.sin(ts * 2)})`); g.addColorStop(1, 'rgba(255,225,140,0)'); x.fillStyle = g; x.beginPath(); x.arc(p.top[0], p.top[1], u * 5, 0, TAU); x.fill(); }
      if (p.bucket) { x.strokeStyle = INK; x.lineWidth = 0.8; const by = p.bucket[1] + u * (1.5 + Math.sin(ts * 0.8) * 0.8); x.beginPath(); x.moveTo(p.bucket[0], p.bucket[1]); x.lineTo(p.bucket[0], by); x.stroke(); x.fillStyle = 'rgba(120,80,45,0.95)'; x.fillRect(p.bucket[0] - u * 0.6, by, u * 1.2, u * 1); }
      if (sel === p.h.key) { x.strokeStyle = 'rgba(200,134,42,0.9)'; x.lineWidth = 1.6; x.setLineDash([4, 4]); x.beginPath(); x.ellipse(p.x, p.y + 2, u * 5.5, u * 1.6, 0, 0, TAU); x.stroke(); x.setLineDash([]); }
    });
    // the folk walking the trails: this week's check-ins
    const s = W * 0.022;
    walkers.forEach((w, i) => {
      w.t += w.dir * w.sp * 0.016; if (w.t > 1) { w.t = 1; w.dir = -1; } if (w.t < 0) { w.t = 0; w.dir = 1; }
      const pts = w.path.pts, f = w.t * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), q = f - k;
      const X = lerp(pts[k][0], pts[k + 1][0], q), Y = lerp(pts[k][1], pts[k + 1][1], q);
      seedling(x, X, Y, s, (twos + i) % 2, (pts[k + 1][0] - pts[k][0]) * w.dir >= 0 ? 1 : -1);
    });
  }

  // ------------------------------------------------------------- the ledger
  function sparkSVG(sp) {
    const mx = Math.max(1, ...sp), bw = 5, g = 2, h = 26;
    return `<svg class="spark" width="${sp.length * (bw + g)}" height="${h}" viewBox="0 0 ${sp.length * (bw + g)} ${h}" aria-hidden="true">` +
      sp.map((c, i) => `<rect x="${i * (bw + g)}" y="${h - Math.max(2, c / mx * h)}" width="${bw}" height="${Math.max(2, c / mx * h)}" rx="1.5" fill="${c ? 'var(--accent)' : 'var(--line)'}"/>`).join('') + '</svg>';
  }
  function renderList() {
    const list = $('list');
    list.innerHTML = HS.map((h) => {
      const m = h.m, k = KINDS[h.kind], st = k.stages[m.stage];
      const prog = m.stage >= 6 ? 1 : clamp((m.wood - ([0, 0.01, 1.2, 4, 9, 17, 28][m.stage] || 0)) / ((m.next || 1) - ([0, 0.01, 1.2, 4, 9, 17, 28][m.stage] || 0)));
      const status = !m.total ? 'not started yet' : m.neglected ? `overgrown · ${m.dormant} days since` : `${m.streak}-week streak · ${m.thisWeek}/${h.target} this week`;
      const manual = h.src === 'manual';
      return `<div class="habit${sel === h.key ? ' sel' : ''}${m.neglected ? ' faded' : ''}" data-k="${esc(h.key)}" tabindex="0">
        <div><span class="nm">${esc(h.name)}</span>${h.example && !store.off[h.key] ? '<span class="tag">example data</span>' : ''}${h.src !== 'manual' ? `<span class="tag">${esc((G.athlete && G.athlete.source) || 'Strava')}</span>` : ''}</div>
        ${sparkSVG(m.spark)}
        <div class="place">${esc(k.place)}: ${esc(st)} <span style="opacity:.6">(${m.stage}/6)</span></div>
        <div class="meta">${esc(status)}</div>
        ${manual ? `<button class="btn log" data-log="${esc(h.key)}" aria-pressed="${m.today}">${m.today ? 'Done today ✓' : 'Log today'}</button>` : ''}
        <div class="bar" title="progress to the next stage"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>
      </div>`;
    }).join('');
    list.querySelectorAll('.habit').forEach((el) => {
      el.onclick = (e) => { if (e.target.closest('[data-log]')) return; sel = sel === el.dataset.k ? null : el.dataset.k; renderList(); };
    });
    list.querySelectorAll('[data-log]').forEach((b) => (b.onclick = () => toggleToday(b.dataset.log)));
    const real = HS.filter((h) => h.src !== 'manual').map((h) => h.name.toLowerCase());
    $('note').textContent = `${real.join(', ')} come from ${(G.athlete && G.athlete.source) || 'Strava'}. Reading and meditation start with example check-ins; your own check-ins and new habits are kept in this browser for now.`;
  }
  function toggleToday(key) {
    const d = Math.floor(T), logs = store.logs[key] = store.logs[key] || [];
    const h = HS.find((q) => q.key === key);
    if (h && h.example && !store.off[key]) { store.off[key] = true; store.logs[key] = logs.concat(exampleDays(key).filter((x) => !logs.includes(x))); }
    const L2 = store.logs[key], i = L2.indexOf(d);
    if (i >= 0) L2.splice(i, 1); else L2.push(d);
    save(store); build();
  }
  const sel0 = $('addKind');
  sel0.innerHTML = Object.entries(KINDS).filter(([k]) => k !== 'tree').map(([k, v]) => `<option value="${k}">${esc(v.place.replace('The ', 'a '))}</option>`).join('');
  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nm = $('addName').value.trim(); if (!nm) return;
    const key = 'c' + Date.now().toString(36);
    store.custom.push({ key, name: nm.slice(0, 24), kind: $('addKind').value, target: +$('addTarget').value });
    save(store); $('addName').value = ''; $('add').open = false; sel = key; build();
  });

  // ------------------------------------------------------------- shell
  function size() { const r = stage.getBoundingClientRect(); W = Math.round(r.width); Hh = Math.round(r.height); cv.width = W * dpr; cv.height = Hh * dpr; build(); }
  new ResizeObserver(size).observe(stage);
  const pos = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function hit(px, py) { return places.find((p) => p.hit && Math.hypot(px - p.hit.x, py - p.hit.y) < p.hit.r); }
  stage.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e), p = hit(px, py);
    if (!p) { tip.classList.remove('on'); stage.style.cursor = ''; return; }
    const m = p.h.m, k = KINDS[p.h.kind];
    tip.innerHTML = `<b>${esc(p.h.name)}</b> — ${esc(k.stages[m.stage])}<br>${m.total} check-ins · ${m.streak}-week streak${m.neglected ? '<br>overgrown: come back to it' : ''}`;
    tip.style.left = Math.max(110, Math.min(W - 110, px)) + 'px'; tip.style.top = Math.max(60, py) + 'px'; tip.classList.add('on'); stage.style.cursor = 'pointer';
  });
  stage.addEventListener('pointerleave', () => tip.classList.remove('on'));
  stage.addEventListener('click', (e) => { const p = hit(...pos(e)); if (p) { sel = p.h.key; renderList(); const el = document.querySelector(`.habit[data-k="${p.h.key}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });

  const slider = $('time'), dateLbl = $('date');
  slider.max = String(TODAY); slider.value = String(TODAY);
  const setT = (v) => { T = clamp(v, 0, M.today); slider.value = String(Math.floor(T)); dateLbl.textContent = fmtDate(T); build(); };
  dateLbl.textContent = fmtDate(T);
  slider.addEventListener('input', () => { stopPlay(); setT(+slider.value); });
  $('today').onclick = () => { stopPlay(); setT(M.today); };
  let playing = false, p0 = 0, T0 = 0, lastF = 0;
  function stopPlay() { playing = false; $('play').textContent = '▶ Watch it grow'; }
  $('play').onclick = () => { if (playing) return stopPlay(); playing = true; $('play').textContent = '❚❚ Pause'; T0 = T >= M.today - 1 ? 0 : T; p0 = performance.now(); };
  function loop(t) {
    if (playing) { const dur = Math.min(22000, 7000 + M.today * 20), k = Math.min(1, (t - p0) / dur); if (t - lastF > 140) { setT(T0 + (M.today - T0) * k); lastF = t; } if (k >= 1) stopPlay(); }
    if (frames.length && !document.hidden) {
      if (t - lastBoil > (calm ? 1e9 : 166)) { fi = (fi + 1) % frames.length; lastBoil = t; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(frames[fi], 0, 0);
      live(calm ? 0 : t);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => build());
  document.body.dataset.ready = '1';
})();
