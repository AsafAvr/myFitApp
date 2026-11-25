import { glsl, registerChunk } from '../gfx/shaderlib.js';

export const PROPS = [];
const byId = new Map();

export function registerProp(def) {
  def.type = PROPS.length + 1;
  def.scale = def.scale || [1, 1];
  PROPS.push(def);
  byId.set(def.id, def);
  return def;
}
export const propById = (id) => byId.get(id);
registerChunk('props', () => `
struct Prop { int type; vec3 base; float rot; float scale; float seed; float pal; };
${PROPS.map((p) => p.glsl).join('\n')}
float propSdf(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  switch (pr.type) {
${PROPS.map((p) => `    case ${p.type}: return sdf_${p.id}(q, pr, mat);`).join('\n')}
  }
  return 1e3;
}
bool propSeeThrough(int type, float mat) {
  if (mat < 0.5 || mat > 1.5) return false;
  return ${PROPS.filter((p) => p.seeThrough).map((p) => `type == ${p.type}`).join(' || ') || 'false'};
}
void propMat(vec3 q, float mat, Prop pr, inout Surf s) {
  switch (pr.type) {
${PROPS.map((p) => `    case ${p.type}: mat_${p.id}(q, mat, pr, s); break;`).join('\n')}
  }
}
`);

registerProp({
  id: 'tree', seeThrough: true, reach: 1.5, height: 4.5, collide: 0.34, scale: [0.82, 1.2], map: [0.25, 0.45, 0.22],
  glsl: glsl`
float sdf_tree(vec3 q, Prop pr, out float mat) {
  q.xz += 0.035 * sin(uTime * 1.2 + pr.seed * 30.0) * max(q.y - 1.2, 0.0) * vec2(0.8, 0.5);
  float trunk = sdTaper(q, vec3(0.0), vec3(0.06, 2.3, 0.02), 0.2, 0.1);
  float bound = length(q - vec3(0.0, 3.0, 0.0)) - 1.75;
  if (bound > 0.7) { mat = trunk < bound ? 0.0 : 1.0; return min(trunk, bound); }
  vec3 w = vec3(pr.seed - 0.5, 0.0, fract(pr.seed * 7.3) - 0.5) * 0.3;
  float can = length(q - vec3(0.0, 3.0, 0.0)) - 1.05;
  can = smin(can, length(q - vec3(0.66, 2.5, 0.3) - w) - 0.78, 0.16);
  can = smin(can, length(q - vec3(-0.6, 2.6, -0.4) + w) - 0.76, 0.16);
  can = smin(can, length(q - vec3(-0.15, 2.45, 0.74) - w.zyx) - 0.68, 0.16);
  can = smin(can, length(q - vec3(0.2, 3.75, -0.2) + w.zyx) - 0.66, 0.16);
  can += 0.06 * sin(q.x * 4.7 + pr.seed * 17.0) * sin(q.y * 5.1) * sin(q.z * 4.9 + 1.3);
  can += 0.022 * sin(q.x * 10.3 + 2.0) * sin(q.y * 9.1 + pr.seed * 9.0) * sin(q.z * 9.7);
  mat = trunk < can ? 0.0 : 1.0;
  return min(trunk, can) * 0.7;
}
void leafSurf(vec3 q, Prop pr, inout Surf s, float lo, float hi) {
  vec3 leaf = uLeafPal[int(pr.pal + 0.5)];
  float clump = vnoise3(q * 2.3 + pr.seed * 10.0);
  float lift = smoothstep(lo, hi, q.y);
  s.albedo = mix(leaf, mix(leaf, P_BUTTER, 0.45), smoothstep(0.56, 0.66, clump) * mix(0.35, 0.9, lift));
  s.cover = mix(0.62, 0.9, clump);
  s.soft = 1.0;
  s.ink = penLine((clump - 0.44) / 1.9) * 0.42;
  s.wrap = 0.5; s.leafy = 1.0;
  s.occ = mix(0.55, 1.0, lift) * mix(0.72, 1.0, smoothstep(0.22, 0.42, clump));
}
void barkSurf(vec3 q, Prop pr, inout Surf s) {
  float a = atan(q.z, q.x);
  float streak = vnoise(vec2(a * 3.0, q.y * 1.6 + pr.seed * 10.0));
  s.albedo = mix(P_BARK, P_UMBER, streak * 0.55);
  s.cover = 0.78;
  s.ink = penLine((abs(fract(a * 1.3 + vnoise(vec2(q.y * 2.0, pr.seed * 7.0)) * 0.8) - 0.5)) / 1.3 * 0.18) * step(0.55, streak) * 0.5;
}
void mat_tree(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { barkSurf(q, pr, s); return; }
  leafSurf(q, pr, s, 2.1, 4.2);
  if (fract(pr.seed * 7.13) < 0.3 && pr.pal < 0.5) {
    vec2 v = voronoi(q.xy * 2.6 + q.z * 1.9 + pr.seed * 20.0);
    float fruit = smoothstep(0.13, 0.09, v.x) * step(0.72, v.y);
    s.albedo = mix(s.albedo, P_POPPY, fruit);
    s.cover = mix(s.cover, 0.95, fruit);
  }
}`,
});

registerProp({
  id: 'pine', seeThrough: true, reach: 1.42, height: 5.7, collide: 0.3, scale: [0.8, 1.25], map: [0.13, 0.32, 0.27],
  glsl: glsl`
float sdf_pine(vec3 q, Prop pr, out float mat) {
  q.xz += 0.02 * sin(uTime * 1.1 + pr.seed * 30.0) * max(q.y - 1.0, 0.0) * vec2(0.7, 0.4);
  float trunk = sdCylinder(q, 0.15, 1.6);
  float fr = 0.07 * sin(q.x * 5.0 + pr.seed * 20.0) * sin(q.z * 5.0 + q.y * 2.0);
  float c1 = sdConeUp(q - vec3(0.0, 0.9, 0.0), 1.3 + fr, 2.3);
  float c2 = sdConeUp(q - vec3(0.0, 2.3, 0.0), 1.05 + fr, 2.1);
  float c3 = sdConeUp(q - vec3(0.0, 3.6, 0.0), 0.75 + fr, 2.0);
  float can = min(c1, min(c2, c3)) - 0.05;
  mat = trunk < can ? 0.0 : 1.0;
  return min(trunk, can) * 0.82;
}
void mat_pine(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { barkSurf(q, pr, s); return; }
  leafSurf(q, pr, s, 1.0, 5.4);
  float tier = fract((q.y - 0.9) / 1.35);
  s.occ *= mix(0.6, 1.0, smoothstep(0.0, 0.6, tier));
  s.ink = max(s.ink * 0.6, penLine(tier * 1.35) * 0.75);
  s.cover = mix(s.cover, 0.12, gSnow * smoothstep(0.55, 0.95, tier));
}`,
});

registerProp({
  id: 'bush', seeThrough: true, reach: 1.0, height: 1.1, collide: 0, scale: [0.7, 1.25], map: [0.3, 0.5, 0.25],
  glsl: glsl`
float sdf_bush(vec3 q, Prop pr, out float mat) {
  mat = 1.0;
  q.xz += 0.02 * sin(uTime * 1.6 + pr.seed * 30.0) * q.y;
  float d = length(q - vec3(0.0, 0.42, 0.0)) - 0.6;
  d = smin(d, length(q - vec3(0.48, 0.33, 0.15)) - 0.44, 0.2);
  d = smin(d, length(q - vec3(-0.4, 0.36, -0.25)) - 0.48, 0.2);
  d += 0.04 * sin(q.x * 7.0 + pr.seed * 9.0) * sin(q.y * 7.5) * sin(q.z * 6.5);
  return d * 0.82;
}
void mat_bush(vec3 q, float mat, Prop pr, inout Surf s) {
  leafSurf(q, pr, s, 0.1, 0.9);
  vec2 v = voronoi(q.xz * 5.0 + q.y * 3.0 + pr.seed * 20.0);
  float berry = smoothstep(0.16, 0.1, v.x) * step(0.6, v.y) * step(0.35, q.y);
  bool bloom = pr.pal > 1.5 && pr.pal < 2.5;
  s.albedo = mix(s.albedo, bloom ? PAPER : P_POPPY, berry);
  s.cover = mix(s.cover, bloom ? 0.0 : 0.95, berry);
}`,
});

