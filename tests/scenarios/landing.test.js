import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  IMPACT_MIN_BOUNCE_SPEED,
  LANDING_MAX_ANGLE,
  SHIP_COLLISION_RADIUS,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { wrapAngle } from '../../src/core/math.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Scénarios d'atterrissage et d'impact (ADR 0003 §4 et §5) sur une mini-carte : une planète
// r = 60, g0 = 70, au centre d'une carte 4000×4000 (murs hors de toute trajectoire).
// Le vaisseau est posé à la main (pos/vel/angle) juste au-dessus du seuil de contact r + 6 ; un pas
// ajoute g·dt ≈ 0,9–1,2 px/s à la vitesse d'approche, d'où les marges choisies sur les vitesses.
// Les dégâts sont lus dans la charge utile `b` de IMPACT (leur application aux PV est l'item 2.4).
const SIZE = 4000;
const CX = 2000;
const CY = 2000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2; // normale sortante « au-dessus » de la planète (y vers le bas à l'écran)
const DEG = Math.PI / 180;

function makeWorld(seed = 1) {
  return createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets: [{ x: CX, y: CY, radius: RADIUS, gravity: 70 }],
      spawns: [{ x: CX, y: CY, angle: 0 }],
    },
    seed,
    { eventCapacity: 64 },
  );
}

/**
 * Place le vaisseau 0 à `altitude` px au-dessus du seuil de contact, dans la direction `phi` (angle de
 * la normale sortante). `radial` > 0 = vers le centre, `tangential` le long de t = (−n.y, n.x),
 * `angleOffset` = écart du nez à la normale.
 */
function launch(
  world,
  { phi = UP, radial = 0, tangential = 0, angleOffset = 0, altitude = 2 } = {},
) {
  const nx = Math.cos(phi);
  const ny = Math.sin(phi);
  const ship = world.ships[0];
  ship.pos.x = CX + nx * (CONTACT + altitude);
  ship.pos.y = CY + ny * (CONTACT + altitude);
  ship.vel.x = -radial * nx - tangential * ny;
  ship.vel.y = -radial * ny + tangential * nx;
  ship.angle = wrapAngle(phi + angleOffset);
  return ship;
}

function distance(ship) {
  return Math.hypot(ship.pos.x - CX, ship.pos.y - CY);
}

