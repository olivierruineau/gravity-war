// Projectiles (balles, missiles) : pool préalloué, aucune allocation en cours de partie.
// Spawn = premier slot inactif ; pool plein = tir ignoré (ADR 0002 §1).
import { applyGravity } from './gravity.js';
import { integrate } from './ship.js';

/** Types de projectile (entiers : le monde reste JSON pur). */
export const KIND = { BULLET: 0, MISSILE: 1 };

export function createProjectiles(capacity) {
  const pool = new Array(capacity);
  for (let i = 0; i < capacity; i++) {
    pool[i] = {
      active: false,
      kind: KIND.BULLET,
      owner: 0, // faction (= index du vaisseau) qui a tiré : pas de tir ami
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      life: 0, // secondes restantes
      damage: 0,
    };
  }
  return pool;
}

/** Active le premier slot libre ; retourne son index, ou −1 si le pool est plein. */
export function spawnProjectile(pool, kind, owner, x, y, vx, vy, life, damage) {
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p.active) continue;
    p.active = true;
    p.kind = kind;
    p.owner = owner;
    p.pos.x = x;
    p.pos.y = y;
    p.vel.x = vx;
    p.vel.y = vy;
    p.life = life;
    p.damage = damage;
    return i;
  }
  return -1;
}

/** Avance les projectiles actifs (gravité, déplacement, durée de vie) ; hors carte = désactivé. */
export function updateProjectiles(world, dt) {
  const pool = world.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;
    if (p.kind !== KIND.MISSILE) applyGravity(p, world.planets, dt); // les missiles sont propulsés
    integrate(p, dt);
    p.life -= dt;
    if (
      p.life <= 0 ||
      p.pos.x < 0 ||
      p.pos.y < 0 ||
      p.pos.x > world.width ||
      p.pos.y > world.height
    ) {
      p.active = false;
    }
  }
}
