import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT } from '../../src/config.js';
import { EVT, pushEvent } from '../../src/core/events.js';
import { nextFloat } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

const MAP = { width: 100, height: 100, planets: [] };
const OPTIONS = { eventCapacity: EVENT_CAPACITY };

function makeWorld(seed = 1) {
  return createWorld(MAP, seed, OPTIONS);
}

describe('createWorld', () => {
  it('construit la structure initiale : tick 0, tableaux vides, dimensions de la carte', () => {
    const world = makeWorld(5);
    expect(world.tick).toBe(0);
    expect(world.width).toBe(100);
    expect(world.height).toBe(100);
    expect(world.ships).toEqual([]);
    expect(world.planets).toEqual([]);
    expect(world.projectiles).toEqual([]);
    expect(world.rng).toEqual({ state: 5 });
  });

  it('prépare la file d’événements à la capacité demandée', () => {
    const world = createWorld(MAP, 1, { eventCapacity: 8 });
    expect(world.events.count).toBe(0);
    expect(world.events.dropped).toBe(0);
    expect(world.events.items).toHaveLength(8);
  });

  it('deux mondes créés avec la même carte ne partagent aucun objet mutable', () => {
    const a = makeWorld();
    const b = makeWorld();
    expect(a.ships).not.toBe(b.ships);
    expect(a.rng).not.toBe(b.rng);
    expect(a.events).not.toBe(b.events);
    expect(a.events.items[0]).not.toBe(b.events.items[0]);
  });
});

describe('step', () => {
  it('incrémente tick de 1 à chaque pas', () => {
    const world = makeWorld();
    step(world, FIXED_DT);
    expect(world.tick).toBe(1);
    step(world, FIXED_DT);
    step(world, FIXED_DT);
    expect(world.tick).toBe(3);
  });

  it('ne modifie ni les dimensions ni la file d’événements d’un monde vide', () => {
    const world = makeWorld();
    for (let i = 0; i < 100; i++) step(world, FIXED_DT);
    expect(world.width).toBe(100);
    expect(world.height).toBe(100);
    expect(world.events.count).toBe(0);
    expect(world.events.dropped).toBe(0);
  });
});

describe('déterminisme', () => {
  // Script identique pour les deux mondes : tirages RNG et événements entrelacés avec les pas.
  function run(seed) {
    const world = makeWorld(seed);
    for (let i = 0; i < 1000; i++) {
      step(world, FIXED_DT);
      if (i % 10 === 0) {
        pushEvent(world.events, EVT.SHOT, nextFloat(world.rng) * world.width, i, i % 3);
      }
    }
    return world;
  }

  it('deux mondes de même seed et 1000 pas ont un JSON identique', () => {
    const a = run(1234);
    const b = run(1234);
    expect(a.tick).toBe(1000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('deux seeds différentes donnent un rng.state différent', () => {
    expect(makeWorld(1).rng.state).not.toBe(makeWorld(2).rng.state);
    expect(run(1).rng.state).not.toBe(run(2).rng.state);
  });

  it('deux seeds différentes divergent dans l’état sérialisé', () => {
    expect(JSON.stringify(run(1))).not.toBe(JSON.stringify(run(2)));
  });
});

describe('world est un objet de données pur', () => {
  it('survit à un aller-retour JSON (deep-égal) à la création', () => {
    const world = makeWorld(77);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('survit à un aller-retour JSON après des pas et des événements', () => {
    const world = makeWorld(77);
    for (let i = 0; i < 50; i++) step(world, FIXED_DT);
    pushEvent(world.events, EVT.IMPACT, 12.5, 40, 1, 2);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('ne contient aucune fonction ni valeur non sérialisable (undefined, NaN, Infinity)', () => {
    const world = makeWorld(3);
    const visit = (value, path) => {
      expect(typeof value, path).not.toBe('function');
      expect(value, path).not.toBeUndefined();
      if (typeof value === 'number') expect(Number.isFinite(value), path).toBe(true);
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
      }
    };
    visit(world, 'world');
  });
});
