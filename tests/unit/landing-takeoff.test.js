import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  SHIP_COLLISION_RADIUS,
  SHIP_THRUST,
  TAKEOFF_MIN_NORMAL_SPEED,
} from '../../src/config.js';
import { updateLanded } from '../../src/core/landing.js';
import { createPlanet } from '../../src/core/planet.js';
import { applyIntent, createShip } from '../../src/core/ship.js';

const DEG = Math.PI / 180;
const PRECISION = 9;
const PX = 300;
const PY = 300;
const PLANET_RADIUS = 60;
const CONTACT = PLANET_RADIUS + SHIP_COLLISION_RADIUS;
const PLANETS = [createPlanet({ x: PX, y: PY, radius: PLANET_RADIUS, gravity: 70 })];

/** Positions autour de la planète : θ = direction de la normale sortante (0 = droite, π/2 = dessous). */
const POSITIONS = [
  ['dessus', -Math.PI / 2],
  ['dessous', Math.PI / 2],
  ['gauche', Math.PI],
  ['droite', 0],
  ['diagonale', Math.PI / 4],
];

/** Vaisseau posé (landedOn = 0) à la normale θ, nez et vitesse donnés. */
function landedShip(theta, { angle = theta, vx = 0, vy = 0 } = {}) {
  const ship = createShip(0, PX + Math.cos(theta) * CONTACT, PY + Math.sin(theta) * CONTACT, angle);
  ship.landedOn = 0;
  ship.vel.x = vx;
  ship.vel.y = vy;
  return ship;
}

/** Vitesse de composante sortante `radial` et tangentielle `tangential` le long de la normale θ. */
function velocityAt(theta, radial, tangential = 0) {
  return {
    vx: radial * Math.cos(theta) - tangential * Math.sin(theta),
    vy: radial * Math.sin(theta) + tangential * Math.cos(theta),
  };
}

/** Composante de la vitesse sur la normale sortante à θ. */
const radialOut = (ship, theta) => ship.vel.x * Math.cos(theta) + ship.vel.y * Math.sin(theta);

describe('updateLanded : vitesse nulle', () => {
  it.each(POSITIONS)('%s : reste posé (retourne true)', (_label, theta) => {
    expect(updateLanded(landedShip(theta), PLANETS)).toBe(true);
  });

  it.each(POSITIONS)('%s : landedOn inchangé', (_label, theta) => {
    const ship = landedShip(theta);
    updateLanded(ship, PLANETS);
    expect(ship.landedOn).toBe(0);
  });

  it.each(POSITIONS)('%s : vitesse (0, 0)', (_label, theta) => {
    const ship = landedShip(theta);
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('updateLanded : vitesse sortante → décollage', () => {
  it.each(POSITIONS)('%s : retourne false', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS)).toBe(false);
  });

  it.each(POSITIONS)('%s : landedOn = -1', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.landedOn).toBe(-1);
  });

  it.each(POSITIONS)('%s : vitesse conservée (non modifiée)', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30, 12);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: vx, y: vy });
  });
});

describe('updateLanded : vitesse vers le sol → reste posé', () => {
  it.each(POSITIONS)('%s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS)).toBe(true);
  });

  it.each(POSITIONS)('%s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it.each(POSITIONS)('%s : landedOn inchangé', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.landedOn).toBe(0);
  });
});

// Le produit scalaire vel·n vaut exactement 0 analytiquement. En flottant, il vaut 0 seulement
// pour les normales alignées sur un axe (dessus, droite) ; ailleurs, le bruit d'arrondi peut être > 0.
const TANGENT_EXACT = POSITIONS.filter(([label]) => label === 'dessus' || label === 'droite');
const TANGENT_NOISY = POSITIONS.filter(([label]) => label !== 'dessus' && label !== 'droite');

