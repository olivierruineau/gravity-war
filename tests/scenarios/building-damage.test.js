import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  CAPTURE_TIME,
  FIXED_DT,
  MISSILE_DAMAGE,
  SHIP_COLLISION_RADIUS,
} from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { int } from '../../src/core/rng.js';
import { respawnShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// ADR 0007 : dégâts aux bâtiments. Mini-carte 4000×4000 : une base de la faction 0 (index 0, pour qu'elle soit
// « en jeu » et puisse capturer) et la planète ennemie (index 1, owner 1, r = 60) à 600 px, ENTIÈREMENT
// construite (`built: 4` : tourelle, usine, générateur, lourde). Le vaisseau 0 attaque EN VOL à 100 px de la
// surface, nez vers la planète, avec des PV énormes : les tourelles ennemies tirent sur lui mais ne peuvent pas
// le tuer, ce qui isole les règles de dégâts. La gravité de la planète ennemie est nulle : l'attaquant reste
// exactement où il est posé pendant les ~135 s de reconstruction, et chaque balle part radialement vers le centre
// (aucune dérive, donc TOUTES les balles touchent). Éventuellement :
//  - un vaisseau 1 « défenseur » (faction 1), loin de tout, avec des missiles : il sert à observer la perte de
//    capacité (tirer des missiles) de la faction ;
//  - une 2e planète de la faction 1 (index 2), loin, avec `second` slots construits.
//
// Tolérances en pas : un chantier de N s dure N·60 pas, mais N·60 additions de 1/60 peuvent valoir N − 4e-16
// (un pas de moins) ; `updateBuildings` ajoute aussi dt au pas même de la destruction. ±2 pas (TOL) couvrent
// l'arrondi flottant et ce décalage ; chaque chantier est mesuré à part (pas de cumul des erreurs).
const SIZE = 4000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const TOL = 2;
const HUGE_HP = 1e9;
const ENEMY = 1;
const SECOND = 2;
const TURRET = 0;
const FACTORY = 1;
const GENERATOR = 2;
const HEAVY = 3;
const RAZE_ORDER = [TURRET, HEAVY, FACTORY, GENERATOR];
const CAPTURE_STEPS = Math.round(CAPTURE_TIME / FIXED_DT); // 180
const BASE = { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
const ENEMY_POS = { x: 1600, y: 2000, radius: RADIUS, gravity: 0, owner: 1 };
const SECOND_POS = { x: 3000, y: 3000, radius: RADIUS, gravity: 0, owner: 1 };
const DOWN = Math.PI / 2;
const UP = -Math.PI / 2;
const ATTACKER_START = { x: ENEMY_POS.x, y: ENEMY_POS.y - (RADIUS + 100), angle: DOWN };
const DEFENDER_START = { x: 3500, y: 800, angle: UP }; // à > 2000 px de toute planète, nez vers le bord de carte

function steps(slot) {
  return Math.round(BUILDINGS[slot].buildTime / FIXED_DT);
}

function makeWorld({
  built = 4,
  seed = 1,
  defender = false,
  second,
  attackerMissiles = false,
} = {}) {
  const planets = [attackerMissiles ? { ...BASE, built: 2 } : BASE, { ...ENEMY_POS, built }];
  if (second !== undefined) planets.push({ ...SECOND_POS, built: second });
  const world = createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets,
      spawns: defender ? [ATTACKER_START, DEFENDER_START] : [ATTACKER_START],
    },
    seed,
    { eventCapacity: 256 },
  );
  for (const ship of world.ships) ship.hp = HUGE_HP;
  return world;
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

function totalHp(planet) {
  return planet.buildings.reduce((sum, slot) => sum + slot.hp, 0);
}

/**
 * Enregistre les événements utiles pas à pas, et vérifie à chaque pas les invariants des PV de la planète
 * ennemie : 0 ≤ hp ≤ max, `built` ⇔ hp > 0, et le total de PV ne monte qu'au pas d'un BUILT (pas de régénération).
 */
function createRecorder(world) {
  const log = {
    captured: [],
    built: [],
    destroyed: [], // { tick, b, hits } : `hits` = balles ayant touché la planète ennemie jusqu'à ce pas inclus
    launches: [],
    hits: 0,
    caps: [], // changements de capacité de la faction 1 : { tick, hasMissiles, hasShield }
  };
  let lastCaps = null;
  let prevTotal = totalHp(world.planets[ENEMY]);
  return {
    log,
    step() {
      clearEvents(world.events);
      step(world, FIXED_DT);
      const tick = world.tick;
      for (const e of eventsOf(world, EVT.BULLET_HIT)) if (e.a === ENEMY) log.hits++;
      for (const e of eventsOf(world, EVT.CAPTURED)) log.captured.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILT)) if (e.a === ENEMY) log.built.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILDING_DESTROYED))
        if (e.a === ENEMY) log.destroyed.push({ tick, ...e, hits: log.hits });
      for (const e of eventsOf(world, EVT.MISSILE_LAUNCH)) log.launches.push({ tick, ...e });
      const { hasMissiles, hasShield } = world.factions[ENEMY];
      if (
        lastCaps === null ||
        lastCaps.hasMissiles !== hasMissiles ||
        lastCaps.hasShield !== hasShield
      ) {
        lastCaps = { tick, hasMissiles, hasShield };
        log.caps.push(lastCaps);
      }
      const planet = world.planets[ENEMY];
      if (planet.owner === ENEMY) {
        planet.buildings.forEach((slot, s) => {
          expect(slot.hp).toBeGreaterThanOrEqual(0);
          expect(slot.hp).toBeLessThanOrEqual(BUILDINGS[s].hp);
          expect(slot.built).toBe(slot.hp > 0);
        });
        const total = totalHp(planet);
        if (total > prevTotal) expect(eventsOf(world, EVT.BUILT).length).toBeGreaterThan(0);
        prevTotal = total;
      } else prevTotal = totalHp(planet);
    },
    run(n) {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

/** L'attaquant tire jusqu'à ce que `count` bâtiments aient été détruits sur la planète ennemie, puis cesse le feu. */
function fireUntilDestroyed(world, rec, count) {
  const ship = world.ships[0];
  ship.intent.fire = true;
  while (rec.log.destroyed.length < count) {
    rec.step();
    expect(world.tick).toBeLessThan(1500); // garde-fou : 25 s pour au plus 39 balles
  }
  ship.intent.fire = false;
}

/** Pose le capteur sur la planète ennemie (état de respawn, PV énormes) : la capture démarre au pas suivant. */
function landCapturer(world) {
  const ship = world.ships[0];
  respawnShip(ship, ENEMY, world.planets[ENEMY]);
  ship.hp = HUGE_HP;
  expect(ship.pos.y).toBe(ENEMY_POS.y - CONTACT);
}

describe('rasage d’une planète entièrement construite : ordre et coût', () => {
  it('l’état de départ : 4 slots construits à PV pleins, l’attaquant en vol hors de la planète', () => {
    const world = makeWorld();
    expect(world.planets[ENEMY].buildings).toEqual(
      BUILDINGS.map((b) => ({ built: true, hp: b.hp, cooldown: 0 })),
    );
    expect(world.ships[0].landedOn).toBe(-1);
  });

  it('tourelle, lourde, usine puis générateur : BUILDING_DESTROYED dans cet ordre, a = planète', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    expect(rec.log.destroyed.map((e) => e.b)).toEqual(RAZE_ORDER);
    for (const e of rec.log.destroyed) expect(e.a).toBe(ENEMY);
    // Ticks strictement croissants : un seul bâtiment tombe par pas (une balle = un coup = un slot).
    for (let i = 1; i < rec.log.destroyed.length; i++) {
      expect(rec.log.destroyed[i].tick).toBeGreaterThan(rec.log.destroyed[i - 1].tick);
    }
    for (const slot of world.planets[ENEMY].buildings) {
      expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    }
  });

  it('39 balles touchent au total : 7 + 14 + 9 + 9, cumulés 7 / 21 / 30 / 39 au pas de chaque destruction', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    // Aucune tolérance : l'attaquant est immobile (gravité nulle) et vise le centre, donc toutes les balles
    // touchent, et chaque coup de 12 PV est un entier exact (80/12 → 7, 160/12 → 14, 100/12 → 9).
    expect(BULLET_DAMAGE).toBe(12);
    expect(rec.log.destroyed.map((e) => e.hits)).toEqual([7, 21, 30, 39]);
    // Tirer 39 balles à FIRE_COOLDOWN = 0,18 s (≈ 11 pas) : environ 7 s de tir, borne large [6 s, 9 s].
    expect(world.tick).toBeGreaterThan(6 * 60);
    expect(world.tick).toBeLessThan(9 * 60);
  });

  it('les tourelles ennemies ont réellement riposté pendant le rasage (l’attaquant a perdu des PV)', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 1);
    // La tourelle de base tire au moins une fois par seconde sur une cible à 100 px : plusieurs tirs avant sa chute.
    expect(world.ships[0].hp).toBeLessThan(HUGE_HP);
  });

  it('le chantier est à zéro après chaque destruction et la planète ne reconstruit rien pendant le raid', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    // Le raid dure moins de 20 s : aucun chantier n'aboutit. Au dernier pas, seul dt a été ajouté depuis la remise à 0.
    expect(rec.log.built).toHaveLength(0);
    expect(world.planets[ENEMY].buildProgress).toBeCloseTo(FIXED_DT, 12); // 0 + une addition de dt, exacte
  });

  it('même rasage au missile : 12 missiles de 40 (2 + 4 + 3 + 3), chacun inflige ses dégâts à un seul bâtiment', () => {
    // La faction 0 a une usine sur sa base (`attackerMissiles`) : `updateWeapons` exige hasMissiles. Les missiles
    // (guidés, sans cible dans le cône) partent droit vers le centre et suivent le même chemin que les balles.
    const world = makeWorld({ attackerMissiles: true });
    const rec = createRecorder(world);
    const ship = world.ships[0];
    ship.missiles = 12;
    ship.intent.missile = true;
    while (rec.log.destroyed.length < 4) {
      rec.step();
      expect(world.tick).toBeLessThan(1500);
    }
    expect(MISSILE_DAMAGE).toBe(40);
    expect(rec.log.destroyed.map((e) => e.b)).toEqual(RAZE_ORDER);
    expect(rec.log.destroyed.map((e) => e.hits)).toEqual([2, 6, 9, 12]);
    expect(ship.missiles).toBe(0);
  });
});

