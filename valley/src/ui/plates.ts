import type { Game } from '../game/game';
import type { AnyEntity, Monster, Npc, Drop } from '../game/types';
import { ELITE_AFFIXES } from '../game/content/monsters';
import { RARITY_COLORS } from '../settings/settings';

const GAP = 4;
const RISE = 44;
const SIZES: Record<string, [number, number]> = { '': [27, 22], hurt: [27, 22], crit: [38, 30], heal: [22, 18], xp: [20, 18], miss: [20, 18], dot: [19, 16] };
const RARITY_RANK = { common: 0, magic: 1, rare: 2, legendary: 3, unique: 4 } as const;

interface Node { el: HTMLDivElement; fill: HTMLElement | null; hp: number; w: number; h: number; lift: number; shown: boolean; goal?: boolean }
interface Floater { e: AnyEntity | null; x?: number; y?: number; z?: number; text: string; cls: string; dx: number; ph: number; el?: HTMLDivElement; t: number; life: number; w: number; h: number; up: number }
interface Box { l: number; t: number; r: number; b: number; hud?: boolean }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Plates {
  private readonly game: Game;
  private readonly root: HTMLElement;
  private readonly floatRoot: HTMLElement;
  private readonly nodes = new Map<number, Node>();
  private floaters: Floater[] = [];
  private pool: HTMLDivElement[] = [];
  private hud: Box[] = [];
  private hudAge = 99;

  constructor(game: Game, root: HTMLElement, floatRoot: HTMLElement) {
    this.game = game;
    this.root = root;
    this.floatRoot = floatRoot;
    const bus = game.bus;
    bus.on('damage', (d) => {
      const mode = game.settings.damageNumbers;
      if (mode === 'off' || (mode === 'crits' && !d.crit && d.target.kind !== 'player')) return;
      if (d.dot && d.target.kind === 'monster' && mode !== 'all') return;
      this.float(d.target, String(d.amount), d.target.kind === 'player' ? 'hurt' : d.dot ? 'dot' : d.crit ? 'crit' : '');
    });
    bus.on('miss', (d) => { if (game.settings.damageNumbers !== 'off') this.float(d.target, d.text, 'miss'); });
    bus.on('xp', (d) => { const p = game.player; if (game.settings.damageNumbers === 'all') this.floatAt(p.x, p.y + 2.5, p.z, `+${d.amount} xp`, 'xp'); });
    bus.on('heal', (d) => { if (d.entity.kind === 'player' && !d.focus && d.amount && d.amount > 2) this.floatAt(d.entity.x, d.entity.y + 2.1, d.entity.z, `+${Math.round(d.amount)}`, 'heal'); });
    bus.on('zone:enter', () => this.clear());
    bus.on('character:loaded', () => this.clear());
  }

  clear(): void {
    for (const n of this.nodes.values()) n.el.remove();
    this.nodes.clear();
    for (const f of this.floaters) if (f.el) { f.el.style.display = 'none'; this.pool.push(f.el); }
    this.floaters = [];
  }

  private float(e: AnyEntity, text: string, cls: string): void {
    let slot = 0;
    for (const o of this.floaters) if (o.e === e && o.t < 0.5) slot++;
    const dx = slot ? (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 36 : 0;
    this.push({ e, text, cls, dx, ph: 0, t: 0, life: 0, w: 0, h: 0, up: 0 });
  }
  private floatAt(x: number, y: number, z: number, text: string, cls: string): void {
    this.push({ e: null, x, y, z, text, cls, dx: 0, ph: 0, t: 0, life: 0, w: 0, h: 0, up: 0 });
  }

  private push(f: Floater): void {
    const el = this.pool.pop() || this.floatRoot.appendChild(document.createElement('div'));
    el.className = 'fl ' + f.cls;
    el.textContent = f.text;
    el.style.display = '';
    const scale = this.game.settings.damageNumberScale;
    el.style.fontSize = '';
    if (scale !== 1) el.style.fontSize = `${Math.round((SIZES[f.cls] || SIZES[''])[this.game.touch ? 1 : 0] * scale)}px`;
    const size = (SIZES[f.cls] || SIZES[''])[this.game.touch ? 1 : 0] * scale;
    f.el = el; f.t = 0; f.life = f.cls === 'crit' ? 1.1 : 0.9;
    f.w = f.text.length * size * 0.58 + 8; f.h = size + 2; f.up = 0;
    this.floaters.push(f);
  }

  private readHud(): void {
    const hud = this.hud;
    hud.length = 0;
    const add = (el: Element) => {
      if ((el as HTMLElement).hidden) return;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) hud.push({ l: r.left, t: r.top, r: r.right, b: r.bottom, hud: true });
    };
    for (const el of document.querySelectorAll('#ui section:not(#log), #ui nav, #log p, #toast.show, #place, body.touch #hotbar .slot, #panels .panel')) add(el);
  }

