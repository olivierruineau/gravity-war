import { describe, expect, it } from 'vitest';
import { FIXED_DT, RESPAWN_DELAY, SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { wrapAngle } from '../../src/core/math.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Mort puis réapparition (lifecycle.js) sur une mini-carte 4000×4000. Planètes r = 60, g0 = 70 (seuil de
// contact r + 6 = 66). La planète de BASE appartient à la faction 0 ; la planète NEUTRE n'a pas d'`owner`.
// Un impact à 150 px/s radial est mortel (dégâts ≈ 150 − 45 = 105 ≥ 100 PV, cf. damage.test.js).
// Le délai de respawn vaut RESPAWN_DELAY / FIXED_DT = 180 pas ; le décompte soustrait dt à chaque pas
// (accumulation flottante) : on tolère ±1 pas sur sa durée.
const SIZE = 4000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2;
const DELAY_STEPS = Math.round(RESPAWN_DELAY / FIXED_DT);
const LETHAL_SPEED = 150;

const BASE = { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
const NEUTRAL = { x: 1600, y: 2000, radius: RADIUS, gravity: 70 }; // surfaces à 480 px de la base

function makeWorld({ planets = [BASE, NEUTRAL], spawns, seed = 1 } = {}) {
  return createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets,
      // Vaisseau 0 posé au-dessus de la base, à la hauteur exacte d'un vaisseau réapparu.
      spawns: spawns ?? [{ x: BASE.x, y: BASE.y - CONTACT, angle: UP }],
    },
    seed,
    { eventCapacity: 64 },
  );
}

/** Copie des événements du pas courant. */
function snapshotEvents(world) {
  const out = [];
  for (let i = 0; i < world.events.count; i++) out.push({ ...world.events.items[i] });
  return out;
}

function ofType(events, type) {
  return events.filter((e) => e.type === type);
}

/** Un pas, en renvoyant les événements qu'il a émis. */
function stepOnce(world) {
  clearEvents(world.events);
  step(world, FIXED_DT);
  return snapshotEvents(world);
}

/**
 * Pose le vaisseau à 0,5 px au-dessus du seuil de contact de `planet`, lancé vers son centre à 150 px/s,
 * et avance jusqu'à sa mort. Renvoie les événements du pas mortel.
 */
function crashOn(world, shipIndex, planet) {
  const ship = world.ships[shipIndex];
  ship.pos.x = planet.x;
  ship.pos.y = planet.y - (CONTACT + 0.5);
  ship.vel.x = 0;
  ship.vel.y = LETHAL_SPEED;
  ship.angle = UP;
  ship.landedOn = -1;
  for (let i = 0; i < 60; i++) {
    const events = stepOnce(world);
    if (!ship.alive) return events;
  }
  throw new Error('le vaisseau aurait dû mourir : scénario invalide');
}

/** Avance jusqu'à la réapparition ; renvoie { steps, events } (tous les événements cumulés). */
function stepUntilAlive(world, ship, maxSteps = 2 * DELAY_STEPS) {
  const events = [];
  for (let steps = 1; steps <= maxSteps; steps++) {
    events.push(...stepOnce(world));
    if (ship.alive) return { steps, events };
  }
  throw new Error('pas de réapparition dans le délai');
}

/** Pilote minimal : nez vers (tx, ty), poussée permanente. */
function steerToward(ship, tx, ty) {
  const diff = wrapAngle(Math.atan2(ty - ship.pos.y, tx - ship.pos.x) - ship.angle);
  ship.intent.rotate = diff > 0.05 ? 1 : diff < -0.05 ? -1 : 0;
  ship.intent.thrust = true;
}

