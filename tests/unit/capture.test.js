import { describe, expect, it } from 'vitest';
import { CAPTURE_TIME, FIXED_DT, SHIP_COLLISION_RADIUS } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { hasDefenses } from '../../src/core/building.js';
import { updateCapture } from '../../src/core/capture.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { createShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// Mini-carte 4000×4000, planètes r = 60 très éloignées (aucune gravité croisée) :
//   0 = base de la faction 0, 1 = base de la faction 1, 2 = neutre, 3 = planète de la faction 1 sans bâtiment.
// La faction 2 n'a aucune planète : elle est « hors jeu » (eliminated dès le départ, ADR 0005 §1).
// Les vaisseaux sont posés à la main (`land`) : `updateCapture` ne lit que `alive`, `landedOn` et `faction`.
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2;
const BASE0 = 0;
const BASE1 = 1;
const NEUTRAL = 2;
const ENEMY = 3;
const TURRET = 0;
const FACTORY = 1;
const HEAVY = 3;
// Pas de capture : CAPTURE_TIME / FIXED_DT = 180 ; la somme flottante de 180 × (1/60) peut tomber à
// 3 − 4e-16 (181 pas) : on tolère ±1 pas sur l'échéance.
const CAPTURE_STEPS = Math.round(CAPTURE_TIME / FIXED_DT);

const PLANETS = [
  { x: 500, y: 500, radius: RADIUS, owner: 0 },
  { x: 3500, y: 500, radius: RADIUS, owner: 1 },
  { x: 500, y: 2000, radius: RADIUS },
  { x: 3500, y: 2000, radius: RADIUS, owner: 1 },
];

function makeWorld(planets = PLANETS) {
  return createWorld(
    {
      width: 4000,
      height: 4000,
      planets,
      // Départs en vol, loin de toute planète ; ils sont ensuite posés à la main.
      spawns: [
        { x: 2000, y: 3000, angle: UP },
        { x: 2200, y: 3000, angle: UP },
        { x: 2400, y: 3000, angle: UP },
      ],
    },
    1,
    { eventCapacity: 64 },
  );
}

/** Pose le vaisseau sur le dessus de la planète, exactement comme après un atterrissage réussi. */
function land(world, shipIndex, planetIndex) {
  const ship = world.ships[shipIndex];
  const p = world.planets[planetIndex];
  ship.alive = true;
  ship.pos.x = p.pos.x;
  ship.pos.y = p.pos.y - CONTACT;
  ship.vel.x = 0;
  ship.vel.y = 0;
  ship.angle = UP;
  ship.landedOn = planetIndex;
  return ship;
}

/** Appelle `updateCapture` n fois (dt = FIXED_DT) et renvoie les événements CAPTURED émis. */
function capture(world, n) {
  const captured = [];
  for (let i = 0; i < n; i++) {
    clearEvents(world.events);
    updateCapture(world, FIXED_DT);
    for (let k = 0; k < world.events.count; k++) {
      const e = world.events.items[k];
      if (e.type === EVT.CAPTURED) captured.push({ ...e });
    }
  }
  return captured;
}

/** Nombre de pas d'`updateCapture` jusqu'au premier CAPTURED (échoue au-delà de `max`). */
function stepsToCapture(world, max = 2 * CAPTURE_STEPS) {
  for (let i = 1; i <= max; i++) if (capture(world, 1).length > 0) return i;
  throw new Error('aucune capture dans le délai');
}

function expectIdle(p) {
  expect(p.captureBy).toBe(-1);
  expect(p.captureTime).toBe(0);
}

describe('updateCapture : progression', () => {
  it('un vaisseau de la faction 0 posé sur une planète neutre : captureBy = 0, captureTime croît de dt', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    const p = world.planets[NEUTRAL];
    capture(world, 1);
    expect(p.captureBy).toBe(0);
    expect(p.captureTime).toBe(FIXED_DT); // 0 + dt : une seule addition, exacte
    capture(world, 59);
    expect(p.captureBy).toBe(0);
    // 60 additions de 1/60 : ≈ 1 s, erreur d'arrondi cumulée ≪ 1e-9.
    expect(p.captureTime).toBeCloseTo(1, 9);
    expect(p.owner).toBe(-1); // pas encore capturée
  });

  it('une planète sans vaisseau reste au repos (0 / -1)', () => {
    const world = makeWorld();
    capture(world, 10);
    for (const p of world.planets) expect(p.captureTime).toBe(0);
    expect(world.planets[NEUTRAL].captureBy).toBe(-1);
  });

  it('seule la planète occupée progresse', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    capture(world, 30);
    expect(world.planets[NEUTRAL].captureTime).toBeGreaterThan(0);
    for (const i of [BASE0, BASE1, ENEMY]) expectIdle(world.planets[i]);
  });
});

