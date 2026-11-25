import { Program, drawFullscreen, bindScreen } from '../gl.js';
import { FULLSCREEN_VS } from '../glsl/common.js';
import '../glsl/lighting.js';
import { glsl } from '../shaderlib.js';

const INK_FS = glsl`
in vec2 vUv;
out vec4 oEdge;
uniform sampler2D uGbuf;
uniform vec2 uTexel;
#include <common>
#include <frame>

float family(float id) { return id < 0.08 ? step(0.0, id) * 0.02 : id; }

void main() {
  vec4 gc = texture(uGbuf, vUv);
  vec4 n[4];
  n[0] = texture(uGbuf, vUv - vec2(uTexel.x, 0.0)); n[1] = texture(uGbuf, vUv + vec2(uTexel.x, 0.0));
  n[2] = texture(uGbuf, vUv - vec2(0.0, uTexel.y)); n[3] = texture(uGbuf, vUv + vec2(0.0, uTexel.y));
  float fc = family(gc.w);
  vec3 n0 = octDecode(gc.xy);
  float mean = 0.0, sil = 0.0, fold = 0.0, far = 0.0;
  for (int i = 0; i < 4; i++) {
    mean += n[i].z * 0.25;
    far = max(far, n[i].z);
    float fn = family(n[i].w);
    bool differ = abs(fn - fc) > 0.004;
    bool behind = n[i].z < gc.z * 0.985;
    bool level = abs(n[i].z - gc.z) <= gc.z * 0.015;
    if (differ && (behind || (level && fn > fc))) sil = 1.0;
    fold = max(fold, 1.0 - dot(n0, octDecode(n[i].xy)));
  }
  float crease = smoothstep(0.02, 0.06, abs(mean - gc.z) * 4.0 / max(gc.z, 1.0)) * step(mean, gc.z);
  fold = smoothstep(0.35, 0.8, fold) * step(0.08, gc.w);
  float line = max(max(crease, sil), fold * 0.85);
  if (gc.z > 5000.0 && far > 5000.0) line = 0.0;

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanFov.x) + uCamUp * (ndc.y * uTanFov.y));
  float t = min(gc.z, far);
  vec3 p = uCamPos + rd * t;
  float fade = (1.0 - 0.55 * smoothstep(30.0, 100.0, t)) * (1.0 - smoothstep(VIEW_DIST * 0.7, VIEW_DIST * 0.95, length(p.xz - uFocus.xz)));
  oEdge = vec4(line, fract(gc.w * 37.0), fade, 1.0);
}
`;