describe('respawn : scénario complet sur planète possédée', () => {
  function fullScenario() {
    const world = makeWorld();
    const ship = world.ships[0];
    const log = [];

    // 1. Décollage réel de la base : nez à 45° vers le haut-droite, poussée (la composante sortante
    //    140·sin 45° ≈ 99 px/s² dépasse g = 70 : décollage immédiat).
    ship.angle = -Math.PI / 4;
    ship.intent.thrust = true;
    log.push(...stepOnce(world));
    const tookOff = ship.landedOn === -1;

    // 2. Vol piloté vers la planète neutre jusqu'à l'écrasement (borne 900 pas = 15 s).
    let deathEvents = null;
    for (let i = 0; i < 900 && ship.alive; i++) {
      steerToward(ship, NEUTRAL.x, NEUTRAL.y);
      const events = stepOnce(world);
      log.push(...events);
      if (!ship.alive) deathEvents = events;
    }
    return { world, ship, log, tookOff, deathEvents };
  }

  it('part en vol de la base puis s’écrase sur la planète neutre : mort avec EXPLOSION', () => {
    const { ship, tookOff, deathEvents, log } = fullScenario();
    expect(tookOff).toBe(true);
    expect(ship.alive).toBe(false);
    expect(deathEvents).not.toBeNull();
    const explosions = ofType(deathEvents, EVT.EXPLOSION);
    expect(explosions).toHaveLength(1);
    expect(explosions[0].a).toBe(0);
    // L'explosion a lieu sur la surface de la planète NEUTRE, pas sur la base.
    // Tolérance 1e-9 px : le point est calculé comme centre + normale·rayon (arrondi flottant).
    expect(Math.hypot(explosions[0].x - NEUTRAL.x, explosions[0].y - NEUTRAL.y)).toBeCloseTo(
      RADIUS,
      9,
    );
    expect(ofType(log, EVT.LANDED)).toHaveLength(0);
    expect(ship.hp).toBe(0);
    expect(ship.landedOn).toBe(-1);
    expect(ship.respawnTimer).toBe(RESPAWN_DELAY);
  });

  it('reste mort et immobile pendant RESPAWN_DELAY (±1 pas), puis réapparaît posé sur la base possédée', () => {
    const { world, ship } = fullScenario();
    const dead = JSON.stringify({ pos: ship.pos, vel: ship.vel, angle: ship.angle, hp: ship.hp });
    const timeline = [];
    const events = [];
    for (let i = 0; i < DELAY_STEPS + 5 && timeline.length < 1000; i++) {
      events.push(...stepOnce(world));
      timeline.push(ship.alive);
      if (ship.alive) break;
      // Tant que mort : état figé à l'octet près (aucun calcul ne touche un cadavre hors respawnTimer).
      expect(JSON.stringify({ pos: ship.pos, vel: ship.vel, angle: ship.angle, hp: ship.hp })).toBe(
        dead,
      );
    }
    const steps = timeline.length;
    // ±1 pas : 180 soustractions de 1/60 sur 3 donnent 0 à l'arrondi flottant près.
    expect(Math.abs(steps - DELAY_STEPS)).toBeLessThanOrEqual(1);
    expect(ship.alive).toBe(true);

    // Posé sur la base (possédée), pas sur la neutre pourtant plus proche du lieu de la mort.
    expect(ship.landedOn).toBe(0);
    // Positions exactes : respawnShip affecte x = centre, y = centre − (r + rayon de collision).
    expect(ship.pos.x).toBe(BASE.x);
    expect(ship.pos.y).toBe(BASE.y - CONTACT);
    expect(ship.hp).toBe(SHIP_MAX_HP);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.angle).toBeCloseTo(UP, 12); // constante affectée : tolérance symbolique
    expect(ship.intent).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });

    const respawns = ofType(events, EVT.RESPAWN);
    expect(respawns).toHaveLength(1);
    expect(respawns[0].a).toBe(0); // vaisseau 0
    expect(respawns[0].b).toBe(0); // planète de base (index 0)
    expect(respawns[0].x).toBe(BASE.x);
    expect(respawns[0].y).toBe(BASE.y - CONTACT);
    expect(ofType(events, EVT.LANDED)).toHaveLength(0);
    expect(ofType(events, EVT.EXPLOSION)).toHaveLength(0);
  });

  it('après le respawn : reste posé sans LANDED, puis décolle normalement à la poussée', () => {
    const { world, ship } = fullScenario();
    stepUntilAlive(world, ship);
    // 60 pas sans intention : figé sur la base, aucun événement (ni IMPACT ni LANDED).
    for (let i = 0; i < 60; i++) {
      expect(stepOnce(world)).toHaveLength(0);
    }
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.y).toBe(BASE.y - CONTACT);

    ship.intent.thrust = true;
    stepOnce(world);
    expect(ship.landedOn).toBe(-1); // poussée verticale 140 > g = 70 : décollage au premier pas
    for (let i = 0; i < 59; i++) stepOnce(world);
    // En 1 s la poussée nette (140 − g(h) avec g ≤ 70) déplace d'au moins ½·70·1² = 35 px ;
    // marge : on exige > 30 px d'altitude gagnée et une vitesse montante > 50 px/s.
    expect(BASE.y - CONTACT - ship.pos.y).toBeGreaterThan(30);
    expect(ship.vel.y).toBeLessThan(-50);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });
});

