import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_COLLISION_RADIUS } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { hasDefenses } from '../../src/core/building.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Développement automatique (ADR 0005 §3) sur une mini-carte 4000×4000, sans vaisseau (aucune capture
// ni tir possible) : une planète r = 60 possédée par la faction 0, éventuellement d'autres.
// Chronologie nominale : slots 0 à 3 achevés aux temps cumulés 20, 50, 90, 135 s. Chaque durée est une
// somme de 1/60 qui peut valoir buildTime − 1e-13 (un pas de plus) : ±1 pas par slot, donc le
// cumul du slot n est tenu à ±(n + 1) pas.
const SIZE = 4000;
const RADIUS = 60;
const CUMULATIVE_SECONDS = [20, 50, 90, 135];
const CUMULATIVE_STEPS = CUMULATIVE_SECONDS.map((s) => Math.round(s / FIXED_DT));
const [TURRET, FACTORY, GENERATOR, HEAVY] = [0, 1, 2, 3];

const OWNED = { x: 1000, y: 2000, radius: RADIUS, owner: 0 };

function makeWorld(planets = [OWNED], { spawns = [], seed = 1 } = {}) {
  return createWorld({ width: SIZE, height: SIZE, planets, spawns }, seed, { eventCapacity: 64 });
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Avance de n pas ; renvoie tous les BUILT émis, avec le numéro de pas (1-indexé) et l'état des capacités. */
function run(world, n) {
  const built = [];
  for (let i = 0; i < n; i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    for (const e of eventsOf(world, EVT.BUILT)) {
      built.push({
        tick: world.tick,
        ...e,
        hasMissiles: world.factions[0].hasMissiles,
        hasShield: world.factions[0].hasShield,
      });
    }
  }
  return built;
}

describe('bâtiments : chronologie complète sur une planète possédée sans bâtiment', () => {
  const built = run(makeWorld(), 140 * 60);

  it('quatre BUILT, dans l’ordre du catalogue, tous sur la planète 0 au centre', () => {
    expect(built).toHaveLength(BUILDINGS.length);
    built.forEach((e, slot) => {
      expect(e).toMatchObject({ a: 0, b: slot, x: OWNED.x, y: OWNED.y });
    });
  });

  it.each(CUMULATIVE_SECONDS.map((s, i) => [i, s, CUMULATIVE_STEPS[i]]))(
    'slot %i construit à %i s cumulées (±1 pas par chantier)',
    (slot, _seconds, expectedStep) => {
      expect(Math.abs(built[slot].tick - expectedStep)).toBeLessThanOrEqual(slot + 1);
    },
  );

  it('chaque chantier dure buildTime (±1 pas), indépendamment des précédents', () => {
    let previous = 0;
    built.forEach((e, slot) => {
      expect(
        Math.abs(e.tick - previous - BUILDINGS[slot].buildTime / FIXED_DT),
      ).toBeLessThanOrEqual(1);
      previous = e.tick;
    });
  });

  it('hasMissiles vrai dès l’usine (au pas du BUILT), hasShield dès le générateur', () => {
    // Le résumé est recalculé après updateBuildings dans le même pas (ADR 0005 §8) : visible aussitôt.
    expect(built.map((e) => e.hasMissiles)).toEqual([false, true, true, true]);
    expect(built.map((e) => e.hasShield)).toEqual([false, false, true, true]);
  });

  it('capacités fausses avant leur slot, vraies après, pas à pas', () => {
    const world = makeWorld();
    for (let i = 0; i < 140 * 60; i++) {
      step(world, FIXED_DT);
      const f = world.factions[0];
      const slots = world.planets[0].buildings;
      // La capacité reflète exactement l'état des slots à chaque pas (aucun retard).
      expect(f.hasMissiles).toBe(slots[FACTORY].built);
      expect(f.hasShield).toBe(slots[GENERATOR].built);
      expect(f.planetCount).toBe(1);
    }
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[0].hasShield).toBe(true);
  });

  it('état final : tout construit, PV max des tourelles, buildProgress à 0 et plus aucun événement', () => {
    const world = makeWorld();
    run(world, 140 * 60);
    const p = world.planets[0];
    expect(p.buildings.every((s) => s.built)).toBe(true);
    expect(p.buildings[TURRET].hp).toBe(BUILDINGS[TURRET].hp);
    expect(p.buildings[HEAVY].hp).toBe(BUILDINGS[HEAVY].hp);
    expect(p.buildings[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp);
    expect(p.buildings[GENERATOR].hp).toBe(BUILDINGS[GENERATOR].hp);
    expect(p.buildProgress).toBe(0);
    expect(hasDefenses(p)).toBe(true);
    expect(run(world, 3000)).toHaveLength(0);
    expect(p.buildProgress).toBe(0);
  });

  it('hasDefenses devient vrai dès la tourelle de base (slot 0)', () => {
    const world = makeWorld();
    const p = world.planets[0];
    expect(hasDefenses(p)).toBe(false);
    run(world, CUMULATIVE_STEPS[TURRET] + 2);
    expect(hasDefenses(p)).toBe(true);
  });
});

describe('bâtiments : planète neutre', () => {
  it('reste figée 300 s : aucun bâtiment, aucune progression, aucun événement, état identique à l’octet', () => {
    const world = makeWorld([{ ...OWNED, owner: undefined }]);
    const before = JSON.stringify(world.planets);
    const built = run(world, 300 * 60);
    expect(built).toHaveLength(0);
    expect(JSON.stringify(world.planets)).toBe(before);
    expect(world.planets[0].buildProgress).toBe(0);
    expect(world.factions.every((f) => f.planetCount === 0 && !f.hasMissiles && !f.hasShield)).toBe(
      true,
    );
  });

  it('une neutre n’a aucun slot construit, même si la carte demande built: 2, et n’en construit pas', () => {
    const world = makeWorld([{ ...OWNED, owner: undefined, built: 2 }]);
    expect(world.planets[0].buildings.map((s) => s.built)).toEqual([false, false, false, false]);
    expect(run(world, 300 * 60)).toHaveLength(0);
    expect(world.planets[0].buildings.map((s) => s.built)).toEqual([false, false, false, false]);
    expect(world.planets[0].buildProgress).toBe(0);
  });

  it('une neutre dont deux slots sont forcés à la main n’en construit pas d’autres (300 s)', () => {
    const world = makeWorld([{ ...OWNED, owner: undefined }]);
    world.planets[0].buildings[TURRET].built = true;
    world.planets[0].buildings[FACTORY].built = true;
    expect(run(world, 300 * 60)).toHaveLength(0);
    expect(world.planets[0].buildings.map((s) => s.built)).toEqual([true, true, false, false]);
  });
});

describe('bâtiments : perte de la planète', () => {
  it('owner remis à −1 : capacités et planetCount retombent au pas suivant, le chantier se fige', () => {
    const world = makeWorld();
    run(world, CUMULATIVE_STEPS[GENERATOR] + 5); // usine et générateur construits
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[0].hasShield).toBe(true);
    expect(world.factions[0].planetCount).toBe(1);

    const progress = world.planets[0].buildProgress;
    world.planets[0].owner = -1;
    const built = run(world, 60 * 60);
    expect(world.factions[0].hasMissiles).toBe(false);
    expect(world.factions[0].hasShield).toBe(false);
    expect(world.factions[0].planetCount).toBe(0);
    expect(built).toHaveLength(0); // le chantier de la tourelle lourde ne progresse plus
    expect(world.planets[0].buildProgress).toBe(progress);
    expect(world.planets[0].buildings[HEAVY].built).toBe(false);
  });

  it('le propriétaire récupère la planète : les capacités reviennent et le chantier reprend où il en était', () => {
    const world = makeWorld();
    run(world, CUMULATIVE_STEPS[GENERATOR] + 600); // 10 s de chantier sur la tourelle lourde
    const progress = world.planets[0].buildProgress;
    expect(progress).toBeGreaterThan(9.9);
    world.planets[0].owner = -1;
    run(world, 600);
    world.planets[0].owner = 0;
    step(world, FIXED_DT);
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[0].hasShield).toBe(true);
    // Un pas de chantier de plus ; sommes de dt : erreur ≪ 1e-9.
    expect(world.planets[0].buildProgress).toBeCloseTo(progress + FIXED_DT, 9);
  });

  it('seule l’autre planète de la faction garde les capacités : une planète perdue ne retire rien si une autre a le slot', () => {
    const planets = [
      { ...OWNED, built: 2 }, // usine
      { x: 2500, y: 2000, radius: RADIUS, owner: 0, built: 2 }, // usine aussi
    ];
    const world = makeWorld(planets);
    expect(world.factions[0].hasMissiles).toBe(true);
    world.planets[0].owner = -1;
    step(world, FIXED_DT);
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[0].planetCount).toBe(1);
    world.planets[1].owner = 1;
    step(world, FIXED_DT);
    expect(world.factions[0].hasMissiles).toBe(false);
    // L'usine appartient désormais à la faction 1.
    expect(world.factions[1].hasMissiles).toBe(true);
  });
});