describe('updateCapture : capture à CAPTURE_TIME', () => {
  it('capture à 3 s (±1 pas) : owner = 0, compteur à 0, un seul CAPTURED (planète, faction, centre)', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    const p = world.planets[NEUTRAL];
    const all = [];
    let steps = 0;
    while (all.length === 0 && steps < 2 * CAPTURE_STEPS) {
      steps++;
      all.push(...capture(world, 1));
    }
    expect(Math.abs(steps - CAPTURE_STEPS)).toBeLessThanOrEqual(1);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      type: EVT.CAPTURED,
      a: NEUTRAL,
      b: 0,
      x: p.pos.x,
      y: p.pos.y,
    });
    expect(p.owner).toBe(0);
    expectIdle(p);
    // Pas de seconde capture : le vaisseau est maintenant sur sa propre planète.
    expect(capture(world, 600)).toHaveLength(0);
    expectIdle(p);
  });

  it('pas de CAPTURED avant 3 s : 177 pas sans événement (marge de 3 pas sur le flottant)', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    expect(capture(world, CAPTURE_STEPS - 3)).toHaveLength(0);
    expect(world.planets[NEUTRAL].owner).toBe(-1);
  });

  it('capture par la faction 1 (vaisseau 1) d’une neutre : owner = 1, b = 1', () => {
    const world = makeWorld();
    land(world, 1, NEUTRAL);
    const events = capture(world, CAPTURE_STEPS + 1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ a: NEUTRAL, b: 1 });
    expect(world.planets[NEUTRAL].owner).toBe(1);
  });

  it('les bâtiments de la planète sont réinitialisés (même sans défense : usine seule, chantier en cours)', () => {
    const world = makeWorld();
    const p = world.planets[ENEMY];
    p.buildings[FACTORY].built = true; // usine sans tourelle : ne bloque pas la capture
    p.buildings[FACTORY].cooldown = 0.3;
    p.buildProgress = 12;
    land(world, 0, ENEMY);
    expect(hasDefenses(p)).toBe(false);
    expect(capture(world, CAPTURE_STEPS + 1)).toHaveLength(1);
    expect(p.owner).toBe(0);
    for (const slot of p.buildings) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    expect(p.buildProgress).toBe(0);
  });

  it('au pas de la capture, step met à jour le résumé : planetCount +1 pour la faction 0, −1 pour l’ancien propriétaire', () => {
    const world = makeWorld();
    land(world, 0, ENEMY);
    expect(world.factions[0].planetCount).toBe(1);
    expect(world.factions[1].planetCount).toBe(2);
    let captured = 0;
    for (let i = 0; i < CAPTURE_STEPS + 2; i++) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      for (let k = 0; k < world.events.count; k++) {
        if (world.events.items[k].type === EVT.CAPTURED) {
          captured++;
          // Résumé visible dès le pas de la capture (updateFactions vient après updateCapture).
          expect(world.factions[0].planetCount).toBe(2);
          expect(world.factions[1].planetCount).toBe(1);
        }
      }
    }
    expect(captured).toBe(1);
    expect(world.factions[0].planetCount).toBe(2);
    expect(world.factions[1].planetCount).toBe(1);
  });

  it('même capture sur une neutre : planetCount de la faction 0 passe de 1 à 2', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    for (let i = 0; i < CAPTURE_STEPS + 2; i++) step(world, FIXED_DT);
    expect(world.factions[0].planetCount).toBe(2);
    expect(world.factions[1].planetCount).toBe(2);
  });
});

