# Brushwild architecture

How the game is put together, why, and where it goes next. For what the game
is and how to run it, see the [README](../README.md).

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict` | Items, affixes, skill trees and saves are deeply nested data; a renamed field must be a compile error, not a silent `undefined` in someone's save. |
| Build | Vite 7 | Instant dev server with module reload; production builds with hashing and code splitting (the synthesized audio is its own chunk). A small plugin (`tools/vite-plugin-glsl-slim.ts`) trims the indentation of `glsl`-tagged shader strings in release builds. |
| Tests | Vitest 3 | The rules layer is pure, so balance, loot, trees, saves and dungeon generation are tested in Node in milliseconds (`npm test`). |
| Interface | Preact 10 + `@preact/signals` | Inventory grids, tooltips with comparisons, a skill tree and a settings screen with rebinding are real UI; Preact is 4 kB and familiar. The HUD re-renders once a frame from game state; panels re-render on a revision signal. |
| Rendering | The existing WebGL2 renderer, unchanged in design | It *is* the game's look (raymarched heightfield and signed-distance props, ink contours, pencil hatching on paper). No engine would give it for free; Three.js or Babylon would add weight and fight the paper-space hatching. |
| Fonts | Self-hosted (`@fontsource`) | No requests to third parties, works offline (a PWA later), and the Atkinson Hyperlegible option for readability. |

JavaScript stays where it is stable and has no gameplay knowledge (`gfx/`,
`world/`, `audio/`, `core/` maths and noise); `allowJs` lets TypeScript infer its
types at the boundaries. Moving those to TypeScript is mechanical and can be done
file by file.

## Layers

```
engine/   events, seeded RNG, input with an action map and gamepads          (no game knowledge)
core/     maths, noise, device                                                (no game knowledge)
world/    terrain, biomes, places, finds, dungeon generator                   (no GL; runs in Node)
gfx/      renderer, passes, shader chunks, creature and prop models           (no game knowledge)
game/
  content/   data: classes and skills, effects, statuses, items, monsters, boons
  rules/     pure functions: stats, damage, items, skill tree, build compiler, inventory, loot
  state/     what is saved: the Character
  save/      storage, versions and migrations
  systems/   the simulation, run in order every frame
  game.ts    owns the world, the entities and the systems; runs the frame
  view.ts    the one place game state becomes GPU buffers
  fx.ts      effect recipes keyed by events
settings/  the settings object, its defaults, and applying it to the page, game and sound
ui/        Preact interface: store (signals), HUD, panels, skill tree, settings, screens
audio/     synthesized sound and music, keyed by game events
```

Dependencies point one way: `engine/core ← world ← gfx ← game ← ui/audio`. The
renderer never reads game objects; the game never calls the interface or the sound
(it emits facts on a typed bus, `game/events.ts`, and they listen).

## Content → rules → systems

Content is data. A class is a list of skills and passives; a skill is a
**behaviour** (shared code: melee, projectile, nova, blast, zone, dash, leap,
buff, heal, barrier, chain, trap, mark) plus **numbers** (`params`). Upgrades,
legendary aspects, uniques and gear are **effects** (`content/effects.ts`):

- `stat` — a modifier, additive (`+20%`) or multiplicative (`×20%`), optionally only `when` a condition holds
- `param` — change a number of one skill, or of every skill with a tag ("projectiles pierce once more")
- `ranks` — +N to a skill or a category
- `onHit` — hits apply a status
- `trigger` — on cast, hit, crit, kill or being hurt: apply a status, heal, gain resource, refund the cost, explode, shorten cooldowns, gain a barrier

The **build compiler** (`rules/build.ts`) gathers every effect a hero has (tree,
gear, boon, buffs) and produces what systems read: stat totals and derived
numbers, each learned skill's effective rank and resolved numbers, on-hit rules
and triggers. It runs when something changes, never per hit, and it is pure, so
the character sheet, the tooltips and the comparisons show exact numbers (an
item's comparison compiles the build with and without it).

Every hit in the game goes through one function, `rules/damage.ts`:

```
base × (1 + Σ additive bonuses) × Π multipliers × main attribute
     × vulnerable × crit × (1 − armor or resistance) × damage taken × block