describe('rasage : capacités de la faction', () => {
  it('hasMissiles tombe au pas exact où l’usine est détruite (seule usine), hasShield pour le générateur', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    expect(world.factions[ENEMY]).toMatchObject({ hasMissiles: true, hasShield: true });
    fireUntilDestroyed(world, rec, 4);
    const [, , factory, generator] = rec.log.destroyed;
    expect(factory.b).toBe(FACTORY);
    expect(generator.b).toBe(GENERATOR);
    // Journal des changements : départ (true, true), puis perte des missiles à `factory.tick`, du bouclier à `generator.tick`.
    expect(rec.log.caps).toEqual([
      { tick: 1, hasMissiles: true, hasShield: true },
      { tick: factory.tick, hasMissiles: false, hasShield: true },
      { tick: generator.tick, hasMissiles: false, hasShield: false },
    ]);
    expect(factory.tick).toBeLessThan(generator.tick);
  });

  it('la perte d’une tourelle ne change aucune capacité', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 2); // base + lourde
    expect(rec.log.caps).toEqual([{ tick: 1, hasMissiles: true, hasShield: true }]);
    expect(world.factions[ENEMY]).toMatchObject({
      planetCount: 1,
      hasMissiles: true,
      hasShield: true,
    });
  });

  it('le stock de missiles du vaisseau est conservé, mais il ne peut plus en lancer', () => {
    const world = makeWorld({ defender: true });
    const defender = world.ships[1];
    const rec = createRecorder(world);
    defender.missiles = 3;
    // Témoin : tant que l'usine existe, il tire (3 → 2).
    defender.intent.missile = true;
    rec.step();
    defender.intent.missile = false;
    expect(defender.missiles).toBe(2);
    expect(rec.log.launches).toHaveLength(1);

    fireUntilDestroyed(world, rec, 3); // jusqu'à la chute de l'usine
    expect(world.factions[ENEMY].hasMissiles).toBe(false);
    expect(defender.missiles).toBe(2); // stock conservé

    // Maintenant il maintient la détente 2 s (≫ MISSILE_COOLDOWN = 0,5 s) : rien ne part.
    defender.intent.missile = true;
    rec.run(120);
    expect(defender.missiles).toBe(2);
    expect(rec.log.launches).toHaveLength(1);
  });

  it.each([
    { second: 2, label: 'tourelle + usine', missiles: true, shield: false },
    { second: 3, label: 'tourelle + usine + générateur', missiles: true, shield: true },
  ])(
    'une 2e planète de la faction ($label) conserve les capacités qu’elle porte ; le vaisseau tire toujours',
    ({ second, missiles, shield }) => {
      const world = makeWorld({ defender: true, second });
      const defender = world.ships[1];
      const rec = createRecorder(world);
      defender.missiles = 4;
      fireUntilDestroyed(world, rec, 4); // la planète 1 est rasée
      expect(world.factions[ENEMY].planetCount).toBe(2);
      expect(world.factions[ENEMY].hasMissiles).toBe(missiles);
      expect(world.factions[ENEMY].hasShield).toBe(shield);
      // Aucun changement de capacité ne concerne les missiles : l'usine de la 2e planète couvre la faction.
      expect(rec.log.caps.every((c) => c.hasMissiles === true)).toBe(true);
      expect(world.planets[SECOND].buildings[FACTORY].built).toBe(true);
      // Et il peut toujours lancer : maintenir la détente 1 s fait partir au moins un missile.
      defender.intent.missile = true;
      rec.run(60);
      expect(rec.log.launches.length).toBeGreaterThanOrEqual(1);
      expect(defender.missiles).toBeLessThan(4);
    },
  );
});

