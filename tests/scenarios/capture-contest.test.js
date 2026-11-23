import { describe, expect, it } from 'vitest';
import { CAPTURE_TIME, EVENT_CAPACITY, FIXED_DT, SHIP_MAX_HP } from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { createWorld, step } from '../../src/core/world.js';

// ADR 0005 §7 : le propriétaire qui réapparaît sur sa planète pendant qu'un ennemi la capture la CONTESTE
// (deux vaisseaux posés : la règle « exactement un vaisseau posé » ne tient plus, le compteur retombe à 0).
// Carte : planète 0 = base de la faction 0 (sans bâtiment : aucune tourelle, donc capturable), planète 1 =
// base de la faction 1 (hors de portée). Le vaisseau 0 vole loin de tout puis meurt ; le vaisseau 1 est posé sur
// la planète 0 et la capture. Les durées en pas sont tenues à ±2 (additions de 1/60 en flottant).
const BASE_0 = { x: 500, y: 300, radius: 40, owner: 0 };
const BASE_1 = { x: 1300, y: 700, radius: 40, owner: 1 };
const FAR = { x: 1800, y: 1100 }; // > 5 × r de toute planète : vol libre, vitesse nulle
const CAPTURE_STEPS = Math.round(CAPTURE_TIME / FIXED_DT); // 180
const TOL = 2;
const RESPAWN_IN = 1.5; // s : le propriétaire revient à mi-capture (< CAPTURE_TIME)

function makeWorld() {
  return createWorld(
    {
      width: 2400,
      height: 1350,
      planets: [BASE_0, BASE_1],
      spawns: [{ x: FAR.x, y: FAR.y }, { planet: 0 }],
    },
    1,
    { eventCapacity: EVENT_CAPACITY },
  );
}

function tick(world) {
  clearEvents(world.events);
  step(world, FIXED_DT);
  return world.events.items.slice(0, world.events.count).map((e) => ({ ...e }));
}

function runUntil(world, predicate, maxSteps) {
  const events = [];
  for (let i = 0; i < maxSteps; i++) {
    events.push(...tick(world));
    if (predicate()) return events;
  }
  throw new Error(`condition jamais atteinte en ${maxSteps} pas`);
}

describe('capture contestée par le respawn du propriétaire', () => {
  /** Le vaisseau 0 meurt au pas 0 ; son respawn est ramené à RESPAWN_IN secondes (au lieu de 3 s = CAPTURE_TIME). */
  function contestedWorld() {
    const world = makeWorld();
    damageShip(world, 0, SHIP_MAX_HP, FAR.x, FAR.y);
    // Réglage d'état volontaire : avec RESPAWN_DELAY = CAPTURE_TIME = 3 s, le respawn et la capture se joueraient
    // sur le même pas ; on veut isoler la contestation, pas une course.
    world.ships[0].respawnTimer = RESPAWN_IN;
    clearEvents(world.events);
    return world;
  }

  it('avant le respawn, la capture progresse (faction 1, compteur > 0)', () => {
    const world = contestedWorld();
    for (let i = 0; i < 60; i++) tick(world);
    expect(world.ships[0].alive).toBe(false);
    expect(world.planets[0].captureBy).toBe(1);
    // 60 pas × 1/60 s ; tolérance 1e-9 : seules des additions de 1/60 en flottant.
    expect(world.planets[0].captureTime).toBeCloseTo(1, 9);
  });

  it('au pas du respawn, le compteur retombe à 0 et captureBy à −1 ; RESPAWN émis sur la planète 0', () => {
    const world = contestedWorld();
    const events = runUntil(world, () => world.ships[0].alive, 200);
    // Respawn à RESPAWN_IN s (±1 pas), bien avant la fin de la capture (3 s).
    expect(Math.abs(world.tick - RESPAWN_IN / FIXED_DT)).toBeLessThanOrEqual(TOL);
    expect(events.filter((e) => e.type === EVT.RESPAWN)).toMatchObject([{ a: 0, b: 0 }]);
    expect(world.ships[0].landedOn).toBe(0);
    expect(world.ships[1].landedOn).toBe(0);
    expect(world.planets[0].captureTime).toBe(0);
    expect(world.planets[0].captureBy).toBe(-1);
    expect(world.planets[0].owner).toBe(0);
  });

  it('tant que les deux sont posés : aucune capture, le compteur reste à 0 (10 s)', () => {
    const world = contestedWorld();
    runUntil(world, () => world.ships[0].alive, 200);
    const events = [];
    for (let i = 0; i < 600; i++) {
      events.push(...tick(world));
      expect(world.planets[0].captureTime).toBe(0);
    }
    expect(events.filter((e) => e.type === EVT.CAPTURED)).toHaveLength(0);
    expect(world.planets[0].owner).toBe(0);
    expect(world.factions[0]).toMatchObject({ planetCount: 1, eliminated: false });
  });

  it('si le propriétaire décolle, l’assaillant repart de 0 : capture 3 s (±2 pas) après le décollage', () => {
    const world = contestedWorld();
    runUntil(world, () => world.ships[0].alive, 200);
    world.ships[0].intent.thrust = true; // nez vers le haut (respawn) : il décolle
    runUntil(world, () => world.ships[0].landedOn === -1, 60);
    // Il met le cap sur +x en poussant sans arrêt : en 3 s il s'éloigne bien au-delà de la gravité de la planète
    // (140 px/s² de poussée contre g0 ≤ 84) et ne se repose pas.
    world.ships[0].angle = 0;
    const takeoffTick = world.tick;
    const events = runUntil(world, () => world.planets[0].owner === 1, CAPTURE_STEPS + 60);
    const captured = events.filter((e) => e.type === EVT.CAPTURED);
    expect(captured).toMatchObject([{ a: 0, b: 1 }]);
    // Le compteur redémarre à 0 au premier pas où un seul vaisseau reste posé : pas de reprise de l'ancien 1 s.
    expect(Math.abs(world.tick - takeoffTick - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
    expect(world.ships[0].landedOn).toBe(-1);
  });

  it('témoin sans respawn : la capture aboutit en 3 s (±2 pas)', () => {
    const world = makeWorld();
    damageShip(world, 0, SHIP_MAX_HP, FAR.x, FAR.y);
    world.ships[0].respawnTimer = 1e9; // reste mort
    clearEvents(world.events);
    const events = runUntil(world, () => world.planets[0].owner === 1, CAPTURE_STEPS + 60);
    expect(events.filter((e) => e.type === EVT.CAPTURED)).toMatchObject([{ a: 0, b: 1 }]);
    expect(Math.abs(world.tick - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
  });
});
