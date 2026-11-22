// Orchestrateur de la simulation : seul module qui connaît tous les autres (ADR 0002).
// `world` est un objet de données pur (JSON-sérialisable), sans fonctions ni références croisées.
import { BOUNDS_RESTITUTION, SHIP_SIZE } from '../config.js';
import { applyBounds } from './bounds.js';
import { createEvents } from './events.js';
import { applyGravity } from './gravity.js';
import { collideShipPlanets, updateLanded } from './landing.js';
import { createPlanet } from './planet.js';
import { createRng } from './rng.js';
import { applyIntent, createShip, integrate } from './ship.js';

/**
 * @param {{ width: number, height: number, planets?: { x: number, y: number, radius: number, gravity?: number }[], spawns?: { x: number, y: number, angle?: number }[] }} map
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
    planets: (map.planets ?? []).map(createPlanet),
    projectiles: [],
    events: createEvents(eventCapacity),
  };
}

/** Avance la simulation d'un pas. Ordre des étapes : ADR 0002 §5, précisé par l'ADR 0003 §4. */
export function step(world, dt) {
  // (2) intentions → rotation/poussée, (3) gravité puis intégration, (4) bornes de carte, (5) contact avec les planètes.
  for (let i = 0; i < world.ships.length; i++) {
    const ship = world.ships[i];
    if (!ship.alive) continue;
    applyIntent(ship, dt);
    // (2b) Posé : reste figé hors gravité/intégration/collisions, ou décolle si la poussée pointe vers l'extérieur.
    if (ship.landedOn >= 0 && updateLanded(ship, world.planets, dt)) continue;
    applyGravity(ship, world.planets, dt);
    integrate(ship, dt);
    applyBounds(ship, world.width, world.height, SHIP_SIZE, BOUNDS_RESTITUTION);
    collideShipPlanets(world, i);
  }
  world.tick++;
}
