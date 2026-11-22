import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT, GRAVITY_RANGE_FACTOR } from '../../src/config.js';
import { gravityAt, potential } from '../../src/core/gravity.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Scénarios de gravité (ADR 0003 §5) sur des mini-cartes en ligne, loin des murs.
// La collision planète n'existe pas encore (item 2.3) : aucune simulation ne doit entrer en contact,
// c'est-à-dire atteindre d = r + SHIP_COLLISION_RADIUS. Les scénarios s'arrêtent avant, et les
// invariants « jamais de contact » sont vérifiés pas à pas.
const SHIP_COLLISION_RADIUS = 6; // pas encore dans config.js (ADR 0003 §4)
const OPTIONS = { eventCapacity: EVENT_CAPACITY };
const TWO_PI = 2 * Math.PI;

// Carte 4000×4000, planète au centre : les murs (à 2000 px) sont hors de toute trajectoire testée.
const CX = 2000;
const CY = 2000;
const SIZE = 4000;

// Planète de référence : r = 60, g0 = 70 → R = 300, mu = 262500.
const REF = { x: CX, y: CY, radius: 60, gravity: 70 };

function makeWorld(planets, seed = 1) {
  return createWorld(
    { width: SIZE, height: SIZE, planets, spawns: [{ x: CX, y: CY, angle: 0 }] },
    seed,
    OPTIONS,
  );
}

/** Pose le vaisseau 0 (rotation et poussée restent désactivées : intent par défaut). */
function place(world, x, y, vx = 0, vy = 0) {
  const ship = world.ships[0];
  ship.pos.x = x;
  ship.pos.y = y;
  ship.vel.x = vx;
  ship.vel.y = vy;
  return ship;
}

function distTo(ship, planet) {
  return Math.hypot(ship.pos.x - planet.pos.x, ship.pos.y - planet.pos.y);
}

function speed(ship) {
  return Math.hypot(ship.vel.x, ship.vel.y);
}

/** Énergie spécifique ½v² + U(d), la grandeur conservée par la dynamique (U : voir gravity.js). */
function energy(ship, planet) {
  return 0.5 * speed(ship) ** 2 + potential(planet, distTo(ship, planet));
}

/** Vitesse circulaire v = sqrt(d · a(d)), a(d) lu via gravityAt (pas de formule recopiée). */
function circularSpeed(world, d) {
  const acc = gravityAt({ x: 0, y: 0 }, { x: CX + d, y: CY }, world.planets);
  return Math.sqrt(d * Math.hypot(acc.x, acc.y));
}

/**
 * Vaisseau en orbite circulaire à la distance `d` ; renvoie le suivi sur `turns` tours.
 * Un tour ≈ 2π·d / v_circ secondes, converti en pas de FIXED_DT.
 */
function simulateOrbit(planetDef, d, turns) {
  const world = makeWorld([planetDef]);
  const planet = world.planets[0];
  const vCirc = circularSpeed(world, d);
  const ship = place(world, CX + d, CY, 0, vCirc);
  const stepsPerTurn = Math.round((TWO_PI * d) / vCirc / FIXED_DT);
  const total = stepsPerTurn * turns;

  const e0 = energy(ship, planet);
  const track = {
    world,
    planet,
    ship,
    vCirc,
    stepsPerTurn,
    e0,
    dMin: d,
    dMax: d,
    eMin: e0,
    eMax: e0,
    angle: 0, // angle polaire cumulé (déroulé) : mesure le nombre de tours réellement parcourus
    firstTurnEnergySum: 0,
    lastTurnEnergySum: 0,
  };

  let prevTheta = 0;
  for (let i = 0; i < total; i++) {
    step(world, FIXED_DT);
    const dist = distTo(ship, planet);
    const e = energy(ship, planet);
    track.dMin = Math.min(track.dMin, dist);
    track.dMax = Math.max(track.dMax, dist);
    track.eMin = Math.min(track.eMin, e);
    track.eMax = Math.max(track.eMax, e);
    if (i < stepsPerTurn) track.firstTurnEnergySum += e;
    if (i >= total - stepsPerTurn) track.lastTurnEnergySum += e;

    const theta = Math.atan2(ship.pos.y - CY, ship.pos.x - CX);
    let dTheta = theta - prevTheta;
    if (dTheta > Math.PI) dTheta -= TWO_PI;
    if (dTheta < -Math.PI) dTheta += TWO_PI;
    track.angle += dTheta;
    prevTheta = theta;
    if (dist <= planet.radius + SHIP_COLLISION_RADIUS)
      throw new Error('contact : scénario invalide');
  }
  return track;
}

