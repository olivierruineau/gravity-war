// Planète fixe : cercle qui attire en 1/d² (voir gravity.js, ADR 0003) et que l'on peut capturer.
import { BUILDINGS } from '../data/buildings.js';
import { GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../config.js';

export const NEUTRAL = -1;

/**
 * @param {{ x: number, y: number, radius: number, gravity?: number, owner?: number, built?: number }} def
 *   `gravity` = gravité de surface g0 en px/s² (défaut PLANET_GRAVITY) ; `owner` = faction de départ (défaut neutre) ;
 *   `built` = nombre de slots déjà construits, dans l'ordre du catalogue (défaut 0, ignoré pour une planète neutre).
 * `mu` est calibré pour que la gravité vaille exactement g0 à la surface malgré le décalage de coupure.
 */
export function createPlanet({
  x,
  y,
  radius,
  gravity = PLANET_GRAVITY,
  owner = NEUTRAL,
  built = 0,
}) {
  const k = GRAVITY_RANGE_FACTOR;
  const builtCount = owner === NEUTRAL ? 0 : built; // une neutre n'a jamais de bâtiment
  const buildings = BUILDINGS.map((b, i) => ({
    built: i < builtCount,
    hp: i < builtCount ? b.hp : 0,
    cooldown: 0,
  }));
  return {
    pos: { x, y },
    radius,
    owner,
    mu: (gravity * radius * radius * k * k) / (k * k - 1),
    range: k * radius,
    buildings,
    buildProgress: 0, // secondes écoulées sur le chantier en cours
    captureBy: -1, // faction en train de capturer, -1 = personne
    captureTime: 0,
    lastHitTick: -1, // tick du dernier tir ennemi absorbé (−1 = jamais) ; lu par l'IA (ADR 0006)
  };
}

/**
 * Index de la planète dont la SURFACE est la plus proche de `pos` (−1 s'il n'y en a aucune).
 * Si `owner` est fourni, seules les planètes de ce propriétaire sont considérées.
 */
export function nearestPlanet(planets, pos, owner) {
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (owner !== undefined && p.owner !== owner) continue;
    const gap = Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y) - p.radius;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}
