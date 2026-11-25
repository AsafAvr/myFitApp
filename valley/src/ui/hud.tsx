import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ui, getGame, togglePanel, isOpen, log } from './store';
import { Icon } from './components';
import { ACT_ICONS, MENU_ICONS, glyph, skillIcon } from './icons';
import { GuideArrow, GuidePlate } from './guide';
import { keyName, padName, type ActionId } from '../engine/bindings';
import { STATUSES } from '../game/content/statuses';
import { ELITE_AFFIXES } from '../game/content/monsters';
import { BOONS } from '../game/content/boons';
import { xpToNext, LEVEL_CAP } from '../game/rules/stats';
import { pointsEarned, pointsSpent } from '../game/rules/tree';
import { BAR_SIZE } from '../game/state/character';
import type { Monster } from '../game/types';

const HOURS: [number, string][] = [[5, 'Dawn'], [8, 'Morning'], [12, 'Midday'], [17, 'Afternoon'], [20, 'Dusk'], [24, 'Night']];
const SLOTS: ActionId[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'];
const pct = (v: number) => `scaleX(${Math.max(0, Math.min(1, v)).toFixed(3)})`;

export function bindingLabel(action: ActionId): string {
  const g = getGame();
  if (g.input.lastDevice === 'pad') return padName(g.settings.pad[action]);
  const k = g.settings.keys[action][0];
  if (k === 'Mouse0') return 'LMB';
  if (k === 'Mouse2') return 'RMB';
  if (k === 'Mouse1') return 'MMB';
  return keyName(k);
}

function Status() {
  const g = getGame(), p = g.player, c = p.char, res = p.build.cls.resource;
  const xpFrac = c.level >= LEVEL_CAP ? 1 : c.xp / xpToNext(c.level);
  const boon = c.journey.boon;
  const statuses = p.statuses.filter((s) => s.id !== 'warded' || p.barrier > 0);
  return (
    <section id="status" class="plate" aria-label="Your hero">
      <div class="badge" title="Level">{c.level}</div>
      <div class="bars">
        <div class="who"><span id="pname">{c.name}</span>
          {boon && <span class="boon">{BOONS[boon.id]?.name} {Math.floor(boon.left / 60)}:{String(Math.max(0, Math.ceil(boon.left) % 60)).padStart(2, '0')}</span>}
          <span class="coin" title="Glint">{c.gold}</span></div>
        <div class="meter">
          <Icon svg={glyph('heart', '#d8584a')} />
          <div class={`bar hp ${g.low ? 'low' : ''}`} role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={p.maxHp} aria-valuenow={Math.ceil(p.hp)}>
            <i style={{ transform: pct(p.hp / p.maxHp) }} />
            {p.barrier > 0 && <i class="ward" style={{ transform: pct(p.barrier / p.maxHp) }} />}
          </div>
          <b>{Math.ceil(p.hp)} / {p.maxHp}</b>
        </div>
        <div class="meter">
          <Icon svg={glyph('orb', res.color)} />
          <div class="bar res" style={{ '--res': res.color } as JSX.CSSProperties} role="meter" aria-label={res.name} aria-valuemin={0} aria-valuemax={p.build.derived.maxResource} aria-valuenow={Math.floor(p.resource)}>
            <i style={{ transform: pct(p.resource / p.build.derived.maxResource) }} />
          </div>
          <b>{Math.floor(p.resource)} {res.name}</b>
        </div>
        <div class="bar xp" role="meter" aria-label="Experience toward the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(xpFrac * 100)}><i style={{ transform: pct(xpFrac) }} /></div>
        {statuses.length > 0 && <ul class="buffs" aria-label="Effects on you">
          {statuses.map((s) => {
            const def = STATUSES[s.id];
            return <li class={def.kind} title={`${def.name}: ${def.desc}`}>
              <span class="nm">{def.name}{s.stacks > 1 ? ` ×${s.stacks}` : ''}</span>
              <span class="t" style={{ transform: pct(s.left / s.dur) }} />
            </li>;
          })}
        </ul>}
      </div>
    </section>
  );
}

function Target() {
  const g = getGame(), p = g.player;
  const t = p.target && p.target.kind === 'monster' && !p.target.dead ? p.target as Monster : null;
  const boss = g.monsters.find((m) => m.boss && !m.dead && m.ai.provoked);
  const m = boss ?? t;
  if (!m) return null;
  const affixes = m.affixes.map((a) => ELITE_AFFIXES[a]?.name).filter(Boolean).join(' · ');
  return (
    <section id="target" class={`plate ${m.boss ? 'boss' : ''}`} aria-label="Your target">
      <div class="who"><span>{m.name}</span><span class="dim">Level {m.level}</span></div>
      {affixes && <div class="affixes">{affixes}</div>}
      <div class="bar hp" role="meter" aria-label={`${m.name} health`} aria-valuemin={0} aria-valuemax={m.maxHp} aria-valuenow={Math.ceil(m.hp)}>
        <i style={{ transform: pct(m.hp / m.maxHp) }} />
        {m.barrier > 0 && <i class="ward" style={{ transform: pct(m.barrier / m.maxHp) }} />}
      </div>
    </section>
  );
}

function Compass() {
  const g = getGame(), p = g.player;
  const z = g.zones.progress;
  let place = g.biome.name;
  if (z) place = g.zones.dungeonName ?? place;
  else {
    const site = g.world.sites.near(p.x, p.z);
    if (site && Math.hypot(site.x - p.x, site.z - p.z) < site.clear + 6) place = site.name;
  }
  const clock = z ? (z.cleared ? 'Cleared' : `${Math.max(0, z.total - z.killed)} remain`) : HOURS.find((h) => g.hour < h[0])?.[1] ?? 'Night';
  return (
    <section id="compass" aria-label="Map and place">
      <button type="button" id="map-ring" title="Map and waystones" aria-label={`Map: waystones and places found, key ${bindingLabel('map')}`} onClick={(e) => { togglePanel('map'); if (e.detail) (e.currentTarget as HTMLElement).blur(); }} />
      <div id="place" class="plate small"><span id="zone">{place}</span><span id="clock" class="dim">{clock}</span></div>
    </section>
  );
}

function Tracker() {
  const g = getGame(), j = g.player.char.journey, z = g.zones.progress;
  const lines: string[] = [];
  if (z) lines.push(z.cleared ? 'The boss is slain. Leave when ready.' : z.bossAlive ? 'Find and slay the Inkbound' : 'Clear the halls');
  if (j.bounty) lines.push(g.bounties.track(j.bounty));
  if (!lines.length) return null;
  return (
    <section id="tracker" class="plate small" aria-label="Objectives">
      <div class="label">{z ? 'Dungeon' : 'Bounty'}</div>
      {lines.map((l) => <div class="tracker-text">{l}</div>)}
    </section>
  );
}

function Log() {
  return (
    <section id="log" role="log" aria-live="polite" aria-label="Messages">
      {ui.log.value.map((l) => <p key={l.id} class={l.old ? 'old' : ''} dangerouslySetInnerHTML={{ __html: l.html }} />)}
    </section>
  );
}

function Toast() {
  const t = ui.toast.value;
  const [shown, setShown] = useState<number>(0);
  useEffect(() => {
    if (!t) return;
    setShown(t.id);
    const h = setTimeout(() => setShown(0), t.seconds * 1000);
    return () => clearTimeout(h);
  }, [t?.id]);
  return (
    <div id="toast" class={`plate ${t && shown === t.id ? 'show' : ''}`} role="status" aria-live="polite">
      {t && <><strong>{t.title}</strong>{t.sub && <span>{t.sub}</span>}</>}
    </div>
  );
}

function Prompt() {
  const p = ui.prompt.value;
  if (!p) return null;
  return (
    <section id="prompt" class="plate" aria-live="polite">
      <button type="button" class="key" onClick={() => getGame().zones.interact()}>{p.key}</button> {p.text}
    </section>
  );
}

function Slot(props: { cls: string; icon: string; keyLabel: string; title: string; onUse: () => void; cooldown?: number; state?: string; count?: number; hidden?: boolean }) {
  const touched = useRef(-1e9);
  if (props.hidden) return null;
  return (
    <button
      type="button" class={`slot ${props.cls} ${props.state ?? ''}`} title={props.title}
      aria-label={`${props.title}, ${props.keyLabel}`}
      onPointerDown={(e) => { if (e.pointerType !== 'touch') return; touched.current = performance.now(); getGame().input.any = true; props.onUse(); }}
      onClick={(e) => { if (performance.now() - touched.current < 800) return; props.onUse(); if (e.detail) (e.currentTarget as HTMLElement).blur(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon svg={props.icon} />
      <span class="cool" style={{ '--left': `${Math.round((props.cooldown ?? 0) * 100)}%` } as JSX.CSSProperties} />
      <span class="key">{props.keyLabel}</span>
      {props.count !== undefined && <span class="count">{props.count}</span>}
    </button>
  );
}

function Hotbar() {
  const g = getGame(), p = g.player, c = p.char;
  const act = g.touch ? g.controls.actTarget() : null;
  const talk = !!act && act.kind === 'npc';
  const fire = (i: number) => g.controls.useSlot(i);
  return (
    <section id="hotbar" aria-label="Skills and tonics">
      {Array.from({ length: BAR_SIZE }, (_, i) => {
        const s = g.skills.skillInSlot(i);
        if (g.touch && i === 0) return null;
        const cd = s ? g.skills.cooldown(s.def.id) : { frac: 0, left: 0 };
        const state = !s ? 'locked' : !g.skills.canAfford(s) ? 'dry' : '';
        return <Slot cls={`s${g.touch ? i - 1 : i}`} icon={s ? skillIcon(s.def.icon, s.def.element) : glyph('star', '#e8e2d4')} keyLabel={bindingLabel(SLOTS[i])}
          title={s ? `${s.def.name}${s.params.cost ? ` (${s.params.cost} ${p.build.cls.resource.name})` : ''}` : `Empty slot ${i + 1}: put a skill here from the skill tree`}
          onUse={() => (s ? fire(i) : togglePanel('skills'))} cooldown={cd.frac} state={state} />;
      })}
      <div class="sep" />
      <Slot cls="d0" icon={glyph('flask', '#c63e3a')} keyLabel={bindingLabel('potion')} title="Drink a tonic" onUse={() => g.playerSystem.drink()} count={c.potions} cooldown={p.potionCd / 1.2} state={c.potions ? '' : 'empty'} />
      <Slot cls="d1" icon={ACT_ICONS.evade} keyLabel={bindingLabel('evade')} title="Evade" onUse={() => g.skills.evade(p.intent.moveX, p.intent.moveZ)} cooldown={p.evadeCd / 4} />
      {g.touch && <ActButton talk={talk} idle={!act} />}
      {g.touch && <Slot cls="next" icon={ACT_ICONS.next} keyLabel="Tab" title="Next target" onUse={() => g.controls.cycleTarget()} />}
    </section>
  );
}

function ActButton({ talk, idle }: { talk: boolean; idle: boolean }) {
  const g = getGame();
  const s = g.skills.skillInSlot(0);
  return (
    <button type="button" class={`slot act ${talk ? 'talk' : idle ? 'idle' : ''}`} title={talk ? 'Talk' : 'Attack'} aria-label={talk ? 'Talk' : 'Attack the nearest creature'}
      onPointerDown={(e) => { g.input.acting = true; g.controls.act(); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} }}
      onPointerUp={() => (g.input.acting = false)} onPointerCancel={() => (g.input.acting = false)} onLostPointerCapture={() => (g.input.acting = false)}
      onClick={(e) => { if (e.detail === 0) g.controls.act(); }}>
      <span class="ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: (s ? skillIcon(s.def.icon, s.def.element).replace('<svg ', '<svg class="i-attack" ') : ACT_ICONS.attack) + ACT_ICONS.talk }} />
    </button>
  );
}

function Menu() {
  const g = getGame(), c = g.player.char;
  const points = pointsEarned(c.level, c.bonusPoints) - pointsSpent(c.tree);
  const items: [string, string, string, boolean][] = [
    ['character', 'Character', bindingLabel('character'), false],
    ['inventory', 'Inventory', bindingLabel('inventory'), c.bag.some((i) => i?.fresh)],
    ['skills', 'Skill tree', bindingLabel('skills'), points > 0],
    ['journal', 'Journal', bindingLabel('journal'), false],
    ['menu', 'Menu', 'Esc', false],
  ];
  return (
    <nav id="menu" aria-label="Menus">
      {items.map(([id, title, key, alert]) => (
        <button type="button" class={`${alert ? 'alert' : ''} ${isOpen(id as never) ? 'on' : ''}`} title={`${title} (${key})`} aria-label={`${title}, key ${key}${alert ? ', something new' : ''}`}
          onClick={(e) => { g.bus.emit('ui:toggle', id); if (e.detail) (e.currentTarget as HTMLElement).blur(); }}>
          <Icon svg={MENU_ICONS[id]} />
        </button>
      ))}
    </nav>
  );
}

function Threats() {
  const g = getGame();
  const [list] = useState<{ x: number; z: number; until: number }[]>([]);
  useEffect(() => g.bus.on('telegraph', (d) => {
    if (!g.settings.threatIndicators) return;
    list.push({ x: d.x, z: d.z, until: g.time + d.t + 0.2 });
    if (list.length > 12) list.shift();
  }), []);
  const W = g.renderer.size.cssW, H = g.renderer.size.cssH, cam = g.camera, p = g.player;
  const out: JSX.Element[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (t.until < g.time) { list.splice(i, 1); continue; }
    if (Math.hypot(t.x - p.x, t.z - p.z) > 22) continue;
    const s = cam.project(t.x, g.world.surface(t.x, t.z), t.z);
    if (s && s.x > 0.04 && s.x < 0.96 && s.y > 0.06 && s.y < 0.94) continue;
    let dx: number, dy: number;
    if (s) { dx = (s.x - 0.5) * W; dy = (s.y - 0.5) * H; }
    else { const x = t.x - p.x, z = t.z - p.z, f = cam.fwd, fl = Math.hypot(f[0], f[2]) || 1; dx = x * cam.right[0] + z * cam.right[2]; dy = -(x * f[0] + z * f[2]) / fl; }
    const left = g.touch ? 40 : 370, right = W - (g.touch ? 40 : 230), top = 110, bottom = H - (g.touch ? 200 : 250);
    const cx = (left + right) / 2, cy = (top + bottom) / 2, hw = Math.max(20, (right - left) / 2), hh = Math.max(20, (bottom - top) / 2);
    const l = Math.hypot(dx, dy) || 1, k = Math.min(hw / Math.abs(dx / l || 1e-6), hh / Math.abs(dy / l || 1e-6));
    out.push(<div class="threat" style={{ transform: `translate(${(cx + dx / l * k).toFixed(0)}px, ${(cy + dy / l * k).toFixed(0)}px) translate(-50%, -50%) rotate(${Math.atan2(dy, dx).toFixed(2)}rad)` }} />);
  }
  return <div id="threats" aria-hidden="true">{out}</div>;
}

export function useCaptions(): void {
  useEffect(() => {
    const g = getGame();
    const side = (x: number, z: number) => {
      const p = g.player, cam = g.camera, dx = x - p.x, dz = z - p.z;
      const r = dx * cam.right[0] + dz * cam.right[2], f = -(dx * cam.fwd[0] + dz * cam.fwd[2]);
      return Math.abs(r) > Math.abs(f) ? (r > 0 ? 'right' : 'left') : f > 0 ? 'ahead' : 'behind';
    };
    const say = (text: string) => { if (g.settings.captions) log(`<span class="caption">[${text}]</span>`); };
    const offs = [
      g.bus.on('monster:special', (m) => say(`${m.name} gathers itself, ${side(m.x, m.z)}`)),
      g.bus.on('lowhealth', () => say('Your heart pounds: health is low')),
      g.bus.on('boss:spawn', (m) => say(`${m.name} stirs`)),
      g.bus.on('nightfall', () => say('Night sounds rise')),
      g.bus.on('item:legendary', () => say('A bell rings: something rare has fallen')),
      g.bus.on('monster:alert', (m) => { if (m.elite) say(`${m.name} has seen you, ${side(m.x, m.z)}`); }),
    ];
    return () => offs.forEach((f) => f());
  }, []);
}

function Fps() {
  const g = getGame();
  if (!g.settings.showFps) return null;
  return <div id="fps" aria-hidden="true">{Math.round(g.fps)} fps · {Math.round(g.renderer.scale * 100)}%</div>;
}

export function Hud() {
  ui.frame.value;
  useCaptions();
  const upright = getGame().touch && innerHeight >= innerWidth;
  return (
    <>
      <div class="hud-col hud-left"><Status />{!upright && <Log />}</div>
      <div class="hud-col hud-center"><Target /><Toast /></div>
      <div class="hud-col hud-right"><Compass />{!upright && <Tracker />}<Fps /></div>
      {upright && <div class="hud-notes"><Tracker /><GuidePlate /><Log /><Prompt /></div>}
      <div class="hud-dock">{!upright && <GuidePlate />}{!upright && <Prompt />}<div class="hud-row"><Hotbar /><Menu /></div></div>
      <Threats />
      <GuideArrow />
    </>
  );
}