describe('gravité : chute libre depuis le repos (r = 60, g0 = 70, d0 = 3·r)', () => {
  const D0 = 3 * REF.radius;
  const D_CONTACT = REF.radius + SHIP_COLLISION_RADIUS;

  /**
   * Chute radiale le long de +x au pas `dt`. S'arrête au dernier pas qui laisse d > r + 6 : le pas
   * qui franchirait le seuil est annulé (le test restaure pos/vel qu'il a lui-même écrasés), donc
   * le vaisseau n'entre jamais en contact.
   */
  function fall(dt) {
    const world = makeWorld([REF]);
    const planet = world.planets[0];
    const ship = place(world, CX + D0, CY);
    let steps = 0;
    let dPrev = D0;
    for (;;) {
      const { x, y } = ship.pos;
      const { x: vx, y: vy } = ship.vel;
      step(world, dt);
      const d = distTo(ship, planet);
      if (d <= D_CONTACT) {
        ship.pos.x = x;
        ship.pos.y = y;
        ship.vel.x = vx;
        ship.vel.y = vy;
        break;
      }
      expect(d).toBeLessThan(dPrev); // décroissance stricte à chaque pas
      dPrev = d;
      steps++;
    }
    const dEnd = distTo(ship, planet);
    // Instant de franchissement de d = r + 6 : extrapolation linéaire du dernier pas (erreur O(dt²)),
    // pour ne pas comparer deux arrêts quantifiés par le pas (jusqu'à 1 pas = 0,3 % du temps de chute).
    const fallTime = steps * dt + (dEnd - D_CONTACT) / speed(ship);
    return { planet, ship, dEnd, fallTime, steps };
  }

  it('la distance décroît strictement et la chute reste radiale', () => {
    const { ship, steps } = fall(FIXED_DT);
    expect(steps).toBeGreaterThan(100); // chute de ~5,5 s : le test a vraiment tourné
    // Force purement selon x, y jamais touché : exactement nul.
    expect(ship.pos.y).toBe(CY);
    expect(ship.vel.y).toBe(0);
  });

  it('la vitesse en bas de chute correspond à sqrt(2·(U(d0) − U(d))) à 2 %', () => {
    const { planet, ship, dEnd } = fall(FIXED_DT);
    expect(dEnd).toBeGreaterThan(D_CONTACT);
    // Le pas final s'arrête au plus ~1,3 px (v·dt) au-dessus de r + 6 : on compare à la distance
    // réellement atteinte plutôt qu'au seuil exact, pour que l'écart mesuré soit celui de l'intégrateur.
    expect(dEnd - D_CONTACT).toBeLessThan(2);
    const expected = Math.sqrt(2 * (potential(planet, D0) - potential(planet, dEnd)));
    // Euler semi-implicite à 1/60 : écart observé < 1 % ; la tolérance de 2 % est celle de l'ADR.
    expect(Math.abs(speed(ship) - expected) / expected).toBeLessThan(0.02);
    // Ordre de grandeur de l'ADR : ~65 px/s à la contact (75 px/s à la surface exacte).
    expect(speed(ship)).toBeGreaterThan(60);
    expect(speed(ship)).toBeLessThan(75);
  });

  it('le temps de chute converge : dt = 1/60 et dt = 1/240 diffèrent de moins de 2 %', () => {
    const coarse = fall(FIXED_DT);
    const fine = fall(FIXED_DT / 4);
    expect(coarse.steps).toBeLessThan(fine.steps);
    // Euler est d'ordre 1 : l'écart est O(dt) et observé à ~0,1 % ; 2 % est la marge de l'ADR.
    expect(Math.abs(coarse.fallTime - fine.fallTime) / fine.fallTime).toBeLessThan(0.02);
    // Les deux fins de chute sont aussi cohérentes en énergie : E = ½v² + U doit rester égale à U(d0)
    // (départ au repos) à 2 % du budget d'énergie converti en vitesse, U(d0) − U(d) (erreur d'Euler O(dt)).
    for (const run of [coarse, fine]) {
      const budget = potential(run.planet, D0) - potential(run.planet, run.dEnd);
      const e = energy(run.ship, run.planet);
      expect(Math.abs(e - potential(run.planet, D0)) / budget).toBeLessThan(0.02);
    }
  });
});

