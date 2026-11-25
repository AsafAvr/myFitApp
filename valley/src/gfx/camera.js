import { clamp, damp, dampAngle, m4, smoothstep, v3 } from '../core/math.js';
import { RENDER } from '../config.js';

const LOOK_AHEAD = 1.5;

export class Camera {
  constructor() {
    this.target = [0, 0, 0];
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.8;
    this.distance = 15.5;
    this.goal = { yaw: this.yaw, pitch: this.pitch, distance: this.distance };
    this.fov = RENDER.FOV * Math.PI / 180;
    this.aspect = 1;
    this.pos = [0, 10, 10];
    this.right = [1, 0, 0]; this.up = [0, 1, 0]; this.fwd = [0, 0, -1];
    this.tan = [1, 1];
    this.view = new Float32Array(16); this.proj = new Float32Array(16); this.viewProj = new Float32Array(16);
    this.shake = 0;
    this.still = false;
    this.shift = 0;
    this.portrait = false;
  }

  rotate(dYaw, dPitch) {
    this.goal.yaw += dYaw;
    this.goal.pitch = clamp(this.goal.pitch + dPitch, 0.2, 1.35);
  }
  zoom(factor) {
    this.goal.distance = clamp(this.goal.distance * factor, 7, 42);
  }

  update(dt, target, aspect, groundAt) {
    this.aspect = aspect;
    this.yaw = dampAngle(this.yaw, this.goal.yaw, 12, dt);
    this.pitch = damp(this.pitch, this.goal.pitch, 12, dt);
    this.distance = damp(this.distance, this.goal.distance, 8, dt);
    for (let i = 0; i < 3; i++) this.target[i] = damp(this.target[i], target[i], 9, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = [Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp];
    let d = this.distance;
    const ahead = this.portrait ? -0.25 : LOOK_AHEAD * (1 - smoothstep(0.24, 0.62, this.pitch));
    const aim = [this.target[0] - this.right[0] * this.shift, this.target[1] + ahead, this.target[2] - this.right[2] * this.shift];
    this.pos = v3.add(aim, v3.scale(dir, d));
    if (groundAt) {
      const floor = groundAt(this.pos[0], this.pos[2]) + 1.2;
      if (this.pos[1] < floor) this.pos[1] = floor;
    }
    if (this.shake > 0 && !this.still) {
      const s = this.shake * this.shake * 0.35;
      this.pos[0] += (Math.random() - 0.5) * s; this.pos[1] += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.fwd = v3.norm(v3.sub(aim, this.pos));
    this.right = v3.norm(v3.cross(this.fwd, [0, 1, 0]));
    this.up = v3.cross(this.right, this.fwd);
    const ty = Math.tan(this.fov / 2);
    this.tan = [ty * aspect, ty];
    m4.view(this.view, this.pos, this.right, this.up, this.fwd);
    m4.perspective(this.proj, this.fov, aspect, 0.2, 600);
    m4.mul(this.viewProj, this.proj, this.view);
  }

  ray(nx, ny) {
    const r = this.right, u = this.up, f = this.fwd;
    return {
      origin: this.pos,
      dir: v3.norm([
        f[0] + r[0] * nx * this.tan[0] + u[0] * ny * this.tan[1],
        f[1] + r[1] * nx * this.tan[0] + u[1] * ny * this.tan[1],
        f[2] + r[2] * nx * this.tan[0] + u[2] * ny * this.tan[1],
      ]),
    };
  }

  project(x, y, z) {
    const m = this.viewProj;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.05) return null;
    return {
      x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5,
      y: 0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5,
      w,
    };
  }
}