registerProp({
  id: 'palm', seeThrough: true, reach: 1.7, height: 4.0, collide: 0.26, scale: [0.85, 1.05], map: [0.3, 0.52, 0.4],
  glsl: glsl`
float sdf_palm(vec3 q, Prop pr, out float mat) {
  vec3 b = vec3(0.22, 1.6, 0.0), c = vec3(0.55, 3.1, 0.0);
  float trunk = min(sdTaper(q, vec3(0.0), b, 0.17, 0.12), sdTaper(q, b, c, 0.12, 0.09));
  vec3 h = q - c;
  h.xz -= 0.04 * sin(uTime * 1.3 + pr.seed * 30.0);
  float bound = length(h) - 1.2;
  if (bound > 0.6) { mat = 0.0; return min(trunk, bound); }
  float sec = TAU / 7.0;
  float a = mod(atan(h.z, h.x) + sec * 0.5, sec) - sec * 0.5;
  float r = length(h.xz);
  vec3 f = vec3(r * cos(a), h.y, r * sin(a));
  float droop = 0.35 * f.x - 0.48 * f.x * f.x;
  vec3 g = vec3(f.x - 0.57, f.y - droop, f.z);
  float frond = sdRoundBox(g, vec3(0.55, 0.025, 0.17 * (1.0 - 0.75 * abs(g.x) / 0.55) + 0.03), 0.02) * 0.6;
  float nuts = length(h - vec3(0.0, -0.12, 0.0)) - 0.17;
  mat = trunk < min(frond, nuts) ? 0.0 : (frond < nuts ? 1.0 : 2.0);
  return min(trunk, min(frond, nuts));
}
void mat_palm(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) {
    s.albedo = mix(P_TAN, P_BARK, 0.5);
    s.cover = 0.7;
    s.ink = penLine((abs(fract(q.y * 2.6) - 0.5)) / 2.6) * 0.6;
  } else if (mat < 1.5) {
    leafSurf(q, pr, s, 2.2, 3.6);
    s.ink = max(s.ink * 0.4, 0.0);
  } else { s.albedo = P_UMBER; s.cover = 0.9; }
}`,
});

registerProp({
  id: 'mushroom', reach: 0.75, height: 1.3, collide: 0.2, scale: [0.7, 1.5], map: [0.7, 0.3, 0.25],
  glsl: glsl`
float sdf_mushroom(vec3 q, Prop pr, out float mat) {
  float stem = sdTaper(q, vec3(0.0), vec3(0.04, 0.72, 0.0), 0.14, 0.09);
  vec3 c = q - vec3(0.04, 0.7, 0.0);
  float cap = max(length(c * vec3(1.0, 1.55, 1.0)) - 0.6, -c.y - 0.03) * 0.65;
  vec3 c2 = q - vec3(-0.42, 0.3, 0.3);
  float small = min(sdCapsule(q, vec3(-0.4, 0.0, 0.28), vec3(-0.42, 0.3, 0.3), 0.06),
                    max(length(c2 * vec3(1.0, 1.5, 1.0)) - 0.26, -c2.y - 0.02) * 0.65);
  float caps = min(cap, small);
  mat = stem < caps ? 0.0 : 1.0;
  return min(stem, caps);
}
void mat_mushroom(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_CREAM; s.cover = 0.3; return; }
  vec2 v = voronoi(q.xz * 4.5 + pr.seed * 20.0);
  float under = step(q.y, q.x < -0.2 ? 0.3 : 0.69);
  float spot = smoothstep(0.22, 0.16, v.x) * (1.0 - under);
  s.albedo = mix(pr.seed > 0.5 ? P_POPPY : P_SLATE, P_TAN, under);
  s.cover = mix(mix(0.86, 0.35, under), 0.0, spot);
  s.ink = max(penLine((v.x - 0.19) / 4.5) * (1.0 - under) * 0.6,
              under * smoothstep(0.2, 0.0, abs(fract(atan(q.z, q.x - 0.04) * 3.0) - 0.5)) * 0.5);
  s.glow = spot * uNight * 0.8;
}`,
});

registerProp({
  id: 'rock', reach: 1.25, height: 1.5, collide: 0.8, scale: [0.5, 1.35], map: [0.5, 0.5, 0.52],
  glsl: glsl`
const vec3 ROCK_N[5] = vec3[5](vec3(0.83, 0.52, 0.21), vec3(-0.61, 0.61, 0.51), vec3(0.1, 0.7, -0.71),
                              vec3(-0.5, 0.31, -0.81), vec3(0.3, 0.9, 0.31));
float rockBody(vec3 c, float r, float seed) {
  float d = length(c * vec3(1.0, 1.2, 1.0)) - r;
  for (int i = 0; i < 5; i++) d = max(d, dot(c, ROCK_N[i]) - r * (0.62 + 0.25 * fract(seed * (7.0 + float(i) * 3.3))));
  return d - 0.04;
}
float sdf_rock(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float d = rockBody(q - vec3(0.0, 0.3, 0.0), 0.95, pr.seed);
  vec3 c2 = q - vec3(0.75, 0.1, 0.35);
  c2.xz = c2.zx;
  return min(d, rockBody(c2, 0.45, pr.seed + 0.37)) * 0.9;
}
void mat_rock(vec3 q, float mat, Prop pr, inout Surf s) {
  float strata = vnoise(vec2(q.y * 6.0 + vnoise(q.xz * 2.0) * 2.0, pr.seed * 9.0));
  s.albedo = uRockCol;
  s.cover = mix(0.5, 0.8, strata);
  s.ink = smoothstep(0.04, 0.0, abs(fract(strata * 2.0 + 0.25) - 0.5)) * 0.65;
  s.moss = 1.0;
}`,
});

registerProp({
  id: 'crystal', reach: 0.9, height: 2.0, collide: 0.55, scale: [0.8, 1.5], map: [0.5, 0.8, 0.95],
  light: { color: [0.35, 0.75, 1.0], radius: 5, y: 1.0, always: true },
  glsl: glsl`
float crystalShard(vec3 q, float r, float h) {
  float hx = max(abs(q.x) * 0.866 + abs(q.z) * 0.5, abs(q.z));
  float d = max(hx - r, -q.y);
  return max(d, (q.y - h) * 0.55 + hx * 0.85) * 0.8;
}
float sdf_crystal(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float d = crystalShard(q, 0.26, 1.9);
  vec3 a = q; a.xy = rot2(0.5) * a.xy;
  d = min(d, crystalShard(a - vec3(0.12, 0.0, 0.1), 0.18, 1.3));
  vec3 b = q; b.zy = rot2(-0.6) * b.zy; b.xy = rot2(-0.35) * b.xy;
  d = min(d, crystalShard(b - vec3(-0.1, 0.0, -0.05), 0.16, 1.15));
  return d;
}
void mat_crystal(vec3 q, float mat, Prop pr, inout Surf s) {
  float band = 0.5 + 0.5 * sin(q.y * 5.0 + q.x * 3.0 + uTime * 1.5);
  s.albedo = mix(P_TEAL, P_SKY, band);
  s.cover = mix(0.75, 0.1, smoothstep(0.55, 0.9, band));
  s.glow = 0.25 + 0.3 * band;
}`,
});

