import { registerArchetype } from '../passes/entities.js';
import { glsl } from '../shaderlib.js';

const EYES = glsl`
void paintEyes(inout Surf s, vec3 f, float spread, vec2 size, float seed) {
  float blink = step(0.96, fract(uTime * 0.21 + seed));
  float side = f.x < 0.0 ? -1.0 : 1.0;
  vec2 sz = size * (1.0 + 0.07 * side);
  vec2 e = vec2(f.x - side * spread, f.y);
  float eye = smoothstep(1.0, 0.85, length(e / vec2(sz.x, mix(sz.y, sz.y * 0.12, blink))));
  float glint = smoothstep(sz.x * 0.42, sz.x * 0.26, length(e - vec2(-sz.x * 0.33, sz.y * 0.36))) * (1.0 - blink);
  if (eye > 0.3) { s.albedo = INK_BLACK; s.cover = 1.0 - glint; s.solid = 1.0; s.ink = 0.0; }
}
`;

registerArchetype({
  id: 'sproutling', boundY: 0.42, boundR: 0.82, steps: 44,
  glsl: EYES + glsl`
float sHop, sSq, sLunge, sAir;
void entPose() {
  float mv = ePose.w, at = ePose.z;
  float ht = fract(ePose.x / TAU);
  sAir = sin(ht * PI) * mv;
  sHop = sAir * 0.24;
  sSq = 1.0 - 0.15 * cos(ht * TAU) * mv + 0.03 * sin(uTime * 2.4 + eLook.x * 6.0);
  sLunge = 0.0;
  if (ePose.y > 0.5 && ePose.y < 1.5) { sLunge = sin(saturate(at) * PI) * 0.34; sSq += 0.2 * sin(saturate(at) * PI); }
  if (ePose.y > 2.5) sSq -= 0.25 * (1.0 - at);
}
float entMap(vec3 p, out float mat) {
  p.z -= sLunge; p.y -= sHop;
  vec3 r = vec3(0.33 * (1.0 + (1.0 - sSq) * 0.55), 0.3 * sSq, 0.33 * (1.0 + (1.0 - sSq) * 0.55));
  vec3 b = p - vec3(0.0, r.y + 0.03, 0.0);
  float d = sdEllipsoid(b, r);
  mat = 0.0;
  float feet = min(length(p - vec3(-0.14, 0.05 - sAir * 0.03, 0.06)), length(p - vec3(0.14, 0.05 - sAir * 0.03, 0.06))) - 0.085;
  if (feet < d) { d = feet; mat = 2.0; }
  vec3 top = vec3(0.0, r.y * 2.0 + 0.02, 0.0);
  float stem = sdCapsule(p, top, top + vec3(0.0, 0.15, 0.0), 0.028);
  vec3 l = p - top - vec3(0.0, 0.15, 0.0);
  l.x = abs(l.x);
  l.xy = rot2(0.55 - sAir * 0.5 + 0.08 * sin(uTime * 3.0 + eLook.x * 5.0)) * l.xy;
  vec3 lr = vec3(0.17, 0.035, 0.095);
  float leaf = sdEllipsoid(l - vec3(0.15, 0.0, 0.0), lr);
  leaf = min(leaf, stem);
  if (leaf < d) { d = leaf; mat = 1.0; }
  return d * 0.9;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  p.z -= sLunge; p.y -= sHop;
  if (mat > 1.5) { s.albedo = eColC; s.cover = 0.88; return; }
  if (mat > 0.5) {
    s.albedo = eColB; s.cover = 0.84; s.wrap = 0.4;
    s.ink = penLine(p.z) * 0.7;
    return;
  }
  vec3 f = p - vec3(0.0, 0.33 * sSq + 0.03, 0.0);
  float belly = smoothstep(0.02, -0.16, f.y) * step(0.0, f.z);
  s.albedo = eColA; s.cover = mix(0.82, 0.12, belly); s.wrap = 0.35;
  if (f.z > 0.0) {
    paintEyes(s, f - vec3(0.0, 0.05, 0.0), 0.115, vec2(0.042, 0.06), eLook.x);
    if (s.solid < 0.5) {
      float lid = penLine(f.y - 0.115) * step(abs(abs(f.x) - 0.115), 0.06);
      float mouth = penLine(f.y + 0.03) * step(abs(f.x), 0.03);
      s.ink = max(lid, mouth);
    }
  }
}
`,
});

