import { describe, expect, it } from 'vitest';
import { GRAVITY_RANGE_FACTOR, PLANET_GRAVITY } from '../../src/config.js';
import { gravityAt } from '../../src/core/gravity.js';
import { createPlanet, NEUTRAL, nearestPlanet } from '../../src/core/planet.js';
import { createWorld } from '../../src/core/world.js';
import { arena } from '../../src/data/maps/arena.js';

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

describe('createPlanet : propriétaire', () => {
  it('owner explicite : la planète démarre à ce propriétaire', () => {
    expect(createPlanet({ x: 0, y: 0, radius: 10, owner: 2 }).owner).toBe(2);
  });

  it('owner: 0 explicite (faction joueur) n’est pas remplacé par la neutralité', () => {
    expect(createPlanet({ x: 0, y: 0, radius: 10, owner: 0 }).owner).toBe(0);
  });

  it('sans owner : neutre (NEUTRAL)', () => {
    expect(createPlanet({ x: 0, y: 0, radius: 10 }).owner).toBe(NEUTRAL);
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

describe('nearestPlanet : cas limites', () => {
  it('retourne -1 si la liste est vide', () => {
    expect(nearestPlanet([], { x: 0, y: 0 })).toBe(-1);
  });

  it.each([
    ['au centre', { x: 0, y: 0 }],
    ['à l’intérieur', { x: 5, y: 5 }],
    ['à l’extérieur', { x: 1000, y: -700 }],
  ])('une seule planète : retourne 0 quelle que soit la position (%s)', (_label, pos) => {
    expect(nearestPlanet([createPlanet({ x: 0, y: 0, radius: 20 })], pos)).toBe(0);
  });
});

describe('nearestPlanet : distance mesurée à la surface', () => {
  const origin = { x: 0, y: 0 };
  // Petite planète : centre à 50 px, surface à 40 px.
  const small = createPlanet({ x: 50, y: 0, radius: 10 });
  // Grosse planète : centre à 100 px (plus loin), surface à 20 px (plus proche).
  const big = createPlanet({ x: 100, y: 0, radius: 80 });

  it('contrôle de l’exemple : la petite planète a le centre le plus proche', () => {
    const centerSmall = Math.hypot(small.pos.x - origin.x, small.pos.y - origin.y);
    const centerBig = Math.hypot(big.pos.x - origin.x, big.pos.y - origin.y);
    expect(centerSmall).toBeLessThan(centerBig);
  });

  it('la grosse planète dont la surface est plus proche gagne, malgré un centre plus loin', () => {
    expect(nearestPlanet([small, big], origin)).toBe(1);
  });

  it('le résultat ne dépend pas de l’ordre de la liste', () => {
    expect(nearestPlanet([big, small], origin)).toBe(0);
  });
});

describe('nearestPlanet : égalité', () => {
  const origin = { x: 0, y: 0 };
  const left = createPlanet({ x: -100, y: 0, radius: 10 });
  const right = createPlanet({ x: 100, y: 0, radius: 10 });
  const far = createPlanet({ x: 0, y: 500, radius: 10 });

  it('égalité parfaite : retourne le premier index', () => {
    expect(nearestPlanet([left, right], origin)).toBe(0);
  });

  it('égalité parfaite avec un élément plus loin devant : retourne le premier index ex aequo', () => {
    expect(nearestPlanet([far, right, left], origin)).toBe(1);
  });
});

describe('nearestPlanet : position dans ou sur une planète', () => {
  it('position à l’intérieur d’une planète (écart négatif) : retourne cette planète', () => {
    const outside = createPlanet({ x: 500, y: 0, radius: 10 });
    const inside = createPlanet({ x: 0, y: 0, radius: 50 });
    expect(nearestPlanet([outside, inside], { x: 10, y: 0 })).toBe(1);
  });

  it('position exactement sur le centre d’une planète : retourne cette planète', () => {
    const far = createPlanet({ x: 300, y: 300, radius: 10 });
    const target = createPlanet({ x: 40, y: -20, radius: 30 });
    expect(nearestPlanet([far, target], { x: 40, y: -20 })).toBe(1);
  });
});

describe('nearestPlanet : invariants', () => {
  const planets = [
    createPlanet({ x: 0, y: 0, radius: 30 }),
    createPlanet({ x: 300, y: 0, radius: 20 }),
    createPlanet({ x: 150, y: 200, radius: 40 }),
  ];

  it('retourne toujours un entier dans [0, n) pour une grille de positions', () => {
    const results = [];
    for (let x = -100; x <= 400; x += 50) {
      for (let y = -100; y <= 300; y += 50) {
        results.push(nearestPlanet(planets, { x, y }));
      }
    }
    const valid = results.every((i) => Number.isInteger(i) && i >= 0 && i < planets.length);
    expect(valid).toBe(true);
  });

  it('ne modifie pas la position passée', () => {
    const pos = { x: 123, y: -45 };
    nearestPlanet(planets, pos);
    expect(pos).toEqual({ x: 123, y: -45 });
  });

  it('ne modifie ni la liste ni les planètes', () => {
    const snapshot = structuredClone(planets);
    nearestPlanet(planets, { x: 150, y: 50 });
    expect(planets).toEqual(snapshot);
  });
});

describe('nearestPlanet : filtre par propriétaire', () => {
  const origin = { x: 0, y: 0 };
  const enemyNear = createPlanet({ x: 50, y: 0, radius: 10, owner: 1 }); // surface à 40
  const ownFar = createPlanet({ x: 300, y: 0, radius: 10, owner: 0 }); // surface à 290
  const ownFarther = createPlanet({ x: 0, y: 900, radius: 10, owner: 0 }); // surface à 890
  const neutral = createPlanet({ x: 20, y: 0, radius: 5 }); // surface à 15
  const planets = [enemyNear, ownFar, ownFarther, neutral];

  it('ignore les planètes des autres propriétaires, même plus proches', () => {
    expect(nearestPlanet(planets, origin, 0)).toBe(1);
  });

  it('ne retient que la planète la plus proche parmi celles du propriétaire', () => {
    expect(nearestPlanet(planets, origin, 0)).not.toBe(2);
  });

  it('propriétaire sans aucune planète : −1', () => {
    expect(nearestPlanet(planets, origin, 3)).toBe(-1);
  });

  it('filtre NEUTRAL : ne retient que les planètes neutres', () => {
    expect(nearestPlanet(planets, origin, NEUTRAL)).toBe(3);
  });

  it('liste vide avec un filtre : −1', () => {
    expect(nearestPlanet([], origin, 0)).toBe(-1);
  });

  it('sans filtre (owner omis) : comportement inchangé, planète la plus proche tous propriétaires confondus', () => {
    expect(nearestPlanet(planets, origin)).toBe(3);
  });

  it('owner: undefined explicite équivaut à l’absence de filtre', () => {
    expect(nearestPlanet(planets, origin, undefined)).toBe(3);
  });
});

describe('nearestPlanet : carte arena', () => {
  const world = createWorld(arena, 1, { eventCapacity: 8 });

  it('au spawn joueur, la planète la plus proche est la base du joueur (planète 0)', () => {
    expect(nearestPlanet(world.planets, arena.spawns[0])).toBe(0);
  });
});