registerProp({
  id: 'stone', reach: 0.6, height: 2.6, collide: 0.5, scale: [0.9, 1.2], map: [0.6, 0.6, 0.65],
  glsl: glsl`
float sdf_stone(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  q.xy = rot2(0.06 * (pr.seed - 0.5) * 4.0) * q.xy;
  float w = 0.42 - 0.06 * q.y;
  return sdRoundBox(q - vec3(0.0, 1.2, 0.0), vec3(w, 1.25, 0.22), 0.1) * 0.9;
}
void mat_stone(vec3 q, float mat, Prop pr, inout Surf s) {
  float n = vnoise(q.xy * 5.0 + pr.seed * 9.0);
  s.albedo = uRockCol;
  s.cover = mix(0.5, 0.75, n);
  vec2 r = vec2(q.x, q.y - 1.5);
  float sp = abs(fract(length(r) * 3.2 - atan(r.y, r.x) / TAU) - 0.5);
  float rune = smoothstep(0.1, 0.03, sp) * step(length(r), 0.3) * step(0.15, abs(q.z));
  s.albedo = mix(s.albedo, P_TEAL, rune);
  s.cover = mix(s.cover, 0.9, rune);
  s.glow = rune * uNight * 0.7;
  s.ink = smoothstep(0.03, 0.0, abs(fract(n * 2.0) - 0.5)) * 0.4;
  s.moss = 0.6;
}`,
});

registerProp({
  id: 'house', reach: 3.4, height: 4.5, collide: 2.5, map: [0.75, 0.42, 0.3],
  light: { color: [1.0, 0.72, 0.4], radius: 6, y: 1.4, forward: 2.3 },
  glsl: glsl`
float sdf_house(vec3 q, Prop pr, out float mat) {
  float body = sdBox(q - vec3(0.0, 1.25, 0.0), vec3(2.2, 1.25, 1.7));
  vec2 rz = vec2(abs(q.z), q.y);
  float side = dot(rz - vec2(2.15, 2.3), vec2(0.572, 0.82));
  float roof = max(max(side, 2.3 - q.y), abs(q.x) - 2.5);
  float gable = max(max(side + 0.22, 2.3 - q.y), abs(q.x) - 2.2);
  float chim = sdBox(q - vec3(1.25, 3.5, 0.7), vec3(0.27, 0.75, 0.27));
  float walls = min(body, gable);
  float step_ = sdBox(q - vec3(0.0, 0.08, 1.9), vec3(0.6, 0.08, 0.25));
  mat = 0.0;
  float d = walls;
  if (roof < d) { d = roof; mat = 1.0; }
  if (chim < d) { d = chim; mat = 2.0; }
  if (step_ < d) { d = step_; mat = 2.0; }
  return d;
}
void mat_house(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 1.5) {
    vec2 pv = pavers(q.xy * 3.0 + q.z * 2.0);
    s.albedo = fract(pv.y * 5.3) < 0.5 ? P_PEACH : P_CLAY;
    s.cover = mix(0.3, 0.7, pv.y);
    s.ink = penLine(0.5 * pv.x / 3.0) * 0.8;
    return;
  }
  if (mat > 0.5) {
    float run = abs(q.z) * 3.2 - q.y * 0.4;
    float row = fract(run);
    if (pr.seed < 0.34) {
      s.albedo = mix(P_WOOD, P_HONEY, 0.35); s.cover = 0.72;
      float straw = vnoise(vec2(q.x * 9.0, run * 0.7));
      s.ink = max(penLine(row / 3.2) * 0.65, penLine((abs(fract(q.x * 3.5 + straw) - 0.5)) / 3.5) * step(0.5, straw) * 0.5);
    } else {
      s.albedo = pr.seed < 0.67 ? mix(P_BRICK, P_POPPY, 0.4) : P_SLATE;
      float col = fract(q.x * 2.4 + floor(run) * 0.5);
      s.cover = mix(0.6, 0.9, hash12(vec2(floor(q.x * 2.4 + floor(run) * 0.5), floor(run))));
      s.ink = max(penLine(row / 3.2) * 0.75, penLine(col / 2.4) * 0.4);
    }
    s.cover = mix(s.cover, 0.08, gSnow * 0.85);
    return;
  }
  bool front = abs(q.z) > 1.69;
  vec2 f = front ? vec2(q.x, q.y) : vec2(q.z, q.y);
  float tim = min(abs(f.y - 2.4) - 0.1, abs(abs(f.x) - (front ? 2.1 : 1.6)) - 0.09);
  tim = min(tim, f.y - 0.2);
  tim = min(tim, max(abs(f.y - 3.0) - 0.05, 2.5 - f.y));
  s.albedo = P_CREAM; s.cover = 0.16;
  if (tim < 0.0) { s.albedo = P_BARK; s.cover = 0.85; }
  s.ink = penLine(tim) * 0.8;
  vec2 w = vec2(abs(f.x) - (front ? 1.25 : 0.0), f.y - 1.45);
  float dw = max(abs(w.x) - 0.36, abs(w.y) - 0.42);
  float lit = step(0.25, fract(pr.seed * 7.3 + floor(f.x + 3.0) * 0.37 + (front ? 0.0 : 0.5)));
  if (dw < 0.0) {
    s.albedo = P_SLATE; s.cover = mix(0.7, 0.0, uNight * lit);
    s.glow = uNight * lit;
    s.ink = max(penLine(w.x), penLine(w.y)) * 0.8;
  }
  s.ink = max(s.ink, penLine(dw) * 0.9);
  if (q.z > 1.69) {
    float dd = max(abs(q.x) - 0.42, q.y - 1.55);
    if (dd < 0.0) {
      s.albedo = mix(P_BARK, P_UMBER, 0.35); s.cover = 0.82; s.glow = 0.0;
      s.ink = penLine((abs(fract(q.x * 3.5) - 0.5)) / 3.5) * 0.5;
      float knob = step(length(vec2(q.x - 0.27, q.y - 0.8)), 0.06);
      s.albedo = mix(s.albedo, P_HONEY, knob); s.cover = mix(s.cover, 0.95, knob);
    }
    s.ink = max(s.ink, penLine(dd) * 0.9);
  }
}`,
});

registerProp({
  id: 'lamp', reach: 0.35, height: 3.0, collide: 0.15, map: [1.0, 0.85, 0.5],
  light: { color: [1.0, 0.7, 0.36], radius: 9, y: 2.5 },
  glsl: glsl`
float sdf_lamp(vec3 q, Prop pr, out float mat) {
  float post = min(sdCylinder(q, 0.055, 2.35), sdCylinder(q, 0.13, 0.25));
  float glass = sdRoundBox(q - vec3(0.0, 2.55, 0.0), vec3(0.15, 0.2, 0.15), 0.04);
  float cap = sdConeUp(q - vec3(0.0, 2.74, 0.0), 0.27, 0.22);
  float iron = min(post, cap);
  mat = glass < iron ? 1.0 : 0.0;
  return min(iron, glass);
}
void mat_lamp(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_CHARCOAL; s.cover = 0.9; return; }
  s.albedo = P_BUTTER;
  s.cover = mix(0.45, 0.0, uNight);
  s.glow = uNight;
}`,
});

