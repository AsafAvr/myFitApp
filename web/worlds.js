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

  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  // ============================================================== shell
  const worlds = { jar: Jar(), planet: Planet(), journal: Journal() };
  function size() {
    const r = stage.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = W * dpr; cv.height = H * dpr;
    if (current) current.resize();
  }
  function show(k) {
    if (!worlds[k]) k = 'jar';
    key = k; current = worlds[k];
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.w === k)));
    $('about').innerHTML = current.about.map(([t, d]) => `<div><b>${t}</b><span>${d}</span></div>`).join('');
    stage.style.background = k === 'journal' ? '#2b2320' : k === 'planet' ? '#070a18' : '#2a2320';
    tip.classList.remove('on');
    if (W) { current.enter(); if (k === 'jar') setTimeout(() => current.shakeOnce && current.shakeOnce(), 200); }
  }
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { if (location.hash !== '#' + b.dataset.w) location.hash = b.dataset.w; else show(b.dataset.w); }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  new ResizeObserver(() => { const had = W; size(); if (!had && current) { current.enter(); if (key === 'jar') current.shakeOnce(); } }).observe(stage);
  show(location.hash.slice(1) || 'jar');

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