describe('gravité : orbites', () => {
  it('orbite circulaire à d = 2·r : rayon à ±1 % sur 10 tours', () => {
    const d = 2 * REF.radius;
    const t = simulateOrbit(REF, d, 10);
    // Le nombre de tours en pas est cohérent avec la période théorique (~1055 pas).
    expect(t.stepsPerTurn).toBeGreaterThan(1000);
    expect(t.stepsPerTurn).toBeLessThan(1100);
    // 10 tours réellement parcourus, à 0,5 % près : la période Euler diffère de la théorique de O(dt).
    expect(Math.abs(t.angle / TWO_PI - 10) / 10).toBeLessThan(0.005);
    // Écart de rayon observé ~0,4 % (excentricité induite par le premier demi-pas) ; borne de l'ADR : 1 %.
    expect(t.dMin).toBeGreaterThan(d * 0.99);
    expect(t.dMax).toBeLessThan(d * 1.01);
  });

  it('orbite circulaire à d = 2·r : énergie à ±1 % sur 100 tours, sans dérive', () => {
    const d = 2 * REF.radius;
    const t = simulateOrbit(REF, d, 100);
    expect(t.stepsPerTurn * 100).toBeGreaterThan(100000); // > 1e5 pas simulés
    const eEnd = energy(t.ship, t.planet);
    // E0 = +131,25 > 0 (potentiel nul à R) : on borne donc par rapport à |E0|, valeur initiale de l'ADR.
    const tol = 0.01 * Math.abs(t.e0);
    // Début/fin : l'énergie finale reste à ±1 % de l'initiale (observé : 0,02 %).
    expect(Math.abs(eEnd - t.e0)).toBeLessThan(tol);
    // Extrema sur toute la durée : l'oscillation de l'énergie reste dans la même bande.
    expect(t.eMin).toBeGreaterThan(t.e0 - tol);
    expect(t.eMax).toBeLessThan(t.e0 + tol);
    // Pas de dérive : l'énergie moyenne du dernier tour égale celle du premier, à 0,1 % de |E0|
    // près (une dérive linéaire même faible, accumulée sur 100 tours, dépasserait cette borne).
    const mean = (sum) => sum / t.stepsPerTurn;
    const drift = mean(t.lastTurnEnergySum) - mean(t.firstTurnEnergySum);
    expect(Math.abs(drift)).toBeLessThan(0.001 * Math.abs(t.e0));
    // Au bout de 100 tours, le rayon est toujours borné : pas de spirale lente.
    expect(t.dMin).toBeGreaterThan(d * 0.99);
    expect(t.dMax).toBeLessThan(d * 1.01);
  });

  it('orbite rasante (r = 30, g0 = 84, d = r + 10) : rayon à ±3 % sur 10 tours', () => {
    const def = { x: CX, y: CY, radius: 30, gravity: 84 };
    const d = def.radius + 10;
    const t = simulateOrbit(def, d, 10);
    // v_circ ≈ 42,8 px/s, période ≈ 5,9 s ≈ 353 pas : ω·dt ≈ 0,018, le cas le plus raide de l'ADR.
    expect(t.stepsPerTurn).toBeGreaterThan(340);
    expect(t.stepsPerTurn).toBeLessThan(370);
    expect(Math.abs(t.angle / TWO_PI - 10) / 10).toBeLessThan(0.01);
    // Écart observé ~1 % (O(ω·dt) plus grand qu'à d = 2·r) ; borne de l'ADR : 3 %.
    expect(t.dMin).toBeGreaterThan(d * 0.97);
    expect(t.dMax).toBeLessThan(d * 1.03);
    // Toujours hors contact (d > r + 6 = 36) : vérifié aussi en continu dans simulateOrbit.
    expect(t.dMin).toBeGreaterThan(def.radius + SHIP_COLLISION_RADIUS);
  });
});

describe('gravité : espace inertiel hors portée', () => {
  const RANGE = GRAVITY_RANGE_FACTOR * REF.radius; // R = 300

  it.each([
    ['approche radiale', { dx: 1000, vx: -60, vy: 0 }],
    ['trajectoire tangentielle', { dx: 400, vx: 0, vy: 40 }],
    ['en diagonale, vitesse non entière', { dx: 700, vx: -13.7, vy: 21.3 }],
  ])('%s : la vitesse est strictement constante sur 600 pas (d > R)', (_label, { dx, vx, vy }) => {
    const world = makeWorld([REF]);
    const planet = world.planets[0];
    const ship = place(world, CX + dx, CY, vx, vy);
    for (let i = 0; i < 600; i++) {
      step(world, FIXED_DT);
      // Hors portée la gravité saute la planète (aucune opération sur vel) : égalité exacte, pas de tolérance.
      expect(ship.vel.x).toBe(vx);
      expect(ship.vel.y).toBe(vy);
      expect(distTo(ship, planet)).toBeGreaterThan(RANGE);
    }
  });
});

