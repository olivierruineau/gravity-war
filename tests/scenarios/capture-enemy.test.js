import { describe, expect, it } from 'vitest';
import { CAPTURE_TIME, FIXED_DT, SHIP_COLLISION_RADIUS } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { int } from '../../src/core/rng.js';
import { respawnShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// Item 4.6 : capture d'une planète ennemie défendue. Mini-carte 4000×4000 : une base de la faction 0
// (index 0) et la planète ennemie (index 1, owner 1, r = 60, g0 = 70) à 600 px. La faction 0 a donc une
// planète (elle n'est pas « hors jeu » et peut capturer). Le vaisseau 0 a des PV énormes : les tirs de la
// tourelle ne peuvent pas le tuer, il isole la règle de capture. Il est posé sur la planète ennemie
// (`makeWorld()`), ou, pour détruire la tourelle, EN VOL à 100 px de la surface, nez vers elle
// (`makeWorld({ flying: true })`) : un vaisseau posé ne peut pas tirer vers le sol, sa bouche serait dans la
// planète. Après la destruction, `destroyTurret` le pose sur la planète (même état qu'un respawn) : c'est le capteur.
//
// Tolérances en pas : la capture a lieu 3 s = 180 pas après la destruction de la dernière tourelle (le pas
// de la destruction compte : `updateCapture` passe après les collisions), mais 180 additions de 1/60 peuvent
// valoir 3 − 4e-16 (181 pas). Le redéveloppement s'écoule sur 1200 pas (20 s) avec le même risque : ±2 pas
// couvrent l'arrondi flottant et le décalage entre `updateBuildings` et `updateCapture` dans `step`.
const SIZE = 4000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const TURRET = BUILDINGS[0].turret;
const TURRET_STEPS = Math.round(BUILDINGS[0].buildTime / FIXED_DT); // 1200
const CAPTURE_STEPS = Math.round(CAPTURE_TIME / FIXED_DT); // 180
const TOL = 2;
const HUGE_HP = 1e9;
const ENEMY = 1;
const BASE = { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
const ENEMY_POS = { x: 1600, y: 2000, radius: RADIUS, gravity: 70, owner: 1 };
const DOWN = Math.PI / 2;
// Attaquant en vol : 160 px du centre = 100 px de surface (dans la portée de 150 px de la tourelle). À cette
// distance g ≈ 70·(60/160)² ≈ 10 px/s² : il dérive d'environ 25 px pendant les ~2,5 s d'attaque et ne touche pas la planète.
const FLYING_START = { x: ENEMY_POS.x, y: ENEMY_POS.y - 160, angle: DOWN };

function makeWorld({ built = 3, seed = 1, buildProgress = 0, flying = false } = {}) {
  const world = createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets: [BASE, { ...ENEMY_POS, built }],
      // Posé au sommet de la planète ennemie dès le pas 0 (spawn { planet }), comme après un respawn.
      spawns: [flying ? FLYING_START : { planet: ENEMY }],
    },
    seed,
    { eventCapacity: 64 },
  );
  const ship = world.ships[0];
  ship.hp = HUGE_HP;
  if (!flying) expect(ship.pos.y).toBe(ENEMY_POS.y - CONTACT);
  world.planets[ENEMY].buildProgress = buildProgress;
  return world;
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

function createRecorder(world) {
  const log = { captured: [], built: [], destroyed: [] };
  return {
    log,
    step() {
      clearEvents(world.events);
      step(world, FIXED_DT);
      const tick = world.tick;
      for (const e of eventsOf(world, EVT.CAPTURED)) log.captured.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILT)) log.built.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILDING_DESTROYED)) log.destroyed.push({ tick, ...e });
    },
    run(n) {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

/** Pose le capteur sur la planète ennemie (état de respawn), PV énormes : la capture démarre au pas suivant. */
function landCapturer(world) {
  const ship = world.ships[0];
  respawnShip(ship, ENEMY, world.planets[ENEMY]);
  ship.hp = HUGE_HP;
}

/**
 * L'attaquant (en vol, nez vers la planète) tire jusqu'à la destruction de la tourelle, puis le capteur est posé.
 * Renvoie le numéro de pas de la pose : le compteur de capture démarre au pas suivant.
 */
function destroyTurret(world, rec) {
  const ship = world.ships[0];
  ship.intent.fire = true;
  while (rec.log.destroyed.length === 0) {
    rec.step();
    expect(world.tick).toBeLessThan(1200); // garde-fou : 20 s
    expect(world.planets[ENEMY].captureTime).toBe(0); // en vol : aucune capture possible
  }
  ship.intent.fire = false;
  expect(ship.landedOn).toBe(-1); // il a attaqué en vol, sans jamais se poser
  landCapturer(world);
  return world.tick;
}

describe('capture ennemie : une tourelle construite bloque tout', () => {
  it('posé 10 s sur une planète défendue : aucun CAPTURED, compteur à 0, propriétaire inchangé', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const rec = createRecorder(world);
    for (let i = 0; i < 10 * 60; i++) {
      rec.step();
      expect(world.planets[ENEMY].captureTime).toBe(0);
      expect(world.planets[ENEMY].captureBy).toBe(-1);
      expect(world.planets[ENEMY].owner).toBe(ENEMY);
    }
    expect(rec.log.captured).toHaveLength(0);
    expect(ship.alive).toBe(true);
    expect(ship.landedOn).toBe(ENEMY);
    expect(world.planets[ENEMY].buildings[0].built).toBe(true);
    expect(world.factions[0].planetCount).toBe(1);
    expect(world.factions[ENEMY].planetCount).toBe(1);
  });

  it('la tourelle a bien tiré sur l’intrus pendant ce temps (il est la cible, la défense est réelle)', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    rec.run(10 * 60);
    expect(world.ships[0].hp).toBeLessThan(HUGE_HP);
    // 10 s de tir à ≥ 1 s d'intervalle : 10 ou 11 tirs, dont beaucoup au but (le vaisseau est à 4 px).
    expect(HUGE_HP - world.ships[0].hp).toBeGreaterThanOrEqual(TURRET.damage * 5);
  });

  it('même une tourelle lourde seule (base détruite, lourde construite) bloque la capture', () => {
    const world = makeWorld({ built: 0 });
    world.planets[ENEMY].buildings[3].built = true;
    world.planets[ENEMY].buildings[3].hp = BUILDINGS[3].hp;
    const rec = createRecorder(world);
    rec.run(10 * 60);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(ENEMY);
  });
});

