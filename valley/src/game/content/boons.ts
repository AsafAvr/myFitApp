import type { Effect } from './effects';

export interface BoonDef { id: string; name: string; desc: string; seconds: number; effects: Effect[] }

export const BOONS: Record<string, BoonDef> = {
  kindled: { id: 'kindled', name: 'Kindled', desc: 'You deal 20% more damage.', seconds: 240, effects: [{ kind: 'stat', stat: 'damage', value: 0.2, more: true }] },
  fleet: { id: 'fleet', name: 'Fleet', desc: 'You run a fifth faster.', seconds: 240, effects: [{ kind: 'stat', stat: 'moveSpeed', value: 0.2 }] },
  hale: { id: 'hale', name: 'Hale', desc: 'A quarter more health.', seconds: 240, effects: [{ kind: 'stat', stat: 'lifePct', value: 0.25 }] },
};
