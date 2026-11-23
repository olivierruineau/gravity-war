import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  MISSILE_REARM_TIME,
  MISSILE_STOCK_MAX,
  MISSILE_STOCK_MIN,
  RESPAWN_DELAY,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { OUTCOME } from '../../src/core/faction.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Fins de partie scriptées sur une mini-carte 4000×4000 : trois bases à 1000 px les unes des autres
// (r = 60, g0 = 70, portée de gravité 300 px : aucune interaction entre elles), une planète neutre
// isolée dans un coin. Le vaisseau 0 (faction 0) ou 1 atterrit réellement sur sa cible (40 px/s
// radial, nez sur la normale, comme dans capture.test.js) ; la faction 2 n'a jamais de vaisseau.
//
// Tolérances en pas : la capture a lieu au 180e pas posé, mais 180 additions de 1/60 peuvent valoir
// 3 − ε (181 pas) ; chaque test relatif au temps tolère donc ±1 pas par échéance. Les tests d'égalité
// de pas (ELIMINATED au pas de la capture) sont eux EXACTS : ce sont deux règles du même `step`.
const SIZE = 4000;
const RADIUS = 60;
const CONTACT = RADIUS + SHIP_COLLISION_RADIUS;
const UP = -Math.PI / 2;
const KILL_TICK = 60; // le vaisseau victime meurt 1 s après le début de l'atterrissage
const RESPAWN_STEPS = Math.round(RESPAWN_DELAY / FIXED_DT); // 180

const P0 = { x: 500, y: 2000, radius: RADIUS, gravity: 70, owner: 0 };
const P1 = { x: 1500, y: 2000, radius: RADIUS, gravity: 70, owner: 1 };
const P2 = { x: 2500, y: 2000, radius: RADIUS, gravity: 70, owner: 2 };
const P3 = { x: 3500, y: 3300, radius: RADIUS, gravity: 70 }; // neutre
const FAR = { x: 3500, y: 500 }; // vol libre, hors de portée de toute planète (≥ 1800 px)

function makeWorld({ planets, spawns, seed = 1 }) {
  return createWorld({ width: SIZE, height: SIZE, planets, spawns }, seed, { eventCapacity: 128 });
}

/** Téléporte le vaisseau `i` à 2 px au-dessus du contact de la planète, 40 px/s vers le centre. */
function launchOnto(world, i, planetIndex) {
  const p = world.planets[planetIndex];
  const ship = world.ships[i];
  ship.pos.x = p.pos.x;
  ship.pos.y = p.pos.y - (CONTACT + 2);
  ship.vel.x = 0;
  ship.vel.y = 40;
  ship.angle = UP;
  ship.landedOn = -1;
}

/** Journal de tous les événements, étiquetés par numéro de pas (1-indexé). */
function createRecorder(world) {
  const log = [];
  return {
    log,
    of: (type) => log.filter((e) => e.type === type),
    step() {
      clearEvents(world.events);
      step(world, FIXED_DT);
      for (let k = 0; k < world.events.count; k++) {
        log.push({ ...world.events.items[k], tick: world.tick });
      }
    },
    run(n) {
      for (let i = 0; i < n; i++) this.step();
    },
    runUntil(type, count = 1, maxSteps = 1000) {
      let guard = 0;
      while (this.of(type).length < count) {
        this.step();
        if (++guard > maxSteps) throw new Error(`événement ${type} jamais atteint`);
      }
    },
  };
}

function allFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === 'object') return Object.values(value).every(allFinite);
  return true;
}

/**
 * Le vaisseau `lander` atterrit sur la planète `target` ; le vaisseau `victim` (en vol libre, loin de
 * tout) est tué à KILL_TICK : il attend donc son respawn quand la capture aboutit.
 * Renvoie le monde et son journal juste après le pas de la capture.
 */
function playCapture({ planets, lander, victim, target }) {
  const spawns = [];
  spawns[lander] = lander === 0 ? { planet: 0 } : { planet: 1 };
  spawns[victim] = FAR;
  const world = makeWorld({ planets, spawns });
  const rec = createRecorder(world);
  launchOnto(world, lander, target);
  rec.run(KILL_TICK);
  expect(world.ships[victim].alive).toBe(true);
  expect(world.ships[lander].landedOn).toBe(target);
  damageShip(world, victim, SHIP_MAX_HP, FAR.x, FAR.y);
  rec.runUntil(EVT.CAPTURED);
  return { world, rec };
}

