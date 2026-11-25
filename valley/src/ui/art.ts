import type { ItemInstance } from '../game/rules/items';
import type { ClassId, Rarity, Vec3 } from '../game/types';
import { BASE } from '../game/content/items';
import { CLASSES } from '../game/content/classes';
import { RARITY_COLORS, type ColorVision } from '../settings/settings';

type Rand = () => number;
interface Pt { x: number; y: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Mat { base: string; deep: string }
interface Run { pts: Pt[]; closed: boolean }
type Prim =
  | { t: 'shape'; d: string; m: DOMMatrix; mat: Mat; shade: number; pen: number }
  | { t: 'line'; d: string; m: DOMMatrix; w: number; color: string; alpha: number };
interface Kit { r: Rand; rarity: Rarity; rc: string; cloth: Mat; trim: Mat; gem: Mat; prims: Prim[]; stack: DOMMatrix[] }
interface Unit { gap: number; lw: number; pen: number; wob: number; mis: number; minW: number }

const INK = '#3b2414';
const PAPER = '#f6f0e1';
const SHINE = '#fffaf0';
const SLANT = -1.08;
const LIGHT = { x: 0.62, y: 0.78 };

function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const pick = <T,>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length)];
const flat = (hex: string): Mat => ({ base: hex, deep: shade(hex, -0.45) });
const lighter = (m: Mat): string => shade(m.base, 0.45);
const hexOf = (v: Vec3): string => '#' + v.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
const isFancy = (r: Rarity) => r === 'legendary' || r === 'unique';
const tint = (hex: string, a: number): string => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const STEEL: Mat = { base: '#b7c0cc', deep: '#5d6879' };
const IRON: Mat = { base: '#8f97a3', deep: '#474e5a' };
const WOOD: Mat = { base: '#c58e57', deep: '#70462a' };
const LEATHER: Mat = { base: '#a46d47', deep: '#523321' };
const GOLD: Mat = { base: '#e9bd48', deep: '#946618' };
const BRASS: Mat = { base: '#ccab55', deep: '#7a5d1c' };
const FLAME: Mat = { base: '#f2a04a', deep: '#c9501e' };
const EMBER: Mat = { base: '#ffe28c', deep: '#f2a04a' };
const FROST: Mat = { base: '#abcde8', deep: '#5a83ad' };
const LEAF: Mat = { base: '#88b268', deep: '#4b7838' };
const RED: Mat = { base: '#d64634', deep: '#8c261b' };
const DYES = ['#b84a3a', '#4f6c9e', '#5e8c4e', '#c49434', '#885478', '#469696', '#4a4d5e', '#c8b48a'];

const top = (k: Kit): DOMMatrix => k.stack[k.stack.length - 1];
function group(k: Kit, m: DOMMatrix, draw: () => void): void { k.stack.push(top(k).multiply(m)); draw(); k.stack.pop(); }
const rot = (deg: number, cx = 50, cy = 50) => new DOMMatrix().translate(cx, cy).rotate(deg).translate(-cx, -cy);
const grow = (s: number, cx = 50, cy = 50) => new DOMMatrix().translate(cx, cy).scale(s).translate(-cx, -cy);
const move = (x: number, y: number) => new DOMMatrix().translate(x, y);

function shape(k: Kit, d: string, mat: Mat, amount = 0.3, pen = 2): void { k.prims.push({ t: 'shape', d, m: top(k), mat, shade: amount, pen }); }
function line(k: Kit, d: string, w = 1.4, color = INK, alpha = 1): void { k.prims.push({ t: 'line', d, m: top(k), w, color, alpha }); }
const ring = (cx: number, cy: number, rx: number, ry = rx) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
function disc(k: Kit, cx: number, cy: number, rad: number, mat: Mat, amount = 0.25, pen = 2): void { shape(k, ring(cx, cy, rad), mat, amount, pen); }
function gemAt(k: Kit, cx: number, cy: number, rad: number): void {
  shape(k, `M${cx} ${cy - rad}L${cx + rad} ${cy}L${cx} ${cy + rad}L${cx - rad} ${cy}Z`, k.gem, 0.1, 1.4);
  line(k, `M${cx - rad * 0.45} ${cy - rad * 0.15}l${rad * 0.35} ${-rad * 0.35}`, 1.1, SHINE, 0.9);
}

