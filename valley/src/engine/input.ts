import { PAD_BUTTONS, type ActionId, type KeyBindings, type PadBindings, type PadButton } from './bindings';

const TAP_SLOP = 10;
const DRAG_SLOP = 7;
const STICK_DEAD = 0.2;

export interface Click { x: number; y: number; nx: number; ny: number; button: number; touch?: boolean }
interface Touch { x: number; y: number; moved: number; multi: boolean }
interface Down { x: number; y: number; button: number; moved: number; lx: number; ly: number }
export interface Stick { x: number; y: number }

const UI_KEYS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  readonly canvas: HTMLCanvasElement;
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly mouse = { x: 0, y: 0, nx: 0, ny: 0, inside: false, left: false, right: false };
  readonly clicks: Click[] = [];
  wheel = 0;
  dragX = 0; dragY = 0;
  any = false;
  down: Down | null = null;
  readonly stick: Stick = { x: 0, y: 0 };
  acting = false;
  pinch = 1;
  readonly touches = new Map<number, Touch>();

  padConnected = false;
  readonly padHeld = new Set<PadButton>();
  readonly padPressed = new Set<PadButton>();
  readonly padLeft: Stick = { x: 0, y: 0 };
  readonly padRight: Stick = { x: 0, y: 0 };
  lastDevice: 'mouse' | 'touch' | 'pad' = 'mouse';

  keyBindings: KeyBindings;
  padBindings: PadBindings;
  private capture: ((code: string, device: 'key' | 'pad') => void) | null = null;

  constructor(canvas: HTMLCanvasElement, keyBindings: KeyBindings, padBindings: PadBindings) {
    this.canvas = canvas;
    this.keyBindings = keyBindings;
    this.padBindings = padBindings;

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && (e.target as HTMLInputElement).type !== 'range' && (e.target as HTMLInputElement).type !== 'checkbox';
    const uiOwns = (e: KeyboardEvent) => {
      if (!UI_KEYS.has(e.code)) return false;
      const a = document.activeElement;
      return !!a && a !== document.body && a !== canvas && !!a.closest('#ui, #app');
    };
    addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture; this.capture = null;
        cb(e.code, 'key');
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || uiOwns(e)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.any = true;
      this.lastDevice = 'mouse';
      if (/^(Space|Tab|Arrow|Digit|Key|Alt)/.test(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.release());

    const place = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const m = this.mouse;
      m.x = e.clientX - r.left; m.y = e.clientY - r.top;
      m.nx = (m.x / r.width) * 2 - 1; m.ny = 1 - (m.y / r.height) * 2;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (this.capture && e.pointerType !== 'touch') {
        const cb = this.capture; this.capture = null;
        cb('Mouse' + e.button, 'key');
        return;
      }
      place(e);
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      this.any = true;
      if (e.pointerType === 'touch') {
        this.lastDevice = 'touch';
        this.mouse.inside = false;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, multi: false });
        if (this.touches.size > 1) for (const t of this.touches.values()) t.multi = true;
        return;
      }
      this.lastDevice = 'mouse';
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: 0, lx: e.clientX, ly: e.clientY };
      if (e.button === 0) this.mouse.left = true; else this.mouse.right = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        if (this.touches.size === 1) {
          t.moved += Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y);
          if (t.moved > TAP_SLOP) { this.dragX += e.clientX - t.x; this.dragY += e.clientY - t.y; }
        } else if (this.touches.size === 2) {
          let o: Touch | null = null;
          for (const [id, f] of this.touches) if (id !== e.pointerId) o = f;
          if (o) {
            const before = Math.hypot(t.x - o.x, t.y - o.y), after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
            if (before > 24 && after > 24) this.pinch *= before / after;
          }
        }
        t.x = e.clientX; t.y = e.clientY;
        return;
      }
      place(e);
      this.mouse.inside = true;
      const d = this.down;
      if (!d) return;
      d.moved += Math.abs(e.clientX - d.lx) + Math.abs(e.clientY - d.ly);
      if (d.button !== 0) { this.dragX += e.clientX - d.lx; this.dragY += e.clientY - d.ly; }
      d.lx = e.clientX; d.ly = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const t = this.touches.get(e.pointerId);
        this.touches.delete(e.pointerId);
        if (t && !t.multi && t.moved <= TAP_SLOP && e.type === 'pointerup') {
          place(e);
          this.clicks.push({ x: this.mouse.x, y: this.mouse.y, nx: this.mouse.nx, ny: this.mouse.ny, button: 0, touch: true });
        }
        return;
      }
      place(e);
      const d = this.down;
      if (d && d.moved < DRAG_SLOP) {
        this.clicks.push({ x: this.mouse.x, y: this.mouse.y, nx: this.mouse.nx, ny: this.mouse.ny, button: d.button });
        if (d.button !== 0) this.pressed.add('Mouse' + d.button);
      }
      this.down = null;
      this.mouse.left = this.mouse.right = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => (this.mouse.inside = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    addEventListener('gamepadconnected', () => { this.padConnected = true; });
    addEventListener('gamepaddisconnected', () => { this.padConnected = !!navigator.getGamepads?.().some(Boolean); });
  }

  release(): void {
    this.keys.clear(); this.touches.clear();
    this.mouse.left = this.mouse.right = false;
    this.down = null;
    this.stick.x = this.stick.y = 0; this.acting = false;
  }

  captureNext(cb: ((code: string, device: 'key' | 'pad') => void) | null): void { this.capture = cb; }
  get capturing(): boolean { return !!this.capture; }

  held(code: string): boolean { return this.keys.has(code); }
  steering(): boolean { return this.mouse.left && !!this.down && this.down.button === 0; }

  actionHeld(id: ActionId): boolean {
    const [a, b] = this.keyBindings[id];
    if ((a && this.keys.has(a)) || (b && this.keys.has(b))) return true;
    const p = this.padBindings[id];
    return !!p && this.padHeld.has(p);
  }
  actionHit(id: ActionId): boolean {
    const [a, b] = this.keyBindings[id];
    if ((a && this.pressed.has(a)) || (b && this.pressed.has(b))) return true;
    const p = this.padBindings[id];
    return !!p && this.padPressed.has(p);
  }
  mouseButtonOf(id: ActionId): number {
    for (const c of this.keyBindings[id]) if (c && c.startsWith('Mouse')) return +c.slice(5);
    return -1;
  }

  poll(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.padPressed.clear();
    if (!pad) {
      this.padHeld.clear();
      this.padLeft.x = this.padLeft.y = this.padRight.x = this.padRight.y = 0;
      return;
    }
    this.padConnected = true;
    for (let i = 0; i < PAD_BUTTONS.length; i++) {
      const b = pad.buttons[i];
      const name = PAD_BUTTONS[i];
      const on = !!b && (b.pressed || b.value > 0.5);
      if (on && !this.padHeld.has(name)) {
        this.padPressed.add(name);
        this.any = true;
        this.lastDevice = 'pad';
        if (this.capture) { const cb = this.capture; this.capture = null; cb(name, 'pad'); this.padPressed.delete(name); }
      }
      if (on) this.padHeld.add(name); else this.padHeld.delete(name);
    }
    const stick = (out: Stick, x: number, y: number) => {
      const l = Math.hypot(x, y);
      if (l < STICK_DEAD) { out.x = out.y = 0; return; }
      const k = Math.min(1, (l - STICK_DEAD) / (1 - STICK_DEAD)) / l;
      out.x = x * k; out.y = -y * k;
      this.lastDevice = 'pad';
    };
    stick(this.padLeft, pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    stick(this.padRight, pad.axes[2] ?? 0, pad.axes[3] ?? 0);
  }

  rumble(strength: number, ms: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      const act = (p as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null)?.vibrationActuator;
      if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
    }
  }

  endFrame(): void {
    this.pressed.clear();
    this.clicks.length = 0;
    this.wheel = 0; this.dragX = 0; this.dragY = 0; this.pinch = 1;
    this.any = false;
  }
}