describe('élimination par capture de la dernière planète (les 3 factions en jeu)', () => {
  const planets = [P0, P1, P2];

  it('ELIMINATED (a = 1) est émis au pas exact de CAPTURED, avec le vaisseau encore en attente de respawn', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    const captured = rec.of(EVT.CAPTURED);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ a: 1, b: 0 });
    const eliminated = rec.of(EVT.ELIMINATED);
    expect(eliminated).toHaveLength(1);
    expect(eliminated[0]).toMatchObject({ a: 1, tick: captured[0].tick });
    expect(world.factions[1]).toMatchObject({ planetCount: 0, eliminated: true });
    // Le respawn n'a pas eu lieu : il restait du temps sur le décompte au pas de la capture.
    // Le décompte perd dt par pas depuis la mort : 1e-9 couvre l'arrondi cumulé de ≤ 200 soustractions.
    const ship = world.ships[1];
    expect(ship.alive).toBe(false);
    expect(ship.respawnTimer).toBeCloseTo(
      RESPAWN_DELAY - (captured[0].tick - KILL_TICK) * FIXED_DT,
      9,
    );
    expect(ship.respawnTimer).toBeGreaterThan(0);
    // La capture a pris ≈ 3 s depuis l'atterrissage (quelques pas) : ni trop tôt, ni trop tard.
    expect(captured[0].tick).toBeGreaterThan(180);
    expect(captured[0].tick).toBeLessThan(180 + 20);
  });

  it('aucune élimination ni capture avant : la faction 1 n’est pas éliminée tant qu’elle possède sa base', () => {
    const { rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    const t = rec.of(EVT.CAPTURED)[0].tick;
    expect(rec.log.filter((e) => e.type === EVT.ELIMINATED && e.tick < t)).toHaveLength(0);
  });

  it('la faction 2 reste en jeu : ni GAME_OVER ni issue, la partie continue', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    expect(rec.of(EVT.GAME_OVER)).toHaveLength(0);
    expect(world.outcome).toBe(OUTCOME.PLAYING);
    expect(world.factions[0].eliminated).toBe(false);
    expect(world.factions[2].eliminated).toBe(false);
  });

  it('son vaisseau ne réapparaît jamais (600 pas, bien au-delà du délai de respawn)', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    rec.run(600);
    expect(RESPAWN_STEPS).toBeLessThan(600); // le délai est largement écoulé
    const ship = world.ships[1];
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0);
    expect(ship.respawnTimer).toBe(0); // décompte écoulé, aucune planète où réapparaître
    expect(rec.of(EVT.RESPAWN)).toHaveLength(0);
    expect(rec.of(EVT.ELIMINATED)).toHaveLength(1);
    expect(world.factions[1].eliminated).toBe(true);
    expect(allFinite(world)).toBe(true);
  });

  it('capturer ensuite la base de la faction 2 (sans vaisseau) : ELIMINATED a = 2 et VICTORY au même pas', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    expect(rec.of(EVT.GAME_OVER)).toHaveLength(0);
    launchOnto(world, 0, 2);
    rec.runUntil(EVT.CAPTURED, 2);
    const second = rec.of(EVT.CAPTURED)[1];
    expect(second).toMatchObject({ a: 2, b: 0 });
    const eliminated = rec.of(EVT.ELIMINATED);
    expect(eliminated.map((e) => e.a)).toEqual([1, 2]);
    expect(eliminated[1].tick).toBe(second.tick);
    const gameOver = rec.of(EVT.GAME_OVER);
    expect(gameOver).toHaveLength(1);
    expect(gameOver[0]).toMatchObject({ a: OUTCOME.VICTORY, tick: second.tick });
    expect(world.outcome).toBe(OUTCOME.VICTORY);
    // Dans la file du pas, ELIMINATED précède GAME_OVER.
    const idx = (type) => rec.log.findIndex((e) => e.type === type && e.tick === second.tick);
    expect(idx(EVT.ELIMINATED)).toBeLessThan(idx(EVT.GAME_OVER));
  });
});

