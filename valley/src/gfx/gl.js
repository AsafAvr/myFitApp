import { assemble } from './shaderlib.js';

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('This game needs WebGL2, which this browser does not provide.');
  const caps = {
    floatTargets: !!gl.getExtension('EXT_color_buffer_float'),
    halfFloatTargets: !!gl.getExtension('EXT_color_buffer_half_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
  };
  if (!caps.floatTargets && !caps.halfFloatTargets) throw new Error('This GPU cannot render to float textures.');
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.caps = caps;
  return { gl, caps };
}

function compile(gl, type, source, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '';
    const lines = source.split('\n');
    const around = [...log.matchAll(/ERROR: \d+:(\d+)/g)].slice(0, 4).map((m) => {
      const n = +m[1];
      return lines.slice(Math.max(0, n - 3), n + 1).map((l, i) => `${Math.max(1, n - 2) + i}: ${l}`).join('\n');
    }).join('\n---\n');
    throw new Error(`Shader "${label}" failed to compile:\n${log}\n${around}`);
  }
  return sh;
}

const SETTERS = {
  0x1406: (gl, l, v, n) => (n > 1 || v.length ? gl.uniform1fv(l, v) : gl.uniform1f(l, v)),
  0x8b50: (gl, l, v) => gl.uniform2fv(l, v),
  0x8b51: (gl, l, v) => gl.uniform3fv(l, v),
  0x8b52: (gl, l, v) => gl.uniform4fv(l, v),
  0x1404: (gl, l, v, n) => (n > 1 || v.length ? gl.uniform1iv(l, v) : gl.uniform1i(l, v)),
  0x8b5c: (gl, l, v) => gl.uniformMatrix4fv(l, false, v),
  0x8b5b: (gl, l, v) => gl.uniformMatrix3fv(l, false, v),
};

export class Program {
  constructor(gl, name, vs, fs, defines) {
    this.gl = gl;
    this.name = name;
    const p = (this.handle = gl.createProgram());
    const v = compile(gl, gl.VERTEX_SHADER, assemble(vs, defines), name + ' (vertex)');
    const f = compile(gl, gl.FRAGMENT_SHADER, assemble(fs, defines), name + ' (fragment)');
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program "${name}" failed to link: ${gl.getProgramInfoLog(p)}`);
    gl.deleteShader(v); gl.deleteShader(f);
    this.uniforms = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace(/\[0\]$/, '');
      this.uniforms[key] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    this.unit = 0;
  }
  use() {
    this.gl.useProgram(this.handle);
    this.unit = 0;
    return this;
  }
  set(name, value) {
    const u = this.uniforms[name];
    if (u) SETTERS[u.type](this.gl, u.loc, value, u.size);
    return this;
  }
  tex(name, texture) {
    const u = this.uniforms[name];
    if (!u) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + this.unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.loc, this.unit++);
    return this;
  }
}

export function createTexture(gl, { width, height, internal, format, type, filter = gl.NEAREST, wrap = gl.CLAMP_TO_EDGE, data = null }) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

export class Target {
  constructor(gl, attachments, depth = false) {
    this.gl = gl;
    this.spec = attachments;
    this.useDepth = depth;
    this.width = 0; this.height = 0;
    this.textures = [];
    this.fbo = null;
  }
  resize(width, height) {
    const gl = this.gl;
    width = Math.max(1, width | 0); height = Math.max(1, height | 0);
    if (width === this.width && height === this.height) return false;
    this.dispose();
    this.width = width; this.height = height;
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.textures = this.spec.map((a, i) => {
      const precise = a.precise && gl.caps && gl.caps.floatTargets;
      const tex = createTexture(gl, {
        width, height, internal: precise ? gl.RGBA32F : gl.RGBA16F, format: gl.RGBA, type: precise ? gl.FLOAT : gl.HALF_FLOAT,
        filter: a.filter === 'nearest' || precise ? gl.NEAREST : gl.LINEAR,
      });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      return tex;
    });
    if (this.useDepth) {
      this.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Render target incomplete: 0x' + status.toString(16));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }
  bind(count = this.textures.length) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawBuffers(this.textures.map((_, i) => (i < count ? gl.COLOR_ATTACHMENT0 + i : gl.NONE)));
  }
  dispose() {
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    if (this.depth) gl.deleteRenderbuffer(this.depth);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.textures = []; this.depth = null; this.fbo = null;
  }
}

export function bindScreen(gl, width, height) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
}

export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
