import { glsl, registerChunk } from '../shaderlib.js';

registerChunk('terrain', glsl`
uniform sampler2D uHeightTex;
uniform sampler2D uColorTex;
uniform sampler2D uMatTex;
uniform sampler2D uPropTexA;
uniform sampler2D uPropTexB;
uniform float uMaxY;

const float INV_T = 1.0 / WORLD_TEX;
vec4 hSample(vec2 xz) { return textureLod(uHeightTex, (xz + 0.5) * INV_T, 0.0); }
float hAt(vec2 xz) { return textureLod(uHeightTex, (xz + 0.5) * INV_T, 0.0).r; }
vec3 terrainNormal(vec2 xz) {
  const float e = 0.7;
  return normalize(vec3(hAt(xz - vec2(e, 0.0)) - hAt(xz + vec2(e, 0.0)), 2.0 * e,
                        hAt(xz - vec2(0.0, e)) - hAt(xz + vec2(0.0, e))));
}

bool cellProp(ivec2 cell, out Prop pr) {
  ivec2 tc = cell & (CELLS - 1);
  vec4 a = texelFetch(uPropTexA, tc, 0);
  pr.type = int(a.w + 0.5);
  if (pr.type == 0) return false;
  vec4 b = texelFetch(uPropTexB, tc, 0);
  vec2 c = (vec2(cell) + 0.5) * CELL + a.xy;
  pr.base = vec3(c.x, a.z, c.y);
  pr.rot = b.x * TAU; pr.scale = b.y * 2.0; pr.seed = b.z; pr.pal = b.w * 255.0;
  return true;
}
mat2 propRot(Prop pr) { return rot2(pr.rot); }
vec3 toProp(vec3 p, Prop pr, mat2 r) { vec3 q = p - pr.base; q.xz = r * q.xz; return q / pr.scale; }

float cellExit(vec2 xz, vec2 dir) {
  vec2 f = fract(xz / CELL);
  vec2 e = mix(f, 1.0 - f, step(0.0, dir)) * CELL / (abs(dir) + 1e-5);
  return min(e.x, e.y) + 0.02;
}

struct Hit { float t; int kind; float mat; Prop pr; ivec2 cell; };

bool gReveal = false;
float gRevealT = 0.0;

void marchScene(vec3 ro, vec3 rd, float tMin, float tMax, out Hit hit) {
  hit.kind = 0; hit.t = tMax; hit.mat = 0.0; hit.cell = ivec2(0);
  float t = tMin, tPrev = tMin;
  ivec2 last = ivec2(-99999);
  bool has = false;
  Prop pr; mat2 pm;
  for (int i = 0; i < MARCH_STEPS; i++) {
    vec3 p = ro + rd * t;
    float above = p.y - hAt(p.xz);
    float eps = 0.0016 * t + 0.003;
    if (above < eps) {
      float a = tPrev, b = t;
      for (int k = 0; k < 5; k++) {
        float m = 0.5 * (a + b);
        vec3 q = ro + rd * m;
        if (q.y - hAt(q.xz) < eps) b = m; else a = m;
      }
      hit.t = b; hit.kind = 1;
      return;
    }
    float d;
    if (above < PROP_HMAX) {
      d = above * 0.5;
      ivec2 cell = ivec2(floor(p.xz / CELL));
      if (cell != last) { last = cell; has = cellProp(cell, pr); if (has) pm = propRot(pr); }
      if (has) {
        float m;
        float dp = propSdf(toProp(p, pr, pm), pr, m) * pr.scale;
        if (dp < eps) {
          if (!(gReveal && t < gRevealT && propSeeThrough(pr.type, m))) {
            hit.t = t; hit.kind = 2; hit.mat = m; hit.pr = pr; hit.cell = cell;
            return;
          }
          dp = 0.3;
        }
        d = min(d, dp);
      }
      d = min(d, cellExit(p.xz, rd.xz));
    } else {
      d = (above - PROP_HMAX) * 0.5 + 0.35;
    }
    tPrev = t;
    t += max(d, 0.02);
    if (t > tMax) break;
  }
}

float shadowMarch(vec3 p, vec3 L) {
  float res = 1.0, t = 0.1;
  ivec2 last = ivec2(-99999);
  bool has = false;
  Prop pr; mat2 pm;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    vec3 q = p + L * t;
    float above = q.y - hAt(q.xz);
    if (above < -0.03) return 0.0;
    float d = above * 0.6 + 0.06;
    if (t > 1.5) res = min(res, 16.0 * above / t);
    if (above < PROP_HMAX) {
      ivec2 cell = ivec2(floor(q.xz / CELL));
      if (cell != last) { last = cell; has = cellProp(cell, pr); if (has) pm = propRot(pr); }
      if (has) {
        float m;
        float dp = propSdf(toProp(q, pr, pm), pr, m) * pr.scale;
        if (dp < 0.01) return 0.0;
        res = min(res, 11.0 * dp / t);
        d = min(d, dp);
      }
      d = min(d, cellExit(q.xz, L.xz));
    }
    t += clamp(d, 0.07, 5.0);
    if (res < 0.02 || q.y > uMaxY || t > 46.0) break;
  }
  return saturate(res);
}

float cloudShadow(vec2 xz) {
  float d = fbm(xz * 0.011 + uWind * uTime * 0.02);
  float edge = 0.66 - uCloud * 0.3;
  return 1.0 - 0.3 * smoothstep(edge - 0.08, edge + 0.08, d) * (1.0 - uNight * 0.6);
}
`);

