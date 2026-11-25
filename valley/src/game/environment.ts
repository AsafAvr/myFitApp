import { smoothstep, v3 } from '../core/math.js';
import type { Vec3 } from './types';

export interface Env {
  hour: number; night: number; gold: number; cloud: number; wind: [number, number];
  keyDir: Vec3; sunDir: Vec3; moonDir: Vec3; rockCol: Vec3;
}

export function createEnv(): Env {
  return {
    hour: 12, night: 0, gold: 0, cloud: 0.36, wind: [0.8, 0.45],
    keyDir: [0.4, 0.8, 0.3], sunDir: [0.4, 0.8, 0.3], moonDir: [-0.4, 0.6, -0.3],
    rockCol: [0.59, 0.56, 0.52],
  };
}

export function updateEnv(env: Env, hour: number, rockTint: Vec3): Env {
  env.hour = hour;
  const d = (hour - 5.5) / 15;
  const ang = d * Math.PI;
  const up = d >= 0 && d <= 1;
  env.sunDir = v3.norm([Math.cos(ang) * 0.9, up ? Math.sin(ang) * 1.05 : -0.3, up ? 0.42 * Math.cos(ang * 0.5) + 0.2 : 0.4]) as Vec3;
  const sy = up ? env.sunDir[1] : -0.3;
  const m = ((hour + 24 - 20.5) % 24) / 9;
  env.moonDir = v3.norm([-Math.cos(m * Math.PI) * 0.8, Math.max(0.08, Math.sin(m * Math.PI)) * 0.9 + 0.2, -0.45]) as Vec3;

  env.night = 1 - smoothstep(-0.08, 0.12, sy);
  env.gold = (1 - smoothstep(0.1, 0.5, sy)) * (1 - env.night);
  const src = env.night > 0.5 ? env.moonDir : env.sunDir;
  env.keyDir = v3.norm([src[0], Math.max(src[1], 0.34), src[2]]) as Vec3;
  env.rockCol = rockTint;
  return env;
}
