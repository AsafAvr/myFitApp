export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right'] as const;
export type PadButton = typeof PAD_BUTTONS[number];

export interface ActionInfo {
  label: string;
  group: 'Movement' | 'Combat' | 'Camera' | 'Interface';
  mouse?: boolean;
}

export const ACTIONS = {
  moveUp: { label: 'Walk forward', group: 'Movement' },
  moveDown: { label: 'Walk back', group: 'Movement' },
  moveLeft: { label: 'Walk left', group: 'Movement' },
  moveRight: { label: 'Walk right', group: 'Movement' },
  evade: { label: 'Evade', group: 'Movement' },
  interact: { label: 'Attack nearest / talk / use', group: 'Movement' },

  slot1: { label: 'Skill slot 1 (primary)', group: 'Combat', mouse: true },
  slot2: { label: 'Skill slot 2', group: 'Combat', mouse: true },
  slot3: { label: 'Skill slot 3', group: 'Combat', mouse: true },
  slot4: { label: 'Skill slot 4', group: 'Combat', mouse: true },
  slot5: { label: 'Skill slot 5', group: 'Combat', mouse: true },
  slot6: { label: 'Skill slot 6', group: 'Combat', mouse: true },
  potion: { label: 'Drink a tonic', group: 'Combat' },
  nextTarget: { label: 'Next target', group: 'Combat' },
  standStill: { label: 'Stand still (attack in place)', group: 'Combat' },

  camLeft: { label: 'Turn view left', group: 'Camera' },
  camRight: { label: 'Turn view right', group: 'Camera' },
  camUp: { label: 'Tilt view up', group: 'Camera' },
  camDown: { label: 'Tilt view down', group: 'Camera' },
  zoomIn: { label: 'Zoom in', group: 'Camera' },
  zoomOut: { label: 'Zoom out', group: 'Camera' },

  inventory: { label: 'Inventory', group: 'Interface' },
  character: { label: 'Character', group: 'Interface' },
  skills: { label: 'Skill tree', group: 'Interface' },
  map: { label: 'Map and waystones', group: 'Interface' },
  journal: { label: 'Quest journal', group: 'Interface' },
  view: { label: 'View controls', group: 'Interface' },
  showLabels: { label: 'Show all item labels (hold)', group: 'Interface' },
  menu: { label: 'Menu / close', group: 'Interface' },
} satisfies Record<string, ActionInfo>;

export type ActionId = keyof typeof ACTIONS;
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export type KeyBindings = Record<ActionId, [string | null, string | null]>;
export type PadBindings = Record<ActionId, PadButton | null>;

export const DEFAULT_KEYS: KeyBindings = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  evade: ['Space', null],
  interact: ['KeyF', null],
  slot1: ['Mouse0', null],
  slot2: ['Mouse2', null],
  slot3: ['Digit1', null],
  slot4: ['Digit2', null],
  slot5: ['Digit3', null],
  slot6: ['Digit4', null],
  potion: ['KeyR', null],
  nextTarget: ['Tab', null],
  standStill: ['ShiftLeft', null],
  camLeft: ['KeyQ', null],
  camRight: ['KeyE', null],
  camUp: [null, null],
  camDown: [null, null],
  zoomIn: ['Equal', null],
  zoomOut: ['Minus', null],
  inventory: ['KeyI', 'KeyB'],
  character: ['KeyC', null],
  skills: ['KeyK', null],
  map: ['KeyM', 'KeyT'],
  journal: ['KeyJ', null],
  view: ['KeyV', null],
  showLabels: ['AltLeft', null],
  menu: ['Escape', null],
};

export const DEFAULT_PAD: PadBindings = {
  moveUp: null, moveDown: null, moveLeft: null, moveRight: null,
  evade: 'LT',
  interact: 'A',
  slot1: null,
  slot2: 'X',
  slot3: 'Y',
  slot4: 'B',
  slot5: 'RB',
  slot6: 'RT',
  potion: 'LB',
  nextTarget: 'Right',
  standStill: null,
  camLeft: null, camRight: null, camUp: null, camDown: null,
  zoomIn: 'Up',
  zoomOut: 'Down',
  inventory: 'Back',
  character: null,
  skills: 'Left',
  map: null,
  journal: null,
  view: null,
  showLabels: 'RS',
  menu: 'Start',
};

const NAMES: Record<string, string> = {
  Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click',
  Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backquote: '`',
  ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Alt', AltRight: 'Right Alt', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps Lock',
};

export function keyName(code: string | null | undefined): string {
  if (!code) return '';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export function padName(b: PadButton | null | undefined): string {
  if (!b) return '';
  return ({ Up: 'D-pad ↑', Down: 'D-pad ↓', Left: 'D-pad ←', Right: 'D-pad →', Back: 'View', Start: 'Menu' } as Record<string, string>)[b] ?? b;
}