registerArchetype({
  id: 'puffcap', boundY: 0.48, boundR: 0.85, steps: 44,
  glsl: EYES + glsl`
float pTilt, pLean, pBob;
vec3 puffLocal(vec3 p) {
  p.y -= pBob;
  p.xy = rot2(pTilt) * p.xy;
  p.zy = rot2(pLean) * p.zy;
  return p;
}
void entPose() {
  float mv = ePose.w;
  pTilt = sin(ePose.x) * 0.13 * mv;
  pBob = abs(cos(ePose.x)) * 0.04 * mv + 0.012 * sin(uTime * 2.0 + eLook.x * 6.0);
  pLean = 0.0;
  if (ePose.y > 0.5 && ePose.y < 1.5) pLean = sin(saturate(ePose.z) * PI) * 0.75;
  if (ePose.y > 2.5) pLean = -0.35 * (1.0 - ePose.z);
}
float entMap(vec3 p, out float mat) {
  float s = sin(ePose.x) * ePose.w;
  float up = cos(ePose.x) * ePose.w;
  float feet = min(length(p - vec3(-0.12, 0.06 + max(up, 0.0) * 0.09, 0.04 + s * 0.12)),
                   length(p - vec3(0.12, 0.06 + max(-up, 0.0) * 0.09, 0.04 - s * 0.12))) - 0.085;
  vec3 q = puffLocal(p);
  float body = sdTaper(q, vec3(0.0, 0.14, 0.0), vec3(0.0, 0.42, 0.0), 0.2, 0.165);
  vec3 c = q - vec3(0.0, 0.5, 0.0);
  float cap = max(length(c * vec3(1.0, 1.4, 1.0)) - 0.46, -c.y - 0.03) * 0.68;
  cap = smin(cap, sdTorusY(c, 0.43, 0.05), 0.05);
  float arms = min(sdCapsule(q, vec3(-0.19, 0.33, 0.02), vec3(-0.3, 0.24 + 0.05 * s, 0.08), 0.04),
                   sdCapsule(q, vec3(0.19, 0.33, 0.02), vec3(0.3, 0.24 - 0.05 * s, 0.08), 0.04));
  float d = min(body, arms);
  mat = 0.0;
  if (cap < d) { d = cap; mat = 1.0; }
  if (feet < d) { d = feet; mat = 2.0; }
  return d;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  if (mat > 1.5) { s.albedo = P_TAN; s.cover = 0.7; return; }
  vec3 q = puffLocal(p);
  if (mat > 0.5) {
    vec3 c = q - vec3(0.0, 0.5, 0.0);
    float under = step(c.y, 0.005);
    float rim = step(c.y, 0.07) * step(0.36, length(c.xz)) * (1.0 - under);
    vec2 v = voronoi(c.xz * 4.2 + eLook.x * 20.0);
    float spot = smoothstep(0.24, 0.18, v.x) * (1.0 - under) * (1.0 - rim);
    s.albedo = mix(eColA, eColB, rim);
    s.cover = mix(0.86, 0.0, spot);
    s.ink = penLine((v.x - 0.21) / 4.2) * (1.0 - under) * (1.0 - rim) * 0.6;
    if (under > 0.5) {
      s.albedo = P_TAN; s.cover = 0.4;
      s.ink = smoothstep(0.2, 0.0, abs(fract(atan(c.z, c.x) * 3.5) - 0.5)) * 0.5;
    }
    return;
  }
  s.albedo = eColC; s.cover = 0.22; s.wrap = 0.3;
  vec3 f = q - vec3(0.0, 0.31, 0.0);
  if (f.z > 0.0) {
    paintEyes(s, f, 0.085, vec2(0.034, 0.05), eLook.x);
    if (s.solid < 0.5) {
      float brow = penLine(f.y - 0.075 - 0.3 * (abs(f.x) - 0.085)) * step(abs(abs(f.x) - 0.085), 0.055);
      float mouth = penLine(f.y + 0.085 + f.x * f.x * 3.0) * step(abs(f.x), 0.04);
      s.ink = max(brow, mouth);
    }
  }
}
`,
});