describe('victoire : la faction 1 est la dernière rivale (faction 2 hors jeu)', () => {
  // Base 2 absente de la carte : la faction 2 est hors jeu dès le départ.
  const planets = [P0, P1];

  it('VICTORY + GAME_OVER (a = VICTORY) au pas de la capture, une seule fois', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    const t = rec.of(EVT.CAPTURED)[0].tick;
    expect(world.inGame).toEqual([true, true, false]);
    expect(rec.of(EVT.ELIMINATED).map((e) => ({ a: e.a, tick: e.tick }))).toEqual([
      { a: 1, tick: t },
    ]);
    expect(rec.of(EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.VICTORY, tick: t }]);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });

  it('la simulation continue après GAME_OVER : 600 pas finis, issue figée, aucun 2e événement de fin', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    const tickAtEnd = world.tick;
    rec.run(600);
    expect(world.tick).toBe(tickAtEnd + 600);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
    expect(rec.of(EVT.GAME_OVER)).toHaveLength(1);
    expect(rec.of(EVT.ELIMINATED)).toHaveLength(1);
    expect(allFinite(world)).toBe(true);
    expect(world.ships[0]).toMatchObject({ alive: true, landedOn: 1 });
    expect(world.planets[1].owner).toBe(0);
  });

  it('le vainqueur peut encore décoller et voler après GAME_OVER', () => {
    const { world, rec } = playCapture({ planets, lander: 0, victim: 1, target: 1 });
    const ship = world.ships[0];
    const planet = world.planets[1];
    ship.intent.thrust = true; // 140 px/s² de poussée contre g0 = 70 : décollage soutenu
    rec.run(240);
    ship.intent.thrust = false;
    expect(ship.landedOn).toBe(-1);
    const altitude = Math.hypot(ship.pos.x - planet.pos.x, ship.pos.y - planet.pos.y) - RADIUS;
    expect(altitude).toBeGreaterThan(100); // en 4 s de poussée nette, il s'est nettement éloigné
    expect(world.outcome).toBe(OUTCOME.VICTORY);
    expect(allFinite(world)).toBe(true);
  });
});

describe('défaite : la faction 0 perd sa seule base', () => {
  // La faction 2 est en jeu (base, sans vaisseau) : la défaite ne dépend pas de l'état des rivales.
  const planets = [P0, P1, P2];

  it('capture de la base 0 par la faction 1 : ELIMINATED a = 0 puis GAME_OVER (DEFEAT) au même pas, une seule fois', () => {
    const { world, rec } = playCapture({ planets, lander: 1, victim: 0, target: 0 });
    const captured = rec.of(EVT.CAPTURED);
    expect(captured).toMatchObject([{ a: 0, b: 1 }]);
    const t = captured[0].tick;
    expect(rec.of(EVT.ELIMINATED).map((e) => ({ a: e.a, tick: e.tick }))).toEqual([
      { a: 0, tick: t },
    ]);
    expect(rec.of(EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.DEFEAT, tick: t }]);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);
    expect(world.ships[0].alive).toBe(false); // il attendait son respawn
    const idx = (type) => rec.log.findIndex((e) => e.type === type && e.tick === t);
    expect(idx(EVT.ELIMINATED)).toBeLessThan(idx(EVT.GAME_OVER));
  });

  it('le vaisseau 0 ne réapparaît jamais ; l’issue reste DEFEAT et la simulation reste finie (600 pas)', () => {
    const { world, rec } = playCapture({ planets, lander: 1, victim: 0, target: 0 });
    rec.run(600);
    expect(world.ships[0].alive).toBe(false);
    expect(rec.of(EVT.RESPAWN)).toHaveLength(0);
    expect(rec.of(EVT.GAME_OVER)).toHaveLength(1);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);
    // Les rivales ne sont pas éliminées pour autant : la défaite ne se transforme pas en victoire.
    expect(world.factions[1].eliminated).toBe(false);
    expect(world.factions[2].eliminated).toBe(false);
    expect(allFinite(world)).toBe(true);
  });
});

