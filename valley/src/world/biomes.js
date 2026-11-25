import { smoothstep } from '../core/math.js';

export const BIOMES = [];
const byId = new Map();

export function registerBiome(def) {
  def.index = BIOMES.length;
  def.snow = def.snow || 0;
  def.leaf = def.leaf || [0];
  BIOMES.push(def);
  byId.set(def.id, def);
  return def;
}
export const biomeById = (id) => byId.get(id);

export const LEAF_PALETTE = [
  [0.455, 0.659, 0.353],
  [0.910, 0.643, 0.188],
  [0.910, 0.588, 0.588],
  [0.330, 0.533, 0.463],
  [0.588, 0.698, 0.471],
  [0.878, 0.361, 0.275],
  [0.957, 0.804, 0.376],
  [0.376, 0.620, 0.502],
  [0.700, 0.790, 0.470],
  [0.530, 0.650, 0.510],
  [0.800, 0.520, 0.560],
  [0.600, 0.730, 0.740],
];

const band = (v, lo, hi, soft = 0.08) => smoothstep(lo - soft, lo + soft, v) * (1 - smoothstep(hi - soft, hi + soft, v));

registerBiome({
  id: 'meadow', name: 'Larkmeadow',
  score: () => 0.62,
  ground: [0.455, 0.659, 0.353], ground2: [0.588, 0.698, 0.471], rock: [0.588, 0.557, 0.518],
  grass: 1.0, sand: 0, flowers: 0.8, leaf: [0, 4, 6],
  props: [['tree', 0.02, 0.5], ['birch', 0.006, 0.08], ['bush', 0.03, 0.1, 0], ['rock', 0.012, 0.02], ['stump', 0.004, 0.02]],
  monsters: [['sproutling', 6], ['puffcap', 3], ['bristlehog', 2]],
  particles: 'pollen',
});

registerBiome({
  id: 'grove', name: 'Petalwood',
  score: (c) => 0.5 + (c.magic - 0.66) * 4.5,
  ground: [0.50, 0.68, 0.42], ground2: [0.62, 0.72, 0.50], rock: [0.82, 0.64, 0.59],
  grass: 1.0, sand: 0, flowers: 1.0, leaf: [2, 2, 10, 4],
  props: [['tree', 0.1, 0.55], ['birch', 0.02, 0.06, 8], ['bush', 0.04, 0.1, 2], ['rock', 0.01, 0.02]],
  monsters: [['wisp', 4], ['sproutling', 3], ['puffcap', 3]],
  variant: { prefix: 'Petal', pencil: [232, 150, 150] },
  particles: 'petals',
});

registerBiome({
  id: 'pinewood', name: 'Deepfir',
  score: (c) => 0.5 + (0.4 - c.temp) * 4 + (c.moist - 0.5) * 1.5 + smoothstep(8, 13, c.elev) * 0.5,
  ground: [0.455, 0.612, 0.541], ground2: [0.44, 0.58, 0.40], rock: [0.50, 0.52, 0.56],
  grass: 0.55, sand: 0, flowers: 0.15, leaf: [3, 3, 7],
  props: [['pine', 0.2, 0.75, 3], ['rock', 0.03, 0.03], ['bush', 0.02, 0.05, 7], ['mushroom', 0.01, 0.03], ['stump', 0.01, 0.03], ['deadtree', 0.005, 0.02]],
  monsters: [['bristlehog', 5], ['puffcap', 4], ['wisp', 2]],
  variant: { prefix: 'Fir', pencil: [86, 128, 112] },
  particles: 'pollen',
});

registerBiome({
  id: 'amberwood', name: 'Amberwood',
  score: (c) => 0.5 + (c.temp - 0.66) * 3.2 + (0.5 - c.moist) * 1.0,
  ground: [0.86, 0.76, 0.46], ground2: [0.69, 0.72, 0.45], rock: [0.69, 0.50, 0.33],
  grass: 0.85, sand: 0, flowers: 0.3, leaf: [1, 5, 6],
  props: [['tree', 0.07, 0.6], ['bush', 0.03, 0.08, 1], ['rock', 0.02, 0.02], ['stump', 0.01, 0.02], ['deadtree', 0.004, 0.01]],
  monsters: [['bristlehog', 5], ['sproutling', 3], ['cragling', 2]],
  variant: { prefix: 'Amber', pencil: [240, 158, 74] },
  particles: 'leaves',
});

