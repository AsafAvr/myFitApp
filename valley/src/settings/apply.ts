import { signal } from '@preact/signals';
import type { Game } from '../game/game';
import { DANGER_PENCILS, RARITY_COLORS, saveSettings, wantsLessMotion, type Settings } from './settings';

export const settings = signal<Settings | null>(null);
let game: Game | null = null;

export function applyToPage(s: Settings): void {
  const root = document.documentElement, body = document.body;
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.style.setProperty('--ts', String(s.textScale));
  root.style.setProperty('--hud-opacity', String(s.hudOpacity));
  for (const [r, c] of Object.entries(RARITY_COLORS[s.colorVision])) root.style.setProperty(`--r-${r}`, c);
  root.style.setProperty('--danger-pencil', `rgb(${DANGER_PENCILS[s.dangerColor].map((v) => Math.round(v * 255)).join(',')})`);
  body.classList.toggle('font-legible', s.font === 'legible');
  body.classList.toggle('contrast', s.highContrast);
  body.classList.toggle('calm', wantsLessMotion(s));
  body.dataset.vision = s.colorVision;
}

export function initSettings(s: Settings, g: Game | null): void {
  settings.value = s;
  game = g;
  applyToPage(s);
  if (g) pushToGame(s, g);
}

export function bindGameSettings(g: Game): void {
  game = g;
  if (settings.value) pushToGame(settings.value, g);
}

function pushToGame(s: Settings, g: Game): void {
  g.applySettings(s);
  g.bus.emit('audio:mix', {
    master: s.volMaster, music: s.volMusic, sfx: s.volSfx, ambience: s.volAmbience, ui: s.volUi,
    mono: s.monoAudio, muteHidden: s.muteUnfocused,
  });
  g.bus.emit('settings:changed');
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...settings.value!, ...patch };
  settings.value = next;
  saveSettings(next);
  applyToPage(next);
  if (game) pushToGame(next, game);
}
