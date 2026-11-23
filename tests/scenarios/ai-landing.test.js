import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Atterrissage et décollage des bots (ADR 0006 §4.4) en mode LAND : le bot (faction 1) se pose sur la planète
// `ai.target`, sans choc ni perte de PV, puis y reste. Mini-cartes : la faction 1 possède une petite planète de
// repli (sinon elle est « hors jeu » et ignorée par l'IA), la faction 0 (humaine) possède une planète de coin et
// son vaisseau reste immobile, posé dessus.
// Chaque scénario est rejoué sur les seeds 1 à 20 (départ et planète tirés dans un rng seedé) et asserté en
// taux : le pilote est bang-bang et la physique chaotique près d'une planète, on exige >= RATE_MIN (95 %) avec
// des assertions séparées (posé / sans dégât / reste posé) pour que l'échec soit lisible.
const BOT = 1;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_MIN = 0.95;
const OPTIONS = { eventCapacity: 64, bots: [BOT] };
const CONTACT = SHIP_COLLISION_RADIUS; // distance surface-vaisseau en dessous de laquelle il y a contact
const LAND_TIME = 15; // s, délai d'atterrissage depuis un départ libre (scénarios 1 et 2)
const HOLD_TIME = 10; // s, durée pendant laquelle on exige de rester posé
// Une planète ennemie construit sa première tourelle après 20 s (data/buildings.js) : le scénario 2 reste en
// dessous, atterrissage (15 s) + maintien (10 s) compris, la seule échéance étant celle du premier tick posé.
const MIN_RADIUS = 20;
const MAX_RADIUS = 90;
const MIN_GRAVITY = 40; // g0 de surface ; borne haute : PLANET_MAX_GRAVITY = 84 (décollage toujours possible)
const MAX_GRAVITY = 80;
const MIN_GAP = 100; // distance de départ à la surface de la cible
const MAX_GAP = 450;
const MAX_START_SPEED = 80;

const MAP_W = 2400;
const MAP_H = 1600;
const CENTER = { x: 1200, y: 800 }; // la cible : à >= 540 px de tout point de départ, loin des murs et des coins

const humanHome = { x: 2250, y: 1450, radius: 40, owner: 0 };
const botHome = { x: 150, y: 1450, radius: 40, owner: BOT };

/**
 * Monde mini-carte : `planets` doit contenir botHome et humanHome ; le bot démarre en `start`
 * (pos, vitesse, cap) ou posé sur `start.planet` ; `mode`/`target` posés directement (l'IA ne décide pas encore).
 */
function makeWorld(planets, seed, start, mode, target) {
  const botSpawn =
    start.planet !== undefined ? { planet: start.planet } : { x: start.x, y: start.y };
  const map = {
    width: MAP_W,
    height: MAP_H,
    planets,
    spawns: [{ planet: 0 }, botSpawn],
  };
  const world = createWorld(map, seed, OPTIONS);
  const ship = world.ships[BOT];
  if (start.planet === undefined) {
    ship.vel.x = start.vx ?? 0;
    ship.vel.y = start.vy ?? 0;
    ship.angle = start.angle ?? 0;
  }
  const ai = world.ai[0];
  ai.mode = mode;
  ai.target = target;
  return world;
}

/** Joue un pas et met à jour le relevé `out` (dégâts, NaN, mort, première pose, perte de pose, marge aux autres planètes). */
function tick(world, target, out, stepIndex) {
  const ship = world.ships[BOT];
  clearEvents(world.events);
  step(world, FIXED_DT);
  for (let e = 0; e < world.events.count; e++) {
    const { type, a } = world.events.items[e];
    // LANDED est le succès attendu : seuls choc, tir reçu et explosion du bot (a = vaisseau) sont des dégâts.
    if (a === BOT && (type === EVT.IMPACT || type === EVT.SHIP_HIT || type === EVT.EXPLOSION))
      out.harmful++;
  }
  const { x, y } = ship.pos;
  if (![x, y, ship.vel.x, ship.vel.y, ship.angle, ship.hp].every(Number.isFinite)) out.nan = true;
  if (!ship.alive) out.died = true;
  for (let i = 0; i < world.planets.length; i++) {
    if (i === target) continue;
    const p = world.planets[i];
    out.minGapOther = Math.min(out.minGapOther, Math.hypot(x - p.pos.x, y - p.pos.y) - p.radius);
  }
  if (out.landedAt < 0) {
    if (ship.landedOn === target) out.landedAt = (stepIndex + 1) * FIXED_DT;
  } else if (ship.landedOn !== target) {
    out.unlanded++; // a quitté la cible après s'y être posé
  }
}