describe('gravité : continuité à la frontière de portée R', () => {
  const RANGE = GRAVITY_RANGE_FACTOR * REF.radius;
  const G0_DT = REF.gravity * FIXED_DT; // saut d'accélération « visible » : g0·dt
  // Une coupure franche (sans le terme −mu/R²) laisserait un saut de mu/R² = 2,9 px/s² en R, soit
  // 0,049 px/s par pas. Avec la coupure douce, juste en deçà de R (≤ 1 pas = 1,7 px à 100 px/s) :
  // a ≈ 2·mu·ε/R³ ≤ 0,033 px/s², soit ≤ 5,4e-4 px/s par pas. 5e-3 sépare nettement les deux cas.
  const SOFT_STEP = 5e-3;

  /** Vol libre à vitesse initiale radiale ; renvoie les sauts de vitesse par pas et ceux du pas de franchissement. */
  function crossing(startDx, vx, steps) {
    const world = makeWorld([REF]);
    const planet = world.planets[0];
    const ship = place(world, CX + startDx, CY, vx, 0);
    const jumps = [];
    const crossingJumps = [];
    let crossingStep = -1;
    for (let i = 0; i < steps; i++) {
      const dBefore = distTo(ship, planet);
      const vBefore = ship.vel.x;
      step(world, FIXED_DT);
      jumps.push(Math.abs(ship.vel.x - vBefore));
      if (crossingStep < 0 && (dBefore - RANGE) * (distTo(ship, planet) - RANGE) <= 0)
        crossingStep = i;
      expect(distTo(ship, planet)).toBeGreaterThan(planet.radius + SHIP_COLLISION_RADIUS);
    }
    expect(crossingStep).toBeGreaterThanOrEqual(0); // la frontière a bien été franchie
    // Pas de franchissement, le suivant (gravité évaluée juste de l'autre côté) et le précédent.
    for (const i of [crossingStep - 1, crossingStep, crossingStep + 1]) {
      if (i >= 0 && i < jumps.length) crossingJumps.push(jumps[i]);
    }
    return { jumps, crossingJumps, ship, planet };
  }

  it('entrant à 100 px/s : aucun saut d’accélération (écart entre pas < g0·dt, et ≪ à la frontière)', () => {
    const { jumps, crossingJumps } = crossing(RANGE + 3, -100, 90);
    for (const jump of jumps) expect(jump).toBeLessThan(G0_DT);
    for (const jump of crossingJumps) expect(jump).toBeLessThan(SOFT_STEP);
  });

  it('sortant à 150 px/s : aucun saut d’accélération, puis vitesse strictement constante', () => {
    const { jumps, crossingJumps, ship, planet } = crossing(RANGE - 100, 150, 120);
    for (const jump of jumps) expect(jump).toBeLessThan(G0_DT);
    for (const jump of crossingJumps) expect(jump).toBeLessThan(SOFT_STEP);
    // Une fois dehors, plus aucune variation (voir « espace inertiel »).
    expect(distTo(ship, planet)).toBeGreaterThan(RANGE + 50);
    expect(jumps[jumps.length - 1]).toBe(0);
  });

  it('un vaisseau entrant gagne bien de la vitesse vers la planète (le champ n’est pas nul)', () => {
    const { ship } = crossing(RANGE + 3, -100, 90);
    // Vitesse vers la planète = −vx > 100 : sans cela, les tests de continuité seraient triviaux.
    expect(-ship.vel.x).toBeGreaterThan(100.5);
  });
});

