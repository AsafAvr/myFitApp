const LEVELS = { master: 1, sfx: 1, music: 0.6, ambience: 0.55 };
const MAX_VOICES = { sfx: 24, chime: 16, music: 48, ambience: 16 };
const HEARING = 30;
const NEAR = 4;
const REPEAT_GAP = 0.035;
const REPEAT_GAPS = { step: 0.13, 'charge:dust': 0.1 };
const MAX_STAGGER = 0.12;
const TICK = 0.1;
const LOOKAHEAD = 0.5;
const MIN_GAIN = 0.0004;

const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);
const pitchClass = (n) => ((n % 12) + 12) % 12;
const fold = (midi, floor) => midi + 12 * Math.ceil((floor - midi) / 12);
const lookup = (table, key, fallback) => (Object.hasOwn(table, key) ? table[key] : fallback);

const MONSTER_VOICE = {
  sproutling: { freq: 820, type: 'triangle', bend: 1.3 },
  puffcap: { freq: 470, type: 'sine', bend: 0.72 },
  bristlehog: { freq: 250, type: 'sawtooth', bend: 1.22 },
  wisp: { freq: 1180, type: 'sine', bend: 1.45 },
  cragling: { freq: 165, type: 'square', bend: 0.8 },
  shellsnap: { freq: 610, type: 'triangle', bend: 1.12 },
};
const DEFAULT_VOICE = { freq: 600, type: 'triangle', bend: 1.2 };
const voiceOf = (m) => lookup(MONSTER_VOICE, m.defId, DEFAULT_VOICE);

const SKILL_SOUNDS = {
  emberbolt(k) {
    k.noise({ freq: 420, to: 1700, glide: 0.22, q: 0.9, attack: 0.05, hold: 0.05, decay: 0.4, gain: 0.13 });
    k.tone({ type: 'triangle', freq: 210, to: 95, attack: 0.02, decay: 0.4, gain: 0.08 });
  },
  mend(k) {
    for (const step of [0, 3, 5]) k.tone({ bus: 'chime', freq: k.key(step, 62), attack: 0.3, hold: 0.15, decay: 1.4, gain: 0.045 });
    k.bell(k.key(7, 62), { bus: 'chime', at: 0.3, decay: 1.2, gain: 0.04 });
  },
  galestep(k) {
    k.noise({ freq: 2100, to: 650, glide: 0.2, q: 0.7, attack: 0.03, decay: 0.3, gain: 0.1 });
  },
};

const BEHAVIOR_SOUNDS = {
  projectile(k, element) {
    if (element === 'physical') { k.noise({ freq: 2600, to: 900, glide: 0.12, q: 1.6, attack: 0.004, decay: 0.16, gain: 0.08 }); return; }
    k.noise({ freq: element === 'frost' ? 2400 : 500, to: element === 'frost' ? 900 : 1700, glide: 0.18, q: 0.9, attack: 0.04, decay: 0.32, gain: 0.1 });
    k.tone({ type: 'triangle', freq: element === 'storm' ? 660 : 240, to: element === 'storm' ? 990 : 110, decay: 0.3, gain: 0.06 });
  },
  nova(k, element) {
    k.noise({ freq: element === 'frost' ? 2600 : 900, to: 300, glide: 0.3, q: 0.7, attack: 0.01, decay: 0.5, gain: 0.12 });
    k.tone({ freq: 130, to: 70, decay: 0.4, gain: 0.1 });
  },
  buff(k) {
    for (const step of [0, 4, 7]) k.tone({ bus: 'chime', freq: k.key(step, 57), attack: 0.05, hold: 0.1, decay: 0.9, gain: 0.05 });
  },
  barrier(k) {
    k.bell(k.key(0, 57), { bus: 'chime', decay: 1.4, gain: 0.07 });
    k.noise({ filter: 'lowpass', freq: 900, to: 300, attack: 0.05, decay: 0.5, gain: 0.06 });
  },
  heal(k) { SKILL_SOUNDS.mend(k); },
  dash(k) { SKILL_SOUNDS.galestep(k); },
  leap(k) { k.noise({ freq: 700, to: 2200, glide: 0.35, q: 0.7, attack: 0.05, decay: 0.45, gain: 0.08 }); },
  chain(k) { k.noise({ filter: 'bandpass', freq: 3000, q: 2, attack: 0.003, decay: 0.2, gain: 0.08 }); },
  trap(k) { k.tone({ type: 'square', freq: 1200, to: 600, decay: 0.06, gain: 0.04 }); k.tone({ freq: 300, decay: 0.12, gain: 0.05, at: 0.05 }); },
  mark(k) { k.bell(k.key(9, 69), { bus: 'chime', decay: 1.2, gain: 0.05 }); },
  zone(k, element) { k.noise({ filter: 'lowpass', freq: element === 'fire' ? 1200 : 2400, to: 400, attack: 0.25, hold: 0.3, decay: 1.0, gain: 0.08 }); },
  blast(k) { k.noise({ freq: 400, to: 1400, glide: 0.3, q: 0.8, attack: 0.1, decay: 0.3, gain: 0.06 }); },
};

const UI_SOUNDS = new Set(['ui:click', 'deny', 'trade']);

