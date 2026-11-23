import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  LANDING_MAX_RADIAL_SPEED,
  RESPAWN_DELAY,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { wrapAngle } from '../../src/core/math.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Dégâts d'impact, PV et mort (ADR 0003 §4) sur la même mini-carte que landing.test.js : une planète
// r = 60, g0 = 70, au centre d'une carte 4000×4000.
// Le vaisseau est posé à la main à 0,5 px au-dessus du seuil de contact r + 6 : aux vitesses de lancer
// utilisées ici (≥ ~60 px/s) il franchit le seuil en un seul pas (1,5 à 2,5 px par pas). La vitesse d'approche au contact vaut alors
// la vitesse de lancer + g·dt ≈ +1 px/s (g ≈ 57 px/s² à la surface, dt = 1/60). Les dégâts valent
// (approche − LANDING_MAX_RADIAL_SPEED) pour un lancer radial, d'où des marges de ~1,2 px/s sur les seuils
// ci-dessous. Les vitesses de lancer sont DÉRIVÉES de SHIP_MAX_HP et du seuil d'atterrissage (plus aucune
// vitesse en dur) : un rééquilibrage des PV déplace les vitesses, pas l'intention des tests.
// IMPORTANT : la planète de cette mini-carte n'a pas d'`owner` (neutre). Aucune planète n'appartient à la
// faction du vaisseau 0, donc un vaisseau mort ici ne réapparaît JAMAIS (mort définitive) : c'est ce qui
// garde valides les tests « vaisseau mort figé » ci-dessous. Les scénarios de réapparition (planète
// possédée) sont dans respawn.test.js.
const SIZE = 4000;
const CX = 2000;
const CY = 2000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2; // normale sortante « au-dessus » de la planète
const DEG = Math.PI / 180;
const SEUIL_RADIAL = LANDING_MAX_RADIAL_SPEED;
const GRAVITY_STEP = 1.2; // borne haute de g·dt pour un pas au contact (px/s)

// Dégâts visés (hors g·dt) et vitesses de lancer radiales correspondantes. Fractions choisies pour garder la
// logique « 2 impacts moyens survivent, 3 tuent » et « 2 impacts forts : survit au 1er, mort au 2e ».
const DAMAGE_MODERATE = 0.4 * SHIP_MAX_HP; // 2 × 0,4 = 0,8 < 1 (survie) ; 3 × 0,4 = 1,2 ≥ 1 (mort)
const SPEED_MODERATE = SEUIL_RADIAL + DAMAGE_MODERATE;
const DAMAGE_HEAVY = 0.6 * SHIP_MAX_HP; // < 1 PV max : survit seul ; 2 × 0,6 = 1,2 ≥ 1 : mort
const SPEED_HEAVY = SEUIL_RADIAL + DAMAGE_HEAVY;
const NEAR_DEATH_MARGIN = 5; // PV restants visés juste sous le seuil de mort (> g·dt = 1,2 : jamais mort)
const SPEED_NEAR_DEATH = SEUIL_RADIAL + SHIP_MAX_HP - NEAR_DEATH_MARGIN;
const SPEED_LETHAL = SEUIL_RADIAL + SHIP_MAX_HP + 5; // dégâts ≥ SHIP_MAX_HP + 5 : mort certaine

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

