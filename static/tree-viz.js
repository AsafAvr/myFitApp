(function () {
  'use strict';

  /* ============================================================
     CONFIGURATION
     ============================================================ */
  var LEAF_COLORS  = ['#4CAF50','#66BB6A','#81C784','#43A047','#388E3C','#2E7D32'];
  var FRUIT_COLORS = ['#FF6D00','#FF9800','#F44336','#E91E63','#FF5722'];
  var TRUNK_DARK   = '#4E342E';
  var TRUNK_MID    = '#5D4037';
  var BRANCH_COLOR = '#6D4C41';
  var BIRD_COLOR   = '#37474F';
  var DAY_NAMES    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var GROWTH_SEC   = 5;

  /* ============================================================
     CANVAS + DATA
     ============================================================ */
  var canvas    = document.getElementById('tree-canvas');
  var ctx       = canvas.getContext('2d');
  var tooltipEl = document.getElementById('tooltip');
  var statsEl   = document.getElementById('stats');
  var data      = window.__TREE_DATA__;

  var W, H, groundY, cx;
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    groundY = H - 70;
    cx = W / 2;
    buildTree();
  }

  /* ============================================================
     STATE
     ============================================================ */
  var t0        = performance.now();
  var mouseX    = -9999, mouseY = -9999;
  var hovered   = null;

  var trunk       = [];
  var branches    = [];
  var runSegs     = [];
  var leaves      = [];
  var fruits      = [];
  var birds       = [];
  var particles   = [];

  /* ============================================================
     BUILD TREE GEOMETRY
     ============================================================ */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function buildTree() {
    trunk = []; branches = []; runSegs = []; leaves = []; fruits = [];

    var trunkH = Math.min(190, H * 0.21);
    var maxReach = Math.min(H * 0.58, W * 0.38);
    var seg = Math.max(6, Math.min(20, maxReach / Math.max(1, data.totalWeeks + 5)));

    /* --- trunk --- */
    var segs = 16;
    for (var i = 0; i <= segs; i++) {
      var t = i / segs;
      trunk.push({
        x: cx + Math.sin(t * 4) * 1.5,
        y: groundY - t * trunkH,
        w: 14 - t * 8
      });
    }
    var topX = trunk[trunk.length - 1].x;
    var topY = trunk[trunk.length - 1].y;

    /* --- 7 main branches --- */
    var baseAngles = [-78,-52,-26, 0, 26, 52, 78];
    for (var b = 0; b < 7; b++) {
      var base = baseAngles[b] * Math.PI / 180;
      var pts = [];
      var bx = topX, by = topY;

      for (var w = 0; w <= data.totalWeeks; w++) {
        var a = base + (base > 0 ? 1 : base < 0 ? -1 : 0) * 0.003 * w * w
                + Math.sin(w * 0.6 + b * 1.1) * 0.03;
        var thick = Math.max(1.2, 6 - w * 0.12);
        pts.push({ x: bx, y: by, w: thick, wk: w, a: a });

        var dayIdx = w * 7 + b;
        if (dayIdx < data.days.length) {
          var day = data.days[dayIdx];
          if (day.isRun) {
            var side = (w % 2 === 0) ? 1 : -1;
            var perp = a + (Math.PI / 2) * side;
            var sLen = 10 + (day.heartPoints - data.threshold) * 0.35;
            var ex = bx + Math.sin(perp) * sLen;
            var ey = by - Math.cos(perp) * sLen;

            runSegs.push({
              sx: bx, sy: by, ex: ex, ey: ey,
              data: day, bi: b, wk: w,
              w: Math.max(1, thick * 0.5),
              gd: 0.3 + w / Math.max(1, data.totalWeeks) * 0.5
            });

            var nL = 2 + Math.floor(day.heartPoints / 20);
            for (var li = 0; li < nL; li++) {
              var lt = 0.2 + Math.random() * 0.9;
              var sp = 10 + Math.random() * 8;
              leaves.push({
                x: bx + (ex - bx) * lt + (Math.random() - 0.5) * sp,
                y: by + (ey - by) * lt + (Math.random() - 0.5) * sp,
                s: 4 + Math.random() * 6,
                r: Math.random() * Math.PI * 2,
                ph: Math.random() * Math.PI * 2,
                c: pick(LEAF_COLORS),
                gd: 0.5 + w / Math.max(1, data.totalWeeks) * 0.4
              });
            }

            if (day.heartPoints > 90) {
              fruits.push({
                x: ex, y: ey,
                s: 5 + (day.heartPoints - 90) / 8,
                c: pick(FRUIT_COLORS),
                ph: Math.random() * Math.PI * 2,
                data: day,
                gd: 0.6 + w / Math.max(1, data.totalWeeks) * 0.3
              });
            }
          }
        }

        bx += Math.sin(a) * seg;
        by -= Math.cos(a) * seg;
      }

      /* tip leaves */
      var tip = pts[pts.length - 1];
      for (var tl = 0; tl < 4; tl++) {
        leaves.push({
          x: tip.x + (Math.random() - 0.5) * 18,
          y: tip.y + (Math.random() - 0.5) * 18,
          s: 4 + Math.random() * 5,
          r: Math.random() * Math.PI * 2,
          ph: Math.random() * Math.PI * 2,
          c: pick(LEAF_COLORS),
          gd: 0.85
        });
      }

      branches.push({ pts: pts, base: base, dow: b });
    }

    showStats();
  }

  /* ============================================================
     STATS OVERLAY
     ============================================================ */
  function showStats() {
    var runs = 0, best = 0, total = 0;
    for (var i = 0; i < data.days.length; i++) {
      if (data.days[i].isRun) {
        runs++;
        total += data.days[i].heartPoints;
        if (data.days[i].heartPoints > best) best = data.days[i].heartPoints;
      }
    }
    var avg = runs > 0 ? Math.round(total / runs) : 0;
    statsEl.innerHTML =
      '<div><span class="stat-label">Months</span> ' + data.monthPast + '</div>' +
      '<div><span class="stat-label">Total runs</span> ' + runs + '</div>' +
      '<div><span class="stat-label">Avg heart pts</span> ' + avg + '</div>' +
      '<div><span class="stat-label">Best run</span> ' + best + ' pts</div>';
  }

  /* ============================================================
     BIRDS
     ============================================================ */
  function spawnBird() {
    var left = Math.random() > 0.5;
    birds.push({
      sx: left ? -40 : W + 40,
      sy: 30 + Math.random() * H * 0.28,
      ex: left ? W + 40 : -40,
      ey: 30 + Math.random() * H * 0.32,
      my: 20 + Math.random() * H * 0.15,
      p: 0,
      sp: 0.12 + Math.random() * 0.14,
      wp: Math.random() * Math.PI * 2,
      sz: 4 + Math.random() * 3
    });
  }

  /* ============================================================
     EASING
     ============================================================ */
  function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  /* ============================================================
     DRAW — BACKGROUND
     ============================================================ */
  function drawBg(t) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    '#3a7bd5');
    sky.addColorStop(0.45, '#7ec8e3');
    sky.addColorStop(0.68, '#b8dce8');
    sky.addColorStop(0.76, '#8CC63F');
    sky.addColorStop(0.82, '#6AAF35');
    sky.addColorStop(1,    '#3d7a28');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* clouds */
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    drawCloud(((t * 8) % (W + 300)) - 150, H * 0.12, 60);
    drawCloud(((t * 5 + W * 0.4) % (W + 400)) - 200, H * 0.08, 45);
    drawCloud(((t * 6 + W * 0.7) % (W + 350)) - 175, H * 0.18, 50);
    ctx.restore();

    /* grass blades */
    ctx.save();
    for (var i = 0; i < W; i += 5) {
      var h = 8 + Math.sin(i * 0.15) * 3 + Math.sin(i * 0.07 + 1) * 4;
      var sw = Math.sin(t * 1.5 + i * 0.04) * 3;
      var hue = 110 + Math.sin(i * 0.1) * 10;
      ctx.strokeStyle = 'hsl(' + hue + ',55%,' + (28 + Math.sin(i * 0.3) * 5) + '%)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(i, groundY + 12);
      ctx.quadraticCurveTo(i + sw * 0.5, groundY + 12 - h * 0.5, i + sw, groundY + 12 - h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCloud(x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.7, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ============================================================
     DRAW — TRUNK
     ============================================================ */
  function drawTrunk(gp) {
    var p = ease(gp * 2);
    if (p <= 0) return;
    var n = Math.ceil(trunk.length * p);
    for (var i = 1; i < n; i++) {
      var a = trunk[i - 1], b = trunk[i];
      var g = ctx.createLinearGradient(a.x - a.w, a.y, a.x + a.w, a.y);
      g.addColorStop(0, TRUNK_DARK);
      g.addColorStop(0.35, TRUNK_MID);
      g.addColorStop(0.65, TRUNK_MID);
      g.addColorStop(1, TRUNK_DARK);
      ctx.strokeStyle = g;
      ctx.lineWidth = a.w + (b.w - a.w) * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  /* ============================================================
     DRAW — MAIN BRANCHES + LABELS
     ============================================================ */
  function drawBranches(gp) {
    for (var bi = 0; bi < branches.length; bi++) {
      var br = branches[bi];
      var bp = ease((gp - 0.15) * 1.3);
      if (bp <= 0) continue;
      var n = Math.ceil(br.pts.length * bp);

      for (var i = 1; i < n; i++) {
        var a = br.pts[i - 1], b = br.pts[i];
        var frac = i / br.pts.length;
        var r = Math.round(93 - frac * 25);
        var g = Math.round(76 + frac * 35);
        var bl = Math.round(65 - frac * 20);
        ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + bl + ')';
        ctx.lineWidth = a.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      /* day-of-week label */
      if (bp > 0.85 && n > 0) {
        var tip = br.pts[Math.min(n - 1, br.pts.length - 1)];
        var la = br.base;
        ctx.save();
        ctx.globalAlpha = ease((bp - 0.85) * 6.67);
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var lx = tip.x + Math.sin(la) * 16;
        var ly = tip.y - Math.cos(la) * 16;
        ctx.strokeText(DAY_NAMES[br.dow], lx, ly);
        ctx.fillText(DAY_NAMES[br.dow], lx, ly);
        ctx.restore();
      }
    }
  }

  /* ============================================================
     DRAW — RUN SUB-BRANCHES
     ============================================================ */
  function drawRuns(gp, t) {
    for (var i = 0; i < runSegs.length; i++) {
      var rs = runSegs[i];
      var p = ease((gp - rs.gd) * 3);
      if (p <= 0) continue;
      var ex = rs.sx + (rs.ex - rs.sx) * p;
      var ey = rs.sy + (rs.ey - rs.sy) * p;
      var isH = hovered === rs;

      if (isH) {
        ctx.save();
        ctx.shadowColor = '#AED581';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#8BC34A';
        ctx.lineWidth = rs.w + 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rs.sx, rs.sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
      }

      ctx.strokeStyle = isH ? '#689F38' : BRANCH_COLOR;
      ctx.lineWidth = rs.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(rs.sx, rs.sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  /* ============================================================
     DRAW — LEAVES
     ============================================================ */
  function drawLeaves(gp, t) {
    for (var i = 0; i < leaves.length; i++) {
      var lf = leaves[i];
      var p = ease((gp - lf.gd) * 2.5);
      if (p <= 0) continue;
      var swX = Math.sin(t * 1.3 + lf.ph) * 3;
      var swY = Math.cos(t * 1.1 + lf.ph * 1.2) * 1.5;

      ctx.save();
      ctx.translate(lf.x + swX, lf.y + swY);
      ctx.rotate(lf.r + Math.sin(t * 0.8 + lf.ph) * 0.15);
      ctx.scale(p, p);
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.fillStyle = lf.c;
      ctx.beginPath();
      var s = lf.s;
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.65, s, 0);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.65, -s, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(s * 0.6, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================================================
     DRAW — FRUITS
     ============================================================ */
  function drawFruits(gp, t) {
    for (var i = 0; i < fruits.length; i++) {
      var fr = fruits[i];
      var p = ease((gp - fr.gd) * 2);
      if (p <= 0) continue;
      var bob = Math.sin(t * 1.8 + fr.ph) * 2;
      var r = fr.s * p;

      ctx.save();
      ctx.translate(fr.x, fr.y + bob);

      /* stem */
      ctx.strokeStyle = '#5D4037';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(2, -r - 4, 3, -r - 7);
      ctx.stroke();

      /* small leaf on stem */
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      ctx.ellipse(4, -r - 5, 3, 1.5, 0.4, 0, Math.PI * 2);
      ctx.fill();

      /* glow */
      ctx.shadowColor = fr.c;
      ctx.shadowBlur = 8;

      /* body */
      ctx.fillStyle = fr.c;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      /* highlight */
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ============================================================
     DRAW — BIRDS
     ============================================================ */
  function drawBirds(t) {
    for (var i = 0; i < birds.length; i++) {
      var bd = birds[i];
      if (bd.p >= 1) continue;
      var q = 1 - bd.p;
      var mx = (bd.sx + bd.ex) / 2;
      var bx = q * q * bd.sx + 2 * q * bd.p * mx + bd.p * bd.p * bd.ex;
      var by = q * q * bd.sy + 2 * q * bd.p * bd.my + bd.p * bd.p * bd.ey;
      var wing = Math.sin(t * 10 + bd.wp) * 0.5;
      var s = bd.sz;

      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = BIRD_COLOR;
      ctx.globalAlpha = 0.65;

      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.8, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-s * 0.2, 0);
      ctx.quadraticCurveTo(-s * 1.2, -s * (0.8 + wing), -s * 1.8, s * 0.1);
      ctx.lineTo(-s * 0.2, 0);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(s * 0.2, 0);
      ctx.quadraticCurveTo(s * 1.2, -s * (0.8 + wing), s * 1.8, s * 0.1);
      ctx.lineTo(s * 0.2, 0);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ============================================================
     DRAW — FALLING LEAF PARTICLES
     ============================================================ */
  function drawParticles(t) {
    for (var i = 0; i < particles.length; i++) {
      var pl = particles[i];
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(pl.r);
      ctx.globalAlpha = pl.a;
      ctx.fillStyle = pl.c;
      ctx.beginPath();
      var s = pl.s;
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.5, s, 0);
      ctx.quadraticCurveTo(0, s * 0.5, -s, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ============================================================
     TOOLTIP
     ============================================================ */
  function drawTooltip() {
    if (!hovered) { tooltipEl.style.display = 'none'; return; }
    var d = hovered.data;
    var dayName = DAY_NAMES[d.dayOfWeek];
    var wk = d.week + 1;
    var hp = d.heartPoints;
    var mins = Math.round(hp / 2);
    var pct = Math.min(100, Math.round(hp / 120 * 100));

    tooltipEl.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#2E7D32">' +
      '\uD83C\uDFC3 ' + dayName + ', Week ' + wk + '</div>' +
      '<div style="display:flex;gap:16px;margin-bottom:8px">' +
      '<div>\u2764\uFE0F ' + hp + ' pts</div>' +
      '<div>\u23F1\uFE0F ~' + mins + ' min</div></div>' +
      '<div style="background:#E8F5E9;border-radius:6px;height:8px;overflow:hidden">' +
      '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#66BB6A,#FF9800);border-radius:6px"></div></div>';

    tooltipEl.style.display = 'block';
    var tx = mouseX + 16, ty = mouseY - 10;
    if (tx + 220 > W) tx = mouseX - 230;
    if (ty + 100 > H) ty = mouseY - 110;
    if (ty < 4) ty = 4;
    tooltipEl.style.left = tx + 'px';
    tooltipEl.style.top  = ty + 'px';
  }

  /* ============================================================
     HIT DETECTION
     ============================================================ */
  function findHover() {
    var best = null, minD = 18;

    for (var i = 0; i < runSegs.length; i++) {
      var rs = runSegs[i];
      var dx = rs.ex - rs.sx, dy = rs.ey - rs.sy;
      var len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      var t = ((mouseX - rs.sx) * dx + (mouseY - rs.sy) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var px = rs.sx + t * dx, py = rs.sy + t * dy;
      var d = Math.sqrt((mouseX - px) * (mouseX - px) + (mouseY - py) * (mouseY - py));
      if (d < minD) { minD = d; best = rs; }
    }

    for (var j = 0; j < fruits.length; j++) {
      var fr = fruits[j];
      var fd = Math.sqrt((mouseX - fr.x) * (mouseX - fr.x) + (mouseY - fr.y) * (mouseY - fr.y));
      if (fd < fr.s + 8 && fd < minD) {
        for (var k = 0; k < runSegs.length; k++) {
          if (runSegs[k].data === fr.data) { best = runSegs[k]; minD = fd; break; }
        }
      }
    }

    hovered = best;
    canvas.style.cursor = best ? 'pointer' : 'default';
  }

  /* ============================================================
     UPDATE
     ============================================================ */
  function update(dt, t) {
    /* birds */
    for (var i = 0; i < birds.length; i++) birds[i].p += birds[i].sp * dt / 1000;
    birds = birds.filter(function (b) { return b.p < 1; });
    if (Math.random() < 0.0005 * dt && birds.length < 4) spawnBird();

    /* falling leaf particles */
    for (var j = 0; j < particles.length; j++) {
      var pl = particles[j];
      pl.x += pl.vx + Math.sin(t * 2 + pl.r) * 0.3;
      pl.y += pl.vy;
      pl.r += pl.rs;
      pl.a -= 0.0008 * dt;
    }
    particles = particles.filter(function (p) { return p.a > 0 && p.y < H + 20; });
    if (Math.random() < 0.0008 * dt && particles.length < 10 && leaves.length > 0) {
      var src = leaves[Math.floor(Math.random() * leaves.length)];
      particles.push({
        x: src.x, y: src.y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.2 + Math.random() * 0.4,
        s: 2.5 + Math.random() * 3,
        r: Math.random() * Math.PI * 2,
        rs: (Math.random() - 0.5) * 0.015,
        c: src.c,
        a: 0.8
      });
    }

    findHover();
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  var lastFrame = performance.now();

  function frame(now) {
    var dt = Math.min(now - lastFrame, 50);
    lastFrame = now;
    var elapsed = (now - t0) / 1000;
    var gp = Math.min(1, elapsed / GROWTH_SEC);

    update(dt, elapsed);

    ctx.clearRect(0, 0, W, H);
    drawBg(elapsed);
    drawTrunk(gp);
    drawBranches(gp);
    drawRuns(gp, elapsed);
    drawLeaves(gp, elapsed);
    drawFruits(gp, elapsed);
    drawParticles(elapsed);
    drawBirds(elapsed);
    drawTooltip();

    requestAnimationFrame(frame);
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  canvas.addEventListener('mousemove', function (e) { mouseX = e.clientX; mouseY = e.clientY; });
  canvas.addEventListener('mouseleave', function () { mouseX = mouseY = -9999; hovered = null; });
  window.addEventListener('resize', function () {
    resize();
    t0 = performance.now() - GROWTH_SEC * 1000;
  });

  /* ============================================================
     INIT
     ============================================================ */
  resize();
  for (var bi = 0; bi < 2; bi++) spawnBird();
  requestAnimationFrame(frame);
})();
