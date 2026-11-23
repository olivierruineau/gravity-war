// Action `mute` (touche M ou bouton) : coupe / rétablit le son, avec un indicateur discret en bas à droite
// tant que le son est coupé. À créer dans chaque scène qui doit réagir (menu, jeu) ; l'état vit dans `audio/mute.js`.
import { PALETTE } from '../config.js';
import { isMuted, toggleMute } from '../audio/mute.js';
import { toCss } from './color.js';
import { createNavigation, watchSource } from './navigation.js';
import { createButton } from './uiButton.js';
import { MIN_FONT, READOUT, TOP_BUTTONS } from './hudLayout.js';

const DEPTH = 950;

/** Retourne `{ refresh }` : à appeler quand la sourdine change ailleurs (écran d'options). Un bouton `SON` s'affiche en plus au doigt, sauf si `button` est faux. */
export function createMuteKey(scene, { button = true } = {}) {
  const label = scene.add
    .text(READOUT.right, READOUT.y + READOUT.lineHeight, 'SON COUPE', {
      fontFamily: 'monospace',
      fontSize: `${MIN_FONT}px`,
      color: toCss(PALETTE.danger),
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setVisible(isMuted());
  const buttonLabel = () => (isMuted() ? 'MUET' : 'SON');
  const refresh = () => {
    label.setVisible(isMuted());
    soundButton?.setLabel(buttonLabel());
  };
  const toggle = () => {
    toggleMute();
    refresh();
  };
  const soundButton = button
    ? createButton(scene, {
        ...TOP_BUTTONS.sound,
        label: buttonLabel(),
        onTap: toggle,
        depth: DEPTH,
      })
    : null;
  if (soundButton) watchSource(scene, (touch) => soundButton.setVisible(touch));
  createNavigation(scene).on('mute', toggle);
  return { refresh };
}