describe('vaisseau vivant sans planète', () => {
  it('perd sa base puis recapture une neutre : reste en jeu, aucun ELIMINATED ni GAME_OVER', () => {
    // Le vaisseau 1 vole librement pendant que la faction 0 lui prend sa base : il reste vivant.
    const world = makeWorld({ planets: [P0, P1, P2, P3], spawns: [{ planet: 0 }, FAR] });
    const rec = createRecorder(world);
    launchOnto(world, 0, 1);
    rec.runUntil(EVT.CAPTURED);
    expect(rec.of(EVT.CAPTURED)[0]).toMatchObject({ a: 1, b: 0 });
    expect(world.factions[1]).toMatchObject({ planetCount: 0, eliminated: false });
    expect(world.ships[1].alive).toBe(true);

    rec.run(RESPAWN_STEPS); // 3 s de plus sans planète : toujours en jeu
    expect(world.factions[1].eliminated).toBe(false);

    launchOnto(world, 1, 3); // il rejoint la neutre isolée et s'y pose
    rec.runUntil(EVT.CAPTURED, 2);
    expect(rec.of(EVT.CAPTURED)[1]).toMatchObject({ a: 3, b: 1 });
    expect(world.planets[3].owner).toBe(1);
    expect(world.factions[1]).toMatchObject({ planetCount: 1, eliminated: false });
    expect(rec.of(EVT.ELIMINATED)).toHaveLength(0);
    expect(rec.of(EVT.GAME_OVER)).toHaveLength(0);
    expect(world.outcome).toBe(OUTCOME.PLAYING);

    rec.run(600);
    expect(world.factions[1].eliminated).toBe(false);
    expect(rec.of(EVT.ELIMINATED)).toHaveLength(0);
  });
});

describe('réarmement de bout en bout : posé sur sa base dotée d’une usine', () => {
  // Base 0 : tourelle + usine (built: 2). Le vaisseau 0 démarre posé dessus avec MISSILE_STOCK_MIN missile.
  // Chaque cycle repart de rearmTime = 0 : son erreur d'arrondi (120 pas ou 121) ne s'accumule pas.
  const CYCLE = Math.round(MISSILE_REARM_TIME / FIXED_DT); // 120
  const planets = [{ ...P0, built: 2 }, P1, P2];

  function makeBaseWorld() {
    return makeWorld({ planets, spawns: [{ planet: 0 }] });
  }

  it('stock 1 → 4 en 3 × 2 s (±1 pas par cycle) avec 3 REARM (a = vaisseau, b = 2, 3, 4)', () => {
    const world = makeBaseWorld();
    const ship = world.ships[0];
    const rec = createRecorder(world);
    expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
    rec.run(3 * CYCLE + 3);
    const rearms = rec.of(EVT.REARM);
    expect(rearms.map((e) => e.b)).toEqual([2, 3, 4]);
    for (const e of rearms) expect(e).toMatchObject({ a: 0, x: ship.pos.x, y: ship.pos.y });
    const ticks = [0, ...rearms.map((e) => e.tick)];
    for (let k = 1; k < ticks.length; k++) {
      expect(Math.abs(ticks[k] - ticks[k - 1] - CYCLE)).toBeLessThanOrEqual(1);
    }
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX);
    expect(ship.landedOn).toBe(0);
  });

  it('plafonné : plus aucun REARM pendant 600 pas supplémentaires, stock à MISSILE_STOCK_MAX', () => {
    const world = makeBaseWorld();
    const rec = createRecorder(world);
    rec.run(3 * CYCLE + 3 + 600);
    expect(rec.of(EVT.REARM)).toHaveLength(MISSILE_STOCK_MAX - MISSILE_STOCK_MIN);
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MAX);
    expect(world.ships[0].rearmTime).toBe(0);
  });

  it('un missile tiré au plafond est rechargé 2 s plus tard (±1 pas)', () => {
    const world = makeBaseWorld();
    const ship = world.ships[0];
    const rec = createRecorder(world);
    rec.run(3 * CYCLE + 3);
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX);
    ship.intent.missile = true;
    rec.step();
    ship.intent.missile = false;
    const launches = rec.of(EVT.MISSILE_LAUNCH);
    expect(launches).toHaveLength(1);
    // Le tir (pas courant) précède `updateRearm` : le stock est à MAX − 1 dès la fin de ce pas.
    expect(ship.missiles).toBe(MISSILE_STOCK_MAX - 1);
    const before = rec.of(EVT.REARM).length;
    rec.run(CYCLE + 2);
    const rearms = rec.of(EVT.REARM);
    expect(rearms).toHaveLength(before + 1);
    expect(rearms[rearms.length - 1].b).toBe(MISSILE_STOCK_MAX);
    // Tiré au pas L, la progression repart de 0 au pas L + 1 (stock < MAX) : arrivée à L + CYCLE (±1).
    expect(Math.abs(rearms[rearms.length - 1].tick - launches[0].tick - CYCLE)).toBeLessThanOrEqual(
      2,
    );
  });

  it('sans usine (tourelle seule), aucun réarmement en 600 pas', () => {
    const world = makeWorld({ planets: [{ ...P0, built: 1 }, P1, P2], spawns: [{ planet: 0 }] });
    const rec = createRecorder(world);
    rec.run(600);
    expect(rec.of(EVT.REARM)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MIN);
  });
});

