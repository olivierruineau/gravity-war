// Orchestrateur de la simulation : seul module qui connaît tous les autres (ADR 0002).
// `world` est un objet de données pur (JSON-sérialisable), sans fonctions ni références croisées.
import { createEvents } from './events.js';
import { createRng } from './rng.js';

/**
 * @param {{ width: number, height: number }} map  carte injectée (permet des mini-cartes en test)
 * @param {number} seed                            graine de l'aléa de simulation
 * @param {{ eventCapacity: number }} options
 */
export function createWorld(map, seed, { eventCapacity }) {
  return {
    tick: 0,
    width: map.width,
    height: map.height,
    rng: createRng(seed),
    ships: [],
    planets: [],
    projectiles: [],
    events: createEvents(eventCapacity),
  };
}

/** Avance la simulation d'un pas. Ordre des étapes détaillé dans l'ADR 0002 §5. */
export function step(world, _dt) {
  world.tick++;
}