describe('rasage : reconstruction automatique', () => {
  it('base détruite seule : le chantier repart au slot 0 (20 s ±2 pas), les autres bâtiments ne sont pas régénérés', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 1);
    const destroyedAt = rec.log.destroyed[0].tick;
    expect(rec.log.destroyed[0].b).toBe(TURRET);
    // Le chantier a redémarré : slot 0 non construit, progression = une addition de dt (pas de la destruction).
    expect(world.planets[ENEMY].buildings[TURRET].built).toBe(false);
    expect(world.planets[ENEMY].buildProgress).toBeCloseTo(FIXED_DT, 12);

    // Quelques balles encore en vol peuvent abîmer la lourde : on prend le relevé une fois le ciel vide.
    rec.run(120);
    const heavyHp = world.planets[ENEMY].buildings[HEAVY].hp;
    expect(heavyHp).toBeGreaterThan(0);
    expect(heavyHp).toBeLessThanOrEqual(BUILDINGS[HEAVY].hp);
    expect(world.planets[ENEMY].buildings[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp);

    rec.run(steps(TURRET) + 30);
    expect(rec.log.built).toHaveLength(1);
    expect(rec.log.built[0]).toMatchObject({ a: ENEMY, b: TURRET });
    expect(Math.abs(rec.log.built[0].tick - destroyedAt - steps(TURRET))).toBeLessThanOrEqual(TOL);
    expect(world.planets[ENEMY].buildings[TURRET]).toMatchObject({
      built: true,
      hp: BUILDINGS[TURRET].hp,
    });
    // Pas de régénération : la lourde garde exactement ses PV d'avant.
    expect(world.planets[ENEMY].buildings[HEAVY].hp).toBe(heavyHp);
  });

  it('planète rasée : BUILT dans l’ordre du catalogue 0, 1, 2, 3 avec 20 / 30 / 40 / 45 s (±2 pas chacun)', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    const razedAt = rec.log.destroyed[3].tick;
    rec.run(steps(TURRET) + steps(FACTORY) + steps(GENERATOR) + steps(HEAVY) + 30);

    expect(rec.log.built.map((e) => e.b)).toEqual([TURRET, FACTORY, GENERATOR, HEAVY]);
    const ticks = rec.log.built.map((e) => e.tick);
    expect(Math.abs(ticks[0] - razedAt - steps(TURRET))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(ticks[1] - ticks[0] - steps(FACTORY))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(ticks[2] - ticks[1] - steps(GENERATOR))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(ticks[3] - ticks[2] - steps(HEAVY))).toBeLessThanOrEqual(TOL);
    expect(world.planets[ENEMY].buildings.map((s, i) => s.hp === BUILDINGS[i].hp)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // Les capacités reviennent avec leur bâtiment, au pas même du BUILT.
    expect(rec.log.caps.map((c) => [c.hasMissiles, c.hasShield])).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [true, false],
      [true, true],
    ]);
    expect(rec.log.caps[3].tick).toBe(ticks[1]);
    expect(rec.log.caps[4].tick).toBe(ticks[2]);
  });

  it('une destruction pendant un chantier le remet à zéro (un raid soutenu gèle le développement)', () => {
    const world = makeWorld({ built: 1 }); // tourelle seule : le chantier en cours est l'usine
    const rec = createRecorder(world);
    world.planets[ENEMY].buildProgress = 25; // usine à 25 s sur 30
    fireUntilDestroyed(world, rec, 1);
    expect(rec.log.destroyed[0].b).toBe(TURRET);
    expect(rec.log.built).toHaveLength(0); // l'usine ne s'est pas achevée malgré les 5 s restantes
    expect(world.planets[ENEMY].buildProgress).toBeCloseTo(FIXED_DT, 12);
    // Il faut maintenant 20 s pour la tourelle, puis l'usine repart de zéro.
    rec.run(steps(TURRET) + 30);
    expect(rec.log.built.map((e) => e.b)).toEqual([TURRET]);
  });
});