```

Additive bonuses are chosen by the hit's element, its skill's tags, and what is
true when it lands (elite, vulnerable, burning, frozen, close, distant…).

### Skill trees

Built from the class data (`rules/tree.ts`): seven branches (Basic, Core,
Defensive, Mobility, Mastery, Ultimate, Key Passive). A branch opens with points
spent in the branches **above** it, so refunding the points that opened a branch
is refused while it is in use (no unlock-then-refund exploits). A skill has 5
ranks; rank 1 opens its Enhancement, which opens a choice of two Upgrades. One
ultimate, one key passive. Refunds cost glint after level 8.

### Items

An item stores only what was rolled: base, rarity, item level, affix ids with
0..1 rolls, an aspect or unique id. Numbers come from the tables at read time,
so a balance change reaches items already in players' bags. Rarities: Common,
Magic (1–2 affixes), Rare (3–4, a made name), Legendary (3 + a power), Unique
(fixed affixes + a power). Smart loot leans toward the hero's class. Smiths
salvage, enchant (reroll one line) and sell wrapped gear; alchemists brew
stronger tonics.

## World and zones

The open world is unchanged in principle: seeded, chunked, infinite. New:

- **Market towns**, one per 5×5 block of road crossings (about 1.3 km apart), each
  with a waystone, smith, alchemist, warden and stash-keeper. Hearthmere has the
  same four.
- **Dungeons**: a door on the road lattice (crypts in mild countries, hollows in
  wild ones). Inside is a separate `World` built by `world/dungeon.js`: rooms
  and corridors on a grid of 4×4 tiles, written into the same chunk format, so
  the renderer draws stone walls (steep terrain), torches (props with light) and
  pools without a single shader change. The zone system (`systems/zones.ts`)
  swaps worlds behind the travel fade, stocks the halls, puts an Inkbound boss
  (with a half-health phase) in the farthest room and a hoard in a quiet one.

## Interface

- `ui/store.ts` turns bus events into signals. The HUD reads the game directly
  and re-renders once a frame; panels re-render when `ui.rev` moves.
- Name slips and damage numbers (`ui/plates.ts`) stay imperative DOM moved with
  transforms: they move every frame, so a virtual DOM would only cost time.
- Panels pause the game (a setting). Everything is a real button with a name;
  arrow keys walk the bag and the skill tree; the gamepad drives menus by
  spatial navigation (`ui/padnav.ts`).
- Item and class pictures are drawn in code (`ui/art.ts`). Each drawing kind
  (sword, greataxe, staff, bow, shield, focus, quiver, helm, chest, robe,
  gloves, legs, boots, amulet, ring) records its shapes, with blade, guard,
  head, dye and trim picked by a generator seeded with the item's id. A canvas
  renderer then draws them by hand: coloured-pencil hatching at the page's one
  slant with paper showing through, a deeper pencil laid with a ragged edge on
  the side away from the light, a sepia pen outline that wobbles, varies its
  pressure and overshoots where it closes, colour a little off the lines, a
  pencil halo in the rarity's colour, and paper tooth over everything. Drawings
  are cached per item, pixel size and colour-vision palette, and `Painting`
  copies them into a canvas at the element's real resolution.
- The HUD is laid out in regions (left column, centre column, right column and
  a bottom dock) so nothing can overlap, at any window size or on touch screens.

## Faces

Heroes and townsfolk wear an expression (`systems/faces.ts`), packed into the
figure's spare data and drawn by the humanoid shader: content (the default, a
small smile), focused while casting, hurt when struck, joy on a level, a
legendary, a cleared dungeon or a claimed bounty, surprise on an evade or a
boss, worry at low health, and crossed-out eyes when fallen. Moments outrank
states by weight, so a blow interrupts a smile but a smile does not interrupt a
wince. Townsfolk cheer when spoken to; the hero cheers on the class screen.

## Projectiles

The hero's arrows are entities of their own (`kind: 'missile'`, archetype
`arrow` in `gfx/archetypes/missiles.js`): a small distance-field arrow with shaft,
head and fletching, turned to the flight direction and tilted to the arc's slope
every frame, with a faint pen streak behind it. A miss sticks in the ground for a
moment. Arrows are never picked by the cursor and cast no shadow. Spells and
creature shots stay effect billboards.

## Saves

`save/store.ts`: one account record (world seed, the shared stash, the hero
list) and one record per hero, each under its own key, so a broken write loses
one thing at most and saving a hero never rewrites the stash. Every record is
versioned and goes through `save/migrate.ts`; the first version's single save is
brought across as a Warden (talents become skill points, charms become rings)
and left in place. Export and import as a file from Settings › Saves.

## Settings and accessibility

The interface is held to WCAG 2.2 AA; the measured contrast pairs are in the
README. All settings are live and saved apart from heroes (`settings/settings.ts`):

- **Seeing**: interface size, text size, Atkinson Hyperlegible, high contrast,
  colour-vision palettes for rarity and warnings (rarity is also always written),
  a choice of warning colour, interface opacity.
- **Motion**: reduce motion (follows the device unless set), screen shake amount,
  hit-stop, hit flashes, steady pencil lines (stops the hatching's six-a-second
  boil), smooth figures (draws figures every frame instead of on twos).
- **Hearing**: captions for important sounds with their direction, arrows for
  blows from off screen, mono sound.
- **Timing**: game speed down to 50%, longer warnings (creature wind-ups up to
  ×1.8), messages that stay up longer; Story difficulty also warns longer.
- **Controls**: every action rebindable (two keys and a pad button each), camera
  speed and inversion, rumble, aim assist strength, auto-attack, auto-pickup.
- **Audio**: everything, music, effects, ambience, interface; silent when hidden.

## Code conventions

- No comments in the source. Names, types and small functions carry the intent;
  this document and the README carry the why.
- `strict`, `noUnusedLocals` and `noUnusedParameters` are on, so dead locals and
  parameters fail the type-check; unused exports and members are removed rather
  than kept for later.
- Shader code lives in `glsl`-tagged template strings (`gfx/shaderlib.js`), which
  is how the release build finds and trims it.

## Testing

`npm test` runs the rules and save tests in Node (stats buckets, damage, item
rolls and determinism, affix scaling, tree gating and refunds, the build
compiler, inventory moves, boss loot, v1 migration, save repair, export/import,
dungeon determinism and reachability). `npm run check` adds the type-check.
`?new` in the address opens the new-hero screen.

## Roadmap

What this pass built is the spine; these are the next pieces, roughly in the
order they would pay off.

**Depth of play**
- Paragon-style progression after level 50 (boards or glyphs) and world tiers
  beyond Nightmare with item power tiers (sacred, ancestral).
- Sockets and gems; an aspect codex (extract a legendary power, imprint it);
  tempering and masterworking at the smith.
- More classes (a summoner, a shapeshifter) and a second set of skills per class.
- Crowd-control diminishing returns and boss stagger bars.
- Elite affixes with their own telegraphs (frozen orbs, walls, teleporting).

**World and story**
- A main campaign: a quest system with objectives and dialogue (the bounty
  system is the seed of it), voiced or illustrated story beats.
- A full-screen world map with fog of war and markers; region renown.
- World events (an "Inkfall" that blots a region for a while), night hunts.
- Endgame dungeons with modifiers (sigils), a timed scaling rift, a boss ladder.
- Dungeon set pieces: traps, levers, doors, multi-level layouts.

**Platform**
- Chunk generation in a Web Worker (the generator already runs without GL).
- A floating render origin to remove the far-distance precision limit.
- PWA install and offline play; Electron or Tauri for Steam; Capacitor for stores.
- Cloud saves behind the `KeyValue` storage interface; crash reporting; opt-in telemetry.
- Localization: every player-facing string through a string table.
- Co-op: the simulation already acts on `player.intent`; an authoritative server
  would drive the same systems, with the seeded RNG keeping clients in step.

**Production**
- Lint and format in CI; Playwright smoke tests that boot the game, make a hero,
  fight, loot, enter a dungeon and save.
- A balance sheet generated from the content tables (damage per point of each
  stat, time to kill by level) and a DPS simulator over the build compiler.
- Content validation at build time (every skill's params named in its words, every
  aspect fits a slot, every effect names a real skill).