function sword(k: Kit, big: boolean): void {
  const r = k.r;
  const w = (big ? 7.5 : 5.5) + r() * 2, tip = big ? 6 : 14, gy = big ? 64 : 62;
  shape(k, `M${50 - w} ${gy}L${50 - w * 0.85} ${tip + 12}L50 ${tip}L${50 + w * 0.85} ${tip + 12}L${50 + w} ${gy}Z`, STEEL, 0.16);
  line(k, `M50 ${gy - 4}L50 ${tip + 14}`, 1.1, INK, 0.45);
  line(k, `M${50 - w * 0.5} ${gy - 6}L${50 - w * 0.42} ${tip + 16}`, 1.4, SHINE, 0.85);
  const guard = Math.floor(r() * 3);
  if (guard === 0) shape(k, `M33 ${gy}h34v6h-34z`, k.trim, 0.25);
  else if (guard === 1) shape(k, `M30 ${gy - 3}q20 14 40 0l-2 7q-18 8 -36 0z`, k.trim, 0.25);
  else shape(k, `M30 ${gy - 6}l8 6h24l8 -6l-3 11h-34z`, k.trim, 0.25);
  const gl = big ? 22 : 16;
  shape(k, `M46.5 ${gy + 6}h7v${gl}h-7z`, LEATHER, 0.2);
  for (let y = gy + 9; y < gy + 6 + gl; y += 4) line(k, `M46.5 ${y}l7 2`, 1);
  const py = gy + 6 + gl + 4;
  if (r() < 0.5) disc(k, 50, py, 4.5, k.trim);
  else shape(k, `M50 ${py - 6}l5 6l-5 6l-5 -6z`, k.trim, 0.2);
  if (k.rarity !== 'common' && k.rarity !== 'magic') gemAt(k, 50, gy + 3, 3.5);
}

function dagger(k: Kit): void {
  const r = k.r;
  const w = 5 + r() * 2;
  shape(k, `M${50 - w} 60L${50 - w * 0.6} 30Q50 14 ${50 + w * 0.6} 30L${50 + w} 60Z`, STEEL, 0.16);
  line(k, 'M50 58L50 30', 1.1, INK, 0.45);
  line(k, `M${50 - w * 0.4} 56L${50 - w * 0.3} 32`, 1.3, SHINE, 0.85);
  if (r() < 0.5) shape(k, 'M37 60h26v5h-26z', k.trim, 0.2);
  else shape(k, 'M36 57q14 10 28 0l-2 7q-12 6 -24 0z', k.trim, 0.2);
  shape(k, 'M47 65h6v16h-6z', LEATHER, 0.2);
  line(k, 'M47 69l6 2M47 74l6 2M47 79l6 2', 1);
  disc(k, 50, 85, 4, k.trim);
  if (k.rarity !== 'common') gemAt(k, 50, 62.5, 3);
}

function axe(k: Kit, big: boolean): void {
  const r = k.r;
  const head = big ? 10 : 22;
  shape(k, `M47 ${head}h6v${90 - head}h-6z`, WOOD, 0.25);
  for (let y = 74; y < 88; y += 4) line(k, `M47 ${y}l6 2`, 1);
  const kind = big ? 2 : Math.floor(r() * 2);
  if (kind === 0) {
    shape(k, 'M52 24q20 -8 26 6q-1 14 -7 24q-9 -7 -19 -9z', STEEL, 0.18);
    line(k, 'M72 28q4 11 -1 21', 1.3, SHINE, 0.85);
  } else if (kind === 1) {
    shape(k, 'M52 22q18 -10 28 6q3 12 -4 24q-7 -9 -24 -11z', STEEL, 0.18);
    line(k, 'M76 30q2 9 -2 17', 1.3, SHINE, 0.85);
  } else {
    shape(k, 'M53 14q22 -8 28 8q2 14 -6 26q-8 -8 -22 -10zM47 14q-22 -8 -28 8q-2 14 6 26q8 -8 22 -10z', STEEL, 0.18);
    line(k, 'M76 20q4 10 -1 20M24 20q-4 10 1 20', 1.3, SHINE, 0.85);
  }
  shape(k, `M45.5 ${head - 2}h9v9h-9z`, k.trim, 0.2);
  if (isFancy(k.rarity)) gemAt(k, 50, head + 3, 3);
}

function mace(k: Kit): void {
  const r = k.r;
  shape(k, 'M47 34h6v56h-6z', WOOD, 0.25);
  line(k, 'M47 76l6 2M47 80l6 2M47 84l6 2', 1);
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = a + Math.PI / 8;
      d += `${i ? 'L' : 'M'}${50 + Math.cos(a) * 18} ${24 + Math.sin(a) * 18}L${50 + Math.cos(b) * 9} ${24 + Math.sin(b) * 9}`;
    }
    shape(k, d + 'Z', STEEL, 0.18);
  } else if (kind === 1) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      shape(k, `M${50 + Math.cos(a - 0.28) * 11} ${24 + Math.sin(a - 0.28) * 11}L${50 + Math.cos(a) * 20} ${24 + Math.sin(a) * 20}L${50 + Math.cos(a + 0.28) * 11} ${24 + Math.sin(a + 0.28) * 11}Z`, STEEL, 0.1, 1.4);
    }
    disc(k, 50, 24, 12, IRON);
  } else {
    disc(k, 50, 24, 14, IRON);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; disc(k, 50 + Math.cos(a) * 8.5, 24 + Math.sin(a) * 8.5, 2.2, k.trim, 0, 1.2); }
    line(k, 'M42 16q4 -4 9 -4', 1.3, SHINE, 0.8);
  }
  shape(k, 'M44.5 34h11v5h-11z', k.trim, 0.2);
}

