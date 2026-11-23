// Barre de vie minimale, fixée à l'écran (bas gauche). Sera intégrée au HUD complet à l'item 6.1.
import { GAME_HEIGHT, PALETTE, SHIELD_MAX, SHIP_MAX_HP } from '../config.js';

const MARGIN = 6; // distance au bord de l'écran
const X = MARGIN;
const WIDTH = 60;
const HEIGHT = 5;
const DEPTH = 900;
const SHIELD_HEIGHT = 3;
const SHIELD_GAP = 2; // écart entre la barre de bouclier et la barre de vie
const LOW_RATIO = 0.3; // sous ce seuil, la barre passe au rouge

export function createHealthBar(scene) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  const y = GAME_HEIGHT - HEIGHT - MARGIN;
  return {
    update(ship, shieldUnlocked) {
      const ratio = Math.max(0, Math.min(1, ship.hp / SHIP_MAX_HP));
      g.clear();
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, y, WIDTH, HEIGHT);
      g.fillStyle(ratio > LOW_RATIO ? PALETTE.ok : PALETTE.danger, 1);
      g.fillRect(X + 1, y + 1, Math.round((WIDTH - 2) * ratio), HEIGHT - 2);
      if (!shieldUnlocked && ship.shield <= 0) return;
      const sy = y - SHIELD_GAP - SHIELD_HEIGHT;
      const sRatio = Math.max(0, Math.min(1, ship.shield / SHIELD_MAX));
      g.lineStyle(1, PALETTE.text, 0.6);
      g.strokeRect(X, sy, WIDTH, SHIELD_HEIGHT);
      g.fillStyle(PALETTE.text, 1);
      g.fillRect(X + 1, sy + 1, Math.round((WIDTH - 2) * sRatio), SHIELD_HEIGHT - 2);
    },
  };
}
