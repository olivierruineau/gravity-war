// Bouton d'interface (8.2) : cadre filaire + libellé, activé au toucher ou au clic.
// Les objets Phaser (et leurs écouteurs) disparaissent avec la scène : rien à nettoyer à la main.
import { PALETTE } from '../config.js';
import { toCss } from './color.js';

/** Côté minimal d'une cible tactile, en pixels du jeu (≥ 44 px CSS dès que l'écran fait 297 px de haut). */
export const MIN_TARGET = 40;

/**
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number, w?: number, h?: number, label: string, onTap: () => void,
 *   depth?: number, fontSize?: number, color?: number }} opts `x`, `y` : centre
 */
export function createButton(scene, opts) {
  const { x, y, w = MIN_TARGET, h = MIN_TARGET, label, onTap, depth = 960, fontSize = 10 } = opts;
  const color = opts.color ?? PALETTE.text;
  const box = scene.add
    .rectangle(x, y, w, h, PALETTE.bg, 0.55)
    .setStrokeStyle(1, color, 0.9)
    .setScrollFactor(0)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y, label, { fontFamily: 'monospace', fontSize: `${fontSize}px`, color: toCss(color) })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(depth + 1);
  box.on('pointerdown', onTap);
  return {
    setVisible(visible) {
      box.setVisible(visible);
      text.setVisible(visible);
      if (visible) box.setInteractive();
      else box.disableInteractive();
      return this;
    },
    setLabel(value) {
      text.setText(value);
      return this;
    },
  };
}