/** Composante radiale sortante de la vitesse (> 0 = on s'éloigne du centre). */
function outward(ship) {
  return (ship.vel.x * (ship.pos.x - CX) + ship.vel.y * (ship.pos.y - CY)) / distance(ship);
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Avance jusqu'au premier pas qui émet un événement (maxSteps ≈ 1 s : le contact est imminent). */
function stepToContact(world, maxSteps = 60) {
  clearEvents(world.events);
  for (let i = 0; i < maxSteps; i++) {
    step(world, FIXED_DT);
    if (world.events.count > 0) return i + 1;
  }
  throw new Error('aucun contact dans le délai : scénario invalide');
}

/** Lance un scénario jusqu'au contact et renvoie le monde, le vaisseau et les événements du pas. */
function contact(options) {
  const world = makeWorld();
  const ship = launch(world, options);
  stepToContact(world);
  return {
    world,
    ship,
    landed: eventsOf(world, EVT.LANDED),
    impacts: eventsOf(world, EVT.IMPACT),
  };
}

describe('atterrissage : vitesse radiale (nez sur la normale)', () => {
  it.each([
    ['au-dessus', UP],
    ['à droite', 0],
    ['en bas', Math.PI / 2],
    ['en diagonale', 2.3],
  ])('40 px/s (%s) : posé, un seul LANDED, vitesse nulle, aucun IMPACT', (_label, phi) => {
    const { ship, landed, impacts } = contact({ phi, radial: 40 });
    expect(ship.landedOn).toBe(0);
    expect(landed).toHaveLength(1);
    expect(impacts).toHaveLength(0);
    // Atterrissage : vel est affectée à 0 (pas un calcul) → égalité exacte.
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    // LANDED : a = vaisseau 0, b = planète 0, x/y = point de surface (d = r).
    expect(landed[0].a).toBe(0);
    expect(landed[0].b).toBe(0);
    expect(Math.hypot(landed[0].x - CX, landed[0].y - CY)).toBeCloseTo(RADIUS, 9); // arrondi flottant
    // Le vaisseau est reprojeté exactement sur le seuil de contact, à l'arrondi près.
    expect(distance(ship)).toBeCloseTo(CONTACT, 9);
    // Le nez est conservé : aucune orientation forcée.
    expect(wrapAngle(ship.angle - phi)).toBeCloseTo(0, 12);
  });

  it('50 px/s : IMPACT aux dégâts ≈ excès (5 à 8), non posé, rebond sortant', () => {
    const { world, ship, landed, impacts } = contact({ radial: 50 });
    expect(landed).toHaveLength(0);
    expect(impacts).toHaveLength(1);
    expect(ship.landedOn).toBe(-1);
    // Vitesse d'approche au contact ≈ 50 + ~5 pas·1 px/s² → excès au-dessus de 45 : ≈ 6 (marge 5 à 8).
    expect(impacts[0].b).toBeGreaterThan(5);
    expect(impacts[0].b).toBeLessThan(8);
    expect(impacts[0].a).toBe(0);
    // Rebond : 0,3 × ~56 = 17 < 30 → c'est le rebond minimal qui s'applique, vers l'extérieur.
    expect(outward(ship)).toBeGreaterThanOrEqual(IMPACT_MIN_BOUNCE_SPEED - 1e-9); // arrondi flottant
    // La distance au centre augmente ensuite (sur 20 pas ≈ 0,33 s, montée de 30 px/s freinée par g).
    let previous = distance(ship);
    for (let i = 0; i < 20; i++) {
      step(world, FIXED_DT);
      expect(distance(ship)).toBeGreaterThan(previous);
      previous = distance(ship);
    }
    expect(ship.landedOn).toBe(-1);
  });

  it('150 px/s : IMPACT dont les dégâts dépassent 100 PV (mortel)', () => {
    const { impacts } = contact({ radial: 150 });
    expect(impacts).toHaveLength(1);
    // Excès ≥ 150 − 45 = 105 avant même l'accélération gravitationnelle des derniers pas.
    expect(impacts[0].b).toBeGreaterThan(100);
  });
});

describe('atterrissage : vitesse tangentielle', () => {
  // Une composante radiale de 20 px/s (< 45) amène le vaisseau au contact en ~6 pas ; la composante
  // tangentielle est conservée par la gravité (force radiale), à ~1 % près (la normale tourne de ~0,04 rad).
  it.each([30, -30])('%i px/s tangentiel : posé', (tangential) => {
    const { ship, landed, impacts } = contact({ radial: 20, tangential });
    expect(ship.landedOn).toBe(0);
    expect(landed).toHaveLength(1);
    expect(impacts).toHaveLength(0);
  });

  it.each([45, -45])('%i px/s tangentiel : IMPACT, dégâts ≈ excès (≈ 10)', (tangential) => {
    const { ship, landed, impacts } = contact({ radial: 20, tangential });
    expect(landed).toHaveLength(0);
    expect(impacts).toHaveLength(1);
    expect(ship.landedOn).toBe(-1);
    // Excès = |vT| − 35 ≈ 10 (le radial 20 + g·t reste ≪ 45 : aucun dégât radial). Tolérance ±1,5
    // pour la rotation de la normale pendant l'approche.
    expect(impacts[0].b).toBeGreaterThan(8.5);
    expect(impacts[0].b).toBeLessThan(11.5);
    // Rebond garanti, vers l'extérieur.
    expect(outward(ship)).toBeGreaterThanOrEqual(IMPACT_MIN_BOUNCE_SPEED - 1e-9); // arrondi flottant
  });

  it('le frottement tangentiel de l’impact divise la vitesse le long de la surface par ~2', () => {
    const { ship } = contact({ radial: 20, tangential: 45 });
    const phi = Math.atan2(ship.pos.y - CY, ship.pos.x - CX);
    const vT = -ship.vel.x * Math.sin(phi) + ship.vel.y * Math.cos(phi);
    // 0,5 × ~45 = ~22,5 ; tolérance ±2 pour la dérive de la normale pendant l'approche.
    expect(vT).toBeGreaterThan(20.5);
    expect(vT).toBeLessThan(24.5);
  });
});

describe('atterrissage : angle du nez', () => {
  it('nez à 20° de la normale : posé', () => {
    for (const sign of [1, -1]) {
      const { ship, landed } = contact({ radial: 30, angleOffset: sign * 20 * DEG });
      expect(ship.landedOn).toBe(0);
      expect(landed).toHaveLength(1);
    }
  });

  it('nez à 30° : IMPACT sans dégât avec rebond ; nez corrigé, finit par se poser en peu de rebonds', () => {
    const world = makeWorld();
    const ship = launch(world, { radial: 30, angleOffset: 30 * DEG });
    stepToContact(world);
    const first = eventsOf(world, EVT.IMPACT);
    expect(first).toHaveLength(1);
    expect(eventsOf(world, EVT.LANDED)).toHaveLength(0);
    // Seul l'angle échoue : la sanction est le rebond, pas de dégât (max(0, …) donne exactement 0).
    expect(first[0].b).toBe(0);
    expect(ship.landedOn).toBe(-1);
    expect(outward(ship)).toBeGreaterThanOrEqual(IMPACT_MIN_BOUNCE_SPEED - 1e-9); // arrondi flottant

    // Le pilote corrige le nez (écrase l'angle) pendant le saut, puis laisse retomber.
    const phi = Math.atan2(ship.pos.y - CY, ship.pos.x - CX);
    ship.angle = phi;
    let impacts = 1;
    let steps = 0;
    clearEvents(world.events);
    while (ship.landedOn < 0 && steps < 2000) {
      step(world, FIXED_DT);
      steps++;
      impacts += eventsOf(world, EVT.IMPACT).length;
      clearEvents(world.events);
    }
    expect(ship.landedOn).toBe(0);
    // Retour à ~30 px/s radial (≤ 45) et nez corrigé : posé dès le premier retour au sol.
    expect(impacts).toBeLessThanOrEqual(3);
    expect(steps).toBeLessThan(200); // un saut de ~1 s ≈ 63 pas, très loin de la borne de 2000
    expect(distance(ship)).toBeCloseTo(CONTACT, 9); // arrondi flottant
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
  });

  it('la frontière de l’angle suit LANDING_MAX_ANGLE (25°) : 24° posé, 26° impact', () => {
    expect(LANDING_MAX_ANGLE).toBeCloseTo(25 * DEG, 12);
    expect(contact({ radial: 30, angleOffset: 24 * DEG }).ship.landedOn).toBe(0);
    expect(contact({ radial: 30, angleOffset: 26 * DEG }).impacts).toHaveLength(1);
  });
});

describe('impact : rebond minimal garanti', () => {
  it('approche lente (5 px/s) et nez à 90° : rebond ≥ IMPACT_MIN_BOUNCE_SPEED, pas de rafale sur 600 pas', () => {
    const world = makeWorld();
    const ship = launch(world, { radial: 5, angleOffset: 90 * DEG, altitude: 0.5 });
    const impactSteps = [];
    for (let i = 0; i < 600; i++) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      // Jamais à l'intérieur du seuil de contact à la fin d'un pas (reprojection), à l'arrondi près.
      expect(distance(ship)).toBeGreaterThanOrEqual(CONTACT - 1e-9);
      const hits = eventsOf(world, EVT.IMPACT);
      // Jamais plus d'un événement de contact par pas (pas de vibration au contact).
      expect(hits.length + eventsOf(world, EVT.LANDED).length).toBeLessThanOrEqual(1);
      if (hits.length > 0) {
        impactSteps.push(i);
        // Dégâts nuls (vitesses très inférieures aux seuils) et rebond minimal immédiatement après.
        expect(hits[0].b).toBe(0);
        expect(outward(ship)).toBeGreaterThanOrEqual(IMPACT_MIN_BOUNCE_SPEED - 1e-9); // arrondi flottant
      }
      expect(ship.landedOn).toBe(-1);
    }
    // Observé : le nez reste à 90° (jamais posé), le saut minimal (30 px/s sous g ≈ 57 px/s²) dure
    // ~1,05 s ≈ 63 pas : environ 9–10 impacts réguliers sur 10 s. Ils ne cessent pas (le nez est faux)
    // mais restent bornés : < 20 au total, et chaque saut dure plus de 40 pas (aucun contact au repos).
    expect(impactSteps.length).toBeGreaterThanOrEqual(5);
    expect(impactSteps.length).toBeLessThan(20);
    for (let i = 1; i < impactSteps.length; i++) {
      expect(impactSteps[i] - impactSteps[i - 1]).toBeGreaterThan(40);
    }
  });
});

