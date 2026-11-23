// HUD (6.1), fixé à l'écran : vie, bouclier et missiles en bas à gauche, vitesse en bas à droite.
// Lecture seule ; la logique vit dans `hudModel` (testée), ici on ne fait que dessiner.
import { GAME_HEIGHT, GAME_WIDTH, MISSILE_STOCK_MAX, PALETTE } from '../config.js';
import { hudModel } from './hudModel.js';

const MARGIN = 6; // distance au bord de l'écran
const X = MARGIN;
const WIDTH = 60;
const HEIGHT = 5;
const DEPTH = 900;
const SHIELD_HEIGHT = 3;
const SHIELD_GAP = 2; // écart entre les barres
const TICK_SIZE = 4; // côté d'un carré de stock de missiles
const TICK_GAP = 2;
const LOW_RATIO = 0.3; // sous ce seuil, la barre de vie passe au rouge

export function createHud(scene) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  const speedText = scene.add
    .text(GAME_WIDTH - MARGIN, GAME_HEIGHT - MARGIN, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#7a80a8',
    })
    .setOrigin(1, 1)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  let shownSpeed = -1; // ne réécrit le texte que s'il change (pas d'allocation par frame)
  const y = GAME_HEIGHT - HEIGHT - MARGIN;

  return {
    update(ship, faction) {
      const m = hudModel(ship, faction);
      if (m.speed !== shownSpeed) {
        shownSpeed = m.speed;
        speedText.setText(`VIT ${m.speed}`);
      }
      g.clear();
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, y, WIDTH, HEIGHT);
      g.fillStyle(m.hpRatio > LOW_RATIO ? PALETTE.ok : PALETTE.danger, 1);
      g.fillRect(X + 1, y + 1, Math.round((WIDTH - 2) * m.hpRatio), HEIGHT - 2);
      let top = y; // ordonnée du haut de la pile
      if (m.showMissiles) {
        top -= SHIELD_GAP + TICK_SIZE;
        for (let i = 0; i < MISSILE_STOCK_MAX; i++) {
          const tx = X + i * (TICK_SIZE + TICK_GAP);
          g.lineStyle(1, PALETTE.text, 0.6);
          g.strokeRect(tx, top, TICK_SIZE, TICK_SIZE);
          if (i < m.missiles) {
            g.fillStyle(PALETTE.text, 1);
            g.fillRect(tx + 1, top + 1, TICK_SIZE - 2, TICK_SIZE - 2);
          }
        }
      }
      if (!m.showShield) return;
      const sy = top - SHIELD_GAP - SHIELD_HEIGHT;
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, sy, WIDTH, SHIELD_HEIGHT);
      g.fillStyle(PALETTE.text, 1);
      g.fillRect(X + 1, sy + 1, Math.round((WIDTH - 2) * m.shieldRatio), SHIELD_HEIGHT - 2);
    },
  };
}