/** Place le vaisseau 0 juste au-dessus de la planète (voir landing.test.js), vitesse radiale `radial` vers le centre. */
function launch(
  world,
  { phi = UP, radial = 0, tangential = 0, angleOffset = 0, altitude = 0.5 } = {},
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

/** Avance jusqu'au premier pas qui émet un événement, puis renvoie une copie de tous les événements du pas. */
function stepToContact(world, maxSteps = 60) {
  clearEvents(world.events);
  for (let i = 0; i < maxSteps; i++) {
    step(world, FIXED_DT);
    if (world.events.count > 0) {
      const all = [];
      for (let k = 0; k < world.events.count; k++) all.push({ ...world.events.items[k] });
      return all;
    }
  }
  throw new Error('aucun contact dans le délai : scénario invalide');
}

/** Un impact radial à `radial` px/s sur un vaisseau (neuf par défaut) ; renvoie les événements du pas. */
function hit(world, radial) {
  launch(world, { radial });
  return stepToContact(world);
}

describe('dégâts : un impact retire des PV', () => {
  it('impact radial modéré depuis un vaisseau neuf : hp ≈ SHIP_MAX_HP − dégâts, vivant, un IMPACT, pas d’EXPLOSION', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    expect(ship.hp).toBe(SHIP_MAX_HP);
    const events = hit(world, SPEED_MODERATE);
    const impacts = events.filter((e) => e.type === EVT.IMPACT);
    expect(impacts).toHaveLength(1);
    expect(events.filter((e) => e.type === EVT.EXPLOSION)).toHaveLength(0);
    // Dégâts = approche − seuil avec approche = vitesse de lancer + g·dt (≤ 1,2) : DAMAGE_MODERATE … + 1,2.
    expect(impacts[0].b).toBeGreaterThanOrEqual(DAMAGE_MODERATE);
    expect(impacts[0].b).toBeLessThanOrEqual(DAMAGE_MODERATE + GRAVITY_STEP);
    // Les PV retirés sont exactement ceux annoncés par l'événement (MAX − b) ; tolérance = arrondi flottant.
    expect(ship.hp).toBeCloseTo(SHIP_MAX_HP - impacts[0].b, 9);
    expect(ship.hp).toBeGreaterThanOrEqual(SHIP_MAX_HP - DAMAGE_MODERATE - GRAVITY_STEP);
    expect(ship.hp).toBeLessThanOrEqual(SHIP_MAX_HP - DAMAGE_MODERATE);
    expect(ship.alive).toBe(true);
    // Vivant : le rebond garanti s'applique (vitesse sortante).
    expect(outward(ship)).toBeGreaterThan(0);
  });

  it('deux impacts modérés : les dégâts s’additionnent, le vaisseau survit avec quelques PV', () => {
    // Attention : 2 × DAMAGE_MODERATE = 0,8 × SHIP_MAX_HP < SHIP_MAX_HP. Deux impacts modérés ne suffisent pas à tuer.
    const world = makeWorld();
    const ship = world.ships[0];
    const first = hit(world, SPEED_MODERATE).find((e) => e.type === EVT.IMPACT);
    const second = hit(world, SPEED_MODERATE).find((e) => e.type === EVT.IMPACT);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBeCloseTo(SHIP_MAX_HP - first.b - second.b, 9); // arrondi flottant
    // MAX − 2 × (DAMAGE_MODERATE … + 1,2) : la marge de 1,2 par impact vient de g·dt.
    expect(ship.hp).toBeGreaterThanOrEqual(SHIP_MAX_HP - 2 * (DAMAGE_MODERATE + GRAVITY_STEP));
    expect(ship.hp).toBeLessThanOrEqual(SHIP_MAX_HP - 2 * DAMAGE_MODERATE);
    expect(ship.hp).toBeGreaterThan(0);
  });

  it('trois impacts modérés : mort au troisième, avec une seule EXPLOSION', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    hit(world, SPEED_MODERATE);
    hit(world, SPEED_MODERATE);
    expect(ship.alive).toBe(true);
    const events = hit(world, SPEED_MODERATE);
    expect(events.filter((e) => e.type === EVT.IMPACT)).toHaveLength(1);
    expect(events.filter((e) => e.type === EVT.EXPLOSION)).toHaveLength(1);
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0);
  });

  it('deux impacts forts (relancés à la main) : vivant après le premier, mort au second, une seule EXPLOSION', () => {
    // 2 × DAMAGE_HEAVY = 1,2 × SHIP_MAX_HP ≥ SHIP_MAX_HP (marge 0,2 × SHIP_MAX_HP sur le seuil de mort),
    // et DAMAGE_HEAVY + 1,2 < SHIP_MAX_HP : le premier ne tue pas.
    const world = makeWorld();
    const ship = world.ships[0];
    let explosions = 0;
    const firstEvents = hit(world, SPEED_HEAVY);
    explosions += firstEvents.filter((e) => e.type === EVT.EXPLOSION).length;
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBeGreaterThanOrEqual(SHIP_MAX_HP - DAMAGE_HEAVY - GRAVITY_STEP);
    expect(ship.hp).toBeLessThanOrEqual(SHIP_MAX_HP - DAMAGE_HEAVY);
    const secondEvents = hit(world, SPEED_HEAVY);
    explosions += secondEvents.filter((e) => e.type === EVT.EXPLOSION).length;
    expect(secondEvents.filter((e) => e.type === EVT.IMPACT)).toHaveLength(1);
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0);
    expect(explosions).toBe(1);
    // Un pas de plus : plus aucun événement, l'EXPLOSION n'est pas rejouée.
    clearEvents(world.events);
    step(world, FIXED_DT);
    expect(world.events.count).toBe(0);
  });

  it('impact naturel : le rebond d’un impact fort retombe à ~30 px/s (≤ seuil d’atterrissage) : sans dégât, pas de seconde sanction', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const first = hit(world, SPEED_HEAVY).find((e) => e.type === EVT.IMPACT);
    const hpAfterFirst = ship.hp;
    // Rebond de max(0,3 × approche, IMPACT_MIN_BOUNCE_SPEED = 30) ; retour au sol à ~30 px/s radial (< seuil) : nez sur la normale
    // (non touché) → posé, aucune perte de PV supplémentaire.
    let steps = 0;
    while (ship.landedOn < 0 && steps < 500) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      steps++;
    }
    expect(first.b).toBeGreaterThanOrEqual(DAMAGE_HEAVY);
    expect(ship.landedOn).toBe(0);
    expect(ship.hp).toBe(hpAfterFirst);
    expect(ship.alive).toBe(true);
  });
});

