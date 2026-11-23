import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT } from '../../src/config.js';
import { predictPath } from '../../src/core/predict.js';
import { createPlanet } from '../../src/core/planet.js';
import { createWorld, step } from '../../src/core/world.js';

// Prédiction balistique (ADR 0006 §5) : mêmes règles que `step` en vol libre. Pas de Phaser, pas de DOM.

const MARGIN = 0;
const BIG = 60; // horizon long : au pire 3600 pas, jamais une boucle infinie si un test se trompe

function out() {
  return { hit: 0, t: 0, x: 0, y: 0, vx: 0, vy: 0 };
}

function vec(x, y) {
  return { x, y };
}

// Planète au centre (500, 300), rayon 40, portée 200 (k = 5) : créée par la vraie fabrique du core.
function planetAt(x, y, radius = 40) {
  return createPlanet({ x, y, radius });
}

describe('predictPath : trajectoire sans planète', () => {
  it('sans planète, aucun contact : hit = -1', () => {
    const r = predictPath(out(), vec(0, 0), vec(100, 0), [], MARGIN, 1, FIXED_DT);
    expect(r.hit).toBe(-1);
  });

  it('sans planète, à l’horizon : position = x0 + v·t', () => {
    const r = predictPath(out(), vec(10, 20), vec(100, -50), [], MARGIN, 1, FIXED_DT);
    expect(r.x).toBeCloseTo(10 + 100 * r.t, 9);
  });

  it('sans planète, à l’horizon : y = y0 + v·t', () => {
    const r = predictPath(out(), vec(10, 20), vec(100, -50), [], MARGIN, 1, FIXED_DT);
    expect(r.y).toBeCloseTo(20 - 50 * r.t, 9);
  });

  it('sans planète : la vitesse est inchangée à l’horizon', () => {
    const r = predictPath(out(), vec(0, 0), vec(100, -50), [], MARGIN, 1, FIXED_DT);
    expect(r.vx).toBe(100);
  });

  it('sans planète : t vaut l’horizon (à l’arrondi du pas près)', () => {
    const r = predictPath(out(), vec(0, 0), vec(100, 0), [], MARGIN, 1, FIXED_DT);
    expect(r.t).toBeCloseTo(1, 9);
  });
});

describe('predictPath : horizon', () => {
  it('horizon nul : aucun pas, état initial renvoyé', () => {
    const r = predictPath(out(), vec(3, 4), vec(5, 6), [], MARGIN, 0, FIXED_DT);
    expect([r.t, r.x, r.y, r.vx, r.vy]).toEqual([0, 3, 4, 5, 6]);
  });

  it('horizon de 2,4 pas : arrondi à 2 pas', () => {
    const r = predictPath(out(), vec(0, 0), vec(60, 0), [], MARGIN, 2.4 * FIXED_DT, FIXED_DT);
    expect(r.t).toBeCloseTo(2 * FIXED_DT, 12);
  });

  it('horizon de 2,6 pas : arrondi à 3 pas', () => {
    const r = predictPath(out(), vec(0, 0), vec(60, 0), [], MARGIN, 2.6 * FIXED_DT, FIXED_DT);
    expect(r.t).toBeCloseTo(3 * FIXED_DT, 12);
  });
});

describe('predictPath : chute radiale vers une planète', () => {
  // Planète (500, 300), rayon 40 ; le vaisseau tombe du dessus, à l’arrêt, depuis 150 px (à la portée exacte, 200 px, la gravité est nulle et le corps ne tombe jamais).
  const planets = [planetAt(500, 300)];

  it('la chute touche la planète : hit = 0', () => {
    const r = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    expect(r.hit).toBe(0);
  });

  it('au contact, le centre est à moins d’un rayon de la planète', () => {
    const r = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    expect(Math.hypot(r.x - 500, r.y - 300)).toBeLessThan(40);
  });

  it('au contact, la vitesse est dirigée vers la planète (vy > 0)', () => {
    const r = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    expect(r.vy).toBeGreaterThan(0);
  });

  it('t est strictement positif pour une chute non immédiate', () => {
    const r = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    expect(r.t).toBeGreaterThan(0);
  });

  it('t est le premier pas de contact : l’horizon d’un pas de moins ne touche pas', () => {
    const first = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    const before = predictPath(
      out(),
      vec(500, 150),
      vec(0, 0),
      planets,
      MARGIN,
      first.t - FIXED_DT,
      FIXED_DT,
    );
    expect(before.hit).toBe(-1);
  });

  it('l’horizon trop court pour atteindre la planète : hit = -1', () => {
    const r = predictPath(out(), vec(500, 150), vec(0, 0), planets, MARGIN, 0.05, FIXED_DT);
    expect(r.hit).toBe(-1);
  });
});

