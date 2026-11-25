(function () {
  'use strict';
  const G = window.__GENOME__;
  const STORY = window.__STORY__ || {};
  const FT = window.FitTree;
  const $ = (id) => document.getElementById(id);
  const M = FT.prepare(G);
  const params = new URLSearchParams(location.search);
  const S0 = G.summary || {};
  const name = (G.athlete && (G.athlete.first_name || G.athlete.name)) || 'Runner';
  const FRUIT = { easy: '🍒', long: '🍎', tempo: '🍊', hill: '🫐', race: '🌟' };
  const SEASON_EMOJI = { 'Spring flush': '🌱', Summer: '🌳', Heatwave: '🔥', 'Late summer': '🌾', Autumn: '🍂', 'Late autumn': '🍁', Winter: '❄️' };
  const DAY = 86400000;
  const fmtDate = (T, opt) => new Date(M.origin + Math.floor(T) * DAY).toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, opt || {}));
  const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '–');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = (s, h, d) => (d >= 21 || s < 0.08 ? 'Winter' : s < 0.3 ? 'Late autumn' : s < 0.5 ? 'Autumn' : s < 0.68 ? 'Late summer' : h > 0.45 ? 'Heatwave' : s > 0.9 ? 'Spring flush' : 'Summer');

  // ---------------------------------------------------------------- header
  const av = $('avatar');
  if (G.athlete && G.athlete.avatar) av.innerHTML = `<img alt="" src="${esc(G.athlete.avatar)}">`;
  else av.textContent = name.slice(0, 1).toUpperCase();
  $('title').textContent = `${name}'s running tree`;
  $('genLbl').textContent = (G.generated_at || '').replace('T', ' ').slice(0, 16);
  if (G.athlete && G.athlete.source) $('srcLbl').textContent = G.athlete.source;

  // -------------------------------------------------------------- canvases
  const stage = $('stage'), cv = $('tree'), av2 = $('ambient'), tip = $('tip');
  const ctx = cv.getContext('2d'), actx = av2.getContext('2d');
  let W = 0, Hh = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  let T = M.today, scene = null, view = null, ambient = null;
  const slider = $('time');
  slider.min = 0; slider.max = M.today.toFixed(2); slider.value = M.today.toFixed(2);

  function size() {
    const r = stage.getBoundingClientRect();
    W = Math.round(r.width); Hh = Math.round(r.height);
    [cv, av2].forEach((c) => { c.width = W * dpr; c.height = Hh * dpr; });
  }
  let RR = null;               // prepared layers for the current moment
  // the film look as CSS layers (grade, faded blacks, vignette, grain, bloom)
  const fx = { bloom: $('fxBloom'), grade: $('fxGrade'), lift: $('fxLift'), vig: $('fxVig'), grain: $('fxGrain') };
  try { fx.grain.style.backgroundImage = `url(${FT.noise().toDataURL('image/png')})`; } catch (e) { fx.grain.hidden = true; }
  function film(R) {
    const p = FT.postStyle(R);
    fx.grade.style.background = p.grade; fx.grade.style.opacity = p.gradeAlpha;
    fx.lift.style.background = p.lift;
    fx.vig.style.background = `radial-gradient(ellipse 75% 70% at 50% 45%, rgba(255,255,255,0) 45%, ${p.vignette} 100%), #fff`;
    fx.bloom.style.opacity = p.bloom * 1.3;
    bloom();
  }
  function bloom() {
    const b = fx.bloom;
    if (b.width !== Math.max(1, W >> 3)) { b.width = Math.max(1, W >> 3); b.height = Math.max(1, Hh >> 3); }
    const x = b.getContext('2d'); x.globalCompositeOperation = 'copy'; x.drawImage(cv, 0, 0, b.width, b.height);
  }
  function draw() {
    if (!W) return;
    scene = FT.grow(M, T);
    RR = FT.prepareRender(scene, W, Hh, { model: M, dpr, lite: playing, post: false });
    FT.drawFrame(ctx, RR, performance.now());
    film(RR);
    view = RR.v;
    ambient = FT.Ambient(scene, view, M);
    updatePanel();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
  new ResizeObserver(() => { size(); draw(); }).observe(stage);

  let last = 0, budget = 32, slow = 0, frames = 0;
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the tree breathes: wind through the crown at up to ~30 fps while visible;
  // slower devices step down to 15 fps, and very slow ones keep a still tree
  function loop(t) {
    if (calm) return;
    if (!document.hidden && t - last > budget) {
      if (RR && !playing && budget < 1000) {
        const t0 = performance.now();
        FT.drawFrame(ctx, RR, t);
        if (++frames % 4 === 0) bloom();
        const dt = performance.now() - t0;
        slow = slow * 0.9 + (dt > budget * 0.8 ? 1 : 0) * 0.1;
        if (slow > 0.6) { budget = budget < 60 ? 66 : 5000; slow = 0; }
      }
      if (ambient) ambient.step(actx, dpr, t);
      last = t;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ------------------------------------------------------------- time-lapse
  let playing = false, raf = 0;
  function setT(v) { T = Math.max(0, Math.min(M.today, v)); slider.value = T; draw(); }
  slider.addEventListener('input', () => { stop(); setT(+slider.value); });
  $('todayBtn').onclick = () => { stop(); setT(M.today); };
  function stop() { const was = playing; playing = false; cancelAnimationFrame(raf); $('playBtn').textContent = '▶ Watch it grow'; if (was) draw(); }
  $('playBtn').onclick = () => {
    if (playing) return stop();
    playing = true; $('playBtn').textContent = '❚❚ Pause';
    if (T >= M.today - 0.5) T = 0;
    const dur = Math.min(26000, 7000 + M.today * 22);   // longer history, longer film
    let t0 = null; const T0 = T;
    const step = (t) => {
      if (!playing) return;
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / (dur * (1 - T0 / M.today) || 1));
      setT(T0 + (M.today - T0) * (1 - Math.pow(1 - k, 1.6)));
      if (k < 1) raf = requestAnimationFrame(step); else stop();
    };
    raf = requestAnimationFrame(step);
  };

  // ------------------------------------------------------------------ hover
  function hitAt(mx, my) {
    if (!scene || !view) return null;
    const wx = (mx - view.cx) / view.z;
    let wy = (my - view.gy) / view.z;
    let best = null, bd = 1e9;
    for (const h of scene.hits) {
      const hy = h.type === 'root' ? h.y * (scene.rootFit || 1) : h.y;
      if ((h.type === 'root') !== (my > view.gy)) continue;
      const d = Math.hypot(h.x - wx, hy - wy);
      const rad = Math.max(h.r, 10 / view.z);
      if (d < rad && d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function tipHTML(h) {
    const d = h.data;
    switch (h.type) {
      case 'run': {
        const date = new Date(M.origin + Math.floor(d.day) * DAY).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
        return `<b>${FRUIT[d.kind]} ${esc(d.name || 'Run')}</b><br>${date} · ${d.t.slice(11, 16)}<br>${d.km.toFixed(2)} km · ${fmtPace(d.pace)} · ↑${d.elev} m${d.hr ? ` · ♥ ${d.hr}` : ''}<br>` +
          `<span style="opacity:.75">Twig ${d.km.toFixed(1)} km long, ${FT.leafCount(d.km)} leaves · ${FT.KIND_LABEL[d.kind]}</span>` +
          (d.pb ? `<br>🌸 ${esc(d.pb.join(' · '))}` : d.pr ? `<br>🌸 ${d.pr} PR${d.pr > 1 ? 's' : ''}` : '') + (d.ms ? `<br>✨ ${esc(d.ms.join(' · '))}` : '');
      }
      case 'root': return `<b>${d.day} root</b><br>${d.runs} runs · ${d.km.toFixed(1)} km on ${d.day}s<br><span style="opacity:.75">${Math.round(d.share * 100)}% of your runs${d.strongest ? ' — your anchor day' : ''}</span>`;
      case 'limb': return `<b>${esc(d.label)} limb</b><br>${d.runs} runs · ${d.km.toFixed(1)} km<br><span style="opacity:.75">vigor ${(d.vigor * 100).toFixed(0)}%: longer & thicker when the month's habit was strong</span>`;
      case 'ring': return `<b>✨ Amber ring</b><br>${esc(d.label)}<br><span style="opacity:.75">${d.t.slice(0, 10)}</span>`;
      case 'knot': return `<b>${d.kind === 'scar' ? 'Old limb scar' : d.kind === 'bud' ? 'Dormant bud' : 'Knot'}</b><br>${esc(d.label)}${d.kind === 'scar' ? '<br><span style="opacity:.75">older than 18 months — now part of the trunk\'s strength</span>' : ''}`;
      case 'carving': return `<b>Carved initial</b><br>${esc(d.initial)} · ${esc(d.year)}<br><span style="opacity:.75">carved after 12 weeks with a run</span>`;
      case 'swing': return `<b>The swing</b><br><span style="opacity:.75">hangs once you've run in 26 different weeks</span>`;
      case 'nest': return `<b>🪺 ${d.streak}-week streak</b><br>${d.eggs} egg${d.eggs > 1 ? 's' : ''}${d.bird ? ' and a robin on watch' : ''}<br><span style="opacity:.75">each week in a row adds an egg</span>`;
    }
    return '';
  }
  function onMove(e) {
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const h = hitAt(mx, my);
    if (!h) { tip.classList.remove('on'); stage.style.cursor = ''; return; }
    tip.innerHTML = tipHTML(h);
    tip.style.left = Math.max(120, Math.min(W - 120, mx)) + 'px';
    tip.style.top = Math.max(110, my) + 'px';
    tip.classList.add('on'); stage.style.cursor = 'pointer';
  }
  stage.addEventListener('mousemove', onMove);
  stage.addEventListener('click', onMove);
  stage.addEventListener('mouseleave', () => tip.classList.remove('on'));

  // ------------------------------------------------------------------ panel
  const ICON = {"trunk": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"><circle cx=\"16\" cy=\"16\" r=\"13\"/><circle cx=\"16.5\" cy=\"15.5\" r=\"9.5\"/><circle cx=\"17\" cy=\"15\" r=\"6\"/><circle cx=\"17\" cy=\"15\" r=\"2.6\"/></svg>", "roots": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><path d=\"M3 9h26\"/><path d=\"M16 4v8c0 5-3 8-8 12M16 12c0 6 1 11 1 17M16 12c1 5 5 8 11 10M16 14c-3 3-8 4-12 4M17 20c2 2 4 5 4 8\"/></svg>", "limbs": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><path d=\"M16 30V17c0-4-3-7-9-10M16 19c0-5 4-9 10-12M16 23c2-1 6-1 9 1M11 10l-3-5M22 10l1-6\"/></svg>", "leaf": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><path d=\"M5 27C5 13 13 5 28 4c0 15-8 23-23 23z\"/><path d=\"M5 27L20 12M12 20h5M15 17v-5\"/></svg>", "fruit": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><circle cx=\"16\" cy=\"19\" r=\"9\"/><path d=\"M16 10c0-3 1-5 3-7M17 7c3-2 7-2 9 0-3 2-6 2-9 0\"/></svg>", "amber": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><path d=\"M16 4c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z\"/><path d=\"M12 19a4 4 0 0 0 4 4\"/></svg>", "nest": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><ellipse cx=\"11\" cy=\"15\" rx=\"3\" ry=\"4\"/><ellipse cx=\"17\" cy=\"14\" rx=\"3\" ry=\"4.2\"/><ellipse cx=\"22.5\" cy=\"15.5\" rx=\"2.6\" ry=\"3.6\"/><path d=\"M4 17c2 8 22 8 24 0M5 20c6 2 16 2 22 0M7 23c5 1.5 13 1.5 18 0\"/></svg>", "meadow": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><circle cx=\"16\" cy=\"10\" r=\"2.5\"/><path d=\"M16 5.5a3 3 0 0 1 0 0M12 7.5a3.2 3.2 0 1 1 3 -3.2M20 7.5a3.2 3.2 0 1 0 -3 -3.2M12.5 12a3.2 3.2 0 1 0 2 2.8M19.5 12a3.2 3.2 0 1 1 -2 2.8\"/><path d=\"M16 13v16M16 24c-3-4-7-4-9-3M16 21c2-3 5-4 8-3\"/></svg>"};
  const panel = $('panel');
  panel.innerHTML = `
    <div class="card part"><div class="ico">${ICON.trunk}</div><h3>Trunk = persistence</h3>
      <div class="means">Every week you run adds a growth ring; streaks add thicker wood. It never shrinks.</div>
      <div class="val"><div class="slice"><canvas id="slice"></canvas><div id="trunkVal"></div></div></div></div>
    <div class="card part"><div class="ico">${ICON.roots}</div><h3>Roots = your weekly rhythm</h3>
      <div class="means">One root per weekday, as thick as the share of runs on that day.</div>
      <div class="val"><div class="bars" id="bars"></div><div class="bars-l" id="barsL"></div><div id="rootVal" style="margin-top:6px"></div></div></div>
    <div class="card part"><div class="ico">${ICON.limbs}</div><h3>Limbs, branches, twigs</h3>
      <div class="means">Limb = a month (strong month → long, thick limb) · branch = a week · twig = one run, placed by weekday, as long as the run, kinked by hills, lifted by pace.</div>
      <div class="val" id="limbVal"></div></div>
    <div class="card part"><div class="ico">${ICON.leaf}</div><h3>Leaf colour = your last weeks</h3>
      <div class="means">Your last 10 days of running vs your usual 6 weeks. Steady → summer green, building → spring flush, fading → autumn, stopped → winter.</div>
      <div class="val"><div class="seasonbar"><i id="seasonMark"></i></div><div class="seasonlabels"><span>winter</span><span>autumn</span><span>summer</span><span>spring</span></div><div id="seasonVal" style="margin-top:6px"></div></div></div>
    <div class="card part"><div class="ico">${ICON.fruit}</div><h3>Fruit = latest runs</h3>
      <div class="means">Runs from the last 3 weeks hang as fruit, ripening with age. Kind follows the run; the newest one glows.</div>
      <div class="val"><div class="fruitlist" id="fruitVal"></div></div></div>
    <div class="card part"><div class="ico">${ICON.amber}</div><h3>Blossoms & amber rings</h3>
      <div class="means">Personal bests (longest run, fastest 5K/10K…) and Strava PRs bloom on their twig. Milestones (first 10K, 100 km…) leave an amber ring in the bark.</div>
      <div class="val" id="msVal"></div></div>
    <div class="card part"><div class="ico">${ICON.nest}</div><h3>Nest = streak</h3>
      <div class="means">2+ weeks in a row builds a nest; each week adds an egg (up to 6). At 8 weeks a robin moves in.</div>
      <div class="val" id="nestVal"></div></div>
    <div class="card part"><div class="ico">${ICON.amber.replace('M12 19a4 4 0 0 0 4 4', 'M13 18c0 2 1 3 3 3')}</div><h3>Soil & keepsakes</h3>
      <div class="means">Every run waters the tree: the soil stays dark and moist for a few days, then dries and cracks and the leaves start to hang. After 12 weeks with a run your initial is carved into the bark; after 26 a swing hangs from the strongest limb.</div>
      <div class="val" id="keepVal"></div></div>
    <div class="card part"><div class="ico">${ICON.meadow}</div><h3>Meadow = cross-training</h3>
      <div class="means">Rides, swims, walks and workouts from the last 90 days bloom as wildflowers around the tree.</div>
      <div class="val" id="meadowVal"></div></div>`;
  const slice = $('slice');
  slice.width = slice.height = 92 * dpr;

  function updatePanel() {
    const st = scene.st;
    const runsT = M.runs.filter((r) => r.day <= T);
    const s = scene.season, lab = label(s, scene.heat, st.dormant);
    $('seasonChip').textContent = `${SEASON_EMOJI[lab] || ''} ${lab}`;
    $('subtitle').textContent = runsT.length ? `${runsT.length} runs · ${scene.kmT.toFixed(0)} km since ${fmtDate(0)}` : 'A seed waiting for the first run';
    $('dateLbl').textContent = fmtDate(T);
    $('badge').innerHTML = `<b>${fmtDate(T, { day: 'numeric', month: 'long' })}</b>${lab} · ${st.activeWeeks} growth rings${st.streak >= 2 ? ` · ${st.streak}-week streak` : ''}`;

    const kms4 = runsT.filter((r) => T - r.day < 28).reduce((a, r) => a + r.km, 0);
    $('kpis').innerHTML = [
      [runsT.length, 'runs = twigs'],
      [scene.kmT.toFixed(0), 'km grown'],
      [`${st.activeWeeks}/${st.weeksTotal}`, 'weeks with a run'],
      [(kms4 / 4).toFixed(1), 'km / week (4 wk)'],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');

    FT.drawRings(slice.getContext('2d'), M, T, 92, dpr);
    const cons = st.weeksTotal ? Math.round(st.activeWeeks / st.weeksTotal * 100) : 0;
    $('trunkVal').innerHTML = `<b>${st.activeWeeks}</b> growth rings of ${st.weeksTotal} weeks<br><b>${cons}%</b> persistence · wood <b>${scene.wood.toFixed(1)}</b><br><span class="means">${scene.knots.filter((k) => k.kind === 'gap').length} knot(s) where you paused</span>`;

    const counts = scene.roots.map((r) => r.runs), mx = Math.max(1, ...counts);
    $('bars').innerHTML = scene.roots.map((r) => `<div class="${r.strongest ? 'top' : ''}" style="height:${(r.runs / mx) * 100}%" title="${r.day}: ${r.runs} runs"></div>`).join('');
    $('barsL').innerHTML = scene.roots.map((r) => `<span>${r.day}</span>`).join('');
    const strong = scene.roots.filter((r) => r.strongest).map((r) => r.day);
    $('rootVal').innerHTML = strong.length ? `Anchor day: <b>${strong.join(' & ')}</b>` : '';

    const limbs = scene.limbs;
    const bestM = limbs.slice().sort((a, b) => b.km - a.km)[0];
    $('limbVal').innerHTML = `<b>${limbs.length}</b> living limbs · <b>${scene.branches.length}</b> branches · <b>${scene.twigs.length}</b> twigs · <b>${scene.leaves.length}</b> leaves on the tree` +
      (bestM ? `<br>Strongest limb: <b>${bestM.m.label}</b> (${bestM.runs} runs, ${bestM.km.toFixed(0)} km)` : '');

    $('seasonMark').style.left = `${s * 100}%`;
    $('seasonVal').innerHTML = `<b>${lab}</b> — last 10 days at <b>${Math.round(st.ratio * 100)}%</b> of usual load` +
      (st.dormant >= 1 && runsT.length ? ` · ${Math.floor(st.dormant)} day${Math.floor(st.dormant) === 1 ? '' : 's'} since the last run` : '') +
      (scene.fallen.length ? `<br>${scene.fallen.length} leaves on the ground` : '');

    const fr = scene.fruits.slice().sort((a, b) => b.run.day - a.run.day).slice(0, 7);
    $('fruitVal').innerHTML = fr.length ? fr.map((f) => `<div><span class="k">${FRUIT[f.kind]}</span><span>${esc(f.run.name || 'Run')}</span><span class="m">${f.run.km.toFixed(1)} km · ${fmtDate(f.run.day, { year: undefined })}</span></div>`).join('')
      : '<span class="means">No fruit right now — the next run sets some.</span>';

    const prs = runsT.reduce((a, r) => a + (r.pr || 0), 0);
    const ms = M.ms.filter((m) => m.day <= T);
    $('msVal').innerHTML = `<b>${prs}</b> PRs · <b>${ms.length}</b> milestones` +
      (ms.length ? `<div class="fruitlist">${ms.slice(-6).reverse().map((m) => `<div><span class="k">✨</span><span>${esc(m.label)}</span><span class="m">${fmtDate(m.day)}</span></div>`).join('')}</div>` : '');

    const longest = M.weeks.slice(0, st.wk + 1).reduce((a, w) => Math.max(a, w.streak), 0);
    $('nestVal').innerHTML = st.streak >= 2 ? `${'🥚'.repeat(Math.min(6, st.streak))}${st.streak >= 8 ? ' 🐦' : ''}<br><b>${st.streak}</b>-week streak · longest <b>${longest}</b>`
      : `<b>${st.streak}</b>-week streak · longest <b>${longest}</b><br><span class="means">Run in 2 weeks in a row to start a nest.</span>`;
    const dsl = runsT.length ? Math.floor(st.dormant) : null;
    const soil = dsl == null ? 'waiting for the first run' : dsl <= 2 ? `moist, watered ${dsl === 0 ? 'today' : dsl === 1 ? 'yesterday' : '2 days ago'}`
      : dsl <= 7 ? `drying, ${dsl} days since the last run` : `dry and cracking, ${dsl} days without water`;
    const aw = st.activeWeeks;
    $('keepVal').innerHTML = `Soil: <b>${soil}</b><br>Carved initial: <b>${aw >= 12 ? 'yes' : `in ${12 - aw} more running week${12 - aw === 1 ? '' : 's'}`}</b>` +
      ` · Swing: <b>${scene.swing ? 'hanging' : aw >= 26 ? 'waiting for a limb long enough' : `in ${26 - aw} more running week${26 - aw === 1 ? '' : 's'}`}</b>`;
    const others = M.others.filter((o) => o.day <= T && T - o.day <= 90);
    const bySport = {};
    others.forEach((o) => (bySport[o.sport] = (bySport[o.sport] || 0) + 1));
    $('meadowVal').innerHTML = others.length ? Object.entries(bySport).map(([k, v]) => `${esc(k)} <b>${v}</b>`).join(' · ') : '<span class="means">No cross-training in the last 90 days.</span>';
  }

  // ------------------------------------------------------------------ story
  if (STORY && STORY.title) {
    $('story').innerHTML = `<h2>${esc(STORY.title)}</h2><ul>${(STORY.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` +
      (STORY.next ? `<div class="next"><b>Next:</b> ${esc(STORY.next)}</div>` : '');
  } else $('story').remove();

  // ------------------------------------------------------- shareable card
  function renderCard(cw, ch) {
    const c = $('cardOut');
    c.width = cw; c.height = ch;
    c.style.width = cw + 'px'; c.style.height = ch + 'px';
    const x = c.getContext('2d');
    const Tc = params.get('t') ? Math.max(0, Math.min(M.today, +params.get('t'))) : M.today;
    const sc = FT.grow(M, Tc);
    FT.render(x, sc, cw, ch, { model: M, dpr: 1, groundFrac: 0.7, topPad: 160, maxZoom: 2.7, rootBottom: ch * 0.86, time: 2600 });
    const st = sc.st, lab = label(sc.season, sc.heat, st.dormant);
    x.setTransform(1, 0, 0, 1, 0, 0);
    // top title band
    const g = x.createLinearGradient(0, 0, 0, 190);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, cw, 190);
    x.fillStyle = '#fff'; x.textAlign = 'left';
    x.font = `650 ${Math.round(cw * 0.056)}px 'Bricolage Grotesque', system-ui, sans-serif`;
    x.fillText(`${name}'s running tree`, cw * 0.06, ch * 0.065);
    x.font = `500 ${Math.round(cw * 0.026)}px 'Instrument Sans', system-ui, sans-serif`;
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.fillText(`${fmtDate(Tc)} · ${SEASON_EMOJI[lab] || ''} ${lab}`, cw * 0.06, ch * 0.065 + cw * 0.045);
    // bottom stats strip
    const runsN = sc.runsN, km = sc.kmT;
    const stats = [[runsN, 'runs'], [km.toFixed(0), 'km'], [`${st.activeWeeks}`, 'growth rings'], [st.streak, 'week streak']];
    const bh = ch * 0.11, by = ch - bh - ch * 0.025, bx = cw * 0.04, bw = cw * 0.92;
    x.fillStyle = 'rgba(20,16,10,0.62)';
    roundRect(x, bx, by, bw, bh, 22); x.fill();
    stats.forEach(([v, l], i) => {
      const cx = bx + bw * (i + 0.5) / 4;
      x.textAlign = 'center'; x.fillStyle = '#fff';
      x.font = `650 ${Math.round(cw * 0.05)}px 'Bricolage Grotesque', system-ui, sans-serif`; x.fillText(String(v), cx, by + bh * 0.52);
      x.font = `500 ${Math.round(cw * 0.022)}px 'Instrument Sans', system-ui, sans-serif`; x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(l, cx, by + bh * 0.8);
    });
    return c;
  }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  if (window.top !== window.self) $('dlBtn').hidden = true;
  $('dlBtn').onclick = () => {
    const c = renderCard(1080, 1350);
    const a = document.createElement('a');
    a.download = `${name.toLowerCase()}-tree-${G.as_of}.png`;
    a.href = c.toDataURL('image/png'); a.click();
  };
  window.FitTreeCard = renderCard;
  if (params.get('card')) {
    document.body.classList.add('cardmode');
    const go = () => { renderCard(+params.get('w') || 1080, +params.get('h') || 1350); document.body.dataset.ready = '1'; };
    const fonts = document.fonts ? Promise.all([document.fonts.load("650 40px 'Bricolage Grotesque'"),
      document.fonts.load("500 20px 'Instrument Sans'"), document.fonts.load("700 20px Caveat")]).then(() => document.fonts.ready) : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 4000))]).then(go, go);
  }
  if (params.get('t')) { T = Math.max(0, Math.min(M.today, +params.get('t'))); slider.value = T; }
  document.body.dataset.viewerReady = '1';
})();
