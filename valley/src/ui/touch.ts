import { clamp } from '../core/math.js';
import type { Game } from '../game/game';

const DEAD = 0.16;

export function watchTouch(game: Game, onChange: () => void): void {
  const set = () => {
    game.touch = true;
    document.body.classList.add('touch');
    onChange();
  };
  if (game.touch) set();
  else addEventListener('pointerdown', function first(e) {
    if (e.pointerType !== 'touch') return;
    removeEventListener('pointerdown', first, true);
    set();
  }, true);
  addEventListener('touchstart', () => {}, { passive: true });
}

export function attachStick(game: Game, zone: HTMLElement): () => void {
  const base = zone.firstElementChild as HTMLElement, nub = base.firstElementChild as HTMLElement, stick = game.input.stick;
  let id: number | null = null, ox = 0, oy = 0, reach = 40;

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy, l = Math.hypot(dx, dy);
    const k = l > reach ? reach / l : 1;
    nub.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
    const m = Math.min(1, l / reach);
    const out = m < DEAD ? 0 : 0.42 + 0.58 * (m - DEAD) / (1 - DEAD);
    stick.x = l ? dx / l * out : 0;
    stick.y = l ? -dy / l * out : 0;
  };
  const release = (e?: PointerEvent) => {
    if (e && e.pointerId !== id) return;
    id = null;
    stick.x = stick.y = 0;
    base.style.left = base.style.top = base.style.right = base.style.bottom = '';
    nub.style.transform = '';
    zone.classList.remove('held');
  };
  const down = (e: PointerEvent) => {
    if (id !== null) return;
    id = e.pointerId;
    try { zone.setPointerCapture(id); } catch {}
    const z = zone.getBoundingClientRect(), half = base.offsetWidth / 2;
    reach = half * 0.62;
    ox = clamp(e.clientX, z.left + half, Math.max(z.left + half, z.right - half));
    oy = clamp(e.clientY, z.top + half, Math.max(z.top + half, z.bottom - half));
    Object.assign(base.style, { left: `${ox - z.left - half}px`, top: `${oy - z.top - half}px`, right: 'auto', bottom: 'auto' });
    zone.classList.add('held');
    game.input.any = true;
    move(e);
    e.preventDefault();
  };
  const blur = () => release();
  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) zone.addEventListener(ev, release);
  addEventListener('blur', blur);
  return () => {
    zone.removeEventListener('pointerdown', down);
    zone.removeEventListener('pointermove', move);
    removeEventListener('blur', blur);
  };
}
