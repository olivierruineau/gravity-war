import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  MISSILE_STOCK_MIN,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST,
} from '../../src/config.js';
import { createIntent } from '../../src/core/intent.js';
import { createPlanet } from '../../src/core/planet.js';
import { applyIntent, createShip, integrate, respawnShip } from '../../src/core/ship.js';

const DT = FIXED_DT;
const TWO_PI = Math.PI * 2;

// Les opérations testées ici sont une poignée de flops : 10 décimales (erreur < 5e-11)
// couvrent largement l'arrondi flottant tout en restant strictes.
const PRECISION = 10;

describe('createShip', () => {
  it('démarre vivant, immobile, à la position donnée et avec tous les PV', () => {
    const ship = createShip(2, 120, 340);
    expect(ship.faction).toBe(2);
    expect(ship.alive).toBe(true);
    expect(ship.pos).toEqual({ x: 120, y: 340 });
    expect(ship.vel).toEqual({ x: 0, y: 0 });
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('a par défaut le nez vers le haut (-π/2, y vers le bas)', () => {
    expect(createShip(0, 0, 0).angle).toBe(-Math.PI / 2);
  });

  it('respecte un angle initial explicite, y compris 0', () => {
    expect(createShip(0, 0, 0, 0).angle).toBe(0);
    expect(createShip(0, 0, 0, 1.25).angle).toBe(1.25);
  });

  it('démarre sans délai de respawn (respawnTimer = 0) et posé sur rien (landedOn = -1)', () => {
    const ship = createShip(0, 0, 0);
    expect(ship.respawnTimer).toBe(0);
    expect(ship.landedOn).toBe(-1);
  });

  it('a une intention par défaut inerte (aucune action)', () => {
    expect(createShip(0, 0, 0).intent).toEqual(createIntent());
  });

  it('ne partage aucun objet mutable entre deux vaisseaux', () => {
    const a = createShip(0, 1, 2);
    const b = createShip(1, 1, 2);
    expect(a.pos).not.toBe(b.pos);
    expect(a.vel).not.toBe(b.vel);
    expect(a.intent).not.toBe(b.intent);
  });
});

describe('respawnShip', () => {
  const PLANET_X = 200;
  const PLANET_Y = 150;
  const RADIUS = 60;
  const planet = createPlanet({ x: PLANET_X, y: PLANET_Y, radius: RADIUS, owner: 0 });

  /** Vaisseau mort, avec un état résiduel de vol à effacer. */
  function deadShip() {
    const ship = createShip(0, 900, 900, 0.3);
    ship.alive = false;
    ship.hp = 0;
    ship.vel.x = 42;
    ship.vel.y = -7;
    ship.landedOn = -1;
    ship.respawnTimer = 1.2;
    ship.intent.rotate = 1;
    ship.intent.thrust = true;
    ship.intent.fire = true;
    ship.intent.missile = true;
    return ship;
  }

  it('le vaisseau redevient vivant avec tous ses PV', () => {
    const ship = deadShip();
    respawnShip(ship, 3, planet);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('posé sur la planète donnée : landedOn = index passé', () => {
    const ship = deadShip();
    respawnShip(ship, 3, planet);
    expect(ship.landedOn).toBe(3);
  });

  it('position au-dessus de la planète, à rayon + SHIP_COLLISION_RADIUS du centre', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(ship.pos.x).toBeCloseTo(PLANET_X, PRECISION);
    expect(ship.pos.y).toBeCloseTo(PLANET_Y - (RADIUS + SHIP_COLLISION_RADIUS), PRECISION);
  });

  it('vitesse remise à zéro', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('nez vers le haut (−π/2), quel que soit l’angle précédent', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(ship.angle).toBe(-Math.PI / 2);
  });

  it('respawnTimer remis à zéro', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(ship.respawnTimer).toBe(0);
  });

  it('intention entièrement remise à zéro', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(ship.intent).toEqual(createIntent());
  });

  it('ne modifie pas le rayon ni la position de la planète', () => {
    const ship = deadShip();
    respawnShip(ship, 0, planet);
    expect(planet.pos).toEqual({ x: PLANET_X, y: PLANET_Y });
    expect(planet.radius).toBe(RADIUS);
  });
});

describe('applyIntent : rotation', () => {
  it.each([
    ['droite (+1)', 1, SHIP_ROTATION_SPEED * DT],
    ['gauche (-1)', -1, -SHIP_ROTATION_SPEED * DT],
    ['aucune (0)', 0, 0],
  ])('rotation %s : angle += rotate × SHIP_ROTATION_SPEED × dt', (_label, rotate, delta) => {
    const ship = createShip(0, 0, 0, 0.5);
    ship.intent.rotate = rotate;
    applyIntent(ship, DT);
    expect(ship.angle).toBeCloseTo(0.5 + delta, PRECISION);
  });

  it('la rotation est proportionnelle à dt', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.intent.rotate = 1;
    applyIntent(ship, 0.25);
    expect(ship.angle).toBeCloseTo(SHIP_ROTATION_SPEED * 0.25, PRECISION);
  });

  it('un tour complet à droite ramène l’angle initial (modulo 2π), toujours dans [-π, π)', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.intent.rotate = 1;
    // Nombre de pas pour ≥ 1 tour complet ; on vérifie l'invariant à chaque pas, pas seulement à la fin.
    const steps = Math.ceil(TWO_PI / (SHIP_ROTATION_SPEED * DT));
    for (let i = 0; i < steps; i++) {
      applyIntent(ship, DT);
      expect(ship.angle).toBeGreaterThanOrEqual(-Math.PI);
      expect(ship.angle).toBeLessThan(Math.PI);
    }
    // Dépassement de 2π au plus d'un pas de rotation, en modulo.
    const overshoot = steps * SHIP_ROTATION_SPEED * DT - TWO_PI;
    expect(overshoot).toBeGreaterThanOrEqual(0);
    expect(overshoot).toBeLessThan(SHIP_ROTATION_SPEED * DT);
    expect(ship.angle).toBeCloseTo(overshoot, 8); // ~118 additions : erreur d'arrondi << 5e-9
  });

  it('un tour complet à gauche reste aussi dans [-π, π)', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.intent.rotate = -1;
    for (let i = 0; i < 300; i++) {
      applyIntent(ship, DT);
      expect(ship.angle).toBeGreaterThanOrEqual(-Math.PI);
      expect(ship.angle).toBeLessThan(Math.PI);
    }
  });

  it('normalise un angle initial hors plage même sans rotation (π → -π, demi-ouvert)', () => {
    const ship = createShip(0, 0, 0, Math.PI);
    applyIntent(ship, DT);
    expect(ship.angle).toBe(-Math.PI);
  });

  it('ne touche ni la vitesse ni la position', () => {
    const ship = createShip(0, 10, 20, 0);
    ship.vel.x = 3;
    ship.vel.y = -4;
    ship.intent.rotate = 1;
    applyIntent(ship, DT);
    expect(ship.vel).toEqual({ x: 3, y: -4 });
    expect(ship.pos).toEqual({ x: 10, y: 20 });
  });
});