registerBiome({
  id: 'shore', name: 'Saltreach',
  score: (c) => 0.5 + Math.min((1.15 - c.elev) * 1.8, 0.9) - smoothstep(0.66, 0.8, c.moist) * c.far * 0.9,
  ground: [0.886, 0.737, 0.510], ground2: [0.92, 0.82, 0.62], rock: [0.588, 0.557, 0.518],
  grass: 0.0, sand: 1, flowers: 0, leaf: [7],
  props: [['palm', 0.05, 0.1, 7], ['rock', 0.03, 0.03], ['bush', 0.01, 0.02, 7], ['reeds', 0.01, 0.02]],
  monsters: [['shellsnap', 6], ['sproutling', 1]],
  variant: { prefix: 'Tide', pencil: [70, 150, 150] },
  particles: 'pollen',
});

registerBiome({
  id: 'highland', name: 'Skyfell',
  score: (c) => 0.5 + (c.elev - 15) * 0.35,
  ground: [0.59, 0.66, 0.50], ground2: [0.588, 0.557, 0.518], rock: [0.52, 0.54, 0.60],
  grass: 0.5, sand: 0, flowers: 0.1, leaf: [3],
  props: [['rock', 0.10, 0.12], ['pine', 0.04, 0.18, 3], ['crystal', 0.012, 0.012], ['cairn', 0.012, 0.012]],
  monsters: [['cragling', 6], ['wisp', 2]],
  variant: { prefix: 'Crag', pencil: [112, 118, 140] },
  particles: 'snow',
});

registerBiome({
  id: 'wheat', name: 'Strawmere',
  score: (c) => 0.5 + band(c.temp, 0.46, 0.66) * band(c.moist, 0.3, 0.56) * band(c.wild, 0.0, 0.42) * c.far * 0.6 - smoothstep(6, 10, c.elev),
  ground: [0.93, 0.80, 0.42], ground2: [0.88, 0.70, 0.34], rock: [0.69, 0.50, 0.33],
  grass: 0.9, sand: 0, flowers: 0.35, leaf: [0, 6],
  props: [['haystack', 0.035, 0.05], ['fence', 0.03, 0.03], ['tree', 0.012, 0.1], ['scarecrow', 0.006, 0.006], ['bush', 0.01, 0.03, 6]],
  monsters: [['sproutling', 5], ['bristlehog', 4], ['puffcap', 1]],
  variant: { prefix: 'Straw', pencil: [232, 164, 48] },
  particles: 'pollen',
});

registerBiome({
  id: 'marsh', name: 'Reedmarsh',
  score: (c) => 0.5 + smoothstep(0.66, 0.8, c.moist) * (1 - smoothstep(3.5, 7, c.elev)) * c.far * 1.1,
  ground: [0.50, 0.63, 0.50], ground2: [0.60, 0.66, 0.44], rock: [0.50, 0.52, 0.50],
  grass: 0.8, sand: 0, flowers: 0.2, leaf: [9, 9, 7],
  props: [['reeds', 0.16, 0.2], ['willow', 0.05, 0.3], ['deadtree', 0.02, 0.04], ['mushroom', 0.02, 0.04], ['bush', 0.02, 0.05, 9], ['stump', 0.01, 0.02]],
  monsters: [['shellsnap', 4], ['wisp', 3], ['puffcap', 3]],
  variant: { prefix: 'Marsh', pencil: [96, 140, 120] },
  particles: 'fireflies',
});

registerBiome({
  id: 'frost', name: 'Hoarwood',
  score: (c) => 0.5 + smoothstep(0.3, 0.16, c.temp) * c.far * 0.9,
  ground: [0.72, 0.80, 0.86], ground2: [0.62, 0.72, 0.80], rock: [0.52, 0.56, 0.66],
  grass: 0.1, sand: 0, flowers: 0, snow: 0.92, leaf: [11, 3],
  props: [['pine', 0.1, 0.5, 11], ['deadtree', 0.02, 0.04], ['rock', 0.03, 0.03], ['crystal', 0.012, 0.02], ['stump', 0.005, 0.02]],
  monsters: [['cragling', 4], ['wisp', 3], ['bristlehog', 3]],
  variant: { prefix: 'Frost', pencil: [176, 198, 222] },
  particles: 'snow',
});

