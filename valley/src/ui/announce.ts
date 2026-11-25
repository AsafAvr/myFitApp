import type { Game } from '../game/game';
import { log, toast } from './store';
import { RARITY_COLORS } from '../settings/settings';

const SITE_WORDS: Record<string, string> = {
  town: 'A safe hearth', market: 'A safe hearth, with a smith, an alchemist and your stash',
  shrine: 'A waystone rests here', camp: 'A tinker trades by the fire', ruin: 'Something old lives here',
  farm: 'Fields and quiet', dungeon: 'A way down into the dark',
};

export function announce(g: Game): void {
  const bus = g.bus;
  bus.on('log', (d) => (d.big ? toast('Bounty complete', 'Return to any warden for your pay.') : log(d.text)));
  bus.on('pickup', (d) => {
    if (d.item === 'gold' || d.item === 'potion') return;
    const color = d.rarity ? RARITY_COLORS[g.settings.colorVision][d.rarity] : '';
    log(`Picked up <em${color ? ` style="color:${color}"` : ''}>${d.name ?? d.item}</em>`);
  });
  bus.on('levelup', (d) => toast(`Level ${d.level}`, 'A skill point to spend in the skill tree.', 3.6));
  bus.on('site:enter', (s) => toast(s.name, SITE_WORDS[s.kind] ?? ''));
  bus.on('attune', (d) => log(`Attuned to <em>${d.name}</em>. You will return here, and its waystone refills your tonics.`));
  bus.on('fallen', (d) => toast('You were overcome', d.lost ? `${d.lost} glint lies where you fell. Go back for it before you fall again.` : `Returning to ${g.player.char.journey.waystone.name}…`, 4));
  bus.on('recovered', (d) => log(`You have your <em>${d.n} glint</em> back.`));
  bus.on('nightfall', () => toast('Night falls', 'The wilds grow bolder after dark, and richer.', 4));
  bus.on('daybreak', () => log('Day breaks. The wilds settle.'));
  bus.on('trade', (d) => { if (d.total) log(`Sold for <em>${d.total} glint</em>.`); });
  bus.on('bounty:claimed', (b) => toast('Bounty paid', `+${b.xp} xp · +${b.glint} glint`));
  bus.on('monster:died', (m) => { if (m.elite) log(`You felled <em>${m.name}</em>.`); });
  bus.on('boon', (d) => toast(d.name, `${d.desc} The stones lend it for a few minutes.`, 3.6));
  bus.on('travel:arrive', (d) => log(`Travelled to <em>${d.name}</em>.`));
  bus.on('zone:enter', (d) => { if (d.zone.kind === 'dungeon') toast(d.name, 'An Inkbound waits in the deepest hall.', 3.6); });
  bus.on('dungeon:cleared', (d) => toast('Dungeon cleared', d.first ? 'The hoard is yours, and you may leave from anywhere here.' : 'Cleared again. Leave from anywhere here.', 4));
  bus.on('found', (d) => {
    if (d.kind === 'cache') toast(d.name, 'Left under a cairn by someone who never came back for it.', 3.2);
    else if (d.kind === 'beacon') toast(d.name, d.shown ? `${d.shown} places round about are marked on your map.` : 'Nothing new can be seen from here.', 3.6);
    else if (d.kind === 'stones') log(`Found <em>${d.name}</em>.`);
    else log(`Found <em>${d.name}</em>. ${d.count} ${d.count === 1 ? 'place' : 'places'} so far.`);
  });
  bus.on('land', (d) => {
    if (d.all) toast('The Long Walk is done', 'You have set foot in every country. The road teaches one last skill point.', 5);
    else if (d.mark) toast(`${d.count} countries walked`, 'The road teaches a skill point.', 4);
    else log(`New country: <em>${d.name}</em>. ${d.count} of ${d.total} walked.`);
  });
}