describe('bâtiments : slots déjà construits au départ', () => {
  it('built: 2 : tourelle et usine dès le pas 0 (hasMissiles vrai, pas de BUILT), puis générateur à 40 s, lourde à 85 s', () => {
    const world = makeWorld([{ ...OWNED, built: 2 }]);
    const p = world.planets[0];
    expect(p.buildings.map((s) => s.built)).toEqual([true, true, false, false]);
    expect(p.buildings[TURRET].hp).toBe(BUILDINGS[TURRET].hp);
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[0].hasShield).toBe(false);

    const built = run(world, 90 * 60);
    expect(built.map((e) => e.b)).toEqual([GENERATOR, HEAVY]);
    expect(Math.abs(built[0].tick - 40 * 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(built[1].tick - 85 * 60)).toBeLessThanOrEqual(2);
    expect(built.map((e) => e.hasShield)).toEqual([true, true]);
  });

  it('built: 1 : la première usine arrive à 30 s, pas à 50 s', () => {
    const world = makeWorld([{ ...OWNED, built: 1 }]);
    const built = run(world, 40 * 60);
    expect(built).toHaveLength(1);
    expect(built[0].b).toBe(FACTORY);
    expect(Math.abs(built[0].tick - 30 * 60)).toBeLessThanOrEqual(1);
  });

  it('plusieurs planètes se développent indépendamment, au même rythme', () => {
    const world = makeWorld([OWNED, { x: 2500, y: 2000, radius: RADIUS, owner: 1 }]);
    const built = run(world, 21 * 60);
    expect(built).toHaveLength(2);
    expect(built.map((e) => e.a).sort()).toEqual([0, 1]);
    expect(Math.abs(built[0].tick - built[1].tick)).toBeLessThanOrEqual(0);
  });
});

