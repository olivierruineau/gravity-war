// Pause (6.5) : action `pause` (touche P). Fige la scène (GameScene ne simule plus tant que `paused`), affiche l'aide des commandes ;
// ECHAP revient au menu. Inactive une fois la partie décidée (l'écran de fin a ses propres touches).
import { toCss } from './color.js';
import { watchAway } from './platform.js';
import { createNavigation, watchSource } from './navigation.js';
import { createButton } from './uiButton.js';
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
    .text(cx, GAME_HEIGHT * 0.5, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: toCss(PALETTE.text),
      align: 'left',
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH + 1)
    .setVisible(false);

  const resumeButton = createButton(scene, {
    x: cx - 70,
    y: GAME_HEIGHT * 0.72, // au-dessus des boutons de jeu (poussée, rotation)
    w: 120,
    h: 40,
    label: 'REPRENDRE',
    depth: DEPTH + 2,
    color: PALETTE.accent,
    onTap: () => state.toggle(),
  });
  const menuButton = createButton(scene, {
    x: cx + 70,
    y: GAME_HEIGHT * 0.72, // au-dessus des boutons de jeu (poussée, rotation)
    w: 120,
    h: 40,
    label: 'MENU',
    depth: DEPTH + 2,
    onTap: () => toMenu(),
  });
  // Bouton pause en haut à gauche, visible seulement au doigt (le sien est sous le voile : on bascule par ce bouton).
  const pauseButton = createButton(scene, {
    x: 26,
    y: 26,
    label: 'II',
    depth: DEPTH - 100,
    onTap: () => state.toggle(),
  });

  let touch = false;
  const render = () => {
    const hint = touch ? [] : ['', 'P : reprendre   ECHAP : menu'];
    help.setText([...controlsLines(touch), ...hint]);
    help.setY(GAME_HEIGHT * (touch ? 0.42 : 0.5)).setVisible(state.paused);
    resumeButton.setVisible(state.paused && touch);
    menuButton.setVisible(state.paused && touch);
    pauseButton.setVisible(!state.paused && touch && canPause());
  };
  const state = {
    paused: false,
    toggle() {
      if (!state.paused && !canPause()) return;
      state.paused = !state.paused;
      veil.setVisible(state.paused);
      title.setVisible(state.paused);
      render();
    },
  };
  watchSource(scene, (isTouch) => {
    touch = isTouch;
    render();
  });
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