registerProp({
  id: 'waystone', reach: 1.1, height: 3.9, collide: 0.75, map: [0.4, 0.9, 1.0],
  light: { color: [0.35, 0.8, 1.0], radius: 8, y: 3.2, always: true },
  glsl: glsl`
float sdf_waystone(vec3 q, Prop pr, out float mat) {
  float base = min(sdCylinder(q, 1.05, 0.16), sdCylinder(q, 0.75, 0.32));
  float w = 0.4 - 0.065 * q.y;
  float mono = sdRoundBox(q - vec3(0.0, 1.7, 0.0), vec3(w, 1.45, w * 0.72), 0.06) * 0.9;
  float orb = length(q - vec3(0.0, 3.55 + 0.08 * sin(uTime * 1.4), 0.0)) - 0.2;
  float stone = min(base, mono);
  mat = orb < stone ? 1.0 : 0.0;
  return min(stone, orb);
}
void mat_waystone(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { s.albedo = P_SKY; s.cover = 0.12; s.glow = 0.8; return; }
  float n = vnoise(q.xy * 4.0 + q.z * 3.0);
  s.albedo = mix(P_STONE, P_SLATE, 0.3);
  s.cover = mix(0.5, 0.78, n);
  float lines = smoothstep(0.08, 0.02, abs(fract(q.y * 1.6 + 0.2 * sin(q.x * 9.0)) - 0.5)) * step(0.5, q.y) * step(q.y, 3.0) * step(abs(q.x), 0.2);
  float ring = smoothstep(0.06, 0.02, abs(length(q.xz) - 0.9)) * step(q.y, 0.2);
  float rune = max(lines, ring);
  s.albedo = mix(s.albedo, P_TEAL, rune);
  s.cover = mix(s.cover, 0.92, rune);
  s.glow = rune * (0.3 + 0.5 * uNight) * (0.6 + 0.4 * sin(uTime * 1.4 - q.y * 2.0));
  s.ink = smoothstep(0.03, 0.0, abs(fract(n * 2.0) - 0.5)) * 0.35;
}`,
});

registerProp({
  id: 'stall', reach: 1.75, height: 2.6, collide: 1.3, map: [0.85, 0.6, 0.35],
  glsl: glsl`
float sdf_stall(vec3 q, Prop pr, out float mat) {
  float counter = sdBox(q - vec3(0.0, 0.5, 0.0), vec3(1.2, 0.5, 0.55));
  vec3 a = vec3(abs(q.x) - 1.18, q.y, abs(q.z) - 0.55);
  float posts = sdCylinder(a, 0.05, 2.1);
  vec3 r = q - vec3(0.0, 2.2, 0.15);
  r.zy = rot2(0.28) * r.zy;
  float awn = sdBox(r, vec3(1.4, 0.035, 0.95));
  float goods = length(vec3(mod(q.x + 0.3, 0.6) - 0.3, q.y - 1.08, q.z)) - 0.15;
  goods = max(goods, abs(q.x) - 1.1);
  float wood = min(counter, posts);
  mat = 0.0;
  float d = wood;
  if (awn < d) { d = awn; mat = 1.0; }
  if (goods < d) { d = goods; mat = 2.0; }
  return d;
}
void mat_stall(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) {
    s.albedo = P_WOOD; s.cover = 0.7;
    s.ink = penLine((abs(fract(q.y * 3.0 + q.x * 0.6) - 0.5)) / 3.0) * 0.55;
    return;
  }
  if (mat < 1.5) {
    float stripe = step(0.5, fract(q.x * 1.6));
    s.albedo = pr.seed < 0.5 ? P_BRICK : P_SLATE;
    s.cover = mix(0.06, 0.82, stripe);
    s.ink = penLine((abs(fract(q.x * 3.2) - 0.5)) / 3.2) * 0.5;
    return;
  }
  float k = floor((q.x + 0.3) / 0.6);
  float pick = fract(k * 0.37 + pr.seed);
  s.albedo = pick < 0.33 ? P_APRICOT : (pick < 0.66 ? P_LEAF : P_BUTTER);
  s.cover = 0.85;
}`,
});

registerProp({
  id: 'well', reach: 1.1, height: 2.5, collide: 0.9, map: [0.55, 0.55, 0.6],
  glsl: glsl`
float sdf_well(vec3 q, Prop pr, out float mat) {
  float ring = max(sdCylinder(q, 0.78, 0.7), -(length(q.xz) - 0.56));
  float water = sdCylinder(q, 0.6, 0.45);
  vec3 a = vec3(abs(q.x) - 0.7, q.y, q.z);
  float posts = sdCylinder(a, 0.06, 1.9);
  float roof = sdConeUp(q - vec3(0.0, 1.85, 0.0), 1.05, 0.62);
  mat = 0.0;
  float d = ring;
  if (posts < d) { d = posts; mat = 1.0; }
  if (roof < d) { d = roof; mat = 2.0; }
  if (water < d) { d = water; mat = 3.0; }
  return d;
}
void mat_well(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) {
    vec2 pv = pavers(vec2(atan(q.z, q.x) * 2.2, q.y * 3.2));
    s.albedo = fract(pv.y * 5.3) < 0.5 ? P_PEACH : mix(P_STONE, P_CLAY, 0.5);
    s.cover = mix(0.3, 0.7, pv.y);
    s.ink = penLine(0.5 * pv.x / 3.0 * 0.75) * 0.8;
  } else if (mat < 1.5) { s.albedo = P_BARK; s.cover = 0.8; }
  else if (mat < 2.5) {
    s.albedo = P_SLATE; s.cover = 0.8;
    s.ink = penLine((abs(fract(q.y * 6.0) - 0.5)) / 6.0) * 0.5;
  } else { s.albedo = P_TEAL; s.cover = 0.6; s.soft = 1.0; }
}`,
});

registerProp({
  id: 'birch', seeThrough: true, reach: 1.15, height: 4.7, collide: 0.2, scale: [0.85, 1.2], map: [0.6, 0.72, 0.45],
  glsl: glsl`
float sdf_birch(vec3 q, Prop pr, out float mat) {
  q.xz += 0.03 * sin(uTime * 1.3 + pr.seed * 30.0) * max(q.y - 1.5, 0.0) * vec2(0.8, 0.5);
  float trunk = sdTaper(q, vec3(0.0), vec3(0.16 * (pr.seed - 0.5), 3.6, 0.0), 0.11, 0.05);
  float bound = length(q - vec3(0.0, 3.5, 0.0)) - 1.4;
  if (bound > 0.6) { mat = trunk < bound ? 0.0 : 1.0; return min(trunk, bound); }
  float can = length((q - vec3(0.0, 3.9, 0.0)) * vec3(1.0, 0.8, 1.0)) - 0.76;
  can = smin(can, length(q - vec3(0.5, 3.2, 0.2)) - 0.55, 0.14);
  can = smin(can, length(q - vec3(-0.45, 3.35, -0.3)) - 0.53, 0.14);
  can = smin(can, length(q - vec3(-0.1, 2.85, 0.5)) - 0.45, 0.14);
  can += 0.04 * sin(q.x * 6.0 + pr.seed * 17.0) * sin(q.y * 6.3) * sin(q.z * 5.9);
  mat = trunk < can ? 0.0 : 1.0;
  return min(trunk, can) * 0.75;
}
void mat_birch(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { leafSurf(q, pr, s, 2.6, 4.4); return; }
  s.albedo = P_CREAM; s.cover = 0.1;
  float dash = step(0.6, vnoise(vec2(atan(q.z, q.x) * 2.0 + pr.seed * 9.0, floor(q.y * 3.3 + pr.seed))));
  s.ink = dash * penLine((abs(fract(q.y * 3.3 + pr.seed) - 0.5)) / 3.3) * 0.85;
}`,
});