function staff(k: Kit): void {
  const r = k.r;
  shape(k, 'M48 26h5l-1 68h-3z', WOOD, 0.25);
  line(k, 'M50.5 40q1 20 0 50', 1, INK, 0.3);
  shape(k, 'M46.5 36h8v7h-8z', k.cloth, 0.2);
  line(k, 'M48 43q-4 8 -2 14M53 43q3 6 2 12', 1.4, k.cloth.base);
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    line(k, 'M44 28q-7 -10 2 -17M57 28q7 -10 -2 -17', 4.4);
    line(k, 'M44 28q-7 -10 2 -17M57 28q7 -10 -2 -17', 2.4, WOOD.base);
    disc(k, 50.5, 16, 7.5, k.gem, 0.1);
    line(k, 'M47 13q3 -2 6 0', 1.3, SHINE, 0.9);
  } else if (kind === 1) {
    shape(k, 'M50.5 2l8 14l-8 12l-8 -12z', k.gem, 0.1);
    line(k, 'M50.5 4v22M43.5 16h14', 0.9, INK, 0.35);
    shape(k, 'M44.5 26h12l-2 5h-8z', k.trim, 0.2);
  } else {
    const hook = 'M51 28q14 -4 10 -16q-4 -10 -14 -6q-8 4 -2 10q4 3 6 -1';
    line(k, hook, 5);
    line(k, hook, 2.8, WOOD.base);
    disc(k, 52, 13, 3.6, k.gem, 0, 1.4);
  }
}

function wand(k: Kit): void {
  const r = k.r;
  shape(k, 'M48 36h4l-0.5 54h-3z', WOOD, 0.25);
  shape(k, 'M47 74h6v14h-6z', LEATHER, 0.2);
  line(k, 'M47 78l6 2M47 83l6 2', 1);
  if (r() < 0.5) {
    let d = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rad = i % 2 ? 6 : 14; d += `${i ? 'L' : 'M'}${50 + Math.cos(a) * rad} ${24 + Math.sin(a) * rad}`; }
    shape(k, d + 'Z', k.gem, 0.1);
  } else {
    shape(k, 'M50 9l7 14l-7 13l-7 -13z', k.gem, 0.1);
    shape(k, 'M45 34h10l-2 4h-6z', k.trim, 0.2);
  }
  for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2; disc(k, 50 + Math.cos(a) * 20, 24 + Math.sin(a) * 18, 1.6, k.gem, 0, 0.8); }
}

function bow(k: Kit): void {
  const r = k.r;
  const cx = 70 + r() * 10, gx = 20 + cx / 2;
  const limb = `M40 8Q${cx} 50 40 92`;
  line(k, 'M40 8L40 92', 1.3, INK, 0.9);
  line(k, limb, 9.6);
  line(k, limb, 6.4, WOOD.base);
  line(k, limb, 2, lighter(WOOD), 0.9);
  line(k, 'M40 8q6 -5 12 -4M40 92q6 5 12 4', 4.4);
  line(k, 'M40 8q6 -5 12 -4M40 92q6 5 12 4', 2, WOOD.deep);
  shape(k, `M${gx - 5} 42h10v16h-10z`, LEATHER, 0.25);
  line(k, `M${gx - 5} 46l10 2M${gx - 5} 51l10 2M${gx - 5} 56l10 2`, 1);
  if (k.rarity !== 'common') line(k, 'M47 22q4 6 6 12M47 78q4 -6 6 -12', 1.8, k.trim.base);
  if (isFancy(k.rarity)) gemAt(k, gx, 50, 3.5);
}

