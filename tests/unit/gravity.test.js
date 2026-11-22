import { describe, expect, it } from 'vitest';
import { FIXED_DT, GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../../src/config.js';
import { applyGravity, gravityAt, potential } from '../../src/core/gravity.js';
import { createPlanet } from '../../src/core/planet.js';

// Planète de référence : r = 60, g0 = PLANET_GRAVITY, portée R = 5·r, centre (200, 150).
const CX = 200;
const CY = 150;
const RADIUS = 60;
const G0 = PLANET_GRAVITY;
const RANGE = GRAVITY_RANGE_FACTOR * RADIUS;

const planet = createPlanet({ x: CX, y: CY, radius: RADIUS, gravity: G0 });
const planets = [planet];

/** Point situé à la distance `d` du centre dans la direction (dirX, dirY) (vecteur unitaire). */
function at(d, dirX = 1, dirY = 0) {
  return { x: CX + d * dirX, y: CY + d * dirY };
}

function accel(pos, list = planets) {
  return gravityAt({ x: 0, y: 0 }, pos, list);
}

function norm(v) {
  return Math.hypot(v.x, v.y);
}

function dist(u, v) {
  return Math.hypot(u.x - v.x, u.y - v.y);
}

describe('gravityAt : intensité', () => {
  it.each([
    ['droite', 1, 0],
    ['gauche', -1, 0],
    ['haut', 0, -1],
    ['bas', 0, 1],
  ])('|a| vaut g0 à la surface, côté %s', (_label, dx, dy) => {
    expect(norm(accel(at(RADIUS, dx, dy)))).toBeCloseTo(G0, 9);
  });

  it.each([0.5, 0.1, 0.99])('|a| vaut g0 sous la surface (d = %s·r, borné)', (factor) => {
    expect(norm(accel(at(factor * RADIUS)))).toBeCloseTo(G0, 9);
  });

  it('a = 0 exactement à la portée d = R', () => {
    expect(accel(at(RANGE))).toEqual({ x: 0, y: 0 });
  });

  it.each([1, 100])('a = 0 au-delà de la portée (d = R + %s)', (extra) => {
    expect(accel(at(RANGE + extra))).toEqual({ x: 0, y: 0 });
  });

  it('continuité en R : |a(R − 1e-6)| est négligeable', () => {
    expect(norm(accel(at(RANGE - 1e-6)))).toBeLessThan(1e-6);
  });

  it('|a| décroît strictement de la surface jusqu’à la portée', () => {
    const N = 50;
    const mags = Array.from({ length: N }, (_, i) =>
      norm(accel(at(RADIUS + ((RANGE - RADIUS) * i) / N))),
    );
    expect(mags.every((m, i) => i === 0 || m < mags[i - 1])).toBe(true);
  });
});

describe('gravityAt : direction vers le centre', () => {
  it.each([
    ['droite', 1, 0],
    ['gauche', -1, 0],
    ['haut', 0, -1],
    ['bas', 0, 1],
    ['diagonale', Math.SQRT1_2, Math.SQRT1_2],
  ])('depuis la %s, l’accélération est dirigée vers le centre', (_label, dx, dy) => {
    const a = accel(at(2 * RADIUS, dx, dy));
    const n = norm(a);
    expect(Math.hypot(a.x / n + dx, a.y / n + dy)).toBeLessThan(1e-12);
  });
});

describe('gravityAt : singularité au centre', () => {
  it('ne produit ni NaN ni Infinity quand le corps est exactement au centre', () => {
    const a = accel({ x: CX, y: CY });
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
  });

  it('retourne (0, 0) quand le corps est exactement au centre', () => {
    expect(norm(accel({ x: CX, y: CY }))).toBe(0);
  });
});

describe('gravityAt : superposition', () => {
  it('deux planètes symétriques s’annulent au milieu', () => {
    const left = createPlanet({ x: CX - 100, y: CY, radius: RADIUS });
    const right = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    expect(norm(accel({ x: CX, y: CY }, [left, right]))).toBeCloseTo(0, 12);
  });

  it('deux planètes alignées du même côté : |a| est la somme des |a| individuels', () => {
    const near = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const far = createPlanet({ x: CX + 200, y: CY, radius: RADIUS });
    const pos = { x: CX, y: CY };
    const total = accel(pos, [near, far]);
    const expected = norm(accel(pos, [near])) + norm(accel(pos, [far]));
    expect(norm(total)).toBeCloseTo(expected, 9);
  });

  it('deux planètes perpendiculaires : la somme est vectorielle', () => {
    const east = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const north = createPlanet({ x: CX, y: CY + 100, radius: RADIUS });
    const pos = { x: CX, y: CY };
    const ref1 = accel(pos, [east]);
    const ref2 = accel(pos, [north]);
    const total = accel(pos, [east, north]);
    expect(dist(total, { x: ref1.x + ref2.x, y: ref1.y + ref2.y })).toBeLessThan(1e-9);
  });

  it('deux planètes perpendiculaires tirent dans leurs deux directions', () => {
    const east = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const north = createPlanet({ x: CX, y: CY + 100, radius: RADIUS });
    const total = accel({ x: CX, y: CY }, [east, north]);
    expect(total.x > 0 && total.y > 0).toBe(true);
  });

  it('liste vide : (0, 0)', () => {
    expect(accel(at(RADIUS), [])).toEqual({ x: 0, y: 0 });
  });
});

describe('gravityAt : sortie', () => {
  it('retourne l’objet out fourni', () => {
    const out = { x: 0, y: 0 };
    expect(gravityAt(out, at(RADIUS), planets)).toBe(out);
  });

  it('écrase les valeurs précédentes de out', () => {
    const out = { x: 999, y: -999 };
    gravityAt(out, at(2 * RADIUS), planets);
    expect(out).toEqual(accel(at(2 * RADIUS)));
  });
});

describe('applyGravity', () => {
  const start = at(2 * RADIUS);

  it('ajoute a·dt à la vitesse existante', () => {
    const body = { pos: { ...start }, vel: { x: 5, y: -3 } };
    const a = accel(start);
    applyGravity(body, planets, FIXED_DT);
    const expected = { x: 5 + a.x * FIXED_DT, y: -3 + a.y * FIXED_DT };
    expect(dist(body.vel, expected)).toBeLessThan(1e-12);
  });

  it('ne modifie pas la position', () => {
    const body = { pos: { ...start }, vel: { x: 0, y: 0 } };
    applyGravity(body, planets, FIXED_DT);
    expect(body.pos).toEqual(start);
  });

  it('hors portée : la vitesse est inchangée', () => {
    const body = { pos: at(RANGE + 10), vel: { x: 5, y: -3 } };
    applyGravity(body, planets, FIXED_DT);
    expect(body.vel).toEqual({ x: 5, y: -3 });
  });

  it('dt nul : la vitesse est inchangée', () => {
    const body = { pos: { ...start }, vel: { x: 5, y: -3 } };
    applyGravity(body, planets, 0);
    expect(body.vel).toEqual({ x: 5, y: -3 });
  });

  it('au centre exact : la vitesse reste finie et inchangée', () => {
    const body = { pos: { x: CX, y: CY }, vel: { x: 5, y: -3 } };
    applyGravity(body, planets, FIXED_DT);
    expect(body.vel).toEqual({ x: 5, y: -3 });
  });
});

describe('potential : bornes et continuité', () => {
  it('vaut 0 exactement à la portée', () => {
    expect(potential(planet, RANGE)).toBe(0);
  });

  it.each([1, 100])('vaut 0 au-delà de la portée (d = R + %s)', (extra) => {
    expect(potential(planet, RANGE + extra)).toBe(0);
  });

  it('continue en R : |U(R − 1e-6)| est négligeable', () => {
    expect(Math.abs(potential(planet, RANGE - 1e-6))).toBeLessThan(1e-6);
  });
});

describe('potential : monotonie et cohérence avec la force', () => {
  it('strictement croissant avec d sur [r, R)', () => {
    const N = 50;
    const values = Array.from({ length: N }, (_, i) =>
      potential(planet, RADIUS + ((RANGE - RADIUS) * i) / N),
    );
    expect(values.every((u, i) => i === 0 || u > values[i - 1])).toBe(true);
  });

  it.each([1.2, 2, 3, 4])(
    'dérivée numérique ≈ +|a(d)| à d = %s·r (tolérance relative 1e-3)',
    (factor) => {
      const d = factor * RADIUS;
      const h = 1e-4;
      const numeric = (potential(planet, d + h) - potential(planet, d - h)) / (2 * h);
      const expected = norm(accel(at(d)));
      expect(Math.abs(numeric - expected) / expected).toBeLessThan(1e-3);
    },
  );
});
