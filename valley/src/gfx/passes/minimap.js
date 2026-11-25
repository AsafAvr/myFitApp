import { glsl, registerChunk } from '../shaderlib.js';
import { RENDER } from '../../config.js';

registerChunk('minimap', glsl`
uniform sampler2D uHeightTex, uColorTex, uPropTexA;
uniform vec4 uMapRect;
uniform vec3 uMapPlayer;
uniform vec4 uBlips[MAX_BLIPS];
uniform int uBlipCount;

vec3 blipColor(float kind) {
  if (kind < 0.5) return P_MUSTARD;
  if (kind < 1.5) return P_SLATE;
  if (kind < 2.5) return P_TEAL;
  if (kind < 3.5) return PAPER;
  if (kind < 4.5) return P_VERMILION;
  return P_SUN;
}

vec3 drawMinimap(vec3 col, vec2 px, vec3 page) {
  if (uMapRect.z < 1.0) return col;
  vec2 d = px - uMapRect.xy;
  float r = length(d);
  if (r > uMapRect.z + 1.0) return col;
  float dpr = uPencil.w;
  vec2 mapR = normalize(uCamRight.xz), mapF = normalize(uCamFwd.xz + 1e-5);
  vec2 off = (mapR * d.x + mapF * d.y) * uMapRect.w;
  vec2 w = uMapPlayer.xy + off;
  vec2 uv = (w + 0.5) / WORLD_TEX;
  float h = textureLod(uHeightTex, uv, 0.0).r;
  vec4 ct = textureLod(uColorTex, uv, 0.0);
  float stroke = dot(px, vec2(-0.883, 0.469)) / (3.6 * dpr);
  float hatch = mix(0.72, 1.0, smoothstep(0.25, 0.6, 0.5 + 0.5 * sin(stroke * 6.2832))) * (0.75 + 0.25 * hash12(floor(px / (1.5 * dpr))));
  vec3 m = page;
  if (h < SEA) m = mix(m, mix(P_SKY, P_SLATE, saturate(-h / 4.0)), 0.75 * hatch + 0.12);
  else m = mix(m, ct.rgb, (0.6 * hatch + 0.08) * (1.0 - ct.a * 0.9));
  ivec2 cell = ivec2(floor(w / CELL));
  vec4 pa = texelFetch(uPropTexA, cell & (CELLS - 1), 0);
  if (pa.w > 0.5) {
    vec2 c = (vec2(cell) + 0.5) * CELL + pa.xy;
    m = mix(m, INK_SEPIA, smoothstep(1.7, 1.2, length(w - c)) * 0.55);
  }
  for (int i = 0; i < MAX_BLIPS; i++) {
    if (i >= uBlipCount) break;
    float bd = length((uBlips[i].xy - w) / uMapRect.w);
    float s = uBlips[i].w;
    m = mix(m, INK_DARK, smoothstep(s + 2.0 * dpr, s + 1.0 * dpr, bd));
    m = mix(m, blipColor(uBlips[i].z), smoothstep(s + 0.6 * dpr, s - 0.2 * dpr, bd));
  }
  vec2 north = vec2(dot(vec2(0.0, -1.0), mapR), dot(vec2(0.0, -1.0), mapF)) * (uMapRect.z - 9.0 * dpr);
  float nd = length(d - north);
  m = mix(m, PAPER, smoothstep(8.5 * dpr, 7.5 * dpr, nd));
  m = mix(m, INK_SEPIA, smoothstep(8.5 * dpr, 7.5 * dpr, nd) * smoothstep(6.0 * dpr, 7.0 * dpr, nd));
  vec2 nq = (d - north) / (3.4 * dpr);
  float nGlyph = (abs(nq.y) < 1.0 && abs(nq.x) < 1.0) ? min(abs(abs(nq.x) - 0.8), abs(nq.x + nq.y * 0.8)) : 1.0;
  m = mix(m, INK_SEPIA, smoothstep(0.34, 0.2, nGlyph));
  vec2 face = vec2(-sin(uMapPlayer.z), cos(uMapPlayer.z));
  vec2 a = vec2(dot(off, vec2(face.y, -face.x)), dot(off, face)) / (uMapRect.w * uMapRect.z * 0.085);
  float arrow = max(abs(a.x) * 1.5 + a.y * 0.8 - 0.75, -a.y - 0.75 + abs(a.x) * 0.9);
  m = mix(m, INK_DARK, smoothstep(0.42, 0.18, arrow));
  m = mix(m, P_VERMILION, smoothstep(0.08, -0.1, arrow));
  return mix(col, m, smoothstep(uMapRect.z, uMapRect.z - 1.5, r));
}
`);

export class Minimap {
  constructor(worldTex) {
    this.worldTex = worldTex;
    this.blips = new Float32Array(RENDER.MAX_BLIPS * 4);
    this.scaled = new Float32Array(RENDER.MAX_BLIPS * 4);
    this.count = 0;
    this.rect = [0, 0, 0, 0.6];
    this.player = [0, 0, 0];
  }
  clear() { this.count = 0; }
  add(x, z, kind, size = 2.4) {
    if (this.count >= RENDER.MAX_BLIPS) return;
    this.blips.set([x, z, kind, size], this.count++ * 4);
  }
  bind(p, frame, height) {
    const dpr = frame.dpr, [cx, cy, r, upp] = this.rect;
    p.tex('uHeightTex', this.worldTex.height).tex('uColorTex', this.worldTex.color).tex('uPropTexA', this.worldTex.propsA);
    p.set('uMapRect', [cx * dpr, height - cy * dpr, r * dpr, upp / dpr]).set('uMapPlayer', this.player);
    const scaled = this.scaled;
    scaled.set(this.blips);
    for (let i = 0; i < this.count; i++) scaled[i * 4 + 3] *= dpr;
    p.set('uBlips', scaled).set('uBlipCount', this.count);
  }
}
