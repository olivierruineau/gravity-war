import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  SHIP_COLLISION_RADIUS,
  SHIP_THRUST,
  TAKEOFF_MIN_NORMAL_SPEED,
} from '../../src/config.js';
import { gravityAt } from '../../src/core/gravity.js';
import { updateLanded } from '../../src/core/landing.js';
import { createPlanet } from '../../src/core/planet.js';
import { applyIntent, createShip } from '../../src/core/ship.js';

const DEG = Math.PI / 180;
const DT = FIXED_DT;
const PRECISION = 9;
const PX = 300;
const PY = 300;
const PLANET_RADIUS = 60;
const CONTACT = PLANET_RADIUS + SHIP_COLLISION_RADIUS;
const PLANETS = [createPlanet({ x: PX, y: PY, radius: PLANET_RADIUS, gravity: 70 })];

// Gravité au point de contact (ship posé, dist = CONTACT) : radiale, vers le centre.
// G ≈ 57 px/s² (pas 70 : 70 est la gravité à la surface d = r, le vaisseau est à d = r + 6).
const contactPull = gravityAt({ x: 0, y: 0 }, { x: PX + CONTACT, y: PY }, PLANETS);
const G = Math.hypot(contactPull.x, contactPull.y);
// Vitesse sortante que la gravité retire en un pas : c'est le seuil de décollage à FIXED_DT.
const G_DT = G * DT;

/** Positions autour de la planète : θ = direction de la normale sortante (0 = droite, π/2 = dessous). */
const POSITIONS = [
  ['dessus', -Math.PI / 2],
  ['dessous', Math.PI / 2],
  ['gauche', Math.PI],
  ['droite', 0],
  ['diagonale', Math.PI / 4],
];

/** Balayage régulier de 24 normales (pas de 15°) pour la vitesse purement tangentielle. */
const SWEEP = Array.from({ length: 24 }, (_, k) => [`${k * 15}°`, (k * Math.PI) / 12]);

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
    expect(updateLanded(landedShip(theta), PLANETS, DT)).toBe(true);
  });

  it.each(POSITIONS)('%s : landedOn inchangé', (_label, theta) => {
    const ship = landedShip(theta);
    updateLanded(ship, PLANETS, DT);
    expect(ship.landedOn).toBe(0);
  });

  it.each(POSITIONS)('%s : vitesse (0, 0)', (_label, theta) => {
    const ship = landedShip(theta);
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('updateLanded : vitesse sortante nette positive → décollage', () => {
  it.each(POSITIONS)('%s : retourne false', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS, DT)).toBe(false);
  });

  it.each(POSITIONS)('%s : landedOn = -1', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.landedOn).toBe(-1);
  });

  it.each(POSITIONS)('%s : vitesse conservée (non modifiée)', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 30, 12);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: vx, y: vy });
  });
});

describe('updateLanded : vitesse vers le sol → reste posé', () => {
  it.each(POSITIONS)('%s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS, DT)).toBe(true);
  });

  it.each(POSITIONS)('%s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it.each(POSITIONS)('%s : landedOn inchangé', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, -30);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.landedOn).toBe(0);
  });
});