registerArchetype({
  id: 'bristlehog', boundY: 0.4, boundR: 0.95, steps: 48,
  glsl: glsl`
float bBob, bCharge, bNod;
void entPose() {
  float mv = ePose.w;
  bBob = abs(cos(ePose.x)) * 0.06 * mv + 0.01 * sin(uTime * 2.2 + eLook.x * 6.0);
  bCharge = 0.0; bNod = 0.06 * sin(uTime * 1.3 + eLook.x * 9.0) * (1.0 - mv) + 0.09 * sin(ePose.x * 2.0) * mv;
  if (ePose.y > 0.5 && ePose.y < 1.5) { float k = sin(saturate(ePose.z) * PI); bCharge = k * 0.3; bNod = -k * 0.25; }
  if (ePose.y > 2.5) bCharge = -0.1 * (1.0 - ePose.z);
}
float entMap(vec3 p, out float mat) {
  float s = sin(ePose.x) * ePose.w;
  vec3 lp = p; lp.z -= bCharge * 0.4;
  float sx = sign(lp.x), sz = sign(lp.z);
  float ph = s * sx * sz;
  vec3 hipJ = vec3(0.15 * sx, 0.26 + bBob, 0.2 * sz);
  float lifted = max(cos(ePose.x) * sx * sz, 0.0) * ePose.w;
  vec3 foot = vec3(0.16 * sx, 0.05 + lifted * 0.13, 0.21 * sz + ph * 0.2);
  float legs = sdTaper(lp, hipJ, foot, 0.07, 0.055);
  p.z -= bCharge; p.y -= bBob;
  vec3 br = vec3(0.25, 0.225, 0.37);
  float body = sdEllipsoid(p - vec3(0.0, 0.38, -0.03), br);
  vec3 h = p - vec3(0.0, 0.36, 0.34);
  h.zy = rot2(bNod) * h.zy;
  float head = length(h) - 0.2;
  head = smin(head, sdTaper(h, vec3(0.0, -0.03, 0.1), vec3(0.0, -0.06, 0.3), 0.12, 0.085), 0.08);
  float ears = length(vec3(abs(h.x) - 0.14, h.y - 0.17, h.z + 0.02)) - 0.06;
  float d = smin(body, head, 0.08);
  d = min(d, ears);
  mat = 0.0;
  if (legs < d) { d = legs; mat = 0.0; }
  float tusk = sdTaper(vec3(abs(h.x), h.y, h.z), vec3(0.09, -0.1, 0.22), vec3(0.14, 0.0, 0.3), 0.03, 0.01);
  if (tusk < d) { d = tusk; mat = 2.0; }
  vec3 q = p - vec3(0.0, 0.57, -0.03);
  if (abs(q.z) < 0.34) {
    float qz = mod(q.z + 0.055, 0.11) - 0.055;
    float lift = 0.03 * (1.0 - abs(q.z) / 0.34) - q.z * q.z * 0.5;
    vec3 sp = vec3(q.x, q.y - lift + 0.03, qz);
    sp.zy = rot2(-0.5) * sp.zy;
    float spike = sdConeUp(sp, 0.05, 0.17) * 0.8;
    if (spike < d) { d = spike; mat = 1.0; }
  }
  float tail = sdCapsule(p, vec3(0.0, 0.42, -0.38), vec3(0.0, 0.52 + 0.03 * sin(uTime * 6.0), -0.47), 0.025);
  if (tail < d) { d = tail; mat = 1.0; }
  return d * 0.9;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  if (mat > 0.5) { s.albedo = eColB; s.cover = 0.9; return; }
  p.z -= bCharge; p.y -= bBob;
  float belly = smoothstep(0.34, 0.2, p.y);
  float stripe = smoothstep(0.1, 0.04, abs(p.x)) * smoothstep(0.4, 0.5, p.y);
  s.albedo = eColA;
  s.cover = mix(mix(0.82, 0.98, stripe), 0.12, belly);
  s.ink = step(0.72, vnoise(p.xz * 26.0 + p.y * 17.0)) * (1.0 - belly) * 0.5;
  s.wrap = 0.25;
  vec3 h = p - vec3(0.0, 0.36, 0.34);
  h.zy = rot2(bNod) * h.zy;
  if (h.z > 0.02) {
    float snout = smoothstep(0.1, 0.085, length(vec2(h.x, h.y + 0.06))) * step(0.26, h.z);
    if (snout > 0.5) { s.albedo = eColC; s.cover = 0.6; s.ink = 0.0; }
    float nostril = smoothstep(0.02, 0.012, length(vec2(abs(h.x) - 0.035, h.y + 0.055))) * step(0.3, h.z);
    vec2 e = vec2(abs(h.x) - 0.105, h.y - 0.055);
    float eye = smoothstep(0.034, 0.026, length(e));
    float glint = smoothstep(0.014, 0.008, length(vec2(h.x - sign(h.x) * 0.105 + 0.01, e.y - 0.012)));
    if (max(eye, nostril) > 0.5) { s.albedo = INK_BLACK; s.cover = 1.0 - glint * eye; s.solid = 1.0; s.ink = 0.0; }
    else s.ink = max(s.ink, penLine(e.y - 0.045 + e.x * 0.5) * step(abs(e.x), 0.055));
  }
}
`,
});

