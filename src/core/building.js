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

/** Vrai si une usine à missiles est construite (débloque le tir et le réarmement de missiles). */
export function hasMissileFactory(planet) {
  for (let s = 0; s < planet.buildings.length; s++) {
    if (planet.buildings[s].built && BUILDINGS[s].grants === 'missiles') return true;
  }
  return false;
}

/** Portée max (px, depuis la surface) des tourelles construites ; 0 sans tourelle. */
export function defenseRange(planet) {
  let range = 0;
  for (let s = 0; s < BUILDINGS.length; s++) {
    if (BUILDINGS[s].turret !== undefined && planet.buildings[s].built)
      range = Math.max(range, BUILDINGS[s].turret.range);
  }
  return range;
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

/**
 * Inflige `damage` à un seul slot construit : la première tourelle, sinon le premier bâtiment (ordre du catalogue).
 * L'excédent est perdu ; à 0 PV le slot est détruit et le chantier repart de zéro (ADR 0007).
 */
export function damageBuilding(world, planetIndex, damage, x, y) {
  const planet = world.planets[planetIndex];
  planet.lastHitTick = world.tick; // même sur une planète nue : l'IA la défend (ADR 0006)
  let target = -1;
  for (let s = 0; s < BUILDINGS.length && target < 0; s++) {
    if (BUILDINGS[s].turret !== undefined && planet.buildings[s].built) target = s;
  }
  for (let s = 0; s < BUILDINGS.length && target < 0; s++) {
    if (planet.buildings[s].built) target = s;
  }
  if (target < 0) return;
  const slot = planet.buildings[target];
  slot.hp -= damage;
  if (slot.hp > 0) return;
  slot.built = false;
  slot.hp = 0;
  slot.cooldown = 0;
  planet.buildProgress = 0;
  pushEvent(world.events, EVT.BUILDING_DESTROYED, x, y, planetIndex, target);
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
    slot.hp = BUILDINGS[s].hp;
    slot.cooldown = 0;
    p.buildProgress = 0;
    pushEvent(events, EVT.BUILT, p.pos.x, p.pos.y, i, s);
  }
}