const newRecord = () => ({
  landedAt: -1,
  harmful: 0,
  nan: false,
  died: false,
  minGapOther: Infinity,
  unlanded: 0,
});

/**
 * Joue au plus `limit` secondes ; dès que le bot s'est posé sur `target`, continue `hold` secondes de plus
 * (pour vérifier qu'il reste posé) puis s'arrête.
 */
function fly(world, target, limit, hold) {
  const out = newRecord();
  const maxSteps = Math.round(limit / FIXED_DT);
  const holdSteps = Math.round(hold / FIXED_DT);
  let landedStep = -1;
  for (let i = 0; i < maxSteps + holdSteps; i++) {
    if (landedStep < 0 && i >= maxSteps) break;
    if (landedStep >= 0 && i >= landedStep + holdSteps) break;
    tick(world, target, out, i);
    if (landedStep < 0 && out.landedAt >= 0) landedStep = i;
  }
  const ship = world.ships[BOT];
  return { ...out, hp: ship.hp, finalLanded: ship.landedOn === target };
}

const rate = (results, predicate) => results.filter(predicate).length / results.length;
const clean = (r) => r.harmful === 0 && !r.died && !r.nan && r.hp === SHIP_MAX_HP;
const landedClean = (r) => r.landedAt >= 0 && r.landedAt < LAND_TIME && clean(r);

/** Point à `gap` px de la surface de `p`, dans la direction `dir`. */
const around = (p, gap, dir) => ({
  x: p.x + Math.cos(dir) * (p.radius + gap),
  y: p.y + Math.sin(dir) * (p.radius + gap),
});

/** Départ aléatoire autour de la cible : distance 100..450 de la surface, vitesse 0..80 px/s toutes directions. */
function randomStart(rng, target) {
  const from = around(target, range(rng, MIN_GAP, MAX_GAP), range(rng, -Math.PI, Math.PI));
  const heading = range(rng, -Math.PI, Math.PI);
  const speed = range(rng, 0, MAX_START_SPEED);
  return {
    ...from,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    angle: range(rng, -Math.PI, Math.PI),
  };
}

/** Planète cible aléatoire (rayon 20..90, gravité de surface 40..80) au centre de la carte. */
function randomTarget(rng, owner) {
  const target = {
    ...CENTER,
    radius: range(rng, MIN_RADIUS, MAX_RADIUS),
    gravity: range(rng, MIN_GRAVITY, MAX_GRAVITY),
  };
  if (owner !== undefined) target.owner = owner;
  return target;
}

// Les cibles sont en index 2 : [humanHome, botHome, cible, ...].
const TARGET = 2;

/** Relevés : une exécution par seed ; `build(seed, rng)` retourne { world, target } et le résultat est annoté. */
function runSeeds(build, limit, hold) {
  return SEEDS.map((seed) => {
    const { world, target } = build(seed, createRng(seed));
    return { seed, ...fly(world, target, limit, hold) };
  });
}

const landOn = (owner) => (seed, rng) => {
  const planet = randomTarget(rng, owner);
  const start = randomStart(rng, planet);
  const world = makeWorld([humanHome, botHome, planet], seed, start, AI_MODE.LAND, TARGET);
  return { world, target: TARGET };
};

