import { describe, expect, it } from 'vitest';
import { CAPTURE_TIME, FIXED_DT, SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Capture de bout en bout sur une mini-carte 4000×4000 : une base (index 0, owner 0) et une planète
// cible (index 1) à 600 px, r = 60, g0 = 70. Le vaisseau 0 atterrit réellement sur la cible (40 px/s
// radial, nez sur la normale, comme dans landing.test.js). La faction 1 n'a pas de vaisseau.
//
// Tolérances en pas : la capture a lieu au 180e pas posé (le pas du contact compte : `updateCapture`
// passe après `collideShipPlanets`), mais 180 additions de 1/60 peuvent valoir 3 − 4e-16 (181 pas).
// Le développement ultérieur s'écoule sur 1200 pas (20 s) avec le même risque : ±2 pas couvrent
// l'arrondi flottant et le pas de décalage entre `updateBuildings` et `updateCapture` dans `step`.
const SIZE = 4000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2;
const TURRET_STEPS = Math.round(BUILDINGS[0].buildTime / FIXED_DT); // 1200
const CAPTURE_STEPS = Math.round(CAPTURE_TIME / FIXED_DT); // 180
const TOL = 2;

const BASE = { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
const TARGET_POS = { x: 1600, y: 2000, radius: RADIUS, gravity: 70 };
const TARGET = 1;

function makeWorld({ target = TARGET_POS, seed = 1 } = {}) {
  const world = createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets: [BASE, target],
      spawns: [{ x: BASE.x, y: BASE.y - CONTACT, angle: UP }],
    },
    seed,
    { eventCapacity: 64 },
  );
  return world;
}

