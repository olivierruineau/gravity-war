import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_COLLISION_RADIUS, SHIP_MAX_HP, SHIP_THRUST } from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { gravityAt } from '../../src/core/gravity.js';
import { wrapAngle } from '../../src/core/math.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Scénarios de décollage depuis une planète (ADR 0003 §4 « Vaisseau posé » et §5) sur une mini-carte :
// une planète r = 60, g0 = 70 au centre d'une carte 4000×4000 (murs hors de toute trajectoire utile).
// Le vaisseau est toujours posé par un VRAI atterrissage (40 px/s, nez sur la normale, marge de 5 px/s
// sous le seuil de 45), puis piloté uniquement via `ship.intent`.
const SIZE = 4000;
const CX = 2000;
const CY = 2000;
const RADIUS = 60;
const RANGE = 5 * RADIUS; // portée de gravité R = 5·r (ADR 0003 §2)
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2; // normale sortante au-dessus de la planète (y vers le bas à l'écran)
const DEG = Math.PI / 180;
const ONE_SECOND = Math.round(1 / FIXED_DT);

const SOLO = [{ x: CX, y: CY, radius: RADIUS, gravity: 70 }];

function makeWorld(planets = SOLO, seed = 1) {
  return createWorld(
    { width: SIZE, height: SIZE, planets, spawns: [{ x: CX, y: CY, angle: 0 }] },
    seed,
    { eventCapacity: 64 },
  );
}

