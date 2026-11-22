// RNG seedé (mulberry32) : tout aléa de simulation passe par ici, jamais par Math.random (ADR 0002).
// L'état est un simple entier 32 bits : le générateur est sérialisable dans `world`.

/** @typedef {{ state: number }} Rng */

/** @param {number} seed */
export function createRng(seed) {
  return { state: seed >>> 0 };
}

/** Flottant uniforme dans [0, 1). */
export function nextFloat(rng) {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Flottant uniforme dans [min, max). */
export function range(rng, min, max) {
  return min + nextFloat(rng) * (max - min);
}

/** Entier uniforme dans [min, maxExcl). */
export function int(rng, min, maxExcl) {
  return min + Math.floor(nextFloat(rng) * (maxExcl - min));
}
