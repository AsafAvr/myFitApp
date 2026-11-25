import { RENDER, WORLD } from '../config.js';
import { INSTANCE_FLOATS } from '../gfx/passes/entities.js';
import type { Game } from './game';
import type { AnyEntity, Monster, Player } from './types';
import { BASE } from './content/items';
import type { Particle } from './fx';

const DRAW_RANGE = 78;

interface Batch { data: Float32Array; count: number }
interface Light { x: number; y: number; z: number; r: number; k: number; d?: number }

export class View {
  private readonly game: Game;
  private readonly batches = new Map<string, Batch>();
  readonly frame;
  private lights: Light[] = [];
  private mark: Particle | null = null;
  private markFollow: AnyEntity | null = null;
  private tick = -1;
  smooth = false;

  constructor(game: Game) {
    this.game = game;
    this.frame = {
      camera: game.camera, env: game.env, focus: [0, 0, 0] as number[], time: 0, timeTwos: 0, far: 600, dpr: 1,
      look: game.look,
      casters: new Float32Array(RENDER.MAX_CASTERS * 4), casterCount: 0,
      lightPos: new Float32Array(RENDER.MAX_LIGHTS * 4), lightCol: new Float32Array(RENDER.MAX_LIGHTS * 3), lightCount: 0,
      batches: this.batches, fx: game.fx,
      reveal: [0, 0, 0, 0],
    };
  }

