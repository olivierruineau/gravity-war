// Prédiction balistique (ADR 0006 §5) : même intégrateur que `step` (gravité puis position, Euler semi-implicite),
// donc bit à bit identique au vol libre réel pour un même pas. Ne gère ni poussée, ni murs, ni missiles (guidés).
import { gravityAt } from './gravity.js';
import { hypot } from './math.js';

const gravity = { x: 0, y: 0 };
const at = { x: 0, y: 0 }; // position courante, au format attendu par gravityAt

/**
 * Simule un vol sans poussée jusqu'au premier contact (distance au centre < rayon + `contactMargin`) ou jusqu'à
 * `horizon` secondes (arrondi au pas `dt` le plus proche). Aucune allocation : le résultat est écrit dans `out`,
 * fourni et réutilisé par l'appelant.
 * @param {{ hit: number, t: number, x: number, y: number, vx: number, vy: number }} out
 *   hit = index de la planète touchée (−1 à l'horizon) ; t = temps écoulé ; (x, y, vx, vy) = état à ce moment
 * @param {{ x: number, y: number }} pos
 * @param {{ x: number, y: number }} vel
 * @param {{ pos: { x: number, y: number }, radius: number }[]} planets
 * @returns `out`
 */
export function predictPath(out, pos, vel, planets, contactMargin, horizon, dt) {
  let x = pos.x;
  let y = pos.y;
  let vx = vel.x;
  let vy = vel.y;
  const steps = Math.round(horizon / dt);
  let hit = contactAt(planets, x, y, contactMargin);
  let n = 0;
  while (hit < 0 && n < steps) {
    at.x = x;
    at.y = y;
    gravityAt(gravity, at, planets);
    vx += gravity.x * dt;
    vy += gravity.y * dt;
    x += vx * dt;
    y += vy * dt;
    n++;
    hit = contactAt(planets, x, y, contactMargin);
  }
  out.hit = hit;
  out.t = n * dt;
  out.x = x;
  out.y = y;
  out.vx = vx;
  out.vy = vy;
  return out;
}

/** Index de la première planète dont le disque de contact contient (x, y), sinon −1. */
function contactAt(planets, x, y, margin) {
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const reach = p.radius + margin;
    const dx = x - p.pos.x;
    const dy = y - p.pos.y;
    if (hypot(dx, dy) < reach) return i;
  }
  return -1;
}
