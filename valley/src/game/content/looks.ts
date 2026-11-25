import type { Vec3 } from '../types';

export interface Pencil { name: string; rgb: [number, number, number] }

export const TUNICS: Pencil[] = [
  { name: 'Vermilion', rgb: [214, 70, 52] },
  { name: 'Slate', rgb: [84, 108, 156] },
  { name: 'Moss', rgb: [94, 140, 78] },
  { name: 'Ochre', rgb: [196, 148, 52] },
  { name: 'Plum', rgb: [136, 84, 120] },
  { name: 'Teal', rgb: [70, 150, 150] },
  { name: 'Charcoal', rgb: [74, 77, 94] },
];

export const HAIRS: Pencil[] = [
  { name: 'Umber', rgb: [122, 62, 44] },
  { name: 'Wheat', rgb: [226, 188, 130] },
  { name: 'Ink', rgb: [54, 52, 60] },
  { name: 'Auburn', rgb: [168, 76, 46] },
  { name: 'Silver', rgb: [196, 196, 204] },
  { name: 'Honey', rgb: [214, 154, 70] },
];

export interface Look { tunic: number; hair: number }

export const pencilOf = (p: Pencil): Vec3 => [p.rgb[0] / 255, p.rgb[1] / 255, p.rgb[2] / 255];
