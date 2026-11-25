import { useState } from 'preact/hooks';
import { ui, getGame, log, toast, closePanel, openPanel } from './store';
import { Panel, ItemCell, Icon, rarityColor, confirmThen, useTip, ItemTooltip, Choice } from './components';
import { glyph } from './icons';
import type { EquipSlot } from '../game/types';
import { ATTRS } from '../game/types';
import type { ItemInstance } from '../game/rules/items';
import { affixText, displayName, sellValue, salvageYield } from '../game/rules/items';
import { equipFromBag, unequip, sortBag, freeSlots, type Outcome } from '../game/rules/inventory';
import { AFFIX, MATERIAL, RARITY_INFO, affixValue } from '../game/content/items';
import { ATTRIBUTE_INFO, xpToNext, LEVEL_CAP, RESIST_CAP } from '../game/rules/stats';
import { DIFFICULTY } from '../game/content/monsters';
import { BOONS } from '../game/content/boons';
import { TONIC_TIERS, GAMBLE_KINDS } from '../game/systems/vendors';
import { damageScore, toughScore } from './compare';
import { BAG_SIZE } from '../game/state/character';
import { STASH_TABS } from '../game/save/store';
import { VIEWS } from '../config.js';

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

function act(out: Outcome, ok?: string): boolean {
  const g = getGame();
  if (!out.ok) { if (out.reason) log(out.reason); g.bus.emit('deny'); return false; }
  if (ok) log(ok);
  g.player.dirty = true;
  g.playerSystem.recompile(true);
  g.bus.emit('equipment:changed');
  g.bus.emit('inventory:changed');
  g.bus.emit('ui:click');
  return true;
}

type Sel = { where: 'bag'; i: number } | { where: 'worn'; slot: EquipSlot } | null;

const DOLL: [EquipSlot, string, string][] = [
  ['helm', 'Helm', 'helm'], ['amulet', 'Amulet', 'amulet'],
  ['mainhand', 'Weapon', 'sword'], ['chest', 'Chest', 'chest'], ['offhand', 'Off-hand', 'shield'],
  ['gloves', 'Gloves', 'gloves'], ['legs', 'Legs', 'legs'], ['ring1', 'Ring', 'ring'],
  ['boots', 'Boots', 'boots'], ['ring2', 'Ring', 'ring'],
];