describe(`dégâts : seuil de mort (${SHIP_MAX_HP} PV ↔ ≈ ${SHIP_MAX_HP + SEUIL_RADIAL} px/s d’approche)`, () => {
  it('juste sous le seuil de mort : vivant avec très peu de PV (0 < hp < 10)', () => {
    // Approche au contact = SPEED_NEAR_DEATH … + 1,2 → dégâts MAX − 5 … MAX − 3,8 → hp 3,8 … 5.
    const world = makeWorld();
    const ship = world.ships[0];
    const events = hit(world, SPEED_NEAR_DEATH);
    expect(events.filter((e) => e.type === EVT.EXPLOSION)).toHaveLength(0);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBeGreaterThan(0);
    expect(ship.hp).toBeLessThan(10);
  });

  it('bien au-dessus du seuil de mort : mort (hp = 0, alive = false, landedOn = −1), IMPACT puis EXPLOSION dans cet ordre', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const events = hit(world, SPEED_LETHAL);
    // Un seul de chaque, IMPACT avant EXPLOSION (voir landing.js).
    expect(events.map((e) => e.type)).toEqual([EVT.IMPACT, EVT.EXPLOSION]);
    const [impact, explosion] = events;
    expect(impact.b).toBeGreaterThanOrEqual(SPEED_LETHAL - SEUIL_RADIAL);
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0); // clampé à 0 (jamais négatif), affectation directe → égalité exacte
    expect(ship.landedOn).toBe(-1);
    // EXPLOSION : même point de surface que l'IMPACT, a = vaisseau 0.
    expect(explosion.a).toBe(0);
    expect(explosion.x).toBe(impact.x);
    expect(explosion.y).toBe(impact.y);
    expect(Math.hypot(explosion.x - CX, explosion.y - CY)).toBeCloseTo(RADIUS, 9); // arrondi flottant
    // Mort sans rebond, et figé : vitesse remise à (0, 0), intention remise à zéro, décompte de respawn lancé.
    // Égalités exactes : ce sont des affectations directes de constantes, sans calcul flottant.
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.intent).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });
    expect(ship.respawnTimer).toBe(RESPAWN_DELAY);
    // Le vaisseau est resté reprojeté hors de la planète.
    expect(distance(ship)).toBeCloseTo(CONTACT, 9); // arrondi flottant
  });

  it('un impact modéré (non mortel à PV pleins) devient mortel à PV réduits (hp = 0,25 × SHIP_MAX_HP < dégâts)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.hp = 0.25 * SHIP_MAX_HP;
    expect(ship.hp).toBeLessThan(DAMAGE_MODERATE);
    const events = hit(world, SPEED_MODERATE);
    expect(events.map((e) => e.type)).toEqual([EVT.IMPACT, EVT.EXPLOSION]);
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0);
  });

  it('dégâts exactement égaux aux PV restants : mort (hp ≤ 0)', () => {
    // Pose les PV juste sous les dégâts d'un impact observé, puis rejoue : hp = dégâts → mort.
    const probe = makeWorld();
    const damage = hit(probe, SPEED_MODERATE).find((e) => e.type === EVT.IMPACT).b;
    const world = makeWorld();
    world.ships[0].hp = damage; // même scénario, mêmes dégâts (calcul déterministe, bit à bit)
    hit(world, SPEED_MODERATE);
    expect(world.ships[0].alive).toBe(false);
    expect(world.ships[0].hp).toBe(0);
  });
});