describe('respawn : cycles et choix de la planète', () => {
  it('deux morts successives : deux EXPLOSION, deux RESPAWN, deux fois sur la base', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const all = [];
    for (let death = 0; death < 2; death++) {
      all.push(...crashOn(world, 0, NEUTRAL));
      expect(ship.alive).toBe(false);
      const { steps, events } = stepUntilAlive(world, ship);
      expect(Math.abs(steps - DELAY_STEPS)).toBeLessThanOrEqual(1); // ±1 pas (arrondi flottant)
      all.push(...events);
      expect(ship.landedOn).toBe(0);
      expect(ship.hp).toBe(SHIP_MAX_HP);
    }
    expect(ofType(all, EVT.EXPLOSION)).toHaveLength(2);
    expect(ofType(all, EVT.RESPAWN)).toHaveLength(2);
    expect(ofType(all, EVT.LANDED)).toHaveLength(0);
  });

  describe('deux planètes possédées : la plus proche du lieu de la mort', () => {
    // Bases aux deux extrémités (A à x = 600, B à x = 3400), neutre au milieu à x variable.
    const A = { x: 600, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
    const B = { x: 3400, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
    it.each([
      ['près de A', 1000, 0, A],
      ['près de B', 3000, 1, B],
    ])(
      'mort %s (neutre en x = %i) : réapparition sur la planète d’index %i',
      (_n, nx, index, base) => {
        const neutral = { x: nx, y: 2000, radius: RADIUS, gravity: 70 };
        const world = makeWorld({
          planets: [A, B, neutral],
          spawns: [{ x: 1500, y: 800, angle: UP }], // départ loin de tout : seule la mort compte
        });
        const ship = world.ships[0];
        crashOn(world, 0, neutral);
        const { events } = stepUntilAlive(world, ship);
        expect(ship.landedOn).toBe(index);
        expect(ship.pos.x).toBe(base.x);
        expect(ship.pos.y).toBe(base.y - CONTACT);
        const respawns = ofType(events, EVT.RESPAWN);
        expect(respawns).toHaveLength(1);
        expect(respawns[0].b).toBe(index);
      },
    );
  });

  it('une faction sans planète possédée ne réapparaît jamais (600 pas), sans événement RESPAWN', () => {
    // Carte sans aucun owner.
    const world = makeWorld({ planets: [{ ...BASE, owner: undefined }, NEUTRAL] });
    const ship = world.ships[0];
    crashOn(world, 0, NEUTRAL);
    for (let i = 0; i < 600; i++) {
      expect(ofType(stepOnce(world), EVT.RESPAWN)).toHaveLength(0);
      expect(ship.alive).toBe(false);
    }
    expect(ship.hp).toBe(0);
  });

  it('le propriétaire compte : la planète de la faction 0 ne ressuscite pas le vaisseau de la faction 1', () => {
    const world = makeWorld({
      spawns: [
        { x: BASE.x, y: BASE.y - CONTACT, angle: UP },
        { x: 2800, y: 800, angle: UP },
      ],
    });
    const [s0, s1] = world.ships;
    crashOn(world, 1, NEUTRAL);
    crashOn(world, 0, NEUTRAL);
    expect(s0.alive).toBe(false);
    expect(s1.alive).toBe(false);
    const events = [];
    for (let i = 0; i < 600; i++) events.push(...stepOnce(world));
    // La faction 0 est revenue, la faction 1 reste morte pour toujours.
    expect(s0.alive).toBe(true);
    expect(s1.alive).toBe(false);
    const respawns = ofType(events, EVT.RESPAWN);
    expect(respawns).toHaveLength(1);
    expect(respawns[0].a).toBe(0);
  });
});

describe('respawn : intention résiduelle et vaisseau mort inerte', () => {
  it('poussée + rotation actives au moment de la mort : intent remis à zéro, pas de décollage au respawn', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    // Intention maintenue pendant le vol fatal ; personne ne la touche ensuite.
    ship.intent.thrust = true;
    ship.intent.rotate = 1;
    ship.intent.fire = true;
    ship.pos.x = NEUTRAL.x;
    ship.pos.y = NEUTRAL.y - (CONTACT + 0.5);
    ship.vel.y = LETHAL_SPEED;
    ship.angle = UP;
    for (let i = 0; i < 60 && ship.alive; i++) stepOnce(world);
    expect(ship.alive).toBe(false);
    expect(ship.intent).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });

    stepUntilAlive(world, ship);
    const angle = ship.angle;
    for (let i = 0; i < 120; i++) expect(stepOnce(world)).toHaveLength(0);
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.y).toBe(BASE.y - CONTACT); // toujours au sol, exactement
    expect(ship.angle).toBe(angle); // pas de rotation résiduelle
  });

  it('une poussée écrite pendant la mort est effacée à la réapparition : le vaisseau reste posé', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    crashOn(world, 0, NEUTRAL);
    ship.intent.thrust = true; // touche restée enfoncée pendant le délai
    ship.intent.rotate = -1;
    stepUntilAlive(world, ship);
    expect(ship.intent).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });
    for (let i = 0; i < 120; i++) stepOnce(world);
    expect(ship.landedOn).toBe(0);
    expect(ship.pos.y).toBe(BASE.y - CONTACT);
    expect(ship.angle).toBe(UP);
  });

  it('un vaisseau mort ignore la gravité et les collisions : posé au centre d’une planète, il ne bouge pas', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    crashOn(world, 0, NEUTRAL);
    // Au centre exact de la planète neutre : gravité forte et collision (sortie forcée) s'il était simulé.
    ship.pos.x = NEUTRAL.x;
    ship.pos.y = NEUTRAL.y;
    // DELAY_STEPS − 5 pas : strictement avant l'échéance, avec marge sur le ±1 pas.
    for (let i = 0; i < DELAY_STEPS - 5; i++) {
      expect(stepOnce(world)).toHaveLength(0);
    }
    // Affectations directes, aucun calcul : égalité exacte.
    expect(ship.pos.x).toBe(NEUTRAL.x);
    expect(ship.pos.y).toBe(NEUTRAL.y);
    expect(ship.vel.x).toBe(0);
    expect(ship.vel.y).toBe(0);
    expect(ship.alive).toBe(false);
  });

  it('un vaisseau mort ignore les bornes de la carte et l’intégration : hors carte avec une vitesse, il reste figé', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    crashOn(world, 0, NEUTRAL);
    ship.pos.x = -500; // bien hors de [6, 3994] : applyBounds le ramènerait
    ship.pos.y = SIZE + 500;
    ship.vel.x = -300;
    ship.vel.y = 300;
    for (let i = 0; i < DELAY_STEPS - 5; i++) stepOnce(world);
    expect(ship.pos.x).toBe(-500);
    expect(ship.pos.y).toBe(SIZE + 500);
    expect(ship.vel.x).toBe(-300);
    expect(ship.vel.y).toBe(300);
    expect(ship.alive).toBe(false);
  });
});

