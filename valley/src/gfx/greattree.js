export const GREAT_TREE = {
  bound: [1, 1, 1, 0.2],
  form: [0, 0.3, 1, 0],
  la: new Float32Array(48),
  lb: new Float32Array(48),
  f: new Float32Array(64),
  nl: 0,
  nf: 0,
};

const REACH = 6.3;

export function shapeGreatTree(scene, stage) {
  const G = GREAT_TREE;
  const sc = 1.55 + 0.27 * Math.max(1, stage);
  const th = 2.3 * sc, tr = 0.2 * sc * (0.85 + 0.05 * Math.min(6, scene.st.streak));
  const limbs = scene.limbs.slice().sort((a, b) => b.vigor - a.vigor).slice(0, 7);
  const most = Math.max(1e-6, ...limbs.map((l) => l.vigor));
  const leavesOn = new Map();
  for (const L of scene.leaves) {
    const li = scene.twigs[L.ti]?.li;
    if (li != null) leavesOn.set(li, (leavesOn.get(li) || 0) + 1);
  }
  const leafy = !scene.winter && scene.leaves.length > 0;
  const la = [], lb = [], f = [];
  let reach = tr + 0.5, top = th + 0.5;
  limbs.forEach((l, i) => {
    const v = l.vigor / most, phi = i * 2.39996 + 0.5;
    const ay = th * (0.5 + 0.42 * Math.min(1, Math.max(0, l.u ?? i / 7)));
    const len = sc * (0.75 + 0.75 * v);
    const ex = Math.cos(phi) * len * 0.85, ez = Math.sin(phi) * len * 0.85, ey = ay + len * 0.55;
    const r0 = tr * (0.38 + 0.3 * v);
    la.push(0, ay, 0, r0);
    lb.push(ex, ey, ez, r0 * 0.42);
    reach = Math.max(reach, Math.hypot(ex, ez) + 0.3);
    top = Math.max(top, ey + 0.3);
    if (!leafy) return;
    const share = (leavesOn.get(l.li) || 0) / Math.max(1, scene.leaves.length) * limbs.length;
    const r = sc * 0.5 * Math.min(1.35, 0.75 + 0.45 * Math.sqrt(share));
    const out = 0.5 * r / Math.max(1e-6, Math.hypot(ex, ez));
    f.push(ex, ey + 0.1 * r, ez, r);
    f.push(ex * (1 + out) + 0.2 * r, ey - 0.35 * r, ez * (1 + out) - 0.15 * r, r * 0.72);
    reach = Math.max(reach, Math.hypot(ex, ez) * (1 + out) + r);
    top = Math.max(top, ey + 1.1 * r);
  });
  if (leafy) {
    const r = 1.05 * sc * (limbs.length ? 0.78 : 1);
    f.push(0, th + 0.7 * sc, 0, r);
    f.push(0.2 * sc, th + 1.45 * sc, -0.2 * sc, r * 0.62);
    top = Math.max(top, th + 1.45 * sc + r * 0.62 + 0.2);
    reach = Math.max(reach, r + 0.3);
  }
  const fit = Math.min(1, REACH / (reach + 0.35));
  for (let i = 0; i < lb.length; i += 4) { lb[i] *= fit; lb[i + 2] *= fit; }
  for (let i = 0; i < f.length; i += 4) { f[i] *= fit; f[i + 2] *= fit; f[i + 3] *= Math.max(0.85, fit); }
  G.bound = [Math.min(REACH, reach) + 0.35, top + 0.4, th, tr];
  G.form = [Math.min(0.32, scene.fruits.length / 30), 0.16 * sc, sc, leafy ? 0 : 1];
  G.la = Float32Array.from({ length: 48 }, (_, i) => la[i] ?? 0);
  G.lb = Float32Array.from({ length: 48 }, (_, i) => lb[i] ?? 0);
  G.f = Float32Array.from({ length: 64 }, (_, i) => f[i] ?? 0);
  G.nl = la.length / 4;
  G.nf = f.length / 4;
  return sc;
}

export function leafPaletteFor(season, heat, dormant) {
  if (dormant >= 21 || season < 0.08) return 9;
  if (season < 0.3) return 5;
  if (season < 0.5) return 1;
  if (season < 0.68) return 8;
  if (heat > 0.45) return 6;
  if (season > 0.9) return 4;
  return 0;
}