const FINAL_FS = glsl`
in vec2 vUv;
out vec4 oColor;
uniform sampler2D uLay, uGbuf, uMark, uSheet, uEdge, uEnt, uEntAux;
uniform vec2 uRes;
uniform vec2 uInner;
uniform float uHurt, uFade;
#include <common>
#include <frame>
#include <pencil>
#include <minimap>

vec2 sheetAt(vec2 uv) {
  vec2 st = uv * uInner - 0.5;
  ivec2 i = ivec2(floor(st)), hi = ivec2(uInner) - 1;
  vec2 f = fract(st);
  vec2 a = texelFetch(uSheet, clamp(i, ivec2(0), hi), 0).rg, b = texelFetch(uSheet, clamp(i + ivec2(1, 0), ivec2(0), hi), 0).rg;
  vec2 c = texelFetch(uSheet, clamp(i + ivec2(0, 1), ivec2(0), hi), 0).rg, d = texelFetch(uSheet, clamp(i + ivec2(1, 1), ivec2(0), hi), 0).rg;
  vec2 near = f.x < 0.5 ? (f.y < 0.5 ? a : c) : (f.y < 0.5 ? b : d);
  float tol = near.x * 0.04;
  a = abs(a.x - near.x) > tol ? near : a; b = abs(b.x - near.x) > tol ? near : b;
  c = abs(c.x - near.x) > tol ? near : c; d = abs(d.x - near.x) > tol ? near : d;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float grassTufts(vec2 uv, float amount, float pen) {
  if (amount < 0.05) return 0.0;
  vec2 g = uv / 0.85;
  vec2 cell = floor(g);
  vec2 r = hash22(cell);
  if (r.x > amount * 0.24) return 0.0;
  vec2 q = (g - cell - vec2(0.2 + 0.6 * r.y, 0.12 + 0.3 * fract(r.x * 7.7))) * 0.85;
  float m = 0.0;
  for (int k = -1; k <= 1; k++) {
    float lean = float(k) * 0.55 + (r.y - 0.5) * 0.5;
    float h = 0.15 + 0.13 * fract(r.x * 13.0 + float(k) * 0.37);
    vec2 b = vec2(lean * h, h);
    float tt = clamp(dot(q, b) / dot(b, b), 0.0, 1.0);
    m = max(m, (1.0 - smoothstep(pen * 0.5, pen, length(q - b * tt))) * mix(1.0, 0.5, tt));
  }
  return m;
}

float waveLines(vec2 uv, float amount, float pen) {
  if (amount < 0.05) return 0.0;
  vec2 g = vec2((uv.x + uTime * 0.12) / 1.7, uv.y / 0.55);
  vec2 cell = floor(g);
  vec2 r = hash22(cell);
  if (r.x > 0.34 * amount) return 0.0;
  vec2 q = (g - cell - 0.5) * vec2(1.7, 0.55);
  float y = 0.03 * sin(q.x * 13.0 + r.y * 6.0);
  return (1.0 - smoothstep(pen * 0.5, pen, abs(q.y - y))) * step(abs(q.x), 0.28 + 0.3 * r.y);
}

vec3 drawLays(vec3 page, vec3 rd, float sheet, vec3 right, vec3 up, vec3 fwd, bool sky, float dpr) {
  vec2 uv;
  if (sky) {
    uv = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0))) * 8.0;
    sheet = 8.0;
  } else {
    uv = paperCoords(uCamPos + rd * (sheet / max(dot(rd, fwd), 0.2)), right, up);
  }
  vec2 lod = pencilLod(sheet);
  float pen = uPencil.x * sheet * 1.5 * dpr;

  float kind0 = texture(uMark, vUv).a;
  float row = floor((dot(uv, vec2(-sin(SLANT), cos(SLANT)))) / (PITCH0 * exp2(lod.x)) + 0.5);
  float ends = (hash11(row * exp2(lod.x) * 0.913 + 4.2) - 0.42) * mix(2.6, 6.5, saturate(kind0)) * dpr;
  vec2 at = vUv + vec2(cos(SLANT), sin(SLANT)) * ends / uRes;
  vec4 lay = texture(uLay, at);
  vec4 mark = texture(uMark, at);
  float soft = step(0.5, mark.a);

  vec3 col = page;
  float base = pencilLay(uv, lod, lay.a * uFade, soft, SLANT, 0.0);
  col = layOn(col, lay.rgb, base);
  float chroma = max(lay.r, max(lay.g, lay.b)) - min(lay.r, min(lay.g, lay.b));
  float shadeCover = mark.r * mix(0.56, 0.82, smoothstep(0.12, 0.4, chroma)) * uFade;
  float shade = mix(pencilLay(uv, lod, shadeCover, 0.0, SLANT - 0.105, 5.0), pencilLay(uv, lod, shadeCover, 1.0, SLANT - 0.105, 5.0), 0.5);
  col = shadeOn(col, shadowPencil(lay.rgb), shade);

  vec3 inkLeaf = mix(INK_LEAF, INK_DARK, uNight * 0.6);
  col = inkOn(col, inkLeaf, grassTufts(uv, mark.b, pen) * 0.66 * uFade);
  col = inkOn(col, mix(INK_WET, INK_DARK, uNight * 0.5), waveLines(uv, saturate(mark.a - 1.0), pen) * 0.7 * uFade);
  return col;
}

void main() {
  vec2 px = vUv * uRes;
  float dpr = uPencil.w;
  vec3 page = paperSheet(px);

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanFov.x) + uCamUp * (ndc.y * uTanFov.y));
  vec2 sheet = sheetAt(vUv);
  bool sky = texture(uGbuf, vUv).z > 5000.0;
  vec3 col = drawLays(page, rd, sheet.x, uPaperRight, uPaperUp, uPaperFwd, sky, dpr);
  if (uPaperMix > 0.004) col = mix(col, drawLays(page, rd, sheet.y, uPaperRightB, uPaperUpB, uPaperFwdB, sky, dpr), uPaperMix);

  vec2 wob = (vec2(vnoise(px * 0.045 / dpr), vnoise(px * 0.045 / dpr + 9.0)) - 0.5) * 2.4 * dpr / uRes;
  vec2 h = 0.5 / uInner;
  vec4 ed = 0.25 * (texture(uEdge, vUv + wob + vec2(h.x, h.y)) + texture(uEdge, vUv + wob + vec2(-h.x, h.y)) +
                    texture(uEdge, vUv + wob + vec2(h.x, -h.y)) + texture(uEdge, vUv + wob + vec2(-h.x, -h.y)));
  float line = smoothstep(0.3, 0.5, ed.r);
  vec2 off = vec2(1.9, -1.4) * dpr / uRes;
  float again = smoothstep(0.3, 0.5, texture(uEdge, vUv + wob * 1.7 + off).r) * step(0.74, vnoise(px * 0.011 / dpr + 3.0)) * 0.4;
  float pressure = mix(0.55, 0.95, vnoise(px * 0.028 / dpr + ed.g * 40.0));
  float marks = smoothstep(0.28, 0.5, texture(uMark, vUv + wob).g);
  vec3 ink = mix(INK_SEPIA, INK_DARK, uNight * 0.7);
  col = inkOn(col, ink, marks * 0.6 * pressure * uFade);
  col = inkOn(col, ink, max(line, again) * pressure * ed.b * uFade);

  vec4 e = texture(uEnt, vUv);
  if (e.a > 0.003) {
    vec4 aux = texture(uEntAux, vUv);
    vec2 gt = 1.0 / uInner;
    float sd = texture(uGbuf, vUv).z;
    sd = max(sd, max(texture(uGbuf, vUv + vec2(gt.x, 0.0)).z, texture(uGbuf, vUv - vec2(gt.x, 0.0)).z));
    sd = max(sd, max(texture(uGbuf, vUv + vec2(0.0, gt.y)).z, texture(uGbuf, vUv - vec2(0.0, gt.y)).z));
    float hidden = step(sd + 0.05 + 0.006 * sd, aux.r);
    vec3 shown = mix(col * (1.0 - e.a) + e.rgb, mix(col, page, e.a), 1.0 - uFade);
    vec3 ghost = inkOn(col, INK_SOFT, aux.b * aux.g * 0.8);
    col = mix(shown, ghost, hidden);
  }

  vec2 q = vUv - 0.5;
  float hurt = uHurt * smoothstep(0.56, 0.86, length(q));
  if (hurt > 0.01) col = layOn(col, P_VERMILION, pencilLay(px / uRes.y * 6.0, vec2(1.0, 0.3), hurt * 0.4, 0.0, SLANT, 9.0));

  col = drawMinimap(col, px, page);
  oColor = vec4(col, 1.0);
}
`;