describe('bâtiments : déterminisme', () => {
  const STEPS = 3000;

  /** Trois planètes (possédée vide, possédée avec tourelle, neutre) et un vaisseau qui hoppe sur la neutre. */
  function simulate(seed) {
    const neutral = { x: 2800, y: 2000, radius: RADIUS };
    const world = makeWorld(
      [OWNED, { x: 1900, y: 800, radius: RADIUS, owner: 1, built: 1 }, neutral],
      {
        seed,
        spawns: [
          {
            x: neutral.x,
            y: neutral.y - (RADIUS + SHIP_COLLISION_RADIUS + 2),
            angle: -Math.PI / 2,
          },
        ],
      },
    );
    const ship = world.ships[0];
    ship.vel.y = 40;
    const log = [];
    for (let i = 0; i < STEPS; i++) {
      ship.intent.thrust = int(world.rng, 0, 300) === 0;
      clearEvents(world.events);
      step(world, FIXED_DT);
      for (let k = 0; k < world.events.count; k++) {
        const e = world.events.items[k];
        log.push([world.tick, e.type, e.a, e.b]);
      }
    }
    return { world, log };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(allFinite);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed : JSON identique après 3000 pas (état et journal), état fini', () => {
    const a = simulate(3);
    const b = simulate(3);
    expect(a.world.tick).toBe(STEPS);
    // 50 s : tourelle de la planète 0 (20 s), usine de la planète 1 (30 s), puis la planète neutre
    // éventuellement capturée par le vaisseau : au moins deux BUILT garantis.
    const builtEvents = a.log.filter((e) => e[1] === EVT.BUILT);
    expect(builtEvents.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null
  });

  it('le script de l’autre seed diffère (l’aléa influence bien la simulation)', () => {
    expect(JSON.stringify(simulate(3).log)).not.toBe(JSON.stringify(simulate(4).log));
  });
});
