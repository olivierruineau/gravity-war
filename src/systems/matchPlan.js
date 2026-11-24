// Plan d'une partie (9.9), pur : carte, graine, factions et bots à partir des réglages. La scène ne fait que l'appliquer.
import { buildMap } from '../data/maps/index.js';

/**
 * @param {{ mapMode: string, botCount: number, spectator: boolean, seedParam: number | null, randomSeed: number }} o
 *   `seedParam` : graine imposée par l'adresse (carte générée) ; `randomSeed` : graine tirée par la scène sinon
 * @returns {{ seed: number, mapMode: string, map: object, bots: number[], factions: number }}
 *   `bots` : factions pilotées par l'IA (la faction 0 en fait partie en observation)
 */
export function planMatch({ mapMode, botCount, spectator, seedParam, randomSeed }) {
  const seed = seedParam ?? randomSeed;
  const mode = seedParam === null ? mapMode : 'random'; // une graine d'adresse désigne toujours une carte générée
  const factions = botCount + 1;
  const bots = Array.from({ length: botCount }, (_, i) => i + 1);
  if (spectator) bots.unshift(0);
  return { seed, mapMode: mode, map: buildMap(mode, seed, factions), bots, factions };
}