describe('gravité : superposition', () => {
  const OFFSET = 200; // dans la portée (R = 300) de chacune des planètes

  /** Vaisseau au repos au centre de la carte, planètes aux positions relatives données. */
  function restAt(offsets, steps) {
    const planets = offsets.map(({ dx, dy, radius = 60, gravity = 70 }) => ({
      x: CX + dx,
      y: CY + dy,
      radius,
      gravity,
    }));
    const world = makeWorld(planets);
    const ship = place(world, CX, CY);
    for (let i = 0; i < steps; i++) step(world, FIXED_DT);
    return ship;
  }

  it('deux planètes identiques symétriques (axe x) : la vitesse reste ~0', () => {
    const ship = restAt(
      [
        { dx: -OFFSET, dy: 0 },
        { dx: OFFSET, dy: 0 },
      ],
      600,
    );
    // Les deux contributions sont des opposés exacts en arithmétique flottante (mêmes d, mêmes a) :
    // 1e-9 n'est qu'une marge d'arrondi sur 600 additions de termes ~0.
    expect(ship.vel.x).toBeCloseTo(0, 9);
    expect(ship.vel.y).toBeCloseTo(0, 9);
    expect(ship.pos.x).toBeCloseTo(CX, 9);
    expect(ship.pos.y).toBeCloseTo(CY, 9);
  });

  it('deux planètes symétriques en diagonale : la vitesse reste ~0', () => {
    const ship = restAt(
      [
        { dx: -120, dy: -160 }, // d = 200
        { dx: 120, dy: 160 },
      ],
      600,
    );
    // Composantes opposées au bit près (dx² identiques) ; 1e-9 = marge d'arrondi.
    expect(ship.vel.x).toBeCloseTo(0, 9);
    expect(ship.vel.y).toBeCloseTo(0, 9);
  });

  it('témoin : une seule de ces planètes suffit à mettre le vaisseau en mouvement vers elle', () => {
    const ship = restAt([{ dx: OFFSET, dy: 0 }], 60);
    // a(200) = mu·(1/200² − 1/300²) ≈ 3,65 px/s² pendant ~1 s : ~3,6 px/s, nettement ≫ 1e-9.
    expect(ship.vel.x).toBeGreaterThan(3);
    expect(ship.vel.x).toBeLessThan(4.5);
    expect(ship.vel.y).toBe(0);
  });

  it('planètes inégales : l’accélération est la somme des accélérations individuelles', () => {
    const a = { dx: 150, dy: 40, radius: 60, gravity: 70 };
    const b = { dx: -70, dy: 90, radius: 30, gravity: 84 };
    // Un seul pas : l'accélération vaut v/dt, comparée entre le monde à deux planètes et les mondes à une.
    const both = restAt([a, b], 1).vel;
    const onlyA = restAt([a], 1).vel;
    const onlyB = restAt([b], 1).vel;
    // Somme de flottants : erreur ≤ quelques ulp de ~0,06 px/s, donc 12 décimales sont sûres.
    expect(both.x).toBeCloseTo(onlyA.x + onlyB.x, 12);
    expect(both.y).toBeCloseTo(onlyA.y + onlyB.y, 12);
    expect(Math.hypot(onlyA.x, onlyA.y)).toBeGreaterThan(0.01);
    expect(Math.hypot(onlyB.x, onlyB.y)).toBeGreaterThan(0.01);
  });
});

describe('gravité : déterminisme', () => {
  const PLANET_A = { x: 1000, y: 1500, radius: 60, gravity: 70 };
  const PLANET_B = { x: 2000, y: 1500, radius: 40, gravity: 80 };
  const MAP = {
    width: 3000,
    height: 3000,
    planets: [PLANET_A, PLANET_B],
    spawns: [{ x: 1500, y: 800, angle: 0 }],
  };
  const STEPS = 3000;

  /** Vol scripté (rotation tirée dans world.rng, poussée par rafales) autour de 2 planètes, sans contact. */
  function fly(seed) {
    const world = createWorld(MAP, seed, OPTIONS);
    const ship = world.ships[0];
    const { intent } = ship;
    let minClearance = Infinity;
    for (let i = 0; i < STEPS; i++) {
      intent.rotate = int(world.rng, -1, 2);
      intent.thrust = world.tick % 9 < 3;
      step(world, FIXED_DT);
      for (const planet of world.planets) {
        minClearance = Math.min(minClearance, distTo(ship, planet) - planet.radius);
      }
    }
    return { world, minClearance };
  }

  it('même seed et même script : JSON identique après 3000 pas, état fini, sans contact', () => {
    const a = fly(42);
    const b = fly(42);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));

    const ship = a.world.ships[0];
    for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Le vaisseau a réellement volé, et sans jamais toucher une planète (collision : item 2.3).
    expect(Math.hypot(ship.pos.x - 1500, ship.pos.y - 800)).toBeGreaterThan(1);
    expect(a.minClearance).toBeGreaterThan(SHIP_COLLISION_RADIUS);
  });

  it('une autre seed donne une trajectoire différente (le script dépend bien du rng)', () => {
    const a = fly(42).world.ships[0];
    const b = fly(43).world.ships[0];
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(Number.isFinite(b.pos.x) && Number.isFinite(b.vel.y)).toBe(true);
  });
});
