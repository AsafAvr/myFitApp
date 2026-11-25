import { Program, drawFullscreen } from '../gl.js';
import { FULLSCREEN_VS } from '../glsl/common.js';
import '../glsl/lighting.js';
import '../glsl/terrain.js';
import '../../world/props.js';
import { glsl } from '../shaderlib.js';

const WORLD_FS = glsl`
in vec2 vUv;
layout(location = 0) out vec4 oLay;
layout(location = 1) out vec4 oGbuf;
layout(location = 2) out vec4 oMark;
layout(location = 3) out vec4 oSheet;

uniform vec3 uRockCol;
uniform vec3 uLeafPal[12];
uniform vec4 uCasters[MAX_CASTERS];
uniform int uCasterCount;
uniform vec4 uReveal;
uniform float uPen;
float gSnow = 0.0;

#include <common>
#include <frame>
#include <pencil>
#include <lighting>
#include <props>
#include <terrain>
#include <ground>
#include <sky>

float casterShadow(vec3 p) {
  float s = 1.0;
  for (int i = 0; i < MAX_CASTERS; i++) {
    if (i >= uCasterCount) break;
    s = min(s, sphereShadow(p, uSunDir, uCasters[i], 4.0));
  }
  return s;
}
float casterContact(vec3 p) {
  float o = 0.0;
  for (int i = 0; i < MAX_CASTERS; i++) {
    if (i >= uCasterCount) break;
    vec4 c = uCasters[i];
    float flat_ = 1.0 - smoothstep(0.35 * c.w, 1.15 * c.w, length(p.xz - c.xz));
    o = max(o, flat_ * (1.0 - smoothstep(0.0, 1.3 * c.w, abs(p.y - (c.y - c.w)))));
  }
  return o;
}

vec3 propNormal(vec3 q, Prop pr) {
  const vec2 e = vec2(1.0, -1.0) * 0.012;
  float m;
  return normalize(e.xyy * propSdf(q + e.xyy, pr, m) + e.yyx * propSdf(q + e.yyx, pr, m) +
                   e.yxy * propSdf(q + e.yxy, pr, m) + e.xxx * propSdf(q + e.xxx, pr, m));
}

void lightSurf(inout Surf s, vec3 p, vec3 N, float shadow, float ao, out float shade) {
  shade = shadeAmount(s, N, shadow, ao * s.occ);
  float facing = smoothstep(0.55, 0.95, dot(N, uSunDir)) * (1.0 - shade);
  s.cover *= 1.0 - 0.28 * facing;
  float pool = lightPool(p, N);
  s.cover *= (1.0 - 0.88 * max(pool, s.glow));
  shade *= (1.0 - max(pool, s.glow));
  s.albedo = mix(s.albedo, nightPencil(s.albedo), uNight * (1.0 - pool));
  s.cover = mix(s.cover, min(1.0, s.cover * 1.22 + 0.08 * step(0.02, s.cover)), uNight * (1.0 - pool) * (1.0 - s.glow));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanFov.x) + uCamUp * (ndc.y * uTanFov.y));

  vec2 oc = ro.xz - uFocus.xz;
  float qa = dot(rd.xz, rd.xz), qb = dot(oc, rd.xz), qc = dot(oc, oc) - VIEW_DIST * VIEW_DIST;
  float disc = qb * qb - qa * qc;
  float tMax = (qa > 1e-6 && disc > 0.0) ? min((-qb + sqrt(disc)) / qa, 420.0) : 420.0;
  float tMin = 0.05;
  if (ro.y > uMaxY) tMin = rd.y < 0.0 ? (uMaxY - ro.y) / rd.y : tMax;

  vec2 fromHero = (ndc - uReveal.xy) * vec2(uTanFov.x / uTanFov.y, 1.0);
  gReveal = length(fromHero) < uReveal.z * (0.86 + 0.28 * vnoise(vUv * 26.0));
  gRevealT = uReveal.w - 0.7;

  Hit hit;
  hit.kind = 0; hit.t = tMax; hit.mat = 0.0; hit.cell = ivec2(0);
  if (tMin < tMax) marchScene(ro, rd, tMin, tMax, hit);
  float tw = (rd.y < -1e-4 && ro.y > SEA) ? (SEA - ro.y) / rd.y : 1e9;
  bool wet = tw < hit.t;

  Surf s = newSurf();
  vec3 N = vec3(0.0, 1.0, 0.0);
  float depth = hit.t, id = 0.0, shade = 0.0, grass = 0.0, kind = 0.0;
  vec2 sheet = vec2(8.0);

  if (hit.kind == 0 && !wet) {
    float skyInk;
    s.albedo = skyLay(rd, s.cover, skyInk);
    s.ink = skyInk;
    kind = 1.0;
    depth = 9000.0;
    id = -1.0;
  } else {
    vec3 p = ro + rd * hit.t;
    gPen = max(hit.t * uPen, 0.004);
    if (hit.kind == 1) {
      N = terrainNormal(p.xz);
      vec3 Nd = N;
      float canopy;
      groundSurf(p, hit.t, Nd, s, canopy);
      float sh = wet ? 1.0 : shadowMarch(p + N * 0.05, uSunDir);
      gSun = cloudShadow(p.xz);
      sh = min(sh, casterShadow(p + N * 0.03));
      float ao = (1.0 - 0.3 * canopy) * (1.0 - 0.55 * casterContact(p));
      lightSurf(s, p, Nd, sh, ao, shade);
      grass = gGrass;
      kind = s.soft;
      id = 0.02;
      sheet = vec2(dot(rd, uPaperFwd), dot(rd, uPaperFwdB)) * hit.t;
    } else if (hit.kind == 2) {
      mat2 pm = propRot(hit.pr);
      vec3 q = toProp(p, hit.pr, pm);
      vec3 n = propNormal(q, hit.pr);
      vec2 buv = (hit.pr.base.xz + 0.5) * INV_T;
      vec4 bm = textureLod(uMatTex, buv, 0.0);
      gSnow = bm.b;
      propMat(q, hit.mat, hit.pr, s);
      vec3 ng = n;
      if (s.leafy > 0.5) {
        vec3 j = vec3(vnoise3(q * 2.6 + 1.7), vnoise3(q * 2.6 + 5.3), vnoise3(q * 2.6 + 9.1)) - 0.5;
        n = normalize(n + j * 1.1 + vec3(0.0, 0.22, 0.0));
      }
      if (s.moss > 0.0) {
        float mossy = smoothstep(0.55, 0.8, n.y) * s.moss * max(bm.r, bm.b);
        s.albedo = mix(s.albedo, mix(textureLod(uColorTex, buv, 0.0).rgb, P_SAGE, 0.3), mossy);
      }
      mat2 back = transpose(pm);
      N = vec3(back * n.xz, n.y).xzy;
      vec3 Ng = vec3(back * ng.xz, ng.y).xzy;
      gSun = cloudShadow(p.xz);
      float sh = shadowMarch(p + Ng * 0.08, uSunDir);
      float open = saturate(propSdf(q + ng * 0.4, hit.pr, hit.mat) / 0.4);
      float ao = (0.6 + 0.4 * saturate(q.y * 0.5)) * mix(0.5, 1.0, open);
      lightSurf(s, p, N, sh, ao, shade);
      kind = s.soft;
      id = 0.1 + 0.9 * hash12(floor(hit.pr.base.xz * 2.0 + 0.5));
      vec3 stand = hit.pr.base + vec3(0.0, 1.5 * hit.pr.scale, 0.0) - ro;
      sheet = max(vec2(dot(stand, uPaperFwd), dot(stand, uPaperFwdB)), 1.0);
    } else {
      s.albedo = P_SLATE; s.cover = 0.7;
    }
    if (wet) {
      vec3 wp = ro + rd * tw;
      float depthV = max(SEA - hAt(wp.xz), 0.0);
      float k = saturate(depthV / 3.0);
      float wob = vnoise(wp.xz * 1.3 + uTime * 0.2);
      float lip = 1.0 - smoothstep(0.04, 0.14 + 0.1 * wob, depthV);
      float band = smoothstep(0.72, 0.9, sin(depthV * 11.0 - uTime * 1.6 + wob * 4.0));
      band *= (1.0 - smoothstep(0.3, 1.0, depthV)) * step(0.35, wob + 0.15);
      float foam = saturate(lip + band * 0.7);
      vec3 water = mix(P_SKY, mix(P_TEAL, P_SLATE, 0.45), k);
      s.albedo = mix(mix(s.albedo, water, saturate(0.45 + depthV * 0.9)), nightPencil(water), uNight);
      s.cover = mix(0.32, 0.72, k) * (1.0 - foam) * mix(1.0, 1.15, uNight);
      s.ink = 0.0;
      shade = (1.0 - cloudShadow(wp.xz)) * 0.6 * (1.0 - foam);
      N = vec3(0.0, 1.0, 0.0);
      depth = tw; p = wp; id = 0.05; grass = 0.0;
      sheet = vec2(dot(rd, uPaperFwd), dot(rd, uPaperFwdB)) * tw;
      kind = 2.0 - foam;
    }
    float thin = 1.0 - 0.42 * smoothstep(26.0, 100.0, depth);
    float edge = 1.0 - smoothstep(VIEW_DIST * 0.66, VIEW_DIST * 0.97, length(p.xz - uFocus.xz));
    s.cover *= thin * edge;
    shade *= thin * edge;
    s.ink *= mix(1.0, 0.55, smoothstep(26.0, 100.0, depth)) * edge;
    grass *= edge;
    id = edge < 0.03 ? -1.0 : id;
  }
  oLay = vec4(s.albedo, s.cover);
  oGbuf = vec4(octEncode(N), depth, id);
  oMark = vec4(shade, s.ink, grass, kind);
  oSheet = vec4(sheet, 0.0, 1.0);
}
`;

export const QUALITY = {
  high: { MARCH_STEPS: 120, SHADOW_STEPS: 28 },
  low: { MARCH_STEPS: 84, SHADOW_STEPS: 12 },
};

export class WorldPass {
  constructor(gl) {
    this.gl = gl;
    this.programs = {};
  }
  program(quality) {
    return this.programs[quality] || (this.programs[quality] = new Program(this.gl, 'world:' + quality, FULLSCREEN_VS, WORLD_FS, QUALITY[quality]));
  }
  render(target, frame, worldTex, applyFrame, quality) {
    const gl = this.gl, p = this.program(quality).use();
    target.bind();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    applyFrame(p);
    worldTex.bind(p);
    p.set('uCasters', frame.casters).set('uCasterCount', frame.casterCount);
    p.set('uPen', 2 * frame.camera.tan[1] / target.height * 1.3);
    drawFullscreen(gl);
  }
}
