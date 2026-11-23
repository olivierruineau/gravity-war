import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Navigation des bots (ADR 0006 §4.2 et §4.3) en mode GOTO : le bot (faction 1) rejoint un point (goalX, goalY)
// et s'y arrête, sans dégât. Mini-cartes : la faction 1 possède une petite planète de repli (sinon elle est
// « hors jeu » et ignorée par l'IA), la faction 0 (humaine) est posée sur sa planète et ne bouge pas.
// Chaque scénario est rejoué sur les seeds 1 à 20 (le départ est tiré dans un rng seedé) et asserté en taux :
// le pilote est bang-bang et la physique chaotique près d'une planète, on ne garantit pas 100 % mais on
// exige >= RATE_MIN, avec une assertion « sans dégât » séparée pour que l'échec soit lisible.
const BOT = 1;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_MIN = 0.95;
const OPTIONS = { eventCapacity: 64, bots: [BOT] };
const CONTACT = SHIP_COLLISION_RADIUS; // distance surface-vaisseau en dessous de laquelle il y a contact

// Arrivée = à moins de ARRIVE_RADIUS du but avec |v| < ARRIVE_SPEED (valeur de la spec : 15 px/s). Le but est
// borné à la carte par le pilote : tous les buts de test sont à plus de wallMargin (60 px) des murs.
const ARRIVE_RADIUS = 20;
const ARRIVE_SPEED = 15;
const ARRIVE_TIME = 15; // s

const speedOf = (ship) => Math.hypot(ship.vel.x, ship.vel.y);

/** Monde avec un bot GOTO placé en `start` (pos, vitesse, cap) visant `goal`. */
function makeWorld(map, seed, start, goal) {
  const world = createWorld(map, seed, OPTIONS);
  const ship = world.ships[BOT];
  ship.pos.x = start.x;
  ship.pos.y = start.y;
  ship.vel.x = start.vx ?? 0;
  ship.vel.y = start.vy ?? 0;
  ship.angle = start.angle ?? 0;
  const ai = world.ai[0];
  ai.mode = AI_MODE.GOTO;
  ai.goalX = goal.x;
  ai.goalY = goal.y;
  return world;
}

/**
 * Joue `seconds` de simulation et relève : instant de première arrivée (−1 si jamais), nombre d'événements
 * dommageables (IMPACT, SHIP_HIT, EXPLOSION, LANDED), présence de NaN, mort, distance minimale à une surface.
 */
function fly(world, goal, seconds) {
  const ship = world.ships[BOT];
  const steps = Math.round(seconds / FIXED_DT);
  const out = { arrivedAt: -1, harmful: 0, nan: false, died: false, minGap: Infinity };
  for (let i = 0; i < steps; i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    for (let e = 0; e < world.events.count; e++) {
      const type = world.events.items[e].type;
      if (
        type === EVT.IMPACT ||
        type === EVT.SHIP_HIT ||
        type === EVT.EXPLOSION ||
        type === EVT.LANDED
      )
        out.harmful++;
    }
    const { x, y } = ship.pos;
    if (![x, y, ship.vel.x, ship.vel.y, ship.angle, ship.hp].every(Number.isFinite)) out.nan = true;
    if (!ship.alive) out.died = true;
    for (const p of world.planets)
      out.minGap = Math.min(out.minGap, Math.hypot(x - p.pos.x, y - p.pos.y) - p.radius);
    if (
      out.arrivedAt < 0 &&
      Math.hypot(x - goal.x, y - goal.y) < ARRIVE_RADIUS &&
      speedOf(ship) < ARRIVE_SPEED
    )
      out.arrivedAt = (i + 1) * FIXED_DT;
  }
  return out;
}

