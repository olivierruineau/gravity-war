// Bâtiments des planètes (ADR 0005 §3) : développement automatique, un chantier à la fois.
import { BUILDINGS } from '../data/buildings.js';
import { EVT, pushEvent } from './events.js';

/** Vrai si un slot tourelle est construit (bloque la capture, ADR 0005 §2). */
export function hasDefenses(planet) {
  for (let s = 0; s < BUILDINGS.length; s++) {
    if (BUILDINGS[s].turret !== undefined && planet.buildings[s].built) return true;
  }
  return false;
}

/** Remet tous les slots à zéro (capture, SPEC §5.2). */
export function resetBuildings(planet) {
  for (let s = 0; s < planet.buildings.length; s++) {
    const slot = planet.buildings[s];
    slot.built = false;
    slot.hp = 0;
    slot.cooldown = 0;
  }
  planet.buildProgress = 0;
}

/** Fait avancer le chantier (premier slot non construit) des planètes possédées. */
export function updateBuildings(world, dt) {
  const { planets, events } = world;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (p.owner < 0) continue;
    let s = 0;
    while (s < BUILDINGS.length && p.buildings[s].built) s++;
    if (s === BUILDINGS.length) continue;
    p.buildProgress += dt;
    if (p.buildProgress < BUILDINGS[s].buildTime) continue;
    const slot = p.buildings[s];
    slot.built = true;
    slot.hp = BUILDINGS[s].turret !== undefined ? BUILDINGS[s].turret.hp : 0;
    slot.cooldown = 0;
    p.buildProgress = 0;
    pushEvent(events, EVT.BUILT, p.pos.x, p.pos.y, i, s);
  }
}