describe('rasage : capture', () => {
  it('tant qu’une tourelle est construite, la capture est bloquée, même sans usine ni générateur', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    // La planète rasée rebâtit sa tourelle (20 s) ; usine, générateur et lourde ne sont pas encore revenus.
    rec.run(steps(TURRET) + TOL + 5);
    expect(rec.log.built.map((e) => e.b)).toEqual([TURRET]);
    expect(world.planets[ENEMY].buildings.map((s) => s.built)).toEqual([true, false, false, false]);
    landCapturer(world);
    for (let i = 0; i < 10 * 60; i++) {
      rec.step();
      expect(world.planets[ENEMY].captureTime).toBe(0);
    }
    expect(rec.log.captured).toHaveLength(0);
    expect(world.planets[ENEMY].owner).toBe(ENEMY);
  });

  it('détruire tourelles et lourde seulement (usine et générateur debout) débloque la capture : 3 s ±2 pas', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 2);
    expect(rec.log.destroyed.map((e) => e.b)).toEqual([TURRET, HEAVY]);
    rec.run(30); // laisse tomber les balles encore en vol
    expect(world.planets[ENEMY].buildings[FACTORY].built).toBe(true);
    expect(world.planets[ENEMY].buildings[GENERATOR].built).toBe(true);
    landCapturer(world);
    const landedAt = world.tick;
    while (rec.log.captured.length === 0) {
      rec.step();
      expect(world.tick).toBeLessThan(landedAt + CAPTURE_STEPS + 60);
    }
    expect(Math.abs(rec.log.captured[0].tick - landedAt - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
    expect(world.planets[ENEMY].owner).toBe(0);
  });

  it('planète rasée puis capteur posé 3 s : capturée, bâtiments à zéro, la faction perd tout', () => {
    const world = makeWorld();
    const rec = createRecorder(world);
    fireUntilDestroyed(world, rec, 4);
    landCapturer(world);
    const landedAt = world.tick;
    while (rec.log.captured.length === 0) {
      rec.step();
      expect(world.tick).toBeLessThan(landedAt + CAPTURE_STEPS + 60);
    }
    expect(Math.abs(rec.log.captured[0].tick - landedAt - CAPTURE_STEPS)).toBeLessThanOrEqual(TOL);
    expect(rec.log.captured[0]).toMatchObject({ a: ENEMY, b: 0, x: ENEMY_POS.x, y: ENEMY_POS.y });
    const planet = world.planets[ENEMY];
    expect(planet.owner).toBe(0);
    for (const slot of planet.buildings) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    expect(planet.buildProgress).toBe(0);
    expect(world.factions[ENEMY]).toMatchObject({
      planetCount: 0,
      hasMissiles: false,
      hasShield: false,
    });
    expect(world.factions[0].planetCount).toBe(2);
  });
});

