import type { Element } from '../game/types';

const PEN = '#623c1e', PAPER = '#f1ebdc', RED = '#d64634';
const svg = (body: string, cls = '') => `<svg viewBox="0 0 40 40" aria-hidden="true" ${cls ? `class="${cls}"` : ''} fill="none" stroke="${PEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ELEMENT_PENCIL: Record<Element, string> = {
  physical: '#e2bc82', fire: '#f09e4a', frost: '#88b4d8', storm: '#f4be3e', poison: '#86c06a', shadow: '#8a7aa8',
};

const GLYPHS: Record<string, (c: string) => string> = {
  slash: (c) => `<path d="M7 33L31 9" stroke-width="5" stroke="${c}"/><path d="M7 33L31 9"/><path d="M26 7l7 0 0 7"/><path d="M10 24l-4 6 6-4"/>`,
  cleave: (c) => `<path d="M6 31C9 15 21 6 35 7 25 12 17 21 15 34z" fill="${c}"/><path d="M9 25c4-8 10-13 18-15" stroke-width="1.4"/><path d="M27 30l6 4M30 26l5 2" stroke="${RED}"/>`,
  shield: (c) => `<path d="M20 5l12 4v9c0 9-6 14-12 17C14 32 8 27 8 18V9z" fill="${c}"/><path d="M20 9v22M12 17h16" stroke-width="1.4"/>`,
  spiral: (c) => `<circle cx="20" cy="20" r="13" fill="${c}"/><path d="M20 20c3 0 4 3 2 5s-7 1-7-4 5-9 10-7 8 9 4 13" stroke-width="1.6"/>`,
  horn: (c) => `<path d="M6 26c8-1 16-8 22-18l5 3c-3 10-11 20-24 21z" fill="${c}"/><path d="M31 9c2 2 3 4 2 6"/><path d="M8 33l-2 3M12 34l0 3" stroke="${RED}"/>`,
  armor: (c) => `<path d="M12 7l8 3 8-3 6 6-4 5v15H10V18l-4-5z" fill="${c}"/><path d="M20 10v23M14 18h12" stroke-width="1.4"/>`,
  leap: (c) => `<path d="M6 32c6-18 18-24 28-22" stroke-dasharray="3 3"/><circle cx="31" cy="11" r="5" fill="${c}"/><path d="M4 34h12" stroke-width="2.6"/>`,
  charge: (c) => `<path d="M6 20h18l-5-7M24 20l-5 7" stroke-width="3" stroke="${c}"/><path d="M6 20h18l-5-7M24 20l-5 7"/><path d="M28 12v16M33 14v12" stroke="${RED}"/>`,
  quake: (c) => `<path d="M4 28h32" stroke-width="2.4"/><path d="M20 28l-4-8 5-4-3-8" stroke="${RED}" stroke-width="2.4"/><path d="M8 28c2-6 6-8 8-8M32 28c-2-6-6-8-9-8" fill="${c}"/>`,
  flame: (c) => `<path d="M20 35c-8 0-12-6-10-12 2-5 6-7 6-13 5 3 6 7 6 10 2-2 3-4 3-6 4 4 6 8 5 12-1 5-5 9-10 9z" fill="${c}"/><path d="M20 33c-3 0-5-3-4-6 1-2 3-3 3-6 3 2 5 5 4 8-1 2-1 4-3 4z" fill="${PAPER}"/>`,
  banner: (c) => `<path d="M11 5v32"/><path d="M11 7h20l-5 6 5 6H11" fill="${c}"/>`,
  meteor: (c) => `<circle cx="25" cy="25" r="8" fill="${c}"/><path d="M5 5l14 14M10 4l10 10M4 10l10 10" stroke="${RED}"/>`,
  spark: (c) => `<path d="M22 4L10 22h9l-3 14 14-19h-9z" fill="${c}"/>`,
  shard: (c) => `<path d="M8 32L28 6l5 5L12 34z" fill="${c}"/><path d="M14 26l10-12" stroke-width="1.3"/><path d="M30 26l4 2M32 21l4-1" stroke="${'#88b4d8'}"/>`,
  bolt: (c) => `<circle cx="24" cy="16" r="9.5" fill="${c}"/><path d="M24 11c3 1 4 4 3 6s-4 3-6 1 0-5 3-3" stroke-width="1.5"/><path d="M5 35l9-9M9 27l5-2M13 35l3-6" stroke="${RED}"/>`,
  lance: (c) => `<path d="M5 35L33 7" stroke-width="5" stroke="${c}"/><path d="M5 35L33 7"/><path d="M27 6l7 0 0 7z" fill="${c}"/>`,
  chain: (c) => `<path d="M6 8l9 9-4 2 10 9-3 2 12 6-8-11 3-1-9-9 3-2z" fill="${c}"/>`,
  heart: (c) => `<path d="M20 34C8 25 6 18 9 13c3-5 9-4 11 0 2-4 8-5 11 0 3 5 1 12-11 21z" fill="${c}"/><path d="M20 15v10M15 20h10" stroke="${PAPER}" stroke-width="3.2"/>`,
  snow: (c) => `<circle cx="20" cy="20" r="14" fill="${c}"/><path d="M20 8v24M9.6 14l20.8 12M9.6 26l20.8-12" stroke="${PAPER}" stroke-width="2.4"/><path d="M20 8v24M9.6 14l20.8 12M9.6 26l20.8-12" stroke-width="1"/>`,
  step: (c) => `<path d="M8 10l11 10L8 30M20 10l11 10-11 10" stroke="${c === '#e2bc82' ? '#546c9c' : c}" stroke-width="4.2"/><path d="M4 16h6M3 24h6" stroke-width="1.5"/>`,
  cloud: (c) => `<path d="M10 26a6 6 0 0 1 1-12 9 9 0 0 1 17 2 5 5 0 0 1 2 10z" fill="${c}"/><path d="M13 31l-2 4M20 31l-2 4M27 31l-2 4" stroke="#88b4d8"/>`,
  arrow: (c) => `<path d="M6 34L30 10" stroke-width="2.2"/><path d="M24 8l9-1-1 9z" fill="${c}"/><path d="M6 34l1-6M6 34l6-1M10 30l1-6M10 30l6-1" stroke="${RED}"/>`,
  daggers: (c) => `<path d="M9 31L24 12l3 3L12 34z" fill="${c}"/><path d="M31 31L16 12l-3 3 15 19z" fill="${c}"/><path d="M7 33l3-3M33 33l-3-3" stroke-width="3"/>`,
  fan: (c) => `<path d="M20 34L8 8M20 34L20 6M20 34L32 8" stroke-width="1.8"/><path d="M6 6l4 1-1 4zM18 4h4l-2 4zM34 6l-4 1 1 4z" fill="${c}"/>`,
  smoke: (c) => `<path d="M8 28a6 6 0 0 1 3-11 8 8 0 0 1 15-2 6 6 0 0 1 6 9 5 5 0 0 1-4 6H12a5 5 0 0 1-4-2z" fill="${c}"/><path d="M14 22c2-2 5-2 7 0" stroke-width="1.4"/>`,
  trap: (c) => `<path d="M6 26h28" stroke-width="2.4"/><path d="M9 26l3-12 3 12M17 26l3-14 3 14M25 26l3-12 3 12" fill="${c}"/>`,
  rain: (c) => `<path d="M8 6l-3 9M16 4l-3 9M24 6l-3 9M32 4l-3 9M12 20l-3 9M20 18l-3 9M28 20l-3 9" stroke="${c === '#e2bc82' ? PEN : c}" stroke-width="2.2"/><path d="M4 34h32" stroke-width="2"/>`,
  eye: (c) => `<path d="M4 20c5-8 11-11 16-11s11 3 16 11c-5 8-11 11-16 11S9 28 4 20z" fill="${PAPER}"/><circle cx="20" cy="20" r="6" fill="${c}"/><circle cx="20" cy="20" r="2" fill="${PEN}"/>`,
  hands: (c) => `<path d="M10 30V14l3-2 3 2v-4l3-2 3 2v4l3-1 3 2v15z" fill="${c}"/>`,
  fist: (c) => `<path d="M10 14h18l4 6v8l-6 6H14l-4-6z" fill="${c}"/><path d="M15 14v8M21 14v8M27 15v7" stroke-width="1.4"/>`,
  drop: (c) => `<path d="M20 5c6 9 11 15 11 21a11 11 0 0 1-22 0c0-6 5-12 11-21z" fill="${c === '#e2bc82' ? '#d8584a' : c}"/><path d="M15 26a5 5 0 0 0 4 5" stroke="${PAPER}" stroke-width="2.4"/>`,
  boot: (c) => `<path d="M12 6h10v16l10 5v6H8V24l4-2z" fill="${c}"/><path d="M8 29h24" stroke-width="1.4"/>`,
  skull: (c) => `<path d="M8 18a12 12 0 0 1 24 0v6l-4 2v6H12v-6l-4-2z" fill="${c}"/><circle cx="15" cy="19" r="3" fill="${PEN}"/><circle cx="25" cy="19" r="3" fill="${PEN}"/>`,
  burst: (c) => `<path d="M20 3l4 10 11-4-7 9 9 6-11 1 1 11-7-8-7 8 1-11-11-1 9-6-7-9 11 4z" fill="${c}"/>`,
  orb: (c) => `<circle cx="20" cy="20" r="13" fill="${c}"/><path d="M14 16a7 7 0 0 1 7-5" stroke="${PAPER}" stroke-width="3"/>`,
  hourglass: (c) => `<path d="M10 5h20M10 35h20M12 5c0 9 8 10 8 15s-8 6-8 15M28 5c0 9-8 10-8 15s8 6 8 15"/><path d="M13 33c2-5 5-7 7-8 2 1 5 3 7 8z" fill="${c}"/>`,
  star: (c) => `<path d="M20 4l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="${c}"/>`,
  sword: (c) => `<path d="M24 6l10 0 0 10L14 26l-4-4z" fill="${c}"/><path d="M8 20l12 12M6 34l7-7" stroke-width="3"/>`,
  helm: (c) => `<path d="M8 26a12 12 0 0 1 24 0v6H8z" fill="${c}"/><path d="M20 14v18M8 26h24" stroke-width="1.4"/>`,
  chest: (c) => `<path d="M12 7l8 3 8-3 6 6-4 5v15H10V18l-4-5z" fill="${c}"/><path d="M20 10v23" stroke-width="1.4"/>`,
  gloves: (c) => `<path d="M12 34V16l2-6 3 1 1-4 3 1 1 4 3-1 2 6v18z" fill="${c}"/><path d="M12 28h16" stroke-width="1.4"/>`,
  legs: (c) => `<path d="M11 6h18l-1 28h-6l-2-16-2 16h-6z" fill="${c}"/><path d="M11 10h18" stroke-width="1.4"/>`,
  boots: (c) => `<path d="M12 6h10v16l10 5v6H8V24l4-2z" fill="${c}"/><path d="M8 29h24" stroke-width="1.4"/>`,
  amulet: (c) => `<path d="M10 6c0 10 4 14 10 14s10-4 10-14" stroke-width="1.6"/><path d="M20 18l7 8-7 10-7-10z" fill="${c}"/>`,
  ring: (c) => `<circle cx="20" cy="24" r="10" stroke-width="3.4" stroke="${c}"/><circle cx="20" cy="24" r="10"/><path d="M20 6l5 6-5 5-5-5z" fill="${c}"/>`,
  flask: (c) => `<path d="M12.5 24h15l3.5 6a3 3 0 0 1-3 5H12a3 3 0 0 1-3-5z" fill="${c}" stroke="none"/><path d="M16 8v7L9 27a5 5 0 0 0 4 8h14a5 5 0 0 0 4-8l-7-12V8"/><rect x="15" y="4" width="10" height="4" rx="1.5" fill="#b08054"/>`,
  pouch: (c) => `<path d="M12 14c-6 6-8 20 8 20s14-14 8-20z" fill="${c}"/><path d="M13 14c2-3 1-6-1-8h16c-2 2-3 5-1 8z" fill="${PAPER}"/><path d="M12 14h16" stroke="${RED}" stroke-width="2.4"/>`,
  gem: (c) => `<path d="M20 4l12 10-12 22L8 14z" fill="${c}"/><path d="M8 14h24M20 36V14M20 4l-5 10M20 4l5 10" stroke-width="1.4"/>`,
};