function distanceTo(ship, planet) {
  return Math.hypot(ship.pos.x - planet.x, ship.pos.y - planet.y);
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Nombre d'événements de contact (IMPACT ou LANDED) du pas courant. */
function contactCount(world) {
  return eventsOf(world, EVT.IMPACT).length + eventsOf(world, EVT.LANDED).length;
}

/** Normale sortante de la planète `planet` au niveau du vaisseau (angle). */
function normalAngle(ship, planet) {
  return Math.atan2(ship.pos.y - planet.y, ship.pos.x - planet.x);
}

/**
 * Pose le vaisseau 0 par un vrai atterrissage : au-dessus de la planète `planets[index]`, à 2 px du seuil
 * de contact, nez sur la normale, 40 px/s vers le centre. Les événements sont vidés avant de rendre la main.
 */
function landedWorld(planets = SOLO, index = 0) {
  const world = makeWorld(planets);
  const p = planets[index];
  const ship = world.ships[0];
  ship.pos.x = p.x;
  ship.pos.y = p.y - (CONTACT + 2);
  ship.vel.x = 0;
  ship.vel.y = 40;
  ship.angle = UP;
  for (let i = 0; i < 60 && ship.landedOn < 0; i++) step(world, FIXED_DT);
  // Garde-fou du scénario : l'atterrissage est bien réel (planète visée, vitesse annulée par le contact).
  expect(ship.landedOn).toBe(index);
  expect(ship.vel.x).toBe(0);
  expect(ship.vel.y).toBe(0);
  clearEvents(world.events);
  return { world, ship };
}

describe('décollage : poussée dans la normale', () => {
  it('décolle dès le pas suivant, d croît strictement et dépasse R = 5·r en moins de 4 s, sans événement', () => {
    const { world, ship } = landedWorld();
    ship.intent.thrust = true; // nez conservé de l'atterrissage : exactement sur la normale

    step(world, FIXED_DT);
    expect(ship.landedOn).toBe(-1);

    let previous = distanceTo(ship, SOLO[0]);
    // Garde le contact avec la planète en vue : le vaisseau a bien quitté le seuil de contact ou presque.
    expect(previous).toBeGreaterThanOrEqual(CONTACT);
    let steps = 1;
    let events = world.events.count;
    while (previous <= RANGE && steps < 4 * ONE_SECOND) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      steps++;
      const d = distanceTo(ship, SOLO[0]);
      expect(d).toBeGreaterThan(previous); // montée strictement croissante
      previous = d;
      events += world.events.count;
    }
    expect(previous).toBeGreaterThan(RANGE);
    // Accélération nette ≥ 140 − 70 = 70 px/s² dès la surface : 234 px (de 66 à 300) en ≤ 2,6 s ;
    // la borne de 4 s est donc large, et on mesure ici le temps réel (< 3 s attendu).
    expect(steps).toBeLessThan(3 * ONE_SECOND);
    // Aucun IMPACT/LANDED (ni autre événement) pendant la montée, premier pas compris.
    expect(events).toBe(0);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('la vitesse sortante du premier pas vaut (T − g(r+6))·dt, g tiré de mu et de la portée de la planète', () => {
    const { world, ship } = landedWorld();
    const { mu, range } = world.planets[0];
    ship.intent.thrust = true;
    step(world, FIXED_DT);
    // Poussée 140·dt moins g(66)·dt avec g(d) = mu·(1/d² − 1/R²) (ADR 0003 §2) ≈ 57 px/s² : 1,38 px/s.
    // Tolérance 1e-6 : seul l'arrondi flottant sépare la formule du code (g évalué en d = 66 exactement,
    // à l'arrondi de la reprojection près).
    const g = mu * (1 / CONTACT ** 2 - 1 / range ** 2);
    const outwardSpeed = -ship.vel.y; // normale = haut : sortant = vy négatif
    expect(outwardSpeed).toBeCloseTo((SHIP_THRUST - g) * FIXED_DT, 6);
  });
});

describe('posé : poussée vers le sol', () => {
  it('nez à 180° de la normale + thrust pendant 300 pas : reste posé, position inchangée à l’octet, aucun événement', () => {
    const { world, ship } = landedWorld();
    const { x, y } = ship.pos;
    ship.angle = wrapAngle(UP + Math.PI);
    ship.intent.thrust = true;
    for (let i = 0; i < 300; i++) {
      step(world, FIXED_DT);
      expect(world.events.count).toBe(0);
    }
    // Poussée vers le centre : composante sortante < 0, donc vel est remise à 0 et le vaisseau saute
    // intégration et collision : pos n'est jamais écrite → égalité exacte.
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.x).toBe(x);
    expect(ship.pos.y).toBe(y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });
});

describe('posé : rotation seule', () => {
  it.each([1, -1])(
    'rotate = %i pendant 1 s : l’angle change, ni position ni décollage',
    (rotate) => {
      const { world, ship } = landedWorld();
      const { x, y } = ship.pos;
      const before = ship.angle;
      ship.intent.rotate = rotate;
      for (let i = 0; i < ONE_SECOND; i++) step(world, FIXED_DT);
      // 60 pas × 3,2 rad/s × dt = 3,2 rad (modulo 2π) ; arrondi cumulé des 60 additions < 1e-9.
      expect(wrapAngle(ship.angle - before)).toBeCloseTo(wrapAngle(rotate * 3.2), 9);
      expect(ship.landedOn).toBe(0);
      expect(ship.pos.x).toBe(x);
      expect(ship.pos.y).toBe(y);
      expect(world.events.count).toBe(0);
    },
  );
});

describe('posé : nez tangentiel', () => {
  // Composante sortante de la poussée = 140·cos(90°) = 0 en théorie ; l'arrondi flottant laisse un résidu
  // (~1e-16) dont le signe dépend du côté. TAKEOFF_MIN_NORMAL_SPEED l'absorbe : les deux côtés restent posés.
  it.each([
    ['+90° (vers la droite)', 90],
    ['−90° (vers la gauche)', -90],
  ])(
    'nez à %s de la normale + thrust 2 s : reste posé, immobile, aucun événement',
    (_label, deg) => {
      const { world, ship } = landedWorld();
      const { x, y } = ship.pos;
      ship.angle = wrapAngle(UP + deg * DEG);
      ship.intent.thrust = true;
      for (let i = 0; i < 2 * ONE_SECOND; i++) {
        step(world, FIXED_DT);
        expect(world.events.count).toBe(0);
      }
      expect(ship.landedOn).toBe(0);
      expect(ship.pos.x).toBe(x);
      expect(ship.pos.y).toBe(y);
    },
  );
});

describe('posé : poussée trop faible pour vaincre la gravité', () => {
  // Depuis la revue : `updateLanded` ne décolle que si la vitesse sortante NETTE du pas,
  // (T·cosθ − g)·dt, dépasse TAKEOFF_MIN_NORMAL_SPEED. Pour r = 60, g0 = 70 : g(66) ≈ 57,3 px/s², donc
  // la limite est θ ≈ 65,8° (cf. le test de frontière). Au-delà, le vaisseau reste posé, sans événement
  // (plus de « pop » suivi d'un faux IMPACT).
  it.each([
    [70, 1],
    [70, -1],
    [75, 1],
    [75, -1],
    [80, 1],
    [80, -1],
    [89.9, 1],
    [89.9, -1],
  ])(
    'nez à %s° (côté %i) + thrust 2 s : reste posé, immobile à l’octet, aucun événement',
    (deg, sign) => {
      const { world, ship } = landedWorld();
      const { x, y } = ship.pos;
      ship.angle = wrapAngle(UP + sign * deg * DEG);
      const angle = ship.angle;
      ship.intent.thrust = true;
      for (let i = 0; i < 2 * ONE_SECOND; i++) {
        step(world, FIXED_DT);
        // Ni LANDED, ni IMPACT, ni autre événement, à aucun pas.
        expect(world.events.count).toBe(0);
        expect(ship.landedOn).toBe(0);
      }
      // `vel` est remise à 0 à chaque pas et pos n'est jamais écrite : égalité exacte, pas de tolérance.
      expect(ship.pos.x).toBe(x);
      expect(ship.pos.y).toBe(y);
      expect(ship.vel.x).toBe(0);
      expect(ship.vel.y).toBe(0);
      expect(ship.angle).toBe(angle); // sans rotation demandée, le nez ne bouge pas
      expect(ship.hp).toBe(SHIP_MAX_HP);
      expect(ship.alive).toBe(true);
    },
  );

  it('poussée brève (10 pas) à 70° : reste posé, aucun événement (avant : 7 sauts puis un atterrissage)', () => {
    const { world, ship } = landedWorld();
    const { x, y } = ship.pos;
    ship.angle = wrapAngle(UP + 70 * DEG);
    for (let i = 0; i < 30 * ONE_SECOND; i++) {
      ship.intent.thrust = i < 10;
      step(world, FIXED_DT);
      expect(world.events.count).toBe(0);
    }
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.x).toBe(x);
    expect(ship.pos.y).toBe(y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });
});

describe('décollage : frontière poussée/gravité', () => {
  it.each([1, -1])(
    'angle limite acos(g/T) calculé avec gravityAt : décolle à θ−3°, reste posé à θ+3° (côté %i)',
    (sign) => {
      const probe = landedWorld();
      const g = gravityAt({ x: 0, y: 0 }, probe.ship.pos, probe.world.planets);
      // Gravité de surface réelle à la position posée (pas la formule de l'ADR recopiée), dirigée vers le centre.
      expect(g.y).toBeGreaterThan(0);
      const gSurface = Math.hypot(g.x, g.y);
      expect(gSurface).toBeGreaterThan(50);
      expect(gSurface).toBeLessThan(SHIP_THRUST);
      const limit = Math.acos(gSurface / SHIP_THRUST) / DEG; // ≈ 65,8°

      // Un pas de poussée à θ ± 3° : l'écart de 3° change l'accélération sortante d'environ
      // 140·sin(66°)·3° ≈ 6,7 px/s² de part et d'autre de g, très au-dessus du seuil d'arrondi
      // TAKEOFF_MIN_NORMAL_SPEED/dt = 6e-5 px/s².
      for (const [offset, lifts] of [
        [-3, true],
        [3, false],
      ]) {
        const { world, ship } = landedWorld();
        ship.angle = wrapAngle(UP + sign * (limit + offset) * DEG);
        ship.intent.thrust = true;
        step(world, FIXED_DT);
        expect(ship.landedOn).toBe(lifts ? -1 : 0);
        expect(world.events.count).toBe(0);
        if (lifts) {
          // Vitesse sortante après un pas : (T·cosθ − g)·dt, au pas près de g (même position, même formule) ;
          // 1e-6 absorbe l'arrondi flottant sur des valeurs ~0,1 px/s.
          const outward = -ship.vel.y;
          expect(outward).toBeCloseTo(
            (SHIP_THRUST * Math.cos((limit - 3) * DEG) - gSurface) * FIXED_DT,
            6,
          );
          expect(outward).toBeGreaterThan(0);
        } else {
          expect(ship.vel.x).toBe(0);
          expect(ship.vel.y).toBe(0);
        }
      }
    },
  );
});

describe('décollage lent : poussée juste supérieure à la gravité', () => {
  it('nez à 55° (poussée sortante ≈ 80 > g ≈ 57) : décolle franchement, d croît, aucun événement', () => {
    const { world, ship } = landedWorld();
    ship.angle = wrapAngle(UP + 55 * DEG);
    ship.intent.thrust = true;

    step(world, FIXED_DT);
    expect(ship.landedOn).toBe(-1); // décollage dès le premier pas
    expect(world.events.count).toBe(0); // pas d'IMPACT parasite au décollage

    let previous = distanceTo(ship, SOLO[0]);
    for (let i = 1; i < 2 * ONE_SECOND; i++) {
      step(world, FIXED_DT);
      expect(world.events.count).toBe(0);
      const d = distanceTo(ship, SOLO[0]);
      expect(d).toBeGreaterThan(previous); // montée strictement croissante (poussée nette sortante ≥ 23 px/s²)
      previous = d;
    }
    // Accélération sortante nette ≥ 80 − 57 = 23 px/s² : après 2 s, ≥ ½·23·4 = 46 px gagnés en altitude
    // (la poussée tangentielle et la décroissance de g en ajoutent) ; borne basse volontairement prudente.
    expect(previous).toBeGreaterThan(CONTACT + 40);
    expect(ship.hp).toBe(SHIP_MAX_HP);
    expect(ship.alive).toBe(true);
  });

  it('nez à 75° (poussée sortante ≈ 36 < g) : reste posé', () => {
    const { world, ship } = landedWorld();
    ship.angle = wrapAngle(UP + 75 * DEG);
    ship.intent.thrust = true;
    for (let i = 0; i < 2 * ONE_SECOND; i++) step(world, FIXED_DT);
    expect(ship.landedOn).toBe(0);
    expect(world.events.count).toBe(0);
  });

  it.each([1, -1])(
    'nez à 63° (côté %i, net ≈ +6 px/s²), poussée 2 s : décollage très lent, d croît, aucun événement',
    (sign) => {
      const { world, ship } = landedWorld();
      ship.angle = wrapAngle(UP + sign * 63 * DEG);
      ship.intent.thrust = true;
      step(world, FIXED_DT);
      expect(ship.landedOn).toBe(-1);
      // Vitesse sortante du 1er pas : (140·cos63° − g(66))·dt = (63,56 − 57,35)/60 ≈ 0,104 px/s ;
      // toBeCloseTo(0.1, 1) = tolérance 0,05, large devant l'arrondi, serrée devant 0 (vaisseau posé).
      expect(-ship.vel.y).toBeCloseTo(0.1, 1);
      let previous = distanceTo(ship, SOLO[0]);
      for (let i = 1; i < 2 * ONE_SECOND; i++) {
        step(world, FIXED_DT);
        expect(world.events.count).toBe(0);
        const d = distanceTo(ship, SOLO[0]);
        expect(d).toBeGreaterThan(previous);
        previous = d;
      }
      // ½·6·4 = 12 px de gain sortant au minimum (g diminue avec l'altitude : plus en pratique).
      expect(previous).toBeGreaterThan(CONTACT + 10);
    },
  );

  describe('poussée brève à 63° (sauts périodiques)', () => {
    /** 10 pas de poussée à 63° de la normale, puis vol libre ; `pilot` peut agir à chaque pas. */
    function hops(total, pilot) {
      const { world, ship } = landedWorld();
      ship.angle = wrapAngle(UP + 63 * DEG);
      const impacts = [];
      const landings = [];
      let maxDamage = 0;
      for (let i = 0; i < total && !(landings.length > 0); i++) {
        ship.intent.thrust = i < 10;
        if (pilot && impacts.length > 0) ship.angle = normalAngle(ship, SOLO[0]);
        clearEvents(world.events);
        step(world, FIXED_DT);
        for (const e of eventsOf(world, EVT.IMPACT)) {
          impacts.push(i);
          maxDamage = Math.max(maxDamage, e.b);
        }
        if (eventsOf(world, EVT.LANDED).length > 0) landings.push(i);
      }
      return { world, ship, impacts, landings, maxDamage };
    }

    it('nez laissé à 63° : rebonds sans dégât à période constante, jamais d’atterrissage', () => {
      const { world, ship, impacts, landings, maxDamage } = hops(30 * ONE_SECOND);
      // Observé : un IMPACT (angle > 25°, 0 dégât) tous les ~75 pas (saut minimal de 30 px/s : 2·30/g
      // ≈ 1,05 s), soit ~24 en 30 s, sans jamais se poser. La vitesse tangentielle est divisée par 2 à chaque
      // rebond et tend vers 0 : la normale ne tourne plus et l'écart d'angle reste ≈ 63°. Les sauts ne
      // « convergent » donc pas : seul le pilote qui redresse le nez y met fin (test suivant).
      expect(landings).toEqual([]);
      expect(impacts.length).toBeGreaterThanOrEqual(20);
      expect(impacts.length).toBeLessThanOrEqual(30);
      for (let i = 1; i < impacts.length; i++) {
        expect(impacts[i] - impacts[i - 1]).toBeGreaterThan(60);
        expect(impacts[i] - impacts[i - 1]).toBeLessThan(90);
      }
      expect(maxDamage).toBe(0);
      expect(ship.hp).toBe(SHIP_MAX_HP);
      expect(ship.alive).toBe(true);
      expect(world.events.dropped).toBe(0);
      for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      // Les sauts restent bas : d ne dépasse jamais ≈ 75 px (observé 74,9).
      expect(distanceTo(ship, SOLO[0])).toBeLessThan(80);
    });

    it('nez ramené sur la normale après le premier saut : un seul IMPACT, puis atterrissage réussi', () => {
      const { ship, impacts, landings, maxDamage } = hops(30 * ONE_SECOND, true);
      expect(impacts).toHaveLength(1);
      expect(landings).toHaveLength(1);
      expect(landings[0]).toBeGreaterThan(impacts[0]);
      expect(maxDamage).toBe(0);
      expect(ship.landedOn).toBe(0);
      expect(ship.hp).toBe(SHIP_MAX_HP);
    });
  });
});

describe('cycle complet : atterrir, décoller, réatterrir', () => {
  it('3 cycles : LANDED exactement une fois par atterrissage, aucun IMPACT, jamais en rafale', () => {
    const planet = SOLO[0];
    const { world, ship } = landedWorld();
    let totalLanded = 1; // l'atterrissage initial de landedWorld
    let impacts = 0;
    let maxPerStep = 0;

    for (let cycle = 0; cycle < 3; cycle++) {
      // Décollage : nez à 40° de la normale locale, poussée pendant 15 pas (0,25 s). La composante
      // sortante 140·cos40° = 107 > g0 : décollage dès le premier pas.
      const normal = normalAngle(ship, planet);
      ship.angle = wrapAngle(normal + 40 * DEG);
      ship.intent.thrust = true;
      let landedThisCycle = 0;
      let airborne = false;
      let steps = 0;
      for (; steps < 15; steps++) {
        clearEvents(world.events);
        step(world, FIXED_DT);
        if (ship.landedOn < 0) airborne = true;
        landedThisCycle += eventsOf(world, EVT.LANDED).length;
        impacts += eventsOf(world, EVT.IMPACT).length;
        maxPerStep = Math.max(maxPerStep, world.events.count);
      }
      expect(airborne).toBe(true);

      // Poussée arrêtée, le pilote remet le nez sur la normale locale à chaque pas (comme landing.test.js)
      // et laisse retomber. Vitesses attendues à l'arrivée : radiale ≲ 30 px/s, tangentielle ≈ 22 px/s :
      // sous les seuils de 45 et 35 px/s.
      ship.intent.thrust = false;
      while (ship.landedOn < 0 && steps < 600) {
        ship.angle = normalAngle(ship, planet);
        clearEvents(world.events);
        step(world, FIXED_DT);
        steps++;
        landedThisCycle += eventsOf(world, EVT.LANDED).length;
        impacts += eventsOf(world, EVT.IMPACT).length;
        maxPerStep = Math.max(maxPerStep, world.events.count);
      }
      expect(ship.landedOn).toBe(0);
      expect(landedThisCycle).toBe(1);
      totalLanded += landedThisCycle;
      // Un cycle (montée de 15 pas + chute de quelques dizaines) reste bien en dessous de 10 s.
      expect(steps).toBeLessThan(10 * ONE_SECOND);

      // Posé : 120 pas sans intention de poussée ne réémettent jamais LANDED.
      for (let i = 0; i < 120; i++) {
        clearEvents(world.events);
        step(world, FIXED_DT);
        expect(world.events.count).toBe(0);
      }
    }
    expect(totalLanded).toBe(4);
    expect(impacts).toBe(0);
    expect(maxPerStep).toBeLessThanOrEqual(1);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });
});

describe('posé : insensible à la gravité des autres planètes', () => {
  // Deux planètes dont les champs se recouvrent (centres à 150 px) : la voisine tire fortement sur
  // le point d'atterrissage (au-dessus de A), mais un vaisseau posé saute la gravité.
  const A = { x: CX, y: CY, radius: RADIUS, gravity: 70 };
  const B = { x: CX + 150, y: CY, radius: RADIUS, gravity: 70 };

  it('posé sur A, 600 pas : position et vitesse identiques à l’octet malgré l’attraction de B', () => {
    const { world, ship } = landedWorld([A, B], 0);
    // Garde-fou : la gravité de B seule au point où le vaisseau est posé n'est pas négligeable
    // (> 5 px/s², soit > 7 % de g0), sinon le test ne prouverait rien.
    const pull = gravityAt({ x: 0, y: 0 }, ship.pos, [world.planets[1]]);
    expect(Math.hypot(pull.x, pull.y)).toBeGreaterThan(5);

    const { x, y } = ship.pos;
    for (let i = 0; i < 600; i++) {
      step(world, FIXED_DT);
      expect(world.events.count).toBe(0);
    }
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.x).toBe(x);
    expect(ship.pos.y).toBe(y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
  });
});

describe('décollage : déterminisme', () => {
  const STEPS = 3000;

  /** Atterrissage réel, puis rotation et poussée tirées dans world.rng (un tirage par pas et par intention). */
  function run(seed) {
    const world = createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: SOLO,
        spawns: [{ x: CX, y: CY - (CONTACT + 2), angle: UP }],
      },
      seed,
      { eventCapacity: 64 },
    );
    const ship = world.ships[0];
    ship.vel.y = 40;
    let liftoffs = 0;
    let contacts = 0;
    for (let i = 0; i < STEPS; i++) {
      // Les tirages ne commencent qu'une fois posé (l'atterrissage initial est donc le même pour toutes les seeds).
      if (world.tick >= 10) {
        ship.intent.rotate = int(world.rng, -1, 2);
        ship.intent.thrust = int(world.rng, 0, 2) === 1;
      }
      const wasLanded = ship.landedOn >= 0;
      clearEvents(world.events);
      step(world, FIXED_DT);
      if (wasLanded && ship.landedOn < 0) liftoffs++;
      contacts += contactCount(world);
    }
    return { world, liftoffs, contacts };
  }

  it('même seed et même script : JSON identique après 3000 pas, état fini', () => {
    const a = run(11);
    const b = run(11);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(a.liftoffs).toBe(b.liftoffs);
    expect(a.contacts).toBe(b.contacts);

    const ship = a.world.ships[0];
    for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle, ship.hp]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Le script a vraiment exercé le décollage (sinon le test ne couvrirait que de la physique en vol).
    expect(a.liftoffs).toBeGreaterThan(0);
  });

  it('une autre seed donne une trajectoire différente (le script dépend bien du rng)', () => {
    expect(JSON.stringify(run(11).world.ships[0])).not.toBe(JSON.stringify(run(12).world.ships[0]));
  });
});
