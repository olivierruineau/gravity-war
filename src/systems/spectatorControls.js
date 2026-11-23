// Commandes du mode observation (9.8) : ← → (action `left` / `right`, les touches de rotation) ou boutons ◄ ► au doigt
// changent de bot suivi ; une bannière indique lequel. Aucun autre pilotage n'existe dans ce mode.
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config.js';
import { TOUCH_BUTTONS } from '../data/touchLayout.js';
import { toCss } from './color.js';
import { createNavigation, watchSource } from './navigation.js';
import { followedLabel, nextFollowed } from './spectator.js';
import { createButton } from './uiButton.js';

const DEPTH = 940;

/**
 * @param {Phaser.Scene} scene
 * @param {object} world
 * @param {(faction: number) => void} follow appelé avec la faction à suivre après un changement
 * @returns {{ update: (followed: number) => void }}
 */
export function createSpectatorControls(scene, world, follow) {
  let followed = 0;
  const banner = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT - 12, '', { fontFamily: 'monospace', fontSize: '10px' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  const hint = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, '← → : CHANGER DE BOT', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: toCss(PALETTE.star),
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  const change = (dir) => {
    if (scene.pause?.paused) return; // pause et options ont la main
    const next = nextFollowed(world, followed, dir);
    if (next !== followed) follow(next);
  };
  const [left, right] = TOUCH_BUTTONS; // ◄ ► aux mêmes places que les boutons de rotation
  const buttons = [
    createButton(scene, {
      x: left.x,
      y: left.y,
      label: '◄',
      fontSize: 14,
      onTap: () => change(-1),
    }),
    createButton(scene, {
      x: right.x,
      y: right.y,
      label: '►',
      fontSize: 14,
      onTap: () => change(1),
    }),
  ];
  watchSource(scene, (touch) => {
    hint.setVisible(!touch);
    for (const b of buttons) b.setVisible(touch);
  });
  const nav = createNavigation(scene);
  nav.on('left', () => change(-1));
  nav.on('right', () => change(1));

  return {
    update(current) {
      followed = current;
      const text = `OBSERVATION : ${followedLabel(current)}`;
      if (banner.text !== text) banner.setText(text).setColor(toCss(PALETTE.factions[current]));
    },
  };
}