function shield(k: Kit, kind = Math.floor(k.r() * 3), emblem = Math.floor(k.r() * 5)): void {
  const d = kind === 0 ? 'M22 16h56v28q0 30 -28 44q-28 -14 -28 -44z' : kind === 1 ? 'M50 12a38 38 0 1 0 0.01 0z' : 'M50 8l28 18q0 40 -28 66q-28 -26 -28 -66z';
  shape(k, d, k.cloth, 0.22, 2.4);
  group(k, grow(0.88), () => line(k, d, 4.5, k.trim.base));
  group(k, grow(0.8), () => line(k, d, 1, INK, 0.5));
  const c = flat(lighter(k.trim));
  if (emblem === 0) shape(k, 'M32 54l18 -14l18 14l-4 6l-14 -10l-14 10z', c, 0.15, 1.4);
  else if (emblem === 1) shape(k, 'M46 26h8v18h16v8h-16v22h-8v-22h-16v-8h16z', c, 0.15, 1.4);
  else if (emblem === 2) {
    disc(k, 50, 48, 9, c, 0.1, 1.6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(k, `M${50 + Math.cos(a) * 12} ${48 + Math.sin(a) * 12}L${50 + Math.cos(a) * 18} ${48 + Math.sin(a) * 18}`, 2.2); }
  } else if (emblem === 3) shape(k, 'M50 30l5 12l13 1l-10 8l3 13l-11 -7l-11 7l3 -13l-10 -8l13 -1z', c, 0.15, 1.4);
  else {
    shape(k, 'M50 26q16 14 9 30q-3 8 -9 10q-6 -2 -9 -10q-7 -16 9 -30z', FLAME, 0.12, 1.4);
    shape(k, 'M50 42q7 7 3 14q-1 4 -3 5q-2 -1 -3 -5q-4 -7 3 -14z', EMBER, 0, 1.1);
  }
  if (kind === 1) disc(k, 50, 50, 5, STEEL, 0, 1.6);
}

function focus(k: Kit): void {
  const arms = 'M40 74q-18 -16 -10 -42q2 -6 6 -8M60 74q18 -16 10 -42q-2 -6 -6 -8';
  line(k, arms, 5.4);
  line(k, arms, 3, k.trim.base);
  shape(k, 'M36 74q14 -10 28 0l-4 14h-20z', k.trim, 0.25);
  disc(k, 50, 47, 16, k.gem, 0.1);
  line(k, 'M42 41q7 -9 16 -2', 1.7, SHINE, 0.85);
  line(k, 'M39 54q11 8 22 0', 1, INK, 0.35);
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.6; line(k, `M${50 + Math.cos(a) * 20} ${47 + Math.sin(a) * 20}l${Math.cos(a) * 5} ${Math.sin(a) * 5}`, 1.6, k.gem.base, 0.8); }
}

function quiver(k: Kit): void {
  const r = k.r;
  for (let i = 0; i < 4; i++) {
    const x = 42 + i * 6 + r() * 2;
    line(k, `M${x} 30L${x - 3} 10`, 1.8, WOOD.deep);
    shape(k, `M${x - 3} 10l-4 -3l1 9zM${x - 3} 10l4 -3l-1 9z`, i % 2 ? k.cloth : RED, 0.1, 1);
  }
  shape(k, 'M36 28h30l-4 62h-22z', LEATHER, 0.25, 2.2);
  shape(k, 'M35 25h32v7h-32z', k.trim, 0.2);
  line(k, 'M40 46h22M41 72h19', 1.4, INK, 0.55);
  line(k, 'M66 32q16 22 -2 56', 2.6, LEATHER.deep);
  if (k.rarity !== 'common') disc(k, 51, 59, 4, k.trim, 0, 1.4);
}

function helm(k: Kit): void {
  const r = k.r;
  const kind = k.rarity === 'common' ? 0 : k.rarity === 'magic' ? (r() < 0.5 ? 0 : 1) : r() < 0.3 ? 1 : 2;
  if (kind === 0) {
    shape(k, 'M24 78q-4 -46 26 -60q30 14 26 60l-11 4q-2 -28 -15 -32q-13 4 -15 32z', k.cloth, 0.25, 2.2);
    line(k, 'M50 18q-6 20 0 32', 1.2, INK, 0.4);
    shape(k, 'M28 76q22 12 44 0l-2 9q-20 9 -40 0z', k.cloth, 0.35);
    line(k, 'M36 30q-6 14 -6 30', 1.2, SHINE, 0.5);
    return;
  }
  if (kind === 1) {
    shape(k, 'M24 62q0 -40 26 -42q26 2 26 42z', LEATHER, 0.25, 2.2);
    shape(k, 'M20 60h60v8h-60z', LEATHER, 0.35);
    line(k, 'M50 20v40M36 26q-4 14 -4 34M64 26q4 14 4 34', 1.2, INK, 0.5);
    disc(k, 50, 40, 4, k.trim, 0, 1.4);
    return;
  }
  shape(k, 'M24 68q-2 -46 26 -50q28 4 26 50l-8 12h-36z', STEEL, 0.16, 2.2);
  shape(k, 'M47 40h6v36h-6z', IRON, 0.2);
  shape(k, 'M27 46h46v6h-46z', k.trim, 0.2);
  line(k, 'M34 59h10M56 59h10', 3.4);
  line(k, 'M34 26q-6 10 -6 22', 1.3, SHINE, 0.8);
  if (isFancy(k.rarity)) {
    shape(k, 'M30 24l6 -14l6 10l8 -14l8 14l6 -10l6 14q-20 -6 -40 0z', k.trim, 0.2);
    gemAt(k, 50, 32, 4);
  }
}

