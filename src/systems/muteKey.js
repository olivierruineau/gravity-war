// Action `mute` (touche M ou bouton) : coupe / rétablit le son, avec un indicateur discret en bas à droite
// tant que le son est coupé. À créer dans chaque scène qui doit réagir (menu, jeu) ; l'état vit dans `audio/mute.js`.
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config.js';
import { isMuted, toggleMute } from '../audio/mute.js';
import { toCss } from './color.js';
import { createNavigation, watchSource } from './navigation.js';
import { createButton } from './uiButton.js';

const MARGIN = 6;
const DEPTH = 950;
const BUTTON_X = 72; // bouton tactile en haut à gauche, à droite du bouton pause (voir pauseScreen)
const BUTTON_Y = 26;

/** Un bouton `SON` s'affiche en plus au doigt, sauf si `button` est faux. */
export function createMuteKey(scene, { button = true } = {}) {
  const label = scene.add
    .text(GAME_WIDTH - MARGIN, GAME_HEIGHT - MARGIN - 12, 'SON COUPE', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: toCss(PALETTE.danger),
    })
    .setOrigin(1, 1)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setVisible(isMuted());
  const buttonLabel = () => (isMuted() ? 'MUET' : 'SON');
  const toggle = () => {
    label.setVisible(toggleMute());
    soundButton?.setLabel(buttonLabel());
  };
  const soundButton = button
    ? createButton(scene, {
        x: BUTTON_X,
        y: BUTTON_Y,
        label: buttonLabel(),
        onTap: toggle,
        depth: DEPTH,
      })
    : null;
  if (soundButton) watchSource(scene, (touch) => soundButton.setVisible(touch));
  createNavigation(scene).on('mute', toggle);
}