export function InventoryPanel() {
  ui.rev.value;
  const g = getGame(), c = g.player.char;
  const [sel, setSel] = useState<Sel>(null);
  const npc = ui.npc.value;
  const vendor = npc && (npc.role === 'smith' || npc.role === 'alchemist' || npc.role === 'tinker') ? npc : null;
  const stash = npc?.role === 'stash';
  const [tab] = useState(0);
  const item: ItemInstance | null = sel ? (sel.where === 'bag' ? c.bag[sel.i] : c.equipment[sel.slot] ?? null) : null;

  const useBag = (i: number) => {
    const it = c.bag[i];
    if (!it) return;
    if (stash) { act(g.vendors.deposit(i, tab)); return; }
    if (act(equipFromBag(c, i), `You put on the ${displayName(it)}.`)) setSel(null);
  };
  const useWorn = (slot: EquipSlot) => { if (act(unequip(c, slot))) setSel(null); };
  const sell = (i: number) => {
    const it = c.bag[i];
    if (!it) return;
    const go = () => { if (act(g.vendors.sell(i))) setSel(null); };
    if (g.settings.confirmValuable && (it.rarity === 'legendary' || it.rarity === 'unique')) confirmThen('Sell this?', `${displayName(it)} is ${RARITY_INFO[it.rarity].name.toLowerCase()}. It fetches ${sellValue(it)} glint and cannot be bought back.`, 'Sell it', go, true);
    else go();
  };
  const salvage = (i: number) => {
    const it = c.bag[i];
    if (!it) return;
    const go = () => { if (act(g.vendors.salvage(i))) setSel(null); };
    if (g.settings.confirmValuable && (it.rarity === 'legendary' || it.rarity === 'unique')) confirmThen('Break it down?', `${displayName(it)} will become ${salvageYield(it).map((m) => `${m.n} ${MATERIAL[m.id].name}`).join(' and ')}. This cannot be undone.`, 'Salvage', go, true);
    else go();
  };
  const drop = (i: number) => {
    const it = c.bag[i];
    if (!it) return;
    const go = () => { c.bag[i] = null; g.loot.discard(it); act({ ok: true }); setSel(null); };
    if (it.rarity !== 'common' && g.settings.confirmValuable) confirmThen('Drop this?', `${displayName(it)} will be left on the ground here.`, 'Drop it', go);
    else go();
  };

  const onGridKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement, i = Number(t.dataset.index);
    if (!Number.isFinite(i)) return;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 11, ArrowUp: -11 };
    if (step[e.key] !== undefined) {
      e.preventDefault();
      const n = Math.max(0, Math.min(BAG_SIZE - 1, i + step[e.key]));
      (t.parentElement!.children[n] as HTMLElement)?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); drop(i); }
    else if (e.key.toLowerCase() === 'j') { const it = c.bag[i]; if (it) { it.junk = !it.junk; g.bus.emit('inventory:changed'); } }
  };

  return (
    <Panel id="inventory" title="Inventory" side="right" wide actions={<button type="button" class="btn small" onClick={() => { sortBag(c); setSel(null); g.bus.emit('inventory:changed'); }}>Sort</button>}>
      <div class="doll-row">
        <div class="doll" aria-label="Worn">
          {DOLL.map(([slot, label, ghost]) => (
            <div class={`doll-slot d-${slot}`}>
              <ItemCell item={c.equipment[slot]} label={label} empty={ghost} worn selected={sel?.where === 'worn' && sel.slot === slot}
                onClick={() => setSel(c.equipment[slot] ? { where: 'worn', slot } : null)} onUse={() => useWorn(slot)} />
            </div>
          ))}
        </div>
        <div class="doll-side">
          <div class="sheet small">
            <div><span>Damage</span>{Math.round(damageScore(g.player.build))}</div>
            <div><span>Toughness</span>{Math.round(toughScore(g.player.build))}</div>
            <div><span>Health</span>{g.player.maxHp}</div>
            <div><span>Armor</span>{Math.round(g.player.build.derived.armor)}</div>
          </div>
          <div class="row"><span class="coin">{c.gold} glint</span><span>{c.potions} {TONIC_TIERS[c.potionTier].name}{c.potions === 1 ? '' : 's'}</span></div>
        </div>
      </div>
      <div class="row"><div class="label">Bag · {BAG_SIZE - freeSlots(c.bag)} / {BAG_SIZE}</div>{vendor && <button type="button" class="btn small" disabled={!c.bag.some((x) => x?.junk)} onClick={() => { const n = g.vendors.sellJunk(); if (n) log(`Sold your junk for <em>${n} glint</em>.`); }}>Sell junk</button>}</div>
      <div class="bag" role="grid" aria-label="Bag" onKeyDown={onGridKey}>
        {c.bag.map((it, i) => (
          <ItemCell item={it} index={i} selected={sel?.where === 'bag' && sel.i === i}
            onClick={() => { if (it) { it.fresh = false; setSel({ where: 'bag', i }); } else setSel(null); }}
            onUse={() => (vendor && vendor.role !== 'alchemist' ? sell(i) : useBag(i))} />
        ))}
      </div>
      {item && sel && (
        <div class="sel-actions" aria-label="What to do with it">
          <div class="sel-name" style={{ color: rarityColor(item.rarity) }}>{displayName(item)}</div>
          <div class="btns">
            {sel.where === 'bag' && !stash && <button type="button" class="btn primary" onClick={() => useBag(sel.i)}>Wear</button>}
            {sel.where === 'worn' && <button type="button" class="btn" onClick={() => useWorn(sel.slot)}>Take off</button>}
            {sel.where === 'bag' && stash && <button type="button" class="btn primary" onClick={() => { act(g.vendors.deposit(sel.i, tab)); setSel(null); }}>Put in stash</button>}
            {sel.where === 'bag' && vendor && <button type="button" class="btn" onClick={() => sell(sel.i)}>Sell · {sellValue(item)}</button>}
            {sel.where === 'bag' && vendor && vendor.role !== 'alchemist' && <button type="button" class="btn" onClick={() => salvage(sel.i)}>Salvage</button>}
            {sel.where === 'bag' && <button type="button" class="btn" aria-pressed={!!item.junk} onClick={() => { item.junk = !item.junk; g.bus.emit('inventory:changed'); }}>{item.junk ? 'Not junk' : 'Junk'}</button>}
            {sel.where === 'bag' && <button type="button" class="btn" onClick={() => drop(sel.i)}>Drop</button>}
          </div>
        </div>
      )}
      <Materials />
      <p class="hint dim">{g.touch ? 'Tap to choose; double-tap to wear.' : 'Click to choose, right-click to wear or take off. Arrow keys move, J marks junk, Delete drops.'}</p>
    </Panel>
  );
}

