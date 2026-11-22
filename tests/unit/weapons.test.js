import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  BULLET_LIFETIME,
  BULLET_SPEED,
  FIRE_COOLDOWN,
  FIXED_DT,
  PROJECTILE_CAPACITY,
  SHIP_SIZE,
} from '../../src/config.js';
import { EVT } from '../../src/core/events.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { updateWeapons } from '../../src/core/weapons.js';
import { createWorld } from '../../src/core/world.js';

// Deux vaisseaux : faction 0 en (100, 100) et faction 1 en (300, 150), tous deux nez vers +x.
function worldWithShips() {
  return createWorld(
    {
      width: 480,
      height: 270,
      planets: [],
      spawns: [
        { x: 100, y: 100, angle: 0 },
        { x: 300, y: 150, angle: 0 },
      ],
    },
    1,
    { eventCapacity: 16 },
  );
}

function countActive(world) {
  return world.projectiles.filter((p) => p.active).length;
}

/** Appelle `updateWeapons` `n` fois sur le vaisseau `shipIndex`, à pas fixe. */
function stepWeapons(world, shipIndex, n) {
  for (let k = 0; k < n; k++) updateWeapons(world, shipIndex, FIXED_DT);
}

describe('updateWeapons : sans tir demandé', () => {
  it('ne crée aucun projectile sans intent.fire', () => {
    const world = worldWithShips();
    updateWeapons(world, 1, FIXED_DT);
    expect(countActive(world)).toBe(0);
  });

  it('n’émet aucun événement sans intent.fire', () => {
    const world = worldWithShips();
    updateWeapons(world, 1, FIXED_DT);
    expect(world.events.count).toBe(0);
  });
});

describe('updateWeapons : tir', () => {
  it('crée un projectile au premier slot libre', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].active).toBe(true);
  });

  it('crée un projectile de type balle', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].kind).toBe(KIND.BULLET);
  });

  it('attribue au projectile la faction du vaisseau comme propriétaire', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].owner).toBe(1);
  });

  it('fait partir le projectile de la pointe du nez', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].pos.x).toBeCloseTo(300 + SHIP_SIZE, 10);
    expect(world.projectiles[0].pos.y).toBeCloseTo(150, 10);
  });

  it('donne au projectile d’un vaisseau immobile la vitesse dir·BULLET_SPEED', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].vel.x).toBeCloseTo(BULLET_SPEED, 10);
    expect(world.projectiles[0].vel.y).toBeCloseTo(0, 10);
  });

  it('ajoute la vitesse du vaisseau en mouvement à la vitesse du projectile', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    world.ships[1].vel.x = 30;
    world.ships[1].vel.y = -20;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].vel.x).toBeCloseTo(30 + BULLET_SPEED, 10);
  });

  it('ajoute la composante verticale du vaisseau en mouvement', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    world.ships[1].vel.x = 30;
    world.ships[1].vel.y = -20;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].vel.y).toBeCloseTo(-20, 10);
  });

  it('donne au projectile la durée de vie BULLET_LIFETIME', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].life).toBe(BULLET_LIFETIME);
  });

  it('donne au projectile les dégâts BULLET_DAMAGE', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.projectiles[0].damage).toBe(BULLET_DAMAGE);
  });

  it('émet un SHOT avec le vaisseau en `a` et le projectile en `b`', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.events.items[0]).toMatchObject({ type: EVT.SHOT, a: 1, b: 0 });
  });

  it('place l’événement SHOT à la pointe du nez', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.events.items[0]).toMatchObject({ x: 300 + SHIP_SIZE, y: 150 });
  });

  it('gère un angle quelconque : pointe du nez et vitesse suivent cos/sin', () => {
    const world = worldWithShips();
    const ship = world.ships[0];
    ship.angle = 2.1;
    ship.intent.fire = true;
    updateWeapons(world, 0, FIXED_DT);
    const p = world.projectiles[0];
    expect(p.pos.x).toBeCloseTo(100 + Math.cos(2.1) * SHIP_SIZE, 10);
    expect(p.pos.y).toBeCloseTo(100 + Math.sin(2.1) * SHIP_SIZE, 10);
  });

  it('gère un angle quelconque : la vitesse suit la direction du nez', () => {
    const world = worldWithShips();
    const ship = world.ships[0];
    ship.angle = 2.1;
    ship.intent.fire = true;
    updateWeapons(world, 0, FIXED_DT);
    const p = world.projectiles[0];
    expect(p.vel.y).toBeCloseTo(Math.sin(2.1) * BULLET_SPEED, 10);
  });

  it('permet de tirer à l’arrêt, vaisseau posé sur une planète', () => {
    const world = createWorld(
      {
        width: 480,
        height: 270,
        planets: [{ x: 100, y: 120, radius: 20, owner: 0 }],
        spawns: [{ x: 100, y: 100, angle: -Math.PI / 2 }],
      },
      1,
      { eventCapacity: 16 },
    );
    world.ships[0].landedOn = 0;
    world.ships[0].intent.fire = true;
    updateWeapons(world, 0, FIXED_DT);
    expect(countActive(world)).toBe(1);
  });
});

describe('updateWeapons : cadence', () => {
  it('fixe le cooldown à FIRE_COOLDOWN après un tir', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.ships[1].fireCooldown).toBe(FIRE_COOLDOWN);
  });

  it('décompte le cooldown de dt à chaque pas', () => {
    const world = worldWithShips();
    world.ships[1].fireCooldown = FIRE_COOLDOWN;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.ships[1].fireCooldown).toBeCloseTo(FIRE_COOLDOWN - FIXED_DT, 10);
  });

  it('ne tire pas de nouveau projectile tant que le cooldown n’est pas écoulé', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    stepWeapons(world, 1, 11);
    expect(countActive(world)).toBe(1);
  });

  it('tire à nouveau une fois le cooldown écoulé', () => {
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    stepWeapons(world, 1, 12);
    expect(countActive(world)).toBe(2);
  });

  it('respecte la cadence sur une rafale : un tir toutes les 11 étapes à pas fixe', () => {
    // 11 pas = 0,183 s ≥ FIRE_COOLDOWN (0,18 s), 10 pas = 0,167 s < FIRE_COOLDOWN.
    const world = worldWithShips();
    world.ships[1].intent.fire = true;
    stepWeapons(world, 1, 23);
    expect(countActive(world)).toBe(3);
  });
});

describe('updateWeapons : pool plein', () => {
  function fillPool(world) {
    for (let i = 0; i < PROJECTILE_CAPACITY; i++) {
      spawnProjectile(world.projectiles, KIND.BULLET, 0, 0, 0, 0, 0, 10, 1);
    }
  }

  it('ne lève pas d’exception quand le pool est plein', () => {
    const world = worldWithShips();
    fillPool(world);
    world.ships[1].intent.fire = true;
    expect(() => updateWeapons(world, 1, FIXED_DT)).not.toThrow();
  });

  it('ne crée aucun projectile supplémentaire quand le pool est plein', () => {
    const world = worldWithShips();
    fillPool(world);
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(countActive(world)).toBe(PROJECTILE_CAPACITY);
  });

  it('n’émet aucun SHOT quand le pool est plein', () => {
    const world = worldWithShips();
    fillPool(world);
    world.ships[1].intent.fire = true;
    updateWeapons(world, 1, FIXED_DT);
    expect(world.events.count).toBe(0);
  });
});