registerBiome({
  id: 'heath', name: 'Roseheath',
  score: (c) => 0.5 + band(c.wild, 0.58, 0.8) * band(c.temp, 0.3, 0.7, 0.1) * c.far * 0.6 - smoothstep(0.62, 0.75, c.moist) * 0.3,
  ground: [0.78, 0.60, 0.62], ground2: [0.62, 0.68, 0.50], rock: [0.60, 0.56, 0.58],
  grass: 0.75, sand: 0, flowers: 0.6, leaf: [10, 8],
  props: [['bush', 0.12, 0.2, 10], ['stone', 0.01, 0.01], ['cairn', 0.012, 0.012], ['rock', 0.03, 0.03], ['birch', 0.01, 0.12, 8], ['deadtree', 0.005, 0.01]],
  monsters: [['wisp', 4], ['sproutling', 3], ['bristlehog', 3]],
  variant: { prefix: 'Heath', pencil: [206, 124, 136] },
  particles: 'petals',
});

registerBiome({
  id: 'capwood', name: 'Capwood',
  score: (c) => 0.5 + smoothstep(0.34, 0.2, c.magic) * smoothstep(0.42, 0.6, c.moist) * c.far * 0.9,
  ground: [0.42, 0.56, 0.56], ground2: [0.50, 0.58, 0.46], rock: [0.46, 0.50, 0.58],
  grass: 0.6, sand: 0, flowers: 0.1, leaf: [7, 3],
  props: [['bigcap', 0.12, 0.6], ['mushroom', 0.06, 0.1], ['stump', 0.02, 0.03], ['bush', 0.02, 0.04, 7], ['rock', 0.015, 0.02]],
  monsters: [['puffcap', 7], ['sproutling', 2], ['wisp', 2]],
  variant: { prefix: 'Gloom', pencil: [84, 108, 156] },
  particles: 'fireflies',
});

registerBiome({
  id: 'birchwood', name: 'Silverbirch',
  score: (c) => 0.5 + band(c.temp, 0.28, 0.46) * band(c.moist, 0.34, 0.6) * band(c.magic, 0.36, 0.6) * c.far * 0.5,
  ground: [0.66, 0.76, 0.50], ground2: [0.74, 0.78, 0.52], rock: [0.62, 0.60, 0.58],
  grass: 1.0, sand: 0, flowers: 0.7, leaf: [8, 6, 0],
  props: [['birch', 0.12, 0.7], ['bush', 0.03, 0.06, 8], ['rock', 0.012, 0.02], ['stump', 0.01, 0.02], ['mushroom', 0.006, 0.02]],
  monsters: [['sproutling', 5], ['puffcap', 3], ['wisp', 2]],
  variant: { prefix: 'Birch', pencil: [214, 204, 172] },
  particles: 'leaves',
});

registerBiome({
  id: 'cinder', name: 'Cinderfell',
  score: (c) => 0.5 + smoothstep(0.76, 0.9, c.wild) * smoothstep(0.4, 0.6, c.temp) * c.far * 1.2,
  ground: [0.50, 0.42, 0.42], ground2: [0.62, 0.46, 0.38], rock: [0.34, 0.33, 0.38],
  grass: 0.2, sand: 0, flowers: 0, leaf: [5, 1],
  props: [['deadtree', 0.08, 0.2], ['rock', 0.08, 0.1], ['campfire', 0.012, 0.012], ['cairn', 0.02, 0.02], ['crystal', 0.006, 0.01]],
  monsters: [['cragling', 6], ['wisp', 3], ['bristlehog', 2]],
  variant: { prefix: 'Cinder', pencil: [122, 62, 44] },
  particles: 'leaves',
});

registerBiome({
  id: 'crypt', name: 'Crypt', hidden: true,
  score: () => -10,
  ground: [0.70, 0.65, 0.58], ground2: [0.62, 0.59, 0.54], rock: [0.56, 0.53, 0.50],
  grass: 0, sand: 0, flowers: 0, props: [], monsters: [['sproutling', 1]], particles: 'dust',
});
registerBiome({
  id: 'cave', name: 'Cavern', hidden: true,
  score: () => -10,
  ground: [0.62, 0.54, 0.44], ground2: [0.55, 0.50, 0.43], rock: [0.50, 0.48, 0.46],
  grass: 0, sand: 0.3, flowers: 0, props: [], monsters: [['sproutling', 1]], particles: 'dust',
});
