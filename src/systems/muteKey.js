// Touche M : coupe / rétablit le son, avec un indicateur discret en bas à droite tant que le son est coupé.
// À créer dans chaque scène qui doit réagir (menu, jeu) ; l'état vit dans `audio/mute.js`.
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config.js';
import { isMuted, toggleMute } from '../audio/mute.js';
import { toCss } from './color.js';

const MARGIN = 6;
const DEPTH = 950;

export function createMuteKey(scene) {
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
  const { keyboard } = scene.input;
  const onKey = () => label.setVisible(toggleMute());
  keyboard.on('keydown-M', onKey);
  scene.events.once('shutdown', () => keyboard.off('keydown-M', onKey));
}
