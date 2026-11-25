import type { ClassDef } from '../skills';
import { barrier, gain, onCast, onCastTag, param, selfStatus, stat } from './helpers';

export const EMBERWRIGHT: ClassDef = {
  id: 'emberwright',
  name: 'Emberwright',
  tagline: 'Keeper of the old fires',
  about: 'Fire, frost and storm, drawn out of the air. Emberwrights keep their distance, spend Focus that returns on its own, and burn, freeze and shock whole packs at once.',
  primary: 'mind',
  resource: { name: 'Focus', max: 100, regen: 8, startFull: true, color: '#48608f' },
  weapons: ['staff', 'wand'],
  offhands: ['focus'],
  kit: 2,
  pencils: [[84 / 255, 108 / 255, 156 / 255], [214 / 255, 70 / 255, 52 / 255], [226 / 255, 188 / 255, 130 / 255]],
  start: ['spark', 'emberbolt'],
  gear: ['staff', 'robe'],

  skills: [
    {
      id: 'spark', name: 'Spark', category: 'basic', tags: ['basic', 'ranged', 'projectile', 'storm'], element: 'storm', icon: 'spark',
      behavior: 'projectile', anim: 'cast', targeting: 'direction', range: 14,
      params: { coef: 1.0, generate: 10, castTime: 0.6, speed: 24, radius: 0.35, life: 0.7, count: 1, spread: 0.18, pierce: 0 },
      desc: 'Flick a spark that bites the first enemy for {coef} weapon damage. Generates {generate} Focus.',
      enhance: { desc: 'Spark passes through one more enemy.', effects: [param('spark', 'pierce', 'add', 1)] },
      upgrades: [
        { name: 'Forked Spark', desc: 'Three sparks in a fan, each for 60% of the damage.', effects: [param('spark', 'count', 'set', 3), param('spark', 'coef', 'mul', 0.6)] },
        { name: 'Arcing Spark', desc: 'Spark leaps on to 2 more enemies nearby.', effects: [param('spark', 'chain', 'set', 2)] },
      ],
    },
    {
      id: 'frostshard', name: 'Frost Shard', category: 'basic', tags: ['basic', 'ranged', 'projectile', 'frost'], element: 'frost', icon: 'shard',
      behavior: 'projectile', anim: 'cast', targeting: 'direction', range: 14,
      params: { coef: 1.02, generate: 10, castTime: 0.64, speed: 18, radius: 0.4, life: 0.8, count: 1, spread: 0.15, pierce: 0, chill: 0.22 },
      desc: 'A splinter of ice for {coef} weapon damage that Chills by {chill}. Enough Chill freezes. Generates {generate} Focus.',
      enhance: { desc: 'Chills by 15% more.', effects: [param('frostshard', 'chill', 'add', 0.15)] },
      upgrades: [
        { name: 'Shatter', desc: 'Deals 40% more damage (×) to Frozen or Stunned enemies.', effects: [param('frostshard', 'moreVsCC', 'set', 0.4)] },
        { name: 'Splinter', desc: 'Bursts on impact, hitting enemies nearby for 40% of the damage.', effects: [param('frostshard', 'explode', 'set', 1.5), param('frostshard', 'explodeCoef', 'set', 0.4)] },
      ],
    },
    {
      id: 'emberbolt', name: 'Ember Bolt', category: 'core', tags: ['core', 'ranged', 'projectile', 'fire'], element: 'fire', icon: 'bolt',
      behavior: 'projectile', anim: 'cast', targeting: 'direction', range: 14,
      params: { coef: 2.3, cost: 26, castTime: 0.72, speed: 17, radius: 0.5, life: 0.85, count: 1, spread: 0.13, pierce: 0, explode: 1.6, explodeCoef: 0.5, burn: 0.4, burnDur: 3 },
      desc: 'Hurl a mote of fire that bursts on the first enemy for {coef} weapon damage, splashing {explodeCoef} around it and setting enemies Burning.',
      enhance: { desc: 'The burst is 30% wider.', effects: [param('emberbolt', 'explode', 'mul', 1.3)] },
      upgrades: [
        { name: 'Twin Embers', desc: 'Throws two motes, a little apart.', effects: [param('emberbolt', 'count', 'set', 2)] },
        { name: 'Lingering Flame', desc: 'Burning is twice as strong and lasts 2 seconds longer.', effects: [param('emberbolt', 'burn', 'mul', 2), param('emberbolt', 'burnDur', 'add', 2)] },
      ],
    },
    {
      id: 'icelance', name: 'Ice Lance', category: 'core', tags: ['core', 'ranged', 'projectile', 'frost'], element: 'frost', icon: 'lance',
      behavior: 'projectile', anim: 'cast', targeting: 'direction', range: 16,
      params: { coef: 2.15, cost: 28, castTime: 0.74, speed: 26, radius: 0.45, life: 0.9, count: 1, spread: 0.2, pierce: 99, chill: 0.3 },
      desc: 'A lance of ice that runs through every enemy in a line for {coef} weapon damage, Chilling by {chill}.',
      enhance: { desc: 'Deals 30% more damage (×) to Chilled enemies.', effects: [param('icelance', 'moreVsChilled', 'set', 0.3)] },
      upgrades: [
        { name: 'Lance Volley', desc: 'Three lances in a fan, each for 70% of the damage.', effects: [param('icelance', 'count', 'set', 3), param('icelance', 'coef', 'mul', 0.7)] },
        { name: 'Rime Lance', desc: 'Freezes enemies that were already Chilled, for 1.2 seconds.', effects: [param('icelance', 'freezeChilled', 'set', 1.2)] },
      ],
    },
    {
      id: 'chainlightning', name: 'Chain Lightning', category: 'core', tags: ['core', 'ranged', 'storm'], element: 'storm', icon: 'chain',
      behavior: 'chain', anim: 'cast', targeting: 'enemy', range: 11,
      params: { coef: 1.75, cost: 30, castTime: 0.7, jumps: 4, jumpRange: 6, falloff: 0.9 },
      desc: 'Lightning that strikes an enemy for {coef} weapon damage, then leaps to {jumps} more.',
      enhance: { desc: 'Leaps to 2 more enemies.', effects: [param('chainlightning', 'jumps', 'add', 2)] },
      upgrades: [
        { name: 'Gathering Storm', desc: 'Each leap hits 15% harder than the last, rather than softer.', effects: [param('chainlightning', 'falloff', 'set', 1.15)] },
        { name: 'Overcharge', desc: 'Makes enemies Vulnerable for 2 seconds.', effects: [param('chainlightning', 'vuln', 'set', 2)] },
      ],
    },
    {
      id: 'mend', name: 'Mend', category: 'defensive', tags: ['defensive', 'heal'], element: 'poison', icon: 'heart',
      behavior: 'heal', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 14, cost: 16, castTime: 0.5, pct: 0.34, duration: 3 },
      desc: 'Knit your wounds: restores {pct} of your health over {duration} seconds.',
      enhance: { desc: 'Restores a third more.', effects: [param('mend', 'pct', 'mul', 1.33)] },
      upgrades: [
        { name: 'Clean Slate', desc: 'Also makes you Unstoppable for 2 seconds, shaking off any hold.', effects: [onCast('mend', selfStatus('unstoppable', 2))] },
        { name: 'Clear Mind', desc: 'Also restores 30 Focus.', effects: [onCast('mend', gain(30))] },
      ],
    },
    {
      id: 'frostward', name: 'Frost Ward', category: 'defensive', tags: ['defensive', 'area', 'frost'], element: 'frost', icon: 'snow',
      behavior: 'nova', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 16, castTime: 0.4, radius: 3.2, coef: 0.7, freeze: 1.2, barrierPct: 0.2, barrierDur: 5 },
      desc: 'A ring of frost: enemies within {radius} paces take {coef} weapon damage and freeze for {freeze} seconds, and you gain a barrier of {barrierPct} of your health.',
      enhance: { desc: 'The ring is a quarter wider.', effects: [param('frostward', 'radius', 'mul', 1.25)] },
      upgrades: [
        { name: 'Thick Rime', desc: 'The barrier is 15% of your health stronger.', effects: [param('frostward', 'barrierPct', 'add', 0.15)] },
        { name: 'Brittle', desc: 'Enemies caught are Vulnerable for 3 seconds.', effects: [param('frostward', 'vuln', 'set', 3)] },
      ],
    },
    {
      id: 'galestep', name: 'Gale Step', category: 'mobility', tags: ['mobility', 'movement', 'storm'], element: 'storm', icon: 'step',
      behavior: 'dash', anim: 'lunge', targeting: 'direction', range: 6,
      params: { cooldown: 6, distance: 6, speed: 30, width: 1.3, coef: 0, invuln: 0.35 },
      desc: 'Ride the wind {distance} paces, untouchable while you move: the way through a charge or out of a slam.',
      enhance: { desc: 'Carries you a quarter farther.', effects: [param('galestep', 'distance', 'mul', 1.25)] },
      upgrades: [
        { name: 'Parting Gust', desc: 'Cuts whatever it passes through for 120% weapon damage.', effects: [param('galestep', 'coef', 'set', 1.2)] },
        { name: 'Second Breath', desc: 'Restores 15 Focus.', effects: [onCast('galestep', gain(15))] },
      ],
    },
    {
      id: 'inkfall', name: 'Inkfall', category: 'mastery', tags: ['mastery', 'area', 'fire'], element: 'fire', icon: 'meteor',
      behavior: 'blast', anim: 'cast', targeting: 'ground', range: 12,
      params: { cost: 40, castTime: 0.45, radius: 3.0, delay: 0.9, coef: 3.0, burn: 0.5, burnDur: 3, zoneDur: 3, zoneCoef: 0.25, heavy: 1 },
      desc: 'Call down a blot of burning ink: after a moment it lands for {coef} weapon damage and leaves the ground burning.',
      enhance: { desc: 'Lands 0.3 seconds sooner.', effects: [param('inkfall', 'delay', 'add', -0.3)] },
      upgrades: [
        { name: 'Ink Shower', desc: 'Three smaller blots, each for 55% of the damage.', effects: [param('inkfall', 'count', 'set', 3), param('inkfall', 'scatter', 'set', 2.5), param('inkfall', 'radius', 'mul', 0.7), param('inkfall', 'coef', 'mul', 0.55)] },
        { name: 'Scorched Earth', desc: 'The burning ground lasts 3 seconds longer and burns 50% hotter.', effects: [param('inkfall', 'zoneDur', 'add', 3), param('inkfall', 'zoneCoef', 'mul', 1.5)] },
      ],
    },
    {
      id: 'blizzard', name: 'Blizzard', category: 'mastery', tags: ['mastery', 'area', 'frost'], element: 'frost', icon: 'cloud',
      behavior: 'zone', anim: 'cast', targeting: 'ground', range: 12,
      params: { cost: 40, castTime: 0.4, radius: 4, duration: 6, tick: 0.5, coef: 0.3, chill: 0.12 },
      desc: 'A storm of sleet over {radius} paces for {duration} seconds: {coef} weapon damage twice a second, Chilling.',
      enhance: { desc: 'Lasts 2 seconds longer.', effects: [param('blizzard', 'duration', 'add', 2)] },
      upgrades: [
        { name: 'Mobile Storm', desc: 'The storm follows you.', effects: [param('blizzard', 'follow', 'set', 1)] },
        { name: 'Deep Cold', desc: 'Chills twice as hard.', effects: [param('blizzard', 'chill', 'mul', 2)] },
      ],
    },
    {
      id: 'firestorm', name: 'Firestorm', category: 'ultimate', tags: ['ultimate', 'area', 'fire'], element: 'fire', icon: 'flame',
      behavior: 'zone', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 60, castTime: 0.5, radius: 5.5, duration: 8, tick: 0.5, coef: 0.55, burn: 0.3, burnDur: 2, follow: 1 },
      desc: 'Wreathe yourself in fire for {duration} seconds: everything within {radius} paces takes {coef} weapon damage twice a second and burns.',
      enhance: { desc: 'Cooldown 15 seconds shorter.', effects: [param('firestorm', 'cooldown', 'add', -15)] },
      upgrades: [
        { name: 'Wide Blaze', desc: 'The fire reaches 30% farther.', effects: [param('firestorm', 'radius', 'mul', 1.3)] },
        { name: 'Inferno', desc: 'The fire deals 40% more damage (×).', effects: [param('firestorm', 'more', 'add', 0.4)] },
      ],
    },
    {
      id: 'deepfreeze', name: 'Deep Freeze', category: 'ultimate', tags: ['ultimate', 'area', 'frost'], element: 'frost', icon: 'snow',
      behavior: 'nova', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 55, castTime: 0.55, radius: 7, coef: 3.2, freeze: 2.5, heavy: 1 },
      desc: 'Stop the world around you: everything within {radius} paces takes {coef} weapon damage and freezes for {freeze} seconds.',
      enhance: { desc: 'Cooldown 12 seconds shorter.', effects: [param('deepfreeze', 'cooldown', 'add', -12)] },
      upgrades: [
        { name: 'Glacial Shell', desc: 'Also gives you a barrier of 40% of your health for 6 seconds.', effects: [onCast('deepfreeze', barrier(0.4, 6))] },
        { name: 'Shatterpoint', desc: 'Everything caught is Vulnerable for 6 seconds.', effects: [param('deepfreeze', 'vuln', 'set', 6)] },
      ],
    },
  ],

  passives: [
    { id: 'kindling', name: 'Kindling', cluster: 'basic', max: 3, effects: [stat('dmgFire', 0.08)], desc: '+8% fire damage per rank.', icon: 'flame' },
    { id: 'rimecraft', name: 'Rimecraft', cluster: 'basic', max: 3, effects: [stat('dmgFrost', 0.08)], desc: '+8% frost damage per rank.', icon: 'snow' },
    { id: 'stormcraft', name: 'Stormcraft', cluster: 'core', max: 3, effects: [stat('dmgStorm', 0.08)], desc: '+8% storm damage per rank.', icon: 'spark' },
    { id: 'deepwell', name: 'Deep Well', cluster: 'core', max: 3, effects: [stat('resourceMax', 10)], desc: '+10 maximum Focus per rank.', icon: 'orb' },
    { id: 'warding', name: 'Warding', cluster: 'defensive', max: 3, effects: [stat('resistAll', 0.04)], desc: '+4% resistance to all elements per rank.', icon: 'shield' },
    { id: 'innerfire', name: 'Inner Fire', cluster: 'defensive', max: 3, effects: [stat('barrierGen', 0.15)], desc: 'Barriers you make are 15% stronger per rank.', icon: 'armor' },
    { id: 'quickening', name: 'Quickening', cluster: 'mobility', max: 3, effects: [stat('cdr', 0.04)], desc: '4% shorter cooldowns per rank.', icon: 'hourglass' },
    { id: 'glassmind', name: 'Glass Mind', cluster: 'mastery', max: 3, effects: [stat('critDamage', 0.12)], desc: '+12% critical strike damage per rank.', icon: 'burst' },
    { id: 'conduit', name: 'Conduit', cluster: 'mastery', max: 3, effects: [stat('resourceRegen', 0.1)], desc: 'Focus returns 10% faster per rank.', icon: 'orb' },
    { id: 'elementalist', name: 'Elementalist', cluster: 'ultimate', max: 3, effects: [stat('damage', 0.05)], desc: '+5% damage per rank.', icon: 'star' },
  ],

  keys: [
    { id: 'conflagration', name: 'Conflagration', effects: [stat('dmgVsBurning', 0.2, true)], desc: 'Burning enemies take 20% more damage (×) from you.', icon: 'flame' },
    { id: 'overflow', name: 'Overflow', effects: [onCastTag('core', 0.25, { do: 'refund' }, selfStatus('overflow', 8))], desc: 'Core skills have a 25% chance to cost nothing and to make your next Core skill deal 30% more damage (×).', icon: 'orb' },
    { id: 'shatter', name: 'Permafrost', effects: [stat('dmgVsCC', 0.25, true)], desc: 'Frozen and Stunned enemies take 25% more damage (×) from you.', icon: 'snow' },
  ],
};
