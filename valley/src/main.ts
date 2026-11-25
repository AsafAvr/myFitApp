import '@fontsource/alegreya/700.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './ui/ui.css';
import './ui/game.css';
import { h, render } from 'preact';
import { DEVICE } from './core/device.js';
import { VIEWS } from './config.js';
import { Game } from './game/game';
import { SaveStore } from './game/save/store';
import { newCharacter, type Character } from './game/state/character';
import { CLASSES } from './game/content/classes';
import { loadSettings } from './settings/settings';
import { initSettings, bindGameSettings } from './settings/apply';
import { bindGame, ui, closeAll, toast } from './ui/store';
import { App } from './ui/App';
import { watchTouch } from './ui/touch';
import { startPadNav } from './ui/padnav';
import type { Session } from './ui/screens';
import { FACE } from './game/systems/faces';

import { loadHabits } from './habits/habits';

const canvas = document.getElementById('view') as HTMLCanvasElement;
await loadHabits();

function fatal(err: unknown): void {
  console.error(err);
  const box = document.getElementById('fatal')!;
  box.hidden = false;
  box.querySelector('p')!.textContent = String((err as Error)?.message || err);
}

try {
  const settings = loadSettings();
  const store = new SaveStore();
  const account = store.loadAccount();
  const fresh = new URLSearchParams(location.search).has('new');
  if (fresh) history.replaceState(null, '', location.pathname + location.hash);
  const lastId = account.heroes[0];
  const preview = (lastId && store.loadCharacter(lastId)) || newCharacter('warden', 'Wayfarer', account.seed);

  const game = new Game(canvas, {
    seed: account.seed, touch: DEVICE.touch, settings, char: preview,
    persist: (c) => store.saveCharacter(c, account),
    stash: account.stash,
    persistAccount: () => store.saveAccount(account),
  });
  (window as unknown as { __game: Game }).__game = game;
  initSettings(settings, game);
  bindGame(game);

  const titleView = () => {
    Object.assign(game.camera.goal, { pitch: 0.3, distance: 32 });
    Object.assign(game.camera, { pitch: 0.3, distance: 32 });
    game.look.fadeGoal = 1;
  };

  let previewing = false, cheer = 0;
  const enter = (c: Character) => {
    previewing = false;
    game.camera.shift = 0;
    game.camera.portrait = false;
    game.loadCharacter(c);
    closeAll();
    document.body.classList.remove('titled');
    ui.screen.value = 'game';
    game.begin();
    const [pitch, distance] = c.view ?? [VIEWS.behind[0], VIEWS.behind[1] * (game.touch ? 0.9 : 1)];
    Object.assign(game.camera.goal, { pitch, distance });
    game.player.yaw = Math.PI - game.camera.goal.yaw;
    setTimeout(layout, 30);
    if (store.failed) toast('This browser will not keep your journey', 'A private window, or full storage. Settings › Saves can keep a copy in a file.', 6);
  };

  const session: Session = {
    heroes: () => store.summaries(account),
    play(id) { const c = store.loadCharacter(id); if (c) enter(c); },
    create(classId, name, difficulty, look) {
      const c = newCharacter(classId, name, Date.now() ^ account.seed);
      c.difficulty = difficulty;
      c.look = look;
      store.saveCharacter(c, account);
      ui.heroes.value++;
      enter(c);
    },
    remove(id) { store.deleteCharacter(id, account); ui.heroes.value++; },
    preview(classId, look) {
      const c = newCharacter(classId, CLASSES[classId].name, account.seed);
      c.look = look;
      c.pos = { x: 0, z: 4.2 };
      game.loadCharacter(c);
      const distance = 5.2;
      Object.assign(game.camera.goal, { pitch: 0.16, distance, yaw: 0 });
      if (!previewing) Object.assign(game.camera, { yaw: 0, pitch: 0.3, distance: 9 });
      game.camera.portrait = true;
      const W = innerWidth, H = innerHeight, cardRight = Math.min(64, Math.max(16, W * 0.04)) + Math.min(540, W - 32);
      const off = W >= 760 ? ((cardRight + W) / 2 - W / 2) / (W / 2) : 0;
      game.camera.shift = off * distance * Math.tan((17 * Math.PI) / 180) * (W / H);
      previewing = true;
      cheer = 1.4;
    },
    endPreview() {
      if (!previewing || game.started) return;
      previewing = false;
      game.camera.shift = 0;
      game.camera.portrait = false;
      const id = account.heroes[0], c = id && store.loadCharacter(id);
      game.loadCharacter(c || newCharacter('warden', 'Wayfarer', account.seed));
      titleView();
    },
    quitToTitle() {
      game.save();
      closeAll();
      game.started = false;
      game.paused = true;
      document.body.classList.add('titled');
      ui.screen.value = 'title';
      ui.heroes.value++;
      titleView();
    },
  };

  render(h(App, { session, store, account }), document.getElementById('app')!);
  if (fresh || !account.heroes.length) ui.screen.value = fresh ? 'create' : 'title';

  titleView();
  game.bus.on('frame', (dt) => {
    if (game.started || !game.paused) return;
    if (previewing) {
      game.player.yaw = -game.camera.yaw + 0.5 * Math.sin(game.time * 0.5);
      cheer = Math.max(0, cheer - dt);
      game.player.face = cheer > 0 ? FACE.joy : FACE.content;
    }
    else if (!game.reducedMotion) game.camera.goal.yaw += dt * 0.06;
  });
  game.bus.on('begin', () => document.body.classList.remove('titled'));

  watchTouch(game, () => { game.resize(); ui.rev.value++; });
  startPadNav(game);
  function layout() {
    game.resize();
    const ring = document.getElementById('map-ring'), c = canvas.getBoundingClientRect();
    if (!ring) { game.renderer.minimap.rect = [0, 0, 0, 0]; return; }
    const r = ring.getBoundingClientRect();
    const shown = ui.screen.value === 'game';
    game.renderer.minimap.rect = [r.left - c.left + r.width / 2, r.top - c.top + r.height / 2, shown ? r.width / 2 - 3 : 0, 0.62 * Math.max(1, 150 / Math.max(r.width, 1))];
  }
  addEventListener('resize', layout);
  new ResizeObserver(layout).observe(canvas);
  game.bus.on('frame', () => { if (ui.frame.value % 30 === 0) layout(); });

  import('./audio/audio.js')
    .then((m) => { m.createAudio(game); bindGameSettings(game); })
    .catch((e) => console.warn('Audio unavailable:', e));
  game.start();
} catch (err) {
  fatal(err);
}
