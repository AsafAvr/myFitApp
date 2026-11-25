import { registerArchetype } from '../passes/entities.js';
import { glsl } from '../shaderlib.js';

registerArchetype({
  id: 'humanoid', boundY: 0.8, boundR: 1.08, steps: 60,
  glsl: glsl`
vec3 hHip, hChest, hHead, hHandL, hHandR, hFootL, hFootR, hBlade;
float hDraw;
float gearBit(float b) { return mod(floor(eSpare / b + 0.01), 2.0); }
float faceOf() { return floor(eSpare / 8.0 + 0.01); }
bool robed() { return eExtra > 1.5 && eExtra < 2.5; }
float hemY() { return robed() ? hHip.y - 0.3 : hHip.y - 0.11; }
vec3 kneeOf(float side) { return hHip + vec3(0.09 * side, -0.04, 0.0); }

float sdFrustum(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float sdBoot(vec3 p, vec3 foot, vec3 knee, float tall) {
  vec3 up = normalize(knee - foot);
  float shaft = sdTaper(p, foot + vec3(0.0, -0.02, 0.0), foot + up * tall, 0.066, 0.07);
  float toe = max(sdEllipsoid(p - foot - vec3(0.0, -0.018, 0.055), vec3(0.074, 0.052, 0.118)), foot.y - 0.068 - p.y);
  float cuff = sdTaper(p, foot + up * (tall - 0.012), foot + up * (tall + 0.03), 0.08, 0.084);
  return min(smin(shaft, toe, 0.05), cuff);
}

void entPose() {
  float w = ePose.x, act = ePose.y, at = ePose.z, mv = ePose.w;
  float s = sin(w), c = cos(w);
  hDraw = 0.0;
  float idle = sin(uTime * 2.0 + eLook.x * 6.28);
  float run = smoothstep(0.8, 1.0, mv);
  float apart = s * s;
  float bob = mix(abs(c) * 0.05, apart * 0.15 - 0.04, run) * mv + 0.01 * idle * (1.0 - mv);
  float lean = mv * mix(0.05, 0.14, run);
  hHip = vec3(0.0, 0.47 + bob, 0.0);
  hChest = hHip + vec3(0.0, 0.27 - 0.015 * run, lean);
  hHead = hChest + vec3(0.0, 0.43 - 0.01 * run, lean * 0.6 - 0.02 * run * apart);
  float reach = 0.4 * mv;
  float lift = mix(0.1, 0.25, run) * min(1.0, mv * 1.5);
  float air = run * mv * apart * 0.11;
  float early = 0.6 * run;
  hFootL = vec3(-0.12, 0.07 + max(cos(w - early), 0.0) * lift + air, s * reach - 0.05 * run);
  hFootR = vec3(0.12, 0.07 + max(-cos(w - early), 0.0) * lift + air, -s * reach - 0.05 * run);
  float pump = mix(0.2, 0.32, run) * mv;
  float rise = 0.09 * run * mv;
  hHandL = hChest + vec3(-0.3 + 0.04 * run, -0.24 + 0.01 * idle + rise * max(-s, 0.0), -s * pump + 0.02);
  hHandR = hChest + vec3(0.3 - 0.03 * run, -0.24 + 0.01 * idle + rise * max(s, 0.0), s * pump * 0.7 + 0.02);
  hBlade = normalize(vec3(0.25, 0.85 - 0.2 * run, 0.45 - 0.5 * run));
  if (act > 0.5 && act < 1.5) {
    float wind = smoothstep(0.0, 0.22, at), cut = smoothstep(0.22, 0.5, at), rec = smoothstep(0.62, 1.0, at);
    float ang = mix(mix(0.4, 2.2, wind), -1.1, cut);
    float lift = wind * (1.0 - cut);
    vec3 strike = hChest + vec3(sin(ang) * 0.46, 0.12 + 0.28 * lift, cos(ang) * 0.46);
    hBlade = normalize(mix(normalize(vec3(sin(ang), 0.25 + 0.6 * lift, cos(ang))), hBlade, rec));
    hHandR = mix(strike, hHandR, rec);
    hChest.x += 0.04 * (cut - rec);
    hHead.z += 0.04 * cut * (1.0 - rec);
  } else if (act > 1.5 && act < 2.5) {
    float gather = smoothstep(0.0, 0.38, at) * (1.0 - smoothstep(0.42, 0.52, at));
    float push = smoothstep(0.38, 0.5, at) * (1.0 - smoothstep(0.72, 1.0, at));
    vec3 gL = hChest + vec3(-0.2, 0.16, 0.1), gR = hChest + vec3(0.2, 0.2, 0.08);
    vec3 pL = hChest + vec3(-0.14, 0.1, 0.44), pR = hChest + vec3(0.14, 0.13, 0.44);
    hHandL = mix(mix(hHandL, gL, gather), pL, push);
    hHandR = mix(mix(hHandR, gR, gather), pR, push);
    hChest.z += 0.05 * push - 0.03 * gather;
    hHead.z += 0.04 * push - 0.02 * gather;
    hBlade = normalize(mix(hBlade, vec3(0.0, 0.5, 0.86), max(gather, push)));
  } else if (act > 2.5 && act < 3.5) {
    float k = 1.0 - at;
    hChest.z -= 0.08 * k; hHead.z -= 0.14 * k;
    hHandL.y += 0.1 * k; hHandR.y += 0.1 * k;
  } else if (act > 3.5 && act < 4.5) {
    hHip = vec3(0.0, 0.4, 0.0);
    hChest = hHip + vec3(0.0, 0.24, 0.17);
    hHead = hChest + vec3(0.0, 0.4, 0.13);
    hFootL = vec3(-0.11, 0.09, 0.46);
    hFootR = vec3(0.11, 0.24, -0.5);
    hHandL = hChest + vec3(-0.27, -0.08, -0.34);
    hHandR = hChest + vec3(0.3, -0.14, -0.3);
    hBlade = normalize(vec3(0.2, 0.22, -0.95));
  } else if (act > 4.5 && act < 5.5) {
    float raise = smoothstep(0.0, 0.18, at), rec = smoothstep(0.7, 1.0, at);
    float pull = smoothstep(0.1, 0.5, at) * (1.0 - smoothstep(0.52, 0.58, at));
    float loose = smoothstep(0.52, 0.6, at) * (1.0 - rec);
    hChest.x -= 0.04 * raise * (1.0 - rec);
    hHead.x -= 0.03 * raise * (1.0 - rec);
    vec3 bowHand = hChest + vec3(-0.06, 0.16, 0.46);
    vec3 nock = hChest + vec3(-0.02, 0.17, 0.28);
    vec3 cheek = hChest + vec3(0.1, 0.24, -0.04);
    vec3 flick = hChest + vec3(0.3, 0.26, -0.12);
    hHandL = mix(hHandL, bowHand, raise * (1.0 - rec));
    hHandR = mix(hHandR, mix(mix(nock, cheek, pull), flick, loose), raise * (1.0 - rec));
    hDraw = pull;
  }
}

float entMap(vec3 p, out float mat) {
  vec3 hp = p - hHead;
  float d = length(hp) - 0.33;
  mat = 0.0;

  float hair = length(hp - vec3(0.0, 0.035, -0.035)) - 0.365;
  hair = max(hair, hp.z * 0.85 - hp.y * 0.55 - 0.17 - 0.025 * sin(hp.x * 24.0));
  hair = smin(hair, length(hp - vec3(0.02, 0.33, -0.1)) - 0.09, 0.1);
  float accent = 1e3, wood = 1e3, metal = 1e3, glow = 1e3, shield = 1e3;
  if (eExtra < 0.5) {
    hair = smin(hair, sdCapsule(hp, vec3(0.0, 0.05, -0.3), vec3(0.0, -0.2, -0.42 - 0.05 * ePose.w), 0.07), 0.08);
    vec3 neck = hChest + vec3(0.0, 0.15, 0.0);
    accent = sdTorusY(p - neck, 0.13, 0.06);
    float sway = sin(uTime * 3.0 + eLook.x * 9.0);
    vec3 ta = neck + vec3(0.06, 0.0, -0.13);
    vec3 tb = ta + vec3(0.05 + 0.05 * sway, -0.14 + 0.1 * ePose.w, -0.26 - 0.14 * ePose.w);
    accent = smin(accent, sdTaper(p, ta, tb, 0.055, 0.035), 0.05);
    float big = gearBit(2.0);
    metal = sdTaper(p, hHandR + hBlade * 0.1, hHandR + hBlade * mix(0.82, 1.16, big), mix(0.042, 0.056, big), 0.014);
    vec3 side = normalize(cross(hBlade, vec3(0.0, 0.0, 1.0)) + 1e-3);
    wood = min(sdCapsule(p, hHandR - hBlade * mix(0.07, 0.2, big), hHandR + hBlade * 0.08, 0.03),
               sdCapsule(p, hHandR + hBlade * 0.1 - side * 0.1, hHandR + hBlade * 0.1 + side * 0.1, 0.028));
    if (gearBit(1.0) > 0.5) {
      vec3 sq = p - hHandL - vec3(-0.05, 0.02, 0.07);
      shield = max(length(sq.xy * vec2(1.0, 0.86)) - 0.23, abs(sq.z) - 0.028) - 0.008;
    }
  } else if (eExtra < 1.5) {
    accent = min(sdCylinder(hp - vec3(0.0, 0.2, 0.0), 0.52, 0.045), sdConeUp(hp - vec3(0.0, 0.2, 0.0), 0.27, 0.3) - 0.02);
    accent = min(accent, sdRoundBox(p - hChest - vec3(0.0, -0.2, 0.15), vec3(0.14, 0.2, 0.035), 0.03));
  } else if (eExtra < 2.5) {
    float hood = length(hp - vec3(0.0, 0.03, -0.05)) - 0.4;
    hood = max(hood, hp.z * 0.9 - hp.y * 0.35 - 0.2);
    accent = smin(hood, sdTaper(p, hChest + vec3(0.0, 0.12, -0.08), hHip + vec3(0.0, -0.2, -0.16), 0.2, 0.26), 0.1);
    vec3 st = hHandR + vec3(0.02, 0.0, 0.05);
    wood = sdCapsule(p, st - vec3(0.0, 0.62, 0.0), st + vec3(0.0, 0.85, 0.0), 0.03);
    glow = length(p - st - vec3(0.0, 0.95, 0.0)) - 0.09;
  } else {
    float hood = length(hp - vec3(0.0, 0.03, -0.05)) - 0.4;
    hood = max(hood, hp.z * 0.9 - hp.y * 0.35 - 0.2);
    accent = smin(hood, sdTaper(p, hChest + vec3(0.0, 0.12, -0.08), hChest + vec3(0.0, -0.16, -0.22), 0.17, 0.12), 0.08);
    if (gearBit(4.0) > 0.5) {
      metal = sdTaper(p, hHandR + hBlade * 0.08, hHandR + hBlade * 0.44, 0.032, 0.008);
      wood = sdCapsule(p, hHandR - hBlade * 0.05, hHandR + hBlade * 0.07, 0.028);
    } else {
      vec3 b = p - hHandL;
      float bend = 0.55 - 0.08 * hDraw;
      float arc = length(vec2(length(b.yz - vec2(0.0, -bend)) - bend, b.x)) - 0.028;
      wood = max(arc, -(b.z + 0.3));
      vec3 top = hHandL + vec3(0.0, 0.49, -0.3), low = hHandL + vec3(0.0, -0.49, -0.3);
      vec3 pullTo = mix((top + low) * 0.5, hHandR, hDraw);
      metal = min(sdCapsule(p, top, pullTo, 0.007), sdCapsule(p, pullTo, low, 0.007));
      if (hDraw > 0.05) metal = min(metal, sdCapsule(p, hHandR, hHandL + normalize(hHandL - hHandR) * 0.18, 0.011));
    }
  }
  if (hair < d) { d = hair; mat = 1.0; }

  float torso = sdTaper(p, hHip + vec3(0.0, 0.1, 0.0), hChest + vec3(0.0, 0.04, 0.0), 0.162, 0.15);
  float hemTop = hHip.y + 0.06, hemBot = hemY(), hh = (hemTop - hemBot) * 0.5;
  vec3 sp = p - vec3(hHip.x, hemBot + hh, hHip.z);
  float wave = 0.011 * sin(atan(sp.x, sp.z) * 5.0 + eLook.x * 6.28 + 2.0 * ePose.x) * smoothstep(hh, -hh, sp.y);
  float skirt = sdFrustum(sp, hh, robed() ? 0.24 : 0.19, 0.152) - 0.012 - wave;
  float tunic = smin(torso, skirt, 0.04);
  tunic = min(tunic, sdTaper(p, hChest + vec3(-0.17, 0.05, 0.0), hHandL, 0.068, 0.055));
  tunic = min(tunic, sdTaper(p, hChest + vec3(0.17, 0.05, 0.0), hHandR, 0.068, 0.055));
  if (tunic < d) { d = tunic; mat = 2.0; }
  float hands = min(length(p - hHandL), length(p - hHandR)) - 0.072;
  if (hands < d) { d = hands; mat = 0.0; }
  vec3 kneeL = kneeOf(-1.0), kneeR = kneeOf(1.0);
  float legs = min(sdTaper(p, kneeL, hFootL + vec3(0.0, 0.06, 0.0), 0.07, 0.056),
                   sdTaper(p, kneeR, hFootR + vec3(0.0, 0.06, 0.0), 0.07, 0.056));
  if (legs < d) { d = legs; mat = 3.0; }
  float tall = eExtra > 2.5 ? 0.24 : 0.19;
  float boots = min(sdBoot(p, hFootL, kneeL, tall), sdBoot(p, hFootR, kneeR, tall));
  if (boots < d) { d = boots; mat = 4.0; }
  if (accent < d) { d = accent; mat = 5.0; }
  if (metal < d) { d = metal; mat = 6.0; }
  if (wood < d) { d = wood; mat = 7.0; }
  if (glow < d) { d = glow; mat = 8.0; }
  if (shield < d) { d = shield; mat = 9.0; }
  return d;
}

vec3 browShape(float face) {
  if (face < 0.5) return vec3(0.125, -0.15, 4.0);
  if (face < 1.5) return vec3(0.105, 0.42, 1.5);
  if (face < 2.5) return vec3(0.12, -0.6, 0.0);
  if (face < 3.5) return vec3(0.14, -0.1, 6.0);
  if (face < 4.5) return vec3(0.128, -0.55, 1.0);
  if (face < 5.5) return vec3(0.16, 0.0, 8.0);
  return vec3(0.12, -0.2, 0.0);
}

float browInk(vec3 f) {
  if (f.z < 0.05) return 0.0;
  float side = f.x < 0.0 ? -1.0 : 1.0;
  vec2 e = vec2(f.x - side * 0.125, f.y + 0.015);
  vec3 b = browShape(faceOf());
  return penLine((e.y - (b.x + b.y * e.x * side - b.z * e.x * e.x)) * 0.75) * step(abs(e.x), 0.05);
}

void entFace(vec3 f, inout Surf s) {
  float face = faceOf();
  float side = f.x < 0.0 ? -1.0 : 1.0;
  vec2 e = vec2(f.x - side * 0.125, f.y + 0.015);
  float u = e.x * side;
  vec2 mo = vec2(f.x, f.y + 0.118);
  float open = face < 1.5 || (face > 3.5 && face < 5.5) ? 1.0 : 0.0;
  float blink = step(0.965, fract(uTime * 0.27 + eLook.x)) * open;
  vec2 sz = vec2(0.05, 0.08) * (face > 4.5 && face < 5.5 ? 1.2 : 1.0) * (1.0 + 0.06 * side);
  float eye = open * (1.0 - blink) * smoothstep(1.0, 0.85, length(e / sz));
  float glint = smoothstep(0.024, 0.014, length(e - vec2(-0.016, 0.03))) + smoothstep(0.011, 0.006, length(e - vec2(0.016, -0.03)));
  float ink = blink * penLine(e.y + 0.004 - 5.0 * e.x * e.x) * step(abs(e.x), 0.048);
  float mouth = 0.0, fill = 0.0, rim = 0.0, tongue = 0.0;
  if (face < 0.5) {
    mouth = penLine(mo.y - 0.002 - 8.0 * mo.x * mo.x) * step(abs(mo.x), 0.042);
  } else if (face < 1.5) {
    mouth = penLine(mo.y + 3.0 * mo.x * mo.x) * step(abs(mo.x), 0.03);
  } else if (face < 2.5) {
    float cu = u + 0.032;
    ink = max(ink, penLine(abs(e.y) - 0.7 * cu) * step(0.0, cu) * step(cu, 0.075));
    vec2 r = vec2(0.046, 0.024);
    fill = step(length(mo / r), 1.0);
    rim = penLine((length(mo / r) - 1.0) * r.y);
  } else if (face < 3.5) {
    ink = max(ink, penLine(e.y - 0.012 + 10.0 * e.x * e.x) * step(abs(e.x), 0.046));
    vec2 dm = (mo - vec2(0.0, 0.012)) / vec2(0.052, 0.05);
    fill = step(length(dm), 1.0) * step(mo.y, 0.012);
    rim = max(penLine((length(dm) - 1.0) * 0.05) * step(mo.y, 0.012), penLine(mo.y - 0.012) * step(abs(mo.x), 0.052));
    tongue = step(length((mo - vec2(0.0, -0.026)) / vec2(0.026, 0.014)), 1.0);
  } else if (face < 4.5) {
    mouth = penLine(mo.y + 0.004 + 7.0 * mo.x * mo.x) * step(abs(mo.x), 0.03);
  } else if (face < 5.5) {
    vec2 r = vec2(0.019, 0.026);
    fill = step(length(mo / r), 1.0);
    rim = penLine((length(mo / r) - 1.0) * r.x);
  } else {
    ink = max(ink, (penLine(e.y - e.x) + penLine(e.y + e.x)) * step(abs(e.x), 0.034) * step(abs(e.y), 0.034));
    mouth = penLine(mo.y) * step(abs(mo.x), 0.03);
  }
  s.ink = max(ink, max(max(browInk(f), mouth), rim));
  vec2 c = vec2(abs(f.x) - 0.205, f.y + 0.095);
  float ticks = smoothstep(0.3, 0.1, abs(fract((c.x * 0.9 + c.y * 0.45) * 46.0) - 0.5)) * step(length(c * vec2(1.0, 1.7)), 0.055);
  if (ticks > 0.1) { s.albedo = P_ROSE; s.cover = ticks * 0.85; }
  if (fill > 0.5) { s.albedo = tongue > 0.5 ? P_ROSE : P_UMBER * 0.6; s.cover = 1.0; s.solid = 1.0; s.ink = 0.0; }
  if (eye > 0.3) { s.albedo = INK_BLACK; s.cover = 1.0 - min(glint, 1.0); s.solid = 1.0; s.ink = 0.0; }
}

void entSurf(vec3 p, float mat, inout Surf s) {
  int m = int(mat + 0.5);
  if (m == 0) {
    s.albedo = P_APRICOT; s.cover = 0.1; s.wrap = 0.35;
    vec3 f = p - hHead;
    if (f.z > 0.05 && length(f) < 0.36) entFace(f, s);
  } else if (m == 1) {
    float streak = vnoise(vec2(atan(p.x - hHead.x, p.z - hHead.z) * 5.0, p.y * 3.0));
    s.albedo = eColC; s.cover = mix(0.78, 0.95, streak);
    s.ink = max(smoothstep(0.12, 0.0, abs(fract(streak * 3.0) - 0.5)) * 0.55, browInk(p - hHead));
  } else if (m == 2) {
    s.albedo = eColA; s.cover = 0.84;
    float belt = abs(p.y - hHip.y - 0.1) - 0.03;
    if (belt < 0.0) {
      bool buckle = abs(p.x - hHip.x) < 0.04 && p.z > hHip.z;
      s.albedo = buckle ? P_MUSTARD : P_UMBER; s.cover = 0.95;
    }
    s.ink = penLine(belt) * 0.9;
    float low = step(p.y, hHip.y + 0.06);
    float trim = p.y - hemY() - 0.04;
    if (trim < 0.0 && low > 0.5) { s.albedo = eColB; s.cover = 0.9; }
    s.ink = max(s.ink, penLine(trim) * low * 0.8);
    float fold = penLine(sin(atan(p.x - hHip.x, p.z - hHip.z) * 3.0 + 1.3) * 0.05);
    s.ink = max(s.ink, fold * low * smoothstep(hemY() + 0.12, hemY() + 0.05, p.y) * step(0.0, trim) * 0.4);
  } else if (m == 3) { s.albedo = P_STONE; s.cover = 0.72; }
  else if (m == 4) {
    vec3 foot = length(p - hFootL) < length(p - hFootR) ? hFootL : hFootR;
    float along = dot(p - foot, normalize(kneeOf(sign(foot.x)) - foot));
    float tall = eExtra > 2.5 ? 0.24 : 0.19;
    s.albedo = P_UMBER; s.cover = 0.86;
    if (along > tall - 0.014) { s.albedo = P_BARK; s.cover = 0.8; }
    s.ink = penLine(along - tall + 0.014) * 0.8;
    float sole = p.y - (foot.y - 0.05);
    if (sole < 0.0) { s.albedo = INK_DARK; s.cover = 0.9; }
    s.ink = max(s.ink, penLine(sole) * 0.9);
    if (eExtra > 2.5 && along > 0.06 && along < tall - 0.03 && p.z > foot.z && abs(p.x - foot.x) < 0.035) s.ink = max(s.ink, penLine((fract(along * 30.0) - 0.5) * 0.033) * 0.7);
  }
  else if (m == 5) {
    s.albedo = eColB; s.cover = 0.86;
    if (eExtra > 0.5 && eExtra < 1.5 && p.y < hChest.y) { s.albedo = P_CREAM; s.cover = 0.14; }
  } else if (m == 6) { s.albedo = P_SLATE; s.cover = 0.1; s.ink = 0.0; }
  else if (m == 7) { s.albedo = P_BARK; s.cover = 0.8; }
  else if (m == 9) {
    vec3 sq = p - hHandL - vec3(-0.05, 0.02, 0.07);
    float r = length(sq.xy * vec2(1.0, 0.86));
    s.albedo = r < 0.06 ? P_SLATE : eColB;
    s.cover = r < 0.06 ? 0.2 : 0.86;
    s.ink = max(penLine(r - 0.2) * 0.9, penLine(r - 0.06) * 0.7);
  }
  else { s.albedo = P_SKY; s.cover = 0.1; s.glow = 1.0; }
}
`,
});