registerChunk('ground', glsl`
float gGrass = 0.0;

void groundSurf(vec3 p, float t, inout vec3 N, out Surf s, out float canopy) {
  s = newSurf();
  vec2 uv = (p.xz + 0.5) * INV_T;
  vec4 ct = textureLod(uColorTex, uv, 0.0);
  vec4 mt = textureLod(uMatTex, uv, 0.0);
  vec4 hs = textureLod(uHeightTex, uv, 0.0);
  canopy = hs.g;
  float grass = mt.r, sand = mt.g, snow = mt.b, rock = mt.a, path = ct.a;
  float lod = smoothstep(85.0, 24.0, t);
  vec3 col = ct.rgb;

  float swatch = fbm(p.xz * 0.07);
  float swatch2 = fbm(p.xz * 0.023 + 40.0);
  col = mix(col, mix(col, P_BUTTER, 0.42), smoothstep(0.5, 0.78, swatch2) * grass * 0.75);
  col = mix(col, mix(col, P_PINE, 0.5), smoothstep(0.45, 0.2, swatch2) * grass * 0.6);
  s.soft = 1.0;
  s.cover = mix(0.4, 0.68, swatch) * mix(0.75, 1.0, grass);
  gGrass = grass * lod;

  float fl = hs.b * grass * lod;
  if (fl > 0.02) {
    vec2 fv = voronoi(p.xz * 1.9 + 31.0);
    float bloom = smoothstep(0.14, 0.1, fv.x) * step(1.0 - fl * 0.3, fract(fv.y * 3.7));
    col = mix(col, fv.y < 0.66 ? P_ROSE : P_SUN, bloom);
    s.cover = mix(s.cover, fv.y < 0.33 ? 0.0 : 0.95, bloom);
    s.ink = max(s.ink, smoothstep(0.04, 0.02, fv.x) * step(fv.y, 0.33) * bloom * 0.7);
    gGrass *= 1.0 - bloom;
  }
  if (path > 0.03) {
    float cob = smoothstep(0.6, 0.85, path);
    float on = smoothstep(0.03, 0.3, path);
    float pf = mix(2.4, 1.2, cob);
    vec2 pv = pavers(p.xz * pf);
    float joint = penLine(0.5 * pv.x / pf);
    vec3 dirt = mix(P_TAN, P_BARK, 0.25 * pv.y);
    float dirtCover = mix(0.16, 0.34, swatch);
    float dirtInk = joint * step(0.82, pv.y) * 0.55;
    float tone = fract(pv.y * 7.31);
    vec3 stone = tone < 0.4 ? P_PEACH : (tone < 0.75 ? P_CLAY : mix(P_STONE, P_CREAM, 0.5));
    float stoneCover = mix(0.36, 0.8, fract(pv.y * 3.17));
    col = mix(col, mix(dirt, stone, cob), on);
    s.cover = mix(s.cover, mix(dirtCover, stoneCover, cob), on);
    s.ink = max(s.ink, mix(dirtInk, joint * 0.8, cob) * on * mix(0.4, 1.0, lod));
    gGrass *= 1.0 - smoothstep(0.08, 0.35, path);
  }
  if (sand > 0.04) {
    vec2 sv = voronoi(p.xz * 3.1);
    col = mix(col, mix(P_TAN, P_CREAM, 0.45), sand);
    s.cover = mix(s.cover, 0.14 + 0.3 * hs.a + 0.1 * swatch, sand);
    s.ink = max(s.ink, smoothstep(0.07, 0.035, sv.x) * step(0.8, sv.y) * 0.5 * sand * lod);
  }
  if (rock > 0.04) {
    float strata = vnoise(vec2(p.y * 3.2 + vnoise(p.xz * 0.5) * 3.0, dot(p.xz, vec2(0.4, 0.3))));
    col = mix(col, uRockCol, rock * 0.85);
    s.cover = mix(s.cover, mix(0.5, 0.78, strata), rock);
    s.ink = max(s.ink, smoothstep(0.05, 0.0, abs(fract(strata * 3.0) - 0.5)) * 0.6 * rock * lod);
    N = normalize(N + vec3(strata - 0.5, 0.0, 0.5 - strata) * 0.5 * rock);
  }
  if (snow > 0.04) {
    float drift = vnoise(vec2(dot(p.xz, vec2(0.8, 0.6)) * 0.22, dot(p.xz, vec2(-0.6, 0.8)) * 1.3));
    col = mix(col, mix(P_SKY, P_SLATE, 0.2), snow);
    s.cover = mix(s.cover, 0.015 + 0.13 * smoothstep(0.5, 0.15, drift * 0.6 + swatch * 0.6), snow);
  }
  s.albedo = col;
}
`);
