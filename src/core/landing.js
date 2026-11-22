// Contact vaisseau/planète (ADR 0003 §4) : atterrissage réussi ou impact (dégâts + rebond garanti).
// `evaluateLanding` est la seule source de vérité des seuils : collision, aide visuelle et IA l'utilisent.
import {
  IMPACT_DAMAGE_PER_SPEED,
  IMPACT_MIN_BOUNCE_SPEED,
  IMPACT_RESTITUTION,
  IMPACT_TANGENTIAL_DAMPING,
  LANDING_MAX_ANGLE,
  LANDING_MAX_RADIAL_SPEED,
  LANDING_MAX_TANGENTIAL_SPEED,
  SHIP_COLLISION_RADIUS,
} from '../config.js';
import { EVT, pushEvent } from './events.js';
import { wrapAngle } from './math.js';

/**
 * Mesures d'approche d'un vaisseau vers une planète, écrites dans `out` (aucune allocation) :
 * approachSpeed (> 0 = vers le centre), tangentialSpeed (signé), angleError (|nez − normale|, rad), ok.
 */
export function evaluateLanding(ship, planet, out) {
  const dx = ship.pos.x - planet.pos.x;
  const dy = ship.pos.y - planet.pos.y;
  const d = Math.hypot(dx, dy) || 1; // centre exact : normale arbitraire plutôt que NaN
  const nx = dx / d;
  const ny = dy / d;
  out.approachSpeed = -(ship.vel.x * nx + ship.vel.y * ny);
  out.tangentialSpeed = -ship.vel.x * ny + ship.vel.y * nx; // t = (−ny, nx)
  out.angleError = Math.abs(wrapAngle(ship.angle - Math.atan2(ny, nx)));
  out.ok =
    out.approachSpeed <= LANDING_MAX_RADIAL_SPEED &&
    Math.abs(out.tangentialSpeed) <= LANDING_MAX_TANGENTIAL_SPEED &&
    out.angleError <= LANDING_MAX_ANGLE;
  return out;
}

/** Dégâts proportionnels à l'excès de vitesse au-delà des seuils (0 si seul l'angle échoue). */
export function impactDamage(approachSpeed, tangentialSpeed) {
  return (
    IMPACT_DAMAGE_PER_SPEED *
    (Math.max(0, approachSpeed - LANDING_MAX_RADIAL_SPEED) +
      Math.max(0, Math.abs(tangentialSpeed) - LANDING_MAX_TANGENTIAL_SPEED))
  );
}

const scratch = { approachSpeed: 0, tangentialSpeed: 0, angleError: 0, ok: false };

/**
 * Détecte le contact du vaisseau `shipIndex` avec les planètes et applique l'atterrissage ou l'impact.
 * Les dégâts sont portés par l'événement IMPACT (leur application aux PV vient à l'item 2.4).
 */
export function collideShipPlanets(world, shipIndex) {
  const ship = world.ships[shipIndex];
  const planets = world.planets;
  for (let i = 0; i < planets.length; i++) {
    const planet = planets[i];
    const contactDistance = planet.radius + SHIP_COLLISION_RADIUS;
    const dx = ship.pos.x - planet.pos.x;
    const dy = ship.pos.y - planet.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= contactDistance) continue;

    // Toujours ressortir le vaisseau de la planète (planètes disjointes : un seul contact possible).
    const nx = d === 0 ? 0 : dx / d;
    const ny = d === 0 ? -1 : dy / d;
    ship.pos.x = planet.pos.x + nx * contactDistance;
    ship.pos.y = planet.pos.y + ny * contactDistance;

    evaluateLanding(ship, planet, scratch);
    if (scratch.approachSpeed <= 0) return; // déjà en train de s'éloigner

    const surfaceX = planet.pos.x + nx * planet.radius;
    const surfaceY = planet.pos.y + ny * planet.radius;
    if (scratch.ok) {
      ship.landedOn = i;
      ship.vel.x = 0;
      ship.vel.y = 0; // l'angle du nez est conservé
      pushEvent(world.events, EVT.LANDED, surfaceX, surfaceY, shipIndex, i);
    } else {
      pushEvent(
        world.events,
        EVT.IMPACT,
        surfaceX,
        surfaceY,
        shipIndex,
        impactDamage(scratch.approachSpeed, scratch.tangentialSpeed),
      );
      // Rebond garanti (jamais d'arrêt) : sortie radiale minimale + frottement tangentiel.
      const bounce = Math.max(IMPACT_RESTITUTION * scratch.approachSpeed, IMPACT_MIN_BOUNCE_SPEED);
      const tangential = scratch.tangentialSpeed * IMPACT_TANGENTIAL_DAMPING;
      ship.vel.x = nx * bounce - ny * tangential;
      ship.vel.y = ny * bounce + nx * tangential;
    }
    return;
  }
}
