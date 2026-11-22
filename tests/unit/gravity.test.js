import { describe, expect, it } from 'vitest';
import { FIXED_DT, GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../../src/config.js';
import { applyGravity, gravityAt, potential } from '../../src/core/gravity.js';
import { createPlanet } from '../../src/core/planet.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld } from '../../src/core/world.js';
import { arena } from '../../src/data/maps/arena.js';

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

/** Vrai si v est compris entre lo et hi (bornes incluses, à eps près). */
function between(v, lo, hi, eps = 1e-12) {
  return v >= Math.min(lo, hi) - eps && v <= Math.max(lo, hi) + eps;
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

describe('gravityAt : superposition (ADR 0004, moyenne pondérée)', () => {
  it.each([
    ['horizontale', [CX - 100, CY], [CX + 100, CY]],
    ['verticale', [CX, CY - 100], [CX, CY + 100]],
  ])('deux planètes symétriques (disposition %s) s’annulent exactement au milieu', (_l, a, b) => {
    const p = createPlanet({ x: a[0], y: a[1], radius: RADIUS });
    const q = createPlanet({ x: b[0], y: b[1], radius: RADIUS });
    expect(accel({ x: CX, y: CY }, [p, q])).toEqual({ x: 0, y: 0 });
  });

  it('deux planètes alignées du même côté : résultat compris entre leurs accélérations individuelles', () => {
    const near = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const far = createPlanet({ x: CX + 200, y: CY, radius: RADIUS });
    const pos = { x: CX, y: CY };
    const total = accel(pos, [near, far]);
    const aNear = accel(pos, [near]);
    const aFar = accel(pos, [far]);
    expect(between(total.x, aNear.x, aFar.x)).toBe(true);
  });

  it('deux planètes alignées du même côté : résultat colinéaire aux deux accélérations', () => {
    const near = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const far = createPlanet({ x: CX + 200, y: CY, radius: RADIUS });
    const pos = { x: CX, y: CY };
    expect(accel(pos, [near, far]).y).toBeCloseTo(0, 12);
  });

  it('deux planètes alignées du même côté : |a| reste inférieur à la somme des |a| individuels', () => {
    const near = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const far = createPlanet({ x: CX + 200, y: CY, radius: RADIUS });
    const pos = { x: CX, y: CY };
    const sum = norm(accel(pos, [near])) + norm(accel(pos, [far]));
    expect(norm(accel(pos, [near, far]))).toBeLessThan(sum);
  });

  it('deux planètes identiques à même distance (perpendiculaires) : moyenne des deux, pas leur somme', () => {
    const east = createPlanet({ x: CX + 100, y: CY, radius: RADIUS });
    const north = createPlanet({ x: CX, y: CY + 100, radius: RADIUS });
    const pos = { x: CX, y: CY };
    const ref1 = accel(pos, [east]);
    const ref2 = accel(pos, [north]);
    const total = accel(pos, [east, north]);
    expect(dist(total, { x: (ref1.x + ref2.x) / 2, y: (ref1.y + ref2.y) / 2 })).toBeLessThan(1e-9);
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

/** Loi ADR 0003 recalculée dans le test : a = mu·(1/d² − 1/R²), dirigée vers le centre. */
function analyticSingleZone(p, pos) {
  const dx = p.pos.x - pos.x;
  const dy = p.pos.y - pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const a = p.mu * (1 / (d * d) - 1 / (p.range * p.range));
  return { x: (a * dx) / d, y: (a * dy) / d };
}

describe('gravityAt : une seule zone = loi ADR 0003 bit à bit', () => {
  const far = createPlanet({ x: 1000, y: 1000, radius: RADIUS });
  const withFar = [planet, far];

  // Points hors axes (aucune composante nulle) : d = 100, 200, 250 exacts (triplets pythagoriciens).
  it.each([
    ['d = 100', { x: 260, y: 230 }],
    ['d = 200', { x: 320, y: 310 }],
    ['d = 250', { x: 270, y: 390 }],
  ])('à %s, la composante x est identique bit à bit à mu·(1/d² − 1/R²)', (_label, pos) => {
    expect(gravityAt({ x: 0, y: 0 }, pos, withFar).x).toBe(analyticSingleZone(planet, pos).x);
  });

  it.each([
    ['d = 100', { x: 260, y: 230 }],
    ['d = 200', { x: 320, y: 310 }],
    ['d = 250', { x: 270, y: 390 }],
  ])('à %s, la composante y est identique bit à bit à mu·(1/d² − 1/R²)', (_label, pos) => {
    expect(gravityAt({ x: 0, y: 0 }, pos, withFar).y).toBe(analyticSingleZone(planet, pos).y);
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

describe('gravityAt : zone dominante sur la carte arena (planètes 3 et 8)', () => {
  // Grosse planète 3 : (1200, 400), r = 90, g0 = 65 (portée 450).
  // Petite planète 8 : (1200, 750), r = 30, g0 = 50 (portée 150), nichée dans la zone de la 3.
  const world = createWorld(arena, 1, { eventCapacity: 8 });
  const BIG = world.planets[3];
  const SMALL = world.planets[8];
  const pair = [BIG, SMALL];
  const MAX_G0 = Math.max(...arena.planets.map((p) => p.gravity));

  it('dans la petite planète, l’accélération est celle de la petite seule', () => {
    const pos = { x: 1210, y: 750 };
    expect(gravityAt({ x: 0, y: 0 }, pos, pair)).toEqual(gravityAt({ x: 0, y: 0 }, pos, [SMALL]));
  });

  it('dans la petite planète, |a| reste borné à g0 = 50 même si la grosse chevauche', () => {
    const a = gravityAt({ x: 0, y: 0 }, { x: 1210, y: 750 }, pair);
    expect(norm(a)).toBeCloseTo(50, 9);
  });

  it('à la surface de la petite face à la grosse, |a| vaut g0 = 50 exact à 1e-9', () => {
    const a = gravityAt({ x: 0, y: 0 }, { x: 1200, y: 720 }, pair);
    expect(norm(a)).toBeCloseTo(50, 9);
  });

  it('à la surface de la petite face à la grosse, a est dirigée vers le centre de la petite', () => {
    const a = gravityAt({ x: 0, y: 0 }, { x: 1200, y: 720 }, pair);
    expect(Math.atan2(a.y, a.x)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('au contact (r + 6) face à la grosse, |a| ≈ celle de la petite seule (grosse pèse < 0,1 %)', () => {
    const pos = { x: 1200, y: 714 };
    const expected = norm(gravityAt({ x: 0, y: 0 }, pos, [SMALL]));
    const actual = norm(gravityAt({ x: 0, y: 0 }, pos, pair));
    expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-3);
  });

  it('à 2,5·r de la petite côté grosse, la composante x est nulle (axe)', () => {
    const a = gravityAt({ x: 0, y: 0 }, { x: 1200, y: 675 }, pair);
    expect(Math.abs(a.x)).toBeLessThan(1e-12);
  });

  it('à 2,5·r de la petite côté grosse, la composante vers la petite est entre 5,5 et 6,25 px/s²', () => {
    const a = gravityAt({ x: 0, y: 0 }, { x: 1200, y: 675 }, pair);
    expect(between(a.y, 5.5, 6.25, 0)).toBe(true);
  });

  it('au centre exact de la petite, (0, 0) sans NaN', () => {
    expect(gravityAt({ x: 0, y: 0 }, { x: 1200, y: 750 }, pair)).toEqual({ x: 0, y: 0 });
  });

  it('au centre exact de la grosse, (0, 0)', () => {
    expect(gravityAt({ x: 0, y: 0 }, { x: 1200, y: 400 }, pair)).toEqual({ x: 0, y: 0 });
  });

  it('hors de toute zone, (0, 0) exact', () => {
    expect(gravityAt({ x: 0, y: 0 }, { x: 2300, y: 1300 }, pair)).toEqual({ x: 0, y: 0 });
  });

  it('plafond : |a| ≤ max g0 de la carte sur une grille couvrant l’arène', () => {
    const out = { x: 0, y: 0 };
    const violations = [];
    for (let x = 0; x <= arena.width; x += 30) {
      for (let y = 0; y <= arena.height; y += 30) {
        gravityAt(out, { x, y }, world.planets);
        if (norm(out) > MAX_G0 + 1e-9) violations.push({ x, y, mag: norm(out) });
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('gravityAt : combinaison convexe sur points aléatoires seedés', () => {
  const SEED = 20261123;
  const N = 200;
  const world = createWorld(arena, 1, { eventCapacity: 8 });

  /**
   * Points seedés (mulberry32 de core/rng.js) autour de la petite planète 8, là où
   * les zones des planètes 3 et 8 se recouvrent (la moitié des points est en chevauchement).
   */
  function samplePoints() {
    const rng = createRng(SEED);
    return Array.from({ length: N }, () => ({
      x: range(rng, 1000, 1400),
      y: range(rng, 600, 900),
    }));
  }

  it('|a| ≤ max des |a_i| individuels en tout point échantillonné', () => {
    const out = { x: 0, y: 0 };
    const scratch = { x: 0, y: 0 };
    const violations = [];
    for (const pos of samplePoints()) {
      gravityAt(out, pos, world.planets);
      const maxIndividual = Math.max(
        ...world.planets.map((p) => norm(gravityAt(scratch, pos, [p]))),
      );
      if (norm(out) > maxIndividual + 1e-9) violations.push({ pos, mag: norm(out), maxIndividual });
    }
    expect(violations).toEqual([]);
  });

  it('l’échantillon contient assez de points de chevauchement pour que le test soit significatif', () => {
    const scratch = { x: 0, y: 0 };
    const multi = samplePoints().filter((pos) => {
      const inZones = world.planets.filter((p) => {
        const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y);
        return d > p.radius && d < p.range;
      });
      return inZones.length >= 2 && norm(gravityAt(scratch, pos, world.planets)) > 0;
    });
    expect(multi.length).toBeGreaterThanOrEqual(50);
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
