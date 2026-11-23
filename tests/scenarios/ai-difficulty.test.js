// 9.2 : les niveaux de difficulté sont ordonnés. Même carte, mêmes graines, deux bots de niveaux différents
// (le joueur reste inactif) : sur plusieurs parties, le niveau inférieur finit avec moins de planètes.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { arena } from '../../src/data/maps/arena.js';
import { createWorld, step } from '../../src/core/world.js';

const SEEDS = [1, 2, 3, 4, 5, 6];
const STEPS = Math.round(240 / FIXED_DT);

/** Planètes cumulées des deux bots (bot 1 au niveau `weak`, bot 2 au niveau `strong`) sur toutes les graines. */
function duel(weak, strong) {
  const planets = [0, 0];
  for (const seed of SEEDS) {
    const world = createWorld(arena, seed, { eventCapacity: 256, bots: [1, 2] });
    world.ai[0].level = weak;
    world.ai[1].level = strong;
    for (let i = 0; i < STEPS; i++) step(world, FIXED_DT);
    planets[0] += world.planets.filter((p) => p.owner === 1).length;
    planets[1] += world.planets.filter((p) => p.owner === 2).length;
  }
  return planets;
}

describe('IA : niveaux de difficulté', () => {
  it('facile perd contre normal', () => {
    const [easy, normal] = duel('easy', 'normal');
    expect(easy).toBeLessThan(normal);
  }, 120000);

  it('normal perd contre difficile', () => {
    const [normal, hard] = duel('normal', 'hard');
    expect(normal).toBeLessThan(hard);
  }, 120000);
});
