// HUD (6.1, 8.6), fixé à l'écran en haut : barres de vie, bouclier et missiles à gauche, vitesse à droite.
// Le bas est laissé aux pouces (commandes tactiles). Lecture seule ; la logique vit dans `hudModel` (testée).
import { MISSILE_STOCK_MAX, PALETTE } from '../config.js';
import { toCss } from './color.js';
import { hudModel } from './hudModel.js';
import { BARS, MIN_FONT, READOUT } from './hudLayout.js';

const DEPTH = 900;
const LOW_RATIO = 0.3; // sous ce seuil, la barre de vie passe au rouge

export function createHud(scene) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  const speedText = scene.add
    .text(READOUT.right, READOUT.y, '', {
      fontFamily: 'monospace',
      fontSize: `${MIN_FONT}px`,
      color: toCss(PALETTE.text),
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  let shownSpeed = -1; // ne réécrit le texte que s'il change (pas d'allocation par frame)
  const { x, y, width: w } = BARS;
  const shieldY = y + BARS.hpHeight + BARS.gap;
  const ticksY = shieldY + BARS.shieldHeight + BARS.gap;

  return {
    update(ship, faction) {
      const m = hudModel(ship, faction);
      if (m.speed !== shownSpeed) {
        shownSpeed = m.speed;
        speedText.setText(`VIT ${m.speed}`);
      }
      g.clear();
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(x, y, w, BARS.hpHeight);
      g.fillStyle(m.hpRatio > LOW_RATIO ? PALETTE.ok : PALETTE.danger, 1);
      g.fillRect(x + 1, y + 1, Math.round((w - 2) * m.hpRatio), BARS.hpHeight - 2);
      if (m.showShield) {
        g.lineStyle(1, PALETTE.text, 0.6);
        g.strokeRect(x, shieldY, w, BARS.shieldHeight);
        g.fillStyle(PALETTE.text, 1);
        g.fillRect(x + 1, shieldY + 1, Math.round((w - 2) * m.shieldRatio), BARS.shieldHeight - 2);
      }
      if (!m.showMissiles) return;
      for (let i = 0; i < MISSILE_STOCK_MAX; i++) {
        const tx = x + i * (BARS.tick + BARS.tickGap);
        g.lineStyle(1, PALETTE.text, 0.6);
        g.strokeRect(tx, ticksY, BARS.tick, BARS.tick);
        if (i < m.missiles) {
          g.fillStyle(PALETTE.text, 1);
          g.fillRect(tx + 1, ticksY + 1, BARS.tick - 2, BARS.tick - 2);
        }
      }
    },
  };
}
