import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FACTION_COUNT } from '../../src/config.js';
import { arena } from '../../src/data/maps/arena.js';
import { createWorld } from '../../src/core/world.js';

// Validation de carte (ADR 0005 §1) : `createWorld` rejette une carte incohérente avec les FACTION_COUNT factions.
const OPTIONS = { eventCapacity: EVENT_CAPACITY };
const PLANET = { x: 500, y: 300, radius: 40 };

function build(map) {
  return createWorld({ width: 2400, height: 1350, ...map }, 1, OPTIONS);
}

/** n spawns en vol libre, espacés (la validité ne dépend pas de leur position). */
function spawns(n) {
  return Array.from({ length: n }, (_, i) => ({ x: 100 + i * 100, y: 100 }));
}

describe('createWorld : validation des spawns', () => {
  it('FACTION_COUNT spawns (le maximum) : carte valide', () => {
    expect(() => build({ planets: [], spawns: spawns(FACTION_COUNT) })).not.toThrow();
  });

  it('FACTION_COUNT + 1 spawns : Error', () => {
    expect(() => build({ planets: [], spawns: spawns(FACTION_COUNT + 1) })).toThrow(Error);
  });

  it('le message nomme le problème (spawns) et les deux nombres', () => {
    expect(() => build({ planets: [], spawns: spawns(FACTION_COUNT + 2) })).toThrow(
      new RegExp(`${FACTION_COUNT + 2} spawns.*${FACTION_COUNT} factions`),
    );
  });

  it('plus de spawns que de factions : Error aussi avec des spawns { planet }', () => {
    const many = Array.from({ length: FACTION_COUNT + 1 }, () => ({ planet: 0 }));
    expect(() => build({ planets: [{ ...PLANET, owner: 0 }], spawns: many })).toThrow(Error);
  });

  it('aucun spawn (ou `spawns` absent) : valide, aucun vaisseau', () => {
    expect(build({ planets: [PLANET], spawns: [] }).ships).toHaveLength(0);
    expect(build({ planets: [PLANET] }).ships).toHaveLength(0);
  });
});

describe('createWorld : validation des propriétaires de planète', () => {
  it('owner = FACTION_COUNT : Error', () => {
    expect(() => build({ planets: [{ ...PLANET, owner: FACTION_COUNT }] })).toThrow(Error);
  });

  it('owner > FACTION_COUNT : Error', () => {
    expect(() => build({ planets: [{ ...PLANET, owner: FACTION_COUNT + 5 }] })).toThrow(Error);
  });

  it('le message nomme le problème (owner) et la valeur fautive', () => {
    expect(() => build({ planets: [{ ...PLANET, owner: FACTION_COUNT }] })).toThrow(
      new RegExp(`owner ${FACTION_COUNT}`),
    );
  });

  it('une seule planète invalide parmi des valides suffit à lever', () => {
    const planets = [
      { ...PLANET, owner: 0 },
      { ...PLANET, x: 900, owner: 1 },
      { ...PLANET, x: 1300, owner: FACTION_COUNT },
    ];
    expect(() => build({ planets })).toThrow(Error);
  });

  it.each([-1, 0, FACTION_COUNT - 1])(
    'owner = %i (neutre ou faction valide) : carte valide',
    (owner) => {
      expect(() => build({ planets: [{ ...PLANET, owner }] })).not.toThrow();
    },
  );

  it('owner absent (neutre par défaut) : valide', () => {
    expect(build({ planets: [PLANET] }).planets[0].owner).toBe(-1);
  });
});

describe('createWorld : cartes valides', () => {
  it('une carte complète (3 bases, 3 spawns) est acceptée et crée 3 vaisseaux', () => {
    const world = build({
      planets: [
        { x: 300, y: 300, radius: 40, owner: 0 },
        { x: 900, y: 300, radius: 40, owner: 1 },
        { x: 1500, y: 300, radius: 40, owner: 2 },
      ],
      spawns: [{ planet: 0 }, { planet: 1 }, { planet: 2 }],
    });
    expect(world.ships).toHaveLength(3);
    expect(world.inGame).toEqual([true, true, true]);
  });

  it('la carte arena livrée est valide', () => {
    expect(() => createWorld(arena, 1, OPTIONS)).not.toThrow();
  });
});