const SOUNDS = {
  step(k, { entity, water }) {
    if (entity && entity.kind !== 'player') return;
    const v = rand(0.88, 1.14);
    if (water) {
      k.noise({ freq: 1500 * v, to: 650 * v, q: 1.1, attack: 0.012, decay: 0.3, gain: 0.055 });
      k.tone({ freq: 380 * v, to: 620 * v, glide: 0.05, decay: 0.1, gain: 0.025 });
    } else {
      k.noise({ filter: 'lowpass', freq: 620 * v, to: 260 * v, decay: 0.13, gain: 0.045 });
      k.tone({ freq: 92 * v, to: 58 * v, decay: 0.12, gain: 0.05 });
    }
  },

  swing(k, { heavy }) {
    const v = rand(0.92, 1.1);
    if (heavy) {
      k.noise({ freq: 320 * v, to: 1500 * v, glide: 0.2, q: 1.2, attack: 0.09, hold: 0.04, decay: 0.36, gain: 0.14 });
      k.tone({ freq: 130 * v, to: 70, attack: 0.05, decay: 0.4, gain: 0.08 });
    } else {
      k.noise({ freq: 600 * v, to: 2300 * v, glide: 0.12, q: 1.4, attack: 0.05, decay: 0.2, gain: 0.1 });
    }
  },

  damage: spatial((k, { target, crit }) => {
    const v = rand(0.92, 1.1);
    if (target && target.kind === 'player') {
      k.tone({ freq: 125 * v, to: 52, decay: 0.32, gain: 0.24 });
      k.noise({ filter: 'lowpass', freq: 380, to: 160, decay: 0.2, gain: 0.12 });
      return;
    }
    if (target && target.guard) {
      k.tone({ type: 'triangle', freq: 1180 * v, to: 900 * v, glide: 0.04, attack: 0.002, decay: 0.1, gain: 0.08 });
      k.noise({ freq: 3000, q: 2, attack: 0.002, decay: 0.05, gain: 0.06 });
      return;
    }
    k.noise({ freq: (crit ? 1700 : 1150) * v, q: 1.1, attack: 0.003, decay: 0.12, gain: crit ? 0.17 : 0.14 });
    k.tone({ type: 'triangle', freq: 230 * v, to: 120 * v, attack: 0.003, decay: 0.16, gain: 0.15 });
    if (crit) k.bell(k.key(3, 74), { decay: 0.5, gain: 0.05 });
    if (target && target.hp <= 0) k.tone({ freq: 104 * v, to: 46, attack: 0.004, decay: target.elite ? 0.55 : 0.3, gain: target.elite ? 0.2 : 0.13 });
  }, (p) => p.target),

  'monster:special': spatial((k, m) => {
    const voice = voiceOf(m), f = voice.freq * (m.elite ? 0.82 : 1);
    k.tone({ type: voice.type, cutoff: Math.min(2400, f * 3.5), freq: f * 0.62, to: f * 1.25, glide: 0.32, attack: 0.06, hold: 0.16, decay: 0.22, gain: 0.085 });
    k.noise({ freq: 500, to: 1900, glide: 0.34, q: 1.6, attack: 0.2, hold: 0.06, decay: 0.16, gain: 0.05 });
  }),

  slam: spatial((k, { heavy }) => {
    const v = rand(0.92, 1.08);
    k.tone({ freq: (heavy ? 88 : 112) * v, to: 40, decay: heavy ? 0.5 : 0.32, gain: heavy ? 0.26 : 0.17 });
    k.noise({ filter: 'lowpass', freq: heavy ? 700 : 900, to: 140, attack: 0.004, decay: heavy ? 0.45 : 0.28, gain: heavy ? 0.16 : 0.11 });
  }),

  'monster:shot': spatial((k, m) => {
    const f = voiceOf(m).freq * rand(0.95, 1.06);
    k.tone({ type: 'triangle', freq: f * 1.1, to: f * 0.55, glide: 0.14, attack: 0.004, decay: 0.2, gain: 0.07 });
    k.noise({ freq: 2400, to: 900, q: 1.2, attack: 0.004, decay: 0.12, gain: 0.05 });
  }),

  'shot:hit': spatial((k) => {
    k.noise({ filter: 'lowpass', freq: 1100, to: 300, attack: 0.004, decay: 0.2, gain: 0.09 });
    k.tone({ freq: 190, to: 95, decay: 0.14, gain: 0.07 });
  }),

  'hazard:cloud': spatial((k, { life }) => {
    k.tone({ freq: 240, to: 150, glide: 0.2, attack: 0.02, decay: 0.24, gain: 0.05 });
    k.noise({ freq: 2600, to: 1100, glide: 0.8, q: 0.7, attack: 0.18, hold: 0.25, decay: Math.min(1.6, (life || 2) * 0.5), gain: 0.05 });
  }),

  'charge:dust': spatial((k) => {
    const v = rand(0.9, 1.12);
    k.tone({ freq: 84 * v, to: 52 * v, decay: 0.11, gain: 0.075 });
    k.noise({ filter: 'lowpass', freq: 520 * v, to: 220, decay: 0.1, gain: 0.04 });
  }),

  guard: spatial((k) => {
    k.tone({ type: 'triangle', freq: 540, to: 410, glide: 0.04, attack: 0.002, decay: 0.09, gain: 0.09 });
    k.noise({ freq: 2800, q: 2, attack: 0.002, decay: 0.05, gain: 0.05 });
  }, (p) => p.entity),

  miss(k, { target, text }) {
    if (!target || target.kind !== 'player' || text !== 'Dodged') return;
    k.noise({ freq: 1500, to: 3000, glide: 0.1, q: 1.6, attack: 0.03, decay: 0.14, gain: 0.05 });
  },

  lowhealth(k) {
    for (const at of [0, 0.26]) k.tone({ freq: 74, to: 52, at, attack: 0.008, decay: 0.26, gain: at ? 0.13 : 0.17 });
  },

  'monster:alert': spatial((k, m) => {
    const voice = voiceOf(m), f = voice.freq * rand(0.94, 1.08) * (m.elite ? 0.82 : 1);
    const call = { type: voice.type, cutoff: Math.min(2600, f * 4), attack: 0.008, glide: 0.08 };
    k.tone({ ...call, freq: f, to: f * voice.bend, decay: 0.14, gain: 0.08 });
    k.tone({ ...call, freq: f * 1.19, to: f * 1.19 * voice.bend, at: 0.12, decay: 0.2, gain: 0.07 });
  }),

  'monster:strike': spatial((k, m) => {
    const voice = voiceOf(m), f = voice.freq * rand(0.9, 1.1);
    k.noise({ freq: 900, to: 420, q: 1, decay: 0.15, gain: 0.12 });
    k.tone({ type: voice.type, cutoff: 1400, freq: f * 0.6, to: f * 0.38, decay: 0.18, gain: 0.1 });
  }),

  'monster:died': spatial((k, m) => {
    const v = clamp(voiceOf(m).freq / 600, 0.75, 1.35) * rand(0.94, 1.06);
    k.tone({ freq: 430 * v, to: 150 * v, glide: 0.1, decay: 0.22, gain: 0.13 });
    k.noise({ filter: 'lowpass', freq: 1300 * v, to: 280, attack: 0.02, decay: 0.5, gain: 0.09 });
  }),

  pickup(k, { rare }) {
    if (rare) {
      k.bell(k.key(3, 74), { bus: 'chime', decay: 1.1, gain: 0.07 });
      k.bell(k.key(5, 74), { bus: 'chime', at: 0.13, decay: 1.5, gain: 0.07 });
    } else {
      k.bell(k.key(pick([0, 2, 3]), 79), { decay: 0.45, gain: 0.07 });
    }
  },

  levelup(k) {
    [0, 2, 3, 5, 7, 8].forEach((step, i) => {
      k.piano(k.key(step, 57), { bus: 'chime', strings: 1, ring: 0.6, at: i * 0.19, gain: 0.2 + i * 0.012 });
    });
    k.bell(k.key(10, 57), { bus: 'chime', at: 1.14, decay: 1.6, gain: 0.04 });
  },

  heal(k, { focus }) {
    const steps = focus ? [0, 3, 5] : [2, 3, 5, 7], floor = focus ? 67 : 72;
    steps.forEach((step, i) => k.tone({ bus: 'chime', freq: k.key(step, floor), at: i * 0.07, attack: 0.02, decay: 0.7, gain: 0.04 }));
  },

  drink(k) {
    k.tone({ freq: 270, to: 170, glide: 0.07, attack: 0.006, decay: 0.12, gain: 0.12 });
    k.tone({ freq: 330, to: 540, glide: 0.05, at: 0.1, decay: 0.1, gain: 0.1 });
  },

  skill(k, { id, behavior, element }) {
    const play = lookup(SKILL_SOUNDS, id, null) || lookup(BEHAVIOR_SOUNDS, behavior, null);
    if (play) play(k, element);
  },

  evade(k) {
    k.noise({ freq: 1800, to: 520, glide: 0.18, q: 0.8, attack: 0.02, decay: 0.24, gain: 0.09 });
  },

  blast: spatial((k, { element, heavy }) => {
    const low = element === 'frost' ? 300 : element === 'storm' ? 900 : 180;
    k.noise({ filter: 'lowpass', freq: element === 'frost' ? 3200 : 1400, to: 260, attack: 0.006, decay: heavy ? 0.7 : 0.45, gain: heavy ? 0.2 : 0.14 });
    k.tone({ freq: low, to: low * 0.42, decay: heavy ? 0.5 : 0.3, gain: heavy ? 0.18 : 0.12 });
    if (element === 'frost') k.bell(1568, { bus: 'chime', decay: 0.6, gain: 0.03 });
  }),

  chain(k) {
    k.noise({ filter: 'bandpass', freq: 3400, to: 1200, glide: 0.08, q: 2.5, attack: 0.003, decay: 0.12, gain: 0.1 });
    k.tone({ type: 'square', freq: 880, to: 1320, glide: 0.05, decay: 0.08, gain: 0.03 });
  },

  'item:legendary'(k) {
    for (const [i, step] of [0, 4, 7, 12].entries()) k.bell(k.key(step, 69), { bus: 'chime', at: i * 0.09, decay: 2.4, gain: 0.06 });
    k.tone({ bus: 'chime', freq: k.key(0, 45), attack: 0.2, hold: 0.2, decay: 1.6, gain: 0.05 });
  },

  'dungeon:cleared'(k) {
    for (const [i, step] of [0, 2, 4, 7, 9, 12].entries()) k.bell(k.key(step, 62), { bus: 'chime', at: i * 0.12, decay: 2.6, gain: 0.06 });
  },

  'zone:enter'(k) {
    k.noise({ filter: 'lowpass', freq: 600, to: 120, attack: 0.3, hold: 0.3, decay: 1.4, gain: 0.12 });
    k.tone({ freq: 73.4, to: 55, attack: 0.2, decay: 1.6, gain: 0.08 });
  },

  'boss:spawn'(k) {
    k.tone({ type: 'sawtooth', freq: 55, to: 49, attack: 0.4, hold: 0.5, decay: 2.2, gain: 0.05, cutoff: 400 });
    k.tone({ freq: 110, to: 98, attack: 0.4, hold: 0.5, decay: 2, gain: 0.06 });
  },

  'bolt:hit': spatial((k) => {
    k.noise({ filter: 'lowpass', freq: 1500, to: 320, attack: 0.008, decay: 0.45, gain: 0.13 });
    k.tone({ freq: 150, to: 62, decay: 0.3, gain: 0.14 });
  }),

  attune(k) {
    const f = k.key(0, 69);
    k.bell(f, { bus: 'chime', decay: 3.2, gain: 0.1 });
    k.tone({ bus: 'chime', freq: f * 2.005, attack: 0.01, decay: 2.2, gain: 0.03 });
    k.bell(k.key(3, 69), { bus: 'chime', at: 0.22, decay: 2.8, gain: 0.05 });
  },

  'player:died'(k) {
    const f = k.key(0, 55);
    k.tone({ freq: f, to: f / 3, glide: 1.4, attack: 0.03, hold: 0.3, decay: 1.8, gain: 0.2 });
    k.tone({ bus: 'chime', type: 'triangle', cutoff: 700, freq: f * 1.19, to: f * 0.4, glide: 1.4, attack: 0.05, hold: 0.3, decay: 1.5, gain: 0.06 });
  },

  'player:respawn'(k) {
    const f = k.key(0, 62);
    k.tone({ bus: 'chime', freq: f * 0.667, to: f, glide: 0.8, attack: 0.25, hold: 0.45, decay: 1.2, gain: 0.1 });
    k.bell(f * 2, { bus: 'chime', at: 0.75, decay: 1.6, gain: 0.05 });
  },

  'ui:click'(k) {
    k.tone({ type: 'triangle', freq: 620, to: 480, glide: 0.03, attack: 0.002, decay: 0.07, gain: 0.06 });
  },

  trade(k) {
    k.bell(k.key(3, 74), { decay: 0.3, gain: 0.05 });
    k.bell(k.key(5, 74), { at: 0.06, decay: 0.45, gain: 0.05 });
  },

  'bounty:claimed'(k) {
    const note = { bus: 'chime', strings: 1, ring: 0.6 };
    [3, 5, 7].forEach((step, i) => k.piano(k.key(step, 57), { ...note, at: i * 0.15, gain: 0.18 }));
    for (const step of [0, 5, 7, 8]) k.piano(k.key(step, 57), { ...note, ring: 1, at: 0.55, gain: 0.14 });
  },

  deny(k) {
    k.tone({ type: 'triangle', cutoff: 500, freq: 150, to: 118, glide: 0.08, decay: 0.18, gain: 0.13 });
  },

  'site:enter'(k) {
    k.piano(k.key(3, 57), { bus: 'chime', strings: 1, gain: 0.14 });
    k.piano(k.key(5, 57), { bus: 'chime', strings: 1, at: 0.42, gain: 0.15 });
  },

  found(k, { kind }) {
    if (kind === 'stones') return;
    if (kind === 'cache') {
      k.noise({ filter: 'lowpass', freq: 800, to: 300, attack: 0.003, decay: 0.12, gain: 0.09 });
      k.tone({ type: 'triangle', cutoff: 900, freq: 170, to: 118, glide: 0.05, attack: 0.003, decay: 0.14, gain: 0.1 });
      k.bell(k.key(5, 74), { bus: 'chime', at: 0.12, decay: 1.2, gain: 0.05 });
    } else if (kind === 'beacon') {
      k.bell(k.key(0, 57), { bus: 'chime', decay: 2.8, gain: 0.09 });
      [2, 3, 5].forEach((step, i) => k.bell(k.key(step, 69), { bus: 'chime', at: 0.35 + i * 0.16, decay: 1.3, gain: 0.045 }));
    } else {
      k.bell(k.key(5, 69), { bus: 'chime', at: 0.85, decay: 1.8, gain: 0.045 });
    }
  },

  boon(k) {
    for (const step of [0, 2, 3]) k.tone({ bus: 'chime', freq: k.key(step, 57), attack: 0.4, hold: 0.3, decay: 1.8, gain: 0.04 });
    k.bell(k.key(5, 69), { bus: 'chime', at: 0.45, decay: 2, gain: 0.05 });
  },

  travel(k) {
    k.noise({ freq: 380, to: 2400, glide: 0.7, q: 0.9, attack: 0.5, hold: 0.1, decay: 0.4, gain: 0.07 });
    k.tone({ bus: 'chime', freq: k.key(0, 57), to: k.key(0, 69), glide: 0.7, attack: 0.4, hold: 0.2, decay: 0.5, gain: 0.05 });
  },

  'travel:arrive'(k) {
    k.bell(k.key(0, 69), { bus: 'chime', decay: 2.4, gain: 0.08 });
    k.bell(k.key(3, 69), { bus: 'chime', at: 0.18, decay: 2, gain: 0.05 });
    k.noise({ freq: 1800, to: 500, glide: 0.4, q: 0.8, attack: 0.02, decay: 0.5, gain: 0.05 });
  },

  land(k, { mark }) {
    const note = { bus: 'chime', strings: 1, ring: 0.7 };
    [0, 2, 3].forEach((step, i) => k.piano(k.key(step, 57), { ...note, at: i * 0.22, gain: 0.15 }));
    if (mark) for (const step of [0, 3, 5]) k.piano(k.key(step, 57), { ...note, ring: 1, at: 0.8, gain: 0.13 });
  },

  nightfall(k) {
    for (const step of [-1, 2]) k.tone({ bus: 'chime', freq: k.key(step, 57), attack: 0.6, hold: 0.5, decay: 2.4, gain: 0.05 });
    k.bell(k.key(4, 69), { bus: 'chime', at: 1, decay: 2.2, gain: 0.035 });
  },

  daybreak(k) {
    [0, 2, 3].forEach((step, i) => k.bell(k.key(step, 74), { bus: 'chime', at: i * 0.2, decay: 1.6, gain: 0.045 }));
  },

  recovered(k) {
    [0, 2, 3, 5].forEach((step, i) => k.bell(k.key(step, 79), { at: i * 0.07, decay: 0.5, gain: 0.06 }));
  },

  'guide:step'(k) {
    k.bell(k.key(3, 74), { bus: 'chime', decay: 0.7, gain: 0.05 });
    k.bell(k.key(5, 74), { bus: 'chime', at: 0.1, decay: 1, gain: 0.05 });
  },
};