describe('dégâts : contacts sans perte de PV', () => {
  it('un atterrissage réussi (40 px/s) ne retire aucun PV', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const events = hit(world, 40);
    expect(events.map((e) => e.type)).toEqual([EVT.LANDED]);
    expect(ship.landedOn).toBe(0);
    expect(ship.hp).toBe(SHIP_MAX_HP); // aucune soustraction : égalité exacte
    expect(ship.alive).toBe(true);
  });

  it('un impact à 0 dégât (nez à 30° de la normale) ne retire aucun PV malgré l’IMPACT', () => {
    const world = makeWorld();
    const ship = launch(world, { radial: 30, angleOffset: 30 * DEG, altitude: 2 });
    const events = stepToContact(world);
    const impact = events.find((e) => e.type === EVT.IMPACT);
    expect(impact).toBeDefined();
    expect(impact.b).toBe(0); // max(0, …) donne exactement 0
    expect(ship.hp).toBe(SHIP_MAX_HP); // hp -= 0 : exact
    expect(ship.alive).toBe(true);
    expect(events.filter((e) => e.type === EVT.EXPLOSION)).toHaveLength(0);
  });

  it('un impact de dégâts nuls ne tue pas un vaisseau à 1 PV', () => {
    const world = makeWorld();
    const ship = launch(world, { radial: 30, angleOffset: 30 * DEG, altitude: 2 });
    ship.hp = 1;
    stepToContact(world);
    expect(ship.hp).toBe(1);
    expect(ship.alive).toBe(true);
  });

  it('seule la partie tangentielle en excès blesse : 70 px/s tangentiel : ≈ 35 de dégâts, non mortel', () => {
    // Pas de composante radiale notable (20 px/s) : dégâts ≈ |vT| − 35 ≈ 35 (marge ±3 : la normale
    // tourne pendant les ~6 pas d'approche, ce qui rogne légèrement vT).
    const world = makeWorld();
    const ship = launch(world, { radial: 20, tangential: 70, altitude: 2 });
    const events = stepToContact(world);
    const impact = events.find((e) => e.type === EVT.IMPACT);
    expect(impact.b).toBeGreaterThan(32);
    expect(impact.b).toBeLessThan(38);
    expect(ship.hp).toBeCloseTo(SHIP_MAX_HP - impact.b, 9); // arrondi flottant
    expect(ship.alive).toBe(true);
  });
});

