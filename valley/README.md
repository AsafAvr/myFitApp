# The Valley — your habits, grown in pen and pencil

A fork of **[Brushwild](https://github.com/kevintngo/procedural-rpg)** by kevintngo
(MIT, see [LICENSE](LICENSE); forked at the commit in [UPSTREAM](UPSTREAM)). Brushwild
is an open-world action RPG drawn entirely by shaders: a raymarched world of
signed-distance shapes, hatched in coloured pencil on cream paper with a
sepia pen, the hatching re-laid six times a second like a hand-drawn film.
Everything about how it is drawn is Brushwild's; this fork grows its home
town out of your habits.

## What the fork changes

- **The home town is your valley.** Hearthmere is replaced by `<Name>'s Valley`,
  laid out from your habit data (`src/habits/habits.ts`). Each habit is a place
  that grows through seven stages from its own weekly persistence, using
  Brushwild's props: walking is a fenced lane, cycling a windmill, swimming a
  reedy pond, strength a ring of pillars with a beacon, yoga a garden with
  lamps, reading a stall that becomes a library, meditation a cairn that becomes
  a standing stone. A habit you neglect for three weeks gets overgrown.
- **The great tree.** Running is a new prop, `greattree` (`src/world/props.js`),
  whose signed-distance shape is fed by uniforms built from the real runs
  (`buildGreatTree`): trunk girth from persistence, a limb for each strong
  month spread around the trunk, foliage where the runs are, leaves in the
  season your recent load puts them in, and fruit for the last three weeks.
  It is drawn by Brushwild's own pencil shading.
- **Keepers.** Every place has a keeper (a new `keeper` townsfolk role). Talk to
  one and its panel opens (`src/ui/habitpanel.tsx`). The tree's keeper shows the
  **full tree**, grown run by run by the FitTree engine (`../web/tree.js`) and
  drawn with Brushwild's item-art hand (`src/habits/treeart.ts`, using the pen,
  hatching and paper from `src/ui/art.ts`): roots for weekdays, rings for weeks,
  a twig per run, leaves per km, fruit, blossoms, amber milestones, the nest,
  the swing. Hover anything to read the run behind it; scrub back in time.
- The prop height limit rises to 14.5 for the tree; the title screen is renamed.

The rest of Brushwild (classes, skills, loot, the wilds, dungeons) is unchanged.

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