  private batch(id: string): Batch {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = { data: new Float32Array(INSTANCE_FLOATS * 16), count: 0 }));
    return b;
  }

  build(time: number) {
    const g = this.game, p = g.player, f = this.frame, cam = g.camera;
    for (const b of this.batches.values()) b.count = 0;
    const ents = g.entities.list;
    const casters: { e: AnyEntity; dist: number }[] = [];
    const tick = Math.floor(time * 12);
    const newDrawing = this.smooth || tick !== this.tick;
    this.tick = tick;
    f.timeTwos = this.smooth ? time : tick / 12;
    const flashes = g.settings.flashes && !g.reducedMotion;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const dist = Math.hypot(e.x - p.x, e.z - p.z);
      if (dist > DRAW_RANGE || e.grow <= 0.01) continue;
      const occ = g.world.chunk(Math.floor(e.x / WORLD.CHUNK), Math.floor(e.z / WORLD.CHUNK))
        .height[((Math.floor(e.z) & (WORLD.CHUNK - 1)) * WORLD.CHUNK + (Math.floor(e.x) & (WORLD.CHUNK - 1))) * 4 + 1];
      e.shade += ((1 - occ * 0.75) - e.shade) * 0.12;

      const b = this.batch(e.archetype);
      if ((b.count + 1) * INSTANCE_FLOATS > b.data.length) {
        const bigger = new Float32Array(b.data.length * 2);
        bigger.set(b.data);
        b.data = bigger;
      }
      const d = b.data, o = b.count++ * INSTANCE_FLOATS, c = e.colors, s = e.scale * e.grow;
      d[o] = e.x; d[o + 1] = e.y + e.lift; d[o + 2] = e.z; d[o + 3] = s;
      if (newDrawing || e.pose === undefined) e.pose = [e.yaw, e.walk, e.action, e.actionT];
      d[o + 4] = e.pose[0]; d[o + 5] = e.pose[1]; d[o + 6] = e.pose[2]; d[o + 7] = e.pose[3];
      d[o + 8] = e.seed; d[o + 9] = flashes ? e.flash : e.flash * 0.3; d[o + 10] = e.shade; d[o + 11] = (e.ghost ? 1 : 0) + (e.hover || e === p.target ? 2 : 0);
      const t = e.tint, k = t ? 0.45 : 0;
      d[o + 12] = c[0][0] + (t ? (t[0] - c[0][0]) * k : 0); d[o + 13] = c[0][1] + (t ? (t[1] - c[0][1]) * k : 0); d[o + 14] = c[0][2] + (t ? (t[2] - c[0][2]) * k : 0);
      d[o + 15] = e.kind === 'drop' ? 0 : e.move;
      d[o + 16] = c[1][0]; d[o + 17] = c[1][1]; d[o + 18] = c[1][2]; d[o + 19] = e.extra;
      d[o + 20] = c[2][0]; d[o + 21] = c[2][1]; d[o + 22] = c[2][2]; d[o + 23] = (e.kind === 'player' ? gearFlags(e) : 0) + 8 * (e.face ?? 0);
      if (e.kind !== 'drop' && e.kind !== 'missile' && dist < 45) casters.push({ e, dist });
    }

    casters.sort((a, b) => a.dist - b.dist);
    f.casterCount = Math.min(casters.length, RENDER.MAX_CASTERS);
    for (let i = 0; i < f.casterCount; i++) {
      const e = casters[i].e, r = Math.max(e.radius, e.height * 0.33) * e.scale * e.grow;
      f.casters.set([e.x, e.y + r * 1.05 + e.lift + (e.archetype === 'wisp' ? 0.6 : 0), e.z, r], i * 4);
    }

    this.collectLights();
    this.markTarget();

    const hs = cam.project(p.x, p.y + 0.8, p.z);
    if (hs && !g.paused && !p.dead) {
      f.reveal[0] = hs.x * 2 - 1; f.reveal[1] = 1 - hs.y * 2; f.reveal[2] = 0.3;
      f.reveal[3] = Math.hypot(cam.pos[0] - p.x, cam.pos[1] - p.y - 0.8, cam.pos[2] - p.z);
    } else f.reveal[2] = 0;

    f.time = time;
    f.focus = cam.target;
    g.fx.write();
    this.minimap();
    return f;
  }

  private minimap(): void {
    const g = this.game, p = g.player, mm = g.renderer.minimap, s = p.char.journey;
    mm.clear();
    mm.player = [p.x, p.z, p.yaw];
    const reach = Math.max(8, mm.rect[2] * mm.rect[3] - 7);
    const mark = (x: number, z: number, color: number, size: number) => {
      const dx = x - p.x, dz = z - p.z, dd = Math.hypot(dx, dz), k = dd > reach ? reach / dd : 1;
      mm.add(p.x + dx * k, p.z + dz * k, color, size);
    };
    const outside = g.world === g.overworld;
    if (outside) {
      for (const key in s.known) mark(s.known[key][0], s.known[key][1], 5, 2.8);
      const job = s.bounty;
      if (job && job.x !== undefined && job.have < job.need) mark(job.x, job.z!, 4, 3.4);
      if (s.satchel) mark(s.satchel.x, s.satchel.z, 3, 3.2);
      const lead = g.discover.lead;
      if (lead && !s.known[lead.key]) mark(lead.x, lead.z, 5, 2.2);
      for (const site of g.world.sites.inRange(p.x, p.z, 110)) mm.add(site.x, site.z, site.kind === 'dungeon' ? 4 : 2, site.kind === 'town' || site.kind === 'dungeon' ? 4 : 3.2);
    } else {
      const goal = g.zones.goal();
      if (goal) mark(goal.x, goal.z, 4, 3.4);
    }
    for (const e of g.entities.list) {
      if (e.kind === 'npc') mm.add(e.x, e.z, 1, 2.6);
      else if (e.kind === 'monster' && !e.dead) {
        const m = e as Monster;
        const quarry = s.bounty && s.bounty.monster === m.defId;
        mm.add(m.x, m.z, quarry || m.boss ? 4 : 0, m.boss ? 4 : m.elite ? 3 : 2);
      } else if (e.kind === 'drop') mm.add(e.x, e.z, 3, e.rarity === 'legendary' || e.rarity === 'unique' ? 2.4 : 1.4);
    }
  }

  private collectLights(): void {
    const g = this.game, p = g.player, f = this.frame;
    const night = g.env.night;
    const L = this.lights;
    L.length = 0;
    g.world.forEachProp(p.x, p.z, 44, (pr: { def: { light?: { always?: boolean; y: number; radius: number; forward?: number } }; rot: number; x: number; y: number; z: number; scale: number }) => {
      const l = pr.def.light;
      if (!l) return;
      const k = l.always ? 0.3 + 0.7 * night : night;
      if (k < 0.05) return;
      const fwdX = -Math.sin(pr.rot), fwdZ = Math.cos(pr.rot), o = l.forward || 0;
      L.push({ x: pr.x + fwdX * o, y: pr.y + l.y * pr.scale, z: pr.z + fwdZ * o, r: l.radius, k: k * (l.always ? 0.55 : 1) });
    });
    for (const m of g.monsters) if (m.def.glow && !m.dead && night > 0.05) L.push({ x: m.x, y: m.y + 1, z: m.z, r: 4.5, k: night * 0.7 });
    for (const l of g.fx.lights) L.push({ x: l.x, y: l.y, z: l.z, r: l.r, k: (l.life / l.max) * (0.25 + 0.75 * night) });
    for (const l of L) l.d = Math.hypot(l.x - p.x, l.z - p.z);
    L.sort((a, b) => a.d! - b.d!);
    f.lightCount = Math.min(L.length, RENDER.MAX_LIGHTS);
    for (let i = 0; i < f.lightCount; i++) {
      const l = L[i];
      f.lightPos.set([l.x, l.y, l.z, l.r], i * 4);
      f.lightCol.set([l.k, 0, 0], i * 3);
    }
  }

  private markTarget(): void {
    const g = this.game, t = g.player.target;
    if (this.mark && (!t || this.markFollow !== t)) { g.fx.release(this.mark); this.mark = null; this.markFollow = null; }
    if (t && !this.mark && t.kind !== 'drop') {
      const col: [number, number, number] = t.kind === 'monster' ? [0.84, 0.28, 0.2] : [0.33, 0.42, 0.61];
      this.mark = g.fx.spawn('mark', t.x, t.y, t.z, { size: t.radius * 2.1 + 0.25, color: col, ground: true, hold: true, follow: t, dy: 0.1, alpha: 1.2 });
      this.markFollow = t;
    }
  }
}

function gearFlags(p: Player): number {
  const main = p.char.equipment.mainhand ? BASE[p.char.equipment.mainhand.base] : null;
  const off = p.char.equipment.offhand ? BASE[p.char.equipment.offhand.base] : null;
  let f = 0;
  if (off?.type === 'shield') f += 1;
  if (main?.hands === 2 && (main.type === 'greatsword' || main.type === 'greataxe')) f += 2;
  if (p.char.classId === 'strider' && main?.type === 'dagger') f += 4;
  return f;
}