function spatial(play, where = (payload) => payload) {
  return (k, payload) => {
    const level = k.nearness(where(payload));
    if (level <= 0.02) return;
    k.level = level;
    play(k, payload);
  };
}

const KEY_ROOT = 50;
const PENTA = [0, 2, 4, 7, 9];
const SECTION_BARS = 4;
const CHORD_BARS = 2;
const SLOT_WEIGHT = [1.3, 0.15, 0.6, 0.25, 0.9, 0.15, 0.55, 0.25];

const CHORDS = {
  I: { bass: 0, pad: [0, 7, 16] },
  Isus: { bass: 0, pad: [0, 7, 14] },
  IV: { bass: 5, pad: [-3, 5, 12] },
  Vsus: { bass: 7, pad: [-5, 2, 12] },
  vi: { bass: 9, pad: [-3, 4, 12] },
  ii: { bass: 2, pad: [-7, 2, 9] },
};

const TIMES = {
  morning: { beat: 1.05, density: 0.6, scale: PENTA, chords: ['I', 'IV', 'Isus', 'vi', 'Vsus'], low: 12, high: 36, rest: [1, 2], bass: 0.55, bassFloor: 40, violin: 1, pad: 820 },
  day: { beat: 1.1, density: 0.56, scale: PENTA, chords: ['I', 'Vsus', 'vi', 'IV', 'Isus'], low: 10, high: 34, rest: [1, 2], bass: 0.6, bassFloor: 40, violin: 1, pad: 760 },
  dusk: { beat: 1.2, density: 0.5, scale: [0, 2, 5, 7, 9], chords: ['IV', 'ii', 'Isus', 'Vsus'], low: 7, high: 31, rest: [1, 3], bass: 0.7, bassFloor: 39, violin: 1.2, pad: 680 },
  night: { beat: 1.32, density: 0.42, scale: PENTA, chords: ['vi', 'ii', 'IV', 'Isus'], low: 7, high: 27, rest: [2, 3], bass: 0.85, bassFloor: 38, violin: 0.8, pad: 560 },
};

