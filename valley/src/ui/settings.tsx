import { useState } from 'preact/hooks';
import { getGame, closePanel, log, toast } from './store';
import { Tabs, Toggle, Slider, Choice, confirmThen } from './components';
import { settings, updateSettings } from '../settings/apply';
import { DEFAULT_KEYS, DEFAULT_PAD, ACTIONS, ACTION_IDS, keyName, padName, type ActionId, type PadButton } from '../engine/bindings';
import { RARITY_COLORS, type Settings } from '../settings/settings';
import type { SaveStore, Account } from '../game/save/store';

type Tab = 'gameplay' | 'access' | 'audio' | 'controls' | 'graphics' | 'data';
const TABS: [Tab, string][] = [['gameplay', 'Gameplay'], ['access', 'Accessibility'], ['audio', 'Audio'], ['controls', 'Controls'], ['graphics', 'Graphics'], ['data', 'Saves']];

export interface SettingsProps { store?: SaveStore; account?: Account; onClose?: () => void }

export function SettingsScreen(props: SettingsProps) {
  const s = settings.value!;
  const [tab, setTab] = useState<Tab>('gameplay');
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const close = () => (props.onClose ? props.onClose() : closePanel('settings'));
  return (
    <section class="overlay plate settings" role="dialog" aria-label="Settings">
      <header><h2>Settings</h2><div class="head-actions"><button type="button" class="x" aria-label="Close settings" onClick={close}>×</button></div></header>
      <div class="settings-layout">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Settings sections" />
        <div class="settings-body" role="tabpanel">
          {tab === 'gameplay' && <>
            <Toggle label="Pick up gear by walking over it" hint="Off: click gear to pick it up. Glint, tonics and materials are always picked up." value={s.autoPickup} onChange={(v) => set({ autoPickup: v })} />
            <Toggle label="Keep attacking a clicked creature" hint="Off: one attack for each click." value={s.autoAttack} onChange={(v) => set({ autoAttack: v })} />
            <Toggle label="Menus pause the game" hint="The pause menu and Settings always pause." value={s.pauseOnMenu} onChange={(v) => set({ pauseOnMenu: v })} />
            <Toggle label="Ask before selling or dropping fine things" value={s.confirmValuable} onChange={(v) => set({ confirmValuable: v })} />
            <Choice label="Damage numbers" value={s.damageNumbers} options={[['all', 'All'], ['crits', 'Critical hits only'], ['off', 'Off']]} onChange={(v) => set({ damageNumbers: v })} />
            <Slider label="Damage number size" value={s.damageNumberScale} min={0.75} max={1.6} step={0.05} onChange={(v) => set({ damageNumberScale: v })} />
            <Choice label="Creature health slips" hint="When a creature's name and health show over it." value={s.enemyBars} options={[['always', 'Always'], ['combat', 'In a fight'], ['off', 'Elites only']]} onChange={(v) => set({ enemyBars: v })} />
            <Choice label="Label loot on the ground" hint="Hold Alt (or the right stick) to label everything." value={s.lootLabels} options={[['all', 'Everything'], ['magic', 'Magic and finer'], ['rare', 'Rare and finer'], ['legendary', 'Legendary only']]} onChange={(v) => set({ lootLabels: v })} />
            <Slider label="Aim assist" hint="How strongly skills used without a cursor turn toward the creature you face." value={s.aimAssist} min={0} max={1} step={0.05} onChange={(v) => set({ aimAssist: v })} />
          </>}
          {tab === 'access' && <>
            <h3>Seeing</h3>
            <Slider label="Interface size" value={s.uiScale} min={0.8} max={1.5} step={0.05} onChange={(v) => set({ uiScale: v })} />
            <Slider label="Text size" hint="Lettering in panels, tooltips and messages." value={s.textScale} min={0.9} max={1.6} step={0.05} onChange={(v) => set({ textScale: v })} />
            <Choice label="Lettering" hint="Atkinson Hyperlegible is drawn to be easy to tell apart at a glance." value={s.font} options={[['hand', 'Hand-lettered'], ['legible', 'Atkinson Hyperlegible']]} onChange={(v) => set({ font: v })} />
            <Toggle label="High contrast interface" hint="Plain white plates and black lettering." value={s.highContrast} onChange={(v) => set({ highContrast: v })} />
            <Choice label="Colour vision" hint="Changes the colours of rarity and warnings. Rarity is always written out too." value={s.colorVision} options={[['none', 'Typical'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']]} onChange={(v) => set({ colorVision: v })} />
            <div class="rarity-key">{Object.entries(RARITY_COLORS[s.colorVision]).map(([r, c]) => <span style={{ color: c }}>{r[0].toUpperCase() + r.slice(1)}</span>)}</div>
            <Choice label="Colour of warnings on the ground" value={s.dangerColor} options={[['mustard', 'Mustard'], ['magenta', 'Magenta'], ['white', 'White']]} onChange={(v) => set({ dangerColor: v })} />
            <Slider label="Interface opacity" value={s.hudOpacity} min={0.5} max={1} step={0.05} onChange={(v) => set({ hudOpacity: v })} />
            <h3>Motion and flashing</h3>
            <Choice label="Reduce motion" hint="Follows your device unless you choose." value={s.reducedMotion} options={[['system', 'As my device'], ['on', 'On'], ['off', 'Off']]} onChange={(v) => set({ reducedMotion: v })} />
            <Slider label="Screen shake" value={s.screenShake} min={0} max={1} step={0.05} onChange={(v) => set({ screenShake: v })} />
            <Toggle label="Hold the world when a blow lands" hint="A hit-stop of a few hundredths of a second." value={s.hitStop} onChange={(v) => set({ hitStop: v })} />
            <Toggle label="Flash creatures when hit" value={s.flashes} onChange={(v) => set({ flashes: v })} />
            <Toggle label="Steady pencil lines" hint="The hatching is normally laid afresh six times a second, like a hand-drawn film. This holds it still." value={s.steadyLines} onChange={(v) => set({ steadyLines: v })} />
            <Toggle label="Smooth figures" hint="Figures are normally drawn twelve times a second, like hand animation. This draws them every frame." value={s.smoothFigures} onChange={(v) => set({ smoothFigures: v })} />
            <h3>Hearing</h3>
            <Toggle label="Captions for sounds" hint="Important sounds are written in the message log, with where they come from." value={s.captions} onChange={(v) => set({ captions: v })} />
            <Toggle label="Arrows for blows from off screen" value={s.threatIndicators} onChange={(v) => set({ threatIndicators: v })} />
            <Toggle label="Mono sound" value={s.monoAudio} onChange={(v) => set({ monoAudio: v })} />
            <h3>Timing</h3>
            <Slider label="Game speed" hint="Slows everything down, the fights included." value={s.gameSpeed} min={0.5} max={1} step={0.05} onChange={(v) => set({ gameSpeed: v })} />
            <Slider label="Longer warnings" hint="How long creatures wind up before a blow lands." value={s.telegraphScale} min={1} max={1.8} step={0.05} onChange={(v) => set({ telegraphScale: v })} fmt={(v) => `×${v.toFixed(2)}`} />
            <Slider label="Messages stay up" value={s.toastSeconds} min={1} max={3} step={0.25} onChange={(v) => set({ toastSeconds: v })} fmt={(v) => `×${v.toFixed(2)}`} />
          </>}
          {tab === 'audio' && <>
            <Slider label="Everything" value={s.volMaster} min={0} max={1} step={0.05} onChange={(v) => set({ volMaster: v })} />
            <Slider label="Music" value={s.volMusic} min={0} max={1} step={0.05} onChange={(v) => set({ volMusic: v })} />
            <Slider label="Effects" value={s.volSfx} min={0} max={1} step={0.05} onChange={(v) => set({ volSfx: v })} />
            <Slider label="Ambience" hint="Wind, water, birds and crickets." value={s.volAmbience} min={0} max={1} step={0.05} onChange={(v) => set({ volAmbience: v })} />
            <Slider label="Interface" value={s.volUi} min={0} max={1} step={0.05} onChange={(v) => set({ volUi: v })} />
            <Toggle label="Silent when the game is hidden" value={s.muteUnfocused} onChange={(v) => set({ muteUnfocused: v })} />
          </>}
          {tab === 'controls' && <Controls />}
          {tab === 'graphics' && <>
            <Choice label="Drawing quality" hint="Auto draws as finely as your machine keeps a smooth frame." value={s.quality} options={[['auto', 'Auto'], ['high', 'High'], ['low', 'Light']]} onChange={(v) => set({ quality: v })} />
            <Choice label="Frame rate limit" value={s.fpsCap} options={[[0, 'None'], [60, '60'], [30, '30']]} onChange={(v) => set({ fpsCap: v })} />
            <Toggle label="Show frame rate" value={s.showFps} onChange={(v) => set({ showFps: v })} />
          </>}
          {tab === 'data' && <SaveData store={props.store} account={props.account} />}
        </div>
      </div>
    </section>
  );
}

function Controls() {
  const s = settings.value!;
  const g = getGame();
  const [wait, setWait] = useState<string | null>(null);
  const rebind = (action: ActionId, which: 0 | 1 | 'pad') => {
    setWait(`${action}:${which}`);
    g.input.captureNext((code, device) => {
      setWait(null);
      if (code === 'Escape') return;
      const keys = { ...s.keys }, pad = { ...s.pad };
      if (which === 'pad') {
        if (device !== 'pad') { log('Press a button on the gamepad.'); return; }
        for (const id of ACTION_IDS) if (pad[id] === code && id !== action && ACTIONS[id].group !== 'Interface') pad[id] = null;
        pad[action] = code as PadButton;
      } else {
        if (device !== 'key') { log('Press a key or a mouse button.'); return; }
        if (code.startsWith('Mouse') && !('mouse' in ACTIONS[action])) { log('That action needs a key.'); return; }
        for (const id of ACTION_IDS) {
          const b = keys[id];
          if (id !== action && (b[0] === code || b[1] === code)) { keys[id] = [b[0] === code ? null : b[0], b[1] === code ? null : b[1]]; toast('Moved', `${keyName(code)} no longer does “${ACTIONS[id].label}”.`); }
        }
        const cur = keys[action];
        keys[action] = which === 0 ? [code, cur[1]] : [cur[0], code];
      }
      updateSettings({ keys, pad });
    });
  };
  const groups = ['Movement', 'Combat', 'Camera', 'Interface'] as const;
  return (
    <>
      <p class="dim">Choose a box, then press the key, mouse button or pad button for it. Esc leaves it as it was.</p>
      {groups.map((grp) => (
        <div class="bindings">
          <h3>{grp}</h3>
          {ACTION_IDS.filter((id) => ACTIONS[id].group === grp).map((id) => (
            <div class="binding">
              <span>{ACTIONS[id].label}</span>
              {([0, 1] as const).map((w) => <button type="button" class={`key ${wait === `${id}:${w}` ? 'wait' : ''}`} onClick={() => rebind(id, w)} aria-label={`${ACTIONS[id].label}, ${w ? 'second' : 'first'} key: ${keyName(s.keys[id][w]) || 'none'}`}>{wait === `${id}:${w}` ? 'Press…' : keyName(s.keys[id][w]) || '—'}</button>)}
              <button type="button" class={`key pad ${wait === `${id}:pad` ? 'wait' : ''}`} onClick={() => rebind(id, 'pad')} aria-label={`${ACTIONS[id].label}, gamepad: ${padName(s.pad[id]) || 'none'}`}>{wait === `${id}:pad` ? 'Press…' : padName(s.pad[id]) || '—'}</button>
            </div>
          ))}
        </div>
      ))}
      <div class="row"><button type="button" class="btn" onClick={() => updateSettings({ keys: DEFAULT_KEYS, pad: DEFAULT_PAD })}>Put every control back</button></div>
      <h3>Camera</h3>
      <Slider label="Turning speed" value={s.camSensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => updateSettings({ camSensitivity: v })} fmt={(v) => `×${v.toFixed(2)}`} />
      <Toggle label="Turn the other way" value={s.invertCamX} onChange={(v) => updateSettings({ invertCamX: v })} />
      <Toggle label="Tilt the other way" value={s.invertCamY} onChange={(v) => updateSettings({ invertCamY: v })} />
      <Toggle label="Gamepad rumble" value={s.vibration} onChange={(v) => updateSettings({ vibration: v })} />
    </>
  );
}

function SaveData({ store, account }: { store?: SaveStore; account?: Account }) {
  if (!store || !account) return <p class="dim">Saves can be managed from the title screen.</p>;
  const download = () => {
    const blob = new Blob([store.exportAll(account)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brushwild-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const upload = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((text) => {
      confirmThen('Replace your saves?', 'Every hero and the stash here will be replaced by the ones in the file.', 'Replace', () => {
        if (store.importAll(text)) { toast('Saves loaded', 'Reloading…'); setTimeout(() => location.reload(), 900); }
        else log('That file is not a Brushwild save.');
      }, true);
    });
  };
  return (
    <>
      <p>Your heroes and stash are kept in this browser. Keep a copy, or move them to another browser or device.</p>
      <div class="pair">
        <button type="button" class="btn" onClick={download}>Save a copy to a file</button>
        <label class="btn file">Load from a file<input type="file" accept="application/json,.json" onChange={upload} /></label>
      </div>
      {store.failed && <p class="bad">This browser is refusing to save (a private window, or storage is full). Keep a copy in a file.</p>}
    </>
  );
}