registerArchetype({
  id: 'wisp', boundY: 0.85, boundR: 0.75, steps: 40,
  glsl: EYES + glsl`
vec3 wCore; float wFlap, wPuff;
void entPose() {
  float t = uTime * 2.0 + eLook.x * 6.28;
  wCore = vec3(0.04 * sin(t * 0.7), 0.88 + 0.1 * sin(t), 0.0);
  wFlap = sin(t * 2.4) * 0.35;
  wPuff = 1.0;
  if (ePose.y > 0.5 && ePose.y < 1.5) { float k = sin(saturate(ePose.z) * PI); wCore.z += k * 0.3; wPuff += k * 0.3; }
  if (ePose.y > 2.5) wPuff -= 0.25 * (1.0 - ePose.z);
}
float entMap(vec3 p, out float mat) {
  vec3 c = p - wCore;
  float d = length(c) - 0.22 * wPuff;
  float t = uTime * 3.0 + eLook.x * 6.28;
  vec3 a = vec3(0.0);
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    vec3 b = vec3(0.07 * sin(t - fi * 0.9), -0.15 * fi, -0.06 * fi - 0.08 * ePose.w * fi);
    d = smin(d, length(c - b) - (0.17 - 0.036 * fi) * wPuff, 0.12);
  }
  mat = 0.0;
  vec3 f = c; f.x = abs(f.x);
  f.xy = rot2(-0.3 + wFlap) * (f.xy - vec2(0.18, 0.0));
  vec3 fr = vec3(0.17, 0.035, 0.085);
  float fin = sdEllipsoid(f - vec3(0.14, 0.0, 0.0), fr);
  if (fin < d) { d = fin; mat = 1.0; }
  float halo = sdTorusY(c - vec3(0.0, 0.34 + 0.02 * sin(t), 0.0), 0.15, 0.018);
  if (halo < d) { d = halo; mat = 2.0; }
  return d * 0.85;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  vec3 c = p - wCore;
  if (mat > 1.5) { s.albedo = eColC; s.cover = 0.9; return; }
  if (mat > 0.5) { s.albedo = eColB; s.cover = 0.72; s.wrap = 0.6; s.ink = penLine(c.z) * 0.5; return; }
  float fall = smoothstep(-0.6, 0.15, c.y);
  s.albedo = mix(eColB, eColA, fall);
  s.cover = mix(0.7, 0.06, fall);
  s.glow = fall * 0.6;
  s.wrap = 0.8;
  if (c.z > 0.0 && length(c) < 0.3) paintEyes(s, c - vec3(0.0, 0.02, 0.0), 0.085, vec2(0.032, 0.055), eLook.x);
}
`,
});

