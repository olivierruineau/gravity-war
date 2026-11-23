// Guidage des missiles : cible réacquise à chaque pas (aucun état), virage borné (ADR 0005 §5).
import { MISSILE_SEEK_ANGLE, MISSILE_SEEK_RANGE, MISSILE_TURN_RATE } from '../config.js';
import { wrapAngle } from './math.js';
import { KIND } from './projectile.js';

/** Fait tourner chaque missile actif vers la cible la plus proche de son cône ; norme de vitesse conservée. */
export function steerMissiles(world, dt) {
  const pool = world.projectiles;
  const ships = world.ships;
  const maxTurn = MISSILE_TURN_RATE * dt;
  const rangeSq = MISSILE_SEEK_RANGE * MISSILE_SEEK_RANGE;
  for (let i = 0; i < pool.length; i++) {
    const m = pool[i];
    if (!m.active || m.kind !== KIND.MISSILE) continue;
    const heading = Math.atan2(m.vel.y, m.vel.x);
    let bestSq = rangeSq;
    let bestDiff = 0;
    let found = false;
    for (let s = 0; s < ships.length; s++) {
      const ship = ships[s];
      if (!ship.alive || ship.faction === m.owner) continue;
      const dx = ship.pos.x - m.pos.x;
      const dy = ship.pos.y - m.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > bestSq) continue;
      const diff = wrapAngle(Math.atan2(dy, dx) - heading);
      if (Math.abs(diff) > MISSILE_SEEK_ANGLE) continue;
      bestSq = distSq;
      bestDiff = diff;
      found = true;
    }
    if (!found) continue;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, bestDiff));
    const speed = Math.hypot(m.vel.x, m.vel.y);
    m.vel.x = Math.cos(heading + turn) * speed;
    m.vel.y = Math.sin(heading + turn) * speed;
  }
}
