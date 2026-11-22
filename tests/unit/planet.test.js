import { describe, expect, it } from 'vitest';
import { GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../../src/config.js';
import { gravityAt } from '../../src/core/gravity.js';
import { createPlanet, NEUTRAL } from '../../src/core/planet.js';

const CX = 200;
const CY = 150;

function norm(v) {
  return Math.hypot(v.x, v.y);
}

/** Intensité de la gravité d'une planète seule, au point situé à `d` du centre (axe x). */
function magnitudeAt(planet, d) {
  return norm(gravityAt({ x: 0, y: 0 }, { x: planet.pos.x + d, y: planet.pos.y }, [planet]));
}

describe('createPlanet : champs', () => {
  const planet = createPlanet({ x: CX, y: CY, radius: 60, gravity: 70 });

  it('place le centre aux coordonnées données', () => {
    expect(planet.pos).toEqual({ x: CX, y: CY });
  });

  it('conserve le rayon', () => {
    expect(planet.radius).toBe(60);
  });

  it('est neutre à la création', () => {
    expect(planet.owner).toBe(NEUTRAL);
  });

  it('NEUTRAL vaut -1', () => {
    expect(NEUTRAL).toBe(-1);
  });

  it('mu est un nombre fini strictement positif', () => {
    expect(Number.isFinite(planet.mu) && planet.mu > 0).toBe(true);
  });

  it('la portée vaut GRAVITY_RANGE_FACTOR fois le rayon', () => {
    expect(planet.range).toBe(GRAVITY_RANGE_FACTOR * 60);
  });
});

describe('createPlanet : gravité par défaut', () => {
  it('sans gravity, la gravité de surface vaut PLANET_GRAVITY', () => {
    const planet = createPlanet({ x: CX, y: CY, radius: 60 });
    expect(magnitudeAt(planet, 60)).toBeCloseTo(PLANET_GRAVITY, 9);
  });

  it('gravity: 0 explicite n’est pas remplacé par le défaut', () => {
    const planet = createPlanet({ x: CX, y: CY, radius: 60, gravity: 0 });
    expect(magnitudeAt(planet, 60)).toBe(0);
  });
});

describe('createPlanet : calibration de mu (gravité exacte à la surface)', () => {
  it.each([
    [30, 50],
    [45, PLANET_GRAVITY],
    [60, 70],
    [90, 84],
    [12, 1],
  ])('r = %s, g0 = %s : |a| vaut g0 à d = r à 1e-9 près', (radius, gravity) => {
    const planet = createPlanet({ x: CX, y: CY, radius, gravity });
    expect(magnitudeAt(planet, radius)).toBeCloseTo(gravity, 9);
  });
});

describe('createPlanet : isolation des objets', () => {
  it('deux planètes aux mêmes coordonnées ne partagent pas l’objet pos', () => {
    const a = createPlanet({ x: 0, y: 0, radius: 10 });
    const b = createPlanet({ x: 0, y: 0, radius: 10 });
    expect(a.pos).not.toBe(b.pos);
  });

  it('modifier pos d’une planète ne modifie pas l’autre', () => {
    const a = createPlanet({ x: 0, y: 0, radius: 10 });
    const b = createPlanet({ x: 0, y: 0, radius: 10 });
    a.pos.x = 99;
    expect(b.pos.x).toBe(0);
  });
});
