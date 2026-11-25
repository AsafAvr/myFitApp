import { glsl, registerChunk } from '../shaderlib.js';
import './pencil.js';

registerChunk('frame', glsl`
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform vec2 uTanFov;
uniform vec3 uFocus;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunDisk, uMoonDisk;
uniform float uNight;
uniform float uGold;
uniform float uCloud;
uniform vec2 uWind;
`);

registerChunk('sky', glsl`
vec3 skyLay(vec3 rd, out float cover, out float ink) {
  float h = max(rd.y, 0.0);
  ink = 0.0;
  vec3 pig = P_SKY;
  cover = mix(0.1, 0.5, smoothstep(0.02, 0.5, h));
  float low = exp(-h * 6.0);
  pig = mix(pig, mix(P_APRICOT, P_ROSE, 0.3), uGold * low * 0.9);
  cover = mix(cover, 0.4, uGold * low);
  pig = mix(pig, mix(P_INDIGO, P_DUSK, 0.4), uNight);
  cover = mix(cover, mix(0.6, 0.86, smoothstep(0.0, 0.5, h)), uNight);

  if (rd.y > 0.01) {
    vec2 uv = rd.xz / (rd.y + 0.16) * 1.1 + uWind * uTime * 0.012;
    float edge = 0.6 - uCloud * 0.28;
    float cloud = smoothstep(edge - 0.02, edge + 0.06, fbm(uv)) * smoothstep(0.01, 0.14, rd.y);
    cover *= 1.0 - cloud * mix(0.96, 0.5, uNight);
    if (uNight > 0.05) {
      vec2 sp = rd.xz / (rd.y + 0.35) * 42.0;
      vec2 cell = floor(sp);
      float star = hash12(cell);
      vec2 so = hash22(cell + 3.1) - 0.5;
      cover *= 1.0 - smoothstep(0.1, 0.04, length(fract(sp) - 0.5 - so * 0.6)) * step(0.8, star) * uNight;
    }
  }
  cover *= 1.0 - smoothstep(0.9984, 0.9990, dot(rd, uSunDisk)) * (1.0 - uNight) * step(0.0, rd.y);
  float md = dot(rd, uMoonDisk);
  float moon = smoothstep(0.9986, 0.9991, md) * (1.0 - 0.9 * smoothstep(0.9986, 0.9991, dot(rd, normalize(uMoonDisk + vec3(0.022, 0.013, 0.0)))));
  cover *= 1.0 - moon * uNight;

  vec2 az = normalize(rd.xz + 1e-5);
  float r1 = 0.02 + 0.1 * fbm(az * 2.2 + 4.0);
  float r2 = 0.01 + 0.06 * fbm(az * 3.6 + 11.0);
  float m1 = smoothstep(r1 + 0.002, r1, rd.y), m2 = smoothstep(r2 + 0.002, r2, rd.y);
  vec3 far1 = mix(P_SKY, P_SAGE, 0.4), far2 = mix(P_SAGE, P_PINE, 0.45);
  far1 = mix(far1, nightPencil(far1), uNight); far2 = mix(far2, nightPencil(far2), uNight);
  pig = mix(pig, far1, m1); cover = mix(cover, mix(0.26, 0.6, uNight), m1);
  pig = mix(pig, far2, m2); cover = mix(cover, mix(0.36, 0.72, uNight), m2);
  ink = max(smoothstep(0.003, 0.0, abs(rd.y - r1)), smoothstep(0.003, 0.0, abs(rd.y - r2))) * 0.3;
  float mist = smoothstep(-0.005, 0.03, rd.y);
  cover *= mist; ink *= mist;
  return pig;
}
`);

registerChunk('lighting', glsl`
struct Surf { vec3 albedo; float cover; float ink; float soft; float solid; float glow; float wrap; float leafy; float moss; float occ; };
Surf newSurf() { return Surf(P_STONE, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0); }

uniform vec4 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform int uLightCount;

float gSun = 1.0;

float gPen = 0.02;
float penLine(float d) { return 1.0 - smoothstep(gPen * 0.55, gPen * 1.15, abs(d)); }

float lightPool(vec3 p, vec3 N) {
  float acc = 0.0;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - p;
    float r = uLightPos[i].w, d2 = dot(d, d);
    if (d2 < r * r) {
      float att = 1.0 - d2 / (r * r);
      float nl = dot(N, d * inversesqrt(d2 + 1e-4)) * 0.5 + 0.5;
      acc += uLightCol[i].r * att * att * mix(0.5, 1.0, nl);
    }
  }
  return saturate(acc);
}

float shadeAmount(Surf s, vec3 N, float shadow, float ao) {
  float ndl = dot(N, uSunDir);
  float i = saturate((ndl + s.wrap) / (1.0 + s.wrap)) * shadow;
  float lit = 0.45 * smoothstep(0.015, 0.075, i) + 0.55 * smoothstep(0.3, 0.38, i);
  float sh = max(1.0 - lit, (1.0 - ao) * 0.85);
  return max(sh, (1.0 - gSun) * 0.9);
}

float sphereShadow(vec3 ro, vec3 rd, vec4 sph, float k) {
  vec3 oc = ro - sph.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - sph.w * sph.w;
  float h = b * b - c;
  return (b > 0.0) ? step(-0.0001, c) : smoothstep(0.0, 1.0, h * k / b);
}
`);
