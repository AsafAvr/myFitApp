import type { Game } from '../game';
import type { AnyEntity, Monster } from '../types';
import type { ActionId } from '../../engine/bindings';
import { BAR_SIZE } from '../state/character';

const SLOT_ACTIONS: ActionId[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'];
const MENU_ACTIONS: [ActionId, string][] = [['inventory', 'inventory'], ['character', 'character'], ['skills', 'skills'], ['map', 'map'], ['journal', 'journal'], ['view', 'view']];

interface Ray { origin: number[]; dir: number[] }

export class Controls {
  private readonly game: Game;
  hover: AnyEntity | null = null;
  ground: { x: number; y: number; z: number } | null = null;
  private steerTime = 0;
  showLabels = false;

  constructor(game: Game) { this.game = game; }

  reset(): void { this.hover = null; this.ground = null; this.steerTime = 0; }

  menuKeys(): void {
    const g = this.game, input = g.input;
    if (input.capturing) return;
    for (const [action, panel] of MENU_ACTIONS) if (input.actionHit(action)) g.bus.emit('ui:toggle', panel);
    if (input.actionHit('menu')) g.bus.emit('ui:toggle', 'menu');
    this.showLabels = input.actionHeld('showLabels');
  }

  update(dt: number): void {
    const g = this.game, input = g.input, cam = g.camera, p = g.player, s = g.settings;
    const sens = s.camSensitivity, ix = s.invertCamX ? -1 : 1, iy = s.invertCamY ? -1 : 1;
    if (input.dragX || input.dragY) cam.rotate(-input.dragX * 0.006 * sens * ix, input.dragY * 0.005 * sens * iy);
    if (input.wheel) cam.zoom(input.wheel > 0 ? 1.12 : 0.89);
    if (input.pinch !== 1) cam.zoom(input.pinch);
    if (input.actionHeld('camLeft')) cam.rotate(1.9 * dt * sens * ix, 0);
    if (input.actionHeld('camRight')) cam.rotate(-1.9 * dt * sens * ix, 0);
    if (input.actionHeld('camUp')) cam.rotate(0, 1.2 * dt * sens * iy);
    if (input.actionHeld('camDown')) cam.rotate(0, -1.2 * dt * sens * iy);
    if (input.actionHit('zoomIn')) cam.zoom(0.85);
    if (input.actionHit('zoomOut')) cam.zoom(1.18);
    const rs = input.padRight;
    if (rs.x || rs.y) cam.rotate(-rs.x * 2.4 * dt * sens * ix, rs.y * 1.4 * dt * sens * iy);

    const ray = cam.ray(input.mouse.nx, input.mouse.ny) as Ray;
    if (this.hover) this.hover.hover = false;
    this.hover = input.mouse.inside && !g.paused ? this.pick(ray) : null;
    if (this.hover) this.hover.hover = true;
    this.ground = input.mouse.inside ? g.world.raycast(ray.origin, ray.dir) : null;
    g.canvas.style.cursor = this.hover ? 'pointer' : 'default';

    const it = p.intent;
    it.moveX = 0; it.moveZ = 0;
    this.menuKeys();
    if (g.paused || input.capturing) return;

    let f = input.stick.y + input.padLeft.y, r = input.stick.x + input.padLeft.x;
    if (input.actionHeld('moveUp')) f += 1;
    if (input.actionHeld('moveDown')) f -= 1;
    if (input.actionHeld('moveRight')) r += 1;
    if (input.actionHeld('moveLeft')) r -= 1;
    if (f || r) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const x = fx * f - fz * r, z = fz * f + fx * r;
      const l = Math.hypot(x, z), k = Math.min(1, l) / l;
      it.moveX = x * k; it.moveZ = z * k;
    }
    p.standStill = input.actionHeld('standStill');

    let leftSlot = 0;
    for (let i = 0; i < BAR_SIZE; i++) if (input.mouseButtonOf(SLOT_ACTIONS[i]) === 0) { leftSlot = i; break; }

    for (const c of input.clicks) {
      if (c.button !== 0) continue;
      const cray = cam.ray(c.nx, c.ny) as Ray;
      const hit = this.pick(cray, c.touch ? 1.8 : 1);
      if (hit && hit.kind === 'monster') this.engage(hit, leftSlot);
      else if (hit) this.setTarget(hit, true);
      else if (!g.zones.clickInteract(cray)) {
        const gr = g.world.raycast(cam.pos, cray.dir);
        if (!gr) continue;
        if (p.standStill) { g.skills.useSlot(leftSlot); continue; }
        p.moveTo = { x: gr.x, z: gr.z };
        p.pursue = false; p.queued = null;
        g.bus.emit('moveclick', { x: gr.x, y: g.world.surface(gr.x, gr.z), z: gr.z });
      }
    }
    if (input.steering() && !this.hover) {
      this.steerTime += dt;
      if (this.steerTime > 0.22 && this.ground) {
        if (p.standStill) g.skills.useSlot(leftSlot, { quiet: true });
        else { p.moveTo = { x: this.ground.x, z: this.ground.z }; p.pursue = false; p.queued = null; }
      }
    } else this.steerTime = 0;

    for (let i = 0; i < BAR_SIZE; i++) {
      if (i === leftSlot && input.mouseButtonOf(SLOT_ACTIONS[i]) === 0) continue;
      if (input.actionHit(SLOT_ACTIONS[i])) this.useSlot(i);
    }
    if (input.actionHit('potion')) g.playerSystem.drink();
    if (input.actionHit('evade')) {
      const toward = it.moveX || it.moveZ ? [it.moveX, it.moveZ] : this.ground ? [this.ground.x - p.x, this.ground.z - p.z] : null;
      g.skills.evade(toward?.[0], toward?.[1]);
    }
    if (input.actionHit('nextTarget')) this.cycleTarget();
    if (input.actionHit('interact')) this.act();
    if (input.acting || input.actionHeld('interact')) {
      const t = p.target;
      if (t && t.kind === 'monster' && !t.dead) { p.pursue = true; p.queued ??= { slot: 0 }; }
      else if (!t || t.dead) { const m = g.skills.assistTarget(9); if (m) this.engage(m, 0); }
    }
  }

  useSlot(i: number): void {
    const g = this.game, p = g.player;
    const s = g.skills.skillInSlot(i);
    if (!s) return;
    const t = p.target && p.target.kind === 'monster' && !p.target.dead ? p.target as Monster : null;
    if (s.def.targeting === 'enemy' && t && Math.hypot(t.x - p.x, t.z - p.z) > s.def.range + t.radius + 0.3) {
      p.queued = { slot: i }; p.pursue = true;
      return;
    }
    g.skills.useSlot(i);
  }

  engage(m: Monster, slot: number): void {
    const p = this.game.player;
    p.target = m; p.pursue = true; p.moveTo = null; p.queued = { slot };
    this.game.bus.emit('target', m);
  }

  actTarget(): AnyEntity | null {
    const g = this.game, p = g.player, t = p.target;
    if (t && t.kind === 'monster' && !t.dead) return t;
    return g.skills.assistTarget(9) ?? g.entities.nearest('npc', p.x, p.z, 7);
  }

  act(): AnyEntity | null {
    const g = this.game;
    if (g.zones.interact()) return null;
    const e = this.actTarget();
    if (e && e.kind === 'monster') this.engage(e, 0);
    else if (e) this.setTarget(e, true);
    return e;
  }

  setTarget(e: AnyEntity, pursue: boolean): void {
    const p = this.game.player;
    p.target = e; p.pursue = pursue; p.moveTo = null; p.queued = null;
    this.game.bus.emit('target', e);
  }

  cycleTarget(): void {
    const g = this.game, p = g.player;
    const near = g.monsters.filter((m) => !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 18)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    if (!near.length) return;
    const i = near.indexOf(p.target as Monster);
    this.setTarget(near[(i + 1) % near.length], false);
  }

  pick(ray: Ray, fat = 1): AnyEntity | null {
    const o = ray.origin, d = ray.dir;
    let best: AnyEntity | null = null, bt = 1e9;
    for (const e of this.game.entities.list) {
      if (e.kind === 'player' || e.kind === 'missile' || e.dead || e.gone) continue;
      const r = Math.max(e.radius * 1.35, e.height * 0.5) * (e.kind === 'drop' ? 1.3 : 1) * fat;
      const cx = e.x - o[0], cy = e.y + e.height * 0.5 + e.lift - o[1], cz = e.z - o[2];
      const b = cx * d[0] + cy * d[1] + cz * d[2];
      if (b < 0) continue;
      const h = cx * cx + cy * cy + cz * cz - b * b;
      const score = fat > 1 ? h / (r * r) : b;
      if (h < r * r && score < bt) { bt = score; best = e; }
    }
    return best;
  }
}