// Vitesse purement tangentielle : le produit scalaire vel·n vaut 0 analytiquement, et en flottant il
// porte un bruit d'arrondi selon l'angle de la normale. La gravité sortante nette (négative) domine ce
// bruit : le vaisseau doit rester posé quel que soit l'angle.
describe('updateLanded : vitesse purement tangentielle → reste posé, tous les angles', () => {
  it.each(SWEEP)('normale %s : retourne true', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    expect(updateLanded(landedShip(theta, { vx, vy }), PLANETS, DT)).toBe(true);
  });

  it.each(SWEEP)('normale %s : vitesse remise à zéro', (_label, theta) => {
    const { vx, vy } = velocityAt(theta, 0, 50);
    const ship = landedShip(theta, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('updateLanded : seuil de la vitesse sortante nette (vel·n + g·n·dt)', () => {
  const THETA = 0.7;

  // Vitesse sortante avant gravité sous le seuil g·dt : la gravité la ramène sous zéro → reste posé.
  it.each([
    ['+1e-9', 1e-9],
    ['+1e-3', 1e-3],
    ['0', 0],
    ['−1e-9', -1e-9],
    ['0,5 × g·dt', 0.5 * G_DT],
  ])('sortante %s : retourne true', (_label, radial) => {
    const { vx, vy } = velocityAt(THETA, radial);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(true);
  });

  it.each([
    ['+1e-9', 1e-9],
    ['+1e-3', 1e-3],
    ['0', 0],
    ['−1e-9', -1e-9],
    ['0,5 × g·dt', 0.5 * G_DT],
  ])('sortante %s : vitesse remise à 0', (_label, radial) => {
    const { vx, vy } = velocityAt(THETA, radial);
    const ship = landedShip(THETA, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('sortante 5 px/s (> g·dt) : retourne false', () => {
    const { vx, vy } = velocityAt(THETA, 5);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(false);
  });

  it('sortante 5 px/s (> g·dt) : landedOn = -1', () => {
    const { vx, vy } = velocityAt(THETA, 5);
    const ship = landedShip(THETA, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.landedOn).toBe(-1);
  });

  it('sortante 5 px/s (> g·dt) : vitesse conservée', () => {
    const { vx, vy } = velocityAt(THETA, 5);
    const ship = landedShip(THETA, { vx, vy });
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: vx, y: vy });
  });

  it('sortante 0,9 × g·dt : reste posé', () => {
    const { vx, vy } = velocityAt(THETA, 0.9 * G_DT);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(true);
  });

  it('sortante 1,1 × g·dt : décolle', () => {
    const { vx, vy } = velocityAt(THETA, 1.1 * G_DT);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(false);
  });

  it('net = +2 × tolérance : décolle', () => {
    const { vx, vy } = velocityAt(THETA, G_DT + 2 * TAKEOFF_MIN_NORMAL_SPEED);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(false);
  });

  it('net = −2 × tolérance : reste posé', () => {
    const { vx, vy } = velocityAt(THETA, G_DT - 2 * TAKEOFF_MIN_NORMAL_SPEED);
    expect(updateLanded(landedShip(THETA, { vx, vy }), PLANETS, DT)).toBe(true);
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
    updateLanded(ship, PLANETS, DT);
    expect(ship.pos).toEqual(pos);
  });

  it.each(scenarios)('%s : angle inchangé', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS, DT);
    expect(ship.angle).toBe(0.3);
  });

  it.each(scenarios)('%s : hp inchangés', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS, DT);
    expect(ship.hp).toBe(42);
  });

  it.each(scenarios)('%s : alive inchangé', (_label, velocity) => {
    const ship = fixture(Math.PI / 4, velocity);
    updateLanded(ship, PLANETS, DT);
    expect(ship.alive).toBe(true);
  });
});

// Poussée appliquée par applyIntent (SHIP_THRUST × dt dans l'axe du nez) puis décision de décollage.
// Le nez est donné en écart à la normale θ : 0 = sur la normale, ±π/2 = tangentiel, π = vers le sol.
describe('updateLanded après applyIntent : nez et poussée', () => {
  const THETA = 0.4;

  function thrustingShip(theta, noseOffset) {
    const ship = landedShip(theta, { angle: theta + noseOffset });
    ship.intent.thrust = true;
    applyIntent(ship, DT);
    return ship;
  }

  // Poussée sortante = SHIP_THRUST × cos(écart) ; décollage ⇔ poussée sortante > G.
  const LIFTING_NOSES = [
    ['sur la normale (0°)', 0],
    ['+60°', 60],
    ['−60°', -60],
  ];
  const GROUNDED_NOSES = [
    ['+80°', 80],
    ['−80°', -80],
    ['+89,9°', 89.9],
    ['−89,9°', -89.9],
    ['+90°', 90],
    ['−90°', -90],
  ];

  describe('nez vers l’extérieur : décolle', () => {
    it.each(LIFTING_NOSES)('nez %s + poussée : retourne false', (_label, deg) => {
      const ship = thrustingShip(THETA, deg * DEG);
      expect(updateLanded(ship, PLANETS, DT)).toBe(false);
    });

    it.each(LIFTING_NOSES)('nez %s + poussée : landedOn = -1', (_label, deg) => {
      const ship = thrustingShip(THETA, deg * DEG);
      updateLanded(ship, PLANETS, DT);
      expect(ship.landedOn).toBe(-1);
    });
  });

  describe('nez écarté de la normale (≥ 80°) : reste posé', () => {
    it.each(GROUNDED_NOSES)('nez %s + poussée : retourne true', (_label, deg) => {
      const ship = thrustingShip(THETA, deg * DEG);
      expect(updateLanded(ship, PLANETS, DT)).toBe(true);
    });

    it.each(GROUNDED_NOSES)('nez %s + poussée : vitesse remise à 0', (_label, deg) => {
      const ship = thrustingShip(THETA, deg * DEG);
      updateLanded(ship, PLANETS, DT);
      expect(ship.vel).toEqual({ x: 0, y: 0 });
    });
  });

  it('nez vers le sol (π) + poussée : reste posé', () => {
    const ship = thrustingShip(THETA, Math.PI);
    expect(updateLanded(ship, PLANETS, DT)).toBe(true);
  });

  it('nez vers le sol (π) + poussée : vitesse remise à 0', () => {
    const ship = thrustingShip(THETA, Math.PI);
    updateLanded(ship, PLANETS, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('nez tangentiel (90°) + poussée : composante radiale ≈ 0 avant updateLanded', () => {
    const ship = thrustingShip(THETA, Math.PI / 2);
    expect(Math.abs(radialOut(ship, THETA))).toBeLessThanOrEqual(1e-12);
  });

  it('nez à 60° + poussée : composante sortante = SHIP_THRUST × dt × cos 60°', () => {
    const ship = thrustingShip(THETA, 60 * DEG);
    expect(radialOut(ship, THETA)).toBeCloseTo(SHIP_THRUST * DT * Math.cos(60 * DEG), PRECISION);
  });

  // Frontière : 140·cos θ* = G. En dessous de θ*, la poussée sortante l'emporte sur la gravité.
  describe('frontière de décollage θ* = acos(G / SHIP_THRUST)', () => {
    const THETA_STAR = Math.acos(G / SHIP_THRUST);

    it('θ* est entre 60° et 80° (sanité du calcul)', () => {
      expect(THETA_STAR).toBeGreaterThan(60 * DEG);
      expect(THETA_STAR).toBeLessThan(80 * DEG);
    });

    it('θ* − 3° : décolle', () => {
      const ship = thrustingShip(THETA, THETA_STAR - 3 * DEG);
      expect(updateLanded(ship, PLANETS, DT)).toBe(false);
    });

    it('θ* + 3° : reste posé', () => {
      const ship = thrustingShip(THETA, THETA_STAR + 3 * DEG);
      expect(updateLanded(ship, PLANETS, DT)).toBe(true);
    });
  });
});
