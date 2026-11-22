import { describe, expect, it } from 'vitest';
import { EVT } from '../../src/core/events.js';
import { collideProjectilesPlanets } from '../../src/core/collision.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { createWorld } from '../../src/core/world.js';

const PLANET = { x: 100, y: 100, radius: 20 };

function worldWith(planets = [PLANET]) {
  return createWorld({ width: 480, height: 270, planets }, 1, { eventCapacity: 8 });
}

function spawnAt(world, x, y) {
  return spawnProjectile(world.projectiles, KIND.BULLET, 0, x, y, 0, 0, 10, 1);
}

describe('collideProjectilesPlanets', () => {
  it('désactive un projectile situé à l’intérieur d’une planète (d < r)', () => {
    const world = worldWith();
    const i = spawnAt(world, 110, 100);
    collideProjectilesPlanets(world);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('émet un BULLET_HIT au point d’impact', () => {
    const world = worldWith();
    spawnAt(world, 110, 100);
    collideProjectilesPlanets(world);
    expect(world.events.items[0]).toMatchObject({ type: EVT.BULLET_HIT, x: 110, y: 100 });
  });

  it('place l’index de la planète en `a` et celui du projectile en `b`', () => {
    const world = worldWith();
    spawnAt(world, 300, 200);
    const i = spawnAt(world, 110, 100);
    collideProjectilesPlanets(world);
    expect(world.events.items[0]).toMatchObject({ a: 0, b: i });
  });

  it('ne touche pas un projectile exactement à la distance r', () => {
    const world = worldWith();
    const i = spawnAt(world, 120, 100);
    collideProjectilesPlanets(world);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('n’émet aucun événement pour un projectile exactement à la distance r', () => {
    const world = worldWith();
    spawnAt(world, 120, 100);
    collideProjectilesPlanets(world);
    expect(world.events.count).toBe(0);
  });

  it('ignore un slot inactif situé dans la planète', () => {
    const world = worldWith();
    world.projectiles[0].pos.x = 110;
    world.projectiles[0].pos.y = 100;
    collideProjectilesPlanets(world);
    expect(world.events.count).toBe(0);
  });

  it('ne désactive que les projectiles touchant une planète parmi plusieurs', () => {
    const world = worldWith();
    const hit = spawnAt(world, 110, 100);
    const miss = spawnAt(world, 300, 200);
    collideProjectilesPlanets(world);
    expect(world.projectiles[hit].active).toBe(false);
    expect(world.projectiles[miss].active).toBe(true);
  });

  it('traite plusieurs projectiles touchant chacun une planète', () => {
    const world = worldWith();
    const a = spawnAt(world, 110, 100);
    const b = spawnAt(world, 95, 100);
    collideProjectilesPlanets(world);
    expect(world.events.count).toBe(2);
    expect(world.events.items.slice(0, 2).map((e) => e.b)).toEqual([a, b]);
  });

  it('ne produit qu’un seul événement par projectile même dans deux planètes', () => {
    const world = worldWith([
      { x: 100, y: 100, radius: 20 },
      { x: 110, y: 100, radius: 20 },
    ]);
    spawnAt(world, 105, 100);
    collideProjectilesPlanets(world);
    expect(world.events.count).toBe(1);
  });

  it('associe le projectile à la première planète touchée quand elles se chevauchent', () => {
    const world = worldWith([
      { x: 100, y: 100, radius: 20 },
      { x: 110, y: 100, radius: 20 },
    ]);
    spawnAt(world, 105, 100);
    collideProjectilesPlanets(world);
    expect(world.events.items[0].a).toBe(0);
  });

  it('identifie la planète touchée par son index quand elle n’est pas la première', () => {
    const world = worldWith([
      { x: 400, y: 200, radius: 10 },
      { x: 100, y: 100, radius: 20 },
    ]);
    spawnAt(world, 110, 100);
    collideProjectilesPlanets(world);
    expect(world.events.items[0].a).toBe(1);
  });

  it('n’émet rien sans projectile actif', () => {
    const world = worldWith();
    collideProjectilesPlanets(world);
    expect(world.events.count).toBe(0);
  });
});