describe('capture ennemie : tourelle détruite puis capteur posé 3 s', () => {
  /** Joue jusqu'à la capture, en vérifiant que le compteur ne démarre qu'après la destruction et la pose. */
  function playUntilCaptured() {
    const world = makeWorld({ flying: true });
    const rec = createRecorder(world);
    rec.run(60); // la tourelle défend 1 s, rien ne se capture
    expect(world.planets[ENEMY].captureTime).toBe(0);
    const landedAt = destroyTurret(world, rec);
    // La pose se fait entre deux pas : le compteur démarre au pas suivant (une seule addition de dt).
    expect(world.planets[ENEMY].captureTime).toBe(0);
    rec.step();
    expect(world.planets[ENEMY].captureBy).toBe(0);
    expect(world.planets[ENEMY].captureTime).toBeCloseTo(FIXED_DT, 12); // une seule addition de dt
    while (rec.log.captured.length === 0) {
      rec.step();
      expect(world.tick).toBeLessThan(landedAt + CAPTURE_STEPS + 60);
    }
    return { world, rec, landedAt };
  }

  it('CAPTURED 3 s (±2 pas) après la pose du capteur ; propriétaire = faction 0 ; compteur remis à 0', () => {
    const { world, rec, landedAt } = playUntilCaptured();
    expect(rec.log.captured).toHaveLength(1);
    const c = rec.log.captured[0];
    // Le compteur démarre au pas qui suit la pose : CAPTURED tombe CAPTURE_STEPS pas après `landedAt`.
    expect(Math.abs(c.tick - landedAt - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
    expect(c).toMatchObject({ a: ENEMY, b: 0, x: ENEMY_POS.x, y: ENEMY_POS.y });
    expect(world.planets[ENEMY].owner).toBe(0);
    expect(world.planets[ENEMY].captureBy).toBe(-1);
    expect(world.planets[ENEMY].captureTime).toBe(0);
  });

  it('pas de capture avant l’échéance : le compteur reste sous 3 s jusqu’à 2 pas avant la fin', () => {
    const world = makeWorld({ flying: true });
    const rec = createRecorder(world);
    destroyTurret(world, rec);
    rec.run(CAPTURE_STEPS - TOL - 2);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(ENEMY);
    expect(world.planets[ENEMY].captureTime).toBeLessThan(CAPTURE_TIME);
  });

  it('les bâtiments sont réinitialisés : aucun slot construit, hp 0, chantier à 0', () => {
    const { world } = playUntilCaptured();
    const p = world.planets[ENEMY];
    // Avant la capture, la planète avait la tourelle (détruite), l'usine et le générateur : tout est perdu.
    for (const slot of p.buildings) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    expect(p.buildProgress).toBe(0);
  });

  it('la faction perdante voit planetCount baisser et ses capacités (missiles, bouclier) disparaître', () => {
    const world = makeWorld({ flying: true });
    const rec = createRecorder(world);
    rec.run(1);
    // Avant : la faction 1 a une usine et un générateur (built: 3) sur sa seule planète.
    expect(world.factions[ENEMY]).toMatchObject({
      planetCount: 1,
      hasMissiles: true,
      hasShield: true,
    });
    expect(world.factions[0]).toMatchObject({
      planetCount: 1,
      hasMissiles: false,
      hasShield: false,
    });
    destroyTurret(world, rec);
    // La tourelle détruite ne change pas encore les capacités (usine et générateur debout).
    expect(world.factions[ENEMY]).toMatchObject({
      planetCount: 1,
      hasMissiles: true,
      hasShield: true,
    });
    while (rec.log.captured.length === 0) {
      rec.step();
      expect(world.tick).toBeLessThan(1200);
    }
    expect(world.factions[ENEMY].planetCount).toBe(0);
    expect(world.factions[ENEMY].hasMissiles).toBe(false);
    expect(world.factions[ENEMY].hasShield).toBe(false);
    expect(world.factions[0].planetCount).toBe(2);
    // Le gagnant ne récupère pas les bâtiments : pas de capacité tant que rien n'est reconstruit.
    expect(world.factions[0].hasMissiles).toBe(false);
    expect(world.factions[0].hasShield).toBe(false);
  });

  it('la planète se redéveloppe pour le nouveau propriétaire : BUILT slot 0 après 20 s (±2 pas), la tourelle ne tire pas sur lui', () => {
    const { world, rec } = playUntilCaptured();
    const capturedAt = rec.log.captured[0].tick;
    // Planète désormais à la faction 0 : sa nouvelle tourelle ne doit pas tirer sur le vaisseau 0.
    const hpAtCapture = world.ships[0].hp;
    rec.run(TURRET_STEPS + 20);
    const built = rec.log.built.filter((e) => e.a === ENEMY);
    expect(built).toHaveLength(1);
    expect(built[0].b).toBe(0);
    // `updateBuildings` précède `updateCapture` : le chantier démarre au pas suivant la capture.
    expect(Math.abs(built[0].tick - capturedAt - TURRET_STEPS)).toBeLessThanOrEqual(TOL);
    expect(world.planets[ENEMY].buildings[0]).toMatchObject({ built: true, hp: BUILDINGS[0].hp });
    expect(world.planets[ENEMY].owner).toBe(0);
    expect(world.ships[0].hp).toBe(hpAtCapture);
    // La faction 0 n'a que la tourelle neuve sur cette planète (pas d'usine) : toujours pas de missiles.
    expect(world.factions[0].hasMissiles).toBe(false);
  });
});

describe('capture ennemie : tourelle reconstruite pendant une capture en cours', () => {
  // Planète ennemie sans bâtiment (built: 0) mais dont le chantier de tourelle est à 1,5 s de la fin :
  // l'intrus posé commence à capturer, puis la tourelle sort de terre à mi-chemin.
  const REMAINING = 1.5;
  const buildProgress = BUILDINGS[0].buildTime - REMAINING;

  it('le compteur retombe à 0 au pas où la tourelle est achevée, et la capture n’aboutit jamais', () => {
    const world = makeWorld({ built: 0, buildProgress });
    const rec = createRecorder(world);
    let before = 0;
    while (rec.log.built.length === 0) {
      before = world.planets[ENEMY].captureTime;
      rec.step();
      expect(world.tick).toBeLessThan(CAPTURE_STEPS);
    }
    // Le compteur avançait (≈ 1,5 s) quand la tourelle a été achevée.
    expect(before).toBeGreaterThan(REMAINING - 3 * FIXED_DT);
    expect(before).toBeLessThan(CAPTURE_TIME);
    expect(rec.log.built[0]).toMatchObject({ a: ENEMY, b: 0 });
    // Ce même pas : `updateBuildings` précède `updateCapture`, donc la capture est déjà remise à zéro.
    expect(world.planets[ENEMY].captureTime).toBe(0);
    expect(world.planets[ENEMY].captureBy).toBe(-1);

    rec.run(10 * 60);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(ENEMY);
    expect(world.planets[ENEMY].captureTime).toBe(0);
  });

  it('témoin : sans tourelle en construction, la même configuration est bien capturée en 3 s', () => {
    // Même carte, chantier à 0 : la tourelle n'arrive que dans 20 s, la capture a lieu avant (3 s).
    const world = makeWorld({ built: 0, buildProgress: 0 });
    const rec = createRecorder(world);
    rec.run(CAPTURE_STEPS + TOL + 2);
    expect(rec.log.captured).toHaveLength(1);
    expect(Math.abs(rec.log.captured[0].tick - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL + 1);
    expect(rec.log.built).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(0);
  });
});

describe('capture ennemie : déterminisme', () => {
  const STEPS = 3000;

  /**
   * Partie scriptée : l'attaquant en vol tire sur la planète par rafales tirées dans world.rng (un tirage par
   * pas, 2 chances sur 3 de tenir la gâchette) jusqu'à la destruction de la tourelle ; le capteur est alors posé
   * et reste là (capture, redéveloppement).
   */
  function run(seed) {
    const world = makeWorld({ seed, flying: true });
    const ship = world.ships[0];
    const rec = createRecorder(world);
    let landed = false;
    for (let i = 0; i < STEPS; i++) {
      if (!landed && rec.log.destroyed.length > 0) {
        landCapturer(world);
        landed = true;
      }
      ship.intent.fire = !landed && int(world.rng, 0, 3) !== 0;
      rec.step();
    }
    return { world, rec };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(allFinite);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed : état et journal identiques ; le scénario traverse destruction, capture et construction', () => {
    const a = run(7);
    const b = run(7);
    expect(a.world.tick).toBe(STEPS);
    expect(a.rec.log.destroyed.length).toBeGreaterThanOrEqual(1);
    expect(a.rec.log.captured.length).toBeGreaterThanOrEqual(1);
    expect(a.rec.log.built.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.rec.log)).toBe(JSON.stringify(b.rec.log));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null
  });

  it('une autre seed donne un journal différent (rafales et dispersion des tourelles dépendent du rng)', () => {
    expect(JSON.stringify(run(7).rec.log)).not.toBe(JSON.stringify(run(8).rec.log));
  });
});
