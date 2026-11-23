import { describe, expect, it } from 'vitest';
import {
  EVENT_CAPACITY,
  SHIELD_MAX,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { createWorld } from '../../src/core/world.js';

const PRECISION = 9;
const PLANET_X = 500;
const PLANET_Y = 300;
const PLANET_R = 60;

const PLANETS = [
  { x: PLANET_X, y: PLANET_Y, radius: PLANET_R, owner: 0 },
  { x: 1200, y: 700, radius: 40, owner: 1 },
];

function worldWith(spawns, planets = PLANETS) {
  return createWorld({ width: 2400, height: 1350, planets, spawns }, 1, {
    eventCapacity: EVENT_CAPACITY,
  });
}

describe('createWorld : spawn { planet } posé sur la planète de base', () => {
  const world = worldWith([{ planet: 0 }]);
  const ship = world.ships[0];

  it('le vaisseau est posé sur la planète indiquée (landedOn = index)', () => {
    expect(ship.landedOn).toBe(0);
  });

  it('le vaisseau est vivant', () => {
    expect(ship.alive).toBe(true);
  });

  it('le vaisseau a ses PV au maximum', () => {
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('le vaisseau est immobile', () => {
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('le nez pointe vers le haut', () => {
    expect(ship.angle).toBeCloseTo(-Math.PI / 2, PRECISION);
  });

  it('le vaisseau est posé juste au-dessus de la planète (x = px)', () => {
    expect(ship.pos.x).toBe(PLANET_X);
  });

  it('le vaisseau est posé juste au-dessus de la planète (y = py − (r + SHIP_COLLISION_RADIUS))', () => {
    expect(ship.pos.y).toBe(PLANET_Y - (PLANET_R + SHIP_COLLISION_RADIUS));
  });

  it('la faction vaut l’index du spawn', () => {
    expect(ship.faction).toBe(0);
  });
});

describe('createWorld : spawn { planet } référence la planète par son index', () => {
  const world = worldWith([{ planet: 1 }, { planet: 0 }]);

  it('le spawn 0 pointe la planète 1 : le vaisseau 0 est posé sur la planète 1', () => {
    expect(world.ships[0].landedOn).toBe(1);
  });

  it('le spawn 0 pointe la planète 1 : le vaisseau 0 est au-dessus de la planète 1', () => {
    expect(world.ships[0].pos).toEqual({
      x: PLANETS[1].x,
      y: PLANETS[1].y - (PLANETS[1].radius + SHIP_COLLISION_RADIUS),
    });
  });

  it('le spawn 1 pointe la planète 0 : le vaisseau 1 est posé sur la planète 0', () => {
    expect(world.ships[1].landedOn).toBe(0);
  });
});

describe('createWorld : spawn { x, y, angle } en vol libre', () => {
  const world = worldWith([{ x: 120, y: 80, angle: 0 }]);
  const ship = world.ships[0];

  it('le vaisseau n’est posé sur aucune planète (landedOn = −1)', () => {
    expect(ship.landedOn).toBe(-1);
  });

  it('le vaisseau est à la position demandée', () => {
    expect(ship.pos).toEqual({ x: 120, y: 80 });
  });

  it('le vaisseau prend l’angle demandé', () => {
    expect(ship.angle).toBe(0);
  });

  it('le vaisseau est vivant', () => {
    expect(ship.alive).toBe(true);
  });
});

describe('createWorld : spawn { x, y } sans angle', () => {
  const world = worldWith([{ x: 120, y: 80 }]);

  it('le nez pointe vers le haut par défaut', () => {
    expect(world.ships[0].angle).toBeCloseTo(-Math.PI / 2, PRECISION);
  });

  it('reste en vol libre', () => {
    expect(world.ships[0].landedOn).toBe(-1);
  });
});

describe('createWorld : mélange de spawns', () => {
  const world = worldWith([{ planet: 0 }, { x: 900, y: 400 }]);

  it('crée un vaisseau par spawn', () => {
    expect(world.ships).toHaveLength(2);
  });

  it('le spawn posé est landedOn = planète', () => {
    expect(world.ships[0].landedOn).toBe(0);
  });

  it('le spawn libre reste en vol (landedOn = −1)', () => {
    expect(world.ships[1].landedOn).toBe(-1);
  });

  it('le spawn libre est à sa position d’origine', () => {
    expect(world.ships[1].pos).toEqual({ x: 900, y: 400 });
  });
});

describe('createWorld : faction = index du spawn', () => {
  const world = worldWith([{ planet: 0 }, { x: 900, y: 400 }, { x: 1000, y: 500 }]);

  it.each([0, 1, 2])('le vaisseau %i a pour faction %i', (i) => {
    expect(world.ships[i].faction).toBe(i);
  });
});

describe('createWorld : bouclier d’un spawn { planet } (même règle que le respawn)', () => {
  // built: 3 = tourelle + usine + générateur de bouclier ; built: 2 = sans générateur.
  const planetWith = (built, owner = 0) => ({
    x: PLANET_X,
    y: PLANET_Y,
    radius: PLANET_R,
    owner,
    built,
  });

  it('générateur construit : le vaisseau démarre avec le bouclier plein', () => {
    const world = worldWith([{ planet: 0 }], [planetWith(3)]);
    expect(world.factions[0].hasShield).toBe(true);
    expect(world.ships[0].shield).toBe(SHIELD_MAX);
  });

  it('pas de générateur (built: 2) : bouclier à 0', () => {
    const world = worldWith([{ planet: 0 }], [planetWith(2)]);
    expect(world.factions[0].hasShield).toBe(false);
    expect(world.ships[0].shield).toBe(0);
  });

  it('pas de bâtiment : bouclier à 0', () => {
    expect(worldWith([{ planet: 0 }], [planetWith(0)]).ships[0].shield).toBe(0);
  });

  it('seule la capacité de SA faction compte : poser la faction 1 sur la base à générateur de la faction 0 donne 0', () => {
    const world = worldWith([{ x: 1000, y: 1000 }, { planet: 0 }], [planetWith(3, 0)]);
    expect(world.factions[0].hasShield).toBe(true);
    expect(world.factions[1].hasShield).toBe(false);
    expect(world.ships[1].shield).toBe(0);
  });

  it('spawn en vol libre : pas de bouclier, même si la faction a un générateur', () => {
    const world = worldWith([{ x: 1000, y: 1000 }], [planetWith(3)]);
    expect(world.factions[0].hasShield).toBe(true);
    expect(world.ships[0].shield).toBe(0);
  });

  it('le bouclier est plein et les PV aussi, sans délai de recharge en cours', () => {
    const ship = worldWith([{ planet: 0 }], [planetWith(3)]).ships[0];
    expect(ship).toMatchObject({ shield: SHIELD_MAX, hp: SHIP_MAX_HP, shieldDelay: 0 });
  });
});
