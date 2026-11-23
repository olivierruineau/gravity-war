// Collisions des projectiles (les contacts vaisseau/planète vivent dans landing.js).
import { SHIP_COLLISION_RADIUS } from '../config.js';
import { EVT, pushEvent } from './events.js';
import { damageShip } from './lifecycle.js';
import { damageBuilding } from './building.js';

/** Un projectile qui entre dans une planète est absorbé (événement BULLET_HIT au point d'impact). */
export function collideProjectilesPlanets(world) {
  const pool = world.projectiles;
  const planets = world.planets;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;
    for (let j = 0; j < planets.length; j++) {
      const planet = planets[j];
      const dx = p.pos.x - planet.pos.x;
      const dy = p.pos.y - planet.pos.y;
      if (dx * dx + dy * dy < planet.radius * planet.radius) {
        p.active = false;
        pushEvent(world.events, EVT.BULLET_HIT, p.pos.x, p.pos.y, j, i);
        if (planet.owner >= 0 && planet.owner !== p.owner) {
          damageBuilding(world, j, p.damage, p.pos.x, p.pos.y);
        }
        break;
      }
    }
  }
}

/**
 * Un projectile qui touche un vaisseau vivant d'une AUTRE faction lui inflige ses dégâts (via damageShip)
 * et disparaît ; pas de tir ami. SHIP_HIT est émis avant l'éventuel EXPLOSION.
 */
export function collideProjectilesShips(world) {
  const pool = world.projectiles;
  const ships = world.ships;
  const r2 = SHIP_COLLISION_RADIUS * SHIP_COLLISION_RADIUS;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;
    for (let j = 0; j < ships.length; j++) {
      const ship = ships[j];
      if (!ship.alive || ship.faction === p.owner) continue;
      const dx = p.pos.x - ship.pos.x;
      const dy = p.pos.y - ship.pos.y;
      if (dx * dx + dy * dy >= r2) continue;
      p.active = false;
      pushEvent(world.events, EVT.SHIP_HIT, p.pos.x, p.pos.y, j, p.damage);
      damageShip(world, j, p.damage, ship.pos.x, ship.pos.y);
      break;
    }
  }
}