describe('predictPath : contact initial et marge', () => {
  const planets = [planetAt(500, 300)];

  it('départ au centre de la planète : hit = 0 à t = 0', () => {
    const r = predictPath(out(), vec(500, 300), vec(0, 0), planets, MARGIN, BIG, FIXED_DT);
    expect([r.hit, r.t]).toEqual([0, 0]);
  });

  it('départ déjà dans le disque de contact : état initial renvoyé sans avancer', () => {
    const r = predictPath(out(), vec(500, 280), vec(7, 8), planets, MARGIN, BIG, FIXED_DT);
    expect([r.x, r.y, r.vx, r.vy]).toEqual([500, 280, 7, 8]);
  });

  it('la marge élargit le disque de contact : un départ à rayon + marge - ε touche', () => {
    const margin = 10;
    const r = predictPath(
      out(),
      vec(500, 300 - (40 + margin - 0.01)),
      vec(0, 0),
      planets,
      margin,
      BIG,
      FIXED_DT,
    );
    expect(r.hit).toBe(0);
  });

  it('un départ à rayon + marge + ε ne touche pas immédiatement', () => {
    const margin = 10;
    const r = predictPath(
      out(),
      vec(500, 300 - (40 + margin + 0.01)),
      vec(0, 0),
      planets,
      margin,
      0,
      FIXED_DT,
    );
    expect(r.hit).toBe(-1);
  });

  it('contact initial avec la deuxième planète : hit = 1', () => {
    const two = [planetAt(0, 0), planetAt(500, 300)];
    const r = predictPath(out(), vec(500, 300), vec(0, 0), two, MARGIN, BIG, FIXED_DT);
    expect(r.hit).toBe(1);
  });
});

describe('predictPath : cohérence avec le vol réel (step)', () => {
  it('une trajectoire sous gravité suit exactement le vol libre de step', () => {
    // Monde réel : planète seule, vaisseau en orbite basse sans contact pendant 1 s (60 pas).
    const world = createWorld(
      {
        width: 2000,
        height: 2000,
        planets: [{ x: 1000, y: 1000, radius: 40 }],
        spawns: [{ x: 1000, y: 900 }],
      },
      1,
      { eventCapacity: EVENT_CAPACITY },
    );
    const ship = world.ships[0];
    ship.vel.x = 60;
    ship.vel.y = 0;
    const r = predictPath(
      out(),
      vec(ship.pos.x, ship.pos.y),
      vec(60, 0),
      world.planets,
      0,
      1,
      FIXED_DT,
    );
    for (let i = 0; i < 60; i++) step(world, FIXED_DT);
    expect(r.hit).toBe(-1);
    expect(ship.pos.x).toBe(r.x);
    expect(ship.pos.y).toBe(r.y);
  });

  it('la vitesse prédite coïncide avec celle de step après le même horizon', () => {
    const world = createWorld(
      {
        width: 2000,
        height: 2000,
        planets: [{ x: 1000, y: 1000, radius: 40 }],
        spawns: [{ x: 1000, y: 900 }],
      },
      1,
      { eventCapacity: EVENT_CAPACITY },
    );
    const ship = world.ships[0];
    ship.vel.x = 60;
    ship.vel.y = 0;
    const r = predictPath(
      out(),
      vec(ship.pos.x, ship.pos.y),
      vec(60, 0),
      world.planets,
      0,
      1,
      FIXED_DT,
    );
    for (let i = 0; i < 60; i++) step(world, FIXED_DT);
    expect(ship.vel.y).toBe(r.vy);
  });
});

describe('predictPath : déterminisme et absence de mutation', () => {
  const planets = [planetAt(500, 300), planetAt(1200, 300)];

  it('deux appels identiques donnent exactement le même résultat', () => {
    const a = predictPath(out(), vec(100, 100), vec(30, 40), planets, MARGIN, 3, FIXED_DT);
    const b = predictPath(out(), vec(100, 100), vec(30, 40), planets, MARGIN, 3, FIXED_DT);
    expect(a).toEqual(b);
  });

  it('le résultat est écrit dans l’objet `out` fourni et renvoyé', () => {
    const o = out();
    expect(predictPath(o, vec(100, 100), vec(30, 40), planets, MARGIN, 1, FIXED_DT)).toBe(o);
  });

  it('les positions, vitesses et planètes d’entrée ne sont pas modifiées', () => {
    const pos = vec(100, 100);
    const vel = vec(30, 40);
    const before = structuredClone({ pos, vel, planets });
    predictPath(out(), pos, vel, planets, MARGIN, 3, FIXED_DT);
    expect({ pos, vel, planets }).toEqual(before);
  });
});
