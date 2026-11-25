import type { ClassDef } from '../skills';
import { barrier, gain, heal, onCast, onHitDo, onKill, param, selfStatus, stat } from './helpers';

export const WARDEN: ClassDef = {
  id: 'warden',
  name: 'Warden',
  tagline: 'The hearth’s shield',
  about: 'Steel and stubbornness. Wardens fight up close, earn Resolve with every blow given or taken, and spend it on cuts that clear a ring of foes.',
  primary: 'might',
  resource: { name: 'Resolve', max: 100, regen: 0, startFull: false, onHurt: 1.2, decay: [6, 4], color: '#b3341f' },
  weapons: ['sword', 'axe', 'mace', 'greatsword', 'greataxe'],
  offhands: ['shield'],
  kit: 0,
  pencils: [[214 / 255, 70 / 255, 52 / 255], [84 / 255, 108 / 255, 156 / 255], [122 / 255, 62 / 255, 44 / 255]],
  start: ['strike', 'cleave'],
  gear: ['sword', 'jerkin'],

  skills: [
    {
      id: 'strike', name: 'Strike', category: 'basic', tags: ['basic', 'melee', 'physical'], element: 'physical', icon: 'slash',
      behavior: 'melee', anim: 'swing', targeting: 'enemy', range: 1.7,
      params: { coef: 0.95, generate: 12, castTime: 0.42, reach: 1.9, arc: 0.3, targets: 1, hits: 1 },
      desc: 'A quick, plain blow for {coef} weapon damage. Generates {generate} Resolve.',
      enhance: { desc: 'Generates 4 more Resolve, and each hit mends 1% of your health.', effects: [param('strike', 'generate', 'add', 4), onHitDo('strike', heal(0.01))] },
      upgrades: [
        { name: 'Sundering Strike', desc: 'Strike makes enemies Vulnerable for 2 seconds.', effects: [param('strike', 'vuln', 'set', 2)] },
        { name: 'Sweeping Strike', desc: 'Strike hits every enemy in a wide arc in front of you.', effects: [param('strike', 'targets', 'set', 8), param('strike', 'arc', 'set', -0.2)] },
      ],
    },
    {
      id: 'bash', name: 'Shield Bash', category: 'basic', tags: ['basic', 'melee', 'physical'], element: 'physical', icon: 'shield',
      behavior: 'melee', anim: 'swing', targeting: 'enemy', range: 1.6,
      params: { coef: 0.75, generate: 10, castTime: 0.46, reach: 1.8, arc: 0.3, targets: 1, hits: 1, stun: 1, stunChance: 0.25, knock: 1.5 },
      desc: 'Slam an enemy for {coef} weapon damage, with a {stunChance} chance to Stun it for {stun} seconds. Generates {generate} Resolve.',
      enhance: { desc: 'The chance to Stun rises by 20%.', effects: [param('bash', 'stunChance', 'add', 0.2)] },
      upgrades: [
        { name: 'Staggering Bash', desc: 'Bash throws enemies far back.', effects: [param('bash', 'knock', 'set', 7)] },
        { name: 'Bracing Bash', desc: 'Each Bash gives you a barrier of 4% of your health for 3 seconds.', effects: [onCast('bash', barrier(0.04, 3))] },
      ],
    },
    {
      id: 'cleave', name: 'Cleave', category: 'core', tags: ['core', 'melee', 'area', 'physical'], element: 'physical', icon: 'cleave',
      behavior: 'melee', anim: 'swing', targeting: 'direction', range: 2.6,
      params: { coef: 1.6, cost: 30, castTime: 0.48, hitAt: 0.5, reach: 3.0, arc: 0, targets: 12, hits: 1, knock: 1.8, heavy: 1 },
      desc: 'A wide cut through everything in front of you for {coef} weapon damage.',
      enhance: { desc: 'Cleave reaches a fifth farther.', effects: [param('cleave', 'reach', 'mul', 1.2)] },
      upgrades: [
        { name: 'Rending Cleave', desc: 'Enemies hit Bleed for 60% of the blow over 4 seconds.', effects: [param('cleave', 'bleed', 'set', 0.6), param('cleave', 'bleedDur', 'set', 4)] },
        { name: 'Full Circle', desc: 'Cleave cuts all the way around you, for 10% less damage.', effects: [param('cleave', 'arc', 'set', -1), param('cleave', 'coef', 'mul', 0.9)] },
      ],
    },
    {
      id: 'whirl', name: 'Whirl', category: 'core', tags: ['core', 'melee', 'area', 'physical'], element: 'physical', icon: 'spiral',
      behavior: 'nova', anim: 'swing', targeting: 'self', range: 0,
      params: { coef: 1.25, cost: 32, castTime: 0.5, hitAt: 0.5, radius: 2.7, knock: 1 },
      desc: 'Spin with your weapon out, hitting everything around you for {coef} weapon damage.',
      enhance: { desc: 'Whirl reaches a quarter farther.', effects: [param('whirl', 'radius', 'mul', 1.25)] },
      upgrades: [
        { name: 'Eye of the Storm', desc: 'Whirl draws enemies in toward you.', effects: [param('whirl', 'pull', 'set', 1), param('whirl', 'knock', 'set', 0)] },
        { name: 'Second Wind', desc: 'Each enemy Whirl hits gives back 4 Resolve.', effects: [param('whirl', 'genPerHit', 'add', 4)] },
      ],
    },
    {
      id: 'rally', name: 'Rallying Cry', category: 'defensive', tags: ['defensive', 'shout', 'buff'], element: 'physical', icon: 'horn',
      behavior: 'buff', anim: 'cast', targeting: 'self', range: 0, status: 'rally',
      params: { cooldown: 18, castTime: 0.4, duration: 6, potency: 0.2 },
      desc: 'A shout that steels you: take {potency} less damage and gain 40% more Resolve for {duration} seconds.',
      enhance: { desc: 'Cooldown 4 seconds shorter.', effects: [param('rally', 'cooldown', 'add', -4)] },
      upgrades: [
        { name: 'Rousing Cry', desc: 'Also mends 15% of your health.', effects: [onCast('rally', heal(0.15))] },
        { name: 'Quickening Cry', desc: 'Also gives you Haste: 20% faster for 6 seconds.', effects: [onCast('rally', selfStatus('haste', 6, 0.2))] },
      ],
    },
    {
      id: 'ironhide', name: 'Iron Hide', category: 'defensive', tags: ['defensive', 'buff'], element: 'physical', icon: 'armor',
      behavior: 'barrier', anim: 'cast', targeting: 'self', range: 0,
      params: { cooldown: 16, castTime: 0.35, pct: 0.25, duration: 5 },
      desc: 'Harden like old bark: a barrier of {pct} of your health for {duration} seconds.',
      enhance: { desc: 'The barrier is 10% of your health stronger.', effects: [param('ironhide', 'pct', 'add', 0.1)] },
      upgrades: [
        { name: 'Iron Barbs', desc: 'While it holds, attackers take half of every blow back.', effects: [onCast('ironhide', selfStatus('thorns', 5, 0.5))] },
        { name: 'Unyielding', desc: 'You are Unstoppable for 5 seconds.', effects: [onCast('ironhide', selfStatus('unstoppable', 5))] },
      ],
    },
    {
      id: 'leap', name: 'Leap', category: 'mobility', tags: ['mobility', 'movement', 'area', 'physical'], element: 'physical', icon: 'leap',
      behavior: 'leap', anim: 'lunge', targeting: 'ground', range: 8,
      params: { cooldown: 12, castTime: 0.55, distance: 8, radius: 2.6, coef: 1.1, knock: 2 },
      desc: 'Leap to a spot up to {distance} paces away and land for {coef} weapon damage around you.',
      enhance: { desc: 'Cooldown 3 seconds shorter.', effects: [param('leap', 'cooldown', 'add', -3)] },
      upgrades: [
        { name: 'Earthshaker', desc: 'The landing Stuns for 1.5 seconds.', effects: [param('leap', 'stun', 'set', 1.5)] },
        { name: 'Crushing Landing', desc: 'The landing makes enemies Vulnerable for 3 seconds.', effects: [param('leap', 'vuln', 'set', 3)] },
      ],
    },
    {
      id: 'charge', name: 'Charge', category: 'mobility', tags: ['mobility', 'movement', 'physical'], element: 'physical', icon: 'charge',
      behavior: 'dash', anim: 'lunge', targeting: 'direction', range: 9,
      params: { cooldown: 10, distance: 9, speed: 24, width: 1.3, coef: 0.8, knock: 4, invuln: 0.3 },
      desc: 'Run headlong {distance} paces, knocking aside everything in the way for {coef} weapon damage.',
      enhance: { desc: 'Cooldown 2 seconds shorter.', effects: [param('charge', 'cooldown', 'add', -2)] },
      upgrades: [
        { name: 'Headlong', desc: 'Charge gives 20 Resolve.', effects: [param('charge', 'generate', 'add', 20)] },
        { name: 'Battering Ram', desc: 'Charge deals twice the damage.', effects: [param('charge', 'coef', 'mul', 2)] },
      ],
    },
    {
      id: 'earthsplitter', name: 'Earthsplitter', category: 'mastery', tags: ['mastery', 'area', 'physical'], element: 'physical', icon: 'quake',
      behavior: 'blast', anim: 'swing', targeting: 'ground', range: 7,
      params: { cooldown: 9, castTime: 0.5, radius: 3.0, delay: 0.45, coef: 2.4, knock: 2, heavy: 1 },
      desc: 'Split the ground where you aim; after a moment it bursts for {coef} weapon damage.',
      enhance: { desc: 'The burst is a fifth wider.', effects: [param('earthsplitter', 'radius', 'mul', 1.2)] },
      upgrades: [
        { name: 'Broken Ground', desc: 'The ground stays broken for 4 seconds, slowing enemies by 40%.', effects: [param('earthsplitter', 'zoneDur', 'set', 4), param('earthsplitter', 'zoneSlow', 'set', 0.4)] },
        { name: 'Aftershock', desc: 'The ground bursts a second time, for 60% of the damage.', effects: [param('earthsplitter', 'echo', 'set', 0.6)] },
      ],
    },
    {
      id: 'brand', name: 'Hearthfire Brand', category: 'mastery', tags: ['mastery', 'buff', 'fire'], element: 'fire', icon: 'flame',
      behavior: 'buff', anim: 'cast', targeting: 'self', range: 0, status: 'brand',
      params: { cooldown: 20, castTime: 0.4, duration: 8, potency: 0.2 },
      desc: 'Set your weapon alight for {duration} seconds: your attacks come {potency} faster and set enemies Burning.',
      enhance: { desc: 'Lasts 4 seconds longer.', effects: [param('brand', 'duration', 'add', 4)] },
      upgrades: [
        { name: 'Searing Brand', desc: 'You deal 15% more damage (×) to Burning enemies.', effects: [stat('dmgVsBurning', 0.15, true)] },
        { name: 'Keen Brand', desc: 'Brand also gives Hawk’s Eye: +10% critical strike chance for 10 seconds.', effects: [onCast('brand', selfStatus('hawkeye', 10, 0.1))] },
      ],
    },
    {
      id: 'laststand', name: 'Last Stand', category: 'ultimate', tags: ['ultimate', 'buff'], element: 'physical', icon: 'banner',
      behavior: 'buff', anim: 'cast', targeting: 'self', range: 0, status: 'laststand',
      params: { cooldown: 60, castTime: 0.5, duration: 10, potency: 1 },
      desc: 'Plant your feet. For {duration} seconds you deal 50% more damage (×) and take 30% less.',
      enhance: { desc: 'Cooldown 15 seconds shorter.', effects: [param('laststand', 'cooldown', 'add', -15)] },
      upgrades: [
        { name: 'Undying', desc: 'Also mends 30% of your health.', effects: [onCast('laststand', heal(0.3))] },
        { name: 'Unending', desc: 'Lasts 5 seconds longer.', effects: [param('laststand', 'duration', 'add', 5)] },
      ],
    },
    {
      id: 'avalanche', name: 'Avalanche', category: 'ultimate', tags: ['ultimate', 'area', 'physical'], element: 'physical', icon: 'meteor',
      behavior: 'blast', anim: 'swing', targeting: 'self', range: 0,
      params: { cooldown: 50, castTime: 0.55, radius: 2.5, delay: 0.5, coef: 2.6, count: 6, scatter: 5, stagger: 0.22, knock: 2, heavy: 1 },
      desc: 'Bring the hillside down: {count} boulders fall around you, each for {coef} weapon damage.',
      enhance: { desc: 'Two more boulders fall.', effects: [param('avalanche', 'count', 'add', 2)] },
      upgrades: [
        { name: 'Stunning Rocks', desc: 'Each boulder Stuns for 2 seconds.', effects: [param('avalanche', 'stun', 'set', 2)] },
        { name: 'Grinding Stone', desc: 'Each boulder makes enemies Vulnerable for 4 seconds.', effects: [param('avalanche', 'vuln', 'set', 4)] },
      ],
    },
  ],

  passives: [
    { id: 'toughskin', name: 'Tough Skin', cluster: 'basic', max: 3, effects: [stat('lifePct', 0.04)], desc: '+4% maximum health per rank.', icon: 'heart' },
    { id: 'quickhands', name: 'Quick Hands', cluster: 'basic', max: 3, effects: [stat('attackSpeed', 0.04)], desc: '+4% attack speed per rank.', icon: 'hands' },
    { id: 'heavyhand', name: 'Heavy Hand', cluster: 'core', max: 3, effects: [stat('dmgPhysical', 0.08)], desc: '+8% physical damage per rank.', icon: 'fist' },
    { id: 'bloodletter', name: 'Bloodletter', cluster: 'core', max: 3, effects: [stat('dmgVsBleeding', 0.1)], desc: '+10% damage to Bleeding enemies per rank.', icon: 'drop' },
    { id: 'ironwill', name: 'Iron Will', cluster: 'defensive', max: 3, effects: [stat('armorPct', 0.1)], desc: '+10% armor per rank.', icon: 'armor' },
    { id: 'stalwart', name: 'Stalwart', cluster: 'defensive', max: 3, effects: [stat('resistAll', 0.04)], desc: '+4% resistance to all elements per rank.', icon: 'shield' },
    { id: 'momentum', name: 'Momentum', cluster: 'mobility', max: 3, effects: [stat('moveSpeed', 0.04)], desc: '+4% movement speed per rank.', icon: 'boot' },
    { id: 'executioner', name: 'Executioner', cluster: 'mastery', max: 3, effects: [stat('dmgVsInjured', 0.12)], desc: '+12% damage to enemies below 35% health per rank.', icon: 'skull' },
    { id: 'brute', name: 'Brute Force', cluster: 'mastery', max: 3, effects: [stat('critDamage', 0.12)], desc: '+12% critical strike damage per rank.', icon: 'burst' },
    { id: 'warhorn', name: 'Old Warhorn', cluster: 'ultimate', max: 3, effects: [stat('cdr', 0.04)], desc: '4% shorter cooldowns per rank.', icon: 'horn' },
  ],

  keys: [
    { id: 'unbroken', name: 'Unbroken', effects: [{ kind: 'stat', stat: 'damageTaken', value: -0.15, more: true, when: 'resourceHigh' }], desc: 'While you hold at least half your Resolve, you take 15% less damage (×).', icon: 'shield' },
    { id: 'bloodrage', name: 'Bloodrage', effects: [onKill(selfStatus('bloodrage', 6, 0, 1))], desc: 'Each kill gives Bloodrage for 6 seconds: 5% more damage (×), stacking 5 times.', icon: 'drop' },
    { id: 'wrath', name: 'Hearth’s Wrath', effects: [onKill(gain(6)), stat('dmgCore', 0.2, true)], desc: 'Core skills deal 20% more damage (×), and each kill gives 6 Resolve.', icon: 'flame' },
  ],
};