export class PostChain {
  constructor(gl) {
    this.gl = gl;
    this.ink = new Program(gl, 'ink', FULLSCREEN_VS, INK_FS);
    this.final = new Program(gl, 'final', FULLSCREEN_VS, FINAL_FS);
  }

  runInk(targets, applyFrame) {
    const gl = this.gl, p = this.ink.use();
    targets.edge.bind();
    applyFrame(p);
    p.tex('uGbuf', targets.scene.textures[1]);
    p.set('uTexel', [1 / targets.scene.width, 1 / targets.scene.height]);
    drawFullscreen(gl);
  }

  runFinal(targets, frame, width, height, minimap, applyFrame) {
    const gl = this.gl, p = this.final.use();
    bindScreen(gl, width, height);
    applyFrame(p);
    p.tex('uLay', targets.scene.textures[0]).tex('uGbuf', targets.scene.textures[1]).tex('uMark', targets.scene.textures[2])
      .tex('uSheet', targets.scene.textures[3]).tex('uEdge', targets.edge.textures[0]).tex('uEnt', targets.ent.textures[0]).tex('uEntAux', targets.ent.textures[1]);
    p.set('uRes', [width, height]).set('uInner', [targets.scene.width, targets.scene.height])
      .set('uHurt', frame.look.hurt).set('uFade', frame.look.fade);
    minimap.bind(p, frame, height);
    drawFullscreen(gl);
  }
}