describe('applyIntent : poussée', () => {
  // Accélération attendue sur un pas : SHIP_THRUST·dt dans la direction (cos θ, sin θ).
  // cos(π/2) vaut ~6e-17 en flottant : 10 décimales suffisent pour traiter ça comme 0.
  it.each([
    ['0 (vers +x)', 0, 1, 0],
    ['π/2 (vers le bas de l’écran)', Math.PI / 2, 0, 1],
    ['π (vers -x)', Math.PI, -1, 0],
    ['-π/2 (vers le haut)', -Math.PI / 2, 0, -1],
  ])('angle %s : vel += SHIP_THRUST·dt dans l’axe du nez', (_label, angle, ux, uy) => {
    const ship = createShip(0, 0, 0, angle);
    ship.intent.thrust = true;
    applyIntent(ship, DT);
    expect(ship.vel.x).toBeCloseTo(ux * SHIP_THRUST * DT, PRECISION);
    expect(ship.vel.y).toBeCloseTo(uy * SHIP_THRUST * DT, PRECISION);
  });

  it('l’accélération a pour norme SHIP_THRUST·dt quel que soit l’angle', () => {
    for (let k = -8; k < 8; k++) {
      const ship = createShip(0, 0, 0, (k * Math.PI) / 8);
      ship.intent.thrust = true;
      applyIntent(ship, DT);
      expect(Math.hypot(ship.vel.x, ship.vel.y)).toBeCloseTo(SHIP_THRUST * DT, PRECISION);
    }
  });

  it('la poussée s’ajoute à la vitesse existante (v += a·dt)', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.vel.x = 5;
    ship.vel.y = -2;
    ship.intent.thrust = true;
    applyIntent(ship, DT);
    expect(ship.vel.x).toBeCloseTo(5 + SHIP_THRUST * DT, PRECISION);
    expect(ship.vel.y).toBeCloseTo(-2, PRECISION);
  });

  it('thrust=false : aucune accélération, quel que soit l’angle', () => {
    const ship = createShip(0, 0, 0, 0.7);
    ship.vel.x = 5;
    ship.vel.y = -2;
    applyIntent(ship, DT);
    expect(ship.vel).toEqual({ x: 5, y: -2 });
  });

  it('applique la rotation avant la poussée (la poussée suit le nez après rotation)', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.intent.rotate = 1;
    ship.intent.thrust = true;
    applyIntent(ship, DT);
    const angle = SHIP_ROTATION_SPEED * DT;
    expect(ship.vel.x).toBeCloseTo(Math.cos(angle) * SHIP_THRUST * DT, PRECISION);
    expect(ship.vel.y).toBeCloseTo(Math.sin(angle) * SHIP_THRUST * DT, PRECISION);
  });

  it('fire et missile n’ont aucun effet sur le mouvement', () => {
    const ship = createShip(0, 0, 0, 0);
    ship.intent.fire = true;
    ship.intent.missile = true;
    applyIntent(ship, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
    expect(ship.angle).toBe(0);
  });
});

