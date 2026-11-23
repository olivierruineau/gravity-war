// Aide à la pose tactile (8.7, refonte 9.1, ADR 0008 §4) : filtre d'intention du joueur seul, dans la couche d'entrée.
// Elle n'écrit que `intent.rotate` (rotation discrète) : le core, les seuils d'atterrissage et les bots ne changent pas.
// Deux cas, sous `ASSIST_ALTITUDE` et en approche :
//  - vitesse latérale trop forte : le nez vise CONTRE elle, de sorte qu'une poussée du joueur l'annule ;
//  - sinon : le nez s'aligne sur la normale (critère d'angle de `evaluateLanding`).
// Elle se retire dès que le joueur tourne, tire ou pousse : il garde la main sur sa vitesse.
import { ASSIST_ALTITUDE, ASSIST_LANDING_DEADBAND, ASSIST_TANGENTIAL_SPEED } from '../config.js';
import { hypot, wrapAngle } from '../core/math.js';
import { nearestPlanet } from '../core/planet.js';

/**
 * @param {object} world
 * @param {object} ship vaisseau du joueur
 * @param {{ rotate: number, thrust: boolean, fire: boolean }} intent intention déjà remplie par les autres sources
 * @returns {boolean} vrai si l'aide a tourné le vaisseau
 */
export function applyLandingAssist(world, ship, intent) {
  if (!ship.alive || ship.landedOn >= 0 || intent.rotate !== 0 || intent.fire || intent.thrust)
    return false;
  const index = nearestPlanet(world.planets, ship.pos);
  if (index < 0) return false;
  const planet = world.planets[index];
  const dx = ship.pos.x - planet.pos.x;
  const dy = ship.pos.y - planet.pos.y;
  const d = hypot(dx, dy);
  if (d - planet.radius > ASSIST_ALTITUDE) return false;
  const radial = ship.vel.x * dx + ship.vel.y * dy;
  if (radial >= 0) return false; // ne s'approche pas : on ne se mêle de rien
  const nx = dx / d;
  const ny = dy / d;
  const tx = ship.vel.x - (radial / d) * nx;
  const ty = ship.vel.y - (radial / d) * ny;
  const tangential = hypot(tx, ty);
  const target = tangential > ASSIST_TANGENTIAL_SPEED ? Math.atan2(-ty, -tx) : Math.atan2(dy, dx);
  const diff = wrapAngle(target - ship.angle);
  if (Math.abs(diff) <= ASSIST_LANDING_DEADBAND) return false;
  intent.rotate = diff > 0 ? 1 : -1;
  return true;
}