const BIOME_SOUND = {
  meadow: { shift: 0, violin: 1, space: 1, wind: 0.7, birds: 1, crickets: 1 },
  grove: { shift: 5, violin: 1.2, space: 0.9, wind: 0.55, birds: 1.4, crickets: 0.8 },
  pinewood: { shift: -2, violin: 0.8, space: 1.3, wind: 0.8, birds: 0.7, crickets: 0.6 },
  amberwood: { shift: -5, violin: 1.1, space: 1.1, wind: 0.65, birds: 0.9, crickets: 1.1 },
  shore: { shift: 2, violin: 1.3, space: 1.2, wind: 0.95, birds: 0.5, crickets: 0.3 },
  highland: { shift: -3, violin: 1.5, space: 1.4, wind: 1.1, birds: 0.3, crickets: 0.15 },
};
const biomeSound = (game) => lookup(BIOME_SOUND, game.biome && game.biome.id, BIOME_SOUND.meadow);
const nightOf = (game) => clamp((game.env && game.env.night) || 0, 0, 1);

export function createAudio(game) {
  let kit = null, music = null, ambience = null;
  let lastTick = 0, warned = false;
  const mix = { master: 1, music: 1, sfx: 1, ambience: 1, ui: 1, mono: false, muteHidden: true };
  const nextFree = new Map();

  function safely(fn) {
    try { fn(); } catch (err) {
      if (!warned) console.warn('[audio]', err);
      warned = true;
    }
  }

  function boot() {
    if (!kit) {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioCtx) return;
      const fresh = createKit(new AudioCtx(), game);
      music = createMusic(fresh, game);
      ambience = createAmbience(fresh, game);
      kit = fresh;
      kit.mix = mix;
      applyMix();
      setMaster(0.4);
    }
    wake();
  }

  function wake() {
    const ctx = kit && kit.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume()?.catch?.(() => {});
  }

  function setMaster(seconds = 0.12) {
    if (!kit) return;
    const hidden = mix.muteHidden && typeof document !== 'undefined' && document.hidden;
    const target = hidden ? 0 : LEVELS.master * mix.master;
    kit.master.gain.setTargetAtTime(target, kit.ctx.currentTime, seconds / 3);
  }

  function applyMix() {
    if (!kit) return;
    const b = kit.buses, now = kit.ctx.currentTime;
    b.sfx.node.gain.setTargetAtTime(LEVELS.sfx * mix.sfx, now, 0.05);
    b.chime.node.gain.setTargetAtTime(LEVELS.sfx * mix.sfx, now, 0.05);
    b.music.node.gain.setTargetAtTime(LEVELS.music * mix.music, now, 0.05);
    b.amb.node.gain.setTargetAtTime(LEVELS.ambience * mix.ambience, now, 0.05);
    b.air.node.gain.setTargetAtTime(LEVELS.ambience * mix.ambience, now, 0.05);
    if (music && music.st) music.st.hush = -1;
    setMaster();
  }

  function trigger(type, payload) {
    if (!kit || kit.ctx.state !== 'running') return;
    const now = kit.ctx.currentTime;
    const wait = Math.max(0, (nextFree.get(type) || 0) - now);
    if (wait > MAX_STAGGER) return;
    nextFree.set(type, now + wait + (REPEAT_GAPS[type] ?? REPEAT_GAP));
    kit.delay = wait;
    kit.level = UI_SOUNDS.has(type) ? mix.ui : 1;
    safely(() => SOUNDS[type](kit, payload ?? {}));
    kit.delay = 0;
    kit.level = 1;
  }

  function tick() {
    if (!kit || kit.ctx.state !== 'running') return;
    const now = kit.ctx.currentTime;
    if (now - lastTick < TICK) return;
    const dt = Math.min(now - lastTick, 0.5);
    lastTick = now;
    music.update(now);
    ambience.update(now, dt);
  }

  const bus = game.bus;
  bus.on('begin', () => safely(boot));
  bus.on('audio:mix', (m) => { Object.assign(mix, m); safely(applyMix); });
  bus.on('frame', () => safely(tick));
  for (const type of Object.keys(SOUNDS)) bus.on(type, (payload) => trigger(type, payload));
  if (typeof addEventListener === 'function') {
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, wake, { passive: true });
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => safely(() => setMaster(0.3)));
}

