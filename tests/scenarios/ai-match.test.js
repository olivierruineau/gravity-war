// 5.7 : partie vivante sur la vraie carte `arena` livrée (3 spawns, bots 1 et 2, joueur 0 inactif).
// Invariants : les bots jouent (décollent, capturent), ne se suicident pas, rien ne diverge.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { arena } from '../../src/data/maps/arena.js';
import { createWorld, step } from '../../src/core/world.js';

const SEEDS = [1, 2, 3, 4, 5];
const DURATION = 180; // s
const STEPS = Math.round(DURATION / FIXED_DT);

function play(seed) {
  const world = createWorld(arena, seed, { eventCapacity: 256, bots: [1, 2] });
  const out = { seed, flew: [false, false, false], captured: 0, nan: false, deaths: [0, 0, 0] };
  const wasAlive = [true, true, true];
  const neutralAtStart = world.planets.filter((p) => p.owner < 0).length;
  for (let i = 0; i < STEPS; i++) {
    step(world, FIXED_DT);
    for (const ship of world.ships) {
      if (ship.landedOn < 0 && ship.alive) out.flew[ship.faction] = true;
      if (wasAlive[ship.faction] && !ship.alive) out.deaths[ship.faction]++;
      wasAlive[ship.faction] = ship.alive;
      if (!Number.isFinite(ship.pos.x + ship.pos.y + ship.vel.x + ship.vel.y + ship.hp))
        out.nan = true;
    }
  }
  out.captured = neutralAtStart - world.planets.filter((p) => p.owner < 0).length;
  out.owners = world.planets.map((p) => p.owner);
  return out;
}

describe(`IA : partie vivante sur arena (${DURATION} s, 2 bots)`, () => {
  const results = SEEDS.map(play);

  it('aucun NaN', () => {
    expect(results.filter((r) => r.nan).map((r) => r.seed)).toEqual([]);
  });

  it('les deux bots décollent et le joueur inactif reste posé', () => {
    for (const r of results) {
      expect(r.flew[1], `seed ${r.seed} bot 1`).toBe(true);
      expect(r.flew[2], `seed ${r.seed} bot 2`).toBe(true);
      expect(r.flew[0], `seed ${r.seed} joueur`).toBe(false);
    }
  });

  it('au moins une planète neutre est capturée dans chaque partie', () => {
    expect(results.filter((r) => r.captured < 1).map((r) => r.seed)).toEqual([]);
  });

  it('pas de suicide en série : au plus 3 morts par bot (le joueur inactif, attaqué à sa base, est exclu)', () => {
    expect(results.filter((r) => r.deaths.slice(1).some((d) => d > 3)).map((r) => r.seed)).toEqual(
      [],
    );
  });
});
