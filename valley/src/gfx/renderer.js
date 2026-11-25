import { GREAT_TREE } from './greattree.js';
import { RENDER } from '../config.js';
import { clamp } from '../core/math.js';

const PAPER_TURN = 0.3;
import { LEAF_PALETTE } from '../world/biomes.js';
import { createContext, Target } from './gl.js';
import './glsl/common.js';
import { WorldTextures } from './worldTextures.js';
import { WorldPass } from './passes/world.js';
import { EntityPass, ARCHETYPES } from './passes/entities.js';
import { FxPass } from './passes/fx.js';
import { PostChain } from './passes/post.js';
import { Minimap } from './passes/minimap.js';
import './archetypes/humanoid.js';
import './archetypes/critters.js';
import './archetypes/missiles.js';

export class Renderer {
  constructor(canvas, world, opts = {}) {
    this.canvas = canvas;
    const { gl } = createContext(canvas);
    this.gl = gl;
    this.worldTex = new WorldTextures(gl, world);
    this.minimap = new Minimap(this.worldTex);
    this.worldPass = new WorldPass(gl);
    this.quality = opts.lite ? 'low' : 'high';
    this.worldPass.program(this.quality);
    this.toWarm = null;
    this.entityPass = new EntityPass(gl);
    this.fxPass = new FxPass(gl);
    this.post = new PostChain(gl);
    this.targets = {
      scene: new Target(gl, [{}, { filter: 'nearest', precise: true }, {}, { filter: 'nearest', precise: true }]),
      edge: new Target(gl, [{}]),
      ent: new Target(gl, [{}, { filter: 'nearest' }], true),
    };
    this.vao = gl.createVertexArray();
    this.leafPal = new Float32Array(LEAF_PALETTE.flat());
    this.pencil = new Float32Array(4);
    this.paperAnchor = new Float32Array(3);
    this.paper = { a: null, b: null, mix: 0, fade: 0, still: 0, last: null };
    this.scale = opts.lite ? RENDER.SCALE_LITE : RENDER.SCALE_START;
    this.perf = { ema: 16.7, gpu: 0, timer: 0, calm: 0, futile: 0, lastDown: 0, hold: 0 };
    this.gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null;
    this.timing = false;
    this.size = { cssW: 1, cssH: 1, dpr: 1, width: 1, height: 1 };
    this.frameFn = (p) => this.applyFrame(p);
    this.steady = false;
  }

  setWorld(world) {
    this.worldTex.setWorld(world);
  }

  resize(cssW, cssH, dpr) {
    const s = this.size;
    s.cssW = cssW; s.cssH = cssH; s.dpr = dpr;
    s.width = Math.round(cssW * dpr); s.height = Math.round(cssH * dpr);
    if (this.canvas.width !== s.width || this.canvas.height !== s.height) {
      this.canvas.width = s.width; this.canvas.height = s.height;
    }
    const iw = Math.round(cssW * this.scale), ih = Math.round(cssH * this.scale);
    this.targets.scene.resize(iw, ih);
    this.targets.edge.resize(iw, ih);
    const edpr = Math.min(dpr, RENDER.ENTITY_DPR_MAX);
    this.targets.ent.resize(Math.round(cssW * edpr), Math.round(cssH * edpr));
  }

  adapt(dtMs) {
    const p = this.perf;
    if (dtMs > 100) return;
    p.ema += (dtMs - p.ema) * 0.08;
    p.timer += dtMs;
    if (p.timer < 700) return;
    p.timer = 0;
    let next = this.scale;
    if (this.gpuTimer) {
      if (p.gpu > 19 && this.scale <= RENDER.SCALE_MIN + 0.001) this.quality = 'low';
      if (p.gpu > 13) next -= p.gpu > 20 ? 0.12 : 0.05;
      else if (p.gpu > 0 && p.gpu < 8.5) next += 0.05;
    } else if (p.ema > 21.5) {
      if (p.ema > 30 && this.scale <= RENDER.SCALE_MIN + 0.001) this.quality = 'low';
      if (p.lastDown && p.lastDown - p.ema < 1) { if (++p.futile >= 2) { next = RENDER.SCALE_START; p.hold = 30; } }
      else { p.futile = 0; next -= 0.06; }
      p.lastDown = p.ema;
    } else if (p.ema < 17.6 && ++p.calm >= 5) { next += 0.05; p.calm = 0; p.lastDown = 0; }
    if (p.hold > 0) { p.hold--; next = this.scale; }
    next = clamp(next, RENDER.SCALE_MIN, RENDER.SCALE_MAX);
    if (Math.abs(next - this.scale) > 0.001) {
      this.scale = next;
      this.resize(this.size.cssW, this.size.cssH, this.size.dpr);
    }
  }

  warm() {
    if (!this.toWarm) this.toWarm = [...ARCHETYPES.keys()];
    const id = this.toWarm.pop();
    if (id) this.entityPass.program(id);
    else this.fxPass.program();
    return !this.toWarm.length && !id;
  }

