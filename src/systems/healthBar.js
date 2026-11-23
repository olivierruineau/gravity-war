// Barre de vie minimale, fixée à l'écran (bas gauche). Sera intégrée au HUD complet à l'item 6.1.
import { GAME_HEIGHT, MISSILE_STOCK_MAX, PALETTE, SHIELD_MAX, SHIP_MAX_HP } from '../config.js';

const MARGIN = 6; // distance au bord de l'écran
const X = MARGIN;
const WIDTH = 60;
const HEIGHT = 5;
const DEPTH = 900;
const SHIELD_HEIGHT = 3;
const SHIELD_GAP = 2; // écart entre la barre de bouclier et la barre de vie
const TICK_SIZE = 4; // côté d'un carré de stock de missiles
const TICK_GAP = 2;
const LOW_RATIO = 0.3; // sous ce seuil, la barre passe au rouge

export function createHealthBar(scene) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  const y = GAME_HEIGHT - HEIGHT - MARGIN;
  return {
    update(ship, shieldUnlocked, missilesUnlocked) {
      const ratio = Math.max(0, Math.min(1, ship.hp / SHIP_MAX_HP));
      g.clear();
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, y, WIDTH, HEIGHT);
      g.fillStyle(ratio > LOW_RATIO ? PALETTE.ok : PALETTE.danger, 1);
      g.fillRect(X + 1, y + 1, Math.round((WIDTH - 2) * ratio), HEIGHT - 2);
      let top = y; // ordonnée du haut de la pile de barres
      if (missilesUnlocked) {
        top -= SHIELD_GAP + TICK_SIZE;
        for (let i = 0; i < MISSILE_STOCK_MAX; i++) {
          const tx = X + i * (TICK_SIZE + TICK_GAP);
          g.lineStyle(1, PALETTE.text, 0.6);
          g.strokeRect(tx, top, TICK_SIZE, TICK_SIZE);
          if (i < ship.missiles) {
            g.fillStyle(PALETTE.text, 1);
            g.fillRect(tx + 1, top + 1, TICK_SIZE - 2, TICK_SIZE - 2);
          }
        }
      }
      if (!shieldUnlocked && ship.shield <= 0) return;
      const sy = top - SHIELD_GAP - SHIELD_HEIGHT;
      const sRatio = Math.max(0, Math.min(1, ship.shield / SHIELD_MAX));
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, sy, WIDTH, SHIELD_HEIGHT);
      g.fillStyle(PALETTE.text, 1);
      g.fillRect(X + 1, sy + 1, Math.round((WIDTH - 2) * sRatio), SHIELD_HEIGHT - 2);
    },
  };
}