registerProp({
  id: 'willow', seeThrough: true, reach: 1.72, height: 3.9, collide: 0.3, scale: [0.85, 1.08], map: [0.4, 0.55, 0.42],
  glsl: glsl`
float sdf_willow(vec3 q, Prop pr, out float mat) {
  float trunk = sdTaper(q, vec3(0.0), vec3(0.1, 2.0, 0.05), 0.24, 0.14);
  vec3 c = q - vec3(0.0, 2.3, 0.0);
  c.xz += 0.04 * sin(uTime * 1.1 + pr.seed * 30.0 + q.y * 1.5) * max(2.3 - q.y, 0.0);
  float dome = length(c * vec3(1.0, 0.82, 1.0)) - 1.55;
  float hollow = length((c + vec3(0.0, 0.5, 0.0)) * vec3(1.0, 0.7, 1.0)) - 1.25;
  float can = max(max(dome, -hollow), 0.55 - q.y);
  can += 0.07 * sin(atan(c.z, c.x) * 9.0 + pr.seed * 20.0) * smoothstep(1.6, 0.6, q.y);
  mat = trunk < can ? 0.0 : 1.0;
  return min(trunk, can) * 0.7;
}
void mat_willow(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { barkSurf(q, pr, s); return; }
  leafSurf(q, pr, s, 1.0, 3.6);
  float strand = abs(fract(atan(q.z, q.x) * 4.5 + pr.seed * 3.0) - 0.5) / 4.5 * 1.2;
  s.ink = max(s.ink * 0.4, penLine(strand) * smoothstep(2.6, 1.2, q.y) * 0.45);
}`,
});

registerProp({
  id: 'deadtree', reach: 1.12, height: 3.5, collide: 0.22, scale: [0.8, 1.25], map: [0.5, 0.45, 0.4],
  glsl: glsl`
float sdf_deadtree(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float d = sdTaper(q, vec3(0.0), vec3(0.1, 2.4, 0.0), 0.2, 0.09);
  d = min(d, sdTaper(q, vec3(0.06, 1.5, 0.0), vec3(0.9, 2.6, 0.2), 0.08, 0.03));
  d = min(d, sdTaper(q, vec3(0.05, 1.9, 0.0), vec3(-0.75, 2.9, -0.25), 0.07, 0.03));
  d = min(d, sdTaper(q, vec3(0.1, 2.4, 0.0), vec3(0.25, 3.4, 0.45), 0.06, 0.02));
  d = min(d, sdTaper(q, vec3(0.6, 2.25, 0.13), vec3(1.05, 2.3, -0.3), 0.04, 0.02));
  return d;
}
void mat_deadtree(vec3 q, float mat, Prop pr, inout Surf s) {
  barkSurf(q, pr, s);
  s.albedo = mix(s.albedo, P_STONE, 0.5);
  s.cover = 0.66;
}`,
});

registerProp({
  id: 'reeds', reach: 0.62, height: 1.75, collide: 0, scale: [0.8, 1.3], map: [0.42, 0.56, 0.36],
  glsl: glsl`
float sdf_reeds(vec3 q, Prop pr, out float mat) {
  float sec = TAU / 5.0;
  float k = floor(atan(q.z, q.x) / sec + 0.5);
  float ca = k * sec;
  float h = 1.1 + 0.5 * fract(sin(k * 12.9898 + pr.seed * 78.233) * 43758.5453);
  vec3 root = vec3(cos(ca) * 0.26, 0.0, sin(ca) * 0.26);
  vec3 top = vec3(root.x * 1.7 + 0.05 * sin(uTime * 1.8 + pr.seed * 30.0 + k), h, root.z * 1.7);
  float stem = sdCapsule(q, root, top, 0.026);
  float head = sdCapsule(q, mix(root, top, 0.72), mix(root, top, 0.94), 0.058);
  mat = head < stem ? 1.0 : 0.0;
  return min(stem, head) * 0.8;
}
void mat_reeds(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { s.albedo = P_UMBER; s.cover = 0.95; }
  else { s.albedo = P_GREEN; s.cover = 0.9; }
}`,
});

registerProp({
  id: 'bigcap', seeThrough: true, reach: 1.66, height: 3.8, collide: 0.36, scale: [0.75, 1.2], map: [0.6, 0.35, 0.3],
  glsl: glsl`
float sdf_bigcap(vec3 q, Prop pr, out float mat) {
  float lean = 0.24 * (pr.seed - 0.5);
  float stem = sdTaper(q, vec3(0.0), vec3(lean, 2.7, 0.0), 0.3, 0.2);
  vec3 c = q - vec3(lean, 2.7, 0.0);
  float bound = length(c) - 1.72;
  if (bound > 0.6) { mat = stem < bound ? 0.0 : 1.0; return min(stem, bound); }
  float cap = max(length(c * vec3(1.0, 1.7, 1.0)) - 1.6, -c.y - 0.05) * 0.58;
  mat = stem < cap ? 0.0 : 1.0;
  return min(stem, cap);
}
void mat_bigcap(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_CREAM; s.cover = 0.26; s.ink = penLine((abs(fract(atan(q.z, q.x) * 1.6) - 0.5)) / 1.6 * 0.25) * 0.4; return; }
  vec3 c = q - vec3(0.24 * (pr.seed - 0.5), 2.7, 0.0);
  float under = step(c.y, 0.0);
  vec2 v = voronoi(c.xz * 1.7 + pr.seed * 20.0);
  float spot = smoothstep(0.26, 0.2, v.x) * (1.0 - under);
  float pick = fract(pr.seed * 5.3);
  s.albedo = mix(pick < 0.3 ? P_POPPY : (pick < 0.6 ? P_SLATE : (pick < 0.8 ? P_TEAL : P_HONEY)), P_TAN, under);
  s.cover = mix(mix(0.86, 0.4, under), 0.0, spot);
  s.ink = max(penLine((v.x - 0.23) / 1.7) * (1.0 - under) * 0.6,
              under * penLine((abs(fract(atan(c.z, c.x) * 5.0) - 0.5)) / 5.0 * length(c.xz)) * 0.5);
  s.soft = 1.0;
  s.glow = spot * uNight * 0.8;
}`,
});

registerProp({
  id: 'stump', reach: 0.68, height: 0.5, collide: 0.4, scale: [0.8, 1.3], map: [0.6, 0.48, 0.32],
  glsl: glsl`
float sdf_stump(vec3 q, Prop pr, out float mat) {
  float d = sdCylinder(q, 0.34 + 0.04 * sin(atan(q.z, q.x) * 5.0 + pr.seed * 9.0), 0.42);
  float root = sdTaper(vec3(abs(q.x), q.y, abs(q.z)), vec3(0.24, 0.14, 0.24), vec3(0.5, 0.0, 0.5), 0.09, 0.04);
  mat = (q.y > 0.4 && d < root) ? 1.0 : 0.0;
  return min(d, root) * 0.85;
}
void mat_stump(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { barkSurf(q, pr, s); return; }
  s.albedo = P_WOOD; s.cover = 0.5;
  s.ink = penLine((abs(fract(length(q.xz) * 9.0 + 0.3) - 0.5)) / 9.0) * 0.6;
}`,
});

registerProp({
  id: 'cairn', reach: 0.72, height: 1.45, collide: 0.6, scale: [0.8, 1.4], map: [0.5, 0.5, 0.52],
  glsl: glsl`
float sdf_cairn(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float d = rockBody(q - vec3(0.0, 0.28, 0.0), 0.55, pr.seed);
  vec3 b = q - vec3(0.05, 0.75, 0.0);
  b.xz = b.zx;
  d = min(d, rockBody(b, 0.38, pr.seed + 0.3));
  d = min(d, rockBody(q - vec3(-0.03, 1.12, 0.04), 0.24, pr.seed + 0.6));
  return d * 0.9;
}
void mat_cairn(vec3 q, float mat, Prop pr, inout Surf s) { mat_rock(q, mat, pr, s); s.moss = 0.4; }`,
});