describe('rasage : déterminisme', () => {
  const STEPS = 3000;

  /**
   * Partie scriptée : l'attaquant tient la gâchette 2 pas sur 3 (tirage dans world.rng) jusqu'au rasage complet,
   * puis le capteur se pose (capture, redéveloppement) ; le défenseur maintient la détente missile pendant tout
   * le scénario (il tire tant que la faction a une usine).
   */
  function run(seed) {
    const world = makeWorld({ seed, defender: true });
    const ship = world.ships[0];
    world.ships[1].missiles = 4;
    world.ships[1].intent.missile = true;
    const rec = createRecorder(world);
    let landed = false;
    for (let i = 0; i < STEPS; i++) {
      if (!landed && rec.log.destroyed.length === 4) {
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

  it('même seed : état et journal identiques sur 3000 pas ; le scénario traverse rasage, capture et construction', () => {
    const a = run(7);
    const b = run(7);
    expect(a.world.tick).toBe(STEPS);
    expect(a.rec.log.destroyed).toHaveLength(4);
    expect(a.rec.log.captured).toHaveLength(1);
    expect(a.rec.log.built.length).toBeGreaterThanOrEqual(1);
    expect(a.rec.log.launches.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.rec.log)).toBe(JSON.stringify(b.rec.log));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null
  });

  it('une autre seed donne un journal différent (rafales et dispersion des tourelles dépendent du rng)', () => {
    expect(JSON.stringify(run(7).rec.log)).not.toBe(JSON.stringify(run(8).rec.log));
  });
});
