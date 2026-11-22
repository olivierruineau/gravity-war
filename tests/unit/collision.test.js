import { describe, expect, it } from 'vitest';
import { SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { EVT, clearEvents } from '../../src/core/events.js';
import { collideProjectilesPlanets, collideProjectilesShips } from '../../src/core/collision.js';
import { damageShip } from '../../src/core/lifecycle.js';
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

// Vaisseau 0 (faction 0) en (100, 100), vaisseau 1 (faction 1) en (300, 100), sans planète.
function shipsWorld(
  spawns = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
  ],
) {
  return createWorld({ width: 480, height: 270, spawns }, 1, { eventCapacity: 8 });
}

function fire(world, owner, x, y, damage = 10) {
  return spawnProjectile(world.projectiles, KIND.BULLET, owner, x, y, 0, 0, 10, damage);
}

describe('collideProjectilesShips : touche ennemie', () => {
  it('désactive un projectile d’une autre faction situé dans le rayon du vaisseau', () => {
    const world = shipsWorld();
    const i = fire(world, 0, 297, 100);
    collideProjectilesShips(world);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('retire à la cible les dégâts du projectile', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, 25);
    collideProjectilesShips(world);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - 25);
  });

  it('émet un SHIP_HIT avec a = index du vaisseau touché', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, 25);
    collideProjectilesShips(world);
    expect(world.events.items[0]).toMatchObject({ type: EVT.SHIP_HIT, a: 1 });
  });

  it('émet un SHIP_HIT avec b = dégâts du projectile', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, 25);
    collideProjectilesShips(world);
    expect(world.events.items[0].b).toBe(25);
  });

  it('émet SHIP_HIT avant EXPLOSION lors d’un coup mortel', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, SHIP_MAX_HP);
    collideProjectilesShips(world);
    expect(world.events.items[0].type).toBe(EVT.SHIP_HIT);
  });

  it('émet une EXPLOSION juste après SHIP_HIT lors d’un coup mortel', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, SHIP_MAX_HP);
    collideProjectilesShips(world);
    expect(world.events.items[1].type).toBe(EVT.EXPLOSION);
  });

  it('ne touche pas un projectile exactement à la distance SHIP_COLLISION_RADIUS', () => {
    const world = shipsWorld();
    const i = fire(world, 0, 300 - SHIP_COLLISION_RADIUS, 100);
    collideProjectilesShips(world);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('n’émet aucun événement pour un projectile exactement à la distance SHIP_COLLISION_RADIUS', () => {
    const world = shipsWorld();
    fire(world, 0, 300 - SHIP_COLLISION_RADIUS, 100);
    collideProjectilesShips(world);
    expect(world.events.count).toBe(0);
  });

  it('ignore un projectile juste hors du rayon du vaisseau', () => {
    const world = shipsWorld();
    const i = fire(world, 0, 300, 100 + SHIP_COLLISION_RADIUS + 1);
    collideProjectilesShips(world);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('n’émet rien pour un projectile hors du rayon du vaisseau', () => {
    const world = shipsWorld();
    fire(world, 0, 300, 100 + SHIP_COLLISION_RADIUS + 1);
    collideProjectilesShips(world);
    expect(world.events.count).toBe(0);
  });
});

describe('collideProjectilesShips : pas de tir ami', () => {
  it('un projectile de la faction du vaisseau traverse celui-ci', () => {
    const world = shipsWorld();
    const i = fire(world, 1, 300, 100);
    collideProjectilesShips(world);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('un tir ami ne modifie pas les PV du vaisseau', () => {
    const world = shipsWorld();
    fire(world, 1, 300, 100);
    collideProjectilesShips(world);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
  });

  it('un tir ami n’émet aucun événement', () => {
    const world = shipsWorld();
    fire(world, 1, 300, 100);
    collideProjectilesShips(world);
    expect(world.events.count).toBe(0);
  });
});

describe('collideProjectilesShips : cibles et projectiles ignorés', () => {
  it('ignore un vaisseau mort situé sur la trajectoire', () => {
    const world = shipsWorld();
    damageShip(world, 1, SHIP_MAX_HP, 0, 0);
    clearEvents(world.events);
    const i = fire(world, 0, 300, 100);
    collideProjectilesShips(world);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('n’inflige aucun dégât à un vaisseau mort', () => {
    const world = shipsWorld();
    damageShip(world, 1, SHIP_MAX_HP, 0, 0);
    clearEvents(world.events);
    fire(world, 0, 300, 100);
    collideProjectilesShips(world);
    expect(world.ships[1].hp).toBe(0);
  });

  it('ignore un slot de projectile inactif situé sur un vaisseau', () => {
    const world = shipsWorld();
    world.projectiles[0].pos.x = 300;
    world.projectiles[0].pos.y = 100;
    world.projectiles[0].owner = 0;
    collideProjectilesShips(world);
    expect(world.events.count).toBe(0);
  });

  it('n’altère pas les PV d’un vaisseau touché par un slot inactif', () => {
    const world = shipsWorld();
    world.projectiles[0].pos.x = 300;
    world.projectiles[0].pos.y = 100;
    world.projectiles[0].owner = 0;
    collideProjectilesShips(world);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
  });
});

describe('collideProjectilesShips : coup mortel', () => {
  it('un coup de dégâts ≥ PV rend le vaisseau mort', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, SHIP_MAX_HP);
    collideProjectilesShips(world);
    expect(world.ships[1].alive).toBe(false);
  });

  it('un coup mortel ramène les PV à 0 (pas de valeur négative)', () => {
    const world = shipsWorld();
    fire(world, 0, 297, 100, SHIP_MAX_HP + 40);
    collideProjectilesShips(world);
    expect(world.ships[1].hp).toBe(0);
  });

  it('un coup mortel annule la vitesse du vaisseau', () => {
    const world = shipsWorld();
    world.ships[1].vel.x = 50;
    world.ships[1].vel.y = -20;
    fire(world, 0, 297, 100, SHIP_MAX_HP);
    collideProjectilesShips(world);
    expect(world.ships[1].vel).toEqual({ x: 0, y: 0 });
  });
});

describe('collideProjectilesShips : un projectile, un vaisseau', () => {
  it('deux vaisseaux superposés : le projectile touche le premier index', () => {
    const world = shipsWorld([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 100 },
    ]);
    fire(world, 0, 300, 100);
    collideProjectilesShips(world);
    expect(world.events.items[0].a).toBe(1);
  });

  it('deux vaisseaux superposés : le second n’est pas touché par le même projectile', () => {
    const world = shipsWorld([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 100 },
    ]);
    fire(world, 0, 300, 100);
    collideProjectilesShips(world);
    expect(world.ships[2].hp).toBe(SHIP_MAX_HP);
  });
});
