// Navigation de l'IA (ADR 0006 §4.1 et §4.2) : primitives d'orientation/poussée et « arrive » avec contournement.
// Séparée de pilot.js pour que touchdown.js (§4.4) s'en serve sans dépendance circulaire.
import { FIXED_DT, SHIP_COLLISION_RADIUS, SHIP_ROTATION_SPEED, SHIP_THRUST } from '../../config.js';
import { BOT_PROFILE as P } from '../../data/ai.js';
import { defenseRange } from '../building.js';
import { gravityAt } from '../gravity.js';
import { clamp, wrapAngle } from '../math.js';

// Rotation sans inertie : sous la moitié d'un pas de rotation, tourner ferait osciller le nez.
const ROTATION_DEAD_ZONE = (SHIP_ROTATION_SPEED * FIXED_DT) / 2;
// Sous cette accélération, le « bruit » de la vitesse désirée est dans la tolérance : on ne pousse pas.
const MIN_THRUST_ACCEL = P.velTolerance / P.velGainTime;
const BRAKE_ACCEL = P.brakeFactor * SHIP_THRUST;
const TURN_AROUND_TIME = Math.PI / SHIP_ROTATION_SPEED; // demi-tour avant de pouvoir freiner
const DETOUR_FACTOR = 1.15; // le point de contournement est à 1,15 × rayon gonflé du centre

const gravity = { x: 0, y: 0 };
const waypoint = { x: 0, y: 0 };

/** Oriente le nez vers `angle` : `rotate` = signe de l'écart, 0 dans la zone morte (exact, sans inertie). */
export function steerToAngle(intent, ship, angle) {
  const diff = wrapAngle(angle - ship.angle);
  intent.rotate = Math.abs(diff) > ROTATION_DEAD_ZONE ? Math.sign(diff) : 0;
}

/**
 * Oriente le nez vers l'accélération voulue (ax, ay) et pousse si le nez est dans le cône `thrustCone` et que
 * l'accélération dépasse le seuil : le contrôle est bang-bang, la tolérance tient lieu de modulation.
 */
export function thrustToward(intent, ship, ax, ay) {
  if (Math.hypot(ax, ay) < MIN_THRUST_ACCEL) {
    intent.rotate = 0;
    intent.thrust = false;
    return;
  }
  const desired = Math.atan2(ay, ax);
  steerToAngle(intent, ship, desired);
  intent.thrust = Math.abs(wrapAngle(desired - ship.angle)) <= P.thrustCone;
}

/**
 * Premier obstacle (par abscisse le long du segment) que coupe le segment vaisseau → (gx, gy), hors `ignore` ;
 * écrit dans `waypoint` le point de contournement : le point de tangence, du côté du vaisseau, sur le cercle de
 * rayon `DETOUR_FACTOR` × rayon gonflé (ADR 0006 §4.2 : un niveau, recalculé à chaque pas, sans A*).
 * Un obstacle qui contient déjà le vaisseau (décollage) ou le but est ignoré. Le rayon est gonflé de la marge de
 * collision, de `clearance` et, pour une planète qui n'est pas à la faction du vaisseau, de la portée de ses tourelles.
 */
function findDetour(world, ship, gx, gy, ignore) {
  const px = ship.pos.x;
  const py = ship.pos.y;
  const len = Math.hypot(gx - px, gy - py);
  if (len === 0) return false;
  const ex = (gx - px) / len;
  const ey = (gy - py) / len;
  const planets = world.planets;
  let bestAlong = Infinity;
  let bestPlanet = -1;
  let bestSide = 1;
  let bestReach = 0;
  for (let i = 0; i < planets.length; i++) {
    if (i === ignore) continue;
    const p = planets[i];
    let reach = p.radius + SHIP_COLLISION_RADIUS + P.clearance;
    if (p.owner !== ship.faction) reach += defenseRange(p);
    const cx = p.pos.x - px;
    const cy = p.pos.y - py;
    if (cx * cx + cy * cy < reach * reach) continue;
    if ((p.pos.x - gx) ** 2 + (p.pos.y - gy) ** 2 < reach * reach) continue;
    const along = cx * ex + cy * ey;
    if (along <= 0 || along >= len || along >= bestAlong) continue;
    const lateral = ex * cy - ey * cx; // position signée du centre par rapport à la droite
    if (Math.abs(lateral) >= reach) continue;
    bestAlong = along;
    bestPlanet = i;
    bestSide = lateral > 0 ? -1 : 1; // on passe du côté où se trouve le vaisseau
    bestReach = reach;
  }
  if (bestPlanet < 0) return false;
  // Pourquoi la tangente et non « centre + perpendiculaire » : visé de près, ce point est derrière une corde qui
  // rogne le disque, et le vaisseau, attiré, s'y écrase. Le point de tangence est toujours extérieur au cercle.
  const center = planets[bestPlanet].pos;
  const ring = DETOUR_FACTOR * bestReach;
  const dist = Math.hypot(px - center.x, py - center.y);
  const ux = (px - center.x) / dist; // du centre vers le vaisseau
  const uy = (py - center.y) / dist;
  const cosBeta = Math.min(1, ring / dist);
  const sinBeta = Math.sqrt(1 - cosBeta * cosBeta);
  const wanted = bestSide * (-ey * -uy + ex * ux); // côté voulu (normale gauche × side) projeté sur perp(u)
  const sigma = wanted < 0 ? -1 : 1;
  waypoint.x = center.x + ring * (ux * cosBeta - sigma * uy * sinBeta);
  waypoint.y = center.y + ring * (uy * cosBeta + sigma * ux * sinBeta);
  return true;
}

/**
 * Navigation vers (gx, gy) : « arrive » avec temps de demi-tour, gravité compensée, contournement des planètes
 * (sauf `ignore`) et but borné à la carte. `ignore` = −1 pour traiter toutes les planètes comme obstacles.
 */
export function flyTo(world, ship, intent, gx, gy, ignore) {
  const goalX = clamp(gx, P.wallMargin, world.width - P.wallMargin);
  const goalY = clamp(gy, P.wallMargin, world.height - P.wallMargin);
  let steerX = goalX;
  let steerY = goalY;
  let dist = Math.hypot(goalX - ship.pos.x, goalY - ship.pos.y);
  if (findDetour(world, ship, goalX, goalY, ignore)) {
    steerX = clamp(waypoint.x, P.wallMargin, world.width - P.wallMargin);
    steerY = clamp(waypoint.y, P.wallMargin, world.height - P.wallMargin);
    // Vitesse réglée sur le trajet restant, pas sur le waypoint : on ne ralentit pas pour un point de passage.
    dist =
      Math.hypot(steerX - ship.pos.x, steerY - ship.pos.y) +
      Math.hypot(goalX - steerX, goalY - steerY);
  }
  const toX = steerX - ship.pos.x;
  const toY = steerY - ship.pos.y;
  const toLen = Math.hypot(toX, toY);
  const braking = BRAKE_ACCEL * TURN_AROUND_TIME;
  const speed =
    toLen === 0
      ? 0
      : Math.min(P.cruiseSpeed, -braking + Math.sqrt(braking * braking + 2 * BRAKE_ACCEL * dist));
  const desiredVx = toLen === 0 ? 0 : (toX / toLen) * speed;
  const desiredVy = toLen === 0 ? 0 : (toY / toLen) * speed;
  gravityAt(gravity, ship.pos, world.planets);
  thrustToward(
    intent,
    ship,
    (desiredVx - ship.vel.x) / P.velGainTime - gravity.x,
    (desiredVy - ship.vel.y) / P.velGainTime - gravity.y,
  );
}
