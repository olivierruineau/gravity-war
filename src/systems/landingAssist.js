// Aide à la pose tactile (8.7, ADR 0008 §4) : filtre d'intention du joueur seul, dans la couche d'entrée.
// Près d'une planète et en approche, si aucun doigt ne tourne et que le joueur ne tire pas, elle tourne le vaisseau
// pour aligner le nez sur la normale (le critère d'angle de `evaluateLanding`). Elle n'écrit que `intent.rotate`
// (rotation discrète) : le core, les seuils d'atterrissage et les bots ne changent pas.
import { ASSIST_LANDING_DEADBAND, LANDING_AID_ALTITUDE } from '../config.js';
import { hypot, wrapAngle } from '../core/math.js';
import { nearestPlanet } from '../core/planet.js';

/**
 * @param {object} world
 * @param {object} ship vaisseau du joueur
 * @param {{ rotate: number, fire: boolean }} intent intention déjà remplie par les autres sources
 * @returns {boolean} vrai si l'aide a tourné le vaisseau
 */
export function applyLandingAssist(world, ship, intent) {
  if (!ship.alive || ship.landedOn >= 0 || intent.rotate !== 0 || intent.fire) return false;
  const index = nearestPlanet(world.planets, ship.pos);
  if (index < 0) return false;
  const planet = world.planets[index];
  const dx = ship.pos.x - planet.pos.x;
  const dy = ship.pos.y - planet.pos.y;
  const d = hypot(dx, dy);
  if (d - planet.radius > LANDING_AID_ALTITUDE) return false;
  if (ship.vel.x * dx + ship.vel.y * dy >= 0) return false; // ne s'approche pas : on ne se mêle de rien
  const diff = wrapAngle(Math.atan2(dy, dx) - ship.angle);
  if (Math.abs(diff) <= ASSIST_LANDING_DEADBAND) return false;
  intent.rotate = diff > 0 ? 1 : -1;
  return true;
}
