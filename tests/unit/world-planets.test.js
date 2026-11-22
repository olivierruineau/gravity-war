import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, GRAVITY_RANGE_FACTOR } from '../../src/config.js';
import { createPlanet, NEUTRAL } from '../../src/core/planet.js';
import { createWorld } from '../../src/core/world.js';

const PLANET_DEFS = [
  { x: 300, y: 200, radius: 40 },
  { x: 900, y: 500, radius: 80, gravity: 84 },
];

function worldWith(planets) {
  return createWorld({ width: 2400, height: 1350, planets }, 1, {
    eventCapacity: EVENT_CAPACITY,
  });
}

describe('createWorld : planètes issues de map.planets', () => {
  const world = worldWith(PLANET_DEFS);

  it('instancie une planète par entrée de la carte', () => {
    expect(world.planets).toHaveLength(PLANET_DEFS.length);
  });

  it.each(PLANET_DEFS.map((def, i) => [i, def]))(
    'la planète %i est identique à createPlanet(def)',
    (i, def) => {
      expect(world.planets[i]).toEqual(createPlanet(def));
    },
  );

  it('toutes les planètes sont neutres', () => {
    expect(world.planets.map((p) => p.owner)).toEqual(PLANET_DEFS.map(() => NEUTRAL));
  });

  it('chaque planète a une portée égale à GRAVITY_RANGE_FACTOR fois son rayon', () => {
    expect(world.planets.map((p) => p.range)).toEqual(
      PLANET_DEFS.map((d) => GRAVITY_RANGE_FACTOR * d.radius),
    );
  });

  it('chaque planète a un mu fini strictement positif', () => {
    expect(world.planets.every((p) => Number.isFinite(p.mu) && p.mu > 0)).toBe(true);
  });
});

describe('createWorld : absence de planètes', () => {
  it('sans clé planets dans la carte, world.planets est vide', () => {
    const world = createWorld({ width: 100, height: 100 }, 1, { eventCapacity: EVENT_CAPACITY });
    expect(world.planets).toEqual([]);
  });

  it('avec planets: [], world.planets est vide', () => {
    expect(worldWith([]).planets).toEqual([]);
  });
});