registerProp({
  id: 'chest', reach: 0.8, height: 0.95, collide: 0.6, map: [0.87, 0.7, 0.43],
  glsl: glsl`
float sdf_chest(vec3 q, Prop pr, out float mat) {
  float box = sdRoundBox(q - vec3(0.0, 0.3, 0.0), vec3(0.52, 0.29, 0.36), 0.03);
  vec3 l = q - vec3(0.0, 0.58, 0.0);
  if (pr.pal > 0.5) { l = q - vec3(0.0, 0.58, -0.36); l.yz = rot2(1.3) * l.yz; l.z -= 0.36; }
  float lid = max(max(length(l.yz * vec2(1.0, 0.86)) - 0.31, -l.y), abs(l.x) - 0.54);
  float latch = sdRoundBox(q - vec3(0.0, 0.5, 0.38), vec3(0.07, 0.1, 0.03), 0.012);
  float d = min(box, lid);
  mat = latch < d ? 2.0 : (lid < box ? 1.0 : 0.0);
  return min(d, latch) * 0.9;
}
void mat_chest(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 1.5) { s.albedo = P_BUTTER; s.cover = 0.9; return; }
  s.albedo = mix(P_WOOD, P_BARK, 0.3 + 0.35 * mat); s.cover = 0.82;
  s.ink = max(penLine(abs(abs(q.x) - 0.3) - 0.035), penLine(fract(q.y * 6.0 + 0.2) - 0.5) * 0.35 * (1.0 - mat));
}`,
});

registerProp({
  id: 'beacon', reach: 1.5, height: 9.2, collide: 1.2, map: [0.95, 0.6, 0.3],
  light: { color: [1.0, 0.7, 0.36], radius: 13, y: 8.4, always: true },
  glsl: glsl`
float sdf_beacon(vec3 q, Prop pr, out float mat) {
  float tower = sdTaper(q, vec3(0.0, 0.0, 0.0), vec3(0.0, 7.3, 0.0), 1.2, 0.82);
  float gallery = sdCylinder(q - vec3(0.0, 7.2, 0.0), 1.2, 0.28);
  float bowl = sdCylinder(q - vec3(0.0, 7.48, 0.0), 0.55, 0.32);
  float fire = sdEllipsoid(q - vec3(0.0, 8.35, 0.0), vec3(0.42, 0.66, 0.42));
  float stone = min(tower, min(gallery, bowl));
  mat = fire < stone ? 1.0 : 0.0;
  return min(stone, fire) * 0.85;
}
void mat_beacon(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { s.albedo = P_APRICOT; s.cover = mix(0.5, 0.0, uNight); s.glow = 1.0; return; }
  s.albedo = mix(P_STONE, P_TAN, 0.25 + 0.2 * pr.seed); s.cover = 0.72;
  float course = fract(q.y / 0.62);
  float ang = atan(q.z, q.x) * 3.0 + floor(q.y / 0.62) * 1.7;
  s.ink = max(penLine(course - 0.5) * 0.5 * step(q.y, 7.2), penLine(fract(ang) - 0.5) * 0.3 * step(q.y, 7.2));
  if (q.z > 0.6 && abs(q.x) < 0.3 && q.y < 1.3) { s.albedo = P_CHARCOAL; s.cover = 0.9; s.ink = 0.0; }
}`,
});

registerProp({
  id: 'haystack', reach: 1.0, height: 1.45, collide: 0.85, scale: [0.8, 1.2], map: [0.9, 0.72, 0.3],
  glsl: glsl`
float sdf_haystack(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  return max(sdEllipsoid(q - vec3(0.0, 0.5, 0.0), vec3(0.95, 0.92, 0.95)), -q.y);
}
void mat_haystack(vec3 q, float mat, Prop pr, inout Surf s) {
  s.albedo = mix(P_HONEY, P_WOOD, 0.5); s.cover = 0.78; s.soft = 1.0;
  float straw = vnoise(vec2(atan(q.z, q.x) * 6.0 + pr.seed * 9.0, q.y * 2.0));
  s.ink = penLine((abs(fract(atan(q.z, q.x) * 3.0 + straw * 0.6) - 0.5)) / 3.0 * 0.6) * step(0.45, straw) * 0.5;
}`,
});

registerProp({
  id: 'fence', reach: 1.28, height: 1.0, collide: 0, map: [0.7, 0.55, 0.35],
  glsl: glsl`
float sdf_fence(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float posts = min(sdCylinder(vec3(abs(q.x) - 1.1, q.y, q.z), 0.07, 1.0), sdCylinder(q, 0.07, 0.95));
  float rails = min(sdBox(q - vec3(0.0, 0.75, 0.0), vec3(1.2, 0.05, 0.03)), sdBox(q - vec3(0.0, 0.4, 0.0), vec3(1.2, 0.05, 0.03)));
  return min(posts, rails);
}
void mat_fence(vec3 q, float mat, Prop pr, inout Surf s) {
  s.albedo = P_WOOD; s.cover = 0.66;
  s.ink = step(0.6, vnoise(q.xy * vec2(3.0, 18.0) + pr.seed * 9.0)) * 0.35;
}`,
});

registerProp({
  id: 'scarecrow', reach: 0.82, height: 2.25, collide: 0.2, map: [0.7, 0.4, 0.3],
  glsl: glsl`
float sdf_scarecrow(vec3 q, Prop pr, out float mat) {
  float pole = min(sdCylinder(q, 0.05, 1.9), sdCapsule(q, vec3(-0.75, 1.35, 0.0), vec3(0.75, 1.35, 0.0), 0.045));
  float shirt = min(sdRoundBox(q - vec3(0.0, 1.12, 0.0), vec3(0.3, 0.36, 0.13), 0.08), sdCapsule(q, vec3(-0.62, 1.35, 0.0), vec3(0.62, 1.35, 0.0), 0.1));
  float head = length(q - vec3(0.0, 1.78, 0.0)) - 0.2;
  float hat = min(sdCylinder(q - vec3(0.0, 1.9, 0.0), 0.36, 0.035), sdConeUp(q - vec3(0.0, 1.9, 0.0), 0.2, 0.3));
  mat = 0.0;
  float d = pole;
  if (shirt < d) { d = shirt; mat = 1.0; }
  if (head < d) { d = head; mat = 2.0; }
  if (hat < d) { d = hat; mat = 3.0; }
  return d;
}
void mat_scarecrow(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_BARK; s.cover = 0.8; }
  else if (mat < 1.5) {
    s.albedo = pr.seed < 0.5 ? P_BRICK : P_SLATE; s.cover = 0.8;
    s.ink = penLine(max(abs(q.x - 0.1) - 0.09, abs(q.y - 1.05) - 0.09)) * 0.7;
  } else if (mat < 2.5) {
    s.albedo = P_TAN; s.cover = 0.4;
    vec2 e = vec2(abs(q.x) - 0.07, q.y - 1.8);
    s.ink = max(penLine(abs(e.x) - abs(e.y)) * step(max(abs(e.x), abs(e.y)), 0.04), penLine(q.y - 1.7) * step(abs(q.x), 0.07)) * step(0.0, q.z);
  } else { s.albedo = mix(P_WOOD, P_HONEY, 0.4); s.cover = 0.75; }
}`,
});