describe('updateCapture : remises à zéro', () => {
  function inProgress() {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    capture(world, 120); // 2 s sur 3
    const p = world.planets[NEUTRAL];
    expect(p.captureBy).toBe(0);
    expect(p.captureTime).toBeGreaterThan(1.9);
    return { world, p };
  }

  it('décollage : compteur remis à 0 ; la reprise repart de zéro', () => {
    const { world, p } = inProgress();
    world.ships[0].landedOn = -1;
    capture(world, 1);
    expectIdle(p);
    world.ships[0].landedOn = NEUTRAL;
    capture(world, 1);
    expect(p.captureTime).toBe(FIXED_DT);
    // Pas de capture 1 s plus tard : il manque 2 s de cumul qui ont été perdues.
    expect(capture(world, 100)).toHaveLength(0);
  });

  it('décollage réel par step (poussée) : compteur remis à 0', () => {
    const { world, p } = inProgress();
    world.ships[0].intent.thrust = true;
    step(world, FIXED_DT);
    expect(world.ships[0].landedOn).toBe(-1);
    expectIdle(p);
  });

  it('mort (damageShip) : compteur remis à 0, aucune capture même longtemps après', () => {
    const { world, p } = inProgress();
    expect(damageShip(world, 0, 1000, 0, 0)).toBe(true);
    capture(world, 1);
    expectIdle(p);
    expect(capture(world, 600)).toHaveLength(0);
    expect(p.owner).toBe(-1);
  });

  it('vaisseau mort mais landedOn resté (état forcé) : ne progresse pas', () => {
    const world = makeWorld();
    const ship = land(world, 0, NEUTRAL);
    ship.alive = false;
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[NEUTRAL]);
  });

  it('contestation : une autre faction se pose aussi, compteur à 0 et blocage tant que les deux sont là', () => {
    const { world, p } = inProgress();
    land(world, 1, NEUTRAL);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(p);
    expect(p.owner).toBe(-1);
    // L'intrus repart : la capture reprend de zéro (et non à 2 s).
    world.ships[1].landedOn = -1;
    capture(world, 1);
    expect(p.captureBy).toBe(0);
    expect(p.captureTime).toBe(FIXED_DT);
    expect(capture(world, CAPTURE_STEPS - 5)).toHaveLength(0);
    expect(capture(world, 10)).toHaveLength(1);
  });

  it('contestation : même la 3e faction (hors jeu) posée suffit à bloquer (exactement un vaisseau requis)', () => {
    const { world, p } = inProgress();
    land(world, 2, NEUTRAL);
    capture(world, 1);
    expectIdle(p);
  });

  it('deux vaisseaux de la même faction posés ensemble : pas de capture (exactement un vaisseau)', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    const wingman = createShip(0, 0, 0, UP);
    world.ships.push(wingman);
    wingman.landedOn = NEUTRAL;
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[NEUTRAL]);
  });

  it('un vaisseau mort posé « à côté » ne conteste pas : le vivant capture', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    const ghost = land(world, 1, NEUTRAL);
    ghost.alive = false;
    expect(capture(world, CAPTURE_STEPS + 1)).toHaveLength(1);
    expect(world.planets[NEUTRAL].owner).toBe(0);
  });

  it('planète déjà à lui : rien (captureBy −1, captureTime 0), aucun événement', () => {
    const world = makeWorld();
    land(world, 0, BASE0);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[BASE0]);
    expect(world.planets[BASE0].owner).toBe(0);
  });

  it('changer de capteur repart de 0 : le compteur du précédent n’est pas hérité', () => {
    const world = makeWorld();
    const p = world.planets[NEUTRAL];
    p.captureBy = 0; // progression de la faction 0 laissée par un pas précédent
    p.captureTime = CAPTURE_TIME - 0.01; // à un cheveu de la capture
    land(world, 1, NEUTRAL); // seul la faction 1 est posée maintenant
    expect(capture(world, 1)).toHaveLength(0); // sinon capture immédiate héritée
    expect(p.captureBy).toBe(1);
    expect(p.captureTime).toBe(FIXED_DT);
    expect(p.owner).toBe(-1);
  });

  it('capture interrompue puis capteur différent : la 2e faction a besoin de ses propres 3 s', () => {
    const world = makeWorld();
    land(world, 0, NEUTRAL);
    capture(world, 150);
    world.ships[0].landedOn = -1;
    land(world, 1, NEUTRAL);
    const steps = stepsToCapture(world);
    expect(Math.abs(steps - CAPTURE_STEPS)).toBeLessThanOrEqual(1);
    expect(world.planets[NEUTRAL].owner).toBe(1);
  });
});

