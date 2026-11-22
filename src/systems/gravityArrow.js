// Flèche de gravité : direction et intensité de l'accélération réellement subie par le vaisseau.
// Appelle `gravityAt` (lecture seule) : elle reflète donc automatiquement la règle de zone dominante.
import { PALETTE, PLANET_MAX_GRAVITY } from '../config.js';
import { gravityAt } from '../core/gravity.js';

const DEPTH = 49;
const ALPHA = 0.9;
const OFFSET = 14; // distance du centre du vaisseau au départ de la flèche
const MAX_LENGTH = 22; // longueur pour une gravité égale au plafond de la carte
const MIN_ACCEL = 0.5; // sous ce seuil (px/s²), rien n'est dessiné
const HEAD_LENGTH = 4;
const HEAD_ANGLE = 0.5; // rad

const scratch = { x: 0, y: 0 };

export function createGravityArrow(scene) {
  const g = scene.add.graphics().setDepth(DEPTH);
  return {
    update(world, ship) {
      g.clear();
      if (!ship.alive || ship.landedOn >= 0) return;
      gravityAt(scratch, ship.pos, world.planets);
      const a = Math.hypot(scratch.x, scratch.y);
      if (a < MIN_ACCEL) return;
      const dirX = scratch.x / a;
      const dirY = scratch.y / a;
      const length = Math.min(1, a / PLANET_MAX_GRAVITY) * MAX_LENGTH;
      const x0 = ship.pos.x + dirX * OFFSET;
      const y0 = ship.pos.y + dirY * OFFSET;
      const x1 = x0 + dirX * length;
      const y1 = y0 + dirY * length;
      const angle = Math.atan2(dirY, dirX);
      g.lineStyle(1, PALETTE.star, ALPHA);
      g.lineBetween(x0, y0, x1, y1);
      g.lineBetween(
        x1,
        y1,
        x1 - Math.cos(angle - HEAD_ANGLE) * HEAD_LENGTH,
        y1 - Math.sin(angle - HEAD_ANGLE) * HEAD_LENGTH,
      );
      g.lineBetween(
        x1,
        y1,
        x1 - Math.cos(angle + HEAD_ANGLE) * HEAD_LENGTH,
        y1 - Math.sin(angle + HEAD_ANGLE) * HEAD_LENGTH,
      );
    },
  };
}
