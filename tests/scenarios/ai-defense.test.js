import { describe, expect, it } from 'vitest';
import {
  BULLET_SPEED,
  FIXED_DT,
  SHIELD_MAX,
  SHIELD_RECHARGE_DELAY,
  SHIELD_RECHARGE_RATE,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { interceptTime } from '../../src/core/ai/combat.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';
import { BOT_PROFILE as P } from '../../src/data/ai.js';
import { arena } from '../../src/data/maps/arena.js';

// Défense et repli des bots (ADR 0006 §3) : DEFEND (planète attaquée, ennemi posé, ennemi qui rôde) et RETREAT
// (PV bas, abri sûr, recharge du bouclier). Mini-carte 2400 x 1600 : la faction 1 (bot) possède sa base H (tourelle)
// et une seconde planète B (tourelle + usine + générateur de bouclier : abri et bouclier rechargeable) ; la faction 0
// (humain scripté) est invulnérable et immobile (position et vitesse réimposées avant chaque pas). Chaque scénario
// est rejoué sur les seeds 1 à 20 et asserté en taux (>= RATE_MIN) : le pilote est bang-bang et le bruit de décision
// (±5 %) est tiré dans `aiRng`.
const BOT = 1;
const HUMAN = 0;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_MIN = 0.95;
const MAP_W = 2400;
const MAP_H = 1600;
const { CAPTURE, ASSAULT, HUNT, DEFEND, RETREAT, REARM } = AI_MODE;

const HUMAN_HOME = { x: 2250, y: 1450, radius: 40, owner: 0, built: 1 };
const HOME = { x: 150, y: 1450, radius: 40 };
const botHome = { ...HOME, owner: BOT, built: 1 };
const SHIELD_BUILT = 3; // tourelle + usine + générateur de bouclier
// Index fixes : planets = [HUMAN_HOME (0), botHome, B, N]
const HOME_IDX = 1;
const B_IDX = 2;
const N_IDX = 3;

const FAR_HOVER = 420; // > defendRadius (400), et dans la portée d une balle (512 px)
const HOVER = 120; // altitude de l'humain scripté au-dessus de la planète qu'il attaque (px)

const stepsOf = (seconds) => Math.round(seconds / FIXED_DT);
const timeOf = (world) => world.tick * FIXED_DT;
const polar = (origin, dist, angle) => ({
  x: origin.x + Math.cos(angle) * dist,
  y: origin.y + Math.sin(angle) * dist,
});
const shipToPlanetGap = (ship, planet) =>
  Math.hypot(ship.pos.x - planet.pos.x, ship.pos.y - planet.pos.y) - planet.radius;

function expectRate(results, predicate, min = RATE_MIN) {
  const failed = results.filter((r) => !predicate(r)).map((r) => r.seed);
  const rate = (results.length - failed.length) / results.length;
  expect(rate, `seeds en échec : [${failed.join(', ')}]`).toBeGreaterThanOrEqual(min);
}

const runSeeds = (fn, seeds = SEEDS) =>
  seeds.map((seed) => ({ seed, ...fn(seed, createRng(seed)) }));

const finite = (ship) =>
  [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle, ship.hp, ship.shield].every(
    Number.isFinite,
  );

function eventsOf(world, type, fn) {
  for (let e = 0; e < world.events.count; e++) {
    const ev = world.events.items[e];
    if (ev.type === type) fn(ev);
  }
}

/**
 * Monde de test. `bPos` = position de B (tirée par le scénario), `botSpawn` = départ du bot (planète ou position
 * libre), `humanSpawn` = départ de l'humain (par défaut posé sur sa base). N est une neutre sans défense.
 */
function makeWorld(seed, { b, n, botSpawn = { planet: HOME_IDX }, humanSpawn = { planet: 0 } }) {
  const planets = [
    HUMAN_HOME,
    botHome,
    { ...b, radius: 40, owner: BOT, built: SHIELD_BUILT },
    ...(n === undefined ? [] : [{ ...n, radius: 35, owner: -1, built: 0 }]),
  ];
  return createWorld(
    { width: MAP_W, height: MAP_H, planets, spawns: [humanSpawn, botSpawn] },
    seed,
    { eventCapacity: 256, bots: [BOT] },
  );
}

/** Position de B à 450..560 px de la base, vers le haut-droite (angle tiré dans [minAngle, maxAngle]). */
const randomB = (rng, minAngle = -1.2, maxAngle = -0.5) =>
  polar(HOME, range(rng, 450, 560), range(rng, minAngle, maxAngle));

/**
 * Humain scripté : posé en vol à `pos`, nez sur `lookAt`, invulnérable (PV remis à fond avant chaque pas). Retourne
 * le prélude à appeler avant chaque `step` (position et vitesse réimposées : la gravité ne l'écrase pas au sol).
 */
function scriptHuman(world, pos, lookAt, fire) {
  const human = world.ships[HUMAN];
  human.landedOn = -1;
  human.pos.x = pos.x;
  human.pos.y = pos.y;
  human.angle = Math.atan2(lookAt.y - pos.y, lookAt.x - pos.x);
  return () => {
    human.alive = true;
    human.hp = SHIP_MAX_HP;
    human.pos.x = pos.x;
    human.pos.y = pos.y;
    human.vel.x = 0;
    human.vel.y = 0;
    human.intent.fire = fire;
  };
}

/** Humain en vol à `hover` px de la surface de `planet`, côté `angle`, nez sur la planète. */
function attackPlanet(world, planetIdx, angle, fire = true, hover = HOVER) {
  const planet = world.planets[planetIdx];
  const pos = polar(planet.pos, planet.radius + hover, angle);
  return scriptHuman(world, pos, planet.pos, fire);
}

/**
 * Joue au plus `seconds`. `before(world)` précède chaque pas (script de l'humain), `after(world)` le suit avec les
 * événements du pas encore lisibles ; retourner `true` arrête. Relève NaN, morts du bot et premier mode décidé.
 */
function play(world, seconds, { before, after } = {}) {
  const rec = { nan: false, botDeaths: 0, firstDecision: -1 };
  let botWasAlive = true;
  for (let i = 0; i < stepsOf(seconds); i++) {
    before?.(world);
    clearEvents(world.events);
    step(world, FIXED_DT);
    const bot = world.ships[BOT];
    if (!finite(bot)) rec.nan = true;
    if (botWasAlive && !bot.alive) rec.botDeaths++;
    botWasAlive = bot.alive;
    if (rec.firstDecision < 0 && world.ai[0].mode !== AI_MODE.NONE)
      rec.firstDecision = timeOf(world);
    if (after?.(world) === true) break;
  }
  rec.endTime = timeOf(world);
  return rec;
}

/** Blesse le bot et force une décision au prochain pas (PV bas, pas de bouclier). */
function wound(world, { underFire }) {
  const ship = world.ships[BOT];
  ship.hp = 30; // < lowHealth (40) : « en danger » dès qu'une menace existe
  ship.shield = 0;
  ship.shieldDelay = SHIELD_RECHARGE_DELAY; // blessé à l'instant : le bouclier ne recharge qu'après le délai
  world.ai[0].decisionTimer = 0;
  // Par défaut lastHealth vaut SHIP_MAX_HP : la blessure ressemblerait à un tir reçu (underFire) et suffirait à
  // elle seule à déclencher le repli. Sans `underFire`, seule la proximité de l'ennemi doit le justifier.
  if (!underFire) world.ai[0].lastHealth = ship.hp + ship.shield;
}

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : DEFEND sur la planète attaquée', () => {
  // L'humain scripté tire sans arrêt sur une planète du bot depuis 120 px d'altitude ; les balles qu'elle absorbe
  // posent `lastHitTick` (facteur 1 de DEFEND). Le bot (en HUNT / ASSAULT possibles) doit quand même passer en
  // DEFEND de cette planète, dans les 10 s qui suivent sa première décision (startDelay = 2 s).
  const DEFEND_BY = 10;
  const attacked = (victim, hover) => (seed, rng) => {
    const b = randomB(rng);
    const world = makeWorld(seed, { b });
    const planet = world.planets[victim];
    // L'attaquant est du côté de la planète éloigné du vaisseau du bot au départ (posé au sommet de H) : les balles
    // visent le centre de la planète et ne le touchent pas.
    const angle =
      victim === HOME_IDX
        ? range(rng, -0.6, 0.2) // rester dans la carte (y < 1600) même à 420 px
        : range(rng, -0.3, 0.9) + Math.atan2(b.y - HOME.y, b.x - HOME.x);
    const before = attackPlanet(world, victim, angle, true, hover);
    let defendAt = -1;
    let hitAt = -1;
    const rec = play(world, 2 + DEFEND_BY + 2, {
      before,
      after: (w) => {
        if (hitAt < 0 && planet.lastHitTick >= 0) hitAt = timeOf(w);
        const bot = w.ai[0];
        if (defendAt < 0 && bot.mode === DEFEND && bot.target === victim) defendAt = timeOf(w);
        return defendAt >= 0;
      },
    });
    return { hitAt, defendAt, ...rec };
  };

  for (const [name, victim] of [
    ['sa base (le bot y est posé)', HOME_IDX],
    ['sa seconde planète (le bot est à 450..560 px)', B_IDX],
  ]) {
    it(`planète attaquée = ${name} : DEFEND de cette planète en moins de ${DEFEND_BY} s`, () => {
      const results = runSeeds(attacked(victim, HOVER));
      expectRate(results, (r) => r.hitAt >= 0 && !r.nan);
      expectRate(results, (r) => r.defendAt >= 0 && r.defendAt - r.firstDecision < DEFEND_BY);
    });
    // À 120 px l'ennemi « rôde » déjà (facteur 0,5) : seule une attaque venue de plus loin que defendRadius isole
    // le facteur « touchée récemment » (1). Une balle porte 512 px : l'attaquant touche la planète depuis 420 px.
    it(`${name} : attaquée de loin (hors defendRadius), DEFEND grâce au seul facteur « touchée »`, () => {
      const results = runSeeds(attacked(victim, FAR_HOVER));
      expectRate(results, (r) => r.hitAt >= 0 && !r.nan);
      expectRate(results, (r) => r.defendAt >= r.hitAt && r.defendAt - r.firstDecision < DEFEND_BY);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : un ennemi posé sur sa planète préempte le verrou minCommit', () => {
  // Le bot vient d'engager CAPTURE de la neutre N (modeTime = 0 : verrouillé pendant minCommit = 2 s, score 1e6 qui
  // bat tout candidat normal). Au pas suivant, une décision est forcée. Un ennemi posé sur B (capture en cours)
  // donne un DEFEND « urgent » (+PREEMPT), qui passe devant le verrou. Témoin : le même ennemi qui ne fait que rôder
  // près de B (facteur 0,5, non urgent) ne fait PAS lâcher l'engagement.
  const lockedBot = (seed, rng, humanOn) => {
    const b = randomB(rng);
    const n = polar(HOME, range(rng, 300, 450), range(rng, -2.4, -1.9)); // N au-dessus de la base, à l'opposé de B
    const world = makeWorld(seed, { b, n });
    const bot = world.ai[0];
    bot.mode = CAPTURE;
    bot.target = N_IDX;
    bot.modeTime = 0;
    bot.decisionTimer = 0;
    let before;
    if (humanOn === 'landed') {
      const human = world.ships[HUMAN];
      human.landedOn = B_IDX;
      const planet = world.planets[B_IDX];
      const a = range(rng, -Math.PI, Math.PI);
      human.pos.x = planet.pos.x + Math.cos(a) * (planet.radius + 6);
      human.pos.y = planet.pos.y + Math.sin(a) * (planet.radius + 6);
    } else {
      before = attackPlanet(world, B_IDX, range(rng, -Math.PI, Math.PI), false);
    }
    const rec = play(world, 1, { before, after: () => true }); // un seul pas : la décision forcée
    return { mode: bot.mode, target: bot.target, modeTime: bot.modeTime, ...rec };
  };

  it('ennemi posé sur B : DEFEND de B dès la décision, malgré le verrou', () => {
    const results = runSeeds((seed, rng) => lockedBot(seed, rng, 'landed'));
    expectRate(results, (r) => r.mode === DEFEND && r.target === B_IDX);
    // Changer d'option remet le chronomètre d'engagement à zéro (un seul pas s'est écoulé).
    expectRate(results, (r) => r.modeTime < 2 * FIXED_DT);
  });

  it('témoin : ennemi qui rôde à 120 px de B sans se poser : le verrou tient (CAPTURE de N)', () => {
    const results = runSeeds((seed, rng) => lockedBot(seed, rng, 'hover'));
    expectRate(results, (r) => r.mode === CAPTURE && r.target === N_IDX);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : comportement de DEFEND (attaquant ou non)', () => {
  // Mode forcé sur B avec le minuteur de décision gelé : on isole la couche « pilote » (pas de re-décision).
  const FREEZE = 1e9;
  const setup = (seed, rng, withAttacker) => {
    const b = randomB(rng);
    const world = makeWorld(seed, { b });
    const bot = world.ai[0];
    bot.mode = DEFEND;
    bot.target = B_IDX;
    bot.decisionTimer = FREEZE;
    bot.fireDelay = 0;
    const base = Math.atan2(b.y - HOME.y, b.x - HOME.x);
    // Attaquant à 120 px de la surface de B (< defendRadius), sur le flanc, immobile et silencieux.
    const before = withAttacker
      ? attackPlanet(world, B_IDX, base + range(rng, -0.8, 0.8), false)
      : undefined;
    return { world, bot, before };
  };

  it('avec un attaquant : le désigne (bot.attacker), s engage dans la bande de tir et tire, sans se poser', () => {
    const results = runSeeds((seed, rng) => {
      const { world, bot, before } = setup(seed, rng, true);
      let attackerSeen = true;
      let landedAfterTakeoff = false;
      let tookOff = false;
      let shots = 0;
      let minDist = Infinity;
      let lastDist = Infinity;
      const rec = play(world, 20, {
        before,
        after: (w) => {
          const ship = w.ships[BOT];
          if (bot.attacker !== HUMAN) attackerSeen = false;
          if (ship.landedOn < 0) tookOff = true;
          else if (tookOff) landedAfterTakeoff = true;
          eventsOf(w, EVT.SHOT, (ev) => {
            if (ev.a === BOT) shots++;
          });
          lastDist = Math.hypot(
            ship.pos.x - w.ships[HUMAN].pos.x,
            ship.pos.y - w.ships[HUMAN].pos.y,
          );
          minDist = Math.min(minDist, lastDist);
          return false;
        },
      });
      return { attackerSeen, landedAfterTakeoff, shots, minDist, lastDist, ...rec };
    });
    expectRate(results, (r) => r.attackerSeen && !r.landedAfterTakeoff && !r.nan);
    expectRate(results, (r) => r.shots >= 5);
    // Distance finale : proche de la bande [engageMin, engageMax] (marge : le pilote est bang-bang, dérive possible).
    expectRate(results, (r) => r.lastDist < P.engageMax + 60 && r.minDist > 40);
  });

  it('sans attaquant : se pose sur la planète défendue et ne tire pas', () => {
    const results = runSeeds((seed, rng) => {
      const { world, bot, before } = setup(seed, rng, false);
      world.ships[HUMAN].pos.x = 2250; // posé sur sa base, très loin de B
      let landedAt = -1;
      let shots = 0;
      let attackerEver = false;
      const rec = play(world, 25, {
        before,
        after: (w) => {
          if (bot.attacker >= 0) attackerEver = true;
          eventsOf(w, EVT.SHOT, (ev) => {
            if (ev.a === BOT) shots++;
          });
          if (landedAt < 0 && w.ships[BOT].landedOn === B_IDX) landedAt = timeOf(w);
          return landedAt >= 0;
        },
      });
      return { landedAt, shots, attackerEver, mode: bot.mode, ...rec };
    });
    expectRate(results, (r) => r.landedAt >= 0 && !r.attackerEver && !r.nan && r.botDeaths === 0);
    expectRate(results, (r) => r.shots === 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : un ennemi posé ailleurs ne déclenche pas DEFEND', () => {
  // Un ennemi posé sur une autre planète (ici N, neutre, à 150..250 px de la surface de B) ne menace pas B : le
  // facteur « rôde » ne compte que les ennemis en vol (`enemyWithin(..., landed = false)`). Témoin : le même ennemi
  // en vol, à la même position, déclenche bien DEFEND (sinon le scénario serait vide).
  const run = (landed) => (seed, rng) => {
    const b = randomB(rng);
    const base = Math.atan2(b.y - HOME.y, b.x - HOME.x);
    const n = polar(b, 40 + 35 + range(rng, 150, 250), base + range(rng, -0.6, 0.6));
    // Témoin : sans N (une neutre libre à capturer ferait gagner CAPTURE contre DEFEND et masquerait le facteur).
    const world = makeWorld(seed, landed ? { b, n } : { b });
    const human = world.ships[HUMAN];
    let before;
    if (landed) {
      const a = Math.atan2(n.y - b.y, n.x - b.x); // sommet de N côté B
      human.landedOn = N_IDX;
      human.pos.x = n.x - Math.cos(a) * (35 + 6);
      human.pos.y = n.y - Math.sin(a) * (35 + 6);
      before = () => {
        human.alive = true;
        human.hp = SHIP_MAX_HP; // invulnérable : un tir du bot ne doit pas le faire respawn sur sa base
      };
    } else {
      // Même point que le posé : sommet de N côté B, 6 px au-dessus de la surface (mais en vol).
      const a = Math.atan2(b.y - n.y, b.x - n.x);
      before = scriptHuman(world, polar(n, 35 + 6, a), b, false);
    }
    let defends = 0;
    const rec = play(world, 20, {
      before,
      after: (w) => {
        if (w.ai[0].mode === DEFEND) defends++;
        return false;
      },
    });
    return { defends, ...rec };
  };

  it('ennemi posé sur N (jamais touché, jamais posé sur une planète du bot) : aucun DEFEND en 20 s', () => {
    const results = runSeeds(run(true));
    expectRate(results, (r) => r.defends === 0 && !r.nan);
  });

  it('témoin : le même ennemi en vol déclenche DEFEND', () => {
    const results = runSeeds(run(false));
    expectRate(results, (r) => r.defends > 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : RETREAT d un bot blessé', () => {
  // Bot blessé (30 PV, sans bouclier), posé sur sa base H. Un ennemi à 200..280 px de lui (< retreatThreat = 300)
  // le met « en danger ». Abri attendu : une planète possédée sans ennemi à moins de retreatSafe de sa surface ; la
  // base H, trop proche de l'ennemi, ne convient pas : c'est B.
  const SNIPER_RANGE = 480;
  const setup = (seed, rng, { fire, near = true }) => {
    const b = randomB(rng, -1.4, -1.1); // B presque au-dessus de H
    const world = makeWorld(seed, { b });
    const botShip = world.ships[BOT];
    wound(world, { underFire: false });
    // Ennemi à droite et un peu sous le bot (au sommet de H), à 200..280 px : H est à moins de retreatSafe de lui,
    // B (en haut) à plus.
    const pos = polar(
      botShip.pos,
      near ? range(rng, 200, 280) : range(rng, 380, 450),
      range(rng, 0.1, 0.5),
    );
    const aim = (w) => {
      const sniper = w.ships[HUMAN];
      const dx = botShip.pos.x - sniper.pos.x;
      const dy = botShip.pos.y - sniper.pos.y;
      const t = interceptTime(
        dx,
        dy,
        botShip.vel.x - sniper.vel.x,
        botShip.vel.y - sniper.vel.y,
        BULLET_SPEED,
      );
      sniper.intent.fire = false;
      if (t < 0 || Math.hypot(dx, dy) > SNIPER_RANGE) return;
      sniper.angle = Math.atan2(dy + botShip.vel.y * t, dx + botShip.vel.x * t);
      sniper.intent.fire = fire;
    };
    const pin = scriptHuman(world, pos, botShip.pos, false);
    return {
      world,
      b,
      before: (w) => {
        pin();
        aim(w);
      },
    };
  };

  it('sous un sniper : RETREAT dès la première décision, vers une planète possédée sûre', () => {
    const results = runSeeds((seed, rng) => {
      const { world, before } = setup(seed, rng, { fire: true });
      const bot = world.ai[0];
      let decided = null;
      const rec = play(world, 3, {
        before,
        after: (w) => {
          if (bot.mode === AI_MODE.NONE) return false;
          // Premier mode décidé : on le fige avec l'état de l'abri choisi à cet instant.
          const planet = w.planets[bot.target];
          decided = {
            mode: bot.mode,
            target: bot.target,
            owned: planet !== undefined && planet.owner === BOT,
            enemyGap: planet === undefined ? -1 : shipToPlanetGap(w.ships[HUMAN], planet),
            time: timeOf(w),
          };
          return true;
        },
      });
      return { decided, ...rec };
    });
    expectRate(results, (r) => r.decided !== null && r.decided.mode === RETREAT);
    expectRate(results, (r) => r.decided?.owned === true && r.decided.enemyGap >= P.retreatSafe);
    expectRate(results, (r) => r.decided?.target === B_IDX); // H est sous le nez de l'ennemi
    // `wound` force le minuteur à 0 : la décision tombe dès le premier pas (et non à startDelay = 2 s).
    expectRate(results, (r) => r.firstDecision <= 2 * FIXED_DT);
  });

  it('témoin : le même ennemi à plus de retreatThreat (300 px), sans tir reçu : pas de RETREAT', () => {
    const results = runSeeds((seed, rng) => {
      const { world, before } = setup(seed, rng, { fire: false, near: false });
      const bot = world.ai[0];
      let first = -1;
      const rec = play(world, 3, {
        before,
        after: () => {
          if (bot.mode === AI_MODE.NONE) return false;
          first = bot.mode;
          return true;
        },
      });
      return { first, ...rec };
    });
    expectRate(results, (r) => r.first !== -1 && r.first !== RETREAT);
  });

  it('se pose sur l abri et y reste tant que le bouclier se recharge', () => {
    // L'ennemi ne tire plus (on isole le repli de la survie sous le feu) mais reste posté près de H.
    const results = runSeeds((seed, rng) => {
      const { world, before } = setup(seed, rng, { fire: false });
      const bot = world.ai[0];
      const ship = world.ships[BOT];
      let landedAt = -1;
      let leftEarly = false; // décollage / changement de mode avant le plein bouclier
      let fullAt = -1;
      let leftMode = null;
      const rec = play(world, 40, {
        before,
        after: (w) => {
          if (bot.mode === AI_MODE.NONE) return false;
          if (landedAt < 0) {
            if (ship.landedOn === B_IDX) landedAt = timeOf(w);
            return false;
          }
          if (fullAt < 0) {
            if (bot.mode !== RETREAT || ship.landedOn !== B_IDX) leftEarly = true;
            if (ship.shield >= SHIELD_MAX - 1e-9) fullAt = timeOf(w);
            return false;
          }
          leftMode = bot.mode;
          return true;
        },
      });
      return { landedAt, fullAt, leftEarly, leftMode, shield: ship.shield, ...rec };
    });
    expectRate(
      results,
      (r) => r.landedAt >= 0 && r.fullAt > r.landedAt && !r.nan && r.botDeaths === 0,
    );
    expectRate(results, (r) => !r.leftEarly);
    // Le bouclier part de 0 : le plein ne peut venir avant 50 / 10 = 5 s (le délai de 4 s l'allonge ; tolérance de
    // deux pas de temps).
    expectRate(results, (r) => r.fullAt >= SHIELD_MAX / SHIELD_RECHARGE_RATE - 2 * FIXED_DT);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA défense : RETREAT puis reprise d activité', () => {
  // Même bot blessé mais sans aucune menace (l'humain reste posé sur sa base, loin) : après le repli et la recharge
  // du bouclier, il doit reprendre une activité offensive ou logistique (CAPTURE de la neutre N, etc.), pas rester
  // posé indéfiniment.
  const RESUME = [CAPTURE, ASSAULT, HUNT, REARM];
  const results = runSeeds((seed, rng) => {
    const b = randomB(rng, -1.4, -1.1);
    const n = polar(HOME, range(rng, 400, 600), range(rng, -0.3, 0.0)); // N à droite de H, loin de l'humain
    const world = makeWorld(seed, { b, n });
    wound(world, { underFire: true });
    const bot = world.ai[0];
    const ship = world.ships[BOT];
    let retreatAt = -1;
    let leftAt = -1;
    let shieldWhenLeft = -1;
    let resumed = null;
    const rec = play(world, 60, {
      after: (w) => {
        if (retreatAt < 0 && bot.mode === RETREAT) retreatAt = timeOf(w);
        if (retreatAt >= 0 && leftAt < 0 && bot.mode !== RETREAT) {
          leftAt = timeOf(w);
          shieldWhenLeft = ship.shield;
        }
        if (leftAt >= 0 && RESUME.includes(bot.mode)) {
          resumed = bot.mode;
          return true;
        }
        return false;
      },
    });
    return { retreatAt, leftAt, shieldWhenLeft, resumed, ...rec };
  });

  it('commence par RETREAT dès la première décision', () => {
    expectRate(results, (r) => r.retreatAt >= 0 && r.retreatAt <= r.firstDecision + 2 * FIXED_DT);
  });

  it('ne quitte le repli qu avec le bouclier plein', () => {
    expectRate(results, (r) => r.leftAt > r.retreatAt && r.shieldWhenLeft >= SHIELD_MAX - 1e-9);
  });

  it('reprend ensuite CAPTURE, ASSAULT, HUNT ou REARM, sans mourir', () => {
    expectRate(results, (r) => r.resumed !== null && r.botDeaths === 0 && !r.nan);
  });
});

// ---------------------------------------------------------------------------------------------------------------
const ARENA = { ...arena, spawns: [{ planet: 0 }, { planet: 1 }, { planet: 2 }] };
const arenaWorld = (seed) => createWorld(ARENA, seed, { eventCapacity: 256, bots: [1, 2] });

describe('IA défense : deux bots qui se combattent sur l arène (120 s)', () => {
  const STUCK_AFTER = 30; // s immobile en vol : bot bloqué
  const STUCK_RADIUS = 5; // px : en deçà, le vaisseau est considéré immobile
  const results = runSeeds(
    (seed) => {
      const world = arenaWorld(seed);
      const used = { [DEFEND]: 0, [RETREAT]: 0 };
      const anchor = [null, null, null]; // par faction : { x, y, since }
      let stuck = false;
      let bad = false;
      const rec = play(world, 120, {
        after: (w) => {
          for (const bot of w.ai) if (bot.mode in used) used[bot.mode]++;
          for (const ship of w.ships) {
            if (!finite(ship) || ship.hp < 0) bad = true;
          }
          for (const bot of w.ai) {
            const ship = w.ships[bot.faction];
            const a = anchor[bot.faction];
            if (!ship.alive || ship.landedOn >= 0) {
              anchor[bot.faction] = null;
              continue;
            }
            if (a === null || Math.hypot(ship.pos.x - a.x, ship.pos.y - a.y) > STUCK_RADIUS) {
              anchor[bot.faction] = { x: ship.pos.x, y: ship.pos.y, since: timeOf(w) };
            } else if (timeOf(w) - a.since > STUCK_AFTER) stuck = true;
          }
          return false;
        },
      });
      return { used, stuck, bad, ...rec };
    },
    Array.from({ length: 10 }, (_, i) => i + 1),
  );

  it('aucun NaN, PV >= 0', () => {
    expect(results.filter((r) => r.nan || r.bad).map((r) => r.seed)).toEqual([]);
  });

  it('DEFEND et RETREAT sont tous deux utilisés au moins une fois sur l ensemble des seeds', () => {
    const total = (mode) => results.reduce((sum, r) => sum + r.used[mode], 0);
    expect(total(DEFEND)).toBeGreaterThan(0);
    expect(total(RETREAT)).toBeGreaterThan(0);
  });

  it('aucun bot ne reste immobile plus de 30 s hors de toute planète', () => {
    expect(results.filter((r) => r.stuck).map((r) => r.seed)).toEqual([]);
  });
});

describe('IA défense : déterminisme', () => {
  // Mêmes entrées, même seed : monde (bots, RNG, projectiles) identique à l'octet près après 1800 pas (30 s). Le
  // scénario mêle attaque d'une planète du bot (DEFEND) et bot blessé (RETREAT) pour exercer les deux modes.
  const STEPS = 1800;
  function replay(seed) {
    const rng = createRng(seed);
    const b = randomB(rng);
    const world = makeWorld(seed, { b });
    wound(world, { underFire: true });
    const before = attackPlanet(world, B_IDX, range(rng, 0, 1.5));
    const modes = new Set();
    for (let i = 0; i < STEPS; i++) {
      before();
      clearEvents(world.events);
      step(world, FIXED_DT);
      modes.add(world.ai[0].mode);
    }
    return { world, modes };
  }

  it('deux exécutions de même seed donnent un monde JSON identique après 1800 pas (seeds 1 à 5)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = replay(seed);
      const c = replay(seed);
      expect(JSON.stringify(a.world)).toBe(JSON.stringify(c.world));
      // Le scénario n'est pas vide : le bot s'est replié sous le feu de l'attaquant.
      expect(a.modes.has(RETREAT)).toBe(true);
    }
  });

  it('des seeds différentes donnent des mondes différents', () => {
    expect(JSON.stringify(replay(1).world)).not.toBe(JSON.stringify(replay(2).world));
  });
});
