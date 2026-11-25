import { useEffect, useRef, useState } from 'preact/hooks';
import { ui, getGame, closePanel, openPanel, closeAll } from './store';
import { Choice, Icon, Painting, confirmThen } from './components';
import { skillIcon } from './icons';
import { classArt } from './art';
import { bindingLabel } from './hud';
import { CLASS_LIST, CLASSES, skillDef } from '../game/content/classes';
import { DIFFICULTY } from '../game/content/monsters';
import { ATTRIBUTE_INFO } from '../game/rules/stats';
import type { ClassId, Difficulty } from '../game/types';
import type { HeroSummary } from '../game/save/store';
import { HAIRS, TUNICS, type Look } from '../game/content/looks';

const DEFAULT_LOOK: Record<ClassId, Look> = { warden: { tunic: 0, hair: 0 }, emberwright: { tunic: 1, hair: 1 }, strider: { tunic: 2, hair: 2 } };

export interface Session {
  heroes(): HeroSummary[];
  play(id: string): void;
  create(classId: ClassId, name: string, difficulty: Difficulty, look: Look): void;
  preview(classId: ClassId, look: Look): void;
  endPreview(): void;
  remove(id: string): void;
  quitToTitle(): void;
}

export function Title({ session }: { session: Session }) {
  ui.heroes.value;
  const heroes = session.heroes();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  const last = heroes[0];
  return (
    <div id="title">
      <div class="title-card">
        <h1>The Valley</h1>
        <p class="tag">Your habits, grown in pen and pencil</p>
        <div class="title-actions">
          {last ? <button ref={first} type="button" class="primary" onClick={() => session.play(last.id)}>Continue · {last.name}, level {last.level} {CLASSES[last.classId].name}</button>
            : <button ref={first} type="button" class="primary" onClick={() => (ui.screen.value = 'create')}>Begin a journey</button>}
          {heroes.length > 0 && <button type="button" onClick={() => (ui.screen.value = 'heroes')}>Choose a hero</button>}
          {heroes.length > 0 && <button type="button" onClick={() => (ui.screen.value = 'create')}>New hero</button>}
          <button type="button" onClick={() => openPanel('settings')}>Settings</button>
        </div>
        <p class="keys">{getGame().touch ? 'Tap to move and fight · the stick walks · drag the picture to turn the view' : 'Click to move and fight · WASD to walk · Space to evade · 1–4 and right click for skills'}</p>
      </div>
    </div>
  );
}

export function Heroes({ session }: { session: Session }) {
  ui.heroes.value;
  const heroes = session.heroes();
  return (
    <div id="title">
      <section class="title-card heroes" role="dialog" aria-label="Choose a hero">
        <h2>Your heroes</h2>
        <ul class="hero-list">
          {heroes.map((h) => (
            <li class="hero">
              <button type="button" class="hero-play" onClick={() => session.play(h.id)}>
                <strong>{h.name}</strong><span>Level {h.level} {CLASSES[h.classId].name} · {DIFFICULTY[h.difficulty as Difficulty]?.name ?? 'Normal'} · {Math.floor(h.played / 3600)}h {Math.floor(h.played / 60) % 60}m</span>
              </button>
              <button type="button" class="btn danger small" aria-label={`Let ${h.name} go`} onClick={() => confirmThen(`Let ${h.name} go?`, `${h.name}, level ${h.level}, and everything they carry will be gone for good. The stash is kept.`, 'Let them go', () => session.remove(h.id), true)}>Let go</button>
            </li>
          ))}
        </ul>
        <div class="pair">
          <button type="button" class="btn" onClick={() => (ui.screen.value = 'title')}>Back</button>
          <button type="button" class="btn primary" onClick={() => (ui.screen.value = 'create')}>New hero</button>
        </div>
      </section>
    </div>
  );
}

export function Create({ session }: { session: Session }) {
  const [cls, setCls] = useState<ClassId>('warden');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK.warden);
  const [name, setName] = useState('');
  const [diff, setDiff] = useState<Difficulty>('normal');
  const c = CLASSES[cls];
  useEffect(() => { session.preview(cls, look); }, [cls, look.tunic, look.hair]);
  useEffect(() => () => session.endPreview(), []);
  const pick = (k: ClassId) => { setCls(k); setLook(DEFAULT_LOOK[k]); };
  const back = () => { ui.screen.value = session.heroes().length ? 'heroes' : 'title'; };
  return (
    <div id="title" class="side">
      <section class="title-card create" role="dialog" aria-label="A new hero">
        <h2>A new hero</h2>
        <div class="classes" role="radiogroup" aria-label="Class">
          {CLASS_LIST.map((k) => (
            <button type="button" role="radio" aria-checked={k.id === cls} class={`class-card ${k.id === cls ? 'on' : ''}`} onClick={() => pick(k.id)}>
              <Painting class="class-art" deps={k.id} paint={(px) => classArt(k.id, px)} />
              <strong>{k.name}</strong><small>{k.tagline}</small>
              <span class="class-skills">{k.start.map((id) => { const d = skillDef(id)!; return <Icon svg={skillIcon(d.icon, d.element)} />; })}</span>
            </button>
          ))}
        </div>
        <p class="about">{c.about}</p>
        <div class="sheet">
          <div><span>Leans on</span>{ATTRIBUTE_INFO[c.primary].name}</div>
          <div><span>Fights with</span>{c.resource.name}</div>
          <div><span>Wields</span>{c.weapons.join(', ')}</div>
          <div><span>Begins with</span>{c.start.map((id) => skillDef(id)!.name).join(' and ')}</div>
        </div>
        <Swatches label={cls === 'emberwright' ? 'Robe' : 'Tunic'} list={TUNICS} value={look.tunic} onPick={(i) => setLook({ ...look, tunic: i })} />
        <Swatches label="Hair" list={HAIRS} value={look.hair} onPick={(i) => setLook({ ...look, hair: i })} />
        <label class="name-field"><span>Name</span><input type="text" maxLength={20} value={name} placeholder={c.name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} /></label>
        <Choice label="Difficulty" hint={DIFFICULTY[diff].desc + ' It can be changed later, in a town.'} value={diff} options={Object.entries(DIFFICULTY).filter(([k]) => k !== 'nightmare').map(([k, v]) => [k, v.name]) as [Difficulty, string][]} onChange={setDiff} />
        <div class="pair">
          <button type="button" class="btn" onClick={back}>Back</button>
          <button type="button" class="btn primary" onClick={() => session.create(cls, name, diff, look)}>Begin</button>
        </div>
      </section>
    </div>
  );
}

