import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  MISSILE_REARM_TIME,
  MISSILE_STOCK_MAX,
  MISSILE_STOCK_MIN,
  RESPAWN_DELAY,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { NEUTRAL } from '../../src/core/planet.js';
import { updateRearm } from '../../src/core/rearm.js';
import { respawnShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// Réarmement (ADR 0005 §5) : le vaisseau 0 démarre posé sur la planète 0 (`spawns: [{ planet: 0 }]`).
// `built: 2` construit les slots 0 (tourelle) et 1 (usine à missiles) ; `built: 1` = tourelle seule.
//
// Pas de test « à l'arrondi près » ici : on appelle `updateRearm` directement avec dt = 0,5 s, exactement
// représentable en binaire, donc les sommes sont exactes (4 × 0,5 = 2 = MISSILE_REARM_TIME) et on utilise
// `toBe`. Le test à FIXED_DT (1/60, non représentable) tolère ±1 pas.
const DT = 0.5;
const CALLS_PER_MISSILE = MISSILE_REARM_TIME / DT; // 4
const STEPS_PER_MISSILE = Math.round(MISSILE_REARM_TIME / FIXED_DT); // 120

const BASE = { x: 600, y: 600, radius: 60, gravity: 70, owner: 0, built: 2 };
const OTHER = { x: 1600, y: 600, radius: 60, gravity: 70, owner: 1, built: 2 };

function makeWorld(planets = [BASE], spawns = [{ planet: 0 }]) {
  return createWorld({ width: 2400, height: 1350, planets, spawns }, 1, { eventCapacity: 32 });
}

function eventsOf(world, type) {
  return world.events.items.slice(0, world.events.count).filter((e) => e.type === type);
}

/** Appelle `updateRearm` n fois avec dt = DT sur le vaisseau `i`. */
function rearm(world, n, i = 0) {
  for (let k = 0; k < n; k++) updateRearm(world, i, DT);
}

/** Avance n pas complets en ne gardant que les événements d'un type ; vide la file à chaque pas. */
function stepCollect(world, n, type) {
  const found = [];
  for (let i = 0; i < n; i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    found.push(...eventsOf(world, type).map((e) => ({ ...e, tick: world.tick })));
  }
  return found;
}

describe('updateRearm : conditions réunies (posé, sa planète, usine, stock < MAX)', () => {
  it('le vaisseau de départ est posé sur sa base, au stock minimum, sans progression', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    expect(ship.landedOn).toBe(0);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
    expect(ship.rearmTime).toBe(0);
    expect(world.factions[0].hasMissiles).toBe(true);
  });

  it('rearmTime avance de dt à chaque appel, sans missile ni événement avant l’échéance', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    for (let k = 1; k < CALLS_PER_MISSILE; k++) {
      updateRearm(world, 0, DT);
      expect(ship.rearmTime).toBe(k * DT);
      expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
    }
    expect(world.events.count).toBe(0);
  });

  it('à MISSILE_REARM_TIME : +1 missile, rearmTime à 0, REARM (x, y = vaisseau, a = vaisseau, b = stock)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    rearm(world, CALLS_PER_MISSILE);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN + 1);
    expect(ship.rearmTime).toBe(0);
    expect(world.events.count).toBe(1);
    expect(world.events.items[0]).toMatchObject({
      type: EVT.REARM,
      x: ship.pos.x,
      y: ship.pos.y,
      a: 0,
      b: MISSILE_STOCK_MIN + 1,
    });
  });

  it('un seul appel dont dt ≥ MISSILE_REARM_TIME recharge un seul missile (le surplus est perdu)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    updateRearm(world, 0, MISSILE_REARM_TIME + 0.5);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN + 1);
    expect(ship.rearmTime).toBe(0);
    expect(eventsOf(world, EVT.REARM)).toHaveLength(1);
  });

  it('a = index du vaisseau : le vaisseau 1 posé sur sa base 1 émet REARM avec a = 1', () => {
    const world = makeWorld([BASE, OTHER], [{ planet: 0 }, { planet: 1 }]);
    rearm(world, CALLS_PER_MISSILE, 1);
    expect(world.ships[1].missiles).toBe(MISSILE_STOCK_MIN + 1);
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MIN); // l'autre vaisseau n'est pas touché
    const [e] = eventsOf(world, EVT.REARM);
    expect(e).toMatchObject({ a: 1, b: MISSILE_STOCK_MIN + 1, x: world.ships[1].pos.x });
  });

  it('à FIXED_DT : le premier missile arrive au 120e pas (±1 : 120 additions de 1/60 peuvent valoir 2 − ε)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    let calls = 0;
    while (ship.missiles === MISSILE_STOCK_MIN && calls < 2 * STEPS_PER_MISSILE) {
      updateRearm(world, 0, FIXED_DT);
      calls++;
    }
    expect(Math.abs(calls - STEPS_PER_MISSILE)).toBeLessThanOrEqual(1);
  });

  it('recharge successive : MIN → MAX en (MAX − MIN) échéances, REARM avec b = 2, 3, 4', () => {
    const world = makeWorld();
    rearm(world, CALLS_PER_MISSILE * (MISSILE_STOCK_MAX - MISSILE_STOCK_MIN));
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MAX);
    const stocks = eventsOf(world, EVT.REARM).map((e) => e.b);
    expect(stocks).toEqual([2, 3, 4]);
  });
});