/** Rejoue le scénario sur toutes les seeds ; `build(seed, rng)` retourne { world, goal }. */
function runSeeds(build, seconds) {
  return SEEDS.map((seed) => {
    const { world, goal } = build(seed, createRng(seed));
    const result = fly(world, goal, seconds);
    const ship = world.ships[BOT];
    return {
      ...result,
      seed,
      hp: ship.hp,
      dist: Math.hypot(ship.pos.x - goal.x, ship.pos.y - goal.y),
      speed: speedOf(ship),
    };
  });
}

const rate = (results, predicate) => results.filter(predicate).length / results.length;
const clean = (r) => r.harmful === 0 && !r.died && !r.nan && r.hp === SHIP_MAX_HP;

// Planète de repli du bot et planète humaine, loin de toute trajectoire testée (coins de carte).
const botHome = (x, y) => ({ x, y, radius: 40, owner: BOT });
const humanHome = (x, y, built = 0) => ({ x, y, radius: 40, owner: 0, built });

describe('IA : vol libre vers un point (GOTO)', () => {
  const MAP = {
    width: 2000,
    height: 1000,
    planets: [humanHome(1800, 900), botHome(150, 900)],
    spawns: [{ planet: 0 }, { x: 200, y: 500 }],
  };
  const GOAL = { x: 1000, y: 500 }; // 800 px du départ

  const results = runSeeds((seed, rng) => {
    const start = {
      x: 200 + range(rng, -20, 20),
      y: 500 + range(rng, -20, 20),
      angle: range(rng, -Math.PI, Math.PI),
    };
    return { world: makeWorld(MAP, seed, start, GOAL), goal: GOAL };
  }, ARRIVE_TIME);

  it('arrive en moins de 15 s, à l arrêt (|v| < 15), sur au moins 95 % des seeds', () => {
    // arrivedAt est le premier instant avec dist < 20 et |v| < 15 : ≤ 15 s inclut donc les deux critères.
    expect(
      rate(results, (r) => r.arrivedAt >= 0 && r.arrivedAt < ARRIVE_TIME),
    ).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('finit posé sur le but sans avoir pris de dégât', () => {
    expect(rate(results, clean)).toBeGreaterThanOrEqual(RATE_MIN);
    // Le point est stationnaire (gravité compensée) : la précision de fin de vol est de quelques px.
    expect(
      rate(results, (r) => r.dist < ARRIVE_RADIUS && r.speed < ARRIVE_SPEED),
    ).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : contournement d une planète sur le chemin', () => {
  // Planète neutre r = 80 pile sur le segment départ -> but (1300 px), gravité de surface par défaut.
  const MAP = {
    width: 1600,
    height: 1000,
    planets: [{ x: 800, y: 500, radius: 80 }, humanHome(1500, 900), botHome(100, 900)],
    spawns: [{ planet: 1 }, { x: 150, y: 500 }],
  };
  const GOAL = { x: 1450, y: 500 };

  const results = runSeeds((seed, rng) => {
    // Décalage latéral : le chemin reste coupé par la planète (|dy| << rayon gonflé), des deux côtés.
    const dy = range(rng, -25, 25);
    const start = { x: 150, y: 500 + dy, angle: range(rng, -Math.PI, Math.PI) };
    return { world: makeWorld(MAP, seed, start, GOAL), goal: GOAL };
  }, 30);

  it('arrive au but sans dégât ni contact sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => clean(r) && r.arrivedAt >= 0)).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('ne frôle jamais la surface : garde une marge au-dessus du contact', () => {
    // Le réflexe anti-crash et le contournement visent au moins CONTACT + clearance ; on exige seulement
    // de ne jamais toucher (CONTACT = rayon de collision du vaisseau).
    expect(rate(results, (r) => r.minGap > CONTACT)).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : contournement de deux planètes et d une planète ennemie défendue', () => {
  // Trois obstacles alignés sur y = 700 entre le départ et le but. La planète ennemie (faction 0) porte une
  // tourelle (portée 150 px depuis la surface) : le bot doit la contourner hors de portée, sans être touché.
  const MAP = {
    width: 2400,
    height: 1500,
    planets: [
      { x: 650, y: 720, radius: 70 },
      { x: 1150, y: 660, radius: 80 },
      humanHome(1700, 700, 1), // owner 0, built = 1 : tourelle construite
      botHome(150, 1400),
    ],
    spawns: [{ planet: 2 }, { x: 150, y: 700 }],
  };
  const GOAL = { x: 2250, y: 700 };

  const results = runSeeds((seed, rng) => {
    const start = { x: 150, y: 700 + range(rng, -30, 30), angle: range(rng, -Math.PI, Math.PI) };
    return { world: makeWorld(MAP, seed, start, GOAL), goal: GOAL };
  }, 45);

  it('arrive au but sans dégât (ni choc ni tir de tourelle) sur au moins 95 % des seeds', () => {
    expect(rate(results, (r) => clean(r) && r.arrivedAt >= 0)).toBeGreaterThanOrEqual(RATE_MIN);
  });

  it('ne touche jamais une planète', () => {
    expect(rate(results, (r) => r.minGap > CONTACT)).toBeGreaterThanOrEqual(RATE_MIN);
  });
});

describe('IA : robustesse sur départs aléatoires (invariants)', () => {
  const SEED_COUNT = 60;
  const MAP = {
    width: 1600,
    height: 1000,
    planets: [
      { x: 450, y: 350, radius: 70 },
      { x: 1050, y: 650, radius: 90 },
      { x: 1350, y: 250, radius: 50, owner: BOT },
    ],
    // L'humain n'a aucune planète (donc aucune tourelle ne se construit contre le bot au bout de 20 s) : il reste
    // immobile dans le coin (1580, 980), hors de la portée de gravité des trois planètes.
    spawns: [
      { x: 1580, y: 980 },
      { x: 0, y: 0 },
    ],
  };
  // Départ et but à >= SAFE_GAP px de toute surface : hors du cas connu « but à ~60 px d'altitude sous gravité »
  // (oscillation attendue). La vitesse initiale (jusqu'à 80 px/s, dans toutes les directions, donc parfois droit
  // sur une planète) éprouve le réflexe anti-crash.
  const SAFE_GAP = 120;
  const MAX_START_SPEED = 80;

  function freePoint(rng, margin) {
    for (;;) {
      const x = range(rng, margin, MAP.width - margin);
      const y = range(rng, margin, MAP.height - margin);
      const free = MAP.planets.every((p) => Math.hypot(x - p.x, y - p.y) - p.radius >= SAFE_GAP);
      if (free) return { x, y };
    }
  }

  it('0 NaN, 0 mort, 0 impact, jamais de contact sur 60 seeds (30 s chacune)', () => {
    let nan = 0;
    let died = 0;
    let harmful = 0;
    let touched = 0;
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const rng = createRng(seed * 7919); // flux de scénario, distinct de world.rng
      const from = freePoint(rng, 100);
      const goal = freePoint(rng, 100);
      const heading = range(rng, -Math.PI, Math.PI);
      const speed = range(rng, 0, MAX_START_SPEED);
      const start = {
        ...from,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        angle: range(rng, -Math.PI, Math.PI),
      };
      const world = makeWorld(MAP, seed, start, goal);
      const result = fly(world, goal, 30);
      if (result.nan) nan++;
      if (result.died) died++;
      harmful += result.harmful;
      if (result.minGap <= CONTACT) touched++;
    }
    expect(nan).toBe(0);
    expect(died).toBe(0);
    expect(harmful).toBe(0);
    expect(touched).toBe(0);
  });
});

describe('IA : déterminisme', () => {
  // Le but est dans la portée de la tourelle ennemie (140 px de la surface, portée 150) : le bot est tiré dessus,
  // meurt et réapparaît, ce qui exerce world.rng (dispersion des tourelles), aiRng et le cycle mort/respawn.
  const MAP = {
    width: 2400,
    height: 1500,
    planets: [{ x: 650, y: 720, radius: 70 }, humanHome(1700, 700, 1), botHome(150, 1400)],
    spawns: [{ planet: 1 }, { x: 150, y: 700 }],
  };
  const GOAL = { x: 1700, y: 520 };
  const STEPS = 1800;

  function replay(seed) {
    const world = makeWorld(MAP, seed, { x: 150, y: 700, angle: 1 }, GOAL);
    for (let i = 0; i < STEPS; i++) step(world, FIXED_DT);
    return world;
  }

  it('deux exécutions de même seed donnent un monde identique après 1800 pas', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = replay(seed);
      expect(JSON.stringify(world)).toBe(JSON.stringify(replay(seed)));
      // Garde-fou : la tourelle a bien tiré (world.rng consommé), sinon le test ne prouverait rien sur l'aléa.
      expect(world.rng.state).not.toBe(seed);
    }
  });

  it('le monde reste JSON pur (aller-retour sans perte)', () => {
    const json = JSON.stringify(replay(1));
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
  });
});

describe('IA : la présence d un bot ne perturbe pas la faction humaine', () => {
  // L'humain (faction 0) vole et tire selon un script fixe ; le bot (faction 1) traverse la carte et passe près
  // de lui. Monde A : avec bot. On enregistre l'intention écrite par l'IA à chaque pas. Monde B : sans bot,
  // les mêmes intentions sont rejouées sur le vaisseau 1. Tout le monde doit être identique, hors `ai`/`aiRng`
  // (l'IA n'écrit que les intentions de son vaisseau et son propre état : ADR 0006 §1).
  const MAP = {
    width: 1600,
    height: 1000,
    planets: [{ x: 800, y: 500, radius: 80 }, humanHome(200, 850), botHome(1400, 850)],
    spawns: [
      { x: 300, y: 300, angle: 0 },
      { x: 1300, y: 300, angle: Math.PI },
    ],
  };
  const GOAL = { x: 300, y: 300 }; // le bot vise la position initiale de l'humain
  const STEPS = 1800;

  function humanScript(ship, i) {
    ship.intent.rotate = Math.floor(i / 90) % 3 === 0 ? 1 : 0;
    ship.intent.thrust = i % 120 < 20;
    ship.intent.fire = i % 15 === 0;
  }

  function stripAi(world) {
    const { ai, aiRng, ...rest } = world;
    void ai;
    void aiRng;
    return JSON.stringify(rest);
  }

  for (const seed of [1, 2, 3]) {
    it(`monde identique hors ai/aiRng en rejouant les intentions du bot sans IA (seed ${seed})`, () => {
      const withBot = createWorld(MAP, seed, OPTIONS);
      withBot.ai[0].mode = AI_MODE.GOTO;
      withBot.ai[0].goalX = GOAL.x;
      withBot.ai[0].goalY = GOAL.y;
      const recorded = [];
      for (let i = 0; i < STEPS; i++) {
        humanScript(withBot.ships[0], i);
        step(withBot, FIXED_DT);
        const { rotate, thrust, fire, missile } = withBot.ships[BOT].intent;
        recorded.push({ rotate, thrust, fire, missile });
      }

      const without = createWorld(MAP, seed, { eventCapacity: OPTIONS.eventCapacity });
      for (let i = 0; i < STEPS; i++) {
        humanScript(without.ships[0], i);
        Object.assign(without.ships[BOT].intent, recorded[i]);
        step(without, FIXED_DT);
      }

      expect(stripAi(withBot)).toBe(stripAi(without));
      // Garde-fou : le scénario n'est pas trivial, le bot a bougé et le monde a bien évolué.
      expect(withBot.ships[BOT].pos.x).not.toBeCloseTo(1300, 0);
      expect(withBot.tick).toBe(STEPS);
    });
  }
});
