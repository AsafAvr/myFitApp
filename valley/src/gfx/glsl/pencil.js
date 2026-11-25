import { glsl, registerChunk } from '../shaderlib.js';

registerChunk('pencil', glsl`
const vec3 PAPER = vec3(0.910, 0.886, 0.831);
const vec3 INK_SEPIA = vec3(0.384, 0.235, 0.118);
const vec3 INK_SOFT = vec3(0.502, 0.376, 0.259);
const vec3 INK_DARK = vec3(0.180, 0.140, 0.150);
const vec3 INK_BLACK = vec3(0.141, 0.137, 0.180);
const vec3 INK_LEAF = vec3(0.180, 0.478, 0.275);
const vec3 INK_WET = vec3(0.227, 0.502, 0.659);

const vec3 P_BUTTER = vec3(0.973, 0.816, 0.361), P_SUN = vec3(0.957, 0.745, 0.243), P_HONEY = vec3(0.910, 0.643, 0.188);
const vec3 P_APRICOT = vec3(0.941, 0.620, 0.290), P_POPPY = vec3(0.878, 0.361, 0.275), P_TAN = vec3(0.886, 0.737, 0.510);
const vec3 P_BARK = vec3(0.690, 0.502, 0.329), P_UMBER = vec3(0.478, 0.243, 0.173), P_CREAM = vec3(0.973, 0.910, 0.745);
const vec3 P_BRICK = vec3(0.737, 0.329, 0.235), P_LEAF = vec3(0.455, 0.659, 0.353), P_GREEN = vec3(0.376, 0.620, 0.329);
const vec3 P_SAGE = vec3(0.588, 0.698, 0.471), P_PINE = vec3(0.455, 0.612, 0.541), P_TEAL = vec3(0.275, 0.588, 0.588);
const vec3 P_SKY = vec3(0.533, 0.706, 0.847), P_SLATE = vec3(0.329, 0.424, 0.612), P_DUSK = vec3(0.259, 0.298, 0.612);
const vec3 P_INDIGO = vec3(0.157, 0.196, 0.502), P_STONE = vec3(0.588, 0.557, 0.518), P_WOOD = vec3(0.871, 0.698, 0.431);
const vec3 P_ROSE = vec3(0.878, 0.439, 0.502), P_PEACH = vec3(0.925, 0.780, 0.690), P_CLAY = vec3(0.820, 0.640, 0.590);
const vec3 P_MUSTARD = vec3(0.886, 0.690, 0.204), P_VERMILION = vec3(0.839, 0.275, 0.204), P_CHARCOAL = vec3(0.290, 0.300, 0.370);

uniform vec4 uPencil;
uniform vec3 uPaperAnchor;
uniform vec3 uPaperRight, uPaperUp, uPaperFwd;
uniform vec3 uPaperRightB, uPaperUpB, uPaperFwdB;
uniform float uPaperMix;

const float SLANT = 1.082;
const float PITCH0 = 1.0 / 64.0;

vec2 pencilLod(float viewDepth) {
  float l = max(log2(max(uPencil.x * uPencil.y * viewDepth, 1e-5) / PITCH0), 0.0);
  return vec2(floor(l), fract(l));
}
vec2 paperCoords(vec3 worldPos, vec3 right, vec3 up) {
  vec3 d = worldPos - uPaperAnchor;
  return vec2(dot(d, right), dot(d, up));
}

float pullPressure(float i, float along, vec2 lod, float seed) {
  float id = i * exp2(lod.x);
  float rh = hash11(id * 0.731 + seed * 57.0);
  float pa = vnoise(vec2(along * 0.06, id * 0.37 + seed));
  float pb = vnoise(vec2(along * 0.03, id * 0.37 + seed));
  float keep = 1.0 - mod(i, 2.0) * smoothstep(0.2, 0.95, lod.y);
  return mix(0.82, 1.06, rh) * mix(0.66, 1.12, mix(pa, pb, lod.y)) * keep;
}
float pullWeight(float i, vec2 lod, float seed) {
  return mix(0.84, 1.1, hash11(i * exp2(lod.x) * 0.731 + seed * 57.0));
}

float pencilLay(vec2 uv, vec2 lod, float cover, float soft, float ang, float seed) {
  if (cover < 0.015) return 0.0;
  float pitch = PITCH0 * exp2(lod.x);
  float w = lod.y, wide = mix(1.0, 2.0, w);
  float tooth = 0.6 * mix(vnoise(uv / (pitch * 0.45) + seed * 3.1), vnoise(uv / (pitch * 0.9) + seed * 3.1), w)
              + 0.4 * mix(vnoise(uv / (pitch * 0.19) + 7.7), vnoise(uv / (pitch * 0.38) + 7.7), w);
  vec2 wander = (vec2(vnoise(uv * 1.3 + seed), vnoise(uv * 1.3 + seed + 31.7)) - 0.5) * 0.022;
  vec2 dir = vec2(cos(ang), sin(ang));
  float along = dot(uv + wander, dir) / pitch;
  float across = (dot(uv + wander, vec2(-dir.y, dir.x)) + seed * 0.37) / pitch;

  if (soft > 0.5) {
    float i0 = floor(across), f = across - i0;
    float odd0 = mod(i0, 2.0);
    float iE = i0 + odd0, iO = i0 + 1.0 - odd0, iE2 = 2.0 * iO - iE;
    float pE = pullWeight(iE, lod, seed), pE2 = pullWeight(iE2, lod, seed);
    float pO = mix(pullWeight(iO, lod, seed), 0.5 * (pE + pE2), smoothstep(0.2, 0.95, w));
    float t = f * f * (3.0 - 2.0 * f);
    float streak = odd0 < 0.5 ? mix(pE, pO, t) : mix(pO, pE, t);
    float drift = mix(0.78, 1.12, vnoise(uv * vec2(0.9, 0.9) + dir * dot(uv, dir) * 0.6 + seed * 5.0));
    float p = mix(0.36, 1.0, cover) * streak * drift;
    return smoothstep(tooth - 0.42, tooth + 0.3, p * 0.86);
  }
  float i = floor(across + 0.5), fy = across - i;
  float rh = hash11(i * exp2(lod.x) * 0.317 + seed * 11.0);
  float halfW = 0.5 * mix(0.6, 1.5, cover) * wide * (1.0 - 0.45 * mod(i, 2.0) * w);
  float centre = (rh - 0.5) * 0.3 * wide;
  float shape = 1.0 - smoothstep(halfW - 0.3 * wide, halfW, abs(fy - centre));
  float p = mix(0.45, 1.0, cover) * pullPressure(i, along, lod, seed);
  return max(shape, 0.3 * step(0.6, cover)) * smoothstep(tooth - 0.34, tooth + 0.22, p * 0.88);
}

vec3 shadowPencil(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  vec3 deep = mix(c, c * c * 1.15, 0.62);
  float warm = saturate((c.r - c.b) * 2.4 - max(c.g - c.r, 0.0) * 6.0);
  deep = mix(deep, P_BRICK * (0.62 + 0.45 * mx), warm * 0.5);
  float own = mix(smoothstep(0.12, 0.34, sat), smoothstep(0.3, 0.55, sat), warm);
  return mix(vec3(0.50, 0.55, 0.69), deep, own);
}

vec3 nightPencil(vec3 c) {
  return mix(P_INDIGO * 1.15, c * vec3(0.62, 0.72, 0.95), 0.42);
}

vec3 paperSheet(vec2 px) {
  float g = vnoise(px * 0.55) * 0.5 + vnoise(px * 0.13) * 0.3 + hash12(floor(px)) * 0.2;
  return PAPER * (1.0 + (g - 0.5) * 0.07);
}

vec3 layOn(vec3 page, vec3 pigment, float density) { return mix(page, pigment * (page / PAPER), density); }
vec3 shadeOn(vec3 page, vec3 pigment, float density) { return page * mix(vec3(1.0), pigment, density); }
vec3 inkOn(vec3 page, vec3 ink, float amount) { return mix(page, ink, amount); }
`);
