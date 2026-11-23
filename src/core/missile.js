// Guidage des missiles : cible réacquise à chaque pas (aucun état), virage borné (ADR 0005 §5).
import { MISSILE_SEEK_ANGLE, MISSILE_SEEK_RANGE, MISSILE_TURN_RATE } from '../config.js';
import { hypot, wrapAngle } from './math.js';
import { KIND } from './projectile.js';

/**
 * Index du vaisseau vivant d'une autre faction le plus proche dans le cône de recherche d'un missile
 * (position x, y, cap `heading`, tiré par `faction`), ou −1. Partagé avec l'IA (ADR 0006).
 */
export function findMissileTarget(ships, x, y, heading, faction) {
  let bestSq = MISSILE_SEEK_RANGE * MISSILE_SEEK_RANGE;
  let best = -1;
  for (let s = 0; s < ships.length; s++) {
    const ship = ships[s];
    if (!ship.alive || ship.faction === faction) continue;
    const dx = ship.pos.x - x;
    const dy = ship.pos.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestSq) continue;
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - heading)) > MISSILE_SEEK_ANGLE) continue;
    bestSq = distSq;
    best = s;
  }
  return best;
}

/** Fait tourner chaque missile actif vers la cible la plus proche de son cône ; norme de vitesse conservée. */
export function steerMissiles(world, dt) {
  const pool = world.projectiles;
  const ships = world.ships;
  const maxTurn = MISSILE_TURN_RATE * dt;
  for (let i = 0; i < pool.length; i++) {
    const m = pool[i];
    if (!m.active || m.kind !== KIND.MISSILE) continue;
    const heading = Math.atan2(m.vel.y, m.vel.x);
    const target = findMissileTarget(ships, m.pos.x, m.pos.y, heading, m.owner);
    if (target < 0) continue;
    const ship = ships[target];
    const diff = wrapAngle(Math.atan2(ship.pos.y - m.pos.y, ship.pos.x - m.pos.x) - heading);
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const speed = hypot(m.vel.x, m.vel.y);
    m.vel.x = Math.cos(heading + turn) * speed;
    m.vel.y = Math.sin(heading + turn) * speed;
  }
}
