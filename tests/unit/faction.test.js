import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FACTION_COUNT, FIXED_DT } from '../../src/config.js';
import { createFactions, OUTCOME, updateFactions } from '../../src/core/faction.js';
import { NEUTRAL } from '../../src/core/planet.js';
import { step, createWorld } from '../../src/core/world.js';

const MAP_SIZE = { width: 2400, height: 1350 };

function worldWith(planets) {
  return createWorld({ ...MAP_SIZE, planets }, 1, { eventCapacity: EVENT_CAPACITY });
}

// Trois planètes : deux à la faction 0, une à la faction 1. La faction 2 n'a aucune planète.
const DEFS = [
  { x: 300, y: 200, radius: 40, owner: 0 },
  { x: 700, y: 200, radius: 40, owner: 0 },
  { x: 1100, y: 200, radius: 40, owner: 1 },
];

describe('createFactions : structure de départ', () => {
  const planets = [
    { owner: 0, buildings: [] },
    { owner: 1, buildings: [] },
  ];
  const factions = createFactions(planets);

  it('crée FACTION_COUNT entrées', () => {
    expect(factions).toHaveLength(FACTION_COUNT);
  });

  it('chaque entrée a les quatre champs attendus, sans capacité au départ', () => {
    expect(factions).toEqual([
      { planetCount: 1, hasMissiles: false, hasShield: false, eliminated: false },
      { planetCount: 1, hasMissiles: false, hasShield: false, eliminated: false },
      { planetCount: 0, hasMissiles: false, hasShield: false, eliminated: true },
    ]);
  });
});

describe('createWorld : résumé des factions au départ', () => {
  const world = worldWith(DEFS);

  it('world.factions contient FACTION_COUNT entrées', () => {
    expect(world.factions).toHaveLength(FACTION_COUNT);
  });

  it('une faction avec au moins une planète de départ n’est pas éliminée', () => {
    expect(world.factions[0].eliminated).toBe(false);
  });

  it('une faction sans planète de départ est hors jeu (eliminated vrai dès le départ)', () => {
    expect(world.factions[2].eliminated).toBe(true);
  });

  it('une faction sans planète a planetCount = 0', () => {
    expect(world.factions[2].planetCount).toBe(0);
  });

  it('world.outcome vaut OUTCOME.PLAYING au départ', () => {
    expect(world.outcome).toBe(OUTCOME.PLAYING);
  });
});

describe('updateFactions : planetCount', () => {
  it('compte les planètes possédées par la faction', () => {
    const world = worldWith(DEFS);
    expect(world.factions[0].planetCount).toBe(2);
  });

  it('une faction avec une seule planète a planetCount = 1', () => {
    const world = worldWith(DEFS);
    expect(world.factions[1].planetCount).toBe(1);
  });

  it('planetCount suit une capture : la planète neutre passée à la faction 2 est comptée', () => {
    const world = worldWith([...DEFS, { x: 1500, y: 600, radius: 30 }]);
    world.planets[3].owner = 2;
    updateFactions(world);
    expect(world.factions[2].planetCount).toBe(1);
  });
});

describe('updateFactions : planète neutre', () => {
  const world = worldWith([{ x: 300, y: 200, radius: 40, owner: NEUTRAL, built: 2 }]);

  it('une planète neutre n’est comptée par aucune faction', () => {
    expect(world.factions.map((f) => f.planetCount)).toEqual([0, 0, 0]);
  });

  it('les bâtiments d’une planète neutre ne donnent aucune capacité à personne', () => {
    expect(world.factions.map((f) => f.hasMissiles || f.hasShield)).toEqual([false, false, false]);
  });
});

describe('updateFactions : capacités par bâtiment', () => {
  it('hasMissiles reste faux tant que l’usine n’est pas construite', () => {
    const world = worldWith(DEFS);
    expect(world.factions[0].hasMissiles).toBe(false);
  });

  it('hasMissiles devient vrai quand une usine est construite sur une planète de la faction', () => {
    const world = worldWith(DEFS);
    world.planets[1].buildings[1].built = true;
    updateFactions(world);
    expect(world.factions[0].hasMissiles).toBe(true);
  });

  it('hasShield devient vrai quand un générateur de bouclier est construit sur une planète de la faction', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[2].built = true;
    updateFactions(world);
    expect(world.factions[0].hasShield).toBe(true);
  });

  it('une tourelle construite n’accorde ni missiles ni bouclier', () => {
    const world = worldWith([{ x: 300, y: 200, radius: 40, owner: 0, built: 1 }]);
    expect(world.factions[0]).toMatchObject({ hasMissiles: false, hasShield: false });
  });

  it('une tourelle lourde construite n’accorde ni missiles ni bouclier', () => {
    const world = worldWith([{ x: 300, y: 200, radius: 40, owner: 0 }]);
    world.planets[0].buildings[3].built = true;
    updateFactions(world);
    expect(world.factions[0]).toMatchObject({ hasMissiles: false, hasShield: false });
  });

  it('la capacité disparaît quand l’usine n’est plus construite', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[1].built = true;
    updateFactions(world);
    world.planets[0].buildings[1].built = false;
    updateFactions(world);
    expect(world.factions[0].hasMissiles).toBe(false);
  });

  it('la capacité disparaît quand le générateur n’est plus construit', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[2].built = true;
    updateFactions(world);
    world.planets[0].buildings[2].built = false;
    updateFactions(world);
    expect(world.factions[0].hasShield).toBe(false);
  });

  it('la capacité reste vraie si une autre planète de la faction la porte encore', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[1].built = true;
    world.planets[1].buildings[1].built = true;
    updateFactions(world);
    world.planets[0].buildings[1].built = false;
    updateFactions(world);
    expect(world.factions[0].hasMissiles).toBe(true);
  });
});

describe('updateFactions : isolation entre factions', () => {
  it('une usine de la faction 0 n’accorde pas de missiles à la faction 1', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[1].built = true;
    updateFactions(world);
    expect(world.factions[1].hasMissiles).toBe(false);
  });

  it('un générateur de la faction 1 n’accorde pas de bouclier à la faction 0', () => {
    const world = worldWith(DEFS);
    world.planets[2].buildings[2].built = true;
    updateFactions(world);
    expect(world.factions[0].hasShield).toBe(false);
  });

  it('un générateur de la faction 1 accorde le bouclier à la faction 1', () => {
    const world = worldWith(DEFS);
    world.planets[2].buildings[2].built = true;
    updateFactions(world);
    expect(world.factions[1].hasShield).toBe(true);
  });

  it('une usine sur une planète neutre ne contamine aucune faction', () => {
    const world = worldWith([
      { x: 300, y: 200, radius: 40, owner: 0 },
      { x: 900, y: 200, radius: 40, owner: NEUTRAL, built: 2 },
    ]);
    updateFactions(world);
    expect(world.factions[1].hasMissiles).toBe(false);
  });
});

describe('step : appelle updateFactions', () => {
  it('un slot modifié est reflété dans le résumé après step', () => {
    const world = worldWith(DEFS);
    world.planets[0].buildings[1].built = true;
    step(world, FIXED_DT);
    expect(world.factions[0].hasMissiles).toBe(true);
  });

  it('une planète passée à une autre faction est comptée après step', () => {
    const world = worldWith(DEFS);
    world.planets[0].owner = 1;
    step(world, FIXED_DT);
    expect(world.factions[1].planetCount).toBe(2);
  });
});
