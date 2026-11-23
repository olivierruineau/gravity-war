// Mode observation (9.8) : les trois factions sont des bots ; la caméra suit l'un d'eux, ← → (ou ◄ ► au doigt)
// passent de l'un à l'autre. Le pilotage du joueur est entièrement masqué. Modèle pur, sans Phaser.
import { FACTION_COUNT } from '../config.js';

/**
 * Faction suivante (`dir` = 1) ou précédente (−1) à suivre, en sautant les factions éliminées ou hors jeu.
 * Retourne `current` si aucune autre n'est disponible.
 */
export function nextFollowed(world, current, dir) {
  for (let step = 1; step < FACTION_COUNT; step++) {
    const f = (current + (dir < 0 ? -step : step) + FACTION_COUNT * 2) % FACTION_COUNT;
    if (world.inGame[f] && !world.factions[f].eliminated) return f;
  }
  return current;
}

/** Libellé de la faction suivie, pour la bannière : « BOT VERT », « BOT ROUGE », « BOT BLEU ». */
export const FACTION_NAMES = ['VERT', 'ROUGE', 'BLEU'];
export const followedLabel = (faction) => `BOT ${FACTION_NAMES[faction]}`;
