// 9.9 : les bots jouent sur des cartes générées (la carte « Triade » est celle sur laquelle l'IA a été réglée) :
// ils décollent, capturent, rien ne diverge, avec 1 bot comme avec 2.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { createWorld, step } from '../../src/core/world.js';
import { buildMap } from '../../src/data/maps/index.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STEPS = Math.round(120 / FIXED_DT);

function play(seed, botCount) {
  const factions = botCount + 1;
  const bots = Array.from({ length: botCount }, (_, i) => i + 1);
  const world = createWorld(buildMap('random', seed, factions), seed, { eventCapacity: 256, bots });
  const neutral = world.planets.filter((p) => p.owner < 0).length;
  const out = { seed, nan: false, flew: bots.map(() => false) };
  for (let i = 0; i < STEPS; i++) {
    step(world, FIXED_DT);
    for (const ship of world.ships) {
      if (!Number.isFinite(ship.pos.x + ship.pos.y + ship.vel.x + ship.vel.y + ship.hp))
        out.nan = true;
      if (ship.faction > 0 && ship.landedOn < 0) out.flew[ship.faction - 1] = true;
    }
  }
  out.captured = neutral - world.planets.filter((p) => p.owner < 0).length;
  return out;
}

describe.each([2, 1])('IA sur cartes générées (%i bot(s))', (botCount) => {
  const results = SEEDS.map((seed) => play(seed, botCount));

  it('aucun NaN', () => {
    expect(results.filter((r) => r.nan).map((r) => r.seed)).toEqual([]);
  });

  it('les bots décollent', () => {
    expect(results.filter((r) => !r.flew.every(Boolean)).map((r) => r.seed)).toEqual([]);
  });

  it('les bots capturent des planètes dans la plupart des parties', () => {
    const active = results.filter((r) => r.captured > 0).length;
    expect(active).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.9));
  });
});
