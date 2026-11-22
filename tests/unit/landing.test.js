import { describe, expect, it } from 'vitest';
import {
  IMPACT_DAMAGE_PER_SPEED,
  IMPACT_MIN_BOUNCE_SPEED,
  IMPACT_RESTITUTION,
  IMPACT_TANGENTIAL_DAMPING,
  LANDING_MAX_ANGLE,
  LANDING_MAX_RADIAL_SPEED,
  LANDING_MAX_TANGENTIAL_SPEED,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { EVT } from '../../src/core/events.js';
import { collideShipPlanets, evaluateLanding, impactDamage } from '../../src/core/landing.js';
import { createPlanet } from '../../src/core/planet.js';
import { createShip } from '../../src/core/ship.js';
import { createWorld } from '../../src/core/world.js';

const DEG = Math.PI / 180;
const PRECISION = 9;
const PLANET_RADIUS = 60;

/** Vaisseau au point (x, y) avec une vitesse et un angle de nez donnés. */
function shipAt(x, y, { vx = 0, vy = 0, angle = 0 } = {}) {
  const ship = createShip(0, x, y, angle);
  ship.vel.x = vx;
  ship.vel.y = vy;
  return ship;
}

function scratch() {
  return { approachSpeed: NaN, tangentialSpeed: NaN, angleError: NaN, ok: false };
}

/** Mesures d'un vaisseau à l'origine contre une planète centrée en (px, py). */
function measureFromOrigin(px, py, { vx = 0, vy = 0, angle = 0 } = {}) {
  const ship = shipAt(0, 0, { vx, vy, angle });
  const planet = createPlanet({ x: px, y: py, radius: PLANET_RADIUS });
  return evaluateLanding(ship, planet, scratch());
}

describe('evaluateLanding : vitesses mesurées', () => {
  it('écrit dans `out` et retourne ce même objet', () => {
    const out = scratch();
    const ship = shipAt(100, 0);
    const planet = createPlanet({ x: 0, y: 0, radius: PLANET_RADIUS });
    expect(evaluateLanding(ship, planet, out)).toBe(out);
  });

  it('vitesse vers le centre : approachSpeed positive', () => {
    // Planète à droite du vaisseau, vitesse vers +x = vers la planète.
    expect(measureFromOrigin(100, 0, { vx: 50 }).approachSpeed).toBeCloseTo(50, PRECISION);
  });

  it('vitesse qui s’éloigne du centre : approachSpeed négative', () => {
    expect(measureFromOrigin(100, 0, { vx: -50 }).approachSpeed).toBeCloseTo(-50, PRECISION);
  });

  it('vitesse parallèle à la surface : approachSpeed nulle', () => {
    expect(measureFromOrigin(100, 0, { vy: 42 }).approachSpeed).toBeCloseTo(0, PRECISION);
  });

  // Vaisseau à l'origine : approche 20, tangentielle +7, pour chacune des quatre positions de planète.
  it.each([
    ['à droite du vaisseau', 100, 0, 20, -7],
    ['à gauche du vaisseau', -100, 0, -20, 7],
    ['au-dessus du vaisseau', 0, -100, -7, -20],
    ['en dessous du vaisseau', 0, 100, 7, 20],
  ])(
    'planète %s : approche 20 et tangentielle +7 (la normale suit la position)',
    (_label, px, py, vx, vy) => {
      const m = measureFromOrigin(px, py, { vx, vy });
      expect(m.approachSpeed).toBeCloseTo(20, PRECISION);
      expect(m.tangentialSpeed).toBeCloseTo(7, PRECISION);
    },
  );

  it.each([
    ['à droite du vaisseau', 100, 0, 20, 7],
    ['à gauche du vaisseau', -100, 0, -20, -7],
    ['au-dessus du vaisseau', 0, -100, 7, -20],
    ['en dessous du vaisseau', 0, 100, -7, 20],
  ])(
    'planète %s : tangentielle signée, inversée pour la vitesse opposée',
    (_label, px, py, vx, vy) => {
      expect(measureFromOrigin(px, py, { vx, vy }).tangentialSpeed).toBeCloseTo(-7, PRECISION);
      expect(measureFromOrigin(px, py, { vx: -vx, vy: -vy }).tangentialSpeed).toBeCloseTo(
        7,
        PRECISION,
      );
    },
  );

  it('vitesse purement radiale : tangentialSpeed nulle', () => {
    expect(measureFromOrigin(100, 0, { vx: 30 }).tangentialSpeed).toBeCloseTo(0, PRECISION);
  });
});

describe('evaluateLanding : erreur d’angle', () => {
  // Normale sortante = direction du vaisseau vu depuis la planète.
  it.each([
    ['planète à droite', 100, 0, Math.PI],
    ['planète à gauche', -100, 0, 0],
    ['planète au-dessus', 0, -100, Math.PI / 2],
    ['planète en dessous', 0, 100, -Math.PI / 2],
  ])('%s : nez sur la normale sortante → erreur nulle', (_label, px, py, normal) => {
    expect(measureFromOrigin(px, py, { angle: normal }).angleError).toBeCloseTo(0, PRECISION);
  });

  it.each([
    ['planète à droite', 100, 0, Math.PI],
    ['planète au-dessus', 0, -100, Math.PI / 2],
  ])('%s : nez à 10° de la normale → erreur 10°', (_label, px, py, normal) => {
    const m = measureFromOrigin(px, py, { angle: normal + 10 * DEG });
    expect(m.angleError).toBeCloseTo(10 * DEG, PRECISION);
  });

  it('nez opposé à la normale → erreur π', () => {
    const m = measureFromOrigin(100, 0, { angle: 0 });
    expect(m.angleError).toBeCloseTo(Math.PI, PRECISION);
  });

  it('gère le passage ±π : nez à 179° contre normale à −179° → erreur 2°', () => {
    const normal = -179 * DEG;
    const ship = shipAt(100 * Math.cos(normal), 100 * Math.sin(normal), { angle: 179 * DEG });
    const planet = createPlanet({ x: 0, y: 0, radius: PLANET_RADIUS });
    expect(evaluateLanding(ship, planet, scratch()).angleError).toBeCloseTo(2 * DEG, PRECISION);
  });

  it('erreur toujours positive, quel que soit le côté où le nez dévie', () => {
    const left = measureFromOrigin(100, 0, { angle: Math.PI - 10 * DEG }).angleError;
    const right = measureFromOrigin(100, 0, { angle: Math.PI + 10 * DEG }).angleError;
    expect(left).toBeCloseTo(10 * DEG, PRECISION);
    expect(right).toBeCloseTo(10 * DEG, PRECISION);
  });
});

describe('evaluateLanding : drapeau ok et bornes exactes', () => {
  it('toutes les conditions réunies → ok', () => {
    expect(measureFromOrigin(-100, 0, { vx: -20 }).ok).toBe(true);
  });

  it('approche = LANDING_MAX_RADIAL_SPEED exactement → ok', () => {
    expect(measureFromOrigin(-100, 0, { vx: -LANDING_MAX_RADIAL_SPEED }).ok).toBe(true);
  });

  it('approche = LANDING_MAX_RADIAL_SPEED + 0,001 → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vx: -(LANDING_MAX_RADIAL_SPEED + 0.001) }).ok).toBe(false);
  });

  it('tangentielle = +LANDING_MAX_TANGENTIAL_SPEED exactement → ok', () => {
    expect(measureFromOrigin(-100, 0, { vy: LANDING_MAX_TANGENTIAL_SPEED }).ok).toBe(true);
  });

  it('tangentielle = −LANDING_MAX_TANGENTIAL_SPEED exactement → ok', () => {
    expect(measureFromOrigin(-100, 0, { vy: -LANDING_MAX_TANGENTIAL_SPEED }).ok).toBe(true);
  });

  it('tangentielle = +LANDING_MAX_TANGENTIAL_SPEED + 0,001 → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vy: LANDING_MAX_TANGENTIAL_SPEED + 0.001 }).ok).toBe(false);
  });

  it('tangentielle = −LANDING_MAX_TANGENTIAL_SPEED − 0,001 → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vy: -(LANDING_MAX_TANGENTIAL_SPEED + 0.001) }).ok).toBe(
      false,
    );
  });

  it('angle = LANDING_MAX_ANGLE − 0,01° → ok', () => {
    const angle = LANDING_MAX_ANGLE - 0.01 * DEG;
    expect(measureFromOrigin(-100, 0, { angle }).ok).toBe(true);
  });

  it('angle = LANDING_MAX_ANGLE + 0,01° → refusé', () => {
    const angle = LANDING_MAX_ANGLE + 0.01 * DEG;
    expect(measureFromOrigin(-100, 0, { angle }).ok).toBe(false);
  });

  it('erreur d’angle négative (nez dévié de l’autre côté) : même borne symétrique', () => {
    expect(measureFromOrigin(-100, 0, { angle: -(LANDING_MAX_ANGLE - 0.01 * DEG) }).ok).toBe(true);
    expect(measureFromOrigin(-100, 0, { angle: -(LANDING_MAX_ANGLE + 0.01 * DEG) }).ok).toBe(false);
  });

  it('les trois conditions exactement à leurs bornes → ok', () => {
    const m = measureFromOrigin(-100, 0, {
      vx: -LANDING_MAX_RADIAL_SPEED,
      vy: LANDING_MAX_TANGENTIAL_SPEED,
      angle: LANDING_MAX_ANGLE - 0.01 * DEG,
    });
    expect(m.ok).toBe(true);
  });

  it('seule l’approche hors seuil → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vx: -50 }).ok).toBe(false);
  });

  it('seule la tangentielle hors seuil → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vx: -20, vy: 40 }).ok).toBe(false);
  });

  it('seul l’angle hors seuil → refusé', () => {
    expect(measureFromOrigin(-100, 0, { vx: -20, angle: 30 * DEG }).ok).toBe(false);
  });
});