/** Lance le vaisseau 0 vers la cible : 2 px au-dessus du contact, 40 px/s radial, nez sur la normale. */
function launchOnto(world, planetIndex = TARGET) {
  const p = world.planets[planetIndex];
  const ship = world.ships[0];
  ship.pos.x = p.pos.x;
  ship.pos.y = p.pos.y - (CONTACT + 2);
  ship.vel.x = 0;
  ship.vel.y = 40; // vers le centre (la normale pointe vers le haut)
  ship.angle = UP;
  ship.landedOn = -1;
  return ship;
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/**
 * Journal d'un scénario : à chaque pas, `tick` (numéro du pas, 1-indexé) est associé aux événements
 * LANDED, CAPTURED et BUILT qu'il a émis.
 */
function createRecorder(world) {
  const log = { landed: [], captured: [], built: [] };
  return {
    log,
    step() {
      clearEvents(world.events);
      step(world, FIXED_DT);
      const tick = world.tick;
      for (const e of eventsOf(world, EVT.LANDED)) log.landed.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.CAPTURED)) log.captured.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILT)) log.built.push({ tick, ...e });
    },
    run(n) {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

describe('capture : atterrissage réel sur une planète neutre', () => {
  function play() {
    const world = makeWorld();
    const ship = launchOnto(world);
    const rec = createRecorder(world);
    rec.run(CAPTURE_STEPS + 300); // 3 s de capture + 5 s de marge
    return { world, ship, rec };
  }

  it('le vaisseau se pose (LANDED sur la cible) avant toute capture', () => {
    const { rec, ship } = play();
    expect(rec.log.landed).toHaveLength(1);
    expect(rec.log.landed[0]).toMatchObject({ a: 0, b: TARGET });
    // Contact imminent (2 px à 40 px/s) : posé en moins de 0,5 s.
    expect(rec.log.landed[0].tick).toBeLessThan(30);
    expect(ship.landedOn).toBe(TARGET);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('aucun CAPTURED avant 3 s posé ; CAPTURED à 3 s (±2 pas) ; owner passe à 0', () => {
    const world = makeWorld();
    launchOnto(world);
    const rec = createRecorder(world);
    while (rec.log.landed.length === 0) rec.step();
    const landedAt = rec.log.landed[0].tick;
    // Jusqu'à 3 pas avant l'échéance nominale : ni événement, ni propriétaire, compteur en cours.
    rec.run(CAPTURE_STEPS - TOL - 1);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[TARGET].owner).toBe(-1);
    expect(world.planets[TARGET].captureBy).toBe(0);
    expect(world.planets[TARGET].captureTime).toBeLessThan(CAPTURE_TIME);
    expect(world.planets[TARGET].captureTime).toBeGreaterThan(CAPTURE_TIME - 4 * FIXED_DT);

    rec.run(2 * TOL + 1);
    expect(rec.log.captured).toHaveLength(1);
    const c = rec.log.captured[0];
    // Pas du contact inclus : le 1er pas posé est celui de LANDED.
    expect(Math.abs(c.tick - landedAt + 1 - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
    expect(c).toMatchObject({ a: TARGET, b: 0, x: TARGET_POS.x, y: TARGET_POS.y });
    expect(world.planets[TARGET].owner).toBe(0);
    expect(world.planets[TARGET].captureBy).toBe(-1);
    expect(world.planets[TARGET].captureTime).toBe(0);
    expect(world.factions[0].planetCount).toBe(2);
  });

  it('un seul CAPTURED sur 8 s (le vaisseau reste posé sur sa propre planète)', () => {
    const { rec } = play();
    expect(rec.log.captured).toHaveLength(1);
  });

  it('la planète capturée se développe seule : BUILT du slot 0 après 20 s (±2 pas), buildProgress remis à 0', () => {
    const world = makeWorld();
    launchOnto(world);
    const rec = createRecorder(world);
    rec.run(CAPTURE_STEPS + 60);
    expect(rec.log.captured).toHaveLength(1);
    const capturedAt = rec.log.captured[0].tick;
    // La base (owner 0, built 0) bâtit aussi sa tourelle : on ne regarde que la planète cible.
    rec.run(TURRET_STEPS + 20);
    const builtOnTarget = rec.log.built.filter((e) => e.a === TARGET);
    expect(builtOnTarget).toHaveLength(1);
    expect(builtOnTarget[0].b).toBe(0);
    // `updateBuildings` précède `updateCapture` dans le pas : le chantier démarre au pas suivant la capture.
    expect(Math.abs(builtOnTarget[0].tick - capturedAt - TURRET_STEPS)).toBeLessThanOrEqual(TOL);
    expect(builtOnTarget[0]).toMatchObject({ x: TARGET_POS.x, y: TARGET_POS.y });
    const p = world.planets[TARGET];
    expect(p.buildings[0]).toEqual({ built: true, hp: BUILDINGS[0].turret.hp, cooldown: 0 });
    // Le chantier suivant (usine) a démarré au pas qui suit le BUILT : progression ≈ pas écoulés × dt.
    expect(p.buildProgress).toBeCloseTo((world.tick - builtOnTarget[0].tick) * FIXED_DT, 6); // somme de dt flottants
  });

  it('avant la capture, la cible ne se développe pas (neutre figée) alors que la base, si', () => {
    const world = makeWorld();
    launchOnto(world);
    const rec = createRecorder(world);
    rec.run(CAPTURE_STEPS - TOL - 1);
    expect(world.planets[TARGET].buildProgress).toBe(0);
    expect(world.planets[0].buildProgress).toBeGreaterThan(2.9 - 4 * FIXED_DT); // la base avance depuis le pas 1
  });
});

describe('capture : décollage avant la fin', () => {
  // Un pas de poussée verticale (140/60 ≈ 2,3 px/s) dépasse la gravité de surface (≈ 58/60 ≈ 1 px/s
  // par pas) : le vaisseau décolle de quelques centimètres puis retombe à ~2 px/s, nez inchangé,
  // et se repose en quelques dizaines de pas (saut < 0,3 s).
  it('décollage à 2,5 s : aucune capture, compteur à 0, puis reprise de zéro au réatterrissage', () => {
    const world = makeWorld();
    const ship = launchOnto(world);
    const rec = createRecorder(world);
    while (rec.log.landed.length === 0) rec.step();
    const firstLanding = rec.log.landed[0].tick;
    // 2,5 s posé = 150 pas, contact inclus.
    rec.run(150 - 1);
    const p = world.planets[TARGET];
    expect(p.captureTime).toBeGreaterThan(2.45);
    expect(p.captureTime).toBeLessThan(2.55);

    ship.intent.thrust = true;
    rec.step();
    ship.intent.thrust = false;
    expect(ship.landedOn).toBe(-1);
    expect(p.captureBy).toBe(-1);
    expect(p.captureTime).toBe(0);
    expect(rec.log.captured).toHaveLength(0);

    // Retombe et se repose.
    let hops = 0;
    while (ship.landedOn < 0 && hops < 300) {
      rec.step();
      hops++;
    }
    expect(ship.landedOn).toBe(TARGET);
    expect(ship.hp).toBe(SHIP_MAX_HP);
    expect(rec.log.landed).toHaveLength(2);
    const secondLanding = rec.log.landed[1].tick;
    expect(rec.log.captured).toHaveLength(0);

    // Le compteur repart de zéro : rien après 2,5 s de plus (il resterait 0,5 s sinon).
    rec.run(CAPTURE_STEPS - TOL - 1 - 1);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[TARGET].owner).toBe(-1);
    rec.run(2 * TOL + 2);
    expect(rec.log.captured).toHaveLength(1);
    // 180 pas posés (contact inclus) depuis le 2e atterrissage, ±2.
    expect(
      Math.abs(rec.log.captured[0].tick - secondLanding + 1 - CAPTURE_STEPS),
    ).toBeLessThanOrEqual(TOL);
    // Et nettement plus de 3 s après le premier atterrissage : le temps cumulé n'a pas été conservé.
    expect(rec.log.captured[0].tick - firstLanding).toBeGreaterThan(CAPTURE_STEPS + 150);
    expect(world.planets[TARGET].owner).toBe(0);
  });
});

describe('capture : planète ennemie sans défense', () => {
  const ENEMY_POS = { ...TARGET_POS, owner: 1, built: 0 };

  it('capturée par la faction 0 : bâtiments réinitialisés, progression remise à 0, puis redéveloppement pour le nouveau propriétaire', () => {
    const world = makeWorld({ target: ENEMY_POS });
    expect(world.factions[1].planetCount).toBe(1);
    expect(world.factions[1].eliminated).toBe(false);
    launchOnto(world);
    const rec = createRecorder(world);

    // Jusqu'à l'avant-dernier pas de la capture : l'ennemi développe sa planète depuis le pas 1
    // (≈ 3 s de chantier cumulées), mais pas assez pour finir sa tourelle (20 s).
    while (rec.log.captured.length === 0) {
      rec.step();
      if (rec.log.captured.length === 0) {
        expect(world.planets[TARGET].owner).toBe(1);
        expect(world.planets[TARGET].buildings[0].built).toBe(false);
      }
      expect(world.tick).toBeLessThan(CAPTURE_STEPS + 60);
    }
    const p = world.planets[TARGET];
    const capturedAt = rec.log.captured[0].tick;
    expect(rec.log.captured[0]).toMatchObject({ a: TARGET, b: 0 });
    expect(capturedAt).toBeGreaterThan(CAPTURE_STEPS - TOL); // posé au plus tôt à ~le pas 10
    expect(p.owner).toBe(0);
    // Le chantier de l'ancien propriétaire (≈ 3,2 s) est perdu.
    expect(p.buildProgress).toBe(0);
    for (const slot of p.buildings) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    expect(world.factions[0].planetCount).toBe(2);
    expect(world.factions[1].planetCount).toBe(0);

    // Redéveloppement complet pour la faction 0 : BUILT du slot 0 après 20 s (±2 pas).
    rec.run(TURRET_STEPS + 20);
    const built = rec.log.built.filter((e) => e.a === TARGET);
    expect(built).toHaveLength(1);
    expect(built[0].b).toBe(0);
    expect(Math.abs(built[0].tick - capturedAt - TURRET_STEPS)).toBeLessThanOrEqual(TOL);
    expect(p.buildings[0].built).toBe(true);
    expect(p.owner).toBe(0);
  });

  it('tourelle déjà construite (built: 1) : le même atterrissage ne capture jamais', () => {
    const world = makeWorld({ target: { ...ENEMY_POS, built: 1 } });
    const ship = launchOnto(world);
    const rec = createRecorder(world);
    rec.run(10 * 60);
    expect(rec.log.landed).toHaveLength(1);
    expect(ship.landedOn).toBe(TARGET);
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[TARGET].owner).toBe(1);
    expect(world.planets[TARGET].captureTime).toBe(0);
    expect(world.planets[TARGET].captureBy).toBe(-1);
  });
});

describe('capture : déterminisme', () => {
  const STEPS = 3000;

  /**
   * Vol scripté : atterrissage sur la cible, puis impulsions de poussée d'un pas tirées dans
   * world.rng (≈ une tous les 400 pas) : décollages/réatterrissages aléatoires, captures éventuelles.
   */
  function run(seed) {
    const world = makeWorld({ seed });
    const ship = launchOnto(world);
    const rec = createRecorder(world);
    for (let i = 0; i < STEPS; i++) {
      ship.intent.thrust = int(world.rng, 0, 400) === 0;
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

  it('même seed, même script : JSON identique (état et journal d’événements), état fini', () => {
    const a = run(11);
    const b = run(11);
    // Le scénario traverse bien l'atterrissage, une capture et un développement.
    expect(a.rec.log.landed.length).toBeGreaterThanOrEqual(1);
    expect(a.rec.log.captured.length).toBeGreaterThanOrEqual(1);
    expect(a.rec.log.built.length).toBeGreaterThanOrEqual(1);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.rec.log)).toBe(JSON.stringify(b.rec.log));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null
  });

  it('une autre seed donne un script différent (les impulsions dépendent bien du rng)', () => {
    expect(JSON.stringify(run(11).rec.log)).not.toBe(JSON.stringify(run(12).rec.log));
  });
});
