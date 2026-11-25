export type PlaceKind = 'tree' | 'trail' | 'windmill' | 'pond' | 'tower' | 'garden' | 'library' | 'cairn';
export type HabitSource = 'runs' | 'sport' | 'manual';

export interface HabitDef { key: string; name: string; kind: PlaceKind; target: number; src: HabitSource; example?: boolean }

export const HABITS: HabitDef[] = [
  { key: 'run', name: 'Running', kind: 'tree', target: 3, src: 'runs' },
  { key: 'walk', name: 'Walking', kind: 'trail', target: 3, src: 'sport' },
  { key: 'ride', name: 'Cycling', kind: 'windmill', target: 2, src: 'sport' },
  { key: 'swim', name: 'Swimming', kind: 'pond', target: 1, src: 'sport' },
  { key: 'strength', name: 'Strength', kind: 'tower', target: 2, src: 'sport' },
  { key: 'yoga', name: 'Yoga', kind: 'garden', target: 2, src: 'sport' },
  { key: 'read', name: 'Reading', kind: 'library', target: 5, src: 'manual', example: true },
  { key: 'meditate', name: 'Meditation', kind: 'cairn', target: 4, src: 'manual', example: true },
];

export const SPORT_HABIT: Record<string, string> = {
  Walk: 'walk', Hike: 'walk',
  Ride: 'ride', VirtualRide: 'ride', EBikeRide: 'ride', GravelRide: 'ride', MountainBikeRide: 'ride',
  Swim: 'swim',
  Workout: 'strength', WeightTraining: 'strength', Crossfit: 'strength', Rowing: 'strength',
  Yoga: 'yoga', Pilates: 'yoga',
};

export const STAGE_WOOD = [0.01, 1.2, 4, 9, 17, 28, 44];
export const NEGLECT_DAYS = 21;

export const STAGES: Record<PlaceKind, string[]> = {
  tree: ['a seed', 'a sprout', 'a sapling', 'a young tree', 'a tree', 'a great tree', 'an ancient tree'],
  trail: ['a plot to explore', 'a deer track', 'a footpath', 'a fenced path', 'a lane with a scarecrow', 'a farm lane', 'a farmstead'],
  windmill: ['a plot to build on', 'a pile of hay', 'two haystacks', 'a small mill', 'a windmill', 'a tall windmill', 'the great mill'],
  pond: ['a dry hollow', 'a few reeds', 'a reed bed', 'a pond with reeds', 'a reedy pond', 'a pond with a willow', 'a mere'],
  tower: ['a plot of stones', 'a single pillar', 'two pillars', 'three pillars', 'half a ring', 'a ring of pillars', 'a ring with a beacon'],
  garden: ['bare earth', 'a bush', 'a hedge', 'a quiet garden', 'a garden with lamps', 'a lantern garden', 'a birch garden'],
  library: ['an empty plot', 'a book stall', 'a busy stall', 'a reading stall', 'a book cottage', 'a lit cottage', 'a library'],
  cairn: ['an empty plot', 'a pebble', 'a small cairn', 'a cairn', 'a tall cairn', 'a lit cairn', 'a standing stone'],
};
