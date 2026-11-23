import { describe, expect, it } from 'vitest';
import { BULLET_SPEED, FIXED_DT, MISSILE_STOCK_MAX } from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { fireControl, interceptTime } from '../../src/core/ai/combat.js';
import { hasDefenses } from '../../src/core/building.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createRng, range } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';
import { BOT_PROFILE as P } from '../../src/data/ai.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { arena } from '../../src/data/maps/arena.js';

const BOT = 1;
const HUMAN = 0;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_MIN = 0.95;
const MAP_W = 2400;
const MAP_H = 1600;
const { HUNT, ASSAULT } = AI_MODE;

const HUMAN_HOME = { x: 2250, y: 1450, radius: 40, owner: 0, built: 1 };
const botHome = (built = 0) => ({ x: 150, y: 1450, radius: 40, owner: BOT, built });
const HOME = { x: 150, y: 1450 };
const HUMAN_IDX = 0;
const HOME_IDX = 1;

const stepsOf = (seconds) => Math.round(seconds / FIXED_DT);
const timeOf = (world) => world.tick * FIXED_DT;
const polar = (origin, dist, angle) => ({
  x: origin.x + Math.cos(angle) * dist,
  y: origin.y + Math.sin(angle) * dist,
});

function makeWorld(planets, seed, spawns, bots = [BOT]) {
  return createWorld({ width: MAP_W, height: MAP_H, planets, spawns }, seed, {
    eventCapacity: 256,
    bots,
  });
}

function expectRate(results, predicate, min = RATE_MIN) {
  const failed = results.filter((r) => !predicate(r)).map((r) => r.seed);
  const rate = (results.length - failed.length) / results.length;
  expect(rate, `seeds en échec : [${failed.join(', ')}]`).toBeGreaterThanOrEqual(min);
}

const runSeeds = (fn, seeds = SEEDS) =>
  seeds.map((seed) => ({ seed, ...fn(seed, createRng(seed)) }));

const finite = (ship) =>
  [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle, ship.hp].every(Number.isFinite);

/**
 * Joue au plus `seconds` ; `hook(world)` est appelé après chaque pas (événements du pas encore lisibles), retourner
 * `true` arrête. Relève au passage les NaN et les morts de bot.
 */
function play(world, seconds, hook) {
  const rec = { nan: false, botDeaths: 0 };
  let botWasAlive = true;
  for (let i = 0; i < stepsOf(seconds); i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    if (!finite(world.ships[BOT])) rec.nan = true;
    if (botWasAlive && !world.ships[BOT].alive) rec.botDeaths++;
    botWasAlive = world.ships[BOT].alive;
    if (hook !== undefined && hook(world) === true) break;
  }
  rec.endTime = timeOf(world);
  return rec;
}

function eventsOf(world, type, fn) {
  for (let e = 0; e < world.events.count; e++) {
    const ev = world.events.items[e];
    if (ev.type === type) fn(ev);
  }
}