describe('evaluateLanding : cas dégénérés', () => {
  it('vaisseau exactement au centre de la planète : mesures finies, pas de NaN', () => {
    const ship = shipAt(50, 50, { vx: 10, vy: -10, angle: 1 });
    const planet = createPlanet({ x: 50, y: 50, radius: PLANET_RADIUS });
    const m = evaluateLanding(ship, planet, scratch());
    expect(Number.isFinite(m.approachSpeed)).toBe(true);
    expect(Number.isFinite(m.tangentialSpeed)).toBe(true);
    expect(Number.isFinite(m.angleError)).toBe(true);
  });
});

describe('impactDamage', () => {
  it('0 sous les seuils', () => {
    expect(impactDamage(0, 0)).toBe(0);
    expect(impactDamage(LANDING_MAX_RADIAL_SPEED - 1, LANDING_MAX_TANGENTIAL_SPEED - 1)).toBe(0);
  });

  it('0 exactement aux seuils', () => {
    expect(impactDamage(LANDING_MAX_RADIAL_SPEED, LANDING_MAX_TANGENTIAL_SPEED)).toBe(0);
  });

  it('excès radial : IMPACT_DAMAGE_PER_SPEED × excès', () => {
    expect(impactDamage(LANDING_MAX_RADIAL_SPEED + 17, 0)).toBeCloseTo(
      IMPACT_DAMAGE_PER_SPEED * 17,
      PRECISION,
    );
  });

  it('excès tangentiel : IMPACT_DAMAGE_PER_SPEED × excès', () => {
    expect(impactDamage(0, LANDING_MAX_TANGENTIAL_SPEED + 12)).toBeCloseTo(
      IMPACT_DAMAGE_PER_SPEED * 12,
      PRECISION,
    );
  });

  it('tangentielle négative traitée en valeur absolue', () => {
    expect(impactDamage(0, -(LANDING_MAX_TANGENTIAL_SPEED + 12))).toBeCloseTo(
      IMPACT_DAMAGE_PER_SPEED * 12,
      PRECISION,
    );
  });

  it('somme des deux excès', () => {
    expect(
      impactDamage(LANDING_MAX_RADIAL_SPEED + 10, -(LANDING_MAX_TANGENTIAL_SPEED + 5)),
    ).toBeCloseTo(IMPACT_DAMAGE_PER_SPEED * 15, PRECISION);
  });

  it('jamais négatif, même avec des vitesses négatives', () => {
    expect(impactDamage(-1000, -10)).toBeGreaterThanOrEqual(0);
    expect(impactDamage(-1000, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// collideShipPlanets : monde minimal, une planète r = 60 en (300, 300).
// ---------------------------------------------------------------------------

const PX = 300;
const PY = 300;
const CONTACT = PLANET_RADIUS + SHIP_COLLISION_RADIUS;

function worldWith(planets) {
  return createWorld({ width: 2400, height: 1350, planets }, 1, { eventCapacity: 8 });
}

function oneBodyWorld() {
  return worldWith([{ x: PX, y: PY, radius: PLANET_RADIUS }]);
}

/**
 * Place le vaisseau `shipIndex` à `dist` du centre de la planète `planetIndex`, dans la direction
 * `theta` (normale sortante), avec une vitesse décomposée en approche (vers le centre) et tangentielle.
 */
function placeShip(
  world,
  {
    planetIndex = 0,
    shipIndex = 0,
    dist = CONTACT - 1,
    theta = 0,
    approach = 0,
    tangential = 0,
    noseOffset = 0,
  } = {},
) {
  const c = world.planets[planetIndex].pos;
  const nx = Math.cos(theta);
  const ny = Math.sin(theta);
  const ship = createShip(0, c.x + nx * dist, c.y + ny * dist, theta + noseOffset);
  // v = −approach·n + tangential·t, avec t = (−ny, nx).
  ship.vel.x = -approach * nx - tangential * ny;
  ship.vel.y = -approach * ny + tangential * nx;
  world.ships[shipIndex] = ship;
  return ship;
}

/** Composantes de la vitesse dans le repère (n = normale sortante à `theta`, t = (−ny, nx)). */
const radialOut = (ship, theta) => ship.vel.x * Math.cos(theta) + ship.vel.y * Math.sin(theta);
const tangentOf = (ship, theta) => -ship.vel.x * Math.sin(theta) + ship.vel.y * Math.cos(theta);

const distanceTo = (ship, planet) =>
  Math.hypot(ship.pos.x - planet.pos.x, ship.pos.y - planet.pos.y);

describe('collideShipPlanets : pas de contact', () => {
  it('d = r + SHIP_COLLISION_RADIUS exactement : le vaisseau ne bouge pas', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT, approach: 20 });
    const before = structuredClone(ship);
    collideShipPlanets(world, 0);
    expect(ship).toEqual(before);
  });

  it('loin de la planète : aucun changement d’état', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT + 200, approach: 20, tangential: 5 });
    const before = structuredClone(ship);
    collideShipPlanets(world, 0);
    expect(ship).toEqual(before);
  });

  it('pas de contact : aucun événement', () => {
    const world = oneBodyWorld();
    placeShip(world, { dist: CONTACT + 1, approach: 20 });
    collideShipPlanets(world, 0);
    expect(world.events.count).toBe(0);
  });

  it('monde sans planète : rien ne se passe', () => {
    const world = worldWith([]);
    world.ships[0] = createShip(0, 10, 10);
    world.ships[0].vel.x = 20;
    const before = structuredClone(world.ships[0]);
    collideShipPlanets(world, 0);
    expect(world.ships[0]).toEqual(before);
    expect(world.events.count).toBe(0);
  });
});