  beginTiming() {
    const gl = this.gl, ext = this.gpuTimer;
    if (!ext) return;
    if (this.query) {
      if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(this.query, gl.QUERY_RESULT) / 1e6;
        this.perf.gpu += (ms - this.perf.gpu) * (this.perf.gpu ? 0.15 : 1);
      }
      gl.deleteQuery(this.query);
      this.query = null;
    }
    this.query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, this.query);
    this.timing = true;
  }
  endTiming() {
    if (!this.timing) return;
    this.gl.endQuery(this.gpuTimer.TIME_ELAPSED_EXT);
    this.timing = false;
  }

  applyFrame(p) {
    const f = this.frame, c = f.camera, e = f.env;
    p.set('uCamPos', c.pos).set('uCamRight', c.right).set('uCamUp', c.up).set('uCamFwd', c.fwd).set('uTanFov', c.tan);
    p.set('uFocus', f.focus).set('uTime', f.time).set('uReveal', f.reveal);
    p.set('uSunDir', e.keyDir).set('uSunDisk', e.sunDir).set('uMoonDisk', e.moonDir);
    p.set('uNight', e.night).set('uGold', e.gold).set('uCloud', e.cloud).set('uWind', e.wind);
    p.set('uRockCol', e.rockCol).set('uLeafPal', this.leafPal);
    const gt = GREAT_TREE;
    p.set('uGTB', gt.bound).set('uGTLa', gt.la).set('uGTLb', gt.lb).set('uGTF', gt.f).set('uGTNL', gt.nl).set('uGTNF', gt.nf).set('uGTM', gt.form);
    p.set('uLightPos', f.lightPos).set('uLightCol', f.lightCol).set('uLightCount', f.lightCount);
    p.set('uPencil', this.pencil).set('uPaperAnchor', this.paperAnchor);
    const pa = this.paper.a, pb = this.paper.b || this.paper.a;
    p.set('uPaperRight', pa.right).set('uPaperUp', pa.up).set('uPaperFwd', pa.fwd);
    p.set('uPaperRightB', pb.right).set('uPaperUpB', pb.up).set('uPaperFwdB', pb.fwd).set('uPaperMix', this.paper.mix);
  }

  holdPaper(cam, dt) {
    const P = this.paper;
    const copy = (c) => ({ right: [...c.right], up: [...c.up], fwd: [...c.fwd] });
    if (!P.a) { P.a = copy(cam); P.last = [...cam.fwd]; return; }
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const turn = (u, v) => Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
    const speed = turn(cam.fwd, P.last) / Math.max(dt, 1e-4);
    P.last = [...cam.fwd];
    P.still = speed < 0.03 ? P.still + dt : 0;
    if (P.b) {
      P.mix += dt / P.fade;
      if (P.mix >= 1) { P.a = P.b; P.b = null; P.mix = 0; }
      return;
    }
    const off = Math.max(turn(cam.fwd, P.a.fwd), turn(cam.right, P.a.right));
    if (off > PAPER_TURN) {
      const lead = Math.min(PAPER_TURN * 0.6, speed * 0.3);
      const k = off > 1e-4 ? lead / off : 0;
      const ahead = { right: [0, 0, 0], up: [0, 0, 0], fwd: [0, 0, 0] };
      for (const axis of ['right', 'fwd']) {
        let n = 0;
        for (let i = 0; i < 3; i++) { ahead[axis][i] = cam[axis][i] + (cam[axis][i] - P.a[axis][i]) * k; n += ahead[axis][i] ** 2; }
        n = Math.sqrt(n);
        for (let i = 0; i < 3; i++) ahead[axis][i] /= n;
      }
      const r = ahead.right, f = ahead.fwd, d = dot(r, f);
      let n = 0;
      for (let i = 0; i < 3; i++) { r[i] -= f[i] * d; n += r[i] ** 2; }
      n = Math.sqrt(n);
      for (let i = 0; i < 3; i++) r[i] /= n;
      ahead.up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      P.b = ahead; P.mix = 0; P.fade = 0.2;
    } else if (off > 0.012 && P.still > 0.3) {
      P.b = copy(cam); P.mix = 0; P.fade = 0.45;
    }
  }

  render(frame) {
    const gl = this.gl, t = this.targets, s = this.size;
    this.holdPaper(frame.camera, Math.max(0, frame.time - (this.lastTime ?? frame.time)));
    this.lastTime = frame.time;
    this.frame = frame;
    frame.dpr = s.dpr;
    this.pencil[0] = 2 * frame.camera.tan[1] / s.height;
    this.pencil[1] = 4.6 * s.dpr;
    this.pencil[2] = this.steady ? 0 : Math.floor(frame.time * 6);
    this.pencil[3] = s.dpr;
    this.paperAnchor[0] = Math.floor(frame.focus[0] / 64) * 64;
    this.paperAnchor[2] = Math.floor(frame.focus[2] / 64) * 64;
    this.beginTiming();
    gl.bindVertexArray(this.vao);
    this.worldPass.render(t.scene, frame, this.worldTex, this.frameFn, this.quality);
    this.post.runInk(t, this.frameFn);
    this.entityPass.render(t.ent, frame, frame.batches, this.frameFn);
    this.fxPass.render(t.ent, frame, frame.fx.data, frame.fx.count, t.scene.textures[1]);
    gl.bindVertexArray(this.vao);
    this.post.runFinal(t, frame, s.width, s.height, this.minimap, this.frameFn);
    this.endTiming();
  }
}