describe('IA : atterrissage sur une planète neutre', () => {
  const results = runSeeds(landOn(undefined), LAND_TIME, HOLD_TIME);

  it('se pose en moins de 15 s sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => r.landedAt >= 0 && r.landedAt < LAND_TIME)).toBeGreaterThanOrEqual(
      RATE_MIN,
    );
  });

  it('se pose sans choc ni perte de PV (aucun IMPACT, SHIP_HIT, EXPLOSION) sur au moins 95 % des seeds', () => {
    expect(rate(results, landedClean)).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('reste posé 10 s de plus sans jamais quitter la planète (landedOn stable)', () => {
    // Capture au bout de 3 s posé (CAPTURE_TIME) : la planète change de propriétaire mais le bot ne bouge pas.
    expect(
      rate(results, (r) => landedClean(r) && r.unlanded === 0 && r.finalLanded),
    ).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('ne touche aucune autre planète', () => {
    expect(rate(results, (r) => r.minGapOther > CONTACT)).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : atterrissage sur une planète ennemie sans défense', () => {
  // Planète de la faction 0 sans bâtiment : on s'arrête 10 s après la pose, avant la première tourelle (20 s).
  // Dans ce délai, l'atterrissage doit être aussi propre que sur une planète neutre.
  const results = runSeeds(landOn(0), LAND_TIME, HOLD_TIME);

  it('se pose en moins de 15 s, sans dégât ni tir reçu, sur au moins 95 % des seeds', () => {
    expect(rate(results, landedClean)).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('reste posé sur la planète une fois atterri', () => {
    expect(
      rate(results, (r) => landedClean(r) && r.unlanded === 0 && r.finalLanded),
    ).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : atterrissage derrière une autre planète', () => {
  // Une planète neutre r = 70 est pile sur la droite départ -> cible ; la cible est à 600 px d'elle, de l'autre
  // côté. Le départ (x = 400) est hors de la portée de gravité du bloqueur (900 - 5 × 70 = 550). Le décalage
  // latéral (±25 px << rayon gonflé) envoie le contournement des deux côtés selon la seed.
  const BLOCKER = { x: 900, y: 800, radius: 70 };
  const GOAL_PLANET = { x: 1500, y: 800, radius: 50 };
  const BLOCKED_LIMIT = 40; // s : contournement (≈ 2 × 300 px) puis atterrissage

  const results = runSeeds(
    (seed, rng) => {
      const start = {
        x: 400,
        y: 800 + range(rng, -25, 25),
        angle: range(rng, -Math.PI, Math.PI),
      };
      const world = makeWorld(
        [humanHome, botHome, GOAL_PLANET, BLOCKER],
        seed,
        start,
        AI_MODE.LAND,
        TARGET,
      );
      return { world, target: TARGET };
    },
    BLOCKED_LIMIT,
    0,
  );

  it('se pose sur la cible sans dégât sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => r.landedAt >= 0 && clean(r))).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('ne touche jamais la planète qui bloque', () => {
    expect(rate(results, (r) => r.minGapOther > CONTACT)).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : décollage puis atterrissage ailleurs', () => {
  // Le bot démarre posé sur sa planète A (index 1 = botHome, rayon et gravité tirés), décolle et rejoint un point
  // lointain (GOTO, ~800 px) sans dégât ; puis on lui donne LAND sur une planète neutre B à 700 px de là.
  const GOAL = { x: 1100, y: 500 };
  const B = { x: 1800, y: 800, radius: 50 };
  const GOTO_LIMIT = 25; // s
  const LAND_LIMIT = 40; // s

  const homeFor = (rng) => ({
    x: 250,
    y: 1000,
    radius: range(rng, 25, 70),
    gravity: range(rng, MIN_GRAVITY, MAX_GRAVITY),
    owner: BOT,
  });

  const results = SEEDS.map((seed) => {
    const rng = createRng(seed);
    const home = homeFor(rng);
    // Planètes : [humanHome, home(A), B] : A = index 1, B = index 2.
    const world = makeWorld([humanHome, home, B], seed, { planet: 1 }, AI_MODE.GOTO, -1);
    const ai = world.ai[0];
    ai.goalX = GOAL.x;
    ai.goalY = GOAL.y;
    const out = newRecord();
    let arrivedAt = -1;
    const ship = world.ships[BOT];
    const gotoSteps = Math.round(GOTO_LIMIT / FIXED_DT);
    for (let i = 0; i < gotoSteps; i++) {
      tick(world, -1, out, i);
      if (
        arrivedAt < 0 &&
        Math.hypot(ship.pos.x - GOAL.x, ship.pos.y - GOAL.y) < 20 &&
        Math.hypot(ship.vel.x, ship.vel.y) < 15 // valeur de la spec : 15 px/s
      ) {
        arrivedAt = (i + 1) * FIXED_DT;
        break;
      }
    }
    const gotoHarmful = out.harmful;
    // Phase 2 : atterrissage sur B.
    ai.mode = AI_MODE.LAND;
    ai.target = 2;
    const land = fly(world, 2, LAND_LIMIT, 0);
    return { seed, arrivedAt, gotoHarmful, gotoNan: out.nan, gotoDied: out.died, land };
  });

  it('décolle et rejoint le but lointain en moins de 25 s, sans dégât, sur au moins 95 % des seeds', () => {
    expect(
      rate(results, (r) => r.arrivedAt >= 0 && r.gotoHarmful === 0 && !r.gotoDied && !r.gotoNan),
    ).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('se pose ensuite sur la deuxième planète sans dégât sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => r.land.landedAt >= 0 && clean(r.land))).toBeGreaterThanOrEqual(
      RATE_MIN,
    );
  });
});

describe('IA : décollage direct vers une autre planète en mode LAND', () => {
  // Posé sur A, mode LAND dont la cible est B : takeoff() prend la main (A n'est pas la cible), puis l'approche.
  const A = { x: 400, y: 800, radius: 40, owner: BOT };
  const B = { x: 1100, y: 800, radius: 60 }; // 700 px de A, gravité par défaut
  const LAND_LIMIT = 40;

  const results = runSeeds(
    (seed, rng) => {
      const home = {
        ...A,
        radius: range(rng, 25, 70),
        gravity: range(rng, MIN_GRAVITY, MAX_GRAVITY),
      };
      const world = makeWorld([humanHome, home, B], seed, { planet: 1 }, AI_MODE.LAND, 2);
      return { world, target: 2 };
    },
    LAND_LIMIT,
    0,
  );

  it('quitte A sans dégât et se pose sur B sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => r.landedAt >= 0 && clean(r))).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : 0 NaN', () => {
  it('aucune valeur non finie dans tous les scénarios d atterrissage', () => {
    const batches = [
      runSeeds(landOn(undefined), LAND_TIME, HOLD_TIME),
      runSeeds(landOn(0), LAND_TIME, HOLD_TIME),
    ];
    for (const results of batches) expect(results.filter((r) => r.nan)).toEqual([]);
  });
});

describe('IA : déterminisme de l atterrissage', () => {
  // Script à pas fixe : GOTO (décollage, vol) pendant 600 pas, puis LAND sur une planète neutre. 1800 pas au total :
  // le bot s'est posé et capture la planète avant la fin, ce qui exerce takeoff, flyTo, descente et pose.
  const STEPS = 1800;
  const SWITCH_AT = 600;
  const PLANETS = [
    humanHome,
    { x: 250, y: 1000, radius: 40, owner: BOT },
    { x: 1800, y: 800, radius: 50 },
  ];

  function replay(seed) {
    const world = makeWorld(PLANETS, seed, { planet: 1 }, AI_MODE.GOTO, -1);
    world.ai[0].goalX = 1100;
    world.ai[0].goalY = 500;
    for (let i = 0; i < STEPS; i++) {
      if (i === SWITCH_AT) {
        world.ai[0].mode = AI_MODE.LAND;
        world.ai[0].target = 2;
      }
      step(world, FIXED_DT);
    }
    return world;
  }

  it('deux exécutions de même seed donnent un monde identique après 1800 pas', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = replay(seed);
      expect(JSON.stringify(world)).toBe(JSON.stringify(replay(seed)));
      // Garde-fou : le scénario n'est pas trivial, le bot a bougé puis s'est posé sur la cible.
      expect(world.ships[BOT].landedOn).toBe(2);
      expect(world.tick).toBe(STEPS);
    }
  });

  it('le monde reste JSON pur (aller-retour sans perte)', () => {
    const json = JSON.stringify(replay(1));
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
  });
});