describe('updateRearm : plafond MISSILE_STOCK_MAX', () => {
  it('au plafond : plus de missile, plus de REARM, rearmTime reste à 0, même après de longues durées', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX;
    rearm(world, 100 * CALLS_PER_MISSILE);
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX);
    expect(ship.rearmTime).toBe(0);
    expect(world.events.count).toBe(0);
  });

  it('à MAX − 1 : le dernier missile arrive, puis plus rien (un seul REARM, b = MAX)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX - 1;
    rearm(world, 10 * CALLS_PER_MISSILE);
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX);
    const rearms = eventsOf(world, EVT.REARM);
    expect(rearms).toHaveLength(1);
    expect(rearms[0].b).toBe(MISSILE_STOCK_MAX);
  });

  it('consommer un missile au plafond relance le réarmement depuis 0', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX;
    rearm(world, 3);
    ship.missiles--; // tir
    rearm(world, CALLS_PER_MISSILE - 1);
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX - 1); // 3 appels perdus au plafond : il en faut encore 4
    rearm(world, 1);
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX);
  });
});

describe('updateRearm : aucun réarmement hors conditions', () => {
  /** Assertions communes : stock inchangé, progression nulle, aucun événement. */
  function expectNoRearm(world, calls = 10 * CALLS_PER_MISSILE) {
    const ship = world.ships[0];
    const before = ship.missiles;
    rearm(world, calls);
    expect(ship.missiles).toBe(before);
    expect(ship.rearmTime).toBe(0);
    expect(eventsOf(world, EVT.REARM)).toHaveLength(0);
  }

  it('en vol', () => {
    const world = makeWorld();
    world.ships[0].landedOn = -1;
    expectNoRearm(world);
  });

  it('posé sur une planète neutre dotée d’une usine', () => {
    const world = makeWorld([{ ...BASE, owner: NEUTRAL }]);
    expectNoRearm(world);
  });

  it('posé sur une planète ennemie dotée d’une usine', () => {
    const world = makeWorld([{ ...BASE, owner: 1 }]);
    expectNoRearm(world);
  });

  it('posé sur sa planète sans aucun bâtiment', () => {
    const world = makeWorld([{ ...BASE, built: 0 }]);
    expectNoRearm(world);
  });

  it('posé sur sa planète avec la seule tourelle (slot 0) : ce n’est pas une usine', () => {
    const world = makeWorld([{ ...BASE, built: 1 }]);
    expectNoRearm(world);
  });

  it('usine sur une AUTRE planète de la faction : ne compte pas (la condition est locale à la planète)', () => {
    const world = makeWorld([
      { ...BASE, built: 1 },
      { ...OTHER, owner: 0 },
    ]);
    expect(world.factions[0].hasMissiles).toBe(true); // la faction a bien une usine quelque part
    expectNoRearm(world);
  });

  it('vaisseau mort (damageShip le détache du sol)', () => {
    const world = makeWorld();
    damageShip(world, 0, SHIP_MAX_HP, 0, 0);
    expect(world.ships[0].alive).toBe(false);
    expectNoRearm(world);
  });

  it('step ignore un vaisseau mort même si son landedOn est resté positionné', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    damageShip(world, 0, SHIP_MAX_HP, 0, 0);
    ship.landedOn = 0; // état forcé : seule la garde `alive` de `step` empêche alors le réarmement
    ship.respawnTimer = 100; // ne réapparaît pas pendant le test
    const rearms = stepCollect(world, 5 * STEPS_PER_MISSILE, EVT.REARM);
    expect(rearms).toHaveLength(0);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
    expect(ship.rearmTime).toBe(0);
  });

  it('une planète sans usine ne recharge pas non plus à travers `step` (600 pas)', () => {
    const world = makeWorld([{ ...BASE, built: 1 }]);
    expect(stepCollect(world, 600, EVT.REARM)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MIN);
  });
});