describe('mort : vaisseau figé et muet', () => {
  function deadWorld() {
    const world = makeWorld();
    const ship = world.ships[0];
    hit(world, SPEED_LETHAL);
    expect(ship.alive).toBe(false);
    return { world, ship };
  }

  it('600 pas, rotation et poussée actives : pos, vel, angle, hp, landedOn inchangés, aucun événement', () => {
    // Carte sans planète possédée : la mort est définitive, donc rien ne bouge ni n'est émis, même
    // au-delà de RESPAWN_DELAY (3 s = 180 pas, ici 600 pas).
    const { world, ship } = deadWorld();
    const snapshot = JSON.stringify({
      pos: ship.pos,
      vel: ship.vel,
      angle: ship.angle,
      hp: ship.hp,
      landedOn: ship.landedOn,
    });
    ship.intent.thrust = true;
    ship.intent.rotate = 1;
    const tick = world.tick;
    for (let i = 0; i < 600; i++) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      expect(world.events.count).toBe(0);
    }
    // Un vaisseau mort est ignoré par `step` : aucune opération sur son état, donc égalité exacte.
    expect(
      JSON.stringify({
        pos: ship.pos,
        vel: ship.vel,
        angle: ship.angle,
        hp: ship.hp,
        landedOn: ship.landedOn,
      }),
    ).toBe(snapshot);
    expect(ship.alive).toBe(false);
    expect(world.tick).toBe(tick + 600); // le temps du monde avance quand même
  });

  it('un vaisseau mort ne bloque pas les vivants : un second vaisseau continue d’être simulé', () => {
    const world = createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: [{ x: CX, y: CY, radius: RADIUS, gravity: 70 }],
        spawns: [
          { x: CX, y: CY, angle: 0 },
          { x: 500, y: 500, angle: 0 },
        ],
      },
      1,
      { eventCapacity: 64 },
    );
    const dead = launch(world, { radial: SPEED_LETHAL });
    const other = world.ships[1];
    other.vel.x = 10; // loin de toute planète (gravité nulle hors de portée 5·r = 300 px)
    other.vel.y = 0;
    stepToContact(world);
    expect(dead.alive).toBe(false);
    expect(other.alive).toBe(true);
    const x = other.pos.x;
    for (let i = 0; i < 60; i++) step(world, FIXED_DT);
    // 60 pas × 10 px/s × dt = 10 px ; arrondi flottant des additions.
    expect(other.pos.x - x).toBeCloseTo(10, 9);
    expect(other.hp).toBe(SHIP_MAX_HP);
  });
});

describe('invariants des PV sur un vol chaotique', () => {
  const STEPS = 3000;

  /** Vol scripté (rotation tirée dans world.rng, poussée par rafales) vers la planète. */
  function fly(seed, onStep) {
    const world = makeWorld(seed);
    const ship = world.ships[0];
    ship.pos.x = CX;
    ship.pos.y = CY - 150;
    ship.vel.x = 25;
    ship.vel.y = 20;
    ship.angle = Math.PI / 2;
    for (let i = 0; i < STEPS; i++) {
      ship.intent.rotate = int(world.rng, -1, 2);
      ship.intent.thrust = world.tick % 7 < 2;
      clearEvents(world.events);
      step(world, FIXED_DT);
      if (onStep) onStep(world, ship);
    }
    return world;
  }

  it.each([1, 2, 3, 7, 42])(
    'seed %i : hp ∈ [0, SHIP_MAX_HP], jamais en hausse, alive ⇔ hp > 0, une seule EXPLOSION au plus',
    (seed) => {
      let previous = SHIP_MAX_HP;
      let explosions = 0;
      fly(seed, (world, ship) => {
        expect(ship.hp).toBeGreaterThanOrEqual(0);
        expect(ship.hp).toBeLessThanOrEqual(previous); // les PV ne remontent jamais
        expect(ship.alive).toBe(ship.hp > 0);
        if (!ship.alive) expect(ship.landedOn).toBe(-1);
        explosions += eventsOf(world, EVT.EXPLOSION).length;
        previous = ship.hp;
      });
      expect(explosions).toBeLessThanOrEqual(1);
    },
  );

  it('même script, vaisseau mort en cours de route : JSON identique à l’octet près', () => {
    // Vol vers la planète à haute vitesse puis 600 pas de commandes aléatoires : la mort a lieu au
    // premier impact (≥ SPEED_LETHAL), le reste du script tourne sur un cadavre.
    function run(seed) {
      const world = makeWorld(seed);
      const ship = launch(world, { radial: SPEED_LETHAL });
      for (let i = 0; i < 600; i++) {
        ship.intent.rotate = int(world.rng, -1, 2);
        ship.intent.thrust = int(world.rng, 0, 2) === 1;
        clearEvents(world.events);
        step(world, FIXED_DT);
      }
      return world;
    }
    const a = run(11);
    const b = run(11);
    expect(a.ships[0].alive).toBe(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('déterminisme sur un vol chaotique : même seed → JSON identique, y compris les PV finaux', () => {
    const a = fly(7);
    const b = fly(7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.ships[0].hp).toBe(b.ships[0].hp);
  });
});