function Materials() {
  const c = getGame().player.char;
  const ids = Object.keys(c.materials).filter((id) => c.materials[id] > 0);
  if (!ids.length) return null;
  return (
    <div class="mats" aria-label="Materials">
      {ids.map((id) => {
        const m = MATERIAL[id];
        return <span class="mat" title={m?.desc}><Icon svg={glyph(id === 'scrap' || id === 'thread' || id === 'inkstone' ? 'gem' : 'pouch', `rgb(${(m?.color ?? [200, 200, 200]).join(',')})`)} />{m?.name ?? id} ×{c.materials[id]}</span>;
      })}
    </div>
  );
}

export function CharacterPanel() {
  ui.rev.value;
  const g = getGame(), p = g.player, c = p.char, d = p.build.derived, cls = p.build.cls;
  const base = p.build.derived.attrs;
  const res = d.resist;
  const avgRes = (res.fire + res.frost + res.storm + res.poison + res.shadow) / 5;
  return (
    <Panel id="character" title="Character" side="left">
      <div class="row"><p><strong>{c.name}</strong> · level {c.level} {cls.name}</p><p class="dim">{c.level >= LEVEL_CAP ? 'Highest level' : `${c.xp} / ${xpToNext(c.level)} xp`}</p></div>
      <div class="attrs">
        {ATTRS.map((a) => (
          <div class={`attr ${a === cls.primary ? 'primary' : ''}`}>
            <div><strong>{ATTRIBUTE_INFO[a].name}</strong><small>{ATTRIBUTE_INFO[a].hint}</small></div>
            <div class="val">{base[a]}</div>
          </div>
        ))}
      </div>
      <div class="label">Offence</div>
      <div class="sheet">
        <div><span>Weapon</span>{d.weapon.min}–{d.weapon.max}</div>
        <div><span>{ATTRIBUTE_INFO[cls.primary].name} bonus</span>×{d.mainMult.toFixed(2)}</div>
        <div><span>Critical chance</span>{pct(d.critChance, 1)}</div>
        <div><span>Critical damage</span>+{pct(d.critMult - 1)}</div>
        <div><span>Attack speed</span>{pct(d.attackSpeed - 1, 1)}</div>
        <div><span>Damage bonus</span>+{pct(p.build.totals.add.damage)}</div>
        <div><span>Shorter cooldowns</span>{pct(d.cdr)}</div>
        <div><span>{cls.resource.name}</span>{d.maxResource}</div>
      </div>
      <div class="label">Defence</div>
      <div class="sheet">
        <div><span>Health</span>{p.maxHp}</div>
        <div><span>Health a second</span>{d.lifeRegen.toFixed(1)}</div>
        <div><span>Armor</span>{Math.round(d.armor)}</div>
        <div><span>Dodge</span>{pct(d.dodge, 1)}</div>
        <div><span>Block</span>{pct(d.block)}</div>
        <div><span>Damage taken</span>{pct(d.taken)}</div>
        <div title={`Fire ${pct(res.fire)}, frost ${pct(res.frost)}, storm ${pct(res.storm)}, poison ${pct(res.poison)}, shadow ${pct(res.shadow)}. The most any can reach is ${pct(RESIST_CAP)}.`}><span>Resistance</span>{pct(avgRes)}</div>
        <div><span>Thorns</span>{Math.round(d.thorns)}</div>
      </div>
      <div class="label">Fortune</div>
      <div class="sheet">
        <div><span>Movement</span>{pct(d.moveSpeed - 1)}</div>
        <div><span>Glint found</span>+{pct(d.goldFind - 1)}</div>
        <div><span>Finer finds</span>+{pct(d.magicFind - 1)}</div>
        <div><span>Experience</span>+{pct(d.xpMul - 1)}</div>
      </div>
      <Choice label="Difficulty" hint={p.safe ? DIFFICULTY[c.difficulty].desc : 'Change it in a town or another safe place.'} value={c.difficulty}
        options={Object.entries(DIFFICULTY).map(([k, v]) => [k, v.name]) as [typeof c.difficulty, string][]}
        onChange={(v) => {
          if (!p.safe) { log('Choose a difficulty in a town or another safe place.'); g.bus.emit('deny'); return; }
          c.difficulty = v; toast(`${DIFFICULTY[v].name}`, DIFFICULTY[v].desc, 3.4); g.bus.emit('build:changed');
        }} />
      <div class="label">The journey</div>
      <div class="sheet">
        <div><span>Creatures felled</span>{c.tally.kills}</div>
        <div><span>Elites</span>{c.tally.elites}</div>
        <div><span>Bosses</span>{c.tally.bosses}</div>
        <div><span>Dungeons cleared</span>{c.tally.dungeons}</div>
        <div><span>Falls</span>{c.tally.deaths}</div>
        <div><span>Played</span>{Math.floor(c.played / 3600)}h {Math.floor(c.played / 60) % 60}m</div>
      </div>
    </Panel>
  );
}