function createKit(ctx, game) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(softClip(ctx)).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.8);
  reverb.connect(master);

  const pools = {};
  for (const [name, max] of Object.entries(MAX_VOICES)) pools[name] = { n: 0, max };
  const makeBus = (level, wet, pool) => {
    const node = ctx.createGain();
    node.gain.value = level;
    node.connect(master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send).connect(reverb);
    }
    return { node, pool };
  };
  const buses = {
    sfx: makeBus(LEVELS.sfx, 0.1, pools.sfx),
    chime: makeBus(LEVELS.sfx, 0.45, pools.chime),
    music: makeBus(LEVELS.music, 0.55, pools.music),
    amb: makeBus(LEVELS.ambience, 0, pools.ambience),
    air: makeBus(LEVELS.ambience, 0.4, pools.ambience),
  };
  const padFilter = ctx.createBiquadFilter();
  padFilter.frequency.value = TIMES.day.pad;
  padFilter.Q.value = 0.3;
  padFilter.connect(buses.music.node);
  buses.pad = { node: padFilter, pool: pools.music };

  const noiseBuffer = whiteNoise(ctx, 5);
  const felt = ctx.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, 0.45, 0.2, 0.1, 0.05, 0.025]));

  const startTime = (o) => o.when ?? ctx.currentTime + kit.delay + (o.at ?? 0);

  function envelope(param, t0, peak, o) {
    const attack = Math.max(0.002, o.attack ?? 0.005), hold = Math.max(0, o.hold ?? 0), decay = Math.max(0.01, o.decay ?? 0.2);
    const top = t0 + attack, fall = top + hold, end = fall + decay;
    param.value = 0;
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, top);
    if (hold > 0) param.setValueAtTime(peak, fall);
    param.exponentialRampToValueAtTime(peak * 0.001, end);
    param.linearRampToValueAtTime(0, end + 0.02);
    return end + 0.03;
  }

  function finish(source, chain, out, end, extras = []) {
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    chain[chain.length - 1].connect(out.node);
    out.pool.n++;
    source.onended = () => {
      out.pool.n--;
      for (const node of chain) node.disconnect();
      for (const node of extras) node.disconnect();
    };
    source.stop(end);
  }

  function tone(o) {
    const out = buses[o.bus] || buses.sfx, peak = (o.gain ?? 0.1) * kit.level;
    if (out.pool.n >= out.pool.max || !(peak > MIN_GAIN) || !(o.freq > 0)) return;
    const t0 = startTime(o);
    const osc = ctx.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave); else osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.detune) osc.detune.value = o.detune;
    const amp = ctx.createGain();
    const end = envelope(amp.gain, t0, peak, o);
    const glideEnd = t0 + (o.glide ?? (end - t0) * 0.6);
    if (o.to > 0) osc.frequency.exponentialRampToValueAtTime(o.to, glideEnd);

    const chain = [osc], extras = [];
    if (o.cutoff > 0) {
      const filter = ctx.createBiquadFilter();
      filter.Q.value = 0.5;
      filter.frequency.setValueAtTime(o.cutoff, t0);
      if (o.cutoffTo > 0) filter.frequency.exponentialRampToValueAtTime(o.cutoffTo, glideEnd);
      chain.push(filter);
    }
    chain.push(amp);
    if (o.pan && !(kit.mix && kit.mix.mono) && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = o.pan;
      chain.push(panner);
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain(), swell = t0 + (o.vibrato.delay ?? 0);
      lfo.frequency.value = o.vibrato.rate;
      depth.gain.value = 0;
      depth.gain.setValueAtTime(0, swell);
      depth.gain.linearRampToValueAtTime(o.vibrato.depth, swell + 0.5);
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t0);
      lfo.stop(end);
      extras.push(lfo, depth);
    }
    osc.start(t0);
    finish(osc, chain, out, end, extras);
  }

  function noise(o) {
    const out = buses[o.bus] || buses.sfx, type = o.filter || 'bandpass', q = o.q ?? 0.8;
    const freq = o.freq ?? 1000, mid = o.to > 0 ? Math.sqrt(freq * o.to) : freq, nyquist = ctx.sampleRate / 2;
    const width = type === 'lowpass' ? mid : type === 'highpass' ? nyquist - mid : mid / q;
    const peak = (o.gain ?? 0.1) * kit.level / Math.sqrt(clamp(width / nyquist, 0.01, 1));
    if (out.pool.n >= out.pool.max || !(peak > MIN_GAIN)) return;
    const t0 = startTime(o);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    const amp = ctx.createGain();
    const end = envelope(amp.gain, t0, peak, o);
    if (o.to > 0) filter.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide ?? (end - t0) * 0.7));
    src.start(t0, Math.random() * (noiseBuffer.duration - 1));
    finish(src, [src, filter, amp], out, end);
  }

  function piano(freq, o = {}) {
    const strings = o.strings === 1 ? [0] : [-2.5, 2.5];
    const ring = clamp(6 * (220 / freq) ** 0.35, 2.5, 7.5) * (o.ring ?? 1);
    for (const detune of strings) {
      tone({
        bus: o.bus, at: o.at, when: o.when, wave: felt, freq, detune, attack: 0.01, decay: ring,
        gain: (o.gain ?? 0.15) / strings.length,
        cutoff: Math.min(3200, freq * 5), cutoffTo: Math.max(240, freq * 1.4), glide: 0.8,
      });
    }
  }

  function bell(freq, o = {}) {
    const gain = o.gain ?? 0.07, decay = o.decay ?? 0.6, base = { bus: o.bus, at: o.at, attack: 0.004 };
    tone({ ...base, freq, decay, gain });
    if (freq * 2.76 < 4200) tone({ ...base, freq: freq * 2.76, decay: decay * 0.4, gain: gain * 0.2 });
  }

  const kit = {
    ctx, master, buses, noiseBuffer, tone, noise, piano, bell,
    level: 1,
    delay: 0,
    root: KEY_ROOT,

    key(step, floor = 60) {
      const octave = Math.floor(step / 5);
      return mtof(fold(kit.root, floor) + 12 * octave + PENTA[step - 5 * octave]);
    },

    nearness(at) {
      const p = game.player;
      if (!at || !p || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return 1;
      const t = clamp((HEARING - Math.hypot(at.x - p.x, at.z - p.z)) / (HEARING - NEAR), 0, 1);
      return t * t;
    },
  };
  return kit;
}