export function glyph(name: string, color: string, cls = ''): string {
  return svg((GLYPHS[name] ?? GLYPHS.star)(color), cls);
}
export const skillIcon = (icon: string, element: Element) => glyph(icon, ELEMENT_PENCIL[element]);

export const MENU_ICONS: Record<string, string> = {
  character: svg(`<circle cx="20" cy="13" r="7" fill="${PAPER}"/><path d="M7 35c0-9 6-13 13-13s13 4 13 13z" fill="#d64634"/>`),
  inventory: svg(`<path d="M9 16h22l2 17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="#e2bc82"/><path d="M14 16v-3a6 6 0 0 1 12 0v3"/>`),
  skills: svg(`<path d="M20 35V20M20 20l-9-9M20 20l9-9M20 27l-7-4M20 27l7-4" stroke-width="2.2"/><circle cx="11" cy="10" r="4" fill="#f4be3e"/><circle cx="29" cy="10" r="4" fill="#f4be3e"/><circle cx="20" cy="20" r="4" fill="#d64634"/>`),
  journal: svg(`<path d="M9 6h20a2 2 0 0 1 2 2v26H11a2 2 0 0 1-2-2z" fill="#e2bc82"/><path d="M14 13h12M14 19h12M14 25h8" stroke-width="1.6"/>`),
  menu: svg(`<path d="M8 12h24M8 20h24M8 28h24" stroke-width="3"/>`),
};

export const ACT_ICONS = {
  attack: svg(`<path d="M14 23L29 6h5v5L17 26z" fill="${PAPER}"/><path d="M17.5 22.5L30 10" stroke-width="1.4"/><path d="M10 19l11 11" stroke-width="3"/><path d="M13.5 26.5L8 32" stroke="#d64634" stroke-width="4"/><circle cx="6.5" cy="33.5" r="2" fill="#e2b034"/>`, 'i-attack'),
  talk: svg(`<path d="M6 8h28v18H20l-8 7v-7H6z" fill="${PAPER}"/><path d="M12 14.5h16M12 20h10" stroke-width="1.6"/>`, 'i-talk'),
  next: svg(`<circle cx="20" cy="20" r="4.5" fill="#d64634"/><path d="M8 17a12.5 12.5 0 0 1 22-6M32 23a12.5 12.5 0 0 1-22 6"/><path d="M31 4v8h-8M9 36v-8h8"/>`),
  evade: svg(`<path d="M6 28c8 2 16-2 22-12" stroke-dasharray="3 3"/><path d="M24 10l8 4-4 8" stroke-width="2.6"/><circle cx="10" cy="26" r="4" fill="#88b4d8"/>`),
};