function chest(k: Kit, robe: boolean): void {
  const r = k.r;
  if (robe) {
    shape(k, 'M36 12q14 8 28 0l14 14l-6 10l-4 -4v60h-36v-60l-4 4l-6 -10z', k.cloth, 0.25, 2.2);
    shape(k, 'M42 12q8 14 16 0l-4 22h-8z', flat(k.cloth.deep), 0.3);
    shape(k, 'M32 52h36v7h-36z', k.trim, 0.2);
    line(k, 'M50 59v33', 1.4, INK, 0.5);
    line(k, 'M34 90h32', 2.6, k.trim.base);
    line(k, 'M40 66q-2 12 0 22M60 66q2 12 0 22', 1, INK, 0.35);
    return;
  }
  const kind = Math.floor(r() * 3);
  shape(k, 'M34 14l8 -4q8 6 16 0l8 4l14 12l-6 14l-6 -4v52h-40v-52l-6 4l-6 -14z', kind === 2 ? STEEL : LEATHER, 0.25, 2.2);
  shape(k, 'M42 10q8 10 16 0l-2 8q-6 6 -12 0z', k.cloth, 0.2, 1.4);
  if (kind === 0) for (let y = 26; y < 66; y += 8) line(k, `M46 ${y}l8 4M54 ${y}l-8 4`, 1.4);
  else if (kind === 1) for (let y = 30; y < 68; y += 10) for (let x = 36; x < 66; x += 8) disc(k, x, y, 1.6, k.trim, 0, 1);
  else for (let y = 30; y < 68; y += 9) line(k, `M30 ${y}q20 4 40 0`, 1.2, INK, 0.6);
  shape(k, 'M28 70h44v7h-44z', LEATHER, 0.3);
  shape(k, 'M46.5 69h7v9h-7z', k.trim, 0.1, 1.2);
  line(k, 'M32 20q-4 4 -8 10', 1.2, SHINE, 0.6);
}

function gloves(k: Kit): void {
  const plated = k.rarity !== 'common' && k.r() < 0.5;
  shape(k, 'M32 88v-30l-4 -16q0 -6 5 -4l5 14v-30q1 -6 6 -5l2 26v-30q2 -5 6 -4l1 30l2 -26q3 -5 6 -3l-1 28l4 -18q4 -4 6 1l-4 28l-4 14v25z', plated ? STEEL : LEATHER, 0.25, 2.2);
  shape(k, 'M29 72h36v18h-36z', k.cloth, 0.25);
  line(k, 'M29 81h36', 1, INK, 0.5);
  if (plated) line(k, 'M38 50l18 2M37 58l20 1', 1.4, INK, 0.6);
  if (k.rarity !== 'common') disc(k, 47, 81, 3, k.trim, 0, 1.2);
}

function legs(k: Kit): void {
  shape(k, 'M30 16h40l4 76h-16l-8 -52l-8 52h-16z', k.cloth, 0.25, 2.2);
  shape(k, 'M29 13h42v9h-42z', LEATHER, 0.3);
  shape(k, 'M46 13h8v9h-8z', k.trim, 0.1, 1.2);
  line(k, 'M40 26l-4 60M60 26l4 60', 1, INK, 0.3);
  if (k.rarity !== 'common') shape(k, 'M30 52h14v11h-14zM56 52h14v11h-14z', STEEL, 0.16, 1.4);
}

function boots(k: Kit): void {
  const r = k.r;
  shape(k, 'M34 10h22v52l20 12q4 4 0 10h-46l-2 -10z', LEATHER, 0.25, 2.2);
  shape(k, 'M28 84h50v6h-50z', IRON, 0.2);
  shape(k, 'M32 9h26v12h-26z', r() < 0.5 ? k.cloth : LEATHER, 0.3);
  line(k, 'M36 40h18M36 50h18', 2.2, k.trim.deep);
  disc(k, 52, 40, 2, k.trim, 0, 1);
  disc(k, 52, 50, 2, k.trim, 0, 1);
  line(k, 'M38 24q-2 16 0 34', 1.2, SHINE, 0.55);
}

function amulet(k: Kit): void {
  const r = k.r;
  line(k, 'M20 8Q50 70 80 8', 2.8);
  line(k, 'M20 8Q50 70 80 8', 1.4, lighter(k.trim));
  const kind = Math.floor(r() * 3);
  if (kind === 0) { shape(k, 'M50 38q15 18 0 46q-15 -28 0 -46z', k.trim, 0.2); gemAt(k, 50, 62, 7); }
  else if (kind === 1) { disc(k, 50, 62, 16, k.trim); disc(k, 50, 62, 9, k.gem, 0.1, 1.6); line(k, 'M45 57q3 -3 7 -2', 1.2, SHINE, 0.9); }
  else { shape(k, 'M50 40l15 22l-15 22l-15 -22z', k.trim, 0.2); gemAt(k, 50, 62, 7); }
  disc(k, 50, 39, 2.6, k.trim, 0, 1.2);
}