describe('respawn : déterminisme', () => {
  const STEPS = 1500;

  /** Décollage, vol piloté vers la neutre, mort, respawn, puis commandes tirées dans world.rng. */
  function run(seed) {
    const world = makeWorld({ seed });
    const ship = world.ships[0];
    const counts = { explosion: 0, respawn: 0 };
    ship.angle = -Math.PI / 4;
    for (let i = 0; i < STEPS; i++) {
      if (world.tick < 600) {
        steerToward(ship, NEUTRAL.x, NEUTRAL.y);
        // Une rafale aléatoire de poussée coupée rend le vol dépendant du RNG sans l'empêcher d'arriver.
        if (int(world.rng, 0, 10) === 0) ship.intent.thrust = false;
      } else {
        ship.intent.rotate = int(world.rng, -1, 2);
        ship.intent.thrust = int(world.rng, 0, 2) === 1;
      }
      const events = stepOnce(world);
      counts.explosion += ofType(events, EVT.EXPLOSION).length;
      counts.respawn += ofType(events, EVT.RESPAWN).length;
    }
    return { world, counts };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(allFinite);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed, même script avec mort et respawn : JSON identique, état fini', () => {
    const a = run(5);
    const b = run(5);
    // Le scénario doit réellement traverser une mort et une réapparition.
    expect(a.counts.explosion).toBeGreaterThanOrEqual(1);
    expect(a.counts.respawn).toBeGreaterThanOrEqual(1);
    expect(a.counts).toEqual(b.counts);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null : on teste l'objet
  });

  it('seed différente : la simulation reste cohérente (finie, PV dans [0, 100])', () => {
    const { world } = run(99);
    expect(allFinite(world)).toBe(true);
    expect(world.ships[0].hp).toBeGreaterThanOrEqual(0);
    expect(world.ships[0].hp).toBeLessThanOrEqual(SHIP_MAX_HP);
  });
});
