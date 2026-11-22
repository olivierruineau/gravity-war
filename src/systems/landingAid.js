// Aide à l'atterrissage : près d'une planète, indique si la vitesse d'approche et l'orientation du nez
// permettent de se poser (vert) ou non (rouge). S'appuie sur `evaluateLanding`, la source unique des seuils.
import { LANDING_AID_ALTITUDE, LANDING_MAX_RADIAL_SPEED, PALETTE } from '../config.js';
import { evaluateLanding } from '../core/landing.js';
import { nearestPlanet } from '../core/planet.js';

const GAUGE_WIDTH = 24;
const GAUGE_HEIGHT = 3;
const GAUGE_OFFSET = 16; // sous le vaisseau
const NOSE_LENGTH = 14;
const NORMAL_LENGTH = 10;

const scratch = { approachSpeed: 0, tangentialSpeed: 0, angleError: 0, ok: false };

export function createLandingAid(scene) {
  const g = scene.add.graphics().setDepth(50);
  return {
    /** Lecture seule de `world` ; dessine dans l'espace du monde, au-dessus du vaisseau. */
    update(world, ship) {
      g.clear();
      if (!ship.alive || ship.landedOn >= 0) return;
      const index = nearestPlanet(world.planets, ship.pos);
      if (index < 0) return;
      const planet = world.planets[index];
      const dx = ship.pos.x - planet.pos.x;
      const dy = ship.pos.y - planet.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d - planet.radius > LANDING_AID_ALTITUDE) return;

      evaluateLanding(ship, planet, scratch);
      const color = scratch.ok ? PALETTE.ok : PALETTE.danger;
      const nx = dx / d;
      const ny = dy / d;

      // Repère de la normale sur la surface : l'axe sur lequel le nez doit s'aligner.
      const sx = planet.pos.x + nx * planet.radius;
      const sy = planet.pos.y + ny * planet.radius;
      g.lineStyle(1, color, 0.8);
      g.lineBetween(sx, sy, sx + nx * NORMAL_LENGTH, sy + ny * NORMAL_LENGTH);

      // Trait d'orientation du nez.
      g.lineBetween(
        ship.pos.x,
        ship.pos.y,
        ship.pos.x + Math.cos(ship.angle) * NOSE_LENGTH,
        ship.pos.y + Math.sin(ship.angle) * NOSE_LENGTH,
      );

      // Jauge de vitesse d'approche : le repère central = seuil d'atterrissage.
      const ratio = Math.max(
        0,
        Math.min(1, scratch.approachSpeed / (2 * LANDING_MAX_RADIAL_SPEED)),
      );
      const gx = ship.pos.x - GAUGE_WIDTH / 2;
      const gy = ship.pos.y + GAUGE_OFFSET;
      g.strokeRect(gx, gy, GAUGE_WIDTH, GAUGE_HEIGHT);
      g.fillStyle(color, 0.8);
      g.fillRect(gx, gy, Math.round(GAUGE_WIDTH * ratio), GAUGE_HEIGHT);
      g.lineStyle(1, PALETTE.text, 0.8);
      g.lineBetween(gx + GAUGE_WIDTH / 2, gy - 2, gx + GAUGE_WIDTH / 2, gy + GAUGE_HEIGHT + 2);
    },
  };
}
