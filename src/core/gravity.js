import { GRAVITY_DOMINANCE_POWER } from '../config.js';

// Gravité des planètes (ADR 0003, chevauchements : ADR 0004) :
//   a(d) = mu · (1 / max(d, r)² − 1 / R²)  si d < R, 0 sinon, dirigée vers le centre.
// Le terme −mu/R² annule la force continûment en R : l'espace entre les champs est strictement inertiel.

const scratch = { x: 0, y: 0 };

/**
 * Écrit dans `out` l'accélération gravitationnelle au point `pos` (ADR 0003 + 0004) :
 *  - dans une planète : sa gravité seule (bornée à g0) ; au centre exact : (0, 0) ;
 *  - dans une seule zone : exactement la loi de l'ADR 0003 ;
 *  - dans plusieurs zones : moyenne des accélérations pondérée par u = (1 − d/R) / (d − r)^p, de sorte que
 *    la surface la plus proche domine en douceur (le cercle de portée reste la limite d'influence) ;
 *  - hors de toute zone : (0, 0).
 */
export function gravityAt(out, pos, planets) {
  let zones = 0;
  let sumX = 0; // somme simple des accélérations (cas d'une seule zone)
  let sumY = 0;
  let sumU = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const dx = p.pos.x - pos.x;
    const dy = p.pos.y - pos.y;
    const d2 = dx * dx + dy * dy;
    const range2 = p.range * p.range;
    if (d2 === 0) {
      out.x = 0; // centre exact : direction indéfinie
      out.y = 0;
      return out;
    }
    if (d2 >= range2) continue;
    const d = Math.sqrt(d2);
    const a = p.mu * (1 / (Math.max(d, p.radius) * Math.max(d, p.radius)) - 1 / range2);
    const ax = (a * dx) / d;
    const ay = (a * dy) / d;
    if (d <= p.radius) {
      out.x = ax; // dans la planète : elle seule attire (bornée à g0)
      out.y = ay;
      return out;
    }
    zones++;
    sumX += ax;
    sumY += ay;
    const u = (1 - d / p.range) / (d - p.radius) ** GRAVITY_DOMINANCE_POWER;
    sumU += u;
    weightedX += u * ax;
    weightedY += u * ay;
  }
  if (zones === 1) {
    out.x = sumX;
    out.y = sumY;
  } else if (zones > 1 && sumU > 0) {
    out.x = weightedX / sumU;
    out.y = weightedY / sumU;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return out;
}

/** Ajoute la gravité à la vitesse du corps (v += a·dt, avant l'intégration de la position). */
export function applyGravity(body, planets, dt) {
  gravityAt(scratch, body.pos, planets);
  body.vel.x += scratch.x * dt;
  body.vel.y += scratch.y * dt;
}

/** Énergie potentielle par unité de masse à la distance `d` du centre (référence : 0 à la portée). */
export function potential(planet, d) {
  if (d >= planet.range) return 0;
  const dc = Math.max(d, planet.radius);
  const { mu, range } = planet;
  return -mu / dc - (mu * dc) / (range * range) + (2 * mu) / range;
}
