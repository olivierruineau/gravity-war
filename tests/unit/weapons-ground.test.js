import { describe, expect, it } from 'vitest';
import { FIXED_DT, MISSILE_COOLDOWN, SHIP_SIZE } from '../../src/config.js';
import { KIND } from '../../src/core/projectile.js';
import { updateWeapons } from '../../src/core/weapons.js';
import { createWorld, step } from '../../src/core/world.js';

// Un vaisseau qui pointe vers le sol ne tire pas : la bouche (pointe du nez, à SHIP_SIZE du centre) est dans
// une planète. Ni projectile, ni stock, ni cooldown, ni événement. Planète de la faction 0 à usine (built: 2) :
// les missiles sont débloqués, donc seul le sol peut bloquer le tir.
const CX = 500;
const CY = 600;
const R = 60;
const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
// Tolérance : 0,01 px de part et d'autre de la surface, ≫ l'erreur d'arrondi flottante (~1e-13 à ces échelles).
const EPS = 0.01;

function makeWorld({ angle = UP, y, x = CX, extraPlanets = [] } = {}) {
  const landed = y === undefined;
  return createWorld(
    {
      width: 2000,
      height: 2000,
      planets: [{ x: CX, y: CY, radius: R, owner: 0, built: 2 }, ...extraPlanets],
      spawns: [landed ? { planet: 0 } : { x, y, angle }],
    },
    1,
    { eventCapacity: 16 },
  );
}

const active = (world) => world.projectiles.filter((p) => p.active);

function press(ship, { fire = false, missile = false }) {
  ship.intent.fire = fire;
  ship.intent.missile = missile;
}

describe.each([
  ['balle', { fire: true }, KIND.BULLET],
  ['missile', { missile: true }, KIND.MISSILE],
])('vaisseau posé : %s', (_name, intent, kind) => {
  it('nez vers le sol : rien ne part, stock et cooldowns intacts, aucun événement (120 appels)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.angle = DOWN;
    expect(world.factions[0].hasMissiles).toBe(true);
    press(ship, intent);
    for (let i = 0; i < 120; i++) updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
    expect(ship.fireCooldown).toBe(0);
    expect(ship.missileCooldown).toBe(0);
    expect(ship.missiles).toBe(1);
  });

  it('nez vers le sol, via `step` (120 pas, posé) : mêmes garanties', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.angle = DOWN;
    press(ship, intent);
    for (let i = 0; i < 120; i++) step(world, FIXED_DT);
    expect(ship.landedOn).toBe(0);
    expect(active(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
    expect(ship.fireCooldown).toBe(0);
    expect(ship.missiles).toBe(1);
  });

  it('nez vers l’extérieur : le tir part normalement (projectile du bon type, événement émis)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    press(ship, intent);
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(1);
    expect(active(world)[0].kind).toBe(kind);
    expect(world.events.count).toBe(1);
  });

  it('nez à l’horizontale depuis le sommet : la bouche est hors de la planète, le tir part', () => {
    // Bouche à (CX + 8, CY − 66) : distance au centre √(8² + 66²) ≈ 66,5 > 60.
    const world = makeWorld();
    const ship = world.ships[0];
    ship.angle = 0;
    press(ship, intent);
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(1);
  });

  it('un tir bloqué n’a rien consommé : en relevant le nez, le tir part au pas même, sans attendre', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.angle = DOWN;
    press(ship, intent);
    for (let i = 0; i < 30; i++) updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(0);
    ship.angle = UP;
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(1);
  });
});

describe('vaisseau en vol : la pointe du nez décide, pas la position du centre', () => {
  // Nez vers le bas, centre au-dessus du sommet (CX, CY − R). La bouche est à y_centre + SHIP_SIZE.
  // Elle est dans la planète si y_centre + SHIP_SIZE > CY − R.
  const SURFACE_Y = CY - R;

  it.each([
    ['balle', { fire: true }],
    ['missile', { missile: true }],
  ])('%s : bouche juste dans la planète (−0,01 px) : bloqué', (_n, intent) => {
    const world = makeWorld({ angle: DOWN, y: SURFACE_Y - SHIP_SIZE + EPS });
    const ship = world.ships[0];
    expect(ship.landedOn).toBe(-1);
    press(ship, intent);
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
    expect(ship.fireCooldown).toBe(0);
    expect(ship.missileCooldown).toBe(0);
    expect(ship.missiles).toBe(1);
  });

  it.each([
    ['balle', { fire: true }],
    ['missile', { missile: true }],
  ])('%s : bouche juste dehors (+0,01 px) : le tir part', (_n, intent) => {
    const world = makeWorld({ angle: DOWN, y: SURFACE_Y - SHIP_SIZE - EPS });
    const ship = world.ships[0];
    press(ship, intent);
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(1);
    expect(world.events.count).toBe(1);
  });

  it('le centre du vaisseau est hors de la planète mais la bouche est dedans : bloqué (le nez compte)', () => {
    // Centre à 4 px de la surface, bouche à 4 px sous la surface.
    const world = makeWorld({ angle: DOWN, y: SURFACE_Y - 4 });
    press(world.ships[0], { fire: true, missile: true });
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(1);
  });

  it('même position, nez vers l’extérieur : le tir part (c’est bien la direction qui bloque)', () => {
    const world = makeWorld({ angle: UP, y: SURFACE_Y - 4 });
    press(world.ships[0], { fire: true });
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(1);
  });

  it('une AUTRE planète bloque aussi : bouche dans une planète voisine, ailleurs que celle d’où on décolle', () => {
    // Vaisseau en vol à (1200, 1200), nez vers +x ; planète neutre r = 40 centrée à (1200 + SHIP_SIZE + 10, 1200) :
    // la bouche (1208, 1200) est à 18 px du centre, donc dedans.
    const other = { x: 1200 + SHIP_SIZE + 10, y: 1200, radius: 40 };
    const world = makeWorld({ angle: 0, x: 1200, y: 1200, extraPlanets: [other] });
    press(world.ships[0], { fire: true, missile: true });
    updateWeapons(world, 0, FIXED_DT);
    expect(active(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
    expect(world.ships[0].missiles).toBe(1);
  });

  it('missile : après un vrai tir, le cooldown est bien posé (témoin : le blocage ne le désactive pas)', () => {
    const world = makeWorld({ angle: UP, y: SURFACE_Y - 40 });
    press(world.ships[0], { missile: true });
    updateWeapons(world, 0, FIXED_DT);
    expect(world.ships[0].missiles).toBe(0);
    expect(world.ships[0].missileCooldown).toBeCloseTo(MISSILE_COOLDOWN, 12); // une seule affectation : exact à 1e-12
  });
});