describe('déterminisme : parties chaotiques sur 3000 pas', () => {
  const STEPS = 3000;
  // Carte resserrée : ships et planètes interagissent (atterrissages, tirs, impacts, morts, respawns).
  const CHAOS_PLANETS = [
    { x: 700, y: 2000, radius: RADIUS, gravity: 70, owner: 0, built: 2 },
    { x: 1500, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built: 2 },
    { x: 2300, y: 2000, radius: RADIUS, gravity: 70, owner: 2 },
    { x: 1500, y: 1200, radius: RADIUS, gravity: 70 },
  ];

  /** Pilotes aléatoires pris dans world.rng : même seed, mêmes intentions, pas après pas. */
  function drive(world) {
    for (const ship of world.ships) {
      if (!ship.alive) continue;
      ship.intent.rotate = int(world.rng, -1, 2);
      ship.intent.thrust = int(world.rng, 0, 3) === 0;
      ship.intent.fire = int(world.rng, 0, 12) === 0;
      ship.intent.missile = int(world.rng, 0, 40) === 0;
    }
  }

  function play(seed) {
    const world = makeWorld({
      planets: CHAOS_PLANETS,
      spawns: [{ planet: 0 }, { planet: 1 }],
      seed,
    });
    const rec = createRecorder(world);
    let prevOutcome = world.outcome;
    const wasEliminated = world.factions.map((f) => f.eliminated);
    for (let i = 0; i < STEPS; i++) {
      drive(world);
      rec.step();
      // Invariants vérifiés à chaque pas.
      for (const ship of world.ships) {
        expect(ship.missiles).toBeGreaterThanOrEqual(0);
        expect(ship.missiles).toBeLessThanOrEqual(MISSILE_STOCK_MAX);
      }
      world.factions.forEach((f, k) => {
        if (wasEliminated[k]) expect(f.eliminated).toBe(true); // l'élimination est définitive
        wasEliminated[k] = f.eliminated;
      });
      if (prevOutcome !== OUTCOME.PLAYING) expect(world.outcome).toBe(prevOutcome); // issue figée
      prevOutcome = world.outcome;
    }
    return { world, rec };
  }

  it('même seed : état final et journal d’événements identiques à l’octet près, tout fini', () => {
    const a = play(7);
    const b = play(7);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.rec.log)).toBe(JSON.stringify(b.rec.log));
    expect(allFinite(a.world)).toBe(true);
    // Le scénario brasse bien de l'action (sinon l'égalité ne prouverait rien).
    expect(a.rec.of(EVT.SHOT).length).toBeGreaterThan(0);
  });

  it('au plus un GAME_OVER et un ELIMINATED par faction ; l’issue ne change qu’une fois', () => {
    const { world, rec } = play(7);
    expect(rec.of(EVT.GAME_OVER).length).toBeLessThanOrEqual(1);
    const byFaction = rec.of(EVT.ELIMINATED).map((e) => e.a);
    expect(new Set(byFaction).size).toBe(byFaction.length);
    // Cohérence événement ↔ état.
    expect(rec.of(EVT.GAME_OVER).length === 1).toBe(world.outcome !== OUTCOME.PLAYING);
    world.factions.forEach((f, k) => {
      if (world.inGame[k]) expect(byFaction.includes(k)).toBe(f.eliminated);
    });
  });

  it('une autre seed donne une partie différente (le script dépend bien du rng)', () => {
    expect(JSON.stringify(play(7).rec.log)).not.toBe(JSON.stringify(play(8).rec.log));
  });
});