describe('integrate', () => {
  it('pos += vel·dt', () => {
    const ship = createShip(0, 100, 200, 0);
    ship.vel.x = 30;
    ship.vel.y = -60;
    integrate(ship, DT);
    expect(ship.pos.x).toBeCloseTo(100 + 30 * DT, PRECISION);
    expect(ship.pos.y).toBeCloseTo(200 - 60 * DT, PRECISION);
  });

  it('ne modifie pas la vitesse ni l’angle', () => {
    const ship = createShip(0, 0, 0, 1);
    ship.vel.x = 30;
    ship.vel.y = -60;
    integrate(ship, DT);
    expect(ship.vel).toEqual({ x: 30, y: -60 });
    expect(ship.angle).toBe(1);
  });

  it('vitesse nulle ou dt nul : la position ne bouge pas', () => {
    const still = createShip(0, 7, 8);
    integrate(still, DT);
    expect(still.pos).toEqual({ x: 7, y: 8 });

    const moving = createShip(0, 7, 8);
    moving.vel.x = 99;
    integrate(moving, 0);
    expect(moving.pos).toEqual({ x: 7, y: 8 });
  });

  it('est proportionnel à dt', () => {
    const ship = createShip(0, 0, 0);
    ship.vel.x = 10;
    integrate(ship, 0.5);
    expect(ship.pos.x).toBeCloseTo(5, PRECISION);
  });
});

describe('createShip : armes et bouclier au départ', () => {
  const ship = createShip(0, 10, 20);

  it('missiles vaut MISSILE_STOCK_MIN', () => {
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
  });

  it('missileCooldown vaut 0', () => {
    expect(ship.missileCooldown).toBe(0);
  });

  it('rearmTime vaut 0', () => {
    expect(ship.rearmTime).toBe(0);
  });

  it('shield vaut 0', () => {
    expect(ship.shield).toBe(0);
  });

  it('shieldDelay vaut 0', () => {
    expect(ship.shieldDelay).toBe(0);
  });
});

describe('respawnShip : remise à zéro des armes et du bouclier', () => {
  const planet = createPlanet({ x: 200, y: 150, radius: 60, owner: 0 });

  /** Vaisseau dont les armes et le bouclier ont été consommés ou chargés. */
  function usedShip() {
    const ship = createShip(0, 900, 900);
    ship.alive = false;
    ship.missiles = 3;
    ship.missileCooldown = 0.4;
    ship.rearmTime = 1.5;
    ship.shield = 27;
    ship.shieldDelay = 2.2;
    return ship;
  }

  it('missiles revient à MISSILE_STOCK_MIN', () => {
    const ship = usedShip();
    respawnShip(ship, 0, planet);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
  });

  it('missileCooldown revient à 0', () => {
    const ship = usedShip();
    respawnShip(ship, 0, planet);
    expect(ship.missileCooldown).toBe(0);
  });

  it('rearmTime revient à 0', () => {
    const ship = usedShip();
    respawnShip(ship, 0, planet);
    expect(ship.rearmTime).toBe(0);
  });

  it('shield revient à 0', () => {
    const ship = usedShip();
    respawnShip(ship, 0, planet);
    expect(ship.shield).toBe(0);
  });

  it('shieldDelay revient à 0', () => {
    const ship = usedShip();
    respawnShip(ship, 0, planet);
    expect(ship.shieldDelay).toBe(0);
  });
});