registerArchetype({
  id: 'cragling', boundY: 0.65, boundR: 1.05, steps: 52,
  glsl: glsl`
const vec3 CRAG_N[5] = vec3[5](vec3(0.83, 0.52, 0.21), vec3(-0.61, 0.61, 0.51), vec3(0.1, 0.7, -0.71),
                              vec3(-0.5, 0.31, -0.81), vec3(0.3, -0.9, 0.31));
float lump(vec3 c, float r, float seed) {
  float d = length(c) - r;
  for (int i = 0; i < 5; i++) d = max(d, dot(c, CRAG_N[i]) - r * (0.66 + 0.22 * fract(seed * (5.0 + float(i) * 2.7))));
  return d - 0.03;
}
vec3 cFistL, cFistR; float cBob, cStomp;
void entPose() {
  float s = sin(ePose.x) * ePose.w;
  cBob = abs(cos(ePose.x)) * 0.05 * ePose.w + 0.012 * sin(uTime * 1.6 + eLook.x * 6.0);
  cStomp = s;
  cFistL = vec3(-0.5, 0.4 + cBob, 0.08 - s * 0.2);
  cFistR = vec3(0.5, 0.4 + cBob, 0.08 + s * 0.2);
  if (ePose.y > 0.5 && ePose.y < 1.5) {
    float up = smoothstep(0.0, 0.4, ePose.z), down = smoothstep(0.4, 0.58, ePose.z), rec = smoothstep(0.7, 1.0, ePose.z);
    vec3 hi = vec3(0.3, 1.25, 0.1), lo = vec3(0.26, 0.2, 0.62);
    vec3 tgt = mix(mix(cFistR, hi, up), lo, down);
    tgt = mix(tgt, cFistR, rec);
    cFistR = tgt; cFistL = tgt * vec3(-1.0, 1.0, 1.0);
  }
  if (ePose.y > 2.5) cBob -= 0.06 * (1.0 - ePose.z);
}
float entMap(vec3 p, out float mat) {
  mat = 0.0;
  float d = lump(p - vec3(0.0, 0.55 + cBob, 0.0), 0.44, eLook.x);
  d = min(d, lump(p - vec3(0.0, 1.02 + cBob, 0.06), 0.25, eLook.x + 0.31));
  vec3 fl = p - cFistL; fl.xz = fl.zx;
  d = min(d, lump(fl, 0.21, eLook.x + 0.53));
  d = min(d, lump(p - cFistR, 0.21, eLook.x + 0.71));
  vec3 lg = vec3(abs(p.x) - 0.17, p.y - 0.12 - max(cStomp * sign(p.x), 0.0) * 0.08, p.z - cStomp * sign(p.x) * 0.1);
  d = min(d, sdRoundBox(lg, vec3(0.11, 0.12, 0.13), 0.04));
  return d * 0.92;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  vec2 pv = pavers(p.xy * 3.4 + p.z * 2.3 + eLook.x * 20.0);
  s.albedo = eColA;
  s.cover = mix(0.5, 0.82, pv.y);
  s.ink = penLine(0.5 * pv.x / 3.4) * 0.8;
  float fist = step(min(length(p - cFistL), length(p - cFistR)), 0.3);
  if (fist > 0.5) { s.albedo = eColB; s.cover = mix(0.7, 0.92, pv.y); }
  float moss = smoothstep(0.75, 0.85, p.y - cBob) * step(p.y - cBob, 0.92) * step(0.45, vnoise(p.xz * 9.0));
  if (moss > 0.5 && fist < 0.5) { s.albedo = P_SAGE; s.cover = 0.8; s.ink *= 0.4; }
  vec3 f = p - vec3(0.0, 1.03 + cBob, 0.06);
  if (f.z > 0.1) {
    vec2 e = vec2(abs(f.x) - 0.09, f.y - 0.02);
    float socket = smoothstep(0.055, 0.045, length(e * vec2(1.0, 1.4)));
    float pupil = smoothstep(0.024, 0.016, length(e));
    if (socket > 0.5) { s.albedo = eColB; s.cover = 0.9; s.ink = 0.0; }
    if (pupil > 0.5) { s.albedo = INK_BLACK; s.cover = 1.0; s.solid = 1.0; }
  }
}
`,
});