describe('collideShipPlanets : atterrissage réussi', () => {
  // Vitesse sous les seuils, nez sur la normale, contact franc (1 px à l’intérieur de la zone).
  const THETA = 0.7;
  function landingScene() {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, theta: THETA, approach: 20, tangential: 5 });
    collideShipPlanets(world, 0);
    return { world, ship };
  }

  it('landedOn = index de la planète', () => {
    expect(landingScene().ship.landedOn).toBe(0);
  });

  it('vitesse remise à (0, 0)', () => {
    expect(landingScene().ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('l’angle du nez est conservé', () => {
    const { ship } = landingScene();
    expect(ship.angle).toBe(THETA);
  });

  it('position reprojetée à r + SHIP_COLLISION_RADIUS (à 1e-9 près)', () => {
    const { world, ship } = landingScene();
    expect(distanceTo(ship, world.planets[0])).toBeCloseTo(CONTACT, 9);
  });

  it('PV inchangés (les dégâts ne sont pas appliqués ici)', () => {
    expect(landingScene().ship.hp).toBe(SHIP_MAX_HP);
  });

  it('émet exactement un événement LANDED', () => {
    const { world } = landingScene();
    expect(world.events.count).toBe(1);
    expect(world.events.items[0].type).toBe(EVT.LANDED);
  });

  it('événement LANDED positionné au point de surface, dans la direction de la normale', () => {
    const { world } = landingScene();
    const e = world.events.items[0];
    expect(e.x).toBeCloseTo(PX + Math.cos(THETA) * PLANET_RADIUS, PRECISION);
    expect(e.y).toBeCloseTo(PY + Math.sin(THETA) * PLANET_RADIUS, PRECISION);
  });

  it('pas d’événement IMPACT', () => {
    const { world } = landingScene();
    expect(world.events.items.slice(0, world.events.count).map((e) => e.type)).not.toContain(
      EVT.IMPACT,
    );
  });
});

describe('collideShipPlanets : index du vaisseau et de la planète dans l’événement', () => {
  it('LANDED : a = index du vaisseau, b = index de la planète (monde à deux planètes et deux vaisseaux)', () => {
    const world = worldWith([
      { x: 1000, y: 1000, radius: PLANET_RADIUS },
      { x: PX, y: PY, radius: PLANET_RADIUS },
    ]);
    world.ships[0] = createShip(0, 0, 0);
    placeShip(world, { planetIndex: 1, shipIndex: 1, dist: CONTACT - 1, approach: 10 });
    collideShipPlanets(world, 1);
    const e = world.events.items[0];
    expect(e.type).toBe(EVT.LANDED);
    expect(e.a).toBe(1);
    expect(e.b).toBe(1);
  });

  it('ne touche pas au vaisseau qui n’est pas en contact', () => {
    const world = worldWith([
      { x: 1000, y: 1000, radius: PLANET_RADIUS },
      { x: PX, y: PY, radius: PLANET_RADIUS },
    ]);
    world.ships[0] = createShip(0, 0, 0);
    const far = structuredClone(world.ships[0]);
    placeShip(world, { planetIndex: 1, shipIndex: 1, dist: CONTACT - 1, approach: 10 });
    collideShipPlanets(world, 1);
    expect(world.ships[0]).toEqual(far);
  });
});

describe('collideShipPlanets : impact', () => {
  // Vitesse d’approche au-dessus du seuil radial (50 > 45), tangentielle nulle.
  it('vitesse radiale au-dessus du seuil : pas d’atterrissage', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, approach: LANDING_MAX_RADIAL_SPEED + 5 });
    collideShipPlanets(world, 0);
    expect(ship.landedOn).toBe(-1);
  });

  it('émet exactement un événement IMPACT (pas LANDED)', () => {
    const world = oneBodyWorld();
    placeShip(world, { dist: CONTACT - 1, approach: LANDING_MAX_RADIAL_SPEED + 5 });
    collideShipPlanets(world, 0);
    expect(world.events.count).toBe(1);
    expect(world.events.items[0].type).toBe(EVT.IMPACT);
  });

  it('IMPACT.b = dégâts = IMPACT_DAMAGE_PER_SPEED × excès radial', () => {
    const world = oneBodyWorld();
    placeShip(world, { dist: CONTACT - 1, approach: LANDING_MAX_RADIAL_SPEED + 5 });
    collideShipPlanets(world, 0);
    expect(world.events.items[0].b).toBeCloseTo(IMPACT_DAMAGE_PER_SPEED * 5, PRECISION);
  });

  it('PV non modifiés par collideShipPlanets', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, approach: 200 });
    collideShipPlanets(world, 0);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('position reprojetée à r + SHIP_COLLISION_RADIUS (à 1e-9 près)', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, theta: 2.1, approach: 200 });
    collideShipPlanets(world, 0);
    expect(distanceTo(ship, world.planets[0])).toBeCloseTo(CONTACT, 9);
  });

  it('rebond minimal : vitesse radiale sortante = IMPACT_MIN_BOUNCE_SPEED quand 0,3 × vIn est plus petit', () => {
    // 0,3 × 50 = 15 < 30 : c’est le plancher qui s’applique.
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, theta: 0.4, approach: 50 });
    collideShipPlanets(world, 0);
    expect(radialOut(ship, 0.4)).toBeCloseTo(IMPACT_MIN_BOUNCE_SPEED, PRECISION);
  });

  it('rebond proportionnel : vitesse radiale sortante = IMPACT_RESTITUTION × vIn quand il dépasse le plancher', () => {
    // 0,3 × 200 = 60 > 30 : c’est le facteur qui s’applique.
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, theta: 0.4, approach: 200 });
    collideShipPlanets(world, 0);
    expect(radialOut(ship, 0.4)).toBeCloseTo(IMPACT_RESTITUTION * 200, PRECISION);
  });

  it('vitesse tangentielle amortie par IMPACT_TANGENTIAL_DAMPING, signe conservé (positif)', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 1, theta: 0.4, approach: 200, tangential: 50 });
    collideShipPlanets(world, 0);
    expect(tangentOf(ship, 0.4)).toBeCloseTo(50 * IMPACT_TANGENTIAL_DAMPING, PRECISION);
  });

  it('vitesse tangentielle amortie, signe conservé (négatif)', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, {
      dist: CONTACT - 1,
      theta: 0.4,
      approach: 200,
      tangential: -50,
    });
    collideShipPlanets(world, 0);
    expect(tangentOf(ship, 0.4)).toBeCloseTo(-50 * IMPACT_TANGENTIAL_DAMPING, PRECISION);
  });

  it('échec dû au seul angle : IMPACT avec dégâts nuls', () => {
    const world = oneBodyWorld();
    placeShip(world, {
      dist: CONTACT - 1,
      approach: 10,
      noseOffset: LANDING_MAX_ANGLE + 5 * DEG,
    });
    collideShipPlanets(world, 0);
    expect(world.events.items[0]).toMatchObject({ type: EVT.IMPACT, b: 0 });
  });

  it('échec dû au seul angle : rebond garanti (vitesse radiale sortante = IMPACT_MIN_BOUNCE_SPEED)', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, {
      dist: CONTACT - 1,
      approach: 10,
      noseOffset: LANDING_MAX_ANGLE + 5 * DEG,
    });
    collideShipPlanets(world, 0);
    expect(radialOut(ship, 0)).toBeCloseTo(IMPACT_MIN_BOUNCE_SPEED, PRECISION);
  });
});

