import { describe, expect, it } from 'vitest';
import { FIXED_DT, MISSILE_STOCK_MAX, SHIP_MAX_HP } from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';
import { BOT_PROFILE as P } from '../../src/data/ai.js';
import { arena } from '../../src/data/maps/arena.js';

// Couche « décision » des bots (ADR 0006 §3) : choix (mode, cible) par utilité, hystérésis, bannissement.
// Mini-cartes 2400 x 1600 : la faction 1 (bot) possède une planète de repli en bas à gauche (sinon elle est
// « hors jeu » et ignorée par l'IA) ; la faction 0 (humaine) est posée, immobile, sur une planète de coin dotée
// d'une tourelle (donc jamais candidate à la capture). Chaque scénario est rejoué sur les seeds 1 à 20 (positions
// et rayons tirés dans un rng seedé) et asserté en taux : le pilote est bang-bang et le bruit de décision
// (±5 %) est tiré dans `aiRng`, on exige >= RATE_MIN (ou RATE_E2E en bout en bout) avec des assertions séparées
// pour que l'échec soit lisible (la liste des seeds en échec est dans le message).
const BOT = 1;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_MIN = 0.95;
const RATE_E2E = 0.9;
const MAP_W = 2400;
const MAP_H = 1600;
const STOCK_MAX = MISSILE_STOCK_MAX;
const { NONE, IDLE, CAPTURE, REARM, GOTO, LAND } = AI_MODE;

const HUMAN_HOME = { x: 2250, y: 1450, radius: 40, owner: 0, built: 1 };
const botHome = (built = 0) => ({ x: 150, y: 1450, radius: 40, owner: BOT, built });
const HOME = { x: 150, y: 1450 }; // centre de botHome : origine des tirages polaires
// Index fixes : planets = [HUMAN_HOME, botHome, ...autres]
const HUMAN = 0;
const HOME_IDX = 1;

// Décision attendue à startDelay (2 s) : minuteur décrémenté par pas, donc 120 ou 121 pas selon l'arrondi flottant.
const DECISION_SLACK = 2 * FIXED_DT;

const stepsOf = (seconds) => Math.round(seconds / FIXED_DT);
const timeOf = (world) => world.tick * FIXED_DT;
const polar = (origin, dist, angle) => ({
  x: origin.x + Math.cos(angle) * dist,
  y: origin.y + Math.sin(angle) * dist,
});

/** Monde de test : `spawns` = départs des factions 0.. ; les bots sont `bots` (par défaut la faction 1). */
function makeWorld(planets, seed, spawns, bots = [BOT]) {
  const map = { width: MAP_W, height: MAP_H, planets, spawns };
  return createWorld(map, seed, { eventCapacity: 256, bots });
}

const newRecord = () => ({ harmful: 0, nan: false, died: false });

/** Joue un pas ; relève dégâts (IMPACT, SHIP_HIT, EXPLOSION sur un bot), NaN et mort des vaisseaux de bot. */
function tick(world, rec) {
  clearEvents(world.events);
  step(world, FIXED_DT);
  const factions = world.ai.map((b) => b.faction);
  for (let e = 0; e < world.events.count; e++) {
    const { type, a } = world.events.items[e];
    if (
      factions.includes(a) &&
      (type === EVT.IMPACT || type === EVT.SHIP_HIT || type === EVT.EXPLOSION)
    )
      rec.harmful++;
  }
  for (const f of factions) {
    const ship = world.ships[f];
    if (
      ![ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle, ship.hp].every(Number.isFinite)
    )
      rec.nan = true;
    if (!ship.alive) rec.died = true;
  }
}

/** Joue au plus `seconds` ; `hook(world)` est appelé après chaque pas, retourner `true` l'arrête. */
function play(world, seconds, rec, hook) {
  const n = stepsOf(seconds);
  for (let i = 0; i < n; i++) {
    tick(world, rec);
    if (hook !== undefined && hook(world) === true) return;
  }
}