function band(k: Kit): void {
  const loop = ring(50, 62, 24, 16);
  line(k, loop, 11);
  line(k, loop, 7, k.trim.base);
  line(k, loop, 2, lighter(k.trim), 0.9);
  shape(k, 'M39 48h22l-3 -9h-16z', k.trim, 0.2);
  gemAt(k, 50, 35, 9);
}

const BIG = grow(1.1);

const DRAW: Record<string, (k: Kit) => void> = {
  sword: (k) => group(k, rot(38).multiply(move(0, -2)).multiply(BIG), () => sword(k, false)),
  greatsword: (k) => group(k, rot(38).multiply(move(0, -3)).multiply(new DOMMatrix().scale(1, 0.95)), () => sword(k, true)),
  dagger: (k) => group(k, rot(38).multiply(BIG), () => dagger(k)),
  axe: (k) => group(k, rot(32), () => axe(k, false)),
  greataxe: (k) => group(k, rot(32), () => axe(k, true)),
  mace: (k) => group(k, rot(32).multiply(BIG), () => mace(k)),
  staff: (k) => group(k, rot(30), () => staff(k)),
  wand: (k) => group(k, rot(34).multiply(BIG), () => wand(k)),
  bow: (k) => group(k, rot(30).multiply(move(2, 0)), () => bow(k)),
  quiver: (k) => group(k, rot(14), () => quiver(k)),
  shield: (k) => shield(k),
  chest: (k) => chest(k, false),
  robe: (k) => chest(k, true),
  ring: band,
  focus, helm, gloves, legs, boots, amulet,
};

function drawingOf(base: string): string {
  const b = BASE[base];
  if (!b) return 'ring';
  if (b.slot === 'chest') return b.id === 'robe' ? 'robe' : 'chest';
  if (b.slot === 'weapon' || b.slot === 'offhand') return b.type ?? 'sword';
  return b.slot;
}

let probe: SVGPathElement | null = null;
const runCache = new Map<string, Run[]>();

function runsOf(d: string): Run[] {
  const hit = runCache.get(d);
  if (hit) return hit;
  if (!probe) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(probe);
    document.body.appendChild(svg);
  }
  const runs: Run[] = [];
  for (const part of d.split(/(?=M)/)) {
    const sub = part.trim();
    if (!sub) continue;
    probe.setAttribute('d', sub);
    const len = probe.getTotalLength();
    const n = Math.max(6, Math.min(260, Math.ceil(len / 1.1)));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) { const p = probe.getPointAtLength((len * i) / n); pts.push({ x: p.x, y: p.y }); }
    runs.push({ pts, closed: /z\s*$/i.test(sub) });
  }
  if (runCache.size > 4000) runCache.clear();
  runCache.set(d, runs);
  return runs;
}

function noise(r: Rand): (t: number) => number {
  const tab = Array.from({ length: 64 }, () => r() * 2 - 1);
  return (t) => {
    const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
    const a = tab[((i % 64) + 64) % 64], b = tab[(((i + 1) % 64) + 64) % 64];
    return a + (b - a) * s;
  };
}

function penRun(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean, width: number, color: string, alpha: number, wob: number, r: Rand): void {
  const n = pts.length;
  if (n < 2) return;
  const bend = noise(r), press = noise(r);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    const off = wob * bend(i * 0.09);
    out.push({ x: pts[i].x - (ty / l) * off, y: pts[i].y + (tx / l) * off });
  }
  if (closed) {
    const extra = Math.min(n - 1, 2 + Math.floor(r() * 4));
    for (let i = 1; i <= extra; i++) out.push({ x: out[i].x + (r() - 0.5) * wob, y: out[i].y + (r() - 0.5) * wob });
  }
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const step = 6;
  for (let i = 0; i < out.length - 1; i += step) {
    ctx.globalAlpha = alpha * (0.84 + 0.16 * press(i * 0.05 + 7));
    ctx.lineWidth = width * (0.74 + 0.4 * (press(i * 0.04) * 0.5 + 0.5));
    ctx.beginPath();
    ctx.moveTo(out[i].x, out[i].y);
    for (let j = i + 1; j <= Math.min(out.length - 1, i + step); j++) ctx.lineTo(out[j].x, out[j].y);
    ctx.stroke();
  }
}

