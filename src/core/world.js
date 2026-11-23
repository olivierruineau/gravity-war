// Orchestrateur de la simulation : seul module qui connaît tous les autres (ADR 0002).
// `world` est un objet de données pur (JSON-sérialisable), sans fonctions ni références croisées.
import { BOUNDS_RESTITUTION, PROJECTILE_CAPACITY, SHIP_SIZE } from '../config.js';
import { updateBuildings } from './building.js';
import { updateCapture } from './capture.js';
import { collideProjectilesPlanets, collideProjectilesShips } from './collision.js';
import { applyBounds } from './bounds.js';
import { createEvents } from './events.js';
import { createFactions, OUTCOME, updateFactions } from './faction.js';
import { applyGravity } from './gravity.js';
import { collideShipPlanets, updateLanded } from './landing.js';
import { updateRespawn } from './lifecycle.js';
import { updateShield } from './shield.js';
import { createPlanet } from './planet.js';
import { createProjectiles, updateProjectiles } from './projectile.js';
import { createRng } from './rng.js';
import { updateWeapons } from './weapons.js';
import { applyIntent, createShip, integrate, respawnShip } from './ship.js';

/**
 * @param {{ width: number, height: number, planets?: { x: number, y: number, radius: number, gravity?: number, owner?: number, built?: number }[], spawns?: { x?: number, y?: number, angle?: number, planet?: number }[] }} map
 *   carte injectée (permet des mini-cartes en test) ; `spawns[i]` = point de départ du vaisseau de la faction i
 * @param {number} seed                            graine de l'aléa de simulation
 * @param {{ eventCapacity: number }} options
 */
export function createWorld(map, seed, { eventCapacity }) {
  const planets = (map.planets ?? []).map(createPlanet);
  const world = {
    tick: 0,
    width: map.width,
    height: map.height,
    rng: createRng(seed),
    ships: [],
    planets,
    projectiles: createProjectiles(PROJECTILE_CAPACITY),
    events: createEvents(eventCapacity),
    factions: createFactions(planets),
    outcome: OUTCOME.PLAYING,
  };
  // spawns[i] = point de départ de la faction i : soit une position libre { x, y, angle? }, soit
  // { planet: index } pour démarrer posé sur sa planète de base (comme après un respawn).
  (map.spawns ?? []).forEach((spawn, i) => {
    const ship = createShip(i, spawn.x ?? 0, spawn.y ?? 0, spawn.angle);
    if (spawn.planet !== undefined) respawnShip(ship, spawn.planet, planets[spawn.planet]);
    world.ships.push(ship);
  });
  updateFactions(world);
  return world;
}

/** Avance la simulation d'un pas. Ordre des étapes : ADR 0002 §5, précisé par l'ADR 0003 §4. */
export function step(world, dt) {
  // (2) intentions → rotation/poussée, (3) gravité puis intégration, (4) bornes de carte, (5) contact avec les planètes.
  for (let i = 0; i < world.ships.length; i++) {
    const ship = world.ships[i];
    if (!ship.alive) {
      updateRespawn(world, i, dt);
      continue;
    }
    applyIntent(ship, dt);
    updateWeapons(world, i, dt);
    // (2b) Posé : reste figé hors gravité/intégration/collisions, ou décolle si la poussée pointe vers l'extérieur.
    if (ship.landedOn >= 0 && updateLanded(ship, world.planets, dt)) continue;
    applyGravity(ship, world.planets, dt);
    integrate(ship, dt);
    applyBounds(ship, world.width, world.height, SHIP_SIZE, BOUNDS_RESTITUTION);
    collideShipPlanets(world, i);
  }
  updateProjectiles(world, dt);
  collideProjectilesPlanets(world);
  collideProjectilesShips(world);
  for (let i = 0; i < world.ships.length; i++) if (world.ships[i].alive) updateShield(world, i, dt);
  updateBuildings(world, dt);
  updateCapture(world, dt);
  updateFactions(world);
  world.tick++;
}
