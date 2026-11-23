// 9.2 : les niveaux de difficulté sont ordonnés. Même carte, mêmes graines, deux bots de niveaux différents
// (le joueur reste inactif), côtés échangés pour annuler l'avantage de position : sur ces parties, le niveau inférieur
// marque moins (planètes finales + 2 par vaisseau adverse détruit).
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { arena } from '../../src/data/maps/arena.js';
import { createWorld, step } from '../../src/core/world.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STEPS = Math.round(240 / FIXED_DT);
const KILL_WEIGHT = 2;

/** Score cumulé { weak, strong } sur toutes les graines, chaque niveau jouant les deux factions. */
function duel(weakLevel, strongLevel) {
  const score = { weak: 0, strong: 0 };
  for (const swap of [false, true]) {
    const weakFaction = swap ? 2 : 1;
    const strongFaction = swap ? 1 : 2;
    for (const seed of SEEDS) {
      const world = createWorld(arena, seed, { eventCapacity: 256, bots: [1, 2] });
      world.ai.find((b) => b.faction === weakFaction).level = weakLevel;
      world.ai.find((b) => b.faction === strongFaction).level = strongLevel;
      const alive = [true, true, true];
      for (let i = 0; i < STEPS; i++) {
        step(world, FIXED_DT);
        for (const ship of world.ships) {
          if (alive[ship.faction] && !ship.alive) {
            if (ship.faction === weakFaction) score.strong += KILL_WEIGHT;
            if (ship.faction === strongFaction) score.weak += KILL_WEIGHT;
          }
          alive[ship.faction] = ship.alive;
        }
      }
      score.weak += world.planets.filter((p) => p.owner === weakFaction).length;
      score.strong += world.planets.filter((p) => p.owner === strongFaction).length;
    }
  }
  return score;
}

describe('IA : niveaux de difficulté', () => {
  it('facile perd contre normal', () => {
    const { weak, strong } = duel('easy', 'normal');
    expect(weak).toBeLessThan(strong);
  }, 180000);

  it('normal perd contre difficile', () => {
    const { weak, strong } = duel('normal', 'hard');
    expect(weak).toBeLessThan(strong);
  }, 180000);
});