registerProp({
  id: 'windmill', reach: 2.35, height: 6.2, collide: 1.25, map: [0.85, 0.8, 0.7],
  glsl: glsl`
float sdf_windmill(vec3 q, Prop pr, out float mat) {
  float tower = max(sdTaper(q, vec3(0.0), vec3(0.0, 4.2, 0.0), 1.05, 0.7), q.y - 4.2);
  float cap = sdConeUp(q - vec3(0.0, 4.2, 0.0), 0.86, 0.9);
  vec3 h = q - vec3(0.0, 3.9, 0.9);
  h.xy = rot2(floor(uTime * 12.0) / 12.0 * 0.55 + pr.seed * 6.0) * h.xy;
  h.xy = abs(h.xy);
  if (h.y > h.x) h.xy = h.yx;
  float sails = min(sdBox(h - vec3(1.25, 0.15, 0.0), vec3(0.92, 0.2, 0.025)), sdBox(h - vec3(1.1, 0.0, 0.0), vec3(1.15, 0.035, 0.035)));
  sails = min(sails, sdCapsule(q, vec3(0.0, 3.9, 0.6), vec3(0.0, 3.9, 0.98), 0.09));
  mat = 0.0;
  float d = tower;
  if (cap < d) { d = cap; mat = 1.0; }
  if (sails < d) { d = sails; mat = 2.0; }
  return d * 0.85;
}
void mat_windmill(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 1.5) {
    vec3 h = q - vec3(0.0, 3.9, 0.9);
    h.xy = rot2(floor(uTime * 12.0) / 12.0 * 0.55 + pr.seed * 6.0) * h.xy;
    h.xy = abs(h.xy);
    if (h.y > h.x) h.xy = h.yx;
    s.albedo = P_CREAM; s.cover = 0.14;
    s.ink = max(penLine((abs(fract(h.x * 4.0) - 0.5)) / 4.0), penLine(h.y - 0.15)) * 0.6 * step(0.05, h.y);
    if (h.y < 0.05) { s.albedo = P_BARK; s.cover = 0.85; }
    return;
  }
  if (mat > 0.5) { s.albedo = pr.seed < 0.5 ? P_SLATE : mix(P_BRICK, P_POPPY, 0.4); s.cover = 0.82; s.ink = penLine((abs(fract(q.y * 5.0) - 0.5)) / 5.0) * 0.5; return; }
  s.albedo = P_CREAM; s.cover = 0.14;
  float a = atan(q.x, q.z);
  vec2 pv = pavers(vec2(a * 3.0, q.y * 2.6));
  float foot = smoothstep(1.4, 0.3, q.y);
  if (foot > 0.4) { s.albedo = fract(pv.y * 5.3) < 0.5 ? P_PEACH : P_CLAY; s.cover = mix(0.3, 0.65, pv.y); }
  s.ink = penLine(0.5 * pv.x / 2.6) * 0.7 * foot;
  float door = max(abs(a) * 1.0 - 0.3, q.y - 1.35);
  if (door < 0.0) { s.albedo = mix(P_BARK, P_UMBER, 0.35); s.cover = 0.82; }
  float win = max(abs(a) - 0.2, abs(q.y - 2.7) - 0.26);
  if (win < 0.0) { s.albedo = P_SLATE; s.cover = mix(0.72, 0.0, uNight); s.glow = uNight; }
  s.ink = max(s.ink, max(penLine(door * 0.9), penLine(win * 0.8)) * 0.85);
}`,
});

registerProp({
  id: 'tent', reach: 1.62, height: 1.5, collide: 1.2, map: [0.85, 0.75, 0.6],
  glsl: glsl`
float sdf_tent(vec3 q, Prop pr, out float mat) {
  float side = dot(vec2(abs(q.z), q.y) - vec2(1.05, 0.0), vec2(0.795, 0.607));
  float cloth = max(max(side, -q.y), abs(q.x) - 1.2);
  float poles = sdCylinder(vec3(abs(q.x) - 1.2, q.y, q.z), 0.04, 1.52);
  mat = poles < cloth ? 1.0 : 0.0;
  return min(cloth, poles);
}
void mat_tent(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { s.albedo = P_BARK; s.cover = 0.85; return; }
  float stripe = step(0.5, fract(q.x * 1.25 + 0.25));
  s.albedo = pr.seed < 0.4 ? P_BRICK : (pr.seed < 0.75 ? P_SLATE : P_SAGE);
  s.cover = mix(0.08, 0.8, stripe);
  s.ink = penLine((abs(fract(q.x * 2.5 + 0.5) - 0.5)) / 2.5) * 0.45;
  float side = dot(vec2(abs(q.z), q.y) - vec2(1.05, 0.0), vec2(0.795, 0.607));
  if (abs(q.x) > 1.19 && side < -0.34) { s.albedo = P_UMBER; s.cover = 0.92; s.ink = 0.0; }
  if (abs(q.x) > 1.19) s.ink = max(s.ink, penLine(side + 0.34) * 0.8);
}`,
});

registerProp({
  id: 'campfire', reach: 0.68, height: 0.95, collide: 0.5, map: [0.9, 0.5, 0.3],
  light: { color: [1.0, 0.7, 0.36], radius: 8, y: 0.6, always: true },
  glsl: glsl`
float sdf_campfire(vec3 q, Prop pr, out float mat) {
  float sec = TAU / 7.0;
  float ca = floor(atan(q.z, q.x) / sec + 0.5) * sec;
  float stones = length(q - vec3(cos(ca) * 0.5, 0.07, sin(ca) * 0.5)) - 0.13;
  float logs = min(sdCapsule(q, vec3(-0.3, 0.1, -0.12), vec3(0.3, 0.16, 0.14), 0.07), sdCapsule(q, vec3(-0.14, 0.12, 0.28), vec3(0.16, 0.16, -0.3), 0.07));
  float tk = floor(uTime * 12.0);
  float fl = 0.5 + 0.12 * sin(tk * 2.1 + pr.seed * 9.0);
  vec3 f = q - vec3(0.03 * sin(tk * 1.7), 0.2, 0.0);
  float flame = sdEllipsoid(f - vec3(0.0, fl * 0.5, 0.0), vec3(0.17, fl * 0.55, 0.17));
  mat = 0.0;
  float d = stones;
  if (logs < d) { d = logs; mat = 1.0; }
  if (flame < d) { d = flame; mat = 2.0; }
  return d * 0.9;
}
void mat_campfire(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = uRockCol; s.cover = 0.7; }
  else if (mat < 1.5) { s.albedo = P_UMBER; s.cover = 0.9; }
  else {
    float rim = smoothstep(0.03, 0.14, length(q.xz));
    s.albedo = mix(P_SUN, P_POPPY, smoothstep(0.25, 0.75, q.y));
    s.cover = mix(0.08, 0.85, rim);
    s.glow = 0.5 * (1.0 - rim);
    s.soft = 1.0;
  }
}`,
});

registerProp({
  id: 'pillar', reach: 0.62, height: 3.5, collide: 0.42, map: [0.82, 0.74, 0.66],
  glsl: glsl`
float sdf_pillar(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float h = 1.0 + 2.4 * pr.seed;
  float shaft = sdCylinder(q, 0.3 + 0.02 * cos(atan(q.z, q.x) * 10.0), h);
  shaft = max(shaft, dot(q - vec3(0.0, h - 0.15, 0.0), vec3(0.432, 0.864, 0.259)));
  float base = sdBox(q - vec3(0.0, 0.1, 0.0), vec3(0.42, 0.1, 0.42));
  return min(shaft, base) * 0.9;
}
void mat_pillar(vec3 q, float mat, Prop pr, inout Surf s) {
  s.albedo = mix(P_PEACH, P_STONE, 0.4 + 0.3 * vnoise(q.xy * 3.0 + pr.seed * 9.0));
  s.cover = 0.46;
  s.ink = max(penLine((abs(fract(atan(q.z, q.x) * 1.6) - 0.5)) / 1.6 * 0.3) * 0.5 * step(0.2, q.y),
              penLine((abs(fract(q.y * 0.9 + pr.seed) - 0.5)) / 0.9) * 0.7);
  s.moss = 0.8;
}`,
});