function whiteNoise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function impulse(ctx, seconds) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds), pre = Math.floor(rate * 0.018);
  const buffer = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      smooth += (Math.random() * 2 - 1 - smooth) * (0.5 - 0.42 * t);
      data[i] = smooth * (1 - t) ** 2.6;
    }
  }
  return buffer;
}

function softClip(ctx) {
  const shaper = ctx.createWaveShaper(), n = 2048, curve = new Float32Array(n), knee = 0.6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    curve[i] = a < knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  shaper.curve = curve;
  return shaper;
}

function createMusic(kit, game) {
  const st = {
    at: -Infinity,
    bar: 0,
    mood: TIMES.day, color: BIOME_SOUND.meadow,
    chordName: '', tones: new Set(),
    ladder: [],
    last: 0,
    phrase: 2, rest: 0,
    violinIn: 2, violinBars: 0,
    hush: -1,
  };

  function enterSection(t0) {
    const night = nightOf(game), hour = Number.isFinite(game.hour) ? game.hour : 12;
    st.mood = TIMES[night > 0.6 ? 'night' : night > 0.15 ? 'dusk' : hour < 11.5 ? 'morning' : 'day'];
    st.color = biomeSound(game);
    const root = KEY_ROOT + st.color.shift;
    if (root !== kit.root && st.bar > 0) { st.phrase = 0; st.rest = Math.max(st.rest, 1); }
    kit.root = root;
    st.ladder = [];
    for (let m = root + st.mood.low; m <= root + st.mood.high; m++) if (st.mood.scale.includes(pitchClass(m - root))) st.ladder.push(m);
    if (!st.last) st.last = root + st.mood.low + 9;
    kit.buses.pad.node.frequency.setTargetAtTime(st.mood.pad, t0, 2);
  }

  function changeChord(t0, beat) {
    const { mood, color } = st, home = mood.chords[0];
    st.chordName = st.chordName !== home && rand() < 0.4 ? home : pick(mood.chords.filter((name) => name !== st.chordName));
    const chord = CHORDS[st.chordName], span = CHORD_BARS * 4 * beat;
    st.tones = new Set([chord.bass, ...chord.pad].map(pitchClass));
    for (const offset of chord.pad) {
      for (const detune of [-7, 7]) {
        kit.tone({ bus: 'pad', type: 'sawtooth', freq: mtof(kit.root + offset), detune, when: t0, attack: 3, hold: span - 2.5, decay: 5, gain: 0.028 });
      }
    }
    if (rand() < mood.bass) kit.piano(mtof(fold(kit.root + chord.bass, mood.bassFloor)), { bus: 'music', when: t0 + rand(0, 0.03), gain: 0.15 });
    if (--st.violinIn <= 0) {
      violinLine(t0, beat);
      st.violinBars = CHORD_BARS;
      st.violinIn = Math.max(2, Math.round(rand(3, 6.5) / (mood.violin * color.violin)));
    }
  }

  const inChord = (midi) => st.tones.has(pitchClass(midi - kit.root));

  function chordTone(midi) {
    let best = midi, gap = Infinity;
    for (const m of st.ladder) {
      if (Math.abs(m - midi) < gap && inChord(m)) { best = m; gap = Math.abs(m - midi); }
    }
    return best;
  }

  function nextPitch(strong) {
    const ladder = st.ladder, top = ladder.length - 1;
    let i = 0;
    for (let j = 1; j <= top; j++) if (Math.abs(ladder[j] - st.last) < Math.abs(ladder[i] - st.last)) i = j;
    const up = rand() < 0.5 + ((top / 2 - i) / (top + 1)) * 0.9;
    const step = (up ? 1 : -1) * (rand() < 0.72 ? 1 : 2);
    i = clamp(i + step < 0 || i + step > top ? i - step : i + step, 0, top);
    let midi = ladder[i];
    if (strong && rand() < 0.7 && chordTone(midi) !== st.last) midi = chordTone(midi);
    st.last = midi;
    return midi;
  }

  function pianoBar(t0, beat) {
    const density = st.mood.density * (st.violinBars > 0 ? 0.45 : 1);
    for (let slot = 0; slot < SLOT_WEIGHT.length; slot++) {
      if (rand() > SLOT_WEIGHT[slot] * density) continue;
      const strong = slot % 4 === 0;
      const midi = nextPitch(strong);
      const when = t0 + (slot * beat) / 2 + rand(0, 0.03);
      const gain = rand(0.12, 0.18) * (strong ? 1 : 0.85);
      kit.piano(mtof(midi), { bus: 'music', when, gain });
      if (!strong || rand() > 0.3) continue;
      const under = st.ladder.findLast((m) => m <= midi - 3 && m >= midi - 9 && inChord(m));
      if (under) kit.piano(mtof(under), { bus: 'music', when: when + 0.025, gain: gain * 0.7 });
    }
  }

  function violinLine(t0, beat) {
    const floor = kit.root + st.mood.low + 5;
    const reach = st.ladder.filter((m) => m >= floor && m <= floor + 16);
    if (reach.length < 3) return;
    const top = reach.length - 1, breath = randInt(0, 2);
    let i = clamp(Math.floor(top / 2) + randInt(-1, 1), 0, top), dir = pick([-1, 1]), prev = 0;
    let left = CHORD_BARS * 4 - breath, when = t0 + breath * beat;
    for (let n = 0; n < 4 && left >= 2; n++) {
      const beats = Math.min(left, pick([2, 3, 3, 4]));
      left -= beats;
      const anchor = n === 0 || n === 3 || left < 2;
      let midi = anchor ? chordTone(reach[i]) : reach[i];
      if (midi === prev) midi = reach[clamp(i + dir, 0, top)];
      prev = midi;
      const freq = mtof(midi), dur = beats * beat;
      for (const [detune, gain] of [[0, 0.055], [6, 0.025]]) {
        kit.tone({
          bus: 'music', type: 'sawtooth', freq, detune, when, gain, attack: 0.5, hold: Math.max(0.1, dur - 0.4), decay: 1.5,
          cutoff: Math.min(2200, freq * 3), vibrato: { rate: 5.2, depth: 12, delay: 0.45 },
        });
      }
      when += dur;
      if (i + dir < 0 || i + dir > top) dir = -dir;
      i = clamp(i + dir * pick([1, 1, 2]), 0, top);
    }
  }

  function scheduleBar() {
    const t0 = st.at;
    if (st.bar % SECTION_BARS === 0) enterSection(t0);
    const { mood, color } = st, beat = mood.beat;
    if (st.bar % CHORD_BARS === 0) changeChord(t0, beat);
    if (st.phrase === 0 && st.rest === 0) st.phrase = randInt(1, 2);
    if (st.phrase > 0) {
      pianoBar(t0, beat);
      if (--st.phrase === 0) st.rest = Math.round(randInt(mood.rest[0], mood.rest[1]) * color.space);
    } else {
      st.rest--;
    }
    if (st.violinBars > 0) st.violinBars--;
    st.at = t0 + 4 * beat;
    st.bar++;
  }

  return {
    update(now) {
      if (st.at < now - 1) { st.bar = 0; st.at = now + 0.4; }
      while (st.at < now + LOOKAHEAD) scheduleBar();
      const hush = game.paused ? 0.7 : game.player && game.player.dead ? 0.5 : 1;
      if (hush === st.hush) return;
      st.hush = hush;
      kit.buses.music.node.gain.setTargetAtTime(LEVELS.music * hush * (kit.mix ? kit.mix.music : 1), now, 0.7);
    },
  };
}

