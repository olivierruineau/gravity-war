// Collisions des projectiles (les contacts vaisseau/planète vivent dans landing.js).
import { EVT, pushEvent } from './events.js';

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
        break;
      }
    }
  }
}
