// Aide à l'atterrissage : près d'une planète, montre pour CHAQUE critère de `evaluateLanding` (la source
// unique des seuils) s'il est respecté — vitesse d'approche, vitesse le long de la surface, orientation du nez.
import {
  LANDING_AID_ALTITUDE,
  LANDING_MAX_ANGLE,
  LANDING_MAX_RADIAL_SPEED,
  LANDING_MAX_TANGENTIAL_SPEED,
  PALETTE,
} from '../config.js';
import { evaluateLanding } from '../core/landing.js';
import { nearestPlanet } from '../core/planet.js';

const DEPTH = 50;
const ALPHA = 0.8;
const GAUGE_WIDTH = 24;
const GAUGE_HEIGHT = 3;
const GAUGE_OFFSET = 16; // première jauge sous le vaisseau
const GAUGE_GAP = 6; // écart entre les deux jauges
const GAUGE_RANGE = 2; // pleine échelle = 2 × seuil, le repère central marque le seuil
const NOSE_LENGTH = 14;
const NORMAL_LENGTH = 10;
const TICK_OVERSHOOT = 2;

const scratch = { approachSpeed: 0, tangentialSpeed: 0, angleError: 0, ok: false };

const tone = (ok) => (ok ? PALETTE.aidGood : PALETTE.aidBad);

export function createLandingAid(scene) {
  const g = scene.add.graphics().setDepth(DEPTH);

  /** Jauge de `ratio` ∈ [-1, 1] (signée si `signed`), repère central = seuil. */
  function gauge(x, y, ratio, signed, ok) {
    g.lineStyle(1, tone(ok), ALPHA);
    g.strokeRect(x, y, GAUGE_WIDTH, GAUGE_HEIGHT);
    g.fillStyle(tone(ok), ALPHA);
    const half = GAUGE_WIDTH / 2;
    if (signed) {
      const w = Math.round(half * Math.min(1, Math.abs(ratio)));
      g.fillRect(ratio >= 0 ? x + half : x + half - w, y, w, GAUGE_HEIGHT);
    } else {
      g.fillRect(x, y, Math.round(GAUGE_WIDTH * Math.max(0, Math.min(1, ratio))), GAUGE_HEIGHT);
    }
    g.lineStyle(1, PALETTE.text, ALPHA);
    g.lineBetween(x + half, y - TICK_OVERSHOOT, x + half, y + GAUGE_HEIGHT + TICK_OVERSHOOT);
  }

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
      const radialOk = scratch.approachSpeed <= LANDING_MAX_RADIAL_SPEED;
      const tangentialOk = Math.abs(scratch.tangentialSpeed) <= LANDING_MAX_TANGENTIAL_SPEED;
      const angleOk = scratch.angleError <= LANDING_MAX_ANGLE;
      const nx = dx / d;
      const ny = dy / d;

      // Repère de la normale sur la surface (l'axe sur lequel le nez doit s'aligner) et trait du nez :
      // colorés selon l'orientation seule.
      const sx = planet.pos.x + nx * planet.radius;
      const sy = planet.pos.y + ny * planet.radius;
      g.lineStyle(1, tone(angleOk), ALPHA);
      g.lineBetween(sx, sy, sx + nx * NORMAL_LENGTH, sy + ny * NORMAL_LENGTH);
      g.lineBetween(
        ship.pos.x,
        ship.pos.y,
        ship.pos.x + Math.cos(ship.angle) * NOSE_LENGTH,
        ship.pos.y + Math.sin(ship.angle) * NOSE_LENGTH,
      );

      // Jauge 1 : vitesse d'approche. Jauge 2 : vitesse le long de la surface (signée).
      const gx = ship.pos.x - GAUGE_WIDTH / 2;
      const gy = ship.pos.y + GAUGE_OFFSET;
      gauge(
        gx,
        gy,
        scratch.approachSpeed / (GAUGE_RANGE * LANDING_MAX_RADIAL_SPEED),
        false,
        radialOk,
      );
      gauge(
        gx,
        gy + GAUGE_HEIGHT + GAUGE_GAP,
        scratch.tangentialSpeed / (GAUGE_RANGE * LANDING_MAX_TANGENTIAL_SPEED),
        true,
        tangentialOk,
      );
    },
  };
}