export function VendorPanel() {
  ui.rev.value;
  const g = getGame(), c = g.player.char, npc = ui.npc.value;
  if (!npc) return null;
  const smith = npc.role === 'smith' || npc.role === 'tinker';
  const alch = npc.role === 'alchemist' || npc.role === 'tinker';
  const next = g.vendors.nextTonic();
  const say = (out: Outcome, ok?: string) => { if (!out.ok) { log(out.reason ?? 'No.'); g.bus.emit('deny'); } else if (ok) log(ok); };
  const sellableMats = Object.keys(c.materials).filter((id) => !['scrap', 'thread', 'inkstone'].includes(id)).reduce((n, id) => n + (MATERIAL[id]?.value ?? 0) * c.materials[id], 0);
  return (
    <Panel id="vendor" title={`${npc.name}, ${npc.title}`} side="left">
      <p>“{npc.role === 'smith' ? 'Bring me what you do not want. I can make something of it.' : npc.role === 'alchemist' ? 'Fresh tonics, fair prices.' : 'Bits and bottles, all honest.'}”</p>
      <div class="row"><span class="coin">{c.gold} glint</span><span class="dim">Choose an item in your bag to sell or salvage it.</span></div>
      {alch && <>
        <div class="label">Tonics</div>
        <div class="offer"><strong>Refill your tonics</strong><small>{c.potions} of {g.player.build.derived.potionCharges} carried. Free in any town.</small>
          <button type="button" class="btn" disabled={c.potions >= g.player.build.derived.potionCharges} onClick={() => say(g.vendors.refill(), 'Your tonics are full.')}>Refill</button></div>
        {next ? <div class="offer"><strong>Brew {next.name}s</strong><small>Heal {next.heal} of your health · {Object.entries(next.needs).map(([id, n]) => `${MATERIAL[id].name} ${Math.min(c.materials[id] ?? 0, n)}/${n}`).join(', ')}</small>
          <button type="button" class="btn primary" disabled={c.gold < next.glint} onClick={() => say(g.vendors.brewTonic())}>Brew · {next.glint}</button></div>
          : <p class="dim">Your tonics are as strong as they can be brewed.</p>}
        <div class="offer"><strong>Sell materials</strong><small>Everything creatures carried. The smith’s scrap, thread and inkstone are kept.</small>
          <button type="button" class="btn" disabled={!sellableMats} onClick={() => { const n = g.vendors.sellMaterials(); if (n) log(`Sold materials for <em>${n} glint</em>.`); }}>Sell · {sellableMats}</button></div>
      </>}
      {smith && <>
        <div class="label">A wrapped piece · {g.vendors.gamblePrice()} glint</div>
        <p class="dim small">Something you can use, of the kind you choose. Who knows how fine.</p>
        <div class="gamble">
          {GAMBLE_KINDS.map((k) => <button type="button" class="btn small" disabled={c.gold < g.vendors.gamblePrice()} onClick={() => say(g.vendors.gamble(k.slot))}>{k.name}</button>)}
        </div>
        <Enchant />
      </>}
    </Panel>
  );
}

