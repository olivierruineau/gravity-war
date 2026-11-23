// Réglage du menu (8.7, 8.9) : une ligne de texte avec sa touche au clavier, un bouton au doigt ; les deux se
// mettent à jour ensemble. `cycle` passe à la valeur suivante, `label` donne le texte courant (sans la touche).
import { PALETTE } from '../config.js';
import { toCss } from './color.js';
import { createButton } from './uiButton.js';

/**
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number, w: number, key: string, label: () => string, cycle: () => void }} opts
 * @returns {{ cycle: () => void, showTouch: (touch: boolean) => void }}
 */
export function createSettingRow(scene, { x, y, w, key, label, cycle }) {
  const hint = scene.add
    .text(x, y, `${key} : ${label()}`, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: toCss(PALETTE.star),
    })
    .setOrigin(0.5);
  const refresh = () => {
    hint.setText(`${key} : ${label()}`);
    button.setLabel(label());
  };
  const step = () => {
    cycle();
    refresh();
  };
  const button = createButton(scene, { x, y, w, h: 28, label: label(), fontSize: 8, onTap: step });
  return {
    cycle: step,
    showTouch(touch) {
      hint.setVisible(!touch);
      button.setVisible(touch);
    },
  };
}
