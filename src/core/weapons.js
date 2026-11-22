// Armes d'un vaisseau : le tir principal (touche maintenue, cadence gérée ici, jamais par l'input).
import {
  BULLET_DAMAGE,
  BULLET_LIFETIME,
  BULLET_SPEED,
  FIRE_COOLDOWN,
  SHIP_SIZE,
} from '../config.js';
import { EVT, pushEvent } from './events.js';
import { KIND, spawnProjectile } from './projectile.js';

/** À appeler pour un vaisseau vivant, une fois par pas : décompte le cooldown et tire si demandé. */
export function updateWeapons(world, shipIndex, dt) {
  const ship = world.ships[shipIndex];
  if (ship.fireCooldown > 0) ship.fireCooldown -= dt;
  if (!ship.intent.fire || ship.fireCooldown > 0) return;
  ship.fireCooldown = FIRE_COOLDOWN;
  const dirX = Math.cos(ship.angle);
  const dirY = Math.sin(ship.angle);
  const x = ship.pos.x + dirX * SHIP_SIZE; // part de la pointe du nez
  const y = ship.pos.y + dirY * SHIP_SIZE;
  const index = spawnProjectile(
    world.projectiles,
    KIND.BULLET,
    ship.faction,
    x,
    y,
    ship.vel.x + dirX * BULLET_SPEED,
    ship.vel.y + dirY * BULLET_SPEED,
    BULLET_LIFETIME,
    BULLET_DAMAGE,
  );
  if (index >= 0) pushEvent(world.events, EVT.SHOT, x, y, shipIndex, index);
}
