export function hashInt(x, y, seed) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash01 = (x, y, seed) => hashInt(x, y, seed) / 4294967296;

const GX = [1, -1, 1, -1, 1.4142, -1.4142, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1.4142, -1.4142];

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const h00 = hashInt(xi, yi, seed) & 7, h10 = hashInt(xi + 1, yi, seed) & 7;
  const h01 = hashInt(xi, yi + 1, seed) & 7, h11 = hashInt(xi + 1, yi + 1, seed) & 7;
  const n00 = GX[h00] * xf + GY[h00] * yf;
  const n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
  const n01 = GX[h01] * xf + GY[h01] * (yf - 1);
  const n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

export function fbm2(x, y, octaves, seed = 0, lacunarity = 2.03, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x, y, seed + i * 131);
    norm += amp;
    x *= lacunarity; y *= lacunarity; amp *= gain;
  }
  return sum / norm;
}

export function ridged2(x, y, octaves, seed = 0) {
  let amp = 1, sum = 0, norm = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x, y, seed + i * 71));
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n;
    x *= 2.1; y *= 2.1; amp *= 0.5;
  }
  return sum / norm;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