describe('updateLanded : vitesse purement tangentielle → reste posé', () => {
  it.each(TANGENT_EXACT)('%s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS)).toBe(true);
  });

  it.each(TANGENT_EXACT)('%s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

// Régression : une vitesse purement tangentielle laisse un résidu d'arrondi (~3e-15) sur la composante
// normale selon l'angle de la normale ; la tolérance TAKEOFF_MIN_NORMAL_SPEED évite un décollage spurieux.
describe('updateLanded : vitesse purement tangentielle → reste posé', () => {
  it.each(TANGENT_EXACT)('%s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS)).toBe(true);
  });

  it.each(TANGENT_EXACT)('%s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

// BUG CONNU (non corrigé, code testé non modifié) : décollage spurieux sur vitesse tangentielle pure.
// updateLanded teste `dot(vel, n) > 0` en flottant strict ; le bruit d'arrondi (~3e-15) rend le
// décollage dépendant de l'angle de la normale. Ces assertions attendent le comportement de l'ADR
// (reste posé) et échouent tant que le bug existe. `it.fails` passe si l'assertion échoue.
describe('updateLanded : vitesse purement tangentielle, normales non alignées sur un axe', () => {
  it.each(TANGENT_NOISY)('%s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS)).toBe(true);
  });

  it.each(TANGENT_NOISY)('%s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('updateLanded : seuil de la composante sortante', () => {
  const THETA = 0.7;

  it('composante sortante au-dessus de la tolérance → décolle (retourne false)', () => {
    const { vx, vy } = velocityAt(THETA, TAKEOFF_MIN_NORMAL_SPEED * 2);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS)).toBe(false);
  });

  it('composante sortante au-dessus de la tolérance → landedOn = -1', () => {
    const { vx, vy } = velocityAt(THETA, TAKEOFF_MIN_NORMAL_SPEED * 2);
    const ship = landedShip(THETA, { vx, vy });
    updateLanded(ship, PLANETS);
    expect(ship.landedOn).toBe(-1);
  });

  it("composante sortante +1e-9 (bruit d'arrondi) → reste posé", () => {
    const { vx, vy } = velocityAt(THETA, 1e-9);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS)).toBe(true);
  });

  it('composante sortante 0 → reste posé', () => {
    const { vx, vy } = velocityAt(THETA, 0);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS)).toBe(true);
  });

  it('composante sortante −1e-9 → reste posé', () => {
    const { vx, vy } = velocityAt(THETA, -1e-9);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS)).toBe(true);
  });
});

describe('updateLanded : ne modifie jamais pos, angle, hp, alive', () => {
  const scenarios = [
    ['reste posé (vitesse vers le sol)', (theta) => velocityAt(theta, -30)],
    ['décolle (vitesse sortante)', (theta) => velocityAt(theta, 30)],
  ];

  function fixture(theta, velocity) {
    const { vx, vy } = velocity(theta);
    const ship = landedShip(theta, { angle: 0.3, vx, vy });
    ship.hp = 42;
    ship.alive = true;
    return ship;
  }

  it.each(scenarios)('%s : pos inchangée', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    const pos = { ...ship.pos };
    updateLanded(ship, PLANETS);
    expect(ship.pos).toEqual(pos);
  });

  it.each(scenarios)('%s : angle inchangé', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS);
    expect(ship.angle).toBe(0.3);
  });

  it.each(scenarios)('%s : hp inchangés', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS);
    expect(ship.hp).toBe(42);
  });

  it.each(scenarios)('%s : alive inchangé', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS);
    expect(ship.alive).toBe(true);
  });
});

describe('updateLanded après applyIntent : intégration nez et poussée', () => {
  const DT = FIXED_DT;

  function thrustingShip(theta, noseOffset) {
    const ship = landedShip(theta, { angle: theta + noseOffset });
    ship.intent.thrust = true;
    applyIntent(ship, DT);
    return ship;
  }

  it('nez vers l’extérieur + poussée : décolle', () => {
    const ship = thrustingShip(0.4, 0);
    expect(updateLanded(ship, PLANETS)).toBe(false);
  });

  it('nez vers l’extérieur + poussée : landedOn = -1', () => {
    const ship = thrustingShip(0.4, 0);
    updateLanded(ship, PLANETS);
    expect(ship.landedOn).toBe(-1);
  });

  it('nez vers le sol + poussée : reste posé', () => {
    const ship = thrustingShip(0.4, Math.PI);
    expect(updateLanded(ship, PLANETS)).toBe(true);
  });

  it('nez vers le sol + poussée : vitesse remise à zéro', () => {
    const ship = thrustingShip(0.4, Math.PI);
    updateLanded(ship, PLANETS);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('nez tangentiel (90°) + poussée : composante radiale ≈ 0 avant updateLanded', () => {
    const theta = 0.4;
    const ship = thrustingShip(theta, Math.PI / 2);
    expect(Math.abs(radialOut(ship, theta))).toBeLessThanOrEqual(1e-12);
  });

  it('nez tangentiel (90°) + poussée : reste posé', () => {
    const ship = thrustingShip(0.4, Math.PI / 2);
    expect(updateLanded(ship, PLANETS)).toBe(true);
  });

  it('nez à 60° de la normale + poussée : décolle', () => {
    const ship = thrustingShip(0.4, 60 * DEG);
    expect(updateLanded(ship, PLANETS)).toBe(false);
  });

  it('nez à 60° de la normale + poussée : composante sortante = SHIP_THRUST × dt × cos 60°', () => {
    const theta = 0.4;
    const ship = thrustingShip(theta, 60 * DEG);
    expect(radialOut(ship, theta)).toBeCloseTo(SHIP_THRUST * DT * Math.cos(60 * DEG), PRECISION);
  });
});
