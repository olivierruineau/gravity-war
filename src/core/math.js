// Logique pure : aucun import Phaser / DOM ici (voir CLAUDE.md). Testable avec Vitest.

/** Borne `value` entre `min` et `max`. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Interpolation linéaire de `a` vers `b` (`t` borné à [0, 1]). */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}
