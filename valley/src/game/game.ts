import { GAME } from '../config.js';
import { damp } from '../core/math.js';
import { World } from '../world/world.js';
import { Renderer } from '../gfx/renderer.js';
import { Camera } from '../gfx/camera.js';
import { EventBus } from '../engine/events';
import { Input } from '../engine/input';
import { Rng } from '../engine/rng';
import type { Settings } from '../settings/settings';
import { wantsLessMotion } from '../settings/settings';
import type { GameEvents } from './events';
import type { Monster, Player } from './types';
import type { Character } from './state/character';
import type { ItemInstance } from './rules/items';
import { Entities } from './entities';
import { createEnv, updateEnv, type Env } from './environment';
import { Fx } from './fx';
import { View } from './view';
import { Controls } from './systems/controls';
import { PlayerSystem, makePlayer } from './systems/player';
import { MonsterAI } from './systems/ai';
import { Combat } from './systems/combat';
import { Skills } from './systems/skills';
import { StatusSystem } from './systems/status';
import { Spawner } from './systems/spawner';
import { Loot } from './systems/loot';
import { Bounties } from './systems/bounties';
import { Tutorial } from './systems/tutorial';
import { Hazards } from './systems/hazards';
import { Discover } from './systems/discover';
import { Stakes } from './systems/stakes';
import { Zones } from './systems/zones';
import { Vendors } from './systems/vendors';
import { Faces } from './systems/faces';

const HOLD_MAX = 0.14;
const HOLD_RATE = 0.06;
const LOW_HEALTH = 0.3;

export interface System { update(dt: number): void; reset?(): void }

export interface GameOptions {
  seed: number;
  touch: boolean;
  settings: Settings;
  char: Character;
  persist: (char: Character) => void;
  stash: (ItemInstance | null)[][];
  persistAccount: () => void;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly bus = new EventBus<GameEvents>();
  readonly input: Input;
  readonly rng: Rng;
  readonly seed: number;
  settings: Settings;
  touch: boolean;
  reducedMotion = false;

  world: World;
  readonly overworld: World;
  readonly renderer: Renderer;
  readonly camera: Camera;
  readonly env: Env;
  readonly entities = new Entities();
  monsters: Monster[] = [];
  player!: Player;
  hour: number = GAME.START_HOUR;
  biome: ReturnType<World['biome']>;

  readonly look = { hurt: 0, fade: 0, fadeGoal: 1 };
  stop = 0;
  low = false;
  paused = true;
  started = false;
  menuPause = false;
  time = 0;
  private saveTimer = 8;
  private warmed = false;
  private lastFrame = 0;
  fps = 60;
  private readonly persist: (char: Character) => void;
  readonly stash: (ItemInstance | null)[][];
  readonly persistAccount: () => void;

  readonly fx: Fx;
  readonly combat: Combat;
  readonly skills: Skills;
  readonly status: StatusSystem;
  readonly loot: Loot;
  readonly bounties: Bounties;
  readonly controls: Controls;
  readonly spawner: Spawner;
  readonly view: View;
  readonly tutorial: Tutorial;
  readonly hazards: Hazards;
  readonly discover: Discover;
  readonly stakes: Stakes;
  readonly zones: Zones;
  readonly vendors: Vendors;
  readonly playerSystem: PlayerSystem;
  readonly faces: Faces;
  private readonly systems: System[];

  constructor(canvas: HTMLCanvasElement, o: GameOptions) {
    this.canvas = canvas;
    this.settings = o.settings;
    this.touch = o.touch;
    this.persist = o.persist;
    this.stash = o.stash;
    this.persistAccount = o.persistAccount;
    this.seed = o.seed;
    this.rng = new Rng(Date.now() ^ o.seed);
    this.input = new Input(canvas, o.settings.keys, o.settings.pad);
    this.overworld = new World(o.seed);
    this.world = this.overworld;
    this.renderer = new Renderer(canvas, this.world, { lite: o.touch || o.settings.quality === 'low' });
    if (o.settings.quality === 'high') this.renderer.quality = 'high';
    this.camera = new Camera();
    this.env = createEnv();
    this.biome = this.world.biome(0, 0);

    this.fx = new Fx(this);
    this.combat = new Combat(this);
    this.status = new StatusSystem(this);
    this.loot = new Loot(this);
    this.skills = new Skills(this);
    this.bounties = new Bounties(this);
    this.controls = new Controls(this);
    this.spawner = new Spawner(this);
    this.view = new View(this);
    this.tutorial = new Tutorial(this);
    this.hazards = new Hazards(this);
    this.discover = new Discover(this);
    this.stakes = new Stakes(this);
    this.zones = new Zones(this);
    this.vendors = new Vendors(this);
    this.playerSystem = new PlayerSystem(this);
    this.faces = new Faces(this);
    this.systems = [
      this.controls, this.playerSystem, new MonsterAI(this), this.hazards, this.skills, this.status, this.loot,
      this.spawner, this.discover, this.zones, this.bounties, this.stakes, this.tutorial, this.faces, this.fx,
    ];

    this.loadCharacter(o.char);
    this.applySettings(o.settings);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }

  loadCharacter(char: Character): void {
    if (this.player) this.save();
    this.entities.clear(() => false);
    this.monsters = [];
    if (this.world !== this.overworld) this.useWorld(this.overworld);
    if (char.zone.kind === 'dungeon') { char.pos = { x: char.zone.x + 1.5, z: char.zone.z + 4.2 }; char.zone = { kind: 'overworld' }; }
    this.player = this.entities.add(makePlayer(this, char));
    this.hour = char.hour;
    for (const s of this.systems) s.reset?.();
    this.playerSystem.recompile(true);
    this.biome = this.world.biome(this.player.x, this.player.z);
    this.camera.target = [this.player.x, this.player.y + 1, this.player.z];
    this.fillWorld();
    this.bus.emit('character:loaded', this.player);
  }

  useWorld(world: World): void {
    this.world = world;
    this.renderer.setWorld(world);
  }

  fillWorld(): void {
    const p = this.player;
    while (this.renderer.worldTex.update(p.x, p.z, 16) > 0) {}
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.input.keyBindings = s.keys;
    this.input.padBindings = s.pad;
    this.reducedMotion = wantsLessMotion(s);
    if (s.quality !== 'auto') this.renderer.quality = s.quality;
    this.renderer.steady = s.steadyLines;
    this.view.smooth = s.smoothFigures;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), Math.min(devicePixelRatio || 1, 2));
  }

  start(): void {
    let last = performance.now();
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      const cap = this.settings.fpsCap;
      if (cap && now - this.lastFrame < 1000 / cap - 1.5) return;
      this.lastFrame = now;
      const ms = now - last;
      last = now;
      this.fps += (1000 / Math.max(1, ms) - this.fps) * 0.05;
      this.frame(Math.min(ms / 1000, 0.05), ms);
    };
    requestAnimationFrame(tick);
  }

  hold(seconds: number): void {
    if (this.reducedMotion || !this.settings.hitStop) return;
    this.stop = Math.max(this.stop, Math.min(seconds, HOLD_MAX));
  }

  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.camera.shake = Math.min(1, this.camera.shake + amount * this.settings.screenShake);
  }

  rumble(strength: number, ms: number): void {
    if (this.settings.vibration && this.input.lastDevice === 'pad') this.input.rumble(strength, ms);
  }

  get frozen(): boolean { return this.menuPause && this.started; }

  frame(real: number, ms: number): void {
    const p = this.player, w = this.world;
    this.input.poll();
    let dt = real * this.settings.gameSpeed;
    if (this.stop > 0) { this.stop -= real; dt *= HOLD_RATE; }
    if (this.frozen) {
      this.controls.menuKeys();
    } else {
      this.time += dt;
      if (!this.paused && w === this.overworld) this.hour = (this.hour + dt * 24 / GAME.DAY_SECONDS) % 24;
      for (const s of this.systems) s.update(dt);
      p.char.played += dt;
    }
    this.entities.sweep();
    this.bus.emit('frame', real);

    this.biome = w.biome(p.x, p.z);
    updateEnv(this.env, this.hour, this.biome.rock);
    this.zones.dressEnv(this.env);
    if (w === this.overworld) {
      this.env.cloud = 0.36 + 0.24 * Math.sin(this.time / 83 + p.x * 0.002) * Math.cos(this.time / 131 + p.z * 0.0017);
    }
    const low = !p.dead && p.hp < p.maxHp * (this.low ? LOW_HEALTH + 0.08 : LOW_HEALTH);
    if (low !== this.low) { this.low = low; if (low && !this.paused) this.bus.emit('lowhealth'); }
    const floor = low ? 0.56 + (this.reducedMotion ? 0 : 0.14 * Math.sin(this.time * 3.2)) : 0;
    this.look.hurt = Math.max(floor, this.look.hurt - real * 2.2);
    this.look.fade = damp(this.look.fade, this.look.fadeGoal, 3, real);

    this.renderer.worldTex.update(p.x, p.z, 2);
    w.prune(p.x, p.z);
    this.camera.still = this.reducedMotion;
    this.camera.update(real, [p.x, p.y + 1.0, p.z], this.renderer.size.cssW / this.renderer.size.cssH, (x: number, z: number) => w.surface(x, z));
    if (!this.warmed) this.warmed = this.renderer.warm();
    if (this.settings.quality === 'auto') this.renderer.adapt(ms);
    this.renderer.render(this.view.build(this.time));
    this.input.endFrame();

    this.saveTimer -= real;
    if (this.saveTimer <= 0) { this.saveTimer = 8; this.save(); }
  }

  save(): void {
    const p = this.player;
    if (!p || !this.started) return;
    const c = p.char;
    if (this.world === this.overworld) c.pos = { x: p.x, z: p.z };
    c.hour = this.hour;
    c.hp = p.hp;
    c.resource = p.resource;
    c.view = [this.camera.goal.pitch, this.camera.goal.distance];
    this.persist(c);
  }

  begin(): void {
    this.started = true;
    this.paused = false;
    this.bus.emit('begin');
  }
}