function lay(ctx: CanvasRenderingContext2D, box: Box, gap: number, angle: number, density: number, keep: (x: number, y: number) => number, color: string, alpha: number, width: number, r: Rand): void {
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const R = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2 + gap;
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  const seg = gap * 2.4;
  for (let s = -R; s <= R; s += gap) {
    if (r() > density) continue;
    const o = s + (r() - 0.5) * gap * 0.6;
    const bx = cx + nx * o, by = cy + ny * o;
    const path = paths[Math.floor(r() * 3)];
    let t = -R - r() * gap * 2, drawing = false;
    while (t < R) {
      const t2 = t + seg * (0.7 + r() * 0.6);
      const mid = (t + t2) / 2;
      if (keep(bx + dx * mid, by + dy * mid) > r()) {
        if (!drawing) path.moveTo(bx + dx * t, by + dy * t);
        path.lineTo(bx + dx * t2 + (r() - 0.5) * gap * 0.18, by + dy * t2 + (r() - 0.5) * gap * 0.18);
        drawing = true;
      } else drawing = false;
      t = t2;
    }
  }
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  paths.forEach((p, i) => { ctx.globalAlpha = alpha * (0.6 + i * 0.2); ctx.lineWidth = width * (0.8 + i * 0.22); ctx.stroke(p); });
}

function boxOf(runs: Run[]): Box {
  const b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (const run of runs) for (const p of run.pts) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); }
  return b;
}

function fill(ctx: CanvasRenderingContext2D, p: Extract<Prim, { t: 'shape' }>, box: Box, u: Unit, r: Rand): void {
  const path = new Path2D();
  path.addPath(new Path2D(p.d), p.m);
  ctx.save();
  ctx.translate(u.mis, u.mis * 0.8);
  ctx.clip(path);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = p.mat.base;
  ctx.fill(path);
  lay(ctx, box, u.gap, SLANT, 0.96, () => 0.93, p.mat.base, 0.92, u.lw, r);
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const ext = ((box.x1 - box.x0) * LIGHT.x + (box.y1 - box.y0) * LIGHT.y) / 2 || 1;
  const amount = 0.45 + p.shade;
  lay(ctx, box, u.gap * 1.12, SLANT + 0.16, 0.92, (x, y) => smooth(-0.2, 0.5, ((x - cx) * LIGHT.x + (y - cy) * LIGHT.y) / ext) * amount, p.mat.deep, 0.8, u.lw, r);
  ctx.restore();
}

function line2(a: Pt, b: Pt, n = 10): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

function backdrop(ctx: CanvasRenderingContext2D, vw: number, vh: number, k: Kit, u: Unit, r: Rand): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, vw, vh);
  const glow = { common: 0, magic: 0.55, rare: 0.7, legendary: 0.9, unique: 0.9 }[k.rarity];
  const cx = vw / 2, cy = vh * 0.47, R = Math.min(vw, vh) * 0.48;
  if (glow) {
    for (let i = 0; i < 5; i++) {
      const bx = cx + (r() - 0.5) * R * 0.25, by = cy + (r() - 0.5) * R * 0.25, br = R * (0.7 + r() * 0.35);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, tint(k.rc, 0.13 * glow));
      g.addColorStop(1, tint(k.rc, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    lay(ctx, { x0: 0, y0: 0, x1: vw, y1: vh }, u.gap * 1.1, SLANT, 1, (x, y) => glow * smooth(R * 0.95, R * 0.2, Math.hypot(x - cx, y - cy)), k.rc, 0.34, u.lw * 1.15, r);
  }
  if (isFancy(k.rarity)) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3 + r() * 0.12, r0 = R * 0.72, r1 = R * (i % 2 ? 0.86 : 0.96);
      penRun(ctx, line2({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 }, { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 }), false, u.pen * 0.6, k.rc, 0.45, u.wob, r);
    }
  }
  for (let i = 0; i < 4; i++) {
    const y = vh - 12 + i * 1.3, half = vw * (0.22 - i * 0.04) * (0.85 + r() * 0.3);
    penRun(ctx, line2({ x: cx - half, y }, { x: cx + half, y: y + (r() - 0.5) }), false, u.lw * 1.2, INK, 0.16, u.wob, r);
  }
}

function tooth(ctx: CanvasRenderingContext2D, vw: number, vh: number, r: Rand): void {
  const n = Math.floor((vw * vh) / 28);
  ctx.fillStyle = INK;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = 0.02 + r() * 0.05; const s = 0.3 + r() * 0.5; ctx.fillRect(r() * vw, r() * vh, s, s * (0.5 + r())); }
  ctx.fillStyle = PAPER;
  for (let i = 0; i < n * 0.6; i++) { ctx.globalAlpha = 0.2 + r() * 0.35; const s = 0.25 + r() * 0.45; ctx.fillRect(r() * vw, r() * vh, s, s); }
  ctx.globalAlpha = 1;
}

function unitFor(scale: number): Unit {
  const gap = Math.min(2.8, Math.max(1.25, scale * 1.6));
  return { gap: gap / scale, lw: (gap * 0.62) / scale, pen: Math.min(2.6, Math.max(0.95, scale * 1.4)) / scale, wob: 0.55, mis: 0.45, minW: 0.75 / scale };
}

