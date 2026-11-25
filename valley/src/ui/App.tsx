import { memo } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { ui, getGame } from './store';
import { Hud } from './hud';
import { Plates } from './plates';
import { attachStick } from './touch';
import { TooltipHost, ConfirmHost } from './components';
import { InventoryPanel, CharacterPanel, VendorPanel, StashPanel, BountyPanel, MapPanel, JournalPanel, ViewPanel } from './panels';
import { SkillTree } from './skilltree';
import { HabitPanel } from './habitpanel';
import { SettingsScreen } from './settings';
import { Title, Heroes, Create, PauseMenu, Help, type Session } from './screens';
import type { SaveStore, Account } from '../game/save/store';

const WorldLayer = memo(() => {
  const plates = useRef<HTMLDivElement>(null), floaters = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const g = getGame();
    const p = new Plates(g, plates.current!, floaters.current!);
    return g.bus.on('frame', (dt) => { if (ui.screen.value === 'game') p.update(dt); });
  }, []);
  return <><div id="plates" ref={plates} aria-hidden="true" /><div id="floaters" ref={floaters} aria-hidden="true" /></>;
}, () => true);

const Stick = memo(() => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => attachStick(getGame(), ref.current!), []);
  return <div id="stick" ref={ref} aria-hidden="true"><div class="base"><div class="nub" /></div></div>;
}, () => true);

export function App({ session, store, account }: { session: Session; store: SaveStore; account: Account }) {
  const screen = ui.screen.value, open = ui.open.value;
  const has = (id: string) => open.includes(id as never);
  const playing = screen === 'game';
  return (
    <>
      <div id="ui">
        <WorldLayer />
        <Stick />
        {playing && <Hud />}
      </div>
      <div id="panels">
        {playing && has('character') && <CharacterPanel />}
        {playing && has('journal') && <JournalPanel />}
        {playing && has('vendor') && <VendorPanel />}
        {playing && has('stash') && <StashPanel />}
        {playing && has('bounty') && <BountyPanel />}
        {playing && has('inventory') && <InventoryPanel />}
        {playing && has('map') && <MapPanel />}
        {playing && has('view') && <ViewPanel />}
        {playing && has('skills') && <SkillTree />}
        {playing && has('menu') && <PauseMenu session={session} />}
        {playing && has('help') && <Help />}
        {playing && has('habit') && <HabitPanel />}
        {has('settings') && <SettingsScreen store={store} account={account} />}
      </div>
      {screen === 'title' && !has('settings') && <Title session={session} />}
      {screen === 'heroes' && <Heroes session={session} />}
      {screen === 'create' && <Create session={session} />}
      <TooltipHost />
      <ConfirmHost />
    </>
  );
}