describe('vaisseau posé', () => {
  function landedWorld() {
    const world = makeWorld();
    const ship = launch(world, { radial: 40 });
    stepToContact(world);
    expect(ship.landedOn).toBe(0);
    clearEvents(world.events);
    return { world, ship };
  }

  it('600 pas sans intention : position et vitesse identiques à l’octet, aucun nouvel événement', () => {
    const { world, ship } = landedWorld();
    const { x, y } = ship.pos;
    const angle = ship.angle;
    let landedEvents = 0;
    for (let i = 0; i < 600; i++) {
      step(world, FIXED_DT);
      landedEvents += eventsOf(world, EVT.LANDED).length;
    }
    // Un vaisseau posé saute gravité, intégration et collision : aucune opération sur pos/vel.
    expect(ship.pos.x).toBe(x);
    expect(ship.pos.y).toBe(y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.angle).toBe(angle);
    expect(ship.landedOn).toBe(0);
    expect(landedEvents).toBe(0);
    expect(world.events.count).toBe(0);
  });

  it('la rotation change l’angle sans déplacer le vaisseau, et ne le fait pas redécoller', () => {
    const { world, ship } = landedWorld();
    const { x, y } = ship.pos;
    const before = ship.angle;
    ship.intent.rotate = 1;
    for (let i = 0; i < 30; i++) step(world, FIXED_DT);
    // 30 pas × 3,2 rad/s × dt = 1,6 rad (modulo 2π) ; l'angle est enroulé, d'où la comparaison enroulée.
    // Arrondi : 30 additions de ~0,053 → erreur < 1e-12.
    expect(wrapAngle(ship.angle - before)).toBeCloseTo(30 * 3.2 * FIXED_DT, 9);
    expect(ship.pos.x).toBe(x);
    expect(ship.pos.y).toBe(y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.landedOn).toBe(0);
    expect(world.events.count).toBe(0);
  });
});