function render(k: Kit, w: number, h: number, vw: number, vh: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  const scale = w / vw;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const u = unitFor(scale);
  const r = rng(seed ^ 0x9e3779b9);
  backdrop(ctx, vw, vh, k, u, r);
  for (const p of k.prims) {
    const runs = runsOf(p.d).map((run) => ({
      closed: run.closed,
      pts: run.pts.map((q) => { const t = p.m.transformPoint(new DOMPoint(q.x, q.y)); return { x: t.x, y: t.y }; }),
    }));
    if (p.t === 'shape') {
      fill(ctx, p, boxOf(runs), u, r);
      for (const run of runs) penRun(ctx, run.pts, run.closed, (u.pen * p.pen) / 2, INK, 1, u.wob, r);
      if (r() < 0.4) for (const run of runs) penRun(ctx, run.pts, run.closed, u.pen * p.pen * 0.22, INK, 0.32, u.wob * 1.8, r);
    } else {
      const lr = rng(hash(p.d) ^ seed);
      for (const run of runs) penRun(ctx, run.pts, false, Math.max(p.w, u.minW), p.color, p.alpha, u.wob * 0.8, lr);
    }
  }
  tooth(ctx, vw, vh, r);
  return cv;
}

function makeKit(r: Rand, rarity: Rarity, rc: string, cloth: Mat, trim: Mat, gem: Mat): Kit {
  return { r, rarity, rc, cloth, trim, gem, prims: [], stack: [new DOMMatrix()] };
}

const cache = new Map<string, HTMLCanvasElement>();
function remember(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  if (cache.size > 300) cache.clear();
  cache.set(key, made);
  return made;
}

export function itemArt(it: ItemInstance, vision: ColorVision, px: number): HTMLCanvasElement {
  return remember(`${it.uid}|${it.base}|${it.rarity}|${vision}|${px}`, () => {
    const r = rng(hash(it.uid + it.base));
    const rc = RARITY_COLORS[vision][it.rarity];
    const cloth = flat(it.rarity === 'unique' ? '#7a3e6e' : pick(r, DYES));
    const trim = isFancy(it.rarity) ? GOLD : it.rarity === 'rare' ? BRASS : IRON;
    const k = makeKit(r, it.rarity, rc, cloth, trim, flat(it.rarity === 'common' ? '#b9c1cc' : rc));
    (DRAW[drawingOf(it.base)] ?? DRAW.ring)(k);
    return render(k, px, px, 100, 100, hash(it.uid));
  });
}

function flame(k: Kit, x: number, y: number, s: number): void {
  group(k, move(x, y).multiply(new DOMMatrix().scale(s)), () => {
    shape(k, 'M0 -26q16 12 11 26q-3 8 -11 10q-8 -2 -11 -10q-5 -14 11 -26z', FLAME, 0.12, 1.6);
    shape(k, 'M0 -10q7 7 4 13q-1 4 -4 5q-3 -1 -4 -5q-3 -6 4 -13z', EMBER, 0, 1.2);
  });
}

const CLASS_ART: Record<ClassId, (k: Kit) => void> = {
  warden: (k) => {
    group(k, move(20, -2).multiply(rot(-32)), () => sword(k, false));
    group(k, move(10, 18).multiply(new DOMMatrix().scale(0.72)), () => shield(k, 0, 4));
    flame(k, 100, 76, 0.7);
  },
  emberwright: (k) => {
    group(k, move(6, 2).multiply(rot(-14)), () => staff(k));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4, x = 78 + Math.cos(a) * 22, y = 44 + Math.sin(a) * 26;
      if (i % 2) shape(k, `M${x} ${y - 5}l3.4 5l-3.4 5l-3.4 -5z`, FROST, 0.1, 1.2);
      else disc(k, x, y, 3.4, FLAME, 0, 1.4);
    }
    flame(k, 78, 54, 0.62);
  },
  strider: (k) => {
    group(k, move(18, 0).multiply(rot(-6)), () => bow(k));
    line(k, 'M28 50L104 50', 2.2, WOOD.deep);
    shape(k, 'M104 50l-9 -5v10z', STEEL, 0.1, 1.4);
    shape(k, 'M28 50l-7 -5l3 5l-3 5z', RED, 0.1, 1.2);
    shape(k, 'M90 84q4 -14 18 -14q-2 14 -18 14z', LEAF, 0.2, 1.4);
    line(k, 'M90 84l12 -9', 1, INK, 0.6);
  },
};

export function classArt(id: ClassId, w: number): HTMLCanvasElement {
  return remember(`class|${id}|${w}`, () => {
    const p = CLASSES[id].pencils;
    const k = makeKit(rng(hash(id)), 'legendary', hexOf(p[0]), flat(hexOf(p[0])), GOLD, flat(hexOf(p[1])));
    CLASS_ART[id](k);
    return render(k, w, Math.round((w * 100) / 120), 120, 100, hash(id));
  });
}

export { penRun, lay, tooth, rng as artRng, hash as artHash, shade as artShade, INK, PAPER, SLANT, LIGHT };
