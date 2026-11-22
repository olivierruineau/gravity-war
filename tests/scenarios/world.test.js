import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT, PROJECTILE_CAPACITY } from '../../src/config.js';
import { EVT, pushEvent } from '../../src/core/events.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { nextFloat } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

const MAP = { width: 100, height: 100, planets: [] };
const OPTIONS = { eventCapacity: EVENT_CAPACITY };

function makeWorld(seed = 1) {
  return createWorld(MAP, seed, OPTIONS);
}

describe('createWorld', () => {
  it('construit la structure initiale : tick 0, dimensions de la carte, pas de vaisseau ni de planète', () => {
    const world = makeWorld(5);
    expect(world.tick).toBe(0);
    expect(world.width).toBe(100);
    expect(world.height).toBe(100);
    expect(world.ships).toEqual([]);
    expect(world.planets).toEqual([]);
    expect(world.rng).toEqual({ state: 5 });
  });

  it('préalloue un pool de PROJECTILE_CAPACITY projectiles tous inactifs, aux objets distincts', () => {
    const { projectiles } = makeWorld();
    expect(projectiles).toHaveLength(PROJECTILE_CAPACITY);
    for (const p of projectiles) {
      expect(p).toEqual({
        active: false,
        kind: KIND.BULLET,
        owner: 0,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        life: 0,
        damage: 0,
      });
    }
    // Aucun objet partagé entre slots : écrire dans un slot ne doit pas en toucher un autre.
    expect(projectiles[0]).not.toBe(projectiles[1]);
    expect(projectiles[0].pos).not.toBe(projectiles[1].pos);
    expect(projectiles[0].vel).not.toBe(projectiles[1].vel);
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
    expect(a.projectiles).not.toBe(b.projectiles);
    expect(a.projectiles[0]).not.toBe(b.projectiles[0]);
    expect(a.projectiles[0].pos).not.toBe(b.projectiles[0].pos);
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
    expect(world.projectiles.some((p) => p.active)).toBe(false);
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

  it('reste JSON pur avec des projectiles actifs dans le pool (aller-retour deep-égal)', () => {
    const world = makeWorld(9);
    spawnProjectile(world.projectiles, KIND.BULLET, 1, 10.5, 20.25, 30, -40, 1.6, 12);
    spawnProjectile(world.projectiles, KIND.MISSILE, 2, 50, 60, -5, 5, 3, 40);
    for (let i = 0; i < 5; i++) step(world, FIXED_DT);
    expect(world.projectiles.filter((p) => p.active)).toHaveLength(2);
    expect(world.projectiles).toHaveLength(PROJECTILE_CAPACITY);
    const clone = JSON.parse(JSON.stringify(world));
    expect(clone).toEqual(world);
    expect(JSON.stringify(clone)).toBe(JSON.stringify(world));
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
