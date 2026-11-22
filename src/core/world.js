// Orchestrateur de la simulation : seul module qui connaît tous les autres (ADR 0002).
// `world` est un objet de données pur (JSON-sérialisable), sans fonctions ni références croisées.
import { createEvents } from './events.js';
import { createRng } from './rng.js';
import { applyIntent, createShip, integrate } from './ship.js';

/**
 * @param {{ width: number, height: number, spawns?: { x: number, y: number, angle?: number }[] }} map
 *   carte injectée (permet des mini-cartes en test) ; `spawns[i]` = point de départ du vaisseau de la faction i
 * @param {number} seed                            graine de l'aléa de simulation
 * @param {{ eventCapacity: number }} options
 */
export function createWorld(map, seed, { eventCapacity }) {
  return {
    tick: 0,
    width: map.width,
    height: map.height,
    rng: createRng(seed),
    ships: (map.spawns ?? []).map((s, i) => createShip(i, s.x, s.y, s.angle)),
    planets: [],
    projectiles: [],
    events: createEvents(eventCapacity),
  };
}

/** Avance la simulation d'un pas. Ordre des étapes détaillé dans l'ADR 0002 §5. */
export function step(world, dt) {
  // (2) intentions → rotation/poussée, (3) intégration. Gravité, bornes, collisions : phases suivantes.
  for (const ship of world.ships) {
    if (!ship.alive) continue;
    applyIntent(ship, dt);
    integrate(ship, dt);
  }
  world.tick++;
}
