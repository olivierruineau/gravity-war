import { describe, expect, it } from 'vitest';
import { MISSILE_DAMAGE } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { collideProjectilesPlanets } from '../../src/core/collision.js';
import { EVT } from '../../src/core/events.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { createWorld } from '../../src/core/world.js';

// Planète à (100, 100), r = 20. Un projectile en (110, 100) est à 10 px du centre : absorbé.
const BASE_HP = BUILDINGS[0].turret.hp; // 80
const HEAVY_HP = BUILDINGS[3].turret.hp; // 160

function worldWith(planet) {
  return createWorld(
    { width: 480, height: 270, planets: [{ x: 100, y: 100, radius: 20, ...planet }] },
    1,
    { eventCapacity: 32 },
  );
}

function shoot(world, { owner, damage = 6, kind = KIND.BULLET, x = 110, y = 100 }) {
  return spawnProjectile(world.projectiles, kind, owner, x, y, 0, 0, 10, damage);
}

function types(world) {
  return world.events.items.slice(0, world.events.count).map((e) => e.type);
}

describe('collideProjectilesPlanets : dégâts aux tourelles', () => {
  it('un projectile ennemi absorbé par une planète possédée abîme la tourelle, en plus de BULLET_HIT', () => {
    const world = worldWith({ owner: 0, built: 1 });
    const i = shoot(world, { owner: 1, damage: 6 });
    collideProjectilesPlanets(world);
    expect(world.projectiles[i].active).toBe(false);
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP - 6);
    expect(types(world)).toEqual([EVT.BULLET_HIT]); // la tourelle survit : pas de TURRET_DESTROYED
    expect(world.events.items[0]).toMatchObject({ x: 110, y: 100, a: 0, b: i });
  });

  it('les dégâts sont ceux du projectile (une balle de 12 retire 12 PV)', () => {
    const world = worldWith({ owner: 0, built: 1 });
    shoot(world, { owner: 1, damage: 12 });
    collideProjectilesPlanets(world);
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP - 12);
  });

  it('un tir ami (même faction que la planète) n’abîme pas la tourelle mais est absorbé (BULLET_HIT)', () => {
    const world = worldWith({ owner: 0, built: 1 });
    const i = shoot(world, { owner: 0, damage: 12 });
    collideProjectilesPlanets(world);
    expect(world.projectiles[i].active).toBe(false);
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP);
    expect(types(world)).toEqual([EVT.BULLET_HIT]);
  });

  it('planète neutre : seulement BULLET_HIT, aucun PV touché (même avec un slot marqué construit)', () => {
    const world = worldWith({ owner: -1, built: 1 });
    shoot(world, { owner: 1, damage: 12 });
    collideProjectilesPlanets(world);
    expect(world.planets[0].buildings[0]).toMatchObject({ built: true, hp: BASE_HP });
    expect(types(world)).toEqual([EVT.BULLET_HIT]);
  });

  it('planète possédée sans tourelle : BULLET_HIT seul, rien ne casse', () => {
    const world = worldWith({ owner: 0, built: 0 });
    shoot(world, { owner: 1 });
    expect(() => collideProjectilesPlanets(world)).not.toThrow();
    expect(types(world)).toEqual([EVT.BULLET_HIT]);
  });

  it('un projectile hors de la planète ne fait rien', () => {
    const world = worldWith({ owner: 0, built: 1 });
    const i = shoot(world, { owner: 1, x: 130, y: 100 }); // d = 30 > r
    collideProjectilesPlanets(world);
    expect(world.projectiles[i].active).toBe(true);
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP);
    expect(world.events.count).toBe(0);
  });

  it('7 balles de 12 détruisent la tourelle de base (6 la laissent à 8 PV) : TURRET_DESTROYED au point d’impact', () => {
    const world = worldWith({ owner: 0, built: 1 });
    world.planets[0].buildProgress = 9;
    for (let k = 0; k < 6; k++) {
      shoot(world, { owner: 1, damage: 12 });
      collideProjectilesPlanets(world);
    }
    expect(world.planets[0].buildings[0]).toMatchObject({ built: true, hp: 8 });
    expect(types(world).includes(EVT.TURRET_DESTROYED)).toBe(false);
    expect(world.planets[0].buildProgress).toBe(9);

    shoot(world, { owner: 1, damage: 12, x: 105, y: 102 });
    collideProjectilesPlanets(world);
    expect(world.planets[0].buildings[0]).toMatchObject({ built: false, hp: 0 });
    expect(world.planets[0].buildProgress).toBe(0);
    const last = world.events.items[world.events.count - 1];
    expect(last).toMatchObject({ type: EVT.TURRET_DESTROYED, x: 105, y: 102, a: 0, b: 0 });
    // Le BULLET_HIT du coup fatal précède TURRET_DESTROYED.
    expect(world.events.items[world.events.count - 2].type).toBe(EVT.BULLET_HIT);
  });

  it('2 missiles (40 dégâts) détruisent la tourelle de base ; il en faut 4 de plus pour la lourde', () => {
    const world = worldWith({ owner: 0, built: 4 });
    const hits = () => {
      shoot(world, { owner: 1, damage: MISSILE_DAMAGE, kind: KIND.MISSILE });
      collideProjectilesPlanets(world);
    };
    hits();
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP - MISSILE_DAMAGE);
    hits();
    expect(world.planets[0].buildings[0].built).toBe(false);
    expect(world.planets[0].buildings[3].hp).toBe(HEAVY_HP);
    for (let k = 0; k < 3; k++) hits();
    expect(world.planets[0].buildings[3]).toMatchObject({ built: true, hp: HEAVY_HP - 3 * 40 });
    hits();
    expect(world.planets[0].buildings[3]).toMatchObject({ built: false, hp: 0 });
  });

  it('seule la planète touchée encaisse (deux planètes possédées)', () => {
    const world = createWorld(
      {
        width: 480,
        height: 270,
        planets: [
          { x: 100, y: 100, radius: 20, owner: 0, built: 1 },
          { x: 300, y: 100, radius: 20, owner: 0, built: 1 },
        ],
      },
      1,
      { eventCapacity: 8 },
    );
    shoot(world, { owner: 1, damage: 6, x: 300, y: 105 });
    collideProjectilesPlanets(world);
    expect(world.planets[0].buildings[0].hp).toBe(BASE_HP);
    expect(world.planets[1].buildings[0].hp).toBe(BASE_HP - 6);
    expect(world.events.items[0]).toMatchObject({ type: EVT.BULLET_HIT, a: 1 });
  });
});