describe('collision : le vaisseau ne traverse jamais la planète', () => {
  it('pleine poussée vers la planète depuis le repos à 3·r : d ≥ r + rayon de collision à chaque pas', () => {
    const world = makeWorld();
    const ship = launch(world, { altitude: 0 });
    // Départ au repos à 3·r du centre, nez dirigé vers le centre (angle = normale + π).
    ship.pos.x = CX + 3 * RADIUS;
    ship.pos.y = CY;
    ship.vel.x = 0;
    ship.vel.y = 0;
    ship.angle = Math.PI;
    ship.intent.thrust = true;
    let impacts = 0;
    let dMin = Infinity;
    for (let i = 0; i < 1200; i++) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      const d = distance(ship);
      dMin = Math.min(dMin, d);
      // Inégalité stricte à 1e-9 près : la reprojection pose le vaisseau à d = r + 6 à l'arrondi flottant.
      expect(d).toBeGreaterThanOrEqual(CONTACT - 1e-9);
      expect(Number.isFinite(d)).toBe(true);
      impacts += eventsOf(world, EVT.IMPACT).length;
    }
    // Le scénario a vraiment frappé la planète (le test n'est pas trivial), plusieurs fois (le nez est
    // à 180° de la normale : jamais d'atterrissage possible).
    expect(impacts).toBeGreaterThan(3);
    expect(dMin).toBeLessThan(CONTACT + 1);
    expect(ship.landedOn).toBe(-1);
  });
});

describe('atterrissage : déterminisme', () => {
  const STEPS = 3000;

  /** Vol scripté (rotation tirée dans world.rng, poussée par rafales) à ~150 px de la planète. */
  function fly(seed) {
    const world = makeWorld(seed);
    const ship = world.ships[0];
    ship.pos.x = CX;
    ship.pos.y = CY - 150;
    ship.vel.x = 25;
    ship.vel.y = 20; // légèrement vers la planète : le contact est quasi certain
    ship.angle = Math.PI / 2; // nez vers la planète : la poussée en rafale accentue la chute
    let contacts = 0;
    let impacts = 0;
    for (let i = 0; i < STEPS; i++) {
      ship.intent.rotate = int(world.rng, -1, 2);
      ship.intent.thrust = world.tick % 7 < 2;
      clearEvents(world.events);
      step(world, FIXED_DT);
      for (let k = 0; k < world.events.count; k++) {
        const type = world.events.items[k].type;
        if (type === EVT.IMPACT) impacts++;
        if (type === EVT.IMPACT || type === EVT.LANDED) contacts++;
      }
    }
    return { world, contacts, impacts };
  }

  it('même seed et même script : JSON identique après 3000 pas, état fini', () => {
    const a = fly(7);
    const b = fly(7);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(a.contacts).toBe(b.contacts);

    const ship = a.world.ships[0];
    for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle, ship.hp]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Le vol a vraiment rencontré la planète (sinon le test ne couvrirait pas le contact).
    expect(a.contacts).toBeGreaterThan(0);
  });

  it('une autre seed donne une trajectoire différente (le script dépend bien du rng)', () => {
    expect(JSON.stringify(fly(7).world.ships[0])).not.toBe(JSON.stringify(fly(8).world.ships[0]));
  });
});