registerProp({
  id: 'signpost', reach: 0.78, height: 1.75, collide: 0.15, map: [0.7, 0.55, 0.35],
  glsl: glsl`
float sdf_signpost(vec3 q, Prop pr, out float mat) {
  float post = sdCylinder(q, 0.06, 1.7);
  float boards = min(sdBox(q - vec3(0.28, 1.45, 0.0), vec3(0.42, 0.13, 0.03)), sdBox(q - vec3(-0.25, 1.1, 0.0), vec3(0.38, 0.12, 0.03)));
  mat = boards < post ? 1.0 : 0.0;
  return min(post, boards);
}
void mat_signpost(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_BARK; s.cover = 0.8; return; }
  s.albedo = P_WOOD; s.cover = 0.35;
  float row = q.y > 1.3 ? q.y - 1.45 : q.y - 1.1;
  s.ink = penLine(row + 0.02 * sin(q.x * 40.0)) * step(0.3, fract(q.x * 3.1 + pr.seed)) * 0.8;
}`,
});

registerProp({
  id: 'delve', reach: 2.0, height: 3.3, collide: 1.35, map: [0.35, 0.35, 0.4],
  glsl: glsl`
float sdf_delve(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  vec3 d = q - vec3(0.0, 0.0, 0.95);
  float door = min(sdBox(vec3(d.x, d.y - 0.62, 0.0), vec3(0.62, 0.62, 1.0)), length(d.xy - vec2(0.0, 1.22)) - 0.62);
  float hole = max(door, abs(d.z) - 0.62);
  float body;
  if (pr.pal < 0.5) {
    body = sdRoundBox(q - vec3(0.0, 1.25, 0.0), vec3(1.6, 1.25, 1.0), 0.06);
    body = min(body, sdRoundBox(q - vec3(0.0, 2.62, 0.0), vec3(1.85, 0.16, 1.2), 0.05));
    body = min(body, sdRoundBox(q - vec3(0.0, 2.98, 0.0), vec3(0.5, 0.24, 0.5), 0.05));
  } else {
    body = length((q - vec3(0.0, 0.4, -0.2)) * vec3(0.55, 0.75, 0.72)) - 1.2;
    body = smin(body, length((q - vec3(1.0, 0.25, -0.5)) * vec3(0.8, 1.0, 0.9)) - 0.95, 0.45);
    body = smin(body, length((q - vec3(-1.05, 0.2, -0.3)) * vec3(0.85, 1.0, 0.9)) - 0.9, 0.45);
    body += 0.06 * sin(q.x * 5.1 + pr.seed * 7.0) * sin(q.y * 4.3) * sin(q.z * 4.7);
  }
  float d0 = max(body, -hole);
  if (door < 0.02 && q.z < 0.45) mat = 1.0;
  return d0 * 0.85;
}
void mat_delve(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat > 0.5) { s.albedo = P_CHARCOAL; s.cover = 1.0; s.solid = 1.0; s.ink = 0.0; return; }
  if (pr.pal < 0.5) {
    s.albedo = mix(P_STONE, P_CLAY, 0.2 + 0.25 * vnoise(q.xy * 2.0 + pr.seed * 5.0));
    s.cover = 0.55;
    float course = abs(fract(q.y * 1.6) - 0.5) / 1.6;
    float joint = abs(fract(q.x * 0.9 + step(0.5, fract(q.y * 0.8)) * 0.5) - 0.5) / 0.9;
    s.ink = max(penLine(course) * 0.6, penLine(joint) * 0.45 * step(q.y, 2.45));
    s.moss = 0.7;
  } else {
    s.albedo = mix(uRockCol, P_STONE, 0.35);
    s.cover = 0.62;
    s.ink = penLine(abs(fract(vnoise(q.xz * 1.3 + pr.seed) * 3.0) - 0.5) * 0.3) * 0.4;
    s.moss = 0.5;
  }
}`,
});

registerProp({
  id: 'torch', reach: 0.4, height: 2.35, collide: 0.15, map: [1.0, 0.7, 0.4],
  light: { color: [1.0, 0.7, 0.36], radius: 8, y: 2.05, always: true },
  glsl: glsl`
float sdf_torch(vec3 q, Prop pr, out float mat) {
  float post = sdCylinder(q, 0.055, 1.78);
  float cup = sdCylinder(q - vec3(0.0, 1.72, 0.0), 0.16, 0.16) - 0.01;
  float flame = length((q - vec3(0.0, 2.08 + 0.03 * sin(uTime * 9.0 + pr.seed * 20.0), 0.0)) * vec3(1.0, 0.6, 1.0)) - 0.14;
  float iron = min(post, cup);
  mat = flame < iron ? 1.0 : 0.0;
  return min(iron, flame);
}
void mat_torch(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { s.albedo = q.y > 1.68 ? P_CHARCOAL : P_BARK; s.cover = 0.85; return; }
  s.albedo = P_APRICOT; s.cover = 0.08; s.glow = 1.0;
}`,
});

registerProp({
  id: 'greattree', seeThrough: true, reach: 6.6, height: 14, collide: 0.7, map: [0.25, 0.5, 0.22],
  glsl: glsl`
uniform vec4 uGTB;
uniform vec4 uGTLa[24];
uniform vec4 uGTLb[24];
uniform vec4 uGTF[16];
uniform int uGTNL;
uniform int uGTNF;
uniform vec4 uGTLeaf;
float sdf_greattree(vec3 q, Prop pr, out float mat) {
  mat = 0.0;
  float r = length(q.xz);
  float bound = max(r - uGTB.x, max(q.y - uGTB.y, -q.y - 0.8));
  if (bound > 0.8) return bound;
  q.xz += 0.03 * sin(uTime * 1.1 + q.y * 0.4) * max(q.y - uGTB.z * 0.6, 0.0) * vec2(0.8, 0.5);
  float wood = sdTaper(q, vec3(0.0, -0.3, 0.0), vec3(0.0, uGTB.z, 0.0), uGTB.w, uGTB.w * 0.5);
  wood = smin(wood, sdTaper(q, vec3(0.0, -0.4, 0.0), vec3(0.0, uGTB.z * 0.22, 0.0), uGTB.w * 1.75, uGTB.w * 0.95), 0.35);
  for (int i = 0; i < 24; i++) {
    if (i >= uGTNL) break;
    wood = smin(wood, sdTaper(q, uGTLa[i].xyz, uGTLb[i].xyz, uGTLa[i].w, uGTLb[i].w), 0.14);
  }
  float can = 1e3;
  for (int i = 0; i < 16; i++) {
    if (i >= uGTNF) break;
    can = smin(can, length(q - uGTF[i].xyz) - uGTF[i].w, 0.6);
  }
  can += 0.1 * sin(q.x * 2.9 + 1.3) * sin(q.y * 3.2) * sin(q.z * 3.1 + 0.7);
  can += 0.04 * sin(q.x * 7.3 + 2.0) * sin(q.y * 6.9) * sin(q.z * 7.7);
  mat = wood < can ? 0.0 : 1.0;
  return min(wood, can) * 0.72;
}
void mat_greattree(vec3 q, float mat, Prop pr, inout Surf s) {
  if (mat < 0.5) { barkSurf(q, pr, s); return; }
  leafSurf(q, pr, s, uGTB.z * 0.55, uGTB.y);
  float clump = vnoise3(q * 1.9 + 3.0);
  s.albedo = mix(uGTLeaf.rgb, mix(uGTLeaf.rgb, P_BUTTER, 0.4), smoothstep(0.56, 0.68, clump) * 0.55);
  vec2 v = voronoi(q.xy * 1.5 + q.z * 1.2 + 7.0);
  float fruit = smoothstep(0.13, 0.08, v.x) * step(1.0 - uGTLeaf.a, v.y);
  s.albedo = mix(s.albedo, P_POPPY, fruit);
  s.cover = mix(s.cover, 0.95, fruit);
}`,
});
