// Choix de la carte d'une partie (9.9) : « Triade » (fixe, équilibrée à la main) ou une carte générée depuis la graine.
import { generateMap } from './generate.js';
import { triad } from './triad.js';

export const MAP_MODES = ['random', 'triad'];

/**
 * Ne garde que les `count` premières factions (2 ou 3) : la base d'une faction retirée devient une planète neutre
 * sans bâtiment, son point de départ disparaît. Une faction sans planète est « hors jeu » (ADR 0005).
 */
export function limitFactions(map, count) {
  return {
    ...map,
    planets: map.planets.map((p) => {
      if (p.owner === undefined || p.owner < count) return p;
      const neutral = { ...p };
      delete neutral.owner;
      delete neutral.built;
      return neutral;
    }),
    spawns: map.spawns.slice(0, count),
  };
}

/** Carte de la partie : `mode` = `random` (générée depuis `seed`) ou `triad` ; `factions` = 2 ou 3. */
export function buildMap(mode, seed, factions) {
  return limitFactions(mode === 'triad' ? triad : generateMap(seed), factions);
}