function Enchant() {
  const g = getGame(), c = g.player.char;
  const [slot, setSlot] = useState<EquipSlot | null>(null);
  const worn = (Object.keys(c.equipment) as EquipSlot[]).filter((s) => c.equipment[s] && c.equipment[s]!.rarity !== 'unique' && c.equipment[s]!.affixes.length);
  const it = slot ? c.equipment[slot] : null;
  return (
    <div class="enchant">
      <div class="label">Enchant · change one line on something you wear</div>
      <div class="gamble">{worn.map((s) => <button type="button" class={`btn small ${s === slot ? 'on' : ''}`} style={{ color: rarityColor(c.equipment[s]!.rarity) }} aria-pressed={s === slot} onClick={() => setSlot(s)}>{displayName(c.equipment[s]!)}</button>)}</div>
      {it && slot && <>
        <p class="dim small">Costs {g.vendors.enchantCost(it).glint} glint and {g.vendors.enchantCost(it).thread} Gilded Thread (you have {c.materials.thread ?? 0}). Choose the line to change:</p>
        {it.affixes.map((_, i) => <EnchantLine item={it} index={i} onDo={() => { const out = g.vendors.enchant({ slot }, i); if (!out.ok) { log(out.reason!); g.bus.emit('deny'); } }} />)}
      </>}
      {!worn.length && <p class="dim small">Wear something with affixes to enchant it.</p>}
    </div>
  );
}

function EnchantLine({ item, index, onDo }: { item: ItemInstance; index: number; onDo: () => void }) {
  const tip = useTip(() => <ItemTooltip item={item} compare={false} worn />, true);
  const r = item.affixes[index], a = AFFIX[r.id];
  const text = a ? affixText(a, affixValue(a, r.roll, item.ilvl), r.skill) : r.id;
  return <button type="button" class="btn line" {...tip} onClick={onDo}>Change “{text}”</button>;
}

export function StashPanel() {
  ui.rev.value;
  const g = getGame();
  const [tab, setTab] = useState(0);
  const items = g.stash[tab];
  return (
    <Panel id="stash" title="Stash" side="left">
      <p class="dim">Shared by every hero of yours. Click an item to take it; choose one in your bag to put it here.</p>
      <div class="tabs row" role="tablist" aria-label="Stash tabs">
        {Array.from({ length: STASH_TABS }, (_, i) => <button type="button" role="tab" aria-selected={i === tab} class={`tab ${i === tab ? 'on' : ''}`} onClick={() => setTab(i)}>Tab {i + 1}</button>)}
      </div>
      <div class="bag stash" aria-label={`Stash tab ${tab + 1}`}>
        {items.map((it, i) => <ItemCell item={it} index={i} onClick={() => { if (it) act(g.vendors.withdraw(i, tab)); }} onUse={() => { if (it) act(g.vendors.withdraw(i, tab)); }} />)}
      </div>
    </Panel>
  );
}

export function BountyPanel() {
  ui.rev.value;
  const g = getGame(), j = g.player.char.journey, b = j.bounty, npc = ui.npc.value;
  if (b) {
    const done = b.have >= b.need;
    return (
      <Panel id="bounty" title={npc ? `${npc.name}’s board` : 'Bounty'} side="left">
        <p>“{done ? 'Good work out there. Here is your pay.' : 'Still at it? Come back when it is done.'}”</p>
        <div class="offer"><strong>{g.bounties.title(b)}</strong><small>{b.need > 1 ? `${b.have} of ${b.need} · ` : ''}reward {b.xp} xp, {b.glint} glint</small>
          {done ? <button type="button" class="btn primary" data-autofocus onClick={() => { g.bounties.claim(); }}>Claim</button>
            : <button type="button" class="btn" onClick={() => confirmThen('Give up this bounty?', 'Anything gathered for it stays with you.', 'Give up', () => g.bounties.abandon())}>Give up</button>}
        </div>
      </Panel>
    );
  }
  return (
    <Panel id="bounty" title={npc ? `${npc.name}’s board` : 'Bounties'} side="left">
      <p>“There is always work for a hero. Take a job.”</p>
      {g.bounties.offers.filter(Boolean).map((o, i) => (
        <div class="offer"><strong>{g.bounties.title(o!)}</strong><small>Reward {o!.xp} xp, {o!.glint} glint{o!.x !== undefined ? ' · marked in red on your map' : ''}</small>
          <button type="button" class="btn" onClick={() => { g.bounties.accept(i); closePanel('bounty'); }}>Accept</button></div>
      ))}
    </Panel>
  );
}

