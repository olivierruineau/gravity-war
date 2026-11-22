// Gravité des planètes (ADR 0003) :
//   a(d) = mu · (1 / max(d, r)² − 1 / R²)  si d < R, 0 sinon, dirigée vers le centre.
// Le terme −mu/R² annule la force continûment en R : l'espace entre les champs est strictement inertiel.

const scratch = { x: 0, y: 0 };

/** Écrit dans `out` l'accélération gravitationnelle totale (toutes planètes) au point `pos`. */
export function gravityAt(out, pos, planets) {
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const dx = p.pos.x - pos.x;
    const dy = p.pos.y - pos.y;
    const d2 = dx * dx + dy * dy;
    const range2 = p.range * p.range;
    if (d2 === 0 || d2 >= range2) continue; // centre exact : direction indéfinie, on saute
    const d = Math.sqrt(d2);
    const dClamped = Math.max(d, p.radius); // la force est bornée à g0 sous la surface
    const a = p.mu * (1 / (dClamped * dClamped) - 1 / range2);
    ax += (a * dx) / d;
    ay += (a * dy) / d;
  }
  out.x = ax;
  out.y = ay;
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