describe('updateRearm : la progression est perdue dès qu’une condition tombe', () => {
  function halfway() {
    const world = makeWorld();
    rearm(world, CALLS_PER_MISSILE - 1); // 1,5 s sur 2
    expect(world.ships[0].rearmTime).toBe((CALLS_PER_MISSILE - 1) * DT);
    return world;
  }

  it('décollage (landedOn = −1) : rearmTime à 0 ; un retour au sol repart de zéro', () => {
    const world = halfway();
    const ship = world.ships[0];
    ship.landedOn = -1;
    updateRearm(world, 0, DT);
    expect(ship.rearmTime).toBe(0);
    ship.landedOn = 0;
    updateRearm(world, 0, DT);
    expect(ship.rearmTime).toBe(DT); // et non 2 s : pas de reliquat
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
  });

  it('décollage réel par `step` (une poussée d’un pas) : rearmTime à 0 au pas du décollage', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    stepCollect(world, STEPS_PER_MISSILE / 2, EVT.REARM); // ≈ 1 s posé
    expect(ship.rearmTime).toBeCloseTo(1, 9); // 60 sommes de 1/60 : erreur d'arrondi ≪ 1e-9
    ship.intent.thrust = true; // la poussée d'un pas dépasse la gravité de surface (cf. capture.test.js)
    step(world, FIXED_DT);
    ship.intent.thrust = false;
    expect(ship.landedOn).toBe(-1);
    expect(ship.rearmTime).toBe(0);
  });

  it('la planète change de propriétaire en cours de route : rearmTime à 0', () => {
    const world = halfway();
    world.planets[0].owner = 1;
    updateRearm(world, 0, DT);
    expect(world.ships[0].rearmTime).toBe(0);
  });

  it('l’usine disparaît en cours de route : rearmTime à 0', () => {
    const world = halfway();
    world.planets[0].buildings[1].built = false;
    updateRearm(world, 0, DT);
    expect(world.ships[0].rearmTime).toBe(0);
  });

  it('la progression ne s’accumule pas non plus au plafond après une recharge', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX - 1;
    rearm(world, CALLS_PER_MISSILE); // atteint MAX
    rearm(world, 2);
    expect(ship.rearmTime).toBe(0);
  });
});

describe('respawn : le stock revient au minimum', () => {
  it('respawnShip remet missiles = MISSILE_STOCK_MIN et rearmTime = 0', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX;
    ship.rearmTime = 1.5;
    respawnShip(ship, 0, world.planets[0]);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
    expect(ship.rearmTime).toBe(0);
  });

  it('mort puis réapparition par `step` : stock au minimum (même avec un stock plein avant la mort)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = MISSILE_STOCK_MAX;
    damageShip(world, 0, SHIP_MAX_HP, 0, 0);
    const respawns = stepCollect(world, Math.round(RESPAWN_DELAY / FIXED_DT) + 5, EVT.RESPAWN);
    expect(respawns).toHaveLength(1);
    expect(ship.alive).toBe(true);
    // Réapparu < 1 s plus tôt sur sa base avec usine : le premier rechargement (2 s) n'est pas encore arrivé.
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
  });
});
