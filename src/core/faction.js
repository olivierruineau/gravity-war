// Factions (ADR 0005 §1) : résumé par faction, recalculé à chaque pas depuis les planètes.
import { FACTION_COUNT } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';
import { EVT, pushEvent } from './events.js';

/** `OVER` : fin d'une partie d'observation (bots seuls, 9.8) : il ne reste qu'une faction en jeu. */
export const OUTCOME = { PLAYING: 0, VICTORY: 1, DEFEAT: 2, OVER: 3 };

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
  let changed = false;
  for (let f = 0; f < factions.length; f++) {
    const fac = factions[f];
    if (fac.eliminated || fac.planetCount > 0 || hasLiveShip(world.ships, f)) continue;
    fac.eliminated = true;
    changed = true;
    pushEvent(world.events, EVT.ELIMINATED, 0, 0, f);
  }
  if (changed) updateOutcome(world);
}

function hasLiveShip(ships, faction) {
  for (let i = 0; i < ships.length; i++)
    if (ships[i].faction === faction && ships[i].alive) return true;
  return false;
}

/**
 * Défaite si la faction 0 (en jeu au départ) est éliminée, victoire si tous les adversaires en jeu au départ
 * le sont. Sans faction 0 en jeu (bot contre bot), l'issue reste PLAYING. En mode observation (`world.spectator`),
 * la partie finit (`OVER`) quand il ne reste qu'une faction en jeu.
 */
function updateOutcome(world) {
  const { factions } = world;
  let outcome = OUTCOME.PLAYING;
  if (world.spectator) {
    let left = 0;
    for (let f = 0; f < factions.length; f++)
      if (world.inGame[f] && !factions[f].eliminated) left++;
    if (left <= 1) outcome = OUTCOME.OVER;
  } else if (world.inGame[0]) {
    if (factions[0].eliminated) outcome = OUTCOME.DEFEAT;
    else {
      let rivalLeft = false;
      for (let f = 1; f < factions.length; f++)
        if (world.inGame[f] && !factions[f].eliminated) rivalLeft = true;
      if (!rivalLeft) outcome = OUTCOME.VICTORY;
    }
  }
  if (world.outcome !== OUTCOME.PLAYING || outcome === OUTCOME.PLAYING) return;
  world.outcome = outcome;
  pushEvent(world.events, EVT.GAME_OVER, 0, 0, outcome);
}
