// Vecteurs 2D sans allocation : objets { x, y } et fonctions à paramètre de sortie.
// Chaque fonction écrit dans `out` et le retourne ; `out` peut être le même objet que `a` ou `b`.
// Les vecteurs temporaires doivent être des `const` locaux au module appelant (voir ADR 0002).

import { hypot } from './math.js';

/** @typedef {{ x: number, y: number }} Vec2 */

/** Crée un vecteur (à appeler au chargement, jamais dans la boucle de simulation). */
export function create(x = 0, y = 0) {
  return { x, y };
}

export function set(out, x, y) {
  out.x = x;
  out.y = y;
  return out;
}

export function copy(out, a) {
  out.x = a.x;
  out.y = a.y;
  return out;
}

export function add(out, a, b) {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
}

export function sub(out, a, b) {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  return out;
}

export function scale(out, a, s) {
  out.x = a.x * s;
  out.y = a.y * s;
  return out;
}

/** out = a + b * s (très utilisé par l'intégrateur : pos += vel * dt). */
export function addScaled(out, a, b, s) {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  return out;
}

/** Vecteur de longueur `length` pointant dans la direction `angle` (radians, 0 = +x, y vers le bas). */
export function fromAngle(out, angle, length = 1) {
  out.x = Math.cos(angle) * length;
  out.y = Math.sin(angle) * length;
  return out;
}

/** Normalise `a` ; un vecteur nul reste nul (jamais de NaN). */
export function normalize(out, a) {
  const l = hypot(a.x, a.y);
  if (l === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = a.x / l;
    out.y = a.y / l;
  }
  return out;
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function len2(a) {
  return a.x * a.x + a.y * a.y;
}

export function len(a) {
  return hypot(a.x, a.y);
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
