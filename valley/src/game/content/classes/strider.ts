import type { ClassDef } from '../skills';
import { gain, heal, onCast, param, selfStatus, stat } from './helpers';

export const STRIDER: ClassDef = {
  id: 'strider',
  name: 'Strider',
  tagline: 'Who keeps the roads',
  about: 'Bow, knife and quick feet. Striders shoot from range or cut up close, spend Breath that returns fast, and tumble out of every blow aimed at them.',
  primary: 'grace',
  resource: { name: 'Breath', max: 100, regen: 12, startFull: true, color: '#3d7332' },
  weapons: ['bow', 'dagger'],
  offhands: ['quiver'],
  kit: 3,
  pencils: [[94 / 255, 140 / 255, 78 / 255], [214 / 255, 70 / 255, 52 / 255], [74 / 255, 77 / 255, 94 / 255]],
  start: ['quickshot', 'arrowfan'],
  gear: ['shortbow', 'jerkin'],

  skills: [
    {
      id: 'quickshot', name: 'Quick Shot', category: 'basic', tags: ['basic', 'ranged', 'projectile', 'physical'], element: 'physical', icon: 'arrow',
      behavior: 'projectile', anim: 'shoot', targeting: 'direction', range: 15,
      params: { coef: 0.95, generate: 10, castTime: 0.62, speed: 28, radius: 0.35, life: 0.75, count: 1, spread: 0.07, pierce: 0 },
      desc: 'Loose an arrow for {coef} weapon damage. Generates {generate} Breath.',
      enhance: { desc: 'The arrow passes through one more enemy.', effects: [param('quickshot', 'pierce', 'add', 1)] },
      upgrades: [
        { name: 'Double Nock', desc: 'Two arrows at once.', effects: [param('quickshot', 'count', 'set', 2)] },
        { name: 'Keen Point', desc: '+25% critical strike chance with Quick Shot.', effects: [param('quickshot', 'crit', 'add', 0.25)] },
      ],
    },
    {
      id: 'twincut', name: 'Twin Cut', category: 'basic', tags: ['basic', 'melee', 'physical'], element: 'physical', icon: 'daggers',
      behavior: 'melee', anim: 'swing', targeting: 'enemy', range: 1.7,
      params: { coef: 0.52, generate: 12, castTime: 0.4, reach: 1.9, arc: 0.3, targets: 1, hits: 2 },
      desc: 'Two quick cuts, each for {coef} weapon damage. Generates {generate} Breath.',
      enhance: { desc: 'Generates 6 more Breath.', effects: [param('twincut', 'generate', 'add', 6)] },
      upgrades: [
        { name: 'Venomed Edges', desc: 'Each cut poisons for 50% of its damage over 4 seconds.', effects: [param('twincut', 'poison', 'set', 0.5), param('twincut', 'poisonDur', 'set', 4)] },
        { name: 'Lunge', desc: 'Twin Cut darts to an enemy up to 5 paces away first.', effects: [param('twincut', 'lunge', 'set', 5)] },
      ],
    },
    {
      id: 'arrowfan', name: 'Arrow Fan', category: 'core', tags: ['core', 'ranged', 'projectile', 'physical'], element: 'physical', icon: 'fan',
      behavior: 'projectile', anim: 'shoot', targeting: 'direction', range: 13,
      params: { coef: 0.62, cost: 26, castTime: 0.7, speed: 24, radius: 0.35, life: 0.62, count: 5, spread: 0.16, pierce: 0 },
      desc: 'A fan of {count} arrows, each for {coef} weapon damage.',
      enhance: { desc: 'Two more arrows.', effects: [param('arrowfan', 'count', 'add', 2)] },
      upgrades: [
        { name: 'Piercing Fan', desc: 'The arrows pass through two enemies.', effects: [param('arrowfan', 'pierce', 'set', 2)] },
        { name: 'Barbed Fan', desc: 'The arrows slow enemies by 30% for 2 seconds.', effects: [param('arrowfan', 'slow', 'set', 0.3), param('arrowfan', 'slowDur', 'set', 2)] },
      ],
    },
    {
      id: 'piercingshot', name: 'Piercing Shot', category: 'core', tags: ['core', 'ranged', 'projectile', 'physical'], element: 'physical', icon: 'lance',
      behavior: 'projectile', anim: 'shoot', targeting: 'direction', range: 18,
      params: { coef: 1.8, cost: 26, castTime: 0.76, speed: 32, radius: 0.5, life: 0.8, count: 1, spread: 0.1, pierce: 99 },
      desc: 'A heavy arrow that runs through every enemy in a line for {coef} weapon damage.',
      enhance: { desc: 'Deals 30% more damage (×) to Vulnerable enemies.', effects: [param('piercingshot', 'moreVsVulnerable', 'set', 0.3)] },
      upgrades: [
        { name: 'Exposing Shot', desc: 'Makes enemies Vulnerable for 3 seconds.', effects: [param('piercingshot', 'vuln', 'set', 3)] },
        { name: 'Echo Shot', desc: 'A second arrow follows a moment later, for 60% of the damage.', effects: [param('piercingshot', 'echo', 'set', 0.6)] },
      ],
    },
    {
      id: 'flurry', name: 'Flurry', category: 'core', tags: ['core', 'melee', 'physical'], element: 'physical', icon: 'daggers',
      behavior: 'melee', anim: 'swing', targeting: 'enemy', range: 2,
      params: { coef: 0.38, cost: 24, castTime: 0.6, reach: 2.3, arc: 0.1, targets: 4, hits: 4 },
      desc: 'A storm of cuts: {hits} strikes at up to {targets} enemies in front of you, each for {coef} weapon damage.',
      enhance: { desc: 'One more strike.', effects: [param('flurry', 'hits', 'add', 1)] },
      upgrades: [
        { name: 'Toxic Flurry', desc: 'Each cut poisons for 25% of its damage over 4 seconds.', effects: [param('flurry', 'poison', 'set', 0.25), param('flurry', 'poisonDur', 'set', 4)] },
        { name: 'Bleeding Flurry', desc: 'Each cut makes enemies Bleed for 40% of its damage over 4 seconds.', effects: [param('flurry', 'bleed', 'set', 0.4), param('flurry', 'bleedDur', 'set', 4)] },
      ],
    },
    {
      id: 'smokepouch', name: 'Smoke Pouch', category: 'defensive', tags: ['defensive', 'area', 'shadow'], element: 'shadow', icon: 'smoke',
      behavior: 'nova', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 14, castTime: 0.3, radius: 3.2, coef: 0, stun: 1.5, invuln: 0.8, hasteSelf: 0.25, hasteDur: 3 },
      desc: 'Burst a pouch of smoke: enemies within {radius} paces are Stunned for {stun} seconds, and you slip away untouchable and quick.',
      enhance: { desc: 'Cooldown 3 seconds shorter.', effects: [param('smokepouch', 'cooldown', 'add', -3)] },
      upgrades: [
        { name: 'Choking Smoke', desc: 'Enemies caught are Vulnerable for 3 seconds.', effects: [param('smokepouch', 'vuln', 'set', 3)] },
        { name: 'Restorative Herbs', desc: 'The smoke mends 12% of your health.', effects: [onCast('smokepouch', heal(0.12))] },
      ],
    },
    {
      id: 'snaretrap', name: 'Snare Trap', category: 'defensive', tags: ['defensive', 'trap', 'area', 'physical'], element: 'physical', icon: 'trap',
      behavior: 'trap', anim: 'cast', targeting: 'ground', range: 9,
      params: { cooldown: 10, castTime: 0.35, radius: 2.4, arm: 0.6, duration: 15, coef: 1.2, stun: 2 },
      desc: 'Set a snare. The first enemy to step near springs it: everything within {radius} paces takes {coef} weapon damage and is held for {stun} seconds.',
      enhance: { desc: 'The snare catches a quarter wider.', effects: [param('snaretrap', 'radius', 'mul', 1.25)] },
      upgrades: [
        { name: 'Poisoned Spikes', desc: 'Poisons for 80% of the damage over 5 seconds.', effects: [param('snaretrap', 'poison', 'set', 0.8), param('snaretrap', 'poisonDur', 'set', 5)] },
        { name: 'Quick Rig', desc: 'Cooldown 4 seconds shorter.', effects: [param('snaretrap', 'cooldown', 'add', -4)] },
      ],
    },
    {
      id: 'tumble', name: 'Tumble', category: 'mobility', tags: ['mobility', 'movement'], element: 'physical', icon: 'step',
      behavior: 'dash', anim: 'lunge', targeting: 'direction', range: 5.5,
      params: { cooldown: 5, distance: 5.5, speed: 28, width: 1, coef: 0, invuln: 0.3 },
      desc: 'Roll {distance} paces, untouchable for the moment.',
      enhance: { desc: 'Cooldown 1 second shorter.', effects: [param('tumble', 'cooldown', 'add', -1)] },
      upgrades: [
        { name: 'Poised Roll', desc: 'Your next Basic skill after a Tumble is a critical strike.', effects: [onCast('tumble', selfStatus('poised', 4))] },
        { name: 'Caltrops', desc: 'Leaves caltrops where you started, slowing enemies by 40% for 3 seconds.', effects: [param('tumble', 'zoneDur', 'set', 3), param('tumble', 'zoneSlow', 'set', 0.4), param('tumble', 'radius', 'set', 2.2)] },
      ],
    },
    {
      id: 'rainofarrows', name: 'Rain of Arrows', category: 'mastery', tags: ['mastery', 'ranged', 'area', 'physical'], element: 'physical', icon: 'rain',
      behavior: 'zone', anim: 'cast', targeting: 'ground', range: 13,
      params: { cost: 40, castTime: 0.4, radius: 3.4, duration: 3, tick: 0.25, coef: 0.32 },
      desc: 'Arrows rain over {radius} paces for {duration} seconds: {coef} weapon damage four times a second.',
      enhance: { desc: 'Lasts 1 second longer.', effects: [param('rainofarrows', 'duration', 'add', 1)] },
      upgrades: [
        { name: 'Wide Rain', desc: 'Covers 30% more ground.', effects: [param('rainofarrows', 'radius', 'mul', 1.3)] },
        { name: 'Fire Arrows', desc: 'The arrows set enemies Burning.', effects: [param('rainofarrows', 'burn', 'set', 0.3), param('rainofarrows', 'burnDur', 'set', 2)] },
      ],
    },
    {
      id: 'huntersmark', name: 'Hunter’s Mark', category: 'mastery', tags: ['mastery', 'shadow'], element: 'shadow', icon: 'eye',
      behavior: 'mark', anim: 'cast', targeting: 'enemy', range: 14, status: 'marked',
      params: { cooldown: 14, castTime: 0.3, duration: 8, potency: 0.3, radius: 0 },
      desc: 'Mark an enemy for {duration} seconds: it takes {potency} more damage (×) from you.',
      enhance: { desc: 'The mark lasts 4 seconds longer.', effects: [param('huntersmark', 'duration', 'add', 4)] },
      upgrades: [
        { name: 'Pack Hunt', desc: 'Marks every enemy within 4 paces of the target.', effects: [param('huntersmark', 'radius', 'set', 4)] },
        { name: 'Open Wound', desc: 'Marked enemies take 15% more again.', effects: [param('huntersmark', 'potency', 'add', 0.15)] },
      ],
    },
    {
      id: 'hundredarrows', name: 'Hundred Arrows', category: 'ultimate', tags: ['ultimate', 'ranged', 'projectile', 'physical'], element: 'physical', icon: 'rain',
      behavior: 'zone', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 50, castTime: 0.4, radius: 10, duration: 3, tick: 0.12, coef: 0.5, follow: 1, volley: 1 },
      desc: 'For {duration} seconds, loose arrows as fast as you can draw at every enemy within {radius} paces, each for {coef} weapon damage.',
      enhance: { desc: 'Lasts 1 second longer.', effects: [param('hundredarrows', 'duration', 'add', 1)] },
      upgrades: [
        { name: 'Hail', desc: 'The arrows hit 30% harder.', effects: [param('hundredarrows', 'coef', 'mul', 1.3)] },
        { name: 'Ready Again', desc: 'Cooldown 12 seconds shorter.', effects: [param('hundredarrows', 'cooldown', 'add', -12)] },
      ],
    },
    {
      id: 'hawkseye', name: 'Hawk’s Eye', category: 'ultimate', tags: ['ultimate', 'buff'], element: 'physical', icon: 'eye',
      behavior: 'buff', anim: 'cast', targeting: 'self', range: 0, status: 'hawkeye',
      params: { cooldown: 45, castTime: 0.3, duration: 8, potency: 0.35 },
      desc: 'See every gap in every hide: +{potency} critical strike chance for {duration} seconds.',
      enhance: { desc: 'Lasts 3 seconds longer.', effects: [param('hawkseye', 'duration', 'add', 3)] },
      upgrades: [
        { name: 'Predator', desc: 'Your next 3 attacks also deal 60% more damage (×).', effects: [onCast('hawkseye', selfStatus('ambush', 8, 0, 3))] },
        { name: 'Steady Breath', desc: 'Also restores 50 Breath.', effects: [onCast('hawkseye', gain(50))] },
      ],
    },
  ],

  passives: [
    { id: 'fleetfoot', name: 'Fleetfoot', cluster: 'basic', max: 3, effects: [stat('moveSpeed', 0.04)], desc: '+4% movement speed per rank.', icon: 'boot' },
    { id: 'keeneye', name: 'Keen Eye', cluster: 'basic', max: 3, effects: [stat('critChance', 0.03)], desc: '+3% critical strike chance per rank.', icon: 'eye' },
    { id: 'sharpened', name: 'Sharpened', cluster: 'core', max: 3, effects: [stat('critDamage', 0.12)], desc: '+12% critical strike damage per rank.', icon: 'burst' },
    { id: 'toxicology', name: 'Toxicology', cluster: 'core', max: 3, effects: [stat('dmgPoison', 0.1), stat('dmgDot', 0.05)], desc: '+10% poison damage and +5% damage over time per rank.', icon: 'drop' },
    { id: 'lightfeet', name: 'Light on Your Feet', cluster: 'defensive', max: 3, effects: [stat('dodge', 0.03)], desc: '+3% chance to dodge per rank.', icon: 'step' },
    { id: 'secondwind', name: 'Second Wind', cluster: 'defensive', max: 3, effects: [stat('resourceOnKill', 5)], desc: 'Each kill gives back 5 Breath per rank.', icon: 'orb' },
    { id: 'closequarters', name: 'Close Quarters', cluster: 'mobility', max: 3, effects: [stat('dmgVsClose', 0.08)], desc: '+8% damage to enemies close to you per rank.', icon: 'fist' },
    { id: 'steadyaim', name: 'Steady Aim', cluster: 'mastery', max: 3, effects: [stat('dmgVsDistant', 0.08)], desc: '+8% damage to distant enemies per rank.', icon: 'arrow' },
    { id: 'exploit', name: 'Exploit Weakness', cluster: 'mastery', max: 3, effects: [stat('dmgVsVulnerable', 0.1)], desc: '+10% damage to Vulnerable enemies per rank.', icon: 'skull' },
    { id: 'roadwise', name: 'Roadwise', cluster: 'ultimate', max: 3, effects: [stat('damage', 0.05)], desc: '+5% damage per rank.', icon: 'star' },
  ],

  keys: [
    { id: 'precision', name: 'Precision', effects: [stat('dmgVsVulnerable', 0.2, true), stat('critChance', 0.05)], desc: 'You deal 20% more damage (×) to Vulnerable enemies, and +5% critical strike chance.', icon: 'eye' },
    { id: 'ambusher', name: 'Ambusher', effects: [onCast('tumble', selfStatus('ambush', 6, 0, 3)), onCast('smokepouch', selfStatus('ambush', 6, 0, 3))], desc: 'After Tumble or Smoke Pouch, your next 3 attacks deal 60% more damage (×).', icon: 'smoke' },
    { id: 'venomous', name: 'Venomous', effects: [{ kind: 'onHit', status: 'poison', duration: 4, potency: 0.15 }, gainKill()], desc: 'Every hit poisons for 15% of its damage over 4 seconds, and kills give 3 Breath.', icon: 'drop' },
  ],
};

function gainKill() { return { kind: 'trigger' as const, on: 'kill' as const, actions: [gain(3)] }; }