const WATER_RINGS = [[4, 1], [8, 0.7], [13, 0.4]];

function waterNear(game) {
  const world = game.world, p = game.player;
  if (!world || typeof world.waterDepth !== 'function' || !p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return 0;
  let wet = world.waterDepth(p.x, p.z) > 0 ? 1.5 : 0, total = 1.5;
  for (const [radius, weight] of WATER_RINGS) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + radius;
      if (world.waterDepth(p.x + Math.cos(a) * radius, p.z + Math.sin(a) * radius) > 0) wet += weight;
      total += weight;
    }
  }
  return clamp((wet / total) * 2.4, 0, 1);
}

function createAmbience(kit, game) {
  const ctx = kit.ctx;

  function bed(rate, highpass, lowpass) {
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = kit.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rate;
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    lp.frequency.value = lowpass;
    gain.gain.value = 0;
    src.connect(hp).connect(lp).connect(gain).connect(kit.buses.amb.node);
    src.start();
    return { level: gain.gain, tone: lp.frequency };
  }
  const wind = bed(0.8, 90, 450), water = bed(1.1, 220, 900);
  let bedIn = 0, birdIn = rand(2, 5), cricketIn = rand(1, 4);

  function birdSong() {
    const base = rand(1900, 3000), voice = { bus: 'air', pan: rand(-0.8, 0.8), gain: rand(0.018, 0.032), attack: 0.012 };
    const kind = randInt(0, 2);
    if (kind === 0) {
      for (let i = 0, n = randInt(2, 3); i < n; i++) kit.tone({ ...voice, freq: base, to: base * 1.3, glide: 0.07, at: i * 0.17, decay: 0.12 });
    } else if (kind === 1) {
      for (let i = 0, n = randInt(3, 6); i < n; i++) kit.tone({ ...voice, freq: base * (1.2 - i * 0.035), to: base * (1.05 - i * 0.035), glide: 0.04, at: i * 0.08, decay: 0.07 });
    } else {
      kit.tone({ ...voice, freq: base * 0.85, hold: 0.14, decay: 0.2 });
      kit.tone({ ...voice, freq: base * 0.67, at: 0.34, hold: 0.2, decay: 0.3 });
    }
  }

  function cricket() {
    const voice = { bus: 'air', pan: rand(-0.9, 0.9), gain: rand(0.012, 0.02), freq: rand(3300, 3800), attack: 0.008, decay: 0.045 };
    for (let chirp = 0, n = randInt(2, 4); chirp < n; chirp++) {
      for (let pulse = 0; pulse < 3; pulse++) kit.tone({ ...voice, at: chirp * 0.36 + pulse * 0.05 });
    }
  }

  return {
    update(now, dt) {
      const flavor = biomeSound(game), night = nightOf(game);
      bedIn -= dt;
      if (bedIn <= 0) {
        bedIn = 0.3;
        const gust = 0.5 + 0.3 * Math.sin(now * 0.13) + 0.2 * Math.sin(now * 0.31 + 1.7);
        wind.level.setTargetAtTime(flavor.wind * (0.32 + 0.5 * gust), now, 0.9);
        wind.tone.setTargetAtTime(330 + 330 * gust, now, 0.9);
        const wash = 0.5 + 0.5 * Math.sin(now * 0.85 + 0.6 * Math.sin(now * 0.23));
        water.level.setTargetAtTime(waterNear(game) * (0.22 + 0.36 * wash), now, 0.6);
        water.tone.setTargetAtTime(650 + 550 * wash, now, 0.6);
      }
      if (night < 0.35) birdIn -= dt * flavor.birds;
      if (birdIn <= 0) {
        birdSong();
        birdIn = rand(5, 14);
      }
      if (night > 0.6) cricketIn -= dt * flavor.crickets;
      if (cricketIn <= 0) {
        cricket();
        cricketIn = rand(4, 11);
      }
    },
  };
}