describe('collideShipPlanets : vaisseau déjà en train de s’éloigner', () => {
  it('approche négative : position reprojetée à r + SHIP_COLLISION_RADIUS', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 3, approach: -20 });
    collideShipPlanets(world, 0);
    expect(distanceTo(ship, world.planets[0])).toBeCloseTo(CONTACT, 9);
  });

  it('approche négative : ni LANDED ni IMPACT', () => {
    const world = oneBodyWorld();
    placeShip(world, { dist: CONTACT - 3, approach: -20 });
    collideShipPlanets(world, 0);
    expect(world.events.count).toBe(0);
  });

  it('approche négative : vitesse inchangée (pas de rebond ajouté)', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 3, approach: -20, tangential: 5 });
    const vel = { ...ship.vel };
    collideShipPlanets(world, 0);
    expect(ship.vel).toEqual(vel);
  });

  it('approche nulle : traité comme une sortie, aucun événement', () => {
    const world = oneBodyWorld();
    placeShip(world, { dist: CONTACT - 3, approach: 0 });
    collideShipPlanets(world, 0);
    expect(world.events.count).toBe(0);
  });

  it('approche négative : landedOn reste à -1', () => {
    const world = oneBodyWorld();
    const ship = placeShip(world, { dist: CONTACT - 3, approach: -20 });
    collideShipPlanets(world, 0);
    expect(ship.landedOn).toBe(-1);
  });
});
