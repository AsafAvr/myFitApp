/*!
 * Three little worlds grown from the same running genome:
 *   jar      — a snow globe on a turned-wood base: shake it, wipe the fogged glass
 *   planet   — a tiny planet you spin, with a runner doing laps and milestone moons
 *   journal  — a pen-and-pencil field-journal page with hand-written notes
 */
(function () {
  'use strict';
  const G = window.__GENOME__, FT = window.FitTree;
  const M = FT.prepare(G);
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2, DAY = 86400000;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const hsl = (h, s, l, a) => a == null ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)` : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a.toFixed(3)})`;
  const name = (G.athlete && (G.athlete.first_name || G.athlete.name)) || 'Runner';
  const fmtDate = (T, o) => new Date(M.origin + Math.floor(T) * DAY).toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, o || {}));
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const seasonRGB = (s, l) => { const [h, sa, li] = FT.geom.interpStops(FT.geom.SEASON_STOPS, clamp(s)); return [h, sa, l == null ? li : l]; };
  const runsAt = (T) => M.runs.filter((r) => r.day <= T);

  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d'), hint = $('hint'), tip = $('tip');
  let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  let T = M.today, current = null, key = null;

  $('lede').textContent = `${name}'s running habit, grown three ways. Every element still comes from the runs; only the world around the tree changes.`;
  $('foot').textContent = `Prototype worlds · ${G.athlete && G.athlete.source ? G.athlete.source : 'Strava'} data · ${fmtDate(M.today)}`;

  // ================================================================ JAR
  function Jar() {
    let S, R, inner, ictx, fog, fctx, geo, back, parts = [], fogAmt = 0, last = null, wipe = 0;
    const kindOf = (S) => S.winter ? 'snow' : S.st.dormant > 10 ? 'leaf' : (M.g.sky && M.g.sky.period === 'night') ? 'firefly'
      : S.season < 0.45 ? 'leaf' : S.season > 0.9 ? 'petal' : 'seed';
    function layout() {
      const r = Math.min(W * 0.41, H * 0.335);
      return { cx: W / 2, cy: H * 0.43, r, top: H * 0.43 + r * 0.8, bh: r * 0.46 };
    }
    function build() {
      geo = layout();
      S = FT.grow(M, T);
      const d = geo.r * 2;
      R = FT.prepareRender(S, d, d, { model: M, dpr, groundFrac: 0.72, topPad: d * 0.1, post: false, maxZoom: 2.3 });
      inner = mk(d * dpr, d * dpr); ictx = inner.getContext('2d');
      // fog: the glass mists over when you stop running; your finger wipes it
      fogAmt = S.runsN ? smooth(4, 21, S.st.dormant) : 0.3;
      fog = mk(d * dpr, d * dpr); fctx = fog.getContext('2d');
      paintFog(1);
      back = backdrop();
      const kind = kindOf(S), n = kind === 'firefly' ? 26 : 150, rr = FT.rng('jar' + kind);
      parts = [];
      for (let i = 0; i < n; i++) {
        const a = rr() * TAU, rad = Math.sqrt(rr()) * geo.r * 0.85;
        parts.push({ k: kind, x: Math.cos(a) * rad, y: Math.sin(a) * rad - geo.r * 0.2, vx: (rr() - 0.5) * 2, vy: (rr() - 0.5) * 2,
          s: kind === 'snow' ? 1 + rr() * 1.8 : 2.4 + rr() * 2.6, rot: rr() * TAU, vr: (rr() - 0.5) * 0.2, ph: rr() * TAU, c: rr() });
      }
      hint.textContent = fogAmt > 0.15 ? 'The glass has misted over — wipe it, then go for a run' : 'Drag across the globe to shake it';
      hint.className = 'hint';
    }
    function paintFog(alpha) {
      const d = fog.width;
      fctx.globalCompositeOperation = 'source-over';
      fctx.globalAlpha = alpha * fogAmt;
      const g = fctx.createRadialGradient(d / 2, d / 2, d * 0.1, d / 2, d / 2, d / 2);
      g.addColorStop(0, 'rgba(225,232,236,0.75)'); g.addColorStop(1, 'rgba(235,240,244,0.92)');
      fctx.fillStyle = g; fctx.fillRect(0, 0, d, d);
      if (alpha === 1 && fogAmt > 0.05) {
        const rr = FT.rng('drops');
        for (let i = 0; i < 260; i++) {
          const x = rr() * d, y = rr() * d, r = (0.6 + rr() * 2.2) * dpr;
          fctx.globalAlpha = 0.5 * fogAmt;
          fctx.fillStyle = 'rgba(255,255,255,0.9)'; fctx.beginPath(); fctx.arc(x, y, r, 0, TAU); fctx.fill();
          fctx.fillStyle = 'rgba(80,90,100,0.35)'; fctx.beginPath(); fctx.arc(x + r * 0.3, y + r * 0.35, r * 0.7, 0, TAU); fctx.fill();
        }
      }
      fctx.globalAlpha = 1;
    }
    function backdrop() {
      const c = mk(W * dpr, H * dpr), x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tableY = geo.top + geo.bh * 0.92;
      const wall = x.createLinearGradient(0, 0, 0, tableY);
      wall.addColorStop(0, '#2a2320'); wall.addColorStop(1, '#3b302a');
      x.fillStyle = wall; x.fillRect(0, 0, W, tableY);
      const win = x.createRadialGradient(W * 0.15, H * 0.05, 10, W * 0.15, H * 0.05, W * 0.9);
      win.addColorStop(0, 'rgba(255,226,170,0.28)'); win.addColorStop(1, 'rgba(255,226,170,0)');
      x.fillStyle = win; x.fillRect(0, 0, W, tableY);
      const tab = x.createLinearGradient(0, tableY, 0, H);
      tab.addColorStop(0, '#6b4a30'); tab.addColorStop(1, '#3a2617');
      x.fillStyle = tab; x.fillRect(0, tableY, W, H - tableY);
      const rr = FT.rng('table');
      x.strokeStyle = 'rgba(30,15,5,0.25)'; x.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const y = tableY + (H - tableY) * rr(); x.beginPath(); x.moveTo(0, y);
        for (let X = 0; X <= W; X += 20) x.lineTo(X, y + Math.sin(X / 90 + i) * 2);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,230,190,0.08)'; x.fillRect(0, tableY, W, 2);
      // the globe's shadow, and the light it throws through the glass
      const sh = x.createRadialGradient(geo.cx + geo.r * 0.25, tableY + geo.bh * 0.12, 4, geo.cx + geo.r * 0.25, tableY + geo.bh * 0.12, geo.r * 1.3);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.translate(0, tableY); x.scale(1, 0.25); x.translate(0, -tableY);
      x.fillStyle = sh; x.beginPath(); x.arc(geo.cx + geo.r * 0.25, tableY + geo.bh * 0.12, geo.r * 1.3, 0, TAU); x.fill(); x.restore();
      const [h, s] = seasonRGB(S.season);
      const ca = x.createRadialGradient(geo.cx + geo.r * 0.55, tableY + geo.bh * 0.5, 2, geo.cx + geo.r * 0.55, tableY + geo.bh * 0.5, geo.r * 0.55);
      ca.addColorStop(0, hsl(h, s, 75, S.winter ? 0.15 : 0.32)); ca.addColorStop(1, hsl(h, s, 75, 0));
      x.save(); x.translate(0, tableY + geo.bh * 0.5); x.scale(1, 0.3); x.translate(0, -(tableY + geo.bh * 0.5));
      x.globalCompositeOperation = 'screen'; x.fillStyle = ca; x.beginPath(); x.arc(geo.cx + geo.r * 0.55, tableY + geo.bh * 0.5, geo.r * 0.55, 0, TAU); x.fill(); x.restore();
      return c;
    }
    function base(x) {
      const { cx, r, top, bh } = geo;
      const rx0 = r * 0.8, rx1 = r * 0.98, ry = r * 0.13, bot = top + bh;
      const wood = x.createLinearGradient(cx - rx1, 0, cx + rx1, 0);
      wood.addColorStop(0, '#3a2414'); wood.addColorStop(0.35, '#8a5a32'); wood.addColorStop(0.55, '#a8743f'); wood.addColorStop(1, '#2e1c10');
      x.fillStyle = wood;
      x.beginPath(); x.ellipse(cx, top, rx0, ry, 0, 0, Math.PI); x.lineTo(cx - rx1, bot); x.ellipse(cx, bot, rx1, ry * 1.1, 0, Math.PI, 0, true); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(40,20,8,0.35)'; x.lineWidth = 1;
      for (let i = 1; i < 6; i++) { const t = i / 6, y = top + bh * t, rx = lerp(rx0, rx1, t); x.beginPath(); x.ellipse(cx, y, rx, ry * (0.9 + t * 0.2), 0, 0.05, Math.PI - 0.05); x.stroke(); }
      x.fillStyle = 'rgba(255,220,170,0.18)'; x.beginPath(); x.ellipse(cx, top + 1, rx0, ry, 0, 0, Math.PI); x.ellipse(cx, top + 4, rx0 * 0.98, ry * 0.9, 0, Math.PI, 0, true); x.fill();
      // brass plaque, engraved
      const pw = r * 0.95, ph = bh * 0.52, py = top + bh * 0.3;
      const br = x.createLinearGradient(0, py, 0, py + ph);
      br.addColorStop(0, '#f0d58c'); br.addColorStop(0.5, '#c79a3c'); br.addColorStop(1, '#8c6420');
      x.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(x, cx - pw / 2 + 1.5, py + 2, pw, ph, 5); x.fill();
      x.fillStyle = br; roundRect(x, cx - pw / 2, py, pw, ph, 5); x.fill();
      x.strokeStyle = 'rgba(90,60,10,0.6)'; x.lineWidth = 1; roundRect(x, cx - pw / 2 + 3, py + 3, pw - 6, ph - 6, 3); x.stroke();
      const runs = S.runsN, km = Math.round(S.kmT);
      x.textAlign = 'center';
      const engrave = (txt, y, size, font) => {
        x.font = `${font} ${size}px ${font.includes('700') ? 'Caveat, cursive' : '"Bricolage Grotesque", Georgia, serif'}`;
        x.fillStyle = 'rgba(255,240,200,0.55)'; x.fillText(txt, cx + 0.6, y + 0.8);
        x.fillStyle = 'rgba(70,45,8,0.9)'; x.fillText(txt, cx, y);
      };
      engrave(`${name}'s tree`, py + ph * 0.48, Math.round(ph * 0.42), '700');
      engrave(`since ${M.since} · ${runs} runs · ${km} km`, py + ph * 0.82, Math.max(9, Math.round(ph * 0.2)), '500');
    }
    function stepParts(t) {
      const r = geo.r * 0.93, ground = geo.r * 0.42;
      parts.forEach((p) => {
        if (p.k === 'firefly') {
          p.x += Math.cos(t / 900 + p.ph) * 0.35 + p.vx * 0.2; p.y += Math.sin(t / 700 + p.ph * 2) * 0.3 + p.vy * 0.2;
          p.vx *= 0.96; p.vy *= 0.96;
        } else {
          const g = p.k === 'snow' ? 0.012 : p.k === 'seed' ? 0.006 : 0.02;
          p.vy += g; p.vx *= 0.985; p.vy *= 0.985;
          p.vx += Math.sin(t / 1300 + p.ph) * 0.004;
          p.x += p.vx; p.y += p.vy; p.rot += p.vr * Math.hypot(p.vx, p.vy) * 0.3;
          if (p.y > ground - p.s) { p.y = ground - p.s - Math.abs(Math.sin(p.ph * 7)) * 3; p.vy = 0; p.vx *= 0.6; }
        }
        const d = Math.hypot(p.x, p.y);
        if (d > r) { const nx = p.x / d, ny = p.y / d; p.x = nx * r; p.y = ny * r; const dot = p.vx * nx + p.vy * ny; p.vx -= 1.6 * dot * nx; p.vy -= 1.6 * dot * ny; }
      });
    }
    function drawParts(x, t) {
      const { cx, cy } = geo;
      parts.forEach((p) => {
        const X = cx + p.x, Y = cy + p.y;
        if (p.k === 'snow') { x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.arc(X, Y, p.s, 0, TAU); x.fill(); }
        else if (p.k === 'firefly') {
          const a = 0.45 + 0.55 * Math.sin(t / 400 + p.ph);
          const g = x.createRadialGradient(X, Y, 0, X, Y, 7); g.addColorStop(0, `rgba(255,248,170,${0.9 * a})`); g.addColorStop(1, 'rgba(255,248,170,0)');
          x.fillStyle = g; x.beginPath(); x.arc(X, Y, 7, 0, TAU); x.fill();
        } else {
          x.save(); x.translate(X, Y); x.rotate(p.rot);
          if (p.k === 'leaf') { const [h, s, l] = seasonRGB(0.12 + p.c * 0.3); x.fillStyle = hsl(h, s, l); x.beginPath(); x.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU); x.fill(); }
          else if (p.k === 'petal') { x.fillStyle = p.c < 0.5 ? '#fbe3ea' : '#f6b7c9'; x.beginPath(); x.ellipse(0, 0, p.s * 0.8, p.s * 0.5, 0, 0, TAU); x.fill(); }
          else { x.strokeStyle = 'rgba(255,252,240,0.85)'; x.lineWidth = 0.6; for (let k = 0; k < 6; k++) { const a = k * TAU / 6; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * p.s, Math.sin(a) * p.s); x.stroke(); } }
          x.restore();
        }
      });
    }
    function glass(x) {
      const { cx, cy, r } = geo;
      const e = x.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
      e.addColorStop(0, 'rgba(10,14,22,0)'); e.addColorStop(0.85, 'rgba(10,14,22,0.18)'); e.addColorStop(1, 'rgba(10,14,22,0.5)');
      x.fillStyle = e; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      x.globalCompositeOperation = 'screen';
      const wg = x.createLinearGradient(cx - r * 0.7, cy - r * 0.7, cx - r * 0.2, cy - r * 0.1);
      wg.addColorStop(0, 'rgba(255,255,255,0.28)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = wg;
      x.save(); x.translate(cx - r * 0.42, cy - r * 0.45); x.rotate(-0.6);
      roundRect(x, -r * 0.2, -r * 0.13, r * 0.26, r * 0.36, r * 0.05); x.fill();
      roundRect(x, r * 0.09, -r * 0.13, r * 0.12, r * 0.36, r * 0.04); x.fill();
      x.restore();
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = r * 0.025; x.lineCap = 'round';
      x.beginPath(); x.arc(cx, cy, r * 0.94, Math.PI * 1.05, Math.PI * 1.45); x.stroke();
      x.strokeStyle = 'rgba(255,240,210,0.18)'; x.lineWidth = r * 0.012;
      x.beginPath(); x.arc(cx, cy, r * 0.95, Math.PI * 0.05, Math.PI * 0.35); x.stroke();
      x.globalCompositeOperation = 'source-over';
    }
    return {
      about: [
        ['A world you keep on a shelf', 'The tree grows inside a snow globe. The brass plaque on the turned-wood base is engraved with the runs and kilometres.'],
        ['Shake it', 'Drag across the glass. What swirls depends on your last weeks: blossom petals when building, seeds in steady summer, leaves when fading, snow when stopped, fireflies for night runners.'],
        ['The glass mists over', 'After 4 days without a run the glass starts to fog; after 3 weeks you can barely see the tree. You can wipe it with your finger, but it mists back. Only running clears it.'],
      ],
      enter() { build(); },
      setT() { build(); },
      resize() { build(); },
      frame(t) {
        FT.drawFrame(ictx, R, t);
        stepParts(t);
        if (fogAmt > 0.02 && t - wipe > 120) { paintFog(0.012); wipe = t; }   // the mist creeps back
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(back, 0, 0, W, H);
        const { cx, cy, r } = geo;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
        ctx.drawImage(inner, cx - r * 1.04, cy - r * 1.04, r * 2.08, r * 2.08);
        drawParts(ctx, t);
        if (fogAmt > 0.02) ctx.drawImage(fog, cx - r, cy - r, r * 2, r * 2);
        glass(ctx);
        ctx.restore();
        base(ctx);
      },
      down(px, py) { last = { x: px, y: py }; },
      move(px, py) {
        if (!last) return;
        const dx = px - last.x, dy = py - last.y; last = { x: px, y: py };
        const { cx, cy, r } = geo;
        if (Math.hypot(px - cx, py - cy) > r) return;
        parts.forEach((p) => { const k = 0.25 + Math.random() * 0.5; p.vx += dx * 0.09 * k; p.vy += dy * 0.09 * k - Math.abs(dx + dy) * 0.02 * k; });
        if (fogAmt > 0.02) {           // the finger wipes a clear streak
          const s = (2 * r * dpr) / (2 * r);
          fctx.globalCompositeOperation = 'destination-out';
          const g = fctx.createRadialGradient((px - cx + r) * s, (py - cy + r) * s, 0, (px - cx + r) * s, (py - cy + r) * s, 26 * dpr);
          g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc((px - cx + r) * s, (py - cy + r) * s, 26 * dpr, 0, TAU); fctx.fill();
          fctx.globalCompositeOperation = 'source-over';
        }
      },
      up() { last = null; },
      shakeOnce() { parts.forEach((p) => { p.vx += (Math.random() - 0.5) * 6; p.vy -= Math.random() * 5; }); },
    };
  }

  // ============================================================= PLANET
  function Planet() {
    let S, R, tree, tctx, space, ang = 0, vel = 0, drag = null, runnerA = 0, geo, moons = [], lapSpeed = 0;
    function build() {
      S = FT.grow(M, T);
      const base = Math.min(W, H) * 0.19;
      const rp = base * (0.72 + 0.32 * clamp(Math.sqrt(S.kmT / 2000)));
      geo = { cx: W / 2, cy: H * 0.66, rp };
      const TH = Math.min(H * 0.5, rp * 1.75), TW = TH * 1.15;
      R = FT.prepareRender(S, TW, TH, { model: M, dpr, layers: 'tree', groundFrac: 0.97, topPad: 6, maxZoom: 2.2 });
      tree = mk(TW * dpr, TH * dpr); tctx = tree.getContext('2d');
      geo.TW = TW; geo.TH = TH;
      space = starfield();
      const ms = M.ms.filter((m) => m.day <= T).slice(-7);
      moons = ms.map((m, i) => ({ label: m.label, t: m.t, r: rp * (1.75 + i * 0.16), a: (i * 2.39) % TAU, w: 0.0007 / (1 + i * 0.35), s: 3 + (/^First|marathon/i.test(m.label) ? 3 : 1.5), latest: i === ms.length - 1 }));
      const km4 = runsAt(T).filter((r) => T - r.day < 28).reduce((a, r) => a + r.km, 0) / 4;
      lapSpeed = 0.002 + 0.0006 * Math.sqrt(km4);
      hint.textContent = 'Drag to spin the planet';
      hint.className = 'hint';
    }
    function starfield() {
      const c = mk(W * dpr, H * dpr), x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070a18'); g.addColorStop(0.6, '#10142a'); g.addColorStop(1, '#1a1630');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const [h, s] = seasonRGB(S.season);
      [[0.22, 0.25, hsl(h, s * 0.7, 45, 0.16)], [0.8, 0.35, hsl(280, 50, 45, 0.12)], [0.6, 0.12, hsl(200, 60, 50, 0.1)]].forEach(([fx, fy, col]) => {
        const n = x.createRadialGradient(W * fx, H * fy, 0, W * fx, H * fy, W * 0.55);
        n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = n; x.fillRect(0, 0, W, H);
      });
      const rr = FT.rng('stars');
      for (let i = 0; i < 420; i++) {
        const big = rr() < 0.04; x.fillStyle = `rgba(255,${235 + rr() * 20},${210 + rr() * 45},${0.25 + rr() * 0.7})`;
        x.beginPath(); x.arc(rr() * W, rr() * H, big ? 1.4 : 0.6 + rr() * 0.5, 0, TAU); x.fill();
      }
      // a distant sun
      const sx = W * 0.12, sy = H * 0.14;
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, W * 0.4);
      sg.addColorStop(0, 'rgba(255,240,200,0.9)'); sg.addColorStop(0.04, 'rgba(255,220,150,0.6)'); sg.addColorStop(0.25, 'rgba(255,200,120,0.08)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = sg; x.fillRect(0, 0, W, H);
      return c;
    }
    function body(x) {
      const rp = geo.rp, Sx = S;
      // strata, from crust to a core that glows with the streak
      const layers = [[1, 24, 40, 26], [0.9, 22, 36, 20], [0.74, 18, 32, 15], [0.56, 16, 30, 11]];
      layers.forEach(([f, h, s, l]) => { x.fillStyle = hsl(h, s, l); x.beginPath(); x.arc(0, 0, rp * f, 0, TAU); x.fill(); });
      const heat = clamp(Sx.st.streak / 12);
      const core = x.createRadialGradient(0, 0, 0, 0, 0, rp * 0.42);
      core.addColorStop(0, hsl(40, 100, 60 + heat * 20, 0.35 + heat * 0.6)); core.addColorStop(0.5, hsl(22, 95, 45, 0.25 + heat * 0.45)); core.addColorStop(1, hsl(15, 90, 30, 0));
      x.fillStyle = core; x.beginPath(); x.arc(0, 0, rp * 0.42, 0, TAU); x.fill();
      // seven weekday roots reaching for the core
      Sx.roots.forEach((rt, i) => {
        const off = (i - 3) * 0.09, len = 0.25 + 0.6 * Math.sqrt(rt.share * 7 / 2.2);
        const w0 = Math.max(0.8, rp * 0.05 * Math.sqrt(rt.share * 7));
        const ex = Math.sin(off * 3) * rp * 0.5 * len, ey = -rp + rp * len * 0.95;
        x.strokeStyle = rt.strongest ? hsl(32, 45, 55) : hsl(28, 35, 40); x.lineCap = 'round';
        for (let k = 0; k < 10; k++) {
          const t0 = k / 10, t1 = (k + 1) / 10;
          const p0 = qpt(t0), p1 = qpt(t1);
          x.lineWidth = Math.max(0.4, w0 * (1 - t0 * 0.85)); x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke();
        }
        function qpt(t) { const cxp = off * rp * 1.2, cyp = -rp * 0.75; const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * off * rp * 0.2 + b * cxp + c * ex, a * (-rp + 2) + b * cyp + c * ey]; }
      });
      // crust and grass all the way round
      const [gh, gs, gl] = seasonRGB(Sx.season * 0.85 + 0.1);
      x.strokeStyle = hsl(gh, gs * 0.8, Math.max(18, gl * 0.8)); x.lineWidth = rp * 0.05; x.beginPath(); x.arc(0, 0, rp * 0.985, 0, TAU); x.stroke();
      const rr = FT.rng('crust'), n = 260 + Math.min(500, Sx.runsN * 2);
      x.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = rr() * TAU, h = (3 + rr() * 7) * (Sx.winter ? 0.6 : 1), lean = (rr() - 0.5) * 0.06;
        x.strokeStyle = Sx.winter ? hsl(40, 15, 55 + rr() * 25) : hsl(gh + (rr() - 0.5) * 16, gs * 0.85, gl * (0.8 + rr() * 0.5));
        x.lineWidth = 0.8 + rr() * 0.8;
        x.beginPath(); x.moveTo(Math.sin(a) * rp, -Math.cos(a) * rp); x.lineTo(Math.sin(a + lean) * (rp + h), -Math.cos(a + lean) * (rp + h)); x.stroke();
      }
      // cross-training blooms as flowers around the globe
      Sx.flowers.forEach((f, i) => {
        const a = (f.x / rp) * 0.6 + (i % 2 ? Math.PI * 0.6 : -Math.PI * 0.55), h = 7 + f.h * 0.4;
        const bx = Math.sin(a) * (rp + h), by = -Math.cos(a) * (rp + h);
        x.strokeStyle = hsl(100, 35, 32); x.lineWidth = 0.9; x.beginPath(); x.moveTo(Math.sin(a) * rp, -Math.cos(a) * rp); x.lineTo(bx, by); x.stroke();
        x.fillStyle = hsl(f.color[0], f.color[1] * (1 - f.wilt * 0.5), f.color[2] - f.wilt * 15); x.beginPath(); x.arc(bx, by, 2.6, 0, TAU); x.fill();
      });
    }
    function runner(x, t) {
      const rp = geo.rp, a = runnerA;
      x.save(); x.rotate(a); x.translate(0, -rp - 1);
      const f = Math.floor(t / 83) % 8, ph = f / 8 * TAU;      // drawn on twos: 12 frames a second
      const s = Math.max(6, rp * 0.095);
      x.strokeStyle = '#fff3dc'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = Math.max(1.2, s * 0.18);
      const hip = [0, -s * 1.3], sh = [s * 0.18, -s * 2.3];
      const leg = (p) => { const k = Math.sin(ph + p); return [[hip[0] + k * s * 0.5, hip[1] + s * 0.65], [hip[0] + k * s * 0.85 - Math.max(0, -k) * s * 0.3, -Math.max(0, Math.cos(ph + p)) * s * 0.35]]; };
      [0, Math.PI].forEach((p) => { const [kn, ft] = leg(p); x.beginPath(); x.moveTo(...hip); x.lineTo(...kn); x.lineTo(...ft); x.stroke(); });
      x.beginPath(); x.moveTo(...hip); x.lineTo(...sh); x.stroke();
      [0, Math.PI].forEach((p) => { const k = Math.sin(ph + p + Math.PI); x.beginPath(); x.moveTo(...sh); x.lineTo(sh[0] + k * s * 0.45, sh[1] + s * 0.5); x.lineTo(sh[0] + k * s * 0.45 + s * 0.3, sh[1] + s * 0.2); x.stroke(); });
      x.fillStyle = '#fff3dc'; x.beginPath(); x.arc(sh[0] + s * 0.15, sh[1] - s * 0.45, s * 0.32, 0, TAU); x.fill();
      x.fillStyle = 'rgba(230,210,180,0.35)';
      for (let k = 1; k < 4; k++) { x.beginPath(); x.arc(-s * k * 0.9, -s * 0.15 * k, s * 0.18 * (4 - k) * (0.5 + 0.5 * Math.sin(t / 120 + k)), 0, TAU); x.fill(); }
      x.restore();
    }
    return {
      about: [
        ['A world of its own', 'The tree stands on a tiny planet that grows with every kilometre. Drag to spin it; day and night sweep across as it turns.'],
        ['The core and the roots', 'Seven weekday roots reach down toward a molten core that burns brighter the longer your weekly streak.'],
        ['Laps and moons', 'A small runner circles the planet, faster when your last month was bigger. Your latest milestones orbit as amber moons — hover one to read it.'],
      ],
      enter() { build(); },
      setT() { build(); },
      resize() { build(); },
      frame(t) {
        if (!drag) vel = lerp(vel, 0.0012, 0.02);
        ang += vel; runnerA += lapSpeed;
        FT.drawFrame(tctx, R, t);
        const { cx, cy, rp } = geo;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(space, 0, 0, W, H);
        const [h, s] = seasonRGB(S.season);
        const atm = ctx.createRadialGradient(cx, cy, rp * 0.95, cx, cy, rp * 1.6);
        atm.addColorStop(0, hsl(S.winter ? 205 : h, S.winter ? 30 : s * 0.8, 70, 0.4)); atm.addColorStop(1, hsl(h, s, 60, 0));
        ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, rp * 1.6, 0, TAU); ctx.fill();
        // moons behind
        moons.forEach((m) => { m.a += m.w * 16; });
        const drawMoon = (m) => {
          const x = cx + Math.cos(m.a) * m.r, y = cy + Math.sin(m.a) * m.r * 0.32;
          const g = ctx.createRadialGradient(x - m.s * 0.3, y - m.s * 0.3, 0.2, x, y, m.s);
          g.addColorStop(0, '#fff1c4'); g.addColorStop(1, m.latest ? '#d98a1c' : '#9a7a52');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, m.s, 0, TAU); ctx.fill();
          if (m.latest) { const gl = ctx.createRadialGradient(x, y, 0, x, y, m.s * 4); gl.addColorStop(0, 'rgba(255,200,90,0.35)'); gl.addColorStop(1, 'rgba(255,200,90,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, m.s * 4, 0, TAU); ctx.fill(); }
          m.sx = x; m.sy = y;
        };
        ctx.strokeStyle = 'rgba(255,230,190,0.07)'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
        moons.forEach((m) => { ctx.beginPath(); ctx.ellipse(cx, cy, m.r, m.r * 0.32, 0, 0, TAU); ctx.stroke(); });
        ctx.setLineDash([]);
        moons.filter((m) => Math.sin(m.a) < 0).forEach(drawMoon);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        body(ctx);
        ctx.drawImage(tree, -R.v.cx, -rp - R.v.gy + 2, geo.TW, geo.TH);
        runner(ctx, t);
        ctx.restore();
        // night side: a soft terminator (the sun is up and to the left) that fades out into space
        const nx = cx + rp * 1.05, ny = cy + rp * 0.95;
        const tg = ctx.createRadialGradient(nx, ny, rp * 0.2, nx, ny, rp * 2.1);
        tg.addColorStop(0, 'rgba(8,10,30,0.78)'); tg.addColorStop(0.55, 'rgba(8,10,30,0.4)'); tg.addColorStop(1, 'rgba(8,10,30,0)');
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(nx, ny, rp * 2.1, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255,230,180,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, rp * 1.005, Math.PI * 0.95, Math.PI * 1.6); ctx.stroke();
        moons.filter((m) => Math.sin(m.a) >= 0).forEach(drawMoon);
      },
      down(px) { drag = { x: px }; },
      move(px, py) {
        if (drag) { vel = (px - drag.x) * 0.004; ang += (px - drag.x) * 0.004; drag.x = px; tip.classList.remove('on'); return; }
        const m = moons.find((m) => m.sx != null && Math.hypot(px - m.sx, py - m.sy) < m.s + 8);
        if (m) { tip.textContent = `${m.label} · ${m.t.slice(0, 10)}`; tip.style.left = px + 'px'; tip.style.top = py + 'px'; tip.classList.add('on'); }
        else tip.classList.remove('on');
      },
      up() { drag = null; },
    };
  }

  // ============================================================ JOURNAL
  function Journal() {
    let S, paper, L, boil = 0, lastBoil = -1e9, notes = [];
    const INK = 'rgba(52,40,30,0.86)', SEPIA = '#5a3b22';
    function build() {
      S = FT.grow(M, T);
      const pad = W * 0.06;
      const box = { x: pad * 1.4, y: H * 0.2, w: W * 0.6, h: H * 0.5 };
      const bb = S.bbox, tw = bb.x1 - bb.x0 + 20, th = -bb.y0 + 10;
      const k = Math.min(box.w / tw, box.h / th, 3);
      L = { k, ox: box.x + box.w / 2 - k * (bb.x0 + bb.x1) / 2, oy: box.y + box.h, box, pad };
      paper = page();
      notes = annotate();
      hint.textContent = ''; hint.className = 'hint paper';
      lastBoil = -1e9;
    }
    const P = (x, y) => [L.ox + x * L.k, L.oy + y * L.k];
    function page() {
      const c = mk(W * dpr, H * dpr), x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#2b2320'; x.fillRect(0, 0, W, H);
      const m = W * 0.025;
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(m + 4, m + 6, W - 2 * m, H - 2 * m);
      const g = x.createRadialGradient(W * 0.5, H * 0.45, W * 0.2, W * 0.5, H * 0.5, W * 0.85);
      g.addColorStop(0, '#f6efdc'); g.addColorStop(1, '#e4d6b4');
      x.fillStyle = g; x.fillRect(m, m, W - 2 * m, H - 2 * m);
      const rr = FT.rng('paper');
      for (let i = 0; i < 2600; i++) { x.fillStyle = rr() < 0.5 ? `rgba(120,95,60,${rr() * 0.08})` : `rgba(255,255,255,${rr() * 0.25})`; x.fillRect(m + rr() * (W - 2 * m), m + rr() * (H - 2 * m), 1 + rr() * 2, 0.6); }
      x.strokeStyle = 'rgba(120,95,60,0.08)'; x.lineWidth = 0.6;
      for (let i = 0; i < 40; i++) { const x0 = m + rr() * (W - 2 * m), y0 = m + rr() * (H - 2 * m); x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(x0 + 10, y0 + 4, x0 + 18 + rr() * 20, y0 + rr() * 6); x.stroke(); }
      // notebook rules and margin
      x.strokeStyle = 'rgba(90,130,170,0.18)'; x.lineWidth = 1;
      for (let y = H * 0.13; y < H - m * 2; y += H * 0.034) { x.beginPath(); x.moveTo(W * 0.66, y); x.lineTo(W - m * 1.5, y); x.stroke(); }
      x.strokeStyle = 'rgba(200,70,60,0.35)'; x.beginPath(); x.moveTo(m + W * 0.05, m); x.lineTo(m + W * 0.05, H - m); x.stroke();
      // washi tape and a postmark
      x.save(); x.translate(W * 0.83, m + 6); x.rotate(0.12);
      x.fillStyle = 'rgba(150,190,140,0.55)'; x.fillRect(-W * 0.09, -10, W * 0.18, 22);
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
      for (let i = -8; i < 9; i++) { x.beginPath(); x.moveTo(i * W * 0.012, -10); x.lineTo(i * W * 0.012 + 8, 12); x.stroke(); }
      x.restore();
      const wk = S.st.weeksTotal;
      x.save(); x.translate(W * 0.84, H * 0.12); x.rotate(-0.18);
      x.strokeStyle = 'rgba(170,50,40,0.55)'; x.lineWidth = 2;
      x.beginPath(); x.arc(0, 0, W * 0.055, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, W * 0.045, 0, TAU); x.stroke();
      x.fillStyle = 'rgba(170,50,40,0.65)'; x.textAlign = 'center';
      x.font = `700 ${Math.round(W * 0.018)}px system-ui, sans-serif`; x.fillText('WEEK', 0, -W * 0.012);
      x.font = `700 ${Math.round(W * 0.03)}px system-ui, sans-serif`; x.fillText(String(wk), 0, W * 0.02);
      x.restore();
      // title
      x.fillStyle = SEPIA; x.textAlign = 'left';
      x.font = `700 ${Math.round(W * 0.06)}px Caveat, cursive`; x.fillText(`${name}'s tree`, m + W * 0.08, H * 0.085);
      x.font = `600 ${Math.round(W * 0.033)}px Caveat, cursive`; x.fillStyle = 'rgba(90,59,34,0.8)';
      x.fillText(`${fmtDate(T, { weekday: 'long' })} · ${S.runsN} runs, ${Math.round(S.kmT)} km so far`, m + W * 0.08, H * 0.125);
      return c;
    }
    function stroke(x, pts, rnd, col, w, jit, alpha, passes = 2) {
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
      const c = Math.cos(ang), s = Math.sin(ang), diag = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      x.strokeStyle = col; x.lineWidth = w;
      for (let d = -diag / 2; d < diag / 2; d += gap * (0.8 + rnd() * 0.4)) {
        x.globalAlpha = alpha * (0.5 + rnd() * 0.5);
        x.beginPath(); x.moveTo(mx + c * -diag / 2 - s * d + (rnd() - 0.5) * 2, my + s * -diag / 2 + c * d); x.lineTo(mx + c * diag / 2 - s * d, my + s * diag / 2 + c * d + (rnd() - 0.5) * 2); x.stroke();
      }
      x.restore(); x.globalAlpha = 1;
    }
    function polyOf(pts) { const [l, r] = FT.geom.outline(pts); return [...l, ...r.reverse()].map(([a, b]) => P(a, b)); }
    function draw() {
      const rnd = FT.rng('boil' + boil), x = ctx;
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(paper, 0, 0);
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round';
      x.globalCompositeOperation = 'multiply';
      const k = L.k, gy = L.oy;
      // ground: a wavy pencil line with grass ticks
      const gx0 = L.box.x - 10, gx1 = L.box.x + L.box.w + 10;
      const gl = []; for (let X = gx0; X <= gx1; X += 8) gl.push([X, gy + Math.sin(X / 37) * 1.5]);
      stroke(x, gl, rnd, INK, 1.2, 1.2, 0.8);
      const [gh, gs, gll] = seasonRGB(S.season * 0.85 + 0.1);
      for (let X = gx0; X < gx1; X += 3 + rnd() * 4) stroke(x, [[X, gy], [X + (rnd() - 0.5) * 3, gy - 3 - rnd() * 6]], rnd, S.winter ? 'rgba(120,110,90,0.8)' : hsl(gh, gs * 0.8, gll * 0.9), 0.9, 0.4, 0.7, 1);
      // roots, with stippled soil
      for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(90,70,50,${0.15 + rnd() * 0.3})`; x.fillRect(gx0 + rnd() * (gx1 - gx0), gy + 4 + Math.pow(rnd(), 1.5) * L.box.h * 0.32, 1, 1); }
      S.roots.forEach((rt) => {
        const pts = rt.pts.map((p) => [p.x, p.y * 0.55]);
        const poly = polyOf(rt.pts.map((p) => ({ x: p.x, y: p.y * 0.55, r: p.r })));
        if (rt.strongest) hatch(x, poly, rnd, 0.9, 2.6, 'rgba(150,95,45,0.9)', 0.8, 0.7);
        const [l, r] = FT.geom.outline(rt.pts.map((p) => ({ x: p.x, y: p.y * 0.55, r: p.r })));
        stroke(x, l.map(([a, b]) => P(a, b)), rnd, 'rgba(95,65,40,0.85)', 0.9, 1, 0.8);
        stroke(x, r.map(([a, b]) => P(a, b)), rnd, 'rgba(95,65,40,0.85)', 0.9, 1, 0.8);
        rt.subs.forEach((sp) => stroke(x, sp.map((p) => P(p.x, p.y * 0.55)), rnd, 'rgba(95,65,40,0.6)', 0.7, 0.8, 0.6, 1));
        void pts;
      });
      // canopy: loose coloured-pencil masses first
      S.twigs.forEach((t) => {
        if (!t.nLeaves) return;
        const [cx, cy] = P((t.pts[1].x + t.tip.x) / 2, (t.pts[1].y + t.tip.y) / 2), rad = (5 + Math.sqrt(t.nLeaves) * 3) * S.OS * k * 0.8;
        x.strokeStyle = hsl(t.h, t.s * 0.75, Math.min(70, t.l + 18)); x.lineWidth = 2.2;
        for (let i = 0; i < 4 + t.nLeaves * 0.4; i++) {
          const a = rnd() * TAU, d = rnd() * rad;
          x.globalAlpha = 0.25 + rnd() * 0.2;
          x.beginPath(); x.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); x.lineTo(cx + Math.cos(a) * d + 6 + rnd() * 4, cy + Math.sin(a) * d - 3 - rnd() * 3); x.stroke();
        }
      });
      x.globalAlpha = 1;
      // wood: outlines in graphite, trunk hatched on the shaded side
      const tp = polyOf(S.trunk);
      const [tl, tr] = FT.geom.outline(S.trunk);
      hatch(x, tp, rnd, 1.05, 2.4, 'rgba(110,75,45,0.9)', 0.9, 0.75);
      // cross-hatch the shaded (right) half: between the spine and the right edge
      hatch(x, [...S.trunk.map((p) => P(p.x, p.y)), ...tl.slice().reverse().map(([a, b]) => P(a, b))], rnd, -0.95, 2.6, 'rgba(60,45,35,0.9)', 0.8, 0.6);
      stroke(x, tl.map(([a, b]) => P(a, b)), rnd, INK, 1.5, 1.2, 0.9);
      stroke(x, tr.map(([a, b]) => P(a, b)), rnd, INK, 1.5, 1.2, 0.9);
      for (let i = 0; i < 10 + S.wood / 3; i++) {
        const u = rnd() * 0.85, p = S.trunkPt(u), w = (rnd() * 2 - 1) * p.r * 0.7;
        stroke(x, [P(p.x + w, p.y), P(p.x + w + (rnd() - 0.5) * 1.5, p.y - 4 - rnd() * 10)], rnd, 'rgba(60,40,25,0.7)', 0.7, 0.4, 0.6, 1);
      }
      if (S.carving) { const p = S.trunkPt(S.carving.u), [hx, hy] = P(p.x, p.y), s = Math.max(4, p.r * k * 0.5);
        stroke(x, [[hx, hy + s * 0.7], [hx - s, hy - s * 0.1], [hx - s * 0.5, hy - s * 0.8], [hx, hy - s * 0.3], [hx + s * 0.5, hy - s * 0.8], [hx + s, hy - s * 0.1], [hx, hy + s * 0.7]], rnd, 'rgba(150,40,40,0.8)', 1, 0.6, 0.9); }
      S.limbs.forEach((l) => {
        const [a, b] = FT.geom.outline(l.pts);
        stroke(x, l.pts.map((p) => P(p.x, p.y)), rnd, 'rgba(150,110,70,0.5)', Math.max(1, l.pts[0].r * k * 1.4), 0.6, 0.5, 1);
        stroke(x, a.map(([u, v]) => P(u, v)), rnd, INK, 1.1, 1, 0.85);
        stroke(x, b.map(([u, v]) => P(u, v)), rnd, INK, 1.1, 1, 0.85);
      });
      S.branches.forEach((b) => stroke(x, b.pts.map((p) => P(p.x, p.y)), rnd, INK, Math.max(0.8, b.pts[0].r * k * 1.1), 0.9, 0.75));
      S.twigs.forEach((t) => {
        stroke(x, t.pts.map((p) => P(p.x, p.y)), rnd, INK, 0.8, 0.8, 0.7, 1);
        t.forks.concat(t.fine).forEach((f) => stroke(x, f.map((p) => P(p.x, p.y)), rnd, INK, 0.6, 0.6, 0.55, 1));
      });
      // leaves: a pencil outline and a stroke of colour each
      S.leaves.forEach((Lf) => {
        if (rnd() < 0.35) return;
        const [lx, ly] = P(Lf.x, Lf.y), len = Lf.size * k * 0.95, a = Lf.ang + (rnd() - 0.5) * 0.15;
        const c = Math.cos(a), s = Math.sin(a), ex = lx + c * len, ey = ly + s * len, w = len * 0.32;
        x.globalAlpha = 0.65;
        x.strokeStyle = hsl(Lf.h, Lf.s * 0.7, Math.min(62, Lf.l + 12)); x.lineWidth = Math.max(1.2, w * 0.9);
        x.beginPath(); x.moveTo(lx + c * len * 0.2, ly + s * len * 0.2); x.lineTo(lx + c * len * 0.8, ly + s * len * 0.8); x.stroke();
        x.globalAlpha = 0.7; x.strokeStyle = hsl(Lf.h, Lf.s * 0.6, Math.max(14, Lf.l * 0.55)); x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(lx, ly);
        x.quadraticCurveTo(lx + c * len * 0.5 - s * w + (rnd() - 0.5), ly + s * len * 0.5 + c * w, ex, ey);
        x.quadraticCurveTo(lx + c * len * 0.5 + s * w, ly + s * len * 0.5 - c * w + (rnd() - 0.5), lx, ly); x.stroke();
      });
      x.globalAlpha = 1;
      // fruit and blossom in coloured pencil
      const FRUIT = { easy: [352, 70, 45], long: [6, 70, 48], tempo: [32, 85, 52], hill: [272, 40, 40], race: [44, 85, 52] };
      S.fruits.forEach((f) => {
        const [fx, fy] = P(f.x, f.y + f.stem + f.size), r = Math.max(2.5, f.size * k * 0.9), col = FRUIT[f.kind];
        stroke(x, [P(f.x, f.y), [fx, fy - r]], rnd, INK, 0.7, 0.4, 0.8, 1);
        x.strokeStyle = hsl(col[0], col[1], col[2]); x.lineWidth = 1.4;
        for (let i = 0; i < 6; i++) { x.globalAlpha = 0.5; const a = rnd() * TAU; x.beginPath(); x.arc(fx + 0.6 * Math.cos(a), fy + 0.6 * Math.sin(a), r * (0.3 + i * 0.12), a, a + 4); x.stroke(); }
        x.globalAlpha = 0.9; x.strokeStyle = INK; x.lineWidth = 0.8; x.beginPath(); x.arc(fx + (rnd() - 0.5), fy, r, 0, TAU); x.stroke();
      });
      S.blossoms.forEach((b) => { const [bx, by] = P(b.x, b.y), r = Math.max(1.5, b.size * k * 0.6); x.strokeStyle = 'rgba(210,90,130,0.8)'; x.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + b.rot; x.beginPath(); x.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.7, 0, TAU); x.stroke(); } });
      if (S.nest) { const [nx, ny] = P(S.nest.x, S.nest.y), s = 7 * S.nest.scale * k * 0.9;
        for (let i = 0; i < 8; i++) stroke(x, [[nx - s, ny - rnd() * 2], [nx, ny + s * 0.5 + rnd() * 2], [nx + s, ny - rnd() * 2]], rnd, 'rgba(110,75,40,0.85)', 0.8, 1.4, 0.7, 1);
        for (let e = 0; e < S.nest.eggs; e++) { x.strokeStyle = 'rgba(70,130,160,0.9)'; x.lineWidth = 0.8; x.beginPath(); x.ellipse(nx - s * 0.7 + e * (s * 1.4 / Math.max(1, S.nest.eggs - 1 || 1)), ny - s * 0.25, s * 0.18, s * 0.24, 0, 0, TAU); x.stroke(); } }
      if (S.swing) { const [sx, sy] = P(S.swing.x, S.swing.y), len = S.swing.len * k, hw = S.swing.w * k / 2;
        stroke(x, [[sx - hw, sy], [sx - hw, sy + len]], rnd, INK, 0.8, 0.8, 0.8, 1); stroke(x, [[sx + hw, sy], [sx + hw, sy + len]], rnd, INK, 0.8, 0.8, 0.8, 1);
        stroke(x, [[sx - hw - 2, sy + len], [sx + hw + 2, sy + len]], rnd, 'rgba(120,80,40,0.9)', 2.2, 0.6, 0.9); }
      x.globalCompositeOperation = 'source-over';
      notes.forEach((n) => note(x, n, rnd));
    }
    function annotate() {
      const out = [], st = S.st, runsT = runsAt(T), k = L.k;
      const add = (target, text) => out.push({ tx: target[0], ty: target[1], text });
      const strong = S.roots.find((r) => r.strongest);
      const DAYS = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' };
      if (strong) { const tip = strong.pts[strong.pts.length - 1]; add(P(tip.x, tip.y * 0.55), `${DAYS[strong.day] || strong.day} — your anchor day (${strong.runs} runs)`); }
      const tm = S.trunkPt(0.45); add(P(tm.x + tm.r, tm.y), `${st.activeWeeks} growth rings — one for each week you ran`);
      const lf = S.fruits.find((f) => f.latest) || S.fruits[S.fruits.length - 1];
      if (lf) { const word = { easy: 'cherries: easy run', long: 'an apple: long run', tempo: 'an orange: fast run', hill: 'plums: hilly run', race: 'golden apple: race' }[lf.kind];
        add(P(lf.x, lf.y + lf.stem + lf.size), `latest: ${lf.run.km.toFixed(1)} km, ${fmtDate(lf.run.day, { year: undefined })} — ${word}`); }
      if (S.leaves.length) { const c = S.leaves.reduce((m, Lf) => (Lf.x > m.x ? Lf : m), S.leaves[0]); add(P(c.x, c.y), `leaves: ${seasonWord(S)} — ${Math.round(st.ratio * 100)}% of your usual load`); }
      if (S.nest) add(P(S.nest.x, S.nest.y), `${S.nest.streak}-week streak, ${S.nest.eggs} egg${S.nest.eggs > 1 ? 's' : ''}`);
      const gap = S.knots.filter((n) => n.kind === 'gap').sort((a, b) => b.size - a.size)[0];
      if (gap) { const p = S.trunkPt(gap.u); add(P(p.x, p.y), `a knot: ${gap.label}`); }
      const d = Math.floor(st.dormant);
      add(P(S.R * 1.5, 4), runsT.length ? (d <= 2 ? 'soil still damp from the last run' : d <= 7 ? `soil drying — ${d} days` : `soil cracked — ${d} days dry`) : 'a seed, waiting');
      if (S.swing) add(P(S.swing.x, S.swing.y + S.swing.len), '26 weeks — a swing!');
      // stack the notes down the ruled column, in target order
      out.sort((a, b) => a.ty - b.ty);
      const top = H * 0.17, bottom = H * 0.93, step = (bottom - top) / Math.max(1, out.length);
      out.forEach((n, i) => { n.x = W * 0.68; n.y = top + step * (i + 0.5); n.w = W * 0.27; });
      void k;
      return out;
    }
    function seasonWord(S) { const s = S.season; return S.winter ? 'bare, winter' : s < 0.3 ? 'falling' : s < 0.5 ? 'turning amber' : s < 0.68 ? 'late-summer yellow' : S.heat > 0.45 ? 'scorched tips' : s > 0.9 ? 'spring-fresh' : 'summer green'; }
    function note(x, n, rnd) {
      x.fillStyle = SEPIA; x.textAlign = 'left'; x.textBaseline = 'middle';
      const size = Math.max(13, Math.round(W * 0.028));
      x.font = `600 ${size}px Caveat, cursive`;
      const words = n.text.split(' '), lines = []; let cur = '';
      words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > n.w && cur) { lines.push(cur); cur = w; } else cur = t; });
      lines.push(cur);
      lines.forEach((l, i) => x.fillText(l, n.x, n.y + (i - (lines.length - 1) / 2) * size * 0.95));
      // a pencil arrow from the note to what it describes
      const sx = n.x - 6, sy = n.y, ex = n.tx + 3, ey = n.ty;
      const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 18;
      x.strokeStyle = 'rgba(90,59,34,0.65)'; x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(mx + (rnd() - 0.5) * 3, my + (rnd() - 0.5) * 3, ex, ey); x.stroke();
      const a = Math.atan2(ey - my, ex - mx);
      x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(a - 0.4) * 6, ey - Math.sin(a - 0.4) * 6); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(a + 0.4) * 6, ey - Math.sin(a + 0.4) * 6); x.stroke();
      x.textBaseline = 'alphabetic';
    }
    return {
      about: [
        ['Drawn, not rendered', 'The same tree, drawn in graphite and coloured pencil on a notebook page. Like a hand-drawn film, the lines are laid afresh six times a second.'],
        ['Notes in the margin', 'Hand-written notes point at what each part means: your anchor-day root, your latest fruit, the growth rings, the colour of the leaves, any knot where you paused.'],
        ['A page a week', 'The postmark counts the weeks. Scrub the slider and the whole page is redrawn as it was then: a running diary you can flip back through.'],
      ],
      enter() { build(); },
      setT() { build(); },
      resize() { build(); },
      frame(t) { if (t - lastBoil > (calm ? 1e9 : 166) || lastBoil < 0) { boil++; draw(); lastBoil = t; } },
    };
  }

  // ============================================================= INSIDE
  // The tree cut open: a hand-drawn world living inside the trunk.
  //   cut face rings  = weeks you ran          loft lanterns = latest runs
  //   library books   = milestones             hearth fire   = weekly streak
  //   larder jars     = months (filled by km)  root burrows  = weekdays
  //   sprouts         = recent runs: they carry water up from the roots,
  //                     and fall asleep by the embers when you stop.
  function pen(x, pts, rnd, col, w, jit, alpha, passes = 2) {
    for (let p = 0; p < passes; p++) {
      x.beginPath();
      pts.forEach((q, i) => { const X = q[0] + (rnd() - 0.5) * jit, Y = q[1] + (rnd() - 0.5) * jit; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.strokeStyle = col; x.globalAlpha = alpha * (0.6 + rnd() * 0.4); x.lineWidth = w * (0.75 + rnd() * 0.5); x.stroke();
    }
    x.globalAlpha = 1;
  }
  function hatchFill(x, poly, rnd, ang, gap, col, w, alpha) {
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
  const rectPoly = (a, b, w, h) => [[a, b], [a + w, b], [a + w, b + h], [a, b + h]];
  const circlePoly = (cx, cy, r, n = 18) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r]);

  function Inside() {
    let S, st, Lg, D, frames = [], paperC = null, fi = 0, lastBoil = 0, agents = [], hits = [], fx = [], lastT = 0;
    const INK = 'rgba(46,34,24,0.9)', WOOD = 'rgba(140,92,52,0.95)', u = () => W / 100;
    const KIND = { easy: [352, 70, 48], long: [8, 72, 50], tempo: [32, 88, 54], hill: [272, 42, 44], race: [44, 88, 52] };
    const KIND_NAME = { easy: 'easy run', long: 'long run', tempo: 'fast run', hill: 'hilly run', race: 'race' };

    function build() {
      S = FT.grow(M, T); st = S.st;
      Lg = geometry();
      D = contents();
      Lg.crown = crownMap();
      paperC = paper();
      hits = [];
      frames = [0, 1, 2].map((i) => drawStatic(i));
      agents = population();
      fx = [];
      hint.textContent = D.asleep && S.runsN ? 'Everyone has fallen asleep by the embers. A run wakes them.' : '';
      hint.className = 'hint paper top';
    }

    // ------------------------------------------------------------ layout
    function geometry() {
      const gy = H * 0.6, cx = W * 0.5, wood = clamp(S.wood / 100);
      const bw = W * (0.16 + 0.08 * wood), ty = H * 0.3, tw = bw * 0.74;
      const r0 = FT.rng(M.seed + ':inside');
      const bumps = [0, 1, 2].map(() => [r0() * TAU, 0.006 + r0() * 0.008]);
      const half = (y) => {
        const t = clamp((y - ty) / (gy - ty));
        let h = lerp(tw, bw, Math.pow(t, 1.25)) * (1 + 0.16 * Math.pow(t, 9));
        bumps.forEach(([p, a]) => { h += Math.sin(y / H * 16 + p) * a * W; });
        return h;
      };
      const ring = Math.max(10, bw * 0.17);
      const y0 = ty + H * 0.04, y1 = gy + H * 0.1, span = y1 - y0;
      const fl = { loft: y0 + span * 0.27, lib: y0 + span * 0.52, hearth: gy, cellar: y1 - H * 0.008 };
      const inner = (y) => (y <= gy ? half(y) - ring : (half(gy) - ring) * (1 - 0.35 * Math.pow(clamp((y - gy) / (y1 - gy)), 2)));
      const arch = span * 0.14, low = span * 0.08;
      const wAt = (y) => {
        let w = inner(y);
        if (y < y0 + arch) w *= Math.sqrt(clamp(1 - Math.pow((y0 + arch - y) / arch, 2)));
        if (y > y1 - low) w *= Math.sqrt(clamp(1 - Math.pow((y - (y1 - low)) / low, 2)));
        return w;
      };
      const open = [];
      for (let i = 0; i <= 70; i++) { const y = y0 + span * i / 70; open.push([cx - wAt(y), y]); }
      for (let i = 70; i >= 0; i--) { const y = y0 + span * i / 70; open.push([cx + wAt(y), y]); }
      const trunk = [];
      for (let i = 0; i <= 50; i++) { const y = ty + (gy + H * 0.012 - ty) * i / 50; trunk.push([cx - half(y), y]); }
      for (let i = 50; i >= 0; i--) { const y = ty + (gy + H * 0.012 - ty) * i / 50; trunk.push([cx + half(y), y]); }
      const lw = Math.min(inner(fl.loft), inner(y1 - low));
      return { gy, cx, bw, tw, ty, half, ring, y0, y1, span, fl, inner, wAt, open, trunk, ladderX: cx + lw * 0.62, sapX: cx - inner(fl.lib) * 0.8 };
    }

    function contents() {
      const runsT = runsAt(T);
      const fruits = S.fruits.slice().sort((a, b) => a.run.day - b.run.day).slice(-9);
      const ms = M.ms.filter((m) => m.day <= T).slice(-28);
      const months = M.months.filter((m) => m.d0 <= T).map((m) => ({ label: m.label, km: runsT.filter((r) => r.mkey === m.key).reduce((a, r) => a + r.km, 0) })).slice(-16);
      const asleep = runsT.length === 0 || st.dormant > 7;
      return {
        runsT, fruits, ms, months, asleep,
        fire: asleep ? 0.06 : clamp(0.28 + st.streak / 10),
        r28: runsT.filter((r) => T - r.day < 28),
        drops: runsT.filter((r) => T - r.day < 10).map((r) => ({ km: r.km, ph: (r.id % 97) / 97 })),
      };
    }

    // map the grown crown (twigs, leaves, fruit) into the space above the trunk
    function crownMap() {
      let x0 = 1e9, x1 = -1e9, ya = 1e9, yb = -1e9;
      const take = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); };
      S.twigs.forEach((t) => t.pts.forEach((p) => take(p.x, p.y)));
      S.leaves.forEach((L) => take(L.x, L.y));
      if (x0 > x1) { x0 = -40; x1 = 40; ya = -S.H; yb = -S.H * 0.5; }
      const top = H * 0.035, bottom = Lg.ty + H * 0.05, left = W * 0.05, right = W * 0.95;
      const kx = (right - left) / Math.max(40, x1 - x0), ky = (bottom - top) / Math.max(30, yb - ya);
      const k = Math.min(kx, ky * 1.25);
      const kxx = Math.min(kx, k * 1.35);
      const ox = W / 2 - kxx * (x0 + x1) / 2;
      return { k, map: (x, y) => [ox + x * kxx, top + (y - ya) * ky] };
    }

    // ------------------------------------------------------------ paper
    function paper() {
      const c = mk(W * dpr, H * dpr), x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = x.createRadialGradient(W * 0.5, H * 0.42, W * 0.15, W * 0.5, H * 0.5, W * 0.95);
      g.addColorStop(0, '#f7f0dd'); g.addColorStop(1, '#e2d2ad');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rr = FT.rng('paper2');
      for (let i = 0; i < 3200; i++) { x.fillStyle = rr() < 0.5 ? `rgba(120,95,60,${rr() * 0.07})` : `rgba(255,255,255,${rr() * 0.22})`; x.fillRect(rr() * W, rr() * H, 1 + rr() * 2, 0.6); }
      return c;
    }

    // ------------------------------------------------------------ static drawing (three boil frames)
    function drawStatic(i) {
      const c = mk(W * dpr, H * dpr), x = c.getContext('2d'), rnd = FT.rng('inside-boil' + i);
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(paperC, 0, 0);
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round';
      x.globalCompositeOperation = 'multiply';
      landscape(x, rnd, i);
      soil(x, rnd, i);
      roots(x, rnd, i);
      trunk(x, rnd);
      rooms(x, rnd, i);
      crown(x, rnd, i);
      x.globalCompositeOperation = 'source-over';
      caption(x);
      return c;
    }

    function landscape(x, rnd) {
      const gy = Lg.gy, hy = gy - H * 0.035;
      for (let k = 0; k < 2; k++) {
        const pts = []; for (let X = -10; X <= W + 10; X += 10) pts.push([X, hy - k * H * 0.02 - Math.sin(X / W * 5 + k * 2) * H * 0.012 - Math.sin(X / W * 13 + k) * H * 0.005]);
        pen(x, pts, rnd, `rgba(90,110,80,${0.35 - k * 0.12})`, 0.8, 0.8, 0.8, 1);
      }
      const rr = FT.rng('copses');
      for (let i = 0; i < 9; i++) {      // distant trees, a few strokes each
        const X = rr() * W; if (Math.abs(X - Lg.cx) < Lg.bw * 1.4) continue;
        const Y = hy - H * 0.012 - rr() * H * 0.01, r = W * (0.008 + rr() * 0.01);
        x.strokeStyle = 'rgba(100,125,85,0.45)'; x.lineWidth = 0.8;
        for (let k = 0; k < 7; k++) { const a = rnd() * TAU; x.beginPath(); x.arc(X + Math.cos(a) * r * 0.4, Y + Math.sin(a) * r * 0.3, r * (0.5 + rnd() * 0.4), 0, TAU); x.stroke(); }
        pen(x, [[X, Y + r], [X, hy]], rnd, 'rgba(90,70,50,0.5)', 0.7, 0.3, 0.7, 1);
      }
      const gl = []; for (let X = -10; X <= W + 10; X += 9) gl.push([X, gy + Math.sin(X / 41) * 1.2]);
      pen(x, gl, rnd, INK, 1.2, 1.2, 0.85);
      const [gh, gs, gll] = seasonRGB(S.season * 0.85 + 0.1);
      for (let X = 0; X < W; X += 3 + rnd() * 5) {
        if (Math.abs(X - Lg.cx) < Lg.half(gy) * 0.98) continue;
        pen(x, [[X, gy], [X + (rnd() - 0.5) * 4, gy - 3 - rnd() * 8]], rnd, S.winter ? 'rgba(130,120,100,0.8)' : hsl(gh, gs * 0.7, gll * 0.95), 0.9, 0.4, 0.75, 1);
      }
    }

    function soil(x, rnd) {
      const gy = Lg.gy, m = S.moisture, bottom = H * 0.95;
      const ink = m > 0.5 ? 'rgba(70,48,30,' : 'rgba(120,90,60,';
      for (let i = 0; i < 1500; i++) {
        const t = Math.pow(rnd(), 1.4), y = gy + 3 + t * (bottom - gy);
        x.fillStyle = ink + (0.12 + rnd() * 0.32) * (1 - t * 0.7) * (0.6 + m * 0.6) + ')';
        x.fillRect(rnd() * W, y, 1.1, 1.1);
      }
      hatchFill(x, [[0, gy + 2], [W, gy + 2], [W, gy + H * 0.05], [0, gy + H * 0.05]], rnd, 0.15, m > 0.5 ? 3 : 6, 'rgba(110,75,45,0.8)', 0.7, 0.35 + 0.35 * m);
      const rr = FT.rng('stones');
      for (let i = 0; i < 16; i++) {
        const X = rr() * W, Y = gy + H * 0.04 + rr() * (bottom - gy - H * 0.06), r = W * (0.006 + rr() * 0.012);
        if (Math.abs(X - Lg.cx) < Lg.half(gy) * 0.9 && Y < Lg.y1 + 6) continue;
        pen(x, circlePoly(X, Y, r, 10).concat([circlePoly(X, Y, r, 10)[0]]).map(([a, b]) => [a, b + (a - X) * 0.1]), rnd, 'rgba(90,80,70,0.7)', 0.8, 0.8, 0.7, 1);
      }
      if (m < 0.42) {      // dry: cracks in the topsoil
        for (let i = 0; i < Math.round(26 * (1 - m)); i++) {
          let X = rnd() * W, Y = gy + 2; const pts = [[X, Y]];
          for (let k = 0; k < 4; k++) { X += (rnd() - 0.5) * 8; Y += 3 + rnd() * 6; pts.push([X, Y]); }
          pen(x, pts, rnd, 'rgba(70,45,25,0.8)', 0.9, 0.5, 0.8, 1);
        }
      }
    }

    function roots(x, rnd) {
      const { cx, y1 } = Lg, bottom = H * 0.86;
      Lg.roots = [];
      const max = Math.max(1, ...S.roots.map((r) => r.runs));
      S.roots.forEach((rt, i) => {
        const side = (i - 3) / 3;               // weekday order, left to right
        const ang = lerp(Math.PI * 0.92, Math.PI * 0.08, i / 6) + (FT.rng(M.seed + ':ir' + i)() - 0.5) * 0.2;
        const len = (0.1 + 0.26 * Math.sqrt(rt.runs / max)) * W * (rt.runs ? 1 : 0.45);
        const thick = Math.max(2.5, W * (0.006 + 0.03 * Math.sqrt(rt.share)));
        const sx = cx + side * Lg.inner(y1 - 4) * 0.7, sy = y1 - H * 0.01;
        const pts = [];
        const rr = FT.rng(M.seed + ':irp' + i);
        let px = sx, py = sy, a = Math.PI / 2 - (Math.PI / 2 - ang) * 0.75;
        for (let k = 0; k <= 14; k++) {
          pts.push([px, py]);
          a += (rr() - 0.5) * 0.35 + (Math.PI / 2 - a) * 0.04;
          px += Math.cos(a) * len / 14 * (1 + Math.abs(side) * 0.6); py += Math.sin(a) * len / 14 * 0.75;
          py = Math.min(py, bottom - 8); px = clamp(px, W * 0.06, W * 0.94);
        }
        const widthAt = (k) => thick * (1 - 0.65 * k / 14);
        const L = [], Rr = [];
        pts.forEach(([X, Y], k) => {
          const q = pts[Math.min(14, k + 1)], p0 = pts[Math.max(0, k - 1)];
          const dx = q[0] - p0[0], dy = q[1] - p0[1], d = Math.hypot(dx, dy) || 1, w = widthAt(k);
          L.push([X - dy / d * w, Y + dx / d * w]); Rr.push([X + dy / d * w, Y - dx / d * w]);
        });
        hatchFill(x, [...L, ...Rr.slice().reverse()], rnd, 0.8, 2.6, rt.strongest ? 'rgba(160,100,50,0.95)' : 'rgba(130,90,55,0.85)', 0.8, 0.7);
        pen(x, L, rnd, 'rgba(90,60,35,0.9)', 1, 0.8, 0.85);
        pen(x, Rr, rnd, 'rgba(90,60,35,0.9)', 1, 0.8, 0.85);
        if (thick > 5) pen(x, pts, rnd, 'rgba(250,236,205,0.9)', thick * 0.55, 0.5, 0.65, 1);   // the tunnel inside the root
        // the burrow at the tip
        const [bx, by] = pts[14], br = Math.max(6, thick * 1.6);
        hatchFill(x, circlePoly(bx, by, br), rnd, -0.6, 2.4, 'rgba(120,80,45,0.8)', 0.7, 0.55);
        pen(x, circlePoly(bx, by, br, 16).concat([circlePoly(bx, by, br, 16)[0]]), rnd, 'rgba(80,55,30,0.9)', 1, 0.8, 0.85);
        x.fillStyle = 'rgba(70,45,25,0.85)'; x.font = `600 ${Math.round(W * 0.026)}px Caveat, cursive`; x.textAlign = 'center';
        x.fillText(rt.day, bx, by + br + W * 0.03);
        Lg.roots.push({ pts, burrow: [bx, by], br, rt });
        hits.push({ x: bx, y: by, r: br + 8, text: `${rt.day} root — ${rt.runs} runs, ${rt.km.toFixed(0)} km${rt.strongest ? ' · your anchor day' : ''}` });
      });
    }

    function trunk(x, rnd) {
      const { trunk: tp, open, cx, gy, ty } = Lg;
      // bark: hatched, darker on the right
      hatchFill(x, tp, rnd, 1.25, 3.2, 'rgba(110,72,42,0.9)', 0.9, 0.55);
      hatchFill(x, tp.filter(([a]) => a >= cx - 1).concat([[cx, gy], [cx, ty]]), rnd, -1.1, 3, 'rgba(60,42,30,0.9)', 0.8, 0.45);
      for (let i = 0; i < 40; i++) {
        const y = ty + rnd() * (gy - ty), side = rnd() < 0.5 ? -1 : 1, X = cx + side * Lg.half(y) * (0.86 + rnd() * 0.12);
        pen(x, [[X, y], [X + (rnd() - 0.5) * 2, y - 6 - rnd() * 14]], rnd, 'rgba(60,40,25,0.75)', 0.8, 0.4, 0.7, 1);
      }
      const half = tp.length / 2;
      pen(x, tp.slice(0, half), rnd, INK, 1.6, 1.2, 0.95);
      pen(x, tp.slice(half), rnd, INK, 1.6, 1.2, 0.95);
      // the cut face: pale wood with one ring per week you ran
      x.save(); x.beginPath(); tp.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
      open.slice().reverse().forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
      x.fillStyle = 'rgba(236,206,150,0.55)'; x.fill('evenodd');
      x.restore();
      const weeks = M.weeks.slice(0, st.wk + 1);
      const shown = weeks.slice(-36), ringW = Lg.ring * 0.82;
      shown.forEach((w, k) => {
        const f = (k + 1) / (shown.length + 1);
        const pts = open.map(([a, b]) => { const dx = a - cx, sgn = Math.sign(dx) || 1; return [a + sgn * ringW * f, b - (b < Lg.y0 + Lg.span * 0.2 ? ringW * f * 0.8 : 0)]; });
        const col = w.runs ? `rgba(150,100,55,${0.25 + w.strength * 0.4})` : 'rgba(70,40,20,0.85)';
        pen(x, pts.filter((_, i) => i % 2 === 0), rnd, col, w.runs ? 0.6 : 1.4, 0.5, 0.8, 1);
      });
      pen(x, open.concat([open[0]]), rnd, INK, 1.4, 1, 0.9);
      hits.push({ poly: tp, text: `${st.activeWeeks} growth rings in the cut — one for each week with a run` });
      // the hollow: warm, shadowed wood
      x.save(); x.beginPath(); open.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
      x.fillStyle = 'rgba(176,120,70,0.55)'; x.fillRect(0, 0, W, H);
      x.restore();
      hatchFill(x, open, rnd, 0.9, 2.8, 'rgba(120,70,35,0.9)', 0.8, 0.5);
      hatchFill(x, open.filter(([a]) => a > cx), rnd, -0.9, 3.2, 'rgba(70,40,20,0.9)', 0.8, 0.35);
    }

    function rooms(x, rnd) {
      const { cx, fl, y0, y1, gy, ladderX, sapX, inner } = Lg, U = u();
      const floor = (y, gapX) => {
        const w = inner(y) * 0.995, th = H * 0.011;
        [[cx - w, gapX - U * 2.4], [gapX + U * 2.4, cx + w]].forEach(([a, b]) => {
          if (b - a < 4) return;
          hatchFill(x, rectPoly(a, y, b - a, th), rnd, 0.1, 2.2, 'rgba(120,80,45,0.95)', 0.8, 0.8);
          pen(x, [[a, y], [b, y]], rnd, INK, 1.1, 0.6, 0.9); pen(x, [[a, y + th], [b, y + th]], rnd, INK, 0.8, 0.6, 0.7, 1);
          for (let X = a + U * 4; X < b; X += U * 5 + rnd() * U * 2) pen(x, [[X, y], [X, y + th]], rnd, INK, 0.6, 0.3, 0.6, 1);
        });
      };
      floor(fl.loft, ladderX); floor(fl.lib, ladderX);
      // ladder from the larder to the loft
      const lt = fl.loft - U * 0.4, lb = fl.cellar - U * 0.5;
      pen(x, [[ladderX - U * 1.6, lb], [ladderX - U * 1.6, lt]], rnd, WOOD, 1.4, 0.6, 0.95);
      pen(x, [[ladderX + U * 1.6, lb], [ladderX + U * 1.6, lt]], rnd, WOOD, 1.4, 0.6, 0.95);
      for (let y = lb - U * 1.5; y > lt; y -= U * 2.4) pen(x, [[ladderX - U * 1.6, y], [ladderX + U * 1.6, y]], rnd, WOOD, 1, 0.5, 0.9, 1);
      // the sap channel: water rising from the roots to the leaves
      [-1, 1].forEach((s) => pen(x, [[sapX + s * U * 0.9, y1 - H * 0.02], [sapX + s * U * 0.9, Lg.ty - H * 0.01]], rnd, 'rgba(70,110,140,0.8)', 0.9, 0.6, 0.85));
      hatchFill(x, rectPoly(sapX - U * 0.9, Lg.ty, U * 1.8, y1 - Lg.ty - H * 0.02), rnd, 1.5, 2, 'rgba(120,170,200,0.9)', 0.6, 0.35);
      hits.push({ rect: [sapX - U * 2, Lg.ty, U * 4, y1 - Lg.ty], text: D.drops.length ? `The sap channel — ${D.drops.length} drop${D.drops.length > 1 ? 's' : ''} rising, one for each run in the last 10 days` : 'The sap channel — dry; it fills after a run' });

      // ---- library: one book per milestone
      const shelfL = sapX + U * 3, shelfR = ladderX - U * 3.2, rh = fl.lib - fl.loft;
      const shelves = [fl.lib - rh * 0.08, fl.lib - rh * 0.52];
      shelves.forEach((sy) => { pen(x, [[shelfL - U, sy], [shelfR + U, sy]], rnd, WOOD, 2, 0.6, 0.95); });
      let bx = shelfL, si = 0;
      const BOOK = { First: [0, 65, 45], km: [140, 40, 38], runs: [212, 45, 45], other: [36, 60, 45] };
      D.ms.forEach((m) => {
        const kind = /^First|marathon/i.test(m.label) ? 'First' : /km/.test(m.label) ? 'km' : /runs/.test(m.label) ? 'runs' : 'other';
        const bw = U * (1.3 + (kind === 'First' ? 0.6 : 0)), bh = rh * (0.26 + (kind === 'First' ? 0.1 : 0) + rnd() * 0.04);
        if (bx + bw > shelfR) { bx = shelfL; si++; }
        if (si > 1) return;
        const sy = shelves[si], col = BOOK[kind];
        hatchFill(x, rectPoly(bx, sy - bh, bw, bh), rnd, 1.4, 1.6, hsl(col[0], col[1], col[2]), 0.8, 0.85);
        pen(x, [[bx, sy], [bx, sy - bh], [bx + bw, sy - bh], [bx + bw, sy]], rnd, INK, 0.7, 0.4, 0.8, 1);
        hits.push({ rect: [bx, sy - bh, bw, bh], text: `📖 ${m.label} · ${m.t.slice(0, 10)}` });
        bx += bw + U * 0.25;
      });
      if (!D.ms.length) { x.fillStyle = 'rgba(70,45,25,0.7)'; x.font = `600 ${Math.round(W * 0.028)}px Caveat, cursive`; x.textAlign = 'center'; x.fillText('empty shelves, for now', (shelfL + shelfR) / 2, shelves[0] - rh * 0.15); }
      hits.push({ rect: [shelfL, fl.loft, shelfR - shelfL, rh], text: `The library — ${D.ms.length} book${D.ms.length === 1 ? '' : 's'}, one for every milestone` });

      // ---- hearth: the fire is the weekly streak
      const hx = cx - inner(gy - 4) * 0.28, hw = Math.min(U * 11, inner(gy) * 0.5), hh = (gy - fl.lib) * 0.55;
      Lg.hearth = { x: hx, y: gy, w: hw, h: hh };
      for (let k = 0; k < 14; k++) {      // stone arch
        const a = Math.PI + (k / 13) * Math.PI, r = hw * 0.62;
        const sx = hx + Math.cos(a) * r, sy = gy - hh * 0.55 + Math.sin(a) * r * 0.9;
        pen(x, circlePoly(sx, sy, U * 1.3, 8).concat([circlePoly(sx, sy, U * 1.3, 8)[0]]), rnd, 'rgba(90,85,80,0.9)', 0.9, 0.6, 0.85, 1);
      }
      [[-1], [1]].forEach(([s]) => { for (let y = gy - hh * 0.55; y < gy; y += U * 2.4) pen(x, circlePoly(hx + s * hw * 0.62, y + U, U * 1.25, 8).concat([circlePoly(hx + s * hw * 0.62, y + U, U * 1.25, 8)[0]]), rnd, 'rgba(90,85,80,0.9)', 0.9, 0.6, 0.85, 1); });
      hatchFill(x, [[hx - hw * 0.5, gy], [hx - hw * 0.5, gy - hh * 0.55], [hx + hw * 0.5, gy - hh * 0.55], [hx + hw * 0.5, gy]], rnd, 0.6, 2.4, 'rgba(40,25,15,0.9)', 0.9, 0.55);
      pen(x, [[hx - hw * 0.85, gy - hh * 1.08], [hx + hw * 0.85, gy - hh * 1.08]], rnd, WOOD, 2.6, 0.6, 0.95);       // mantel
      const rx = hx + hw * 0.9;           // a rug and two stools
      hatchFill(x, Array.from({ length: 20 }, (_, i) => [rx + Math.cos(i / 20 * TAU) * U * 9, gy - U * 0.6 + Math.sin(i / 20 * TAU) * U * 1.2]), rnd, 0.3, 1.8, 'rgba(170,60,50,0.85)', 0.8, 0.6);
      [rx - U * 4, rx + U * 4.5].forEach((sx) => { pen(x, [[sx - U * 1.5, gy - U * 2.6], [sx + U * 1.5, gy - U * 2.6]], rnd, WOOD, 1.6, 0.4, 0.9); pen(x, [[sx - U, gy - U * 2.6], [sx - U * 1.3, gy]], rnd, WOOD, 0.9, 0.4, 0.9, 1); pen(x, [[sx + U, gy - U * 2.6], [sx + U * 1.3, gy]], rnd, WOOD, 0.9, 0.4, 0.9, 1); });
      hits.push({ rect: [hx - hw, gy - hh * 1.1, hw * 2, hh * 1.1], text: D.asleep ? 'The hearth — only embers left. A run rekindles it.' : `The hearth — burning for a ${st.streak}-week streak` });

      // ---- larder: one jar per month, filled by its kilometres
      const cl = cx - inner(gy + 6) * 0.86, cr = ladderX - U * 3, chh = fl.cellar - gy;
      const jarShelves = [gy + chh * 0.48, gy + chh * 0.92];
      jarShelves.forEach((sy) => pen(x, [[cl, sy], [cr, sy]], rnd, WOOD, 1.8, 0.5, 0.9));
      const maxKm = Math.max(1, ...D.months.map((m) => m.km));
      const perShelf = Math.max(1, Math.floor((cr - cl) / (U * 3.4)));
      D.months.slice(-perShelf * 2).forEach((m, k) => {
        const row = Math.floor(k / perShelf), col = k % perShelf;
        const jx = cl + U * 0.6 + col * U * 3.4, sy = jarShelves[row], jh = chh * 0.34, jw = U * 2.6;
        const fill = m.km / maxKm;
        if (fill > 0) hatchFill(x, rectPoly(jx + 1, sy - jh * fill * 0.86, jw - 2, jh * fill * 0.86), rnd, 1.2, 1.4, 'rgba(225,150,40,0.95)', 0.9, 0.85);
        pen(x, [[jx, sy - jh * 0.88], [jx, sy], [jx + jw, sy], [jx + jw, sy - jh * 0.88]], rnd, 'rgba(70,90,100,0.85)', 0.8, 0.5, 0.85, 1);
        pen(x, [[jx - U * 0.2, sy - jh * 0.9], [jx + jw + U * 0.2, sy - jh * 0.9]], rnd, 'rgba(140,60,40,0.9)', 2, 0.3, 0.9, 1);
        hits.push({ rect: [jx, sy - jh, jw, jh], text: `🫙 ${m.label} — ${m.km.toFixed(0)} km` });
      });
      hits.push({ rect: [cl, gy, cr - cl, chh], text: `The larder — a jar for every month, filled by its kilometres` });
    }

    function crown(x, rnd) {
      const C = Lg.crown, map = C.map, { cx, tw, ty } = Lg;
      const anchorFor = (X) => { const dx = clamp(X - cx, -tw * 0.85, tw * 0.85); return [cx + dx, ty + H * 0.01 + Math.abs(dx) / tw * H * 0.025]; };
      // limbs (months) rise out of the trunk top
      Lg.limbPts = {};
      S.limbs.forEach((l) => {
        const m = l.pts.map((p) => map(p.x, p.y));
        const a = anchorFor(m[Math.floor(m.length * 0.4)][0]);
        const path = [a, ...m.slice(Math.floor(m.length * 0.35))];
        const w = Math.max(1.4, (1.6 + 4.5 * l.vigor) * (W / 600));
        const tube = path.map(([X, Y], k) => ({ x: X, y: Y, r: w * (1 - 0.7 * k / (path.length - 1)) }));
        const [lo, ro] = FT.geom.outline(tube);
        hatchFill(x, [...lo, ...ro.slice().reverse()], rnd, 1.1, 2, 'rgba(120,80,45,0.9)', 0.7, 0.55);
        pen(x, lo, rnd, INK, 0.9, 0.8, 0.85, 1);
        pen(x, ro, rnd, INK, 0.9, 0.8, 0.85, 1);
        Lg.limbPts[l.li] = path;
      });
      S.branches.forEach((b) => pen(x, b.pts.map((p) => map(p.x, p.y)), rnd, INK, Math.max(0.8, b.pts[0].r * C.k * 0.9), 0.9, 0.75));
      S.twigs.forEach((t) => { pen(x, t.pts.map((p) => map(p.x, p.y)), rnd, INK, 0.8, 0.8, 0.7, 1); t.fine.forEach((f) => pen(x, f.map((p) => map(p.x, p.y)), rnd, INK, 0.5, 0.5, 0.5, 1)); });
      // leaves: a stroke of colour and a pencil outline
      S.leaves.forEach((Lf) => {
        if (rnd() < 0.25) return;
        const [lx, ly] = map(Lf.x, Lf.y), len = Lf.size * C.k * 0.85 + 3, a = Lf.ang + (rnd() - 0.5) * 0.2;
        const c = Math.cos(a), s = Math.sin(a), w = len * 0.32;
        x.globalAlpha = 0.6; x.strokeStyle = hsl(Lf.h, Lf.s * 0.75, Math.min(64, Lf.l + 12)); x.lineWidth = Math.max(1.4, w);
        x.beginPath(); x.moveTo(lx + c * len * 0.2, ly + s * len * 0.2); x.lineTo(lx + c * len * 0.8, ly + s * len * 0.8); x.stroke();
        x.globalAlpha = 0.65; x.strokeStyle = hsl(Lf.h, Lf.s * 0.6, Math.max(14, Lf.l * 0.5)); x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(lx, ly); x.quadraticCurveTo(lx + c * len * 0.5 - s * w, ly + s * len * 0.5 + c * w, lx + c * len, ly + s * len);
        x.quadraticCurveTo(lx + c * len * 0.5 + s * w, ly + s * len * 0.5 - c * w, lx, ly); x.stroke();
      });
      x.globalAlpha = 1;
      S.blossoms.forEach((b) => { const [bx, by] = map(b.x, b.y), r = 2.2; for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + b.rot; pen(x, circlePoly(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.7, 7).concat([circlePoly(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.7, 7)[0]]), rnd, 'rgba(215,95,135,0.85)', 0.7, 0.3, 0.8, 1); } });
      S.fruits.forEach((f) => {
        const [fx, fy0] = map(f.x, f.y), r = Math.max(2.6, f.size * C.k * 0.7), fy = fy0 + r * 1.6, col = KIND[f.kind];
        pen(x, [[fx, fy0], [fx, fy - r]], rnd, INK, 0.7, 0.3, 0.8, 1);
        hatchFill(x, circlePoly(fx, fy, r, 12), rnd, 0.9, 1.3, hsl(col[0], col[1], col[2]), 1, 0.9);
        pen(x, circlePoly(fx, fy, r, 14).concat([circlePoly(fx, fy, r, 14)[0]]), rnd, INK, 0.7, 0.4, 0.8, 1);
        hits.push({ x: fx, y: fy, r: r + 6, text: `${KIND_NAME[f.kind]} · ${f.run.km.toFixed(1)} km · ${fmtDate(f.run.day, { year: undefined })}` });
      });
      if (S.nest) {
        const [nx, ny] = map(S.nest.x, S.nest.y), s = W * 0.025;
        for (let i = 0; i < 7; i++) pen(x, [[nx - s, ny - rnd() * 2], [nx, ny + s * 0.5 + rnd() * 2], [nx + s, ny - rnd() * 2]], rnd, 'rgba(110,75,40,0.85)', 0.8, 1.4, 0.7, 1);
        for (let e = 0; e < S.nest.eggs; e++) hatchFill(x, circlePoly(nx - s * 0.7 + e * (s * 1.4 / Math.max(1, S.nest.eggs - 1)), ny - s * 0.25, s * 0.2, 8), rnd, 0.5, 1.2, 'rgba(90,160,190,0.9)', 0.8, 0.9);
        hits.push({ x: nx, y: ny, r: s * 1.4, text: `Nest — ${S.nest.streak}-week streak, ${S.nest.eggs} egg${S.nest.eggs > 1 ? 's' : ''}` });
      }
      if (S.swing && Lg.limbPts[S.swing.li]) {
        const lp = Lg.limbPts[S.swing.li], [sx, sy] = lp[Math.floor(lp.length * 0.55)], bot = Lg.gy - H * 0.04, hw = W * 0.025;
        if (bot - sy > H * 0.08 && Math.abs(sx - cx) > Lg.half(sy + 1) + hw) {
          pen(x, [[sx - hw, sy], [sx - hw, bot]], rnd, INK, 0.8, 0.6, 0.8, 1); pen(x, [[sx + hw, sy], [sx + hw, bot]], rnd, INK, 0.8, 0.6, 0.8, 1);
          pen(x, [[sx - hw - 3, bot], [sx + hw + 3, bot]], rnd, 'rgba(120,80,40,0.9)', 2.6, 0.5, 0.9);
          hits.push({ rect: [sx - hw - 4, sy, hw * 2 + 8, bot - sy], text: 'The swing — 26 weeks with a run' });
        }
      }
    }

    function caption(x) {
      x.fillStyle = 'rgba(80,55,30,0.8)'; x.textAlign = 'left';
      x.font = `700 ${Math.round(W * 0.05)}px Caveat, cursive`; x.fillText(`${name}'s tree`, W * 0.05, H * 0.975);
      x.textAlign = 'right'; x.font = `600 ${Math.round(W * 0.03)}px Caveat, cursive`;
      x.fillText(`${fmtDate(T)} · ${S.runsN} runs · ${Math.round(S.kmT)} km`, W * 0.95, H * 0.975);
    }

    // ------------------------------------------------------------ the inhabitants
    function population() {
      const A = [];
      if (!S.runsN) return A;
      const { fl, gy, ladderX, cx, inner } = Lg, U = u();
      const rug = Lg.hearth.x + Lg.hearth.w * 0.9;
      if (D.asleep) {
        const n = Math.min(6, 2 + Math.floor(S.runsN / 25));
        for (let i = 0; i < n; i++) A.push({ role: 'sleep', x: rug - U * 6 + i * U * 2.6, y: gy - U * 0.4, ph: i * 1.3 });
        return A;
      }
      const carriers = Math.min(10, Math.ceil(D.r28.length * 0.5));
      const order = Lg.roots.map((r, i) => i).sort((a, b) => Lg.roots[b].rt.runs - Lg.roots[a].rt.runs);
      for (let i = 0; i < carriers; i++) {
        const R = Lg.roots[order[i % order.length]];
        const path = R.pts.slice().reverse().map(([X, Y]) => [X, Y]);
        path.push([ladderX, fl.cellar - U * 0.3]);
        path.push([ladderX, fl.loft]);
        path.push([ladderX - U * 6 - (i % 3) * U * 3, fl.loft]);
        A.push(walker('carry', path, i / carriers));
      }
      const sitters = 1 + (st.streak >= 4) + (st.streak >= 8);
      for (let i = 0; i < sitters; i++) A.push({ role: 'sit', x: rug + (i - 1) * U * 4.2, y: gy - U * 2.6 - U * 0.2, ph: i * 2.1 });
      if (D.ms.length) A.push({ role: 'read', x: cx - inner(fl.lib) * 0.15, y: fl.lib, ph: 0.7 });
      if (D.months.length >= 3) A.push(walker('keep', [[cx - inner(gy + 6) * 0.8, fl.cellar - U * 0.3], [ladderX - U * 4, fl.cellar - U * 0.3]], 0.3));
      return A;
    }
    function walker(role, path, phase) {
      const seg = []; let total = 0;
      for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d; }
      return { role, path, seg, total, s: phase * total, dir: 1, speed: W * (role === 'keep' ? 0.02 : 0.045) * (0.8 + phase * 0.4) };
    }
    function along(a) {
      let s = a.s;
      for (let i = 0; i < a.seg.length; i++) {
        if (s <= a.seg[i] || i === a.seg.length - 1) {
          const t = a.seg[i] ? clamp(s / a.seg[i]) : 0, p = a.path[i], q = a.path[i + 1];
          return { x: lerp(p[0], q[0], t), y: lerp(p[1], q[1], t), climb: Math.abs(q[0] - p[0]) < 1 && Math.abs(q[1] - p[1]) > 1, dx: q[0] - p[0] };
        }
        s -= a.seg[i];
      }
      return { x: a.path[0][0], y: a.path[0][1], climb: false, dx: 1 };
    }
    function sprout(x, X, Y, s, o) {
      const step = o.step, face = o.face || 1;
      x.save(); x.translate(X, Y);
      if (o.sleep) { x.rotate(-1.35); }
      x.lineCap = 'round';
      // legs
      x.strokeStyle = 'rgba(60,45,30,0.95)'; x.lineWidth = Math.max(1, s * 0.12);
      if (!o.sit && !o.sleep) {
        const k = o.climb ? (step ? 0.5 : -0.5) : (step ? 0.45 : -0.45);
        x.beginPath(); x.moveTo(-s * 0.18, -s * 0.35); x.lineTo(-s * 0.18 + k * s * 0.4, 0); x.stroke();
        x.beginPath(); x.moveTo(s * 0.18, -s * 0.35); x.lineTo(s * 0.18 - k * s * 0.4, 0); x.stroke();
      } else { x.beginPath(); x.moveTo(-s * 0.2, -s * 0.3); x.lineTo(-s * 0.35, -s * 0.05); x.moveTo(s * 0.2, -s * 0.3); x.lineTo(s * 0.35, -s * 0.05); x.stroke(); }
      // body: a round seed
      const bob = o.bob || 0;
      x.fillStyle = '#f2e6c8'; x.strokeStyle = 'rgba(60,45,30,0.95)'; x.lineWidth = Math.max(0.9, s * 0.08);
      x.beginPath(); x.ellipse(0, -s * 0.72 + bob, s * 0.52, s * 0.48, 0, 0, TAU); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(180,150,110,0.6)'; x.lineWidth = s * 0.05;
      x.beginPath(); x.arc(-s * 0.08, -s * 0.66 + bob, s * 0.3, 0.3, 1.6); x.stroke();
      // eyes
      x.fillStyle = 'rgba(40,30,20,0.95)'; x.strokeStyle = 'rgba(40,30,20,0.95)'; x.lineWidth = s * 0.06;
      if (o.sleep || o.blink) { x.beginPath(); x.moveTo(face * s * 0.02, -s * 0.78 + bob); x.lineTo(face * s * 0.14, -s * 0.78 + bob); x.moveTo(face * s * 0.24, -s * 0.78 + bob); x.lineTo(face * s * 0.36, -s * 0.78 + bob); x.stroke(); }
      else { x.beginPath(); x.arc(face * s * 0.1, -s * 0.8 + bob, s * 0.06, 0, TAU); x.arc(face * s * 0.3, -s * 0.8 + bob, s * 0.06, 0, TAU); x.fill(); }
      // the sprout on its head
      const [gh, gs, gl] = seasonRGB(Math.max(0.6, S.season));
      x.strokeStyle = 'rgba(70,90,40,0.95)'; x.lineWidth = s * 0.07;
      x.beginPath(); x.moveTo(0, -s * 1.18 + bob); x.quadraticCurveTo(s * 0.05, -s * 1.4 + bob, 0, -s * 1.5 + bob); x.stroke();
      x.fillStyle = hsl(gh, gs, gl);
      x.beginPath(); x.ellipse(-s * 0.16, -s * 1.5 + bob, s * 0.2, s * 0.09, -0.5 + (o.sway || 0), 0, TAU); x.fill();
      x.beginPath(); x.ellipse(s * 0.16, -s * 1.52 + bob, s * 0.2, s * 0.09, 0.5 + (o.sway || 0), 0, TAU); x.fill();
      if (o.carry) {        // a drop of water, carried up from the roots
        x.fillStyle = 'rgba(110,170,215,0.95)'; x.strokeStyle = 'rgba(40,80,120,0.9)'; x.lineWidth = s * 0.05;
        x.beginPath(); x.moveTo(0, -s * 2.15 + bob); x.quadraticCurveTo(s * 0.32, -s * 1.75 + bob, 0, -s * 1.62 + bob); x.quadraticCurveTo(-s * 0.32, -s * 1.75 + bob, 0, -s * 2.15 + bob); x.fill(); x.stroke();
      }
      if (o.book) { x.fillStyle = 'rgba(160,50,40,0.9)'; x.fillRect(face * s * 0.2, -s * 0.62 + bob, s * 0.45, s * 0.3); }
      x.restore();
    }

    // ------------------------------------------------------------ live layer
    function live(t) {
      const x = ctx, U = u(), ts = t / 1000, onTwos = Math.floor(t / 83);
      const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { fl, gy, sapX, y0, cx } = Lg;
      // fire
      const hz = Lg.hearth, f = D.fire, fx0 = hz.x, fy0 = gy - U * 0.3;
      const glow = x.createRadialGradient(fx0, fy0 - U * 3, 2, fx0, fy0 - U * 3, U * (8 + 26 * f));
      glow.addColorStop(0, `rgba(255,170,70,${0.25 + 0.3 * f})`); glow.addColorStop(1, 'rgba(255,170,70,0)');
      x.save(); x.beginPath(); Lg.open.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
      x.globalCompositeOperation = 'screen'; x.fillStyle = glow; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over';
      const nfl = 3 + Math.round(f * 4);
      for (let i = 0; i < nfl; i++) {
        const k = (i - (nfl - 1) / 2) / nfl, hgt = U * (1.4 + 6 * f) * (0.7 + 0.3 * Math.sin(ts * 7 + i * 2.3) + 0.15 * Math.sin(ts * 13 + i)), w = U * (1 + 1.4 * f) * (1 - Math.abs(k));
        const bx = fx0 + k * hz.w * 0.55;
        x.fillStyle = i % 2 ? 'rgba(255,200,80,0.9)' : 'rgba(240,110,40,0.85)';
        x.beginPath(); x.moveTo(bx - w, fy0); x.quadraticCurveTo(bx - w * 0.8, fy0 - hgt * 0.6, bx + Math.sin(ts * 5 + i) * w * 0.5, fy0 - hgt);
        x.quadraticCurveTo(bx + w * 0.8, fy0 - hgt * 0.6, bx + w, fy0); x.closePath(); x.fill();
      }
      x.fillStyle = 'rgba(90,40,20,0.9)'; for (let i = -2; i <= 2; i++) { x.beginPath(); x.ellipse(fx0 + i * U * 1.4, fy0, U * 1.2, U * 0.4, 0, 0, TAU); x.fill(); }
      if (D.asleep) for (let i = 0; i < 3; i++) {      // smoke curling from the embers
        const yy = fy0 - ((ts * 14 + i * 20) % 60) / 60 * hz.h * 1.3;
        x.strokeStyle = `rgba(120,110,100,${0.4 * (1 - (fy0 - yy) / (hz.h * 1.3))})`; x.lineWidth = 1.2;
        x.beginPath(); x.arc(fx0 + Math.sin(ts * 2 + i) * U * 1.5, yy, U * 0.8, 0, Math.PI * 1.4); x.stroke();
      }
      // lanterns in the loft: the latest runs
      const lx0 = sapX + U * 4, lx1 = Lg.ladderX - U * 4, n = Math.max(D.fruits.length, D.asleep ? 3 : 0);
      for (let i = 0; i < n; i++) {
        const fr = D.fruits[i], lx = n === 1 ? (lx0 + lx1) / 2 : lerp(lx0, lx1, i / Math.max(1, n - 1)), ceil = y0 + (fl.loft - y0) * 0.12 + Lg.span * 0.06 * Math.pow(Math.abs(i / Math.max(1, n - 1) - 0.5) * 2, 2);
        const len = (fl.loft - ceil) * (0.35 + (i % 2) * 0.18), sw = Math.sin(ts * 1.3 + i * 1.7) * 0.07;
        const ex = lx + Math.sin(sw) * len, ey = ceil + Math.cos(sw) * len;
        x.strokeStyle = 'rgba(60,45,30,0.85)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(lx, ceil); x.lineTo(ex, ey); x.stroke();
        const col = fr ? KIND[fr.kind] : [40, 10, 60];
        const lit = fr && !D.asleep ? 1 - fr.ripe * 0.35 : 0;
        if (lit) {
          const g = x.createRadialGradient(ex, ey + U * 1.6, 0, ex, ey + U * 1.6, U * 7);
          g.addColorStop(0, hsl(col[0], col[1], 70, 0.55 * lit)); g.addColorStop(1, hsl(col[0], col[1], 70, 0));
          x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.beginPath(); x.arc(ex, ey + U * 1.6, U * 7, 0, TAU); x.fill(); x.globalCompositeOperation = 'source-over';
        }
        x.fillStyle = lit ? hsl(col[0], col[1], lerp(55, 72, lit)) : 'rgba(200,190,170,0.5)'; x.strokeStyle = 'rgba(60,40,25,0.9)'; x.lineWidth = 0.9;
        x.beginPath(); x.moveTo(ex - U * 1.1, ey + U * 0.5); x.lineTo(ex + U * 1.1, ey + U * 0.5); x.lineTo(ex + U * 1.4, ey + U * 2.6); x.lineTo(ex - U * 1.4, ey + U * 2.6); x.closePath(); x.fill(); x.stroke();
        x.beginPath(); x.moveTo(ex - U * 0.6, ey); x.lineTo(ex + U * 0.6, ey); x.lineTo(ex + U * 1.1, ey + U * 0.5); x.lineTo(ex - U * 1.1, ey + U * 0.5); x.closePath(); x.fillStyle = 'rgba(70,50,30,0.9)'; x.fill();
        if (fr) fr._lx = ex, fr._ly = ey + U * 1.5;
      }
      // sap drops rising: one for each run in the last 10 days
      D.drops.forEach((d, i) => {
        const span = (Lg.y1 - Lg.ty), y = Lg.y1 - H * 0.02 - ((ts * 0.09 + d.ph + i * 0.13) % 1) * span;
        const r = U * (0.45 + 0.18 * Math.sqrt(d.km));
        x.fillStyle = 'rgba(120,180,225,0.95)'; x.strokeStyle = 'rgba(40,90,130,0.8)'; x.lineWidth = 0.6;
        x.beginPath(); x.arc(sapX, y, r, 0, TAU); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(sapX - r * 0.4, y - r * 0.5, r * 0.35, r * 0.35);
      });
      // dust in the warm light
      if (!D.asleep) for (let i = 0; i < 14; i++) {
        const px = cx + Math.sin(ts * 0.3 + i * 2.1) * Lg.inner(fl.lib) * 0.7, py = fl.loft + ((ts * 6 + i * 37) % ((gy - fl.loft) * 0.9));
        x.fillStyle = `rgba(255,230,180,${0.25 + 0.25 * Math.sin(ts * 2 + i)})`; x.fillRect(px, py, 1.4, 1.4);
      }
      x.restore();
      // mushroom lamps glow in the burrows (brighter on busy days)
      Lg.roots.forEach((R, i) => {
        const [bx, by] = R.burrow, a = (0.25 + 0.5 * Math.sqrt(R.rt.share)) * (0.75 + 0.25 * Math.sin(ts * 1.7 + i));
        if (!R.rt.runs) return;
        const g = x.createRadialGradient(bx, by, 0, bx, by, R.br * 2.2);
        g.addColorStop(0, `rgba(255,220,140,${a})`); g.addColorStop(1, 'rgba(255,220,140,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, R.br * 2.2, 0, TAU); x.fill();
        x.fillStyle = 'rgba(230,120,80,0.95)'; x.beginPath(); x.ellipse(bx, by - U * 0.3, U * 0.9, U * 0.5, 0, Math.PI, 0); x.fill();
        x.fillStyle = 'rgba(240,230,210,0.95)'; x.fillRect(bx - U * 0.2, by - U * 0.3, U * 0.4, U * 0.8);
      });
      // the inhabitants
      const s = U * 2.4;
      agents.forEach((a, i) => {
        if (a.role === 'carry' || a.role === 'keep') {
          a.s += a.dir * a.speed * dt;
          if (a.s >= a.total) { a.s = a.total; a.dir = -1; } else if (a.s <= 0) { a.s = 0; a.dir = 1; }
          const p = along(a);
          sprout(x, p.x, p.y, s, { step: onTwos % 2, climb: p.climb, carry: a.role === 'carry' && a.dir > 0, face: (p.dx * a.dir >= 0) ? 1 : -1, bob: (onTwos % 2) * -s * 0.04, sway: Math.sin(ts * 3 + i) * 0.2 });
        } else if (a.role === 'sit') {
          sprout(x, a.x, a.y, s, { sit: true, face: -1, bob: Math.sin(ts * 1.5 + a.ph) * s * 0.03, blink: Math.sin(ts * 0.7 + a.ph) > 0.97, sway: Math.sin(ts + a.ph) * 0.2 });
        } else if (a.role === 'read') {
          sprout(x, a.x, a.y, s, { sit: true, book: true, face: 1, bob: Math.sin(ts * 0.8) * s * 0.02 });
        } else if (a.role === 'sleep') {
          sprout(x, a.x, a.y, s * 0.95, { sleep: true, face: 1 });
          const zz = ((ts * 0.35 + a.ph) % 1);
          x.fillStyle = `rgba(80,60,40,${0.75 * (1 - zz)})`; x.font = `700 ${Math.round(s * (0.5 + zz * 0.5))}px Caveat, cursive`;
          x.fillText('z', a.x + s * 0.6 + zz * s, a.y - s * 1.2 - zz * s * 2);
        }
      });
      // outside: a few falling leaves or snowflakes
      if (Math.random() < (S.winter ? 0.25 : S.season < 0.5 ? 0.12 : 0.02) && fx.length < 30) fx.push({ x: Math.random() * W, y: Lg.crown.map(0, 0)[1] * 0 + H * 0.05 + Math.random() * H * 0.2, ph: Math.random() * TAU, vy: 0.3 + Math.random() * 0.4 });
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i]; p.y += p.vy; p.x += Math.sin(ts * 1.5 + p.ph) * 0.5;
        if (S.winter) { x.strokeStyle = 'rgba(120,130,150,0.8)'; x.lineWidth = 0.7; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; x.beginPath(); x.moveTo(p.x - Math.cos(a) * 2.5, p.y - Math.sin(a) * 2.5); x.lineTo(p.x + Math.cos(a) * 2.5, p.y + Math.sin(a) * 2.5); x.stroke(); } }
        else { const [h, sa, l] = seasonRGB(0.15 + (p.ph % 0.3)); x.strokeStyle = hsl(h, sa, l, 0.85); x.lineWidth = 2; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + Math.cos(ts * 2 + p.ph) * 4, p.y + Math.sin(ts * 2 + p.ph) * 2); x.stroke(); }
        if (p.y > Lg.gy) fx.splice(i, 1);
      }
    }

    const inRect = (px, py, r) => px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3];
    function inPoly(px, py, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }

    return {
      about: [
        ['A world inside the tree', 'The trunk is cut open. Each ring in the cut is a week you ran; dark rings are weeks you missed. Roots are weekday tunnels, each ending in a burrow lit by a mushroom lamp.'],
        ['Rooms that keep score', 'Lanterns in the loft are your latest runs. The library holds a book per milestone. The hearth burns for your weekly streak, and the larder keeps a jar for every month, filled by its kilometres.'],
        ['The sprouts', 'Little seed-folk live inside: about one for every two runs in the last four weeks, carrying water up from the roots. Stop running for a week and they fall asleep by the embers.'],
      ],
      enter() { build(); },
      setT() { build(); },
      resize() { build(); },
      frame(t) {
        if (!frames.length) return;
        if (t - lastBoil > (calm ? 1e9 : 166) || lastBoil === 0) { fi = (fi + 1) % frames.length; lastBoil = t || 1; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(frames[fi], 0, 0);
        live(calm ? 0 : t);
      },
      move(px, py) {
        let h = null;
        for (let i = hits.length - 1; i >= 0 && !h; i--) {
          const k = hits[i];
          if (k.r != null && Math.hypot(px - k.x, py - k.y) < k.r) h = k;
          else if (k.rect && inRect(px, py, k.rect)) h = k;
          else if (k.poly && inPoly(px, py, k.poly) && !inPoly(px, py, Lg.open)) h = k;
        }
        if (!h) {
          D.fruits.forEach((fr) => { if (!h && fr._lx != null && Math.hypot(px - fr._lx, py - fr._ly) < u() * 2.5) h = { text: `Lantern — ${KIND_NAME[fr.kind]}, ${fr.run.km.toFixed(1)} km on ${fmtDate(fr.run.day, { year: undefined })}` }; });
        }
        if (h) { tip.textContent = h.text; tip.style.left = clamp(px, 110, W - 110) + 'px'; tip.style.top = Math.max(40, py) + 'px'; tip.classList.add('on'); }
        else tip.classList.remove('on');
      },
    };
  }

  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  // ============================================================== shell
  const worlds = { inside: Inside(), jar: Jar(), planet: Planet(), journal: Journal() };
  function size() {
    const r = stage.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = W * dpr; cv.height = H * dpr;
    if (current) current.resize();
  }
  function show(k) {
    if (!worlds[k]) k = 'inside';
    key = k; current = worlds[k];
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.w === k)));
    $('about').innerHTML = current.about.map(([t, d]) => `<div><b>${t}</b><span>${d}</span></div>`).join('');
    stage.style.background = k === 'journal' ? '#2b2320' : k === 'inside' ? '#efe4c8' : k === 'planet' ? '#070a18' : '#2a2320';
    tip.classList.remove('on');
    if (W) { current.enter(); if (k === 'jar') setTimeout(() => current.shakeOnce && current.shakeOnce(), 200); }
  }
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { if (location.hash !== '#' + b.dataset.w) location.hash = b.dataset.w; else show(b.dataset.w); }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  new ResizeObserver(() => { const had = W; size(); if (!had && current) { current.enter(); if (key === 'jar') current.shakeOnce(); } }).observe(stage);
  show(location.hash.slice(1) || 'inside');

  const pos = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); current.down && current.down(...pos(e)); hint.style.opacity = 0; });
  stage.addEventListener('pointermove', (e) => current.move && current.move(...pos(e)));
  stage.addEventListener('pointerup', () => current.up && current.up());
  stage.addEventListener('pointercancel', () => current.up && current.up());

  // shared clock: scrub or play the whole history
  const slider = $('time'), dateLbl = $('date');
  slider.max = M.today.toFixed(2); slider.value = M.today.toFixed(2);
  const setT = (v) => { T = clamp(v, 0, M.today); slider.value = T; dateLbl.textContent = fmtDate(T); current && current.setT(T); };
  dateLbl.textContent = fmtDate(T);
  slider.addEventListener('input', () => { stopPlay(); setT(+slider.value); });
  $('today').onclick = () => { stopPlay(); setT(M.today); };
  let playing = false, p0 = 0, T0 = 0;
  function stopPlay() { playing = false; $('play').textContent = '▶ Watch it grow'; }
  $('play').onclick = () => { if (playing) return stopPlay(); playing = true; $('play').textContent = '❚❚ Pause'; T0 = T >= M.today - 0.5 ? 0 : T; p0 = performance.now(); };

  let lastF = 0;
  function loop(t) {
    if (playing) {
      const dur = Math.min(20000, 6000 + M.today * 18), k = Math.min(1, (t - p0) / dur);
      if (t - lastF > 90) { setT(T0 + (M.today - T0) * k); lastF = t; }
      if (k >= 1) stopPlay();
    }
    if (!document.hidden && current && W) current.frame(calm ? 0 : t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => current && current.setT(T));
  document.body.dataset.ready = '1';
})();
