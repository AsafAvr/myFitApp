# The Valley — your habits, grown in pen and pencil

A fork of **[Brushwild](https://github.com/kevintngo/procedural-rpg)** by kevintngo
(MIT, see [LICENSE](LICENSE); forked at the commit in [UPSTREAM](UPSTREAM)). Brushwild
is an open-world action RPG drawn entirely by shaders: a raymarched world of
signed-distance shapes, hatched in coloured pencil on cream paper with a
sepia pen, the hatching re-laid six times a second like a hand-drawn film.
Everything about how it is drawn is Brushwild's; this fork grows its home
town out of your habits.

## What the fork changes

The fork stays as close to Brushwild as it can: Hearthmere, its townsfolk, the
wilds, combat, loot and dungeons are untouched, and every habit is built from
Brushwild's own pieces and rules.

- **Habits are sites.** Brushwild lays its world on a road lattice and puts a
  site at crossings: farms, shrines, camps, ruins. The fork adds one more kind,
  `habit` (`src/world/sites.js`), and gives the crossings around Hearthmere to
  your habits, running first. Each habit site has a waystone (so you can travel
  between them), a signpost and a keeper, and is built from a recipe of
  Brushwild props that grows through seven stages (`src/world/valley.js`):
  walking a farm lane, cycling a mill, swimming a reed pond, strength a ring of
  pillars with a beacon, yoga a lantern garden, reading a stall that becomes a
  library, meditation a cairn that becomes a standing stone.
- **Neglect makes a den.** A habit left for three weeks gets overgrown and its
  site becomes a `den`, Brushwild's own flag for ruins: an elder creature waits
  there, and the warden's bounties will send you to it, until you take the habit
  up again.
- **The great tree.** Running grows a new prop, `greattree` (`src/world/props.js`,
  `src/gfx/greattree.js`). It is Brushwild's tree recipe (the same tapered trunk,
  the same lumpy crown with the same noise, bark and leaf shading) scaled up and
  shaped by the runs: its size from the habit's stage, one limb for each strong
  month, a crown lump at the end of each limb sized by the leaves (kilometres)
  on it, fruit for the last three weeks, and leaves in Brushwild's own palette
  for the season your recent load puts it in (bare after three weeks without a
  run).
- **Keepers.** Talk to a keeper and its panel opens (`src/ui/habitpanel.tsx`).
  The running keeper shows the full tree, grown run by run by the FitTree engine
  (`../web/tree.js`, wrapped in `src/world/runtree.ts`) and drawn with
  Brushwild's item-art hand (`src/ui/treeart.ts`, using the pen, hatching and
  paper from `src/ui/art.ts`). Hover anything to read the run behind it; scrub
  back in time. Manual habits (reading, meditation) are logged from their panel.
- The code follows Brushwild's layers: habit data in `game/content/habits.ts`,
  pure rules in `game/rules/habits.ts` (tested in `habits.test.ts`), the log in
  `game/save/habits.ts`, loading in `game/state/habits.ts`. The prop height limit
  rises to 14.5 for the tree.

## Run it

```bash
npm install
```

```bash
npm run dev
```

It reads `public/genome.json` (a synthetic demo runner). `python -m fittree build --valley`
in the parent project ships a built copy next to each runner's tree page with
their real data.

See Brushwild's original documentation in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