describe('updateCapture : factions hors jeu / éliminées', () => {
  it('faction 2 (aucune planète au départ, eliminated vrai) : ne capture jamais', () => {
    const world = makeWorld();
    expect(world.factions[2].eliminated).toBe(true);
    land(world, 2, NEUTRAL);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[NEUTRAL]);
    expect(world.planets[NEUTRAL].owner).toBe(-1);
  });

  it('faction passée à eliminated en cours de capture : compteur remis à 0, pas de capture', () => {
    const world = makeWorld();
    land(world, 1, NEUTRAL);
    capture(world, 100);
    expect(world.planets[NEUTRAL].captureBy).toBe(1);
    world.factions[1].eliminated = true;
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[NEUTRAL]);
  });

  it('la faction éliminée ne capture pas non plus une planète ennemie sans défense', () => {
    const world = makeWorld();
    land(world, 2, ENEMY);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(1);
  });

  it('faction à planetCount 0 mais non éliminée (a perdu ses planètes, vaisseau en vie) : peut capturer', () => {
    // ADR 0005 §1 : un vaisseau vivant sans planète reste en jeu et peut recapturer une neutre.
    const world = makeWorld();
    world.planets[ENEMY].owner = -1;
    world.planets[BASE1].owner = -1;
    step(world, FIXED_DT); // updateFactions : planetCount 0 pour la faction 1
    expect(world.factions[1].planetCount).toBe(0);
    expect(world.factions[1].eliminated).toBe(false);
    land(world, 1, NEUTRAL);
    expect(capture(world, CAPTURE_STEPS + 1)).toHaveLength(1);
    expect(world.planets[NEUTRAL].owner).toBe(1);
  });
});

describe('updateCapture : défenses', () => {
  it('tourelle construite : capture bloquée (compteur à 0, aucun événement)', () => {
    const world = makeWorld();
    const p = world.planets[ENEMY];
    p.buildings[TURRET].built = true;
    p.buildings[TURRET].hp = BUILDINGS[TURRET].hp;
    land(world, 0, ENEMY);
    expect(capture(world, 3 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(p);
    expect(p.owner).toBe(1);
    expect(p.buildings[TURRET].built).toBe(true); // rien n'a été réinitialisé
  });

  it('tourelle lourde seule : bloque aussi', () => {
    const world = makeWorld();
    const p = world.planets[ENEMY];
    p.buildings[HEAVY].built = true;
    land(world, 0, ENEMY);
    expect(capture(world, 3 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(p);
  });

  it('défense qui tombe : la capture démarre à la destruction, pas avant, et repart de 0', () => {
    const world = makeWorld();
    const p = world.planets[ENEMY];
    p.buildings[TURRET].built = true;
    land(world, 0, ENEMY);
    capture(world, 200);
    expectIdle(p);
    p.buildings[TURRET].built = false;
    capture(world, 1);
    expect(p.captureTime).toBe(FIXED_DT);
    expect(capture(world, CAPTURE_STEPS - 5)).toHaveLength(0);
    expect(capture(world, 10)).toHaveLength(1);
    expect(p.owner).toBe(0);
  });

  it('tourelle achevée en cours de capture : compteur remis à 0', () => {
    const world = makeWorld();
    const p = world.planets[ENEMY];
    land(world, 0, ENEMY);
    capture(world, 120);
    expect(p.captureTime).toBeGreaterThan(1.9);
    p.buildings[TURRET].built = true;
    capture(world, 1);
    expectIdle(p);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
  });

  it('planète possédée par un autre, sans défense : capturable (même règle que la neutre)', () => {
    const world = makeWorld();
    land(world, 0, ENEMY);
    const steps = stepsToCapture(world);
    expect(Math.abs(steps - CAPTURE_STEPS)).toBeLessThanOrEqual(1);
    expect(world.planets[ENEMY].owner).toBe(0);
  });

  it('la tourelle d’une planète n’empêche pas la capture d’une AUTRE planète', () => {
    const world = makeWorld();
    world.planets[ENEMY].buildings[TURRET].built = true;
    land(world, 0, NEUTRAL);
    expect(capture(world, CAPTURE_STEPS + 1)).toHaveLength(1);
  });
});

describe('updateCapture : vaisseau en vol ou mort', () => {
  it('vaisseau en vol (landedOn = −1) juste au-dessus d’une neutre : aucune progression', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.pos.x = world.planets[NEUTRAL].pos.x;
    ship.pos.y = world.planets[NEUTRAL].pos.y - CONTACT - 1;
    expect(ship.landedOn).toBe(-1);
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    expectIdle(world.planets[NEUTRAL]);
  });

  it('vaisseau mort : aucune progression', () => {
    const world = makeWorld();
    world.ships[0].alive = false;
    expect(capture(world, 2 * CAPTURE_STEPS)).toHaveLength(0);
    for (const p of world.planets) expect(p.captureTime).toBe(0);
  });

  it('monde sans vaisseau : aucun effet, aucune exception', () => {
    const world = makeWorld();
    world.ships.length = 0;
    expect(capture(world, 10)).toHaveLength(0);
    for (const p of world.planets) expectIdle(p);
  });
});