/** Joue jusqu'à la première décision (mode != NONE) ; retourne l'instant (s) ou −1 si `limit` est dépassée. */
function untilDecision(world, limit, rec) {
  let at = -1;
  play(world, limit, rec, (w) => {
    if (w.ai[0].mode === NONE) return false;
    at = timeOf(w);
    return true;
  });
  return at;
}

/** Échec lisible : la liste des seeds en échec figure dans le message de l'assertion. */
function expectRate(results, predicate, min) {
  const failed = results.filter((r) => !predicate(r)).map((r) => r.seed);
  const rate = (results.length - failed.length) / results.length;
  expect(rate, `seeds en échec : [${failed.join(', ')}]`).toBeGreaterThanOrEqual(min);
}

const runSeeds = (fn, seeds = SEEDS) =>
  seeds.map((seed) => ({ seed, ...fn(seed, createRng(seed)) }));
const clean = (r) => r.harmful === 0 && !r.died && !r.nan;

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : capture de la planète neutre la plus proche', () => {
  // Une neutre proche (350..700 px du bot) et une lointaine (1700..2100 px) ; l'ordre des index est permuté selon
  // la seed pour qu'un départage « premier index » ne passe pas pour de la proximité. Utilité : 1 / (1 + gap/1200),
  // soit ~0,7 contre ~0,4 : l'écart est bien supérieur au bruit de ±5 % et au bonus d'engagement (pas encore actif).
  const results = runSeeds((seed, rng) => {
    const near = {
      ...polar(HOME, range(rng, 350, 700), range(rng, -1.3, -0.3)),
      radius: range(rng, 30, 60),
    };
    const far = {
      ...polar(HOME, range(rng, 1700, 2100), range(rng, -0.6, -0.2)),
      radius: range(rng, 30, 60),
    };
    const swap = seed % 2 === 0;
    const planets = [HUMAN_HOME, botHome(), swap ? far : near, swap ? near : far];
    const world = makeWorld(planets, seed, [{ planet: HUMAN }, { planet: HOME_IDX }]);
    const rec = newRecord();
    let decidedEarly = false; // aucune décision avant startDelay
    play(world, P.startDelay - 0.1, rec, (w) => {
      decidedEarly ||= w.ai[0].mode !== NONE;
    });
    const decidedAt = untilDecision(world, 1, rec);
    const ai = world.ai[0];
    return { decidedAt, mode: ai.mode, target: ai.target, nearIdx: swap ? 3 : 2, decidedEarly };
  });

  it('ne décide rien avant startDelay, puis décide dans les deux pas qui suivent 2 s', () => {
    expectRate(results, (r) => !r.decidedEarly, RATE_MIN);
    expectRate(
      results,
      (r) => r.decidedAt >= P.startDelay && r.decidedAt <= P.startDelay + DECISION_SLACK,
      RATE_MIN,
    );
  });

  it('choisit CAPTURE sur la neutre la plus proche sur au moins 95 % des seeds', () => {
    expectRate(results, (r) => r.mode === CAPTURE && r.target === r.nearIdx, RATE_MIN);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : hystérésis (verrou minCommit)', () => {
  // Cible A : neutre très lointaine (utilité ~0,4), seul candidat au départ. Cible B : planète ennemie proche dont
  // la tourelle est détruite juste après la première décision : B devient candidate, avec une utilité (~0,7, malgré
  // le coefficient d'ennemie et le bonus de leader) bien supérieure à celle de A même avec son commitBonus (x1,3).
  // Pendant minCommit le verrou (score infini) doit garder A ; ensuite B doit l'emporter, ce qui prouve que le
  // maintien observé vient du verrou et pas d'un meilleur score de A.
  const LOCK_WINDOW = P.minCommit - 0.2; // marge d'un demi-intervalle de décision : l'échéance exacte est ambiguë
  const A_IDX = 2;
  const B_IDX = 3;
  const results = runSeeds((seed, rng) => {
    const A = {
      ...polar(HOME, range(rng, 1900, 2100), range(rng, -0.5, -0.2)),
      radius: range(rng, 30, 60),
    };
    const B = {
      ...polar(HOME, range(rng, 300, 380), range(rng, -1.7, -1.3)),
      radius: range(rng, 30, 40),
      owner: 0,
      built: 1,
    };
    const world = makeWorld([HUMAN_HOME, botHome(), A, B], seed, [
      { planet: HUMAN },
      { planet: HOME_IDX },
    ]);
    const rec = newRecord();
    untilDecision(world, 4, rec);
    const ai = world.ai[0];
    const first = { mode: ai.mode, target: ai.target };
    const slot = world.planets[B_IDX].buildings[0];
    slot.built = false; // tourelle détruite : B n'est plus défendue
    slot.hp = 0;
    let lockBreaks = 0;
    play(world, LOCK_WINDOW, rec, (w) => {
      if (w.ai[0].mode !== CAPTURE || w.ai[0].target !== A_IDX) lockBreaks++;
    });
    let switchedAt = -1;
    play(world, 2, rec, (w) => {
      if (w.ai[0].mode !== CAPTURE || w.ai[0].target !== B_IDX) return false;
      switchedAt = timeOf(w);
      return true;
    });
    return { first, lockBreaks, switchedAt, rec };
  });

  it('choisit d abord A (seul candidat), en CAPTURE', () => {
    expectRate(results, (r) => r.first.mode === CAPTURE && r.first.target === A_IDX, RATE_MIN);
  });

  it('ne change ni de mode ni de cible pendant minCommit malgré le meilleur candidat B', () => {
    expectRate(results, (r) => r.lockBreaks === 0, RATE_MIN);
  });

  it('bascule sur B une fois le verrou levé (B était bien meilleure)', () => {
    expectRate(results, (r) => r.switchedAt >= 0, RATE_MIN);
  });

  it('aucun NaN, aucune mort', () => {
    expectRate(results, (r) => clean(r.rec), RATE_MIN);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : planète défendue', () => {
  // D est une planète ennemie proche (350..450 px) ; N une neutre plus loin (1000..1400 px). Défendue (tourelle
  // construite, ADR 0005 §2 : capture impossible), D ne doit jamais être cible de CAPTURE, ni la base humaine
  // (aussi défendue) ; le bot doit en revanche capturer N (le scénario n'est pas vide). Témoin : même carte avec
  // D sans tourelle, D (plus proche, ennemie : 0,8 x 1,2) est alors choisie.
  const D_IDX = 2;
  const N_IDX = 3;
  const build = (defended) => (seed, rng) => {
    const D = {
      ...polar(HOME, range(rng, 350, 450), range(rng, -1.4, -0.9)),
      radius: range(rng, 30, 45),
      owner: 0,
      built: defended ? 1 : 0,
    };
    const N = {
      ...polar(HOME, range(rng, 1000, 1400), range(rng, -0.5, -0.1)),
      radius: range(rng, 30, 60),
    };
    return makeWorld([HUMAN_HOME, botHome(), D, N], seed, [
      { planet: HUMAN },
      { planet: HOME_IDX },
    ]);
  };

  const defendedRuns = runSeeds((seed, rng) => {
    const world = build(true)(seed, rng);
    const rec = newRecord();
    let pickedDefended = 0;
    let pickedN = false;
    play(world, 25, rec, (w) => {
      const { mode, target } = w.ai[0];
      if (mode === CAPTURE && (target === D_IDX || target === HUMAN)) pickedDefended++;
      if (mode === CAPTURE && target === N_IDX) pickedN = true;
    });
    return { pickedDefended, pickedN, rec };
  });

  const controlRuns = runSeeds((seed, rng) => {
    const world = build(false)(seed, rng);
    untilDecision(world, 4, newRecord());
    return { mode: world.ai[0].mode, target: world.ai[0].target };
  });

  it('ne choisit jamais une planète défendue en CAPTURE (25 s)', () => {
    expectRate(defendedRuns, (r) => r.pickedDefended === 0, RATE_MIN);
  });

  it('capture bien la neutre à la place, sans dégât', () => {
    expectRate(defendedRuns, (r) => r.pickedN && clean(r.rec), RATE_MIN);
  });

  it('témoin : la même planète sans tourelle est choisie en CAPTURE', () => {
    expectRate(controlRuns, (r) => r.mode === CAPTURE && r.target === D_IDX, RATE_MIN);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : réarmement (REARM)', () => {
  // La base du bot a tourelle + usine à missiles (built: 2), le stock du vaisseau est à 0 (< rearmBelow).
  // MISSILE_REARM_TIME = 2 s par missile : 8 s pour remplir un stock de 4 une fois posé.
  const rearmWorld = (seed, planets, spawn) => {
    const world = makeWorld(planets, seed, [{ planet: HUMAN }, spawn]);
    world.ships[BOT].missiles = 0;
    return world;
  };

  describe('sans capture concurrente', () => {
    // Départ libre à 250..450 px de la base, vitesse <= 40 px/s : le bot passe 2 s sans pilote (mode NONE)
    // sous la portée de gravité (5 x rayon = 200 px depuis le centre) et ne tombe donc pas.
    const FULL_LIMIT = 30; // s : 2 (décision) + <= 15 (atterrissage) + 8 (4 missiles) + marge
    const results = runSeeds((seed, rng) => {
      const pos = polar(HOME, 40 + range(rng, 250, 450), range(rng, -1.5, -0.1));
      const heading = range(rng, -Math.PI, Math.PI);
      const speed = range(rng, 0, 40);
      const world = rearmWorld(seed, [HUMAN_HOME, botHome(2)], pos);
      const ship = world.ships[BOT];
      ship.vel.x = Math.cos(heading) * speed;
      ship.vel.y = Math.sin(heading) * speed;
      ship.angle = range(rng, -Math.PI, Math.PI);
      const rec = newRecord();
      const decidedAt = untilDecision(world, 4, rec);
      const first = { mode: world.ai[0].mode, target: world.ai[0].target };
      let fullAt = -1;
      let lastStock = ship.missiles;
      let stockDecreased = false;
      play(world, FULL_LIMIT + 5, rec, (w) => {
        const s = w.ships[BOT].missiles;
        if (s < lastStock || s > STOCK_MAX) stockDecreased = true;
        lastStock = s;
        if (fullAt < 0 && s === STOCK_MAX) fullAt = timeOf(w);
      });
      const ai = world.ai[0];
      return {
        decidedAt,
        first,
        fullAt,
        stockDecreased,
        final: { ...ai, landedOn: ship.landedOn },
        rec,
      };
    });

    it('choisit REARM sur la base à usine dès la première décision', () => {
      expectRate(results, (r) => r.first.mode === REARM && r.first.target === HOME_IDX, RATE_MIN);
    });

    it('le stock est rechargé à fond en moins de 30 s, sans jamais décroître', () => {
      expectRate(
        results,
        (r) => r.fullAt >= 0 && r.fullAt < FULL_LIMIT && !r.stockDecreased,
        RATE_MIN,
      );
    });

    it('une fois plein, repasse en IDLE posé sur sa base, sans dégât', () => {
      expectRate(
        results,
        (r) =>
          r.final.mode === IDLE &&
          r.final.target === HOME_IDX &&
          r.final.landedOn === HOME_IDX &&
          clean(r.rec),
        RATE_MIN,
      );
    });
  });

  describe('avec une capture en attente', () => {
    // Le bot démarre posé sur sa base avec un stock vide ; une neutre proche (250..400 px) vaut ~0,8 contre ~0,6
    // pour REARM : il capture d'abord, puis doit atteindre REARM sur la base à usine et s'y recharger.
    const REARM_BY = 45; // s : 2 + capture (~13) + retour (~13) + marge
    const FULL_BY = 75; // s : REARM_BY + atterrissage + 8 s de recharge
    const N_IDX = 2;
    const results = runSeeds((seed, rng) => {
      const N = {
        ...polar(HOME, range(rng, 250, 400), range(rng, -1.0, -0.2)),
        radius: range(rng, 30, 45),
      };
      const world = rearmWorld(seed, [HUMAN_HOME, botHome(2), N], { planet: HOME_IDX });
      const rec = newRecord();
      untilDecision(world, 4, rec);
      const first = { mode: world.ai[0].mode, target: world.ai[0].target };
      let rearmAt = -1;
      let capturedBeforeRearm = false;
      let fullAt = -1;
      play(world, FULL_BY, rec, (w) => {
        if (rearmAt < 0 && w.ai[0].mode === REARM && w.ai[0].target === HOME_IDX) {
          rearmAt = timeOf(w);
          capturedBeforeRearm = w.planets[N_IDX].owner === BOT;
        }
        if (fullAt < 0 && w.ships[BOT].missiles === STOCK_MAX) {
          fullAt = timeOf(w);
          return true;
        }
        return false;
      });
      return { first, rearmAt, capturedBeforeRearm, fullAt, rec };
    });

    it('commence par la capture (la recharge est en attente)', () => {
      expectRate(results, (r) => r.first.mode === CAPTURE && r.first.target === N_IDX, RATE_MIN);
    });

    it('atteint REARM sur la base à usine en moins de 45 s, après avoir capturé la neutre', () => {
      expectRate(
        results,
        (r) => r.rearmAt >= 0 && r.rearmAt < REARM_BY && r.capturedBeforeRearm,
        RATE_MIN,
      );
    });

    it('recharge ensuite le stock à fond en moins de 75 s, sans dégât', () => {
      expectRate(results, (r) => r.fullAt >= 0 && r.fullAt < FULL_BY && clean(r.rec), RATE_MIN);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : IDLE quand il n y a plus rien à capturer', () => {
  describe('aucune planète capturable (toutes défendues ou possédées)', () => {
    // Départ libre à 250..450 px de la base ; la seule autre planète est défendue. Le bot choisit IDLE, cible
    // = sa base, s'y pose puis y reste (landedOn stable), sans dégât.
    const LAND_BY = 25; // s
    const results = runSeeds((seed, rng) => {
      const pos = polar(HOME, 40 + range(rng, 250, 450), range(rng, -1.5, -0.1));
      const world = makeWorld([HUMAN_HOME, botHome()], seed, [{ planet: HUMAN }, pos]);
      const rec = newRecord();
      untilDecision(world, 4, rec);
      const first = { mode: world.ai[0].mode, target: world.ai[0].target };
      let landedAt = -1;
      let unlanded = 0;
      let modeChanges = 0;
      play(world, LAND_BY + 15, rec, (w) => {
        const ai = w.ai[0];
        if (ai.mode !== IDLE || ai.target !== HOME_IDX) modeChanges++;
        if (landedAt < 0) {
          if (w.ships[BOT].landedOn === HOME_IDX) landedAt = timeOf(w);
        } else if (w.ships[BOT].landedOn !== HOME_IDX) unlanded++;
      });
      return { first, landedAt, unlanded, modeChanges, hp: world.ships[BOT].hp, rec };
    });

    it('choisit IDLE avec pour cible sa propre planète', () => {
      expectRate(results, (r) => r.first.mode === IDLE && r.first.target === HOME_IDX, RATE_MIN);
    });

    it('se pose en moins de 25 s puis reste posé 15 s de plus, mode inchangé, sans dégât', () => {
      expectRate(
        results,
        (r) =>
          r.landedAt >= 0 &&
          r.landedAt < LAND_BY &&
          r.unlanded === 0 &&
          r.modeChanges === 0 &&
          r.hp === SHIP_MAX_HP &&
          clean(r.rec),
        RATE_MIN,
      );
    });
  });

  describe('après avoir capturé la dernière neutre', () => {
    // Une seule neutre : une fois capturée, plus rien à prendre (la base humaine est défendue). Le bot passe en
    // IDLE sur une planète possédée (la neutre qu il vient de prendre, la plus proche), posé dessus et stable.
    const N_IDX = 2;
    const IDLE_BY = 45; // s : 2 + atterrissage (~13) + capture (3) + marge
    const results = runSeeds((seed, rng) => {
      const N = {
        ...polar(HOME, range(rng, 350, 600), range(rng, -1.0, -0.2)),
        radius: range(rng, 30, 45),
      };
      const world = makeWorld([HUMAN_HOME, botHome(), N], seed, [
        { planet: HUMAN },
        { planet: HOME_IDX },
      ]);
      // Stock plein : la base du bot finit par construire une usine à missiles (vers 50 s), qui déclencherait REARM.
      world.ships[BOT].missiles = STOCK_MAX;
      const rec = newRecord();
      let idleAt = -1;
      let breaks = 0;
      let idleTarget = -1;
      play(world, 70, rec, (w) => {
        const ai = w.ai[0];
        if (idleAt < 0) {
          if (ai.mode !== IDLE) return false;
          idleAt = timeOf(w);
          idleTarget = ai.target;
          return false;
        }
        if (ai.mode !== IDLE || ai.target !== idleTarget || w.ships[BOT].landedOn !== idleTarget)
          breaks++;
        return false;
      });
      const ship = world.ships[BOT];
      return { idleAt, idleTarget, breaks, owner: world.planets[N_IDX].owner, hp: ship.hp, rec };
    });

    it('capture la neutre puis passe en IDLE avant 45 s, cible = planète possédée', () => {
      expectRate(
        results,
        (r) => r.owner === BOT && r.idleAt >= 0 && r.idleAt < IDLE_BY && r.idleTarget === N_IDX,
        RATE_MIN,
      );
    });

    it('reste ensuite posé sur sa cible en IDLE (stable), sans dégât ni NaN', () => {
      expectRate(
        results,
        (r) => r.idleAt >= 0 && r.breaks === 0 && r.hp === SHIP_MAX_HP && clean(r.rec),
        RATE_MIN,
      );
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : abandon et bannissement d une capture trop longue', () => {
  describe('capture forcée au-delà de giveUpTime', () => {
    // Une seule neutre N, lointaine. Dès la première décision (CAPTURE sur N) on force modeTime à
    // giveUpTime + 1 : à la décision suivante (<= 0,5 s) le bot doit abandonner, bannir (CAPTURE, N) pour banTime,
    // ne plus la reprendre pendant le bannissement, puis la reprendre dès qu il expire.
    const N_IDX = 2;
    const results = runSeeds((seed, rng) => {
      const N = {
        ...polar(HOME, range(rng, 600, 1200), range(rng, -0.8, -0.2)),
        radius: range(rng, 30, 60),
      };
      const world = makeWorld([HUMAN_HOME, botHome(), N], seed, [
        { planet: HUMAN },
        { planet: HOME_IDX },
      ]);
      const rec = newRecord();
      untilDecision(world, 4, rec);
      const ai = world.ai[0];
      const first = { mode: ai.mode, target: ai.target };
      ai.modeTime = P.giveUpTime + 1;
      let bannedAt = -1;
      play(world, P.decisionPeriod + 0.1, rec, (w) => {
        if (w.ai[0].banTimer <= 0) return false;
        bannedAt = timeOf(w);
        return true;
      });
      const afterBan = {
        mode: ai.mode,
        target: ai.target,
        banMode: ai.banMode,
        banTarget: ai.banTarget,
        banTimer: ai.banTimer,
      };
      let retakenDuringBan = 0;
      play(world, P.banTime + 5, rec, (w) => {
        const a = w.ai[0];
        if (a.banTimer > 0 && a.mode === CAPTURE && a.target === N_IDX) retakenDuringBan++;
        return a.banTimer <= 0;
      });
      let retakenAt = -1;
      play(world, P.decisionPeriod + 1, rec, (w) => {
        if (w.ai[0].mode !== CAPTURE || w.ai[0].target !== N_IDX) return false;
        retakenAt = timeOf(w);
        return true;
      });
      return { first, bannedAt, afterBan, retakenDuringBan, retakenAt, banEnd: timeOf(world), rec };
    });

    it('abandonne la capture au plus tard à la décision suivante et bannit (CAPTURE, N) pour banTime', () => {
      expectRate(results, (r) => r.first.mode === CAPTURE && r.first.target === N_IDX, RATE_MIN);
      expectRate(
        results,
        (r) =>
          r.bannedAt >= 0 &&
          r.afterBan.banMode === CAPTURE &&
          r.afterBan.banTarget === N_IDX &&
          // posé à la décision elle-même, avant tout décrément : égal à banTime à une fraction de pas près
          Math.abs(r.afterBan.banTimer - P.banTime) < FIXED_DT &&
          !(r.afterBan.mode === CAPTURE && r.afterBan.target === N_IDX),
        RATE_MIN,
      );
    });

    it('se replie en IDLE sur sa base et ne reprend pas N pendant le bannissement', () => {
      expectRate(
        results,
        (r) =>
          r.afterBan.mode === IDLE && r.afterBan.target === HOME_IDX && r.retakenDuringBan === 0,
        RATE_MIN,
      );
    });

    it('reprend N dès que le bannissement a expiré (un seul emplacement, temporaire)', () => {
      expectRate(results, (r) => r.retakenAt >= 0, RATE_MIN);
    });

    it('sans dégât ni NaN', () => {
      expectRate(results, (r) => clean(r.rec), RATE_MIN);
    });
  });

  describe('capture réellement bloquée par un autre vaisseau posé', () => {
    // Un vaisseau de la faction 2 (hors jeu : il ne capture jamais) est posé sur N dès le départ : le bot atterrit
    // aussi (capture contestée, `count !== 1`) et s obstine jusqu à giveUpTime (45 s après sa décision, vers 2 s),
    // puis abandonne vers 47,5 s. Sans modifier l état du bot.
    const N_IDX = 2;
    const results = runSeeds(
      (seed, rng) => {
        const N = {
          ...polar(HOME, range(rng, 350, 600), range(rng, -1.0, -0.2)),
          radius: range(rng, 30, 45),
        };
        const spawns = [{ planet: HUMAN }, { planet: HOME_IDX }, { planet: N_IDX }];
        const world = makeWorld([HUMAN_HOME, botHome(), N], seed, spawns, [BOT]);
        const rec = newRecord();
        let stillTrying = false;
        let bannedAt = -1;
        let retakenDuringBan = 0;
        let capturedByAnyone = false;
        play(world, 70, rec, (w) => {
          const ai = w.ai[0];
          const t = timeOf(w);
          if (w.planets[N_IDX].owner !== -1) capturedByAnyone = true;
          // À 40 s, le bot est toujours posé sur N en CAPTURE : il s'obstine (pas encore abandonné).
          if (t > 40 && t < 40 + FIXED_DT * 1.5)
            stillTrying =
              ai.mode === CAPTURE && ai.target === N_IDX && w.ships[BOT].landedOn === N_IDX;
          if (bannedAt < 0 && ai.banTimer > 0) bannedAt = t;
          if (bannedAt >= 0 && ai.banTimer > 0 && ai.mode === CAPTURE && ai.target === N_IDX)
            retakenDuringBan++;
        });
        return { stillTrying, bannedAt, retakenDuringBan, capturedByAnyone, rec };
      },
      SEEDS.slice(0, 10),
    );

    it('s obstine jusqu à ~40 s posé sur N sans que personne ne la capture', () => {
      expectRate(results, (r) => r.stillTrying && !r.capturedByAnyone, RATE_MIN);
    });

    it('abandonne entre 45 s et 55 s et ne retente pas N pendant le bannissement', () => {
      expectRate(
        results,
        (r) => r.bannedAt > P.giveUpTime && r.bannedAt < 55 && r.retakenDuringBan === 0,
        RATE_MIN,
      );
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA décision : buts posés à la main et faction hors jeu', () => {
  const N = { x: 900, y: 1000, radius: 40 };

  it('GOTO et LAND ne sont jamais remplacés par une décision (10 s, plusieurs décisions)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const manual of [GOTO, LAND]) {
        const world = makeWorld([HUMAN_HOME, botHome(), N], seed, [
          { planet: HUMAN },
          { planet: HOME_IDX },
        ]);
        const ai = world.ai[0];
        ai.mode = manual;
        ai.target = manual === LAND ? 2 : -1;
        ai.goalX = 600;
        ai.goalY = 1200;
        play(world, 10, newRecord(), (w) => {
          expect(w.ai[0].mode).toBe(manual);
          expect(w.ai[0].target).toBe(manual === LAND ? 2 : -1);
          return w.ai[0].mode !== manual;
        });
      }
    }
  });

  it('un bot dont la faction ne possède aucune planète n est jamais décidé ni piloté', () => {
    const world = makeWorld([HUMAN_HOME, N], 1, [{ planet: HUMAN }, { x: 600, y: 600 }]);
    play(world, 10, newRecord());
    expect(world.ai[0].mode).toBe(NONE);
    expect(world.ai[0].decisionTimer).toBe(P.startDelay); // jamais décrémenté
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Arène de développement avec deux bots (factions 1 et 2) et le joueur immobile sur sa base défendue.
const ARENA_SPAWNS = [{ planet: 0 }, { planet: 1 }, { planet: 2 }];
const ARENA = { ...arena, spawns: ARENA_SPAWNS };
const NEUTRALS = [3, 4, 5, 6, 7, 8];
const ownedByBots = (world) =>
  NEUTRALS.filter((i) => [1, 2].includes(world.planets[i].owner)).length;
const arenaWorld = (seed) => createWorld(ARENA, seed, { eventCapacity: 256, bots: [1, 2] });

describe('IA décision : bout en bout sur l arène (2 bots, 120 s)', () => {
  const E2E_SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const results = runSeeds((seed) => {
    const world = arenaWorld(seed);
    const rec = newRecord();
    play(world, 120, rec);
    return {
      owned: ownedByBots(world),
      rec,
      humanAlive: world.ships[0].alive,
      humanPlanets: world.planets.filter((p) => p.owner === 0).length,
    };
  }, E2E_SEEDS);

  it('au moins 5 des 6 neutres appartiennent aux bots après 120 s (>= 90 % des seeds)', () => {
    expectRate(results, (r) => r.owned >= 5, RATE_E2E);
  });

  it('aucune mort de bot, aucun NaN (>= 90 % des seeds)', () => {
    expectRate(results, (r) => !r.rec.died && !r.rec.nan, RATE_E2E);
  });

  it('le joueur immobile et sa base défendue ne sont pas touchés', () => {
    expectRate(results, (r) => r.humanAlive && r.humanPlanets === 1, RATE_E2E);
  });
});

describe('IA décision : déterminisme', () => {
  const STEPS = 1800;

  function replay(seed) {
    const world = arenaWorld(seed);
    for (let i = 0; i < STEPS; i++) step(world, FIXED_DT);
    return world;
  }

  it('deux exécutions de même seed donnent un monde identique après 1800 pas (seeds 1 à 5)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = replay(seed);
      expect(JSON.stringify(world)).toBe(JSON.stringify(replay(seed)));
      // Garde-fou : le scénario n'est pas trivial, les deux bots ont décidé, et l'aléa de décision vient de aiRng.
      expect(world.tick).toBe(STEPS);
      expect(world.ai.every((b) => b.mode !== NONE)).toBe(true);
      expect(world.aiRng.state).not.toBe(arenaWorld(seed).aiRng.state);
    }
  });

  it('des seeds différentes donnent des mondes différents (le bruit de décision est bien seedé)', () => {
    expect(JSON.stringify(replay(1))).not.toBe(JSON.stringify(replay(2)));
  });

  it('le monde reste JSON pur (aller-retour sans perte)', () => {
    const json = JSON.stringify(replay(1));
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
  });
});