function Swatches({ label, list, value, onPick }: { label: string; list: { name: string; rgb: [number, number, number] }[]; value: number; onPick: (i: number) => void }) {
  return (
    <div class="swatches" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {list.map((p, i) => (
        <button type="button" role="radio" aria-checked={i === value} aria-label={p.name} title={p.name} class={`swatch ${i === value ? 'on' : ''}`}
          style={{ background: `rgb(${p.rgb.join(',')})` }} onClick={() => onPick(i)} />
      ))}
    </div>
  );
}

export function PauseMenu({ session }: { session: Session }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <section class="overlay plate menu" role="dialog" aria-label="Menu">
      <h2>Paused</h2>
      <button ref={first} type="button" class="btn primary" onClick={() => closeAll()}>Back to the game</button>
      <button type="button" class="btn" onClick={() => openPanel('skills')}>Skill tree</button>
      <button type="button" class="btn" onClick={() => openPanel('settings')}>Settings</button>
      <button type="button" class="btn" onClick={() => openPanel('help')}>How to play</button>
      <button type="button" class="btn" onClick={() => { closeAll(); getGame().bus.emit('guide:restart'); }}>Show me the first steps again</button>
      <button type="button" class="btn" onClick={() => session.quitToTitle()}>Save and go to the title</button>
    </section>
  );
}

export function Help() {
  const g = getGame();
  const k = bindingLabel;
  const rows: [string, string][] = g.touch ? [
    ['Stick', 'Your left thumb walks. Push it part-way to stroll.'],
    ['Tap', 'Tap the picture to walk to a spot, attack a creature or talk to townsfolk.'],
    ['Big button', 'Uses your first skill on the nearest creature, talks, or opens a door. Hold it to keep fighting.'],
    ['Round buttons', 'Your other skills, a tonic and Evade.'],
    ['Drag / pinch', 'Turn and tilt the view, and zoom.'],
  ] : [
    ['Left click', `Walk; click a creature to fight it with your first skill (${k('slot1')}).`],
    [`${k('slot2')}, ${k('slot3')}–${k('slot6')}`, 'Your other skills. They aim at your target, or at the cursor.'],
    [k('evade'), 'Evade: a quick roll, untouchable while it lasts. Every hero has it.'],
    [k('potion'), 'Drink a tonic. Waystones refill them.'],
    [k('interact'), 'Attack the nearest creature, talk, or use a door.'],
    ['W A S D', 'Walk by hand.'],
    [`${k('standStill')} + click`, 'Attack where you point without moving.'],
    ['Right drag, Q / E, wheel', 'Turn, tilt and zoom the view.'],
    [`${k('inventory')} · ${k('character')} · ${k('skills')}`, 'Inventory, character sheet, skill tree.'],
    [`${k('map')} · ${k('journal')} · Esc`, 'Map and waystones, journal, menu.'],
    [k('showLabels'), 'Hold to label every item on the ground, and see each line’s possible range in tooltips.'],
  ];
  return (
    <section class="overlay plate help" role="dialog" aria-label="How to play">
      <header><h2>How to play</h2><div class="head-actions"><button type="button" class="x" aria-label="Close" onClick={() => closePanel('help')}>×</button></div></header>
      <div class="body">
        <div class="keys-list">{rows.map(([a, b]) => <><kbd>{a}</kbd><span>{b}</span></>)}</div>
        <p class="dim">Every level gives a skill point for the skill tree. Basic skills build your resource; Core skills spend it. Each skill can be enhanced, then upgraded one of two ways.</p>
        <p class="dim">Gear comes in five rarities: Common, Magic, Rare, Legendary (with a power of its own) and Unique. Compare in the tooltip; smiths salvage what you do not want and enchant what you keep.</p>
        <p class="dim">Mustard hatching on the ground means a blow is coming there: step out of it, or Evade through it. The farther from Hearthmere, the stronger the wilds; crypts and hollows hold an Inkbound and a hoard.</p>
      </div>
    </section>
  );
}