registerArchetype({
  id: 'shellsnap', boundY: 0.25, boundR: 0.85, steps: 48,
  glsl: glsl`
float cSway, cSnap, cBob;
void entPose() {
  cSway = sin(ePose.x * 2.0) * 0.03 * ePose.w;
  cBob = 0.012 * sin(uTime * 2.6 + eLook.x * 6.0) + abs(sin(ePose.x * 2.0)) * 0.02 * ePose.w;
  cSnap = 0.0;
  if (ePose.y > 0.5 && ePose.y < 1.5) cSnap = sin(saturate(ePose.z) * PI);
  if (ePose.y > 2.5) cBob -= 0.05 * (1.0 - ePose.z);
}
float entMap(vec3 p, out float mat) {
  vec3 q = p - vec3(cSway, cBob, 0.0);
  vec3 sr = vec3(0.37, 0.17, 0.29);
  float shell = sdEllipsoid(q - vec3(0.0, 0.24, 0.0), sr);
  shell = max(shell, 0.17 - q.y) ;
  float under = sdEllipsoid(q - vec3(0.0, 0.2, 0.0), vec3(0.33, 0.1, 0.25));
  float d = min(shell, under);
  mat = shell < under ? 0.0 : 2.0;
  vec3 a = vec3(abs(q.x), q.y, q.z);
  float sgn = sign(q.x);
  float legs = 1e3;
  for (int i = 0; i < 3; i++) {
    float z = -0.16 + 0.14 * float(i);
    float ph = sin(ePose.x * 2.0 + float(i) * 2.1 + sgn * 1.2) * ePose.w;
    vec3 knee = vec3(0.44, 0.24 + max(ph, 0.0) * 0.06, z * 1.3);
    vec3 tip = vec3(0.56, 0.0 + max(ph, 0.0) * 0.07 - cBob, z * 1.6 + ph * 0.05);
    legs = min(legs, min(sdCapsule(a, vec3(0.28, 0.2, z), knee, 0.035), sdTaper(a, knee, tip, 0.032, 0.015)));
  }
  if (legs < d) { d = legs; mat = 2.0; }
  vec3 cl = vec3(0.38 - 0.1 * cSnap, 0.24 + 0.14 * cSnap, 0.3 + 0.22 * cSnap);
  float arm = sdCapsule(a, vec3(0.26, 0.2, 0.18), cl, 0.045);
  vec3 cq = a - cl;
  float claw = length(cq * vec3(1.0, 1.15, 0.85)) - 0.13;
  claw = max(claw, -sdBox(cq - vec3(0.0, 0.0, 0.12), vec3(0.2, 0.02 + 0.03 * (1.0 - cSnap), 0.1)));
  claw = min(claw, arm);
  if (claw < d) { d = claw; mat = 1.0; }
  float stalk = sdCapsule(a, vec3(0.09, 0.3, 0.22), vec3(0.1, 0.46, 0.26), 0.022);
  float eye = length(a - vec3(0.1, 0.48, 0.26)) - 0.055;
  if (stalk < d) { d = stalk; mat = 2.0; }
  if (eye < d) { d = eye; mat = 3.0; }
  return d * 0.85;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  vec3 q = p - vec3(cSway, cBob, 0.0);
  if (mat > 2.5) {
    s.albedo = P_CREAM; s.cover = 0.06;
    vec3 e = vec3(abs(q.x), q.y, q.z) - vec3(0.1, 0.48, 0.26);
    if (length(e.xy - vec2(0.0, 0.005)) < 0.03 && e.z > 0.0) { s.albedo = INK_BLACK; s.cover = 1.0; s.solid = 1.0; }
    return;
  }
  if (mat > 1.5) { s.albedo = eColC; s.cover = mix(0.7, 0.15, step(q.y, 0.2) * step(length(q.xz), 0.3)); return; }
  if (mat > 0.5) { s.albedo = eColB; s.cover = 0.88; return; }
  float r = length(q.xz / vec2(0.37, 0.29));
  vec2 v = voronoi(q.xz * 9.0 + eLook.x * 20.0);
  float freckle = smoothstep(0.16, 0.1, v.x) * step(0.5, v.y);
  s.albedo = eColA;
  s.cover = mix(mix(0.78, 0.92, smoothstep(0.5, 1.0, r)), 0.0, freckle);
  s.ink = penLine((abs(fract(r * 2.5) - 0.5)) / 2.5 * 0.3) * 0.6;
}
`,
});

