// Factions (ADR 0005 §1) : résumé par faction, recalculé à chaque pas depuis les planètes.
import { FACTION_COUNT } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';

export const OUTCOME = { PLAYING: 0, VICTORY: 1, DEFEAT: 2 };

/** `eliminated` vaut vrai dès le départ pour une faction sans planète : « hors jeu », sans événement. */
export function createFactions(planets) {
  const factions = [];
  for (let f = 0; f < FACTION_COUNT; f++) {
    let planetCount = 0;
    for (let i = 0; i < planets.length; i++) if (planets[i].owner === f) planetCount++;
    factions.push({
      planetCount,
      hasMissiles: false,
      hasShield: false,
      eliminated: planetCount === 0,
    });
  }
  return factions;
}

/** Recalcule planetCount, hasMissiles et hasShield. Aucune allocation. */
export function updateFactions(world) {
  const { factions, planets } = world;
  for (let f = 0; f < factions.length; f++) {
    const fac = factions[f];
    fac.planetCount = 0;
    fac.hasMissiles = false;
    fac.hasShield = false;
  }
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const fac = factions[p.owner];
    if (fac === undefined) continue; // neutre (−1)
    fac.planetCount++;
    for (let s = 0; s < p.buildings.length; s++) {
      if (!p.buildings[s].built) continue;
      const grants = BUILDINGS[s].grants;
      if (grants === 'missiles') fac.hasMissiles = true;
      else if (grants === 'shield') fac.hasShield = true;
    }
  }
}
