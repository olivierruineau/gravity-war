// Pause (6.5) : action `pause` (touche P). Fige la scène (GameScene ne simule plus tant que `paused`), affiche l'aide des commandes ;
// ECHAP revient au menu. Inactive une fois la partie décidée (l'écran de fin a ses propres touches).
import { toCss } from './color.js';
import { watchAway } from './platform.js';
import { createNavigation } from './navigation.js';
import { controlsLines } from '../data/controls.js';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';

const DEPTH = 1050;

export function createPauseScreen(scene, canPause) {
  const cx = GAME_WIDTH / 2;
  const veil = scene.add
    .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PALETTE.bg, 0.75)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setVisible(false);
  const title = scene.add
    .text(cx, GAME_HEIGHT * 0.2, 'PAUSE', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: toCss(PALETTE.accent),
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH + 1)
    .setVisible(false);
  const help = scene.add
    .text(cx, GAME_HEIGHT * 0.5, [...controlsLines(), '', 'P : reprendre   ECHAP : menu'], {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: toCss(PALETTE.text),
      align: 'left',
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH + 1)
    .setVisible(false);

  const state = {
    paused: false,
    toggle() {
      if (!state.paused && !canPause()) return;
      state.paused = !state.paused;
      veil.setVisible(state.paused);
      title.setVisible(state.paused);
      help.setVisible(state.paused);
    },
  };
  // Pause automatique : onglet masqué, appli en arrière-plan, passage en portrait sur tactile.
  const stopWatching = watchAway(() => {
    if (!state.paused) state.toggle();
  });
  const toMenu = () => {
    if (state.paused) scene.scene.start(SCENES.MENU);
  };
  const nav = createNavigation(scene);
  nav.on('pause', state.toggle);
  nav.on('back', toMenu);
  scene.events.once('shutdown', stopWatching);
  return state;
}