export function MapPanel() {
  ui.rev.value;
  const g = getGame(), p = g.player, j = p.char.journey;
  const ways = j.ways.map((w, i) => ({ w, i, d: Math.hypot(w.x - p.x, w.z - p.z) })).sort((a, b) => a.d - b.d);
  const known = Object.keys(j.known).length;
  const holes = g.overworld.sites.inRange(p.x, p.z, 700).filter((s: { kind: string; key: string }) => s.kind === 'dungeon' && j.found[s.key]);
  const lands = Object.keys(j.lands).length;
  return (
    <Panel id="map" title="Map and waystones" side="right">
      <div class="row"><p>{g.discover.count()} places found</p><p class="dim">{known ? `${known} more marked on the map` : ''}</p></div>
      <div class="label">The Long Walk: {lands} of {g.discover.totalCountries} countries</div>
      <p class="dim">{g.discover.nextMark() ? `The road teaches a skill point at ${g.discover.nextMark()}.` : 'You have walked them all.'}</p>
      {j.boon && <p>{BOONS[j.boon.id]?.name}: {BOONS[j.boon.id]?.desc}</p>}
      <div class="label">Waystones you are attuned to</div>
      {ways.map(({ w, i, d }) => (
        <div class="way"><strong>{w.name}</strong><small>{d < 12 ? 'You are here' : `${Math.round(d)} paces away`}</small>
          <button type="button" class="btn" disabled={d < 12} onClick={() => { if (g.discover.travel(i)) closePanel('map'); }}>Go</button></div>
      ))}
      <p class="dim">{ways.length < 2 ? 'Walk up to a waystone to attune to it. Every town and shrine has one.' : 'Travel takes a moment, and cannot be done in the middle of a fight.'}</p>
      {holes.length > 0 && <>
        <div class="label">Dungeons found</div>
        {holes.map((h: { key: string; name: string; x: number; z: number }) => <div class="way"><strong>{h.name}</strong><small>{j.dungeons[h.key] ? `Cleared ${j.dungeons[h.key].cleared} time${j.dungeons[h.key].cleared === 1 ? '' : 's'}` : 'Not yet cleared'} · {Math.round(Math.hypot(h.x - p.x, h.z - p.z))} paces</small></div>)}
      </>}
    </Panel>
  );
}

export function JournalPanel() {
  ui.rev.value;
  const g = getGame(), c = g.player.char, j = c.journey;
  return (
    <Panel id="journal" title="Journal" side="left">
      <div class="label">Bounty</div>
      <p>{j.bounty ? `${g.bounties.title(j.bounty)} — ${g.bounties.track(j.bounty)}` : 'None taken. Every town’s warden has a board.'}</p>
      <div class="label">What to do</div>
      <ul class="todo">
        <li>Grow stronger: spend skill points in the <button type="button" class="link" onClick={() => openPanel('skills')}>skill tree</button> and wear what you find.</li>
        <li>Find the other towns: each has a waystone, a smith, an alchemist, a warden and your stash.</li>
        <li>Go down into the crypts and hollows. An Inkbound waits at the bottom of each, and a hoard.</li>
        <li>Walk every country for the Long Walk ({Object.keys(j.lands).length} of {g.discover.totalCountries}).</li>
        <li>Raise the difficulty in the character sheet for more experience and finer finds.</li>
      </ul>
      <div class="label">Bounties done</div>
      <p>{j.bountiesDone}</p>
    </Panel>
  );
}

export function ViewPanel() {
  const g = getGame(), cam = g.camera;
  const b = (text: string, fn: () => void) => <button type="button" class="btn" onClick={() => { fn(); g.bus.emit('ui:click'); }}>{text}</button>;
  const d = document as Document & { webkitFullscreenElement?: Element };
  return (
    <Panel id="view" title="View" side="right">
      <div class="pair">{b('Behind the hero', () => Object.assign(cam.goal, { pitch: VIEWS.behind[0], distance: VIEWS.behind[1] }))}{b('From above', () => Object.assign(cam.goal, { pitch: VIEWS.above[0], distance: VIEWS.above[1] }))}</div>
      <div class="pair">{b('Turn left', () => cam.rotate(0.5, 0))}{b('Turn right', () => cam.rotate(-0.5, 0))}</div>
      <div class="pair">{b('Look from higher', () => cam.rotate(0, 0.16))}{b('Look from lower', () => cam.rotate(0, -0.16))}</div>
      <div class="pair">{b('Closer', () => cam.zoom(0.84))}{b('Farther', () => cam.zoom(1.19))}</div>
      {document.fullscreenEnabled && <div class="pair">{b('Full screen on or off', () => { (d.fullscreenElement ? d.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); })}</div>}
      <p class="dim">{g.touch ? 'You can also drag the picture to turn it and pinch to zoom.' : 'You can also drag with the right mouse button, turn with Q and E, and zoom with the wheel.'}</p>
    </Panel>
  );
}