registerArchetype({
  id: 'drop', boundY: 0.32, boundR: 0.42, steps: 36,
  glsl: glsl`
float dBob; mat2 dSpin;
void entPose() {
  dBob = 0.2 + 0.05 * sin(uTime * 2.6 + eLook.x * 6.28) + ePose.w;
  dSpin = rot2(uTime * 1.8 + eLook.x * 6.28);
}
float entMap(vec3 p, out float mat) {
  vec3 q = p - vec3(0.0, dBob, 0.0);
  q.xz = dSpin * q.xz;
  mat = 0.0;
  if (eExtra < 0.5) {
    float c1 = max(length(q.xy) - 0.14, abs(q.z) - 0.025);
    float c2 = max(length(q.xy - vec2(0.12, -0.06)) - 0.11, abs(q.z + 0.07) - 0.022);
    return min(c1, c2) - 0.008;
  }
  if (eExtra < 1.5) {
    float sack = length(q * vec3(1.0, 1.15, 1.0) + vec3(0.0, 0.02, 0.0)) - 0.15;
    float neck = sdCapsule(q, vec3(0.0, 0.1, 0.0), vec3(0.0, 0.19, 0.0), 0.05);
    float tie = sdTorusY(q - vec3(0.0, 0.13, 0.0), 0.055, 0.016);
    float d = smin(sack, neck, 0.05);
    if (tie < d) { d = tie; mat = 1.0; }
    return d;
  }
  if (eExtra < 2.5) {
    float flask = length(q + vec3(0.0, 0.03, 0.0)) - 0.13;
    float neck = sdCylinder(q - vec3(0.0, 0.06, 0.0), 0.045, 0.1);
    float cork = sdCylinder(q - vec3(0.0, 0.16, 0.0), 0.05, 0.04);
    float d = smin(flask, neck, 0.03);
    if (cork < d) { d = cork; mat = 1.0; }
    return d;
  }
  if (eExtra > 3.5) {
    if (eExtra < 4.5) {
      float blade = sdBox(q - vec3(0.0, 0.08, 0.0), vec3(0.034, 0.19, 0.011)) - 0.006;
      blade = max(blade, q.y - 0.27 + abs(q.x) * 1.4);
      float guard = sdBox(q - vec3(0.0, -0.12, 0.0), vec3(0.1, 0.018, 0.025));
      float grip = sdCapsule(q, vec3(0.0, -0.14, 0.0), vec3(0.0, -0.24, 0.0), 0.022);
      float pommel = length(q - vec3(0.0, -0.26, 0.0)) - 0.032;
      float hilt = min(min(guard, grip), pommel);
      if (hilt < blade) mat = 1.0;
      return min(blade, hilt);
    }
    if (eExtra < 5.5) {
      float shaft = sdCapsule(q, vec3(-0.06, -0.26, 0.0), vec3(0.05, 0.22, 0.0), 0.024);
      float head = length(q - vec3(0.06, 0.26, 0.0)) - 0.06;
      if (head < shaft) mat = 1.0;
      return min(shaft, head);
    }
    if (eExtra < 6.5) {
      float body = sdRoundBox(q - vec3(0.0, -0.01, 0.0), vec3(0.11, 0.15, 0.04), 0.03);
      float arms = min(sdCapsule(q, vec3(-0.1, 0.1, 0.0), vec3(-0.19, -0.03, 0.0), 0.04), sdCapsule(q, vec3(0.1, 0.1, 0.0), vec3(0.19, -0.03, 0.0), 0.04));
      float collar = sdTorusY(q - vec3(0.0, 0.14, 0.0), 0.05, 0.018);
      if (collar < min(body, arms)) mat = 1.0;
      return min(min(body, arms), collar);
    }
    if (eExtra < 7.5) {
      float band = length(vec2(length(q.xy) - 0.1, q.z)) - 0.022;
      float stone = length(q - vec3(0.0, 0.12, 0.0)) - 0.045;
      if (stone < band) mat = 1.0;
      return min(band, stone);
    }
    float disc = max(length(q.xy) - 0.17, abs(q.z) - 0.025) - 0.01;
    float boss = length(q - vec3(0.0, 0.0, 0.03)) - 0.045;
    if (boss < disc) mat = 1.0;
    return min(disc, boss);
  }
  float hx = max(abs(q.x) * 0.866 + abs(q.z) * 0.5, abs(q.z));
  return max(hx - 0.12 + abs(q.y) * 0.7, abs(q.y) - 0.17) * 0.8;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  vec3 q = p - vec3(0.0, dBob, 0.0);
  q.xz = dSpin * q.xz;
  if (eExtra < 0.5) {
    s.albedo = P_SUN; s.cover = 0.85;
    s.ink = penLine(length(q.xy) - 0.095) * 0.6;
  } else if (eExtra < 1.5) {
    s.albedo = mat > 0.5 ? P_BRICK : P_TAN; s.cover = mat > 0.5 ? 0.9 : 0.7;
  } else if (eExtra < 2.5) {
    s.albedo = mat > 0.5 ? P_BARK : eColA;
    s.cover = mat > 0.5 ? 0.85 : mix(0.06, 0.88, step(q.y, 0.0));
    s.ink = mat > 0.5 ? 0.0 : penLine(q.y) * 0.7;
  } else if (eExtra > 3.5) {
    s.albedo = mat > 0.5 ? P_BARK : eColA;
    s.cover = mat > 0.5 ? 0.85 : 0.7;
    if (eExtra < 4.5 && mat < 0.5) { s.albedo = mix(P_SLATE, eColA, 0.6); s.cover = 0.35; }
    if (eExtra > 6.5 && eExtra < 7.5 && mat > 0.5) { s.albedo = eColA; s.cover = 0.9; s.glow = 0.3; }
  } else {
    s.albedo = eColA; s.cover = mix(0.85, 0.15, step(0.0, q.x * 0.6 + q.y));
    s.glow = 0.25;
  }
}
`,
});