// ---------------------------------------------------------------------------------------------------------------
describe('IA combat : duel contre un vaisseau humain immobile', () => {
  // Le vaisseau humain flotte à 500..650 px de la base du bot (loin de toute gravité : 5 x rayon = 200 px) et ne tire
  // pas. Le bot (sans tourelle chez l'ennemi à portée, aucune neutre) doit passer en HUNT et l'abattre.
  const KILL_BY = 20;
  const duel = (missiles) => (seed, rng) => {
    const pos = polar(HOME, range(rng, 500, 650), range(rng, -1.4, -0.2));
    const world = makeWorld([HUMAN_HOME, botHome(missiles ? 2 : 0)], seed, [
      { planet: HUMAN_IDX },
      { planet: HOME_IDX },
    ]);
    const human = world.ships[HUMAN];
    human.pos.x = pos.x;
    human.pos.y = pos.y;
    human.landedOn = -1;
    world.ships[BOT].missiles = missiles ? MISSILE_STOCK_MAX : world.ships[BOT].missiles;
    let hunted = false;
    let killedAt = -1;
    let launches = 0;
    const rec = play(world, KILL_BY + 5, (w) => {
      if (w.ai[0].mode === HUNT && w.ai[0].target === HUMAN) hunted = true;
      eventsOf(w, EVT.MISSILE_LAUNCH, () => launches++);
      if (!w.ships[HUMAN].alive) {
        killedAt = timeOf(w);
        return true;
      }
      return false;
    });
    return { hunted, killedAt, launches, ...rec };
  };
  const bullets = runSeeds(duel(false));
  const withMissiles = runSeeds(duel(true));

  it('passe en HUNT sur le vaisseau humain', () => {
    expectRate(bullets, (r) => r.hunted);
  });

  it(`l abat en moins de ${KILL_BY} s sans mourir`, () => {
    expectRate(
      bullets,
      (r) => r.killedAt >= 0 && r.killedAt < KILL_BY && r.botDeaths === 0 && !r.nan,
    );
  });

  it('avec des missiles (usine + stock plein) : même résultat, et au moins un missile est lancé', () => {
    expectRate(withMissiles, (r) => r.killedAt >= 0 && r.killedAt < KILL_BY && r.botDeaths === 0);
    expectRate(withMissiles, (r) => r.launches >= 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA combat : assaut d une planète défendue', () => {
  const D_IDX = 2;
  const CAPTURE_BY = 60;
  const assault = (built, missiles) => (seed, rng) => {
    const D = {
      ...polar(HOME, range(rng, 700, 900), range(rng, -1.2, -0.5)),
      radius: range(rng, 35, 45),
      owner: 0,
      built,
    };
    const world = makeWorld([HUMAN_HOME, botHome(missiles ? 2 : 0), D], seed, [
      { planet: HUMAN_IDX },
      { planet: HOME_IDX },
    ]);
    if (missiles) world.ships[BOT].missiles = MISSILE_STOCK_MAX;
    const planet = world.planets[D_IDX];
    let capturedAt = -1;
    let assaulted = false;
    let destroyedTurrets = 0;
    let collateral = 0; // bâtiment non-tourelle détruit avant la capture
    let defenselessAt = -1;
    let nonTurretsIntact = true;
    let launches = 0;
    let minStock = Infinity;
    let shotsAfterDefenseless = 0; // tirs du bot une fois la planète sans tourelle (cessez-le-feu)
    const rec = play(world, CAPTURE_BY + 5, (w) => {
      if (w.ai[0].mode === ASSAULT && w.ai[0].target === D_IDX) assaulted = true;
      if (planet.owner === 0) {
        eventsOf(w, EVT.BUILDING_DESTROYED, (ev) => {
          if (ev.a !== D_IDX) return;
          if (BUILDINGS[ev.b].turret !== undefined) destroyedTurrets++;
          else collateral++;
        });
        if (defenselessAt < 0 && !hasDefenses(planet)) {
          defenselessAt = timeOf(w);
          for (let s = 0; s < BUILDINGS.length; s++)
            if (BUILDINGS[s].turret === undefined && s < built && !planet.buildings[s].built)
              nonTurretsIntact = false;
        }
      }
      eventsOf(w, EVT.MISSILE_LAUNCH, () => launches++);
      // Le coup qui détruit la tourelle est tiré dans le même pas, avant la destruction : seuls les pas suivants comptent.
      if (defenselessAt >= 0 && planet.owner === 0 && timeOf(w) > defenselessAt)
        eventsOf(w, EVT.SHOT, (ev) => {
          if (ev.a === BOT) shotsAfterDefenseless++;
        });
      if (assaulted && planet.owner !== 0) minStock = Math.min(minStock, w.ships[BOT].missiles);
      if (planet.owner === BOT) {
        capturedAt = timeOf(w);
        return true;
      }
      return false;
    });
    return {
      assaulted,
      capturedAt,
      destroyedTurrets,
      collateral,
      defenselessAt,
      nonTurretsIntact,
      shotsAfterDefenseless,
      launches,
      minStock,
      ...rec,
    };
  };
  const turretOnly = runSeeds(assault(1, false));
  const fullList = runSeeds(assault(BUILDINGS.length, false));
  const withMissiles = runSeeds(assault(BUILDINGS.length, true));

  for (const [name, results, turrets] of [
    ['une tourelle', turretOnly, 1],
    ['liste complète de bâtiments (tourelle, usine, bouclier, tourelle lourde)', fullList, 2],
    ['avec missiles', withMissiles, 2],
  ]) {
    describe(name, () => {
      it('passe en ASSAULT, détruit les tourelles puis capture en moins de 60 s, sans mourir', () => {
        expectRate(results, (r) => r.assaulted);
        expectRate(
          results,
          (r) =>
            r.capturedAt >= 0 &&
            r.capturedAt < CAPTURE_BY &&
            r.destroyedTurrets === turrets &&
            r.botDeaths === 0 &&
            !r.nan,
        );
      });
      it('cessez-le-feu : aucun bâtiment non-tourelle détruit avant la capture', () => {
        expectRate(
          results,
          (r) => r.collateral === 0 && r.nonTurretsIntact && r.shotsAfterDefenseless === 0,
        );
      });
    });
  }

  it('avec missiles : en lance et garde la réserve', () => {
    expectRate(withMissiles, (r) => r.launches >= 1 && r.minStock >= P.missileReserve);
  });
});

// ---------------------------------------------------------------------------------------------------------------
/** Bullets du bot absorbés par une planète moins de 0,1 s après leur tir : le bot a tiré dans le sol. */
const GROUND_SHOT_TICKS = 6;
function groundShotCounter(world) {
  const shotAt = new Map();
  return () => {
    let wasted = 0;
    eventsOf(world, EVT.SHOT, (ev) => {
      if (ev.a === BOT) shotAt.set(ev.b, world.tick);
    });
    eventsOf(world, EVT.BULLET_HIT, (ev) => {
      const at = shotAt.get(ev.b);
      if (at !== undefined && world.tick - at <= GROUND_SHOT_TICKS) wasted++;
      shotAt.delete(ev.b);
    });
    return wasted;
  };
}

describe('IA combat : pas de tir ami, pas de tir dans le sol', () => {
  describe('assaut avec ses propres planètes à proximité', () => {
    // Le bot possède sa base (tourelle) et une seconde planète B proche de la cible D ; il attaque D. Aucun de ses
    // tirs ne doit entamer ses planètes (les balles amies traversent le décompte de dégâts, ADR 0005) ni finir
    // dans le sol d'une planète qui n'est pas la cible.
    const D_IDX = 2;
    const B_IDX = 3;
    const results = runSeeds((seed, rng) => {
      const D = {
        ...polar(HOME, range(rng, 700, 800), range(rng, -1.2, -0.7)),
        radius: 40,
        owner: 0,
        built: 1,
      };
      const B = {
        ...polar(D, range(rng, 330, 380), range(rng, 0.2, 1.0)),
        radius: 35,
        owner: BOT,
        built: 1,
      };
      const world = makeWorld([HUMAN_HOME, botHome(1), D, B], seed, [
        { planet: HUMAN_IDX },
        { planet: HOME_IDX },
      ]);
      const wasted = groundShotCounter(world);
      let toOwnOrNeutral = 0;
      let shots = 0;
      let ownHit = false;
      const rec = play(world, 40, (w) => {
        eventsOf(w, EVT.SHOT, (ev) => {
          if (ev.a === BOT) shots++;
        });
        toOwnOrNeutral += wasted();
        if ([HOME_IDX, B_IDX].some((i) => w.planets[i].lastHitTick >= 0)) ownHit = true;
        return w.planets[D_IDX].owner === BOT;
      });
      const turretsIntact = [HOME_IDX, B_IDX].every(
        (i) => world.planets[i].buildings[0].hp === BUILDINGS[0].hp,
      );
      return {
        shots,
        toOwnOrNeutral,
        ownHit,
        turretsIntact,
        captured: world.planets[D_IDX].owner === BOT,
        ...rec,
      };
    });

    it('capture D en tirant beaucoup, sans jamais toucher ses planètes', () => {
      expectRate(results, (r) => r.captured && r.shots >= 10);
      expectRate(results, (r) => !r.ownHit && r.turretsIntact);
    });
    it('aucun tir n est absorbé par le sol juste après le départ du coup (hors cible)', () => {
      expectRate(results, (r) => r.toOwnOrNeutral === 0);
    });
  });
});

describe('IA combat : le tir ne part pas quand la ligne de tir est coupée par une planète', () => {
  // `fireControl` isolé sur une situation figée : le bot (HUNT, nez pile sur la cible, délai de réaction écoulé,
  // biais de visée nul) a un tir parfait ; seule la planète interposée varie. Le témoin sans planète prouve que le
  // tir part bien dans ce montage (sinon le test serait vide).
  const FIRE_ORIGIN = { x: 1000, y: 800 };
  const TARGET_DIST = 300; // < fireRange (380) ; balle de portée BULLET_SPEED * BULLET_LIFETIME = 512
  const world = (planet) => {
    const w = makeWorld(planet === undefined ? [HUMAN_HOME] : [HUMAN_HOME, planet], 1, [
      { x: FIRE_ORIGIN.x + TARGET_DIST, y: FIRE_ORIGIN.y },
      { x: FIRE_ORIGIN.x, y: FIRE_ORIGIN.y, angle: 0 },
    ]);
    const bot = w.ai[0];
    bot.mode = HUNT;
    bot.target = HUMAN;
    bot.fireDelay = 0;
    bot.aimBias = 0;
    return w;
  };
  const fires = (w) => {
    fireControl(w, w.ai[0], w.ships[BOT], w.ships[BOT].intent);
    return w.ships[BOT].intent.fire;
  };

  it('témoin : sans planète, le bot tire sur l ennemi aligné', () => {
    expect(fires(world(undefined))).toBe(true);
  });

  for (const [name, owner] of [
    ['neutre', -1],
    ['ennemie', 0],
    ['au bot lui-même (pas de tir ami sur sa planète)', BOT],
  ]) {
    it(`planète ${name} interposée : pas de tir`, () => {
      const w = world({ x: FIRE_ORIGIN.x + 150, y: FIRE_ORIGIN.y, radius: 40, owner, built: 0 });
      expect(fires(w)).toBe(false);
    });
  }

  it('nez dans une planète : le vaisseau posé qui vise à travers sa propre planète ne tire pas', () => {
    // Posé au sommet d'une planète (nez vers le bas), ennemi de l'autre côté : le canon pointe dans le sol.
    const planet = { x: 1000, y: 800, radius: 40, owner: BOT, built: 0 };
    const w = makeWorld([HUMAN_HOME, planet], 1, [{ x: 1000, y: 1000 }, { planet: 1 }]);
    const ship = w.ships[BOT];
    ship.landedOn = 1;
    ship.angle = Math.PI / 2;
    const bot = w.ai[0];
    bot.mode = HUNT;
    bot.target = HUMAN;
    bot.fireDelay = 0;
    bot.aimBias = 0;
    expect(fires(w)).toBe(false);
  });

  it('témoin du précédent : même pose, planète déplacée sur le côté, le tir part', () => {
    const planet = { x: 1300, y: 800, radius: 40, owner: BOT, built: 0 };
    const w = makeWorld([HUMAN_HOME, planet], 1, [{ x: 1000, y: 1000 }, { planet: 1 }]);
    const ship = w.ships[BOT];
    ship.landedOn = -1;
    ship.pos.x = 1000;
    ship.pos.y = 754;
    ship.angle = Math.PI / 2;
    const bot = w.ai[0];
    bot.mode = HUNT;
    bot.target = HUMAN;
    bot.fireDelay = 0;
    bot.aimBias = 0;
    expect(fires(w)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('IA combat : esquive des balles', () => {
  // Un « tireur d'élite » (faction 0, flottant, scripté) vise le bot à chaque pas avec avance parfaite (même
  // `interceptTime` que le bot) et tire dès que la cible est à portée de balle. Le bot passe en HUNT et riposte.
  // On compare le profil réel (esquive des balles) au même profil sans esquive : sur les mêmes seeds, l'esquive doit
  // faire encaisser moins de dégâts avant la fin du duel (mort du tireur, mort du bot ou 25 s).
  const SNIPER_RANGE = 480; // < portée de balle (512) : on ne tire que quand la balle peut arriver
  const DUEL_TIME = 25;
  const sniperStep = (world) => {
    const sniper = world.ships[HUMAN];
    const bot = world.ships[BOT];
    const dx = bot.pos.x - sniper.pos.x;
    const dy = bot.pos.y - sniper.pos.y;
    const t = interceptTime(
      dx,
      dy,
      bot.vel.x - sniper.vel.x,
      bot.vel.y - sniper.vel.y,
      BULLET_SPEED,
    );
    sniper.intent.fire = false;
    if (t < 0 || Math.hypot(dx, dy) > SNIPER_RANGE) return;
    sniper.angle = Math.atan2(
      dy + (bot.vel.y - sniper.vel.y) * t,
      dx + (bot.vel.x - sniper.vel.x) * t,
    );
    sniper.intent.fire = true;
  };

  // `lowHealth = 0` neutralise le repli (RETREAT) : sinon un bot blessé fuit au lieu de combattre, et la comparaison
  // mélangerait l'esquive avec la décision de fuir (RETREAT n'est pas désactivable par son poids : son score urgent
  // préempte tout). Seule l'esquive des balles varie entre les deux séries ; le repli est couvert par
  // ai-defense.test.js.
  function duelAgainstSniper(dodge) {
    const saved = { dodgeBullets: P.dodgeBullets, lowHealth: P.lowHealth };
    P.dodgeBullets = dodge;
    P.lowHealth = 0;
    try {
      return runSeeds((seed, rng) => {
        const pos = polar(HOME, range(rng, 600, 680), range(rng, -1.4, -0.2));
        const world = makeWorld([HUMAN_HOME, botHome()], seed, [
          { planet: HUMAN_IDX },
          { planet: HOME_IDX },
        ]);
        const sniper = world.ships[HUMAN];
        sniper.pos.x = pos.x;
        sniper.pos.y = pos.y;
        sniper.landedOn = -1;
        let damage = 0;
        const rec = play(world, DUEL_TIME, (w) => {
          eventsOf(w, EVT.SHIP_HIT, (ev) => {
            if (ev.a === BOT) damage += ev.b;
          });
          if (!w.ships[HUMAN].alive || !w.ships[BOT].alive) return true;
          sniperStep(w);
          return false;
        });
        return { damage, sniperDead: !world.ships[HUMAN].alive, ...rec };
      });
    } finally {
      Object.assign(P, saved);
    }
  }
  const mean = (rs) => rs.reduce((a, r) => a + r.damage, 0) / rs.length;
  const dodging = duelAgainstSniper(true);
  const passive = duelAgainstSniper(false);

  it('le profil de bot est restauré après la comparaison', () => {
    expect(P.dodgeBullets).toBe(true);
    expect(P.lowHealth).toBeGreaterThan(0);
  });

  it('esquivant, le bot encaisse moins de dégâts en moyenne que sans esquive', () => {
    expect(mean(dodging)).toBeLessThan(mean(passive));
  });

  it('esquivant, le bot meurt nettement moins souvent que sans esquive', () => {
    // Mesuré sur les seeds 1 à 20 (repli neutralisé) : 15 morts avec esquive contre 20 sans (un tireur à visée parfaite
    // reste redoutable). On exige un écart d'au moins 3 seeds, en deçà du mesuré (5), pour ne pas dépendre d'une seule seed.
    const deaths = (rs) => rs.filter((r) => r.botDeaths > 0).length;
    expect(deaths(passive) - deaths(dodging)).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
const ARENA = { ...arena, spawns: [{ planet: 0 }, { planet: 1 }, { planet: 2 }] };
const arenaWorld = (seed) => createWorld(ARENA, seed, { eventCapacity: 256, bots: [1, 2] });

describe('IA combat : robustesse et déterminisme sur l arène (bots 1 et 2 qui se combattent)', () => {
  const STEPS = 1800;

  function replay(seed) {
    const world = arenaWorld(seed);
    let shots = 0;
    for (let i = 0; i < STEPS; i++) {
      clearEvents(world.events);
      step(world, FIXED_DT);
      eventsOf(world, EVT.SHOT, () => shots++);
    }
    return { world, shots };
  }

  it('deux exécutions de même seed donnent un monde JSON identique après 1800 pas (seeds 1 à 5)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = replay(seed);
      const b = replay(seed);
      expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
      expect(a.shots).toBe(b.shots);
      expect(a.shots).toBeGreaterThan(0); // le scénario n'est pas vide : les bots se tirent dessus
    }
  });

  it('120 s à deux bots : aucun NaN, positions finies et dans la carte, PV dans les bornes', () => {
    const results = runSeeds((seed) => {
      const world = arenaWorld(seed);
      let bad = false;
      play(world, 120, (w) => {
        for (const ship of w.ships) {
          if (!finite(ship) || ship.hp < 0 || ship.hp > 60) bad = true;
          if (
            ship.alive &&
            (ship.pos.x < 0 || ship.pos.x > w.width || ship.pos.y < 0 || ship.pos.y > w.height)
          )
            bad = true;
        }
        for (const proj of w.projectiles) {
          if (proj.active && !Number.isFinite(proj.pos.x + proj.pos.y + proj.vel.x + proj.vel.y))
            bad = true;
        }
        return bad;
      });
      return { bad };
    });
    expect(results.filter((r) => r.bad).map((r) => r.seed)).toEqual([]);
  });
});
