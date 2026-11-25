import { signal } from '@preact/signals';
import type { Game } from '../game/game';
import type { Npc } from '../game/types';
import type { GameEvents } from '../game/events';
import { announce } from './announce';

export type Screen = 'title' | 'heroes' | 'create' | 'game';
export type PanelId = 'inventory' | 'character' | 'skills' | 'map' | 'journal' | 'view' | 'vendor' | 'stash' | 'bounty' | 'settings' | 'menu' | 'help' | 'habit';

export interface Toast { id: number; title: string; sub?: string; seconds: number }
export interface LogLine { id: number; html: string; old: boolean }
export interface Tip { rect: DOMRect; render: () => preact.ComponentChildren; wide?: boolean }
export interface Confirm { title: string; body: string; yes: string; no?: string; danger?: boolean; onYes: () => void }

export const OVERLAYS: PanelId[] = ['skills', 'settings', 'menu', 'help', 'habit'];

export const ui = {
  screen: signal<Screen>('title'),
  open: signal<PanelId[]>([]),
  npc: signal<Npc | null>(null),
  tip: signal<Tip | null>(null),
  toast: signal<Toast | null>(null),
  log: signal<LogLine[]>([]),
  prompt: signal<{ text: string; key: string } | null>(null),
  confirm: signal<Confirm | null>(null),
  rev: signal(0),
  frame: signal(0),
  heroes: signal(0),
  guide: signal<GameEvents['guide']>(null),
  habit: signal<string | null>(null),
};

let game: Game | null = null;
export const getGame = (): Game => game!;

const bump = () => { ui.rev.value++; };

let toastId = 0, logId = 0;
export function toast(title: string, sub = '', seconds = 2.8): void {
  const g = game;
  const scale = g ? g.settings.toastSeconds : 1;
  ui.toast.value = { id: ++toastId, title, sub, seconds: seconds * scale };
}
export function log(html: string): void {
  const line: LogLine = { id: ++logId, html, old: false };
  ui.log.value = [...ui.log.value.slice(-4), line];
  const scale = game ? game.settings.toastSeconds : 1;
  setTimeout(() => { ui.log.value = ui.log.value.map((l) => (l.id === line.id ? { ...l, old: true } : l)); }, 5200 * scale);
  setTimeout(() => { ui.log.value = ui.log.value.filter((l) => l.id !== line.id); }, 6200 * scale);
}

export function isOpen(id: PanelId): boolean { return ui.open.value.includes(id); }

export function openPanel(id: PanelId): void {
  const g = game!;
  if (OVERLAYS.includes(id)) ui.open.value = [id];
  else {
    const keep = ui.open.value.filter((o) => !OVERLAYS.includes(o) && sideOf(o) !== sideOf(id) && innerWidth >= 760);
    ui.open.value = [...keep, id];
  }
  g.bus.emit('ui:click');
  syncPause();
}
export function closePanel(id: PanelId): void {
  ui.open.value = ui.open.value.filter((o) => o !== id);
  if (id === 'vendor' || id === 'stash' || id === 'bounty') ui.npc.value = null;
  ui.tip.value = null;
  syncPause();
}
export function togglePanel(id: PanelId): void { if (isOpen(id)) closePanel(id); else openPanel(id); }
export function closeAll(): void { ui.open.value = []; ui.npc.value = null; ui.tip.value = null; syncPause(); }

export function sideOf(id: PanelId): 'left' | 'right' | 'center' {
  if (id === 'inventory' || id === 'map' || id === 'view') return 'right';
  if (OVERLAYS.includes(id)) return 'center';
  return 'left';
}

function syncPause(): void {
  const g = game;
  if (!g) return;
  const any = ui.open.value.length > 0 && ui.screen.value === 'game';
  const pause = any && (g.settings.pauseOnMenu || ui.open.value.some((o) => o === 'menu' || o === 'settings'));
  if (pause !== g.menuPause) {
    g.menuPause = pause;
    if (pause) g.input.release();
  }
}

export function bindGame(g: Game): void {
  game = g;
  const bus = g.bus;
  announce(g);
  for (const ev of ['inventory:changed', 'equipment:changed', 'tree:changed', 'build:changed', 'levelup', 'trade', 'bounty:changed', 'xp',
    'attune', 'found', 'boon', 'pickup', 'drink', 'land', 'dungeon:cleared', 'zone:enter', 'character:loaded', 'settings:changed', 'travel:arrive'] as const) {
    bus.on(ev, bump);
  }
  bus.on('frame', () => { ui.frame.value++; });
  bus.on('guide', (d) => { ui.guide.value = d; });
  bus.on('interact:prompt', (p) => { ui.prompt.value = p; });
  bus.on('npc:talk', (npc) => {
    ui.npc.value = npc;
    if (npc.role === 'keeper') { ui.habit.value = npc.habit ?? null; openPanel('habit'); return; }
    if (npc.role === 'warden') { g.bounties.offers.length || g.bounties.refresh(); openPanel('bounty'); }
    else if (npc.role === 'stash') { openPanel('stash'); openPanel('inventory'); }
    else { openPanel('vendor'); openPanel('inventory'); }
  });
  bus.on('ui:toggle', (id) => {
    if (ui.screen.value !== 'game') return;
    if (id === 'menu') {
      if (ui.confirm.value) { ui.confirm.value = null; return; }
      if (ui.open.value.length) closeAll(); else openPanel('menu');
      return;
    }
    togglePanel(id as PanelId);
  });
}
