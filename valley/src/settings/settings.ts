import { DEFAULT_KEYS, DEFAULT_PAD, type KeyBindings, type PadBindings } from '../engine/bindings';

export type ColorVision = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type DangerColor = 'mustard' | 'magenta' | 'white';

export interface Settings {
  version: 1;
  autoPickup: boolean;
  pauseOnMenu: boolean;
  confirmValuable: boolean;
  damageNumbers: 'all' | 'crits' | 'off';
  damageNumberScale: number;
  enemyBars: 'always' | 'combat' | 'off';
  lootLabels: 'all' | 'magic' | 'rare' | 'legendary';
  aimAssist: number;
  uiScale: number;
  textScale: number;
  font: 'hand' | 'legible';
  highContrast: boolean;
  colorVision: ColorVision;
  dangerColor: DangerColor;
  telegraphScale: number;
  hudOpacity: number;
  reducedMotion: 'system' | 'on' | 'off';
  screenShake: number;
  hitStop: boolean;
  flashes: boolean;
  steadyLines: boolean;
  smoothFigures: boolean;
  captions: boolean;
  threatIndicators: boolean;
  monoAudio: boolean;
  gameSpeed: number;
  toastSeconds: number;
  volMaster: number;
  volMusic: number;
  volSfx: number;
  volAmbience: number;
  volUi: number;
  muteUnfocused: boolean;
  keys: KeyBindings;
  pad: PadBindings;
  camSensitivity: number;
  invertCamX: boolean;
  invertCamY: boolean;
  vibration: boolean;
  autoAttack: boolean;
  quality: 'auto' | 'high' | 'low';
  fpsCap: 0 | 30 | 60;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  autoPickup: true,
  pauseOnMenu: true,
  confirmValuable: true,
  damageNumbers: 'all',
  damageNumberScale: 1,
  enemyBars: 'combat',
  lootLabels: 'magic',
  aimAssist: 0.6,
  uiScale: 1,
  textScale: 1,
  font: 'hand',
  highContrast: false,
  colorVision: 'none',
  dangerColor: 'mustard',
  telegraphScale: 1,
  hudOpacity: 1,
  reducedMotion: 'system',
  screenShake: 1,
  hitStop: true,
  flashes: true,
  steadyLines: false,
  smoothFigures: false,
  captions: false,
  threatIndicators: true,
  monoAudio: false,
  gameSpeed: 1,
  toastSeconds: 1,
  volMaster: 0.9,
  volMusic: 0.7,
  volSfx: 1,
  volAmbience: 0.8,
  volUi: 0.8,
  muteUnfocused: true,
  keys: DEFAULT_KEYS,
  pad: DEFAULT_PAD,
  camSensitivity: 1,
  invertCamX: false,
  invertCamY: false,
  vibration: true,
  autoAttack: true,
  quality: 'auto',
  fpsCap: 0,
  showFps: false,
};

export const SETTINGS_KEY = 'brushwild.settings.v1';

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): Settings {
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  const out = { ...DEFAULT_SETTINGS } as Settings;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = saved[k];
    if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[k]) (out as unknown as Record<string, unknown>)[k] = v;
  }
  out.keys = { ...DEFAULT_KEYS, ...(saved.keys ?? {}) };
  out.pad = { ...DEFAULT_PAD, ...(saved.pad ?? {}) };
  return out;
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null): void {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

export function wantsLessMotion(s: Settings): boolean {
  if (s.reducedMotion === 'on') return true;
  if (s.reducedMotion === 'off') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const RARITY_COLORS: Record<ColorVision, Record<string, string>> = {
  none: { common: '#7a5f48', magic: '#3f64b3', rare: '#b8860b', legendary: '#c8561a', unique: '#8a5a2b' },
  protanopia: { common: '#7a5f48', magic: '#2f6fd1', rare: '#b89b0b', legendary: '#e07b00', unique: '#6b5aa8' },
  deuteranopia: { common: '#7a5f48', magic: '#2f6fd1', rare: '#c2a10f', legendary: '#d26a00', unique: '#7a52b0' },
  tritanopia: { common: '#7a5f48', magic: '#0f7f8a', rare: '#c2185b', legendary: '#d84315', unique: '#5d4037' },
};

export const DANGER_PENCILS: Record<DangerColor, [number, number, number]> = {
  mustard: [226 / 255, 176 / 255, 52 / 255],
  magenta: [0.86, 0.2, 0.62],
  white: [0.97, 0.96, 0.92],
};