  private wantsSlip(m: Monster, dist: number, p: Game['player']): boolean {
    if (dist > 40) return false;
    if (m.marked || m.hover || m === p.target || m.boss) return true;
    const mode = this.game.settings.enemyBars;
    if (mode === 'off') return m.elite;
    if (mode === 'always') return true;
    return m.hp < m.maxHp || m.elite || m.ai.state === 'chase' || m.ai.state === 'attack';
  }

  update(dt: number): void {
    const g = this.game, cam = g.camera, p = g.player;
    const W = g.renderer.size.cssW, H = g.renderer.size.cssH;
    if ((this.hudAge += dt) > 0.25) { this.hudAge = 0; this.readHud(); }
    const placed: Box[] = [];
    const blocked = (l: number, r: number, lift: number, y: number, h: number): Box | null => {
      const b = y - lift, t = b - h;
      for (const o of this.hud) if (l < o.r + GAP && r > o.l - GAP && t < o.b + GAP && b > o.t - GAP) return o;
      for (const o of placed) if (l < o.r + GAP && r > o.l - GAP && t < o.b + GAP && b > o.t - GAP) return o;
      return null;
    };

    const labelsMin = RARITY_RANK[g.settings.lootLabels === 'all' ? 'common' : g.settings.lootLabels];
    const allLabels = g.controls.showLabels;
    const want: { e: AnyEntity; x: number; y: number; rank: number }[] = [];
    for (const e of g.entities.list) {
      if (e.kind === 'player' || e.dead || e.grow < 0.6) continue;
      const dist = Math.hypot(e.x - p.x, e.z - p.z);
      let show = false;
      if (e.kind === 'npc') show = dist < 30;
      else if (e.kind === 'monster') show = this.wantsSlip(e, dist, p);
      else if (e.kind === 'drop') {
        const r = e.rarity ? RARITY_RANK[e.rarity] : -1;
        show = e.age > 0.4 && (dist < 9 || (r >= 3 && dist < 30)) && (allLabels || e.loot.type !== 'item' || r >= labelsMin || e === p.target);
      }
      if (!show) continue;
      const s = cam.project(e.x, e.y + e.height + 0.25 + e.lift, e.z);
      if (!s || s.x < -0.1 || s.x > 1.1 || s.y < -0.1 || s.y > 1.1) continue;
      const m = e as Monster;
      const rank = e === p.target ? 0 : e.marked ? 0.5 : e.hover ? 1 : e.kind === 'monster' && m.boss ? 1.5 : e.kind === 'npc' ? 2 + dist * 0.01 : e.kind === 'drop' ? 200 + dist - (e.rarity ? RARITY_RANK[e.rarity] * 20 : 0) : (m.elite ? 5 : 10) + dist;
      want.push({ e, x: s.x * W, y: s.y * H, rank });
    }
    want.sort((a, b) => a.rank - b.rank);

    const seen = new Set<number>();
    for (const it of want) {
      const e = it.e;
      seen.add(e.id);
      let n = this.nodes.get(e.id);
      if (!n) {
        const el = this.root.appendChild(document.createElement('div'));
        if (e.kind === 'monster') {
          const m = e as Monster;
          el.className = 'np' + (m.boss ? ' boss' : m.elite ? ' elite' : '');
          const affixes = m.affixes.map((a) => ELITE_AFFIXES[a]?.name).filter(Boolean).join(' · ');
          el.innerHTML = `${esc(m.name)}<small>Lv ${m.level}</small>${affixes ? `<em>${esc(affixes)}</em>` : ''}<span class="mini"><i></i><b></b></span>`;
        } else if (e.kind === 'npc') {
          el.className = 'np npc';
          el.innerHTML = `${esc(e.name)}<small>${esc((e as Npc).title)}</small>`;
        } else {
          const d = e as Drop;
          el.className = 'np loot' + (d.rarity ? ` r-${d.rarity}` : '') + (d.loot.type === 'gold' ? ' gold' : '');
          if (d.rarity) el.style.setProperty('--rc', RARITY_COLORS[g.settings.colorVision][d.rarity]);
          el.textContent = e.name;
        }
        n = { el: el as HTMLDivElement, fill: el.querySelector('i'), hp: -1, w: el.offsetWidth, h: el.offsetHeight, lift: 0, shown: true };
        this.nodes.set(e.id, n);
      }
      if (n.goal !== !!e.marked) { n.goal = !!e.marked; n.el.classList.toggle('goal', n.goal); }
      const l = it.x - n.w / 2, r = it.x + n.w / 2;
      let need = 0, room = false;
      for (let tries = 0; tries < 6 && !room; tries++) {
        const hit = blocked(l, r, need, it.y, n.h);
        if (!hit) room = true;
        else if (hit.hud || need > 90) break;
        else need = it.y - hit.t + GAP;
      }
      if (room !== n.shown) { n.shown = room; n.el.style.visibility = room ? '' : 'hidden'; if (!room) n.lift = 0; }
      if (!room) continue;
      let lift = need;
      if (n.lift > need) { lift = Math.max(need, n.lift - 120 * dt); if (blocked(l, r, lift, it.y, n.h)) lift = need; }
      n.lift = lift;
      placed.push({ l, r, t: it.y - lift - n.h, b: it.y - lift });
      n.el.style.transform = `translate(${it.x.toFixed(1)}px, ${(it.y - n.lift).toFixed(1)}px) translate(-50%, -100%)`;
      if (n.fill && e.kind === 'monster') {
        const m = e as Monster;
        const hp = m.hp + m.barrier * 1000;
        if (n.hp !== hp) {
          n.hp = hp;
          n.fill.style.transform = `scaleX(${Math.max(0, m.hp / m.maxHp).toFixed(3)})`;
          const ward = n.el.querySelector('b') as HTMLElement | null;
          if (ward) ward.style.transform = `scaleX(${Math.min(1, m.barrier / m.maxHp).toFixed(3)})`;
        }
      }
    }
    for (const [id, n] of this.nodes) if (!seen.has(id)) { n.el.remove(); this.nodes.delete(id); }

    let w = 0;
    for (const f of this.floaters) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el!.style.display = 'none'; this.pool.push(f.el!); continue; }
      let x = 0, y = 0, s;
      if (f.e) {
        const e = f.e, n = this.nodes.get(e.id);
        if (n) f.ph = n.shown ? n.h + n.lift : 0;
        s = cam.project(e.x, e.y + e.height + 0.25 + (e.lift || 0), e.z);
        if (s) { x = s.x * W + f.dx; y = s.y * H - f.ph - 3 - k * RISE; }
      } else {
        s = cam.project(f.x!, f.y! + k * 1.1, f.z!);
        if (s) { x = s.x * W; y = s.y * H + f.h / 2; }
      }
      if (s) {
        const l = x - f.w / 2, r = x + f.w / 2;
        for (let tries = 0; tries < 6; tries++) {
          const b = y - f.up, t = b - f.h;
          let hit: Box | null = null;
          for (const o of placed) if (l < o.r + 2 && r > o.l - 2 && t < o.b + 2 && b > o.t - 2) { hit = o; break; }
          if (!hit) break;
          f.up = y - hit.t + 3;
        }
        placed.push({ l, r, t: y - f.up - f.h, b: y - f.up });
        f.el!.style.transform = `translate(${x.toFixed(1)}px, ${(y - f.up).toFixed(1)}px) translate(-50%, -100%)`;
        f.el!.style.opacity = k < 0.6 ? '1' : (1 - (k - 0.6) / 0.4).toFixed(2);
      } else f.el!.style.opacity = '0';
      this.floaters[w++] = f;
    }
    this.floaters.length = w;
  }
}
