import type { Game } from '../game/game';
import { ui, closeAll } from './store';

const FOCUSABLE = 'button:not(:disabled), input, select, [tabindex="0"]';
const REPEAT = 0.18;

export function startPadNav(game: Game): void {
  let held = 0, lastDir = '';
  game.bus.on('frame', (dt) => {
    const inMenu = ui.screen.value !== 'game' || ui.open.value.length > 0 || !!ui.confirm.value;
    if (!inMenu || game.input.lastDevice !== 'pad') return;
    const pad = game.input.padPressed, hold = game.input.padHeld, st = game.input.padLeft;
    let dir = '';
    if (hold.has('Up') || st.y > 0.6) dir = 'up';
    else if (hold.has('Down') || st.y < -0.6) dir = 'down';
    else if (hold.has('Left') || st.x < -0.6) dir = 'left';
    else if (hold.has('Right') || st.x > 0.6) dir = 'right';
    if (dir && (dir !== lastDir || (held += dt) > REPEAT)) { held = 0; move(dir); }
    if (!dir) held = 0;
    lastDir = dir;
    const active = document.activeElement as HTMLElement | null;
    if (pad.has('A') && active && active !== document.body) active.click();
    if (pad.has('B')) {
      if (ui.confirm.value) ui.confirm.value = null;
      else if (ui.open.value.length) closeAll();
    }
    if (pad.has('RB') || pad.has('LB')) {
      const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const next = tabs[(i + (pad.has('RB') ? 1 : -1) + tabs.length) % tabs.length];
      next?.click(); next?.focus();
    }
  });
}

function move(dir: string): void {
  const scope = document.querySelector('.scrim') ?? document.querySelector('.overlay') ?? document.querySelector('#panels .panel, #title') ?? document.body;
  const items = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null);
  if (!items.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur)) { items[0].focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bs = 1e9;
  for (const e of items) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (along <= 2) continue;
    const score = along + across * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  best?.focus();
  best?.scrollIntoView({ block: 'nearest' });
}
