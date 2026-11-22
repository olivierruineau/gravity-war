// Planète fixe : cercle qui attire en 1/d² (voir gravity.js, ADR 0003) et que l'on peut capturer.
import { GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../config.js';

export const NEUTRAL = -1;

/**
 * @param {{ x: number, y: number, radius: number, gravity?: number }} def
 *   `gravity` = gravité de surface g0 en px/s² (défaut PLANET_GRAVITY).
 * `mu` est calibré pour que la gravité vaille exactement g0 à la surface malgré le décalage de coupure.
 */
export function createPlanet({ x, y, radius, gravity = PLANET_GRAVITY }) {
  const k = GRAVITY_RANGE_FACTOR;
  return {
    pos: { x, y },
    radius,
    owner: NEUTRAL,
    mu: (gravity * radius * radius * k * k) / (k * k - 1),
    range: k * radius,
  };
}
