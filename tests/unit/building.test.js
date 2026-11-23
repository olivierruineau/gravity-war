import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import {
  damageBuilding,
  hasDefenses,
  resetBuildings,
  updateBuildings,
} from '../../src/core/building.js';
import { clearEvents, createEvents, EVT } from '../../src/core/events.js';
import { createPlanet } from '../../src/core/planet.js';
import { createWorld } from '../../src/core/world.js';

// Slots du catalogue (ADR 0005 §3) : 0 tourelle, 1 usine, 2 générateur, 3 tourelle lourde.
const TURRET = 0;
const FACTORY = 1;
const GENERATOR = 2;
const HEAVY = 3;
const X = 120;
const Y = 340;

// dt = 0,5 est exact en binaire : les cumuls de `buildProgress` n'ont aucune erreur d'arrondi, les
// durées se comptent donc au pas près sans tolérance (buildTime / 0,5 pas exactement).
const DT = 0.5;

function makePlanet(def = {}) {
  return createPlanet({ x: X, y: Y, radius: 50, owner: 0, ...def });
}

/** `updateBuildings` ne lit que `planets` et `events` : un mini-monde suffit (aucune logique mockée). */
function makeWorld(planets) {
  return { planets, events: createEvents(32) };
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Avance par pas de `dt` jusqu'au premier BUILT ; renvoie { steps, event }. */
function stepUntilBuilt(world, dt, maxSteps) {
  for (let steps = 1; steps <= maxSteps; steps++) {
    clearEvents(world.events);
    updateBuildings(world, dt);
    const built = eventsOf(world, EVT.BUILT);
    if (built.length > 0) return { steps, event: built[0] };
  }
  throw new Error('aucun BUILT dans le délai : scénario invalide');
}

describe('hasDefenses', () => {
  it('planète vierge : faux', () => {
    expect(hasDefenses(makePlanet())).toBe(false);
  });

  it('slot 0 construit (tourelle) : vrai', () => {
    expect(hasDefenses(makePlanet({ built: 1 }))).toBe(true);
  });

  it('usine seule : faux', () => {
    const p = makePlanet();
    p.buildings[FACTORY].built = true;
    expect(hasDefenses(p)).toBe(false);
  });

  it('usine et générateur seuls : faux', () => {
    const p = makePlanet();
    p.buildings[FACTORY].built = true;
    p.buildings[GENERATOR].built = true;
    expect(hasDefenses(p)).toBe(false);
  });

  it('tourelle lourde seule (tourelle de base détruite) : vrai', () => {
    const p = makePlanet();
    p.buildings[HEAVY].built = true;
    expect(hasDefenses(p)).toBe(true);
  });

  it('tout construit : vrai ; tourelles détruites mais usine et générateur debout : faux', () => {
    const p = makePlanet({ built: BUILDINGS.length });
    expect(hasDefenses(p)).toBe(true);
    p.buildings[TURRET].built = false;
    expect(hasDefenses(p)).toBe(true); // la lourde suffit
    p.buildings[HEAVY].built = false;
    expect(hasDefenses(p)).toBe(false);
  });

  it('ne dépend que de `built`, pas des PV', () => {
    const p = makePlanet();
    p.buildings[TURRET].hp = 80; // PV sans `built` : pas une défense
    expect(hasDefenses(p)).toBe(false);
    p.buildings[TURRET].built = true;
    p.buildings[TURRET].hp = 0;
    expect(hasDefenses(p)).toBe(true);
  });
});

describe('resetBuildings', () => {
  it('remet tous les slots à false / 0 / 0 et buildProgress à 0', () => {
    const p = makePlanet({ built: BUILDINGS.length });
    p.buildings[TURRET].cooldown = 0.7;
    p.buildProgress = 12.5;
    resetBuildings(p);
    for (const slot of p.buildings) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
    expect(p.buildProgress).toBe(0);
    expect(hasDefenses(p)).toBe(false);
  });

  it('conserve le nombre de slots, le propriétaire et la position', () => {
    const p = makePlanet({ built: 2 });
    resetBuildings(p);
    expect(p.buildings).toHaveLength(BUILDINGS.length);
    expect(p.owner).toBe(0);
    expect(p.pos).toEqual({ x: X, y: Y });
  });

  it('idempotent sur une planète vierge', () => {
    const p = makePlanet();
    const before = JSON.stringify(p);
    resetBuildings(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('updateBuildings : planète neutre', () => {
  it('ne se développe jamais : 1000 s sans progression ni événement', () => {
    const p = makePlanet({ owner: -1 });
    const world = makeWorld([p]);
    for (let i = 0; i < 2000; i++) updateBuildings(world, DT);
    expect(p.buildProgress).toBe(0);
    expect(p.buildings.every((s) => !s.built)).toBe(true);
    expect(world.events.count).toBe(0);
  });
});

describe('updateBuildings : planète possédée', () => {
  it('buildProgress avance de dt à chaque pas, sans événement avant buildTime', () => {
    const p = makePlanet();
    const world = makeWorld([p]);
    for (let i = 1; i < BUILDINGS[TURRET].buildTime / DT; i++) {
      updateBuildings(world, DT);
      expect(p.buildProgress).toBe(i * DT); // sommes exactes en binaire
    }
    expect(world.events.count).toBe(0);
    expect(p.buildings[TURRET].built).toBe(false);
  });

  it('à buildTime : tourelle construite à PV max, BUILT (planète, slot, centre), progression remise à 0', () => {
    const p = makePlanet();
    const world = makeWorld([p]);
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(steps).toBe(BUILDINGS[TURRET].buildTime / DT);
    expect(p.buildings[TURRET]).toEqual({
      built: true,
      hp: BUILDINGS[TURRET].hp,
      cooldown: 0,
    });
    expect(p.buildProgress).toBe(0);
    expect(event).toMatchObject({ type: EVT.BUILT, a: 0, b: TURRET, x: X, y: Y });
    expect(world.events.count).toBe(1);
    // Le chantier suivant est vierge.
    expect(p.buildings[FACTORY].built).toBe(false);
  });

  it('l’index de planète de BUILT est celui de la planète dans world.planets', () => {
    const planets = [makePlanet({ owner: -1 }), makePlanet({ x: 900, y: 50, owner: 1 })];
    const world = makeWorld(planets);
    const { event } = stepUntilBuilt(world, DT, 1000);
    expect(event).toMatchObject({ a: 1, b: TURRET, x: 900, y: 50 });
  });

  it('enchaîne les slots dans l’ordre du catalogue avec la durée de chacun', () => {
    const p = makePlanet();
    const world = makeWorld([p]);
    const built = [];
    for (let slot = 0; slot < BUILDINGS.length; slot++) {
      const { steps, event } = stepUntilBuilt(world, DT, 1000);
      expect(event.b).toBe(slot);
      expect(steps).toBe(BUILDINGS[slot].buildTime / DT);
      built.push(p.buildings[slot].built);
    }
    expect(built).toEqual([true, true, true, true]);
    expect(p.buildings[HEAVY].hp).toBe(BUILDINGS[HEAVY].hp);
    // Usine et générateur : pas de PV.
    expect(p.buildings[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp);
    expect(p.buildings[GENERATOR].hp).toBe(BUILDINGS[GENERATOR].hp);
  });

  it('au pas FIXED_DT : la tourelle arrive à buildTime / FIXED_DT pas, à ±1 près', () => {
    // 1200 additions de 1/60 : l'arrondi flottant peut décaler l'échéance d'un pas.
    const world = makeWorld([makePlanet()]);
    const { steps } = stepUntilBuilt(world, FIXED_DT, 2000);
    expect(Math.abs(steps - BUILDINGS[TURRET].buildTime / FIXED_DT)).toBeLessThanOrEqual(1);
  });

  it('un grand dt qui dépasse buildTime construit un seul slot par appel (le surplus est perdu)', () => {
    // Comportement actuel : buildProgress est remis à 0, pas à (progress − buildTime).
    const p = makePlanet();
    const world = makeWorld([p]);
    updateBuildings(world, 100);
    expect(p.buildings.filter((s) => s.built)).toHaveLength(1);
    expect(p.buildProgress).toBe(0);
    expect(eventsOf(world, EVT.BUILT)).toHaveLength(1);
  });
});

describe('updateBuildings : tout construit', () => {
  it('plus aucune progression ni événement', () => {
    const p = makePlanet({ built: BUILDINGS.length });
    const world = makeWorld([p]);
    const before = JSON.stringify(p);
    for (let i = 0; i < 1000; i++) updateBuildings(world, DT);
    expect(world.events.count).toBe(0);
    expect(p.buildProgress).toBe(0);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('updateBuildings : slots déjà construits au départ', () => {
  it('built: 1 : le chantier commence au slot 1 (usine, 30 s)', () => {
    const p = makePlanet({ built: 1 });
    const world = makeWorld([p]);
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(event.b).toBe(FACTORY);
    expect(steps).toBe(BUILDINGS[FACTORY].buildTime / DT);
    // La tourelle de départ n'a pas été retouchée.
    expect(p.buildings[TURRET]).toEqual({
      built: true,
      hp: BUILDINGS[TURRET].hp,
      cooldown: 0,
    });
  });

  it('built: 3 : seul le slot 3 (tourelle lourde) reste à construire', () => {
    const p = makePlanet({ built: 3 });
    const world = makeWorld([p]);
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(event.b).toBe(HEAVY);
    expect(steps).toBe(BUILDINGS[HEAVY].buildTime / DT);
  });
});

describe('updateBuildings : tourelle détruite', () => {
  it('redevient le premier chantier, avant les slots non construits qui la suivent', () => {
    // Usine construite, tourelle détruite : slots 0 (détruit) puis 2 et 3 non construits.
    const p = makePlanet({ built: 2 });
    p.buildings[TURRET].built = false;
    p.buildings[TURRET].hp = 0;
    const world = makeWorld([p]);
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(event.b).toBe(TURRET);
    expect(steps).toBe(BUILDINGS[TURRET].buildTime / DT);
    expect(p.buildings[TURRET].hp).toBe(BUILDINGS[TURRET].hp);
    expect(p.buildings[FACTORY].built).toBe(true); // intacte
    expect(p.buildings[GENERATOR].built).toBe(false); // pas commencée avant la reconstruction
  });

  it('en plein chantier du slot 2 : la tourelle détruite passe devant, avec le temps déjà cumulé', () => {
    const p = makePlanet({ built: 2 });
    const world = makeWorld([p]);
    for (let i = 0; i < 20; i++) updateBuildings(world, DT); // 10 s sur le générateur (40 s)
    expect(p.buildProgress).toBe(10);
    p.buildings[TURRET].built = false;
    p.buildings[TURRET].hp = 0;
    p.buildProgress = 0; // c'est damageBuilding qui remet le chantier à zéro (ADR 0005 §4), pas updateBuildings
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(event.b).toBe(TURRET);
    expect(steps).toBe(BUILDINGS[TURRET].buildTime / DT);
    // Ensuite le chantier reprend sur le générateur, de zéro.
    expect(p.buildings[GENERATOR].built).toBe(false);
    const next = stepUntilBuilt(world, DT, 1000);
    expect(next.event.b).toBe(GENERATOR);
    expect(next.steps).toBe(BUILDINGS[GENERATOR].buildTime / DT);
  });

  it('tourelle lourde détruite sur une planète complète : reconstruite en 45 s, rien d’autre ne bouge', () => {
    const p = makePlanet({ built: BUILDINGS.length });
    p.buildings[HEAVY].built = false;
    p.buildings[HEAVY].hp = 0;
    const world = makeWorld([p]);
    const { steps, event } = stepUntilBuilt(world, DT, 1000);
    expect(event.b).toBe(HEAVY);
    expect(steps).toBe(BUILDINGS[HEAVY].buildTime / DT);
    expect(p.buildings.every((s) => s.built)).toBe(true);
  });
});

describe('updateBuildings : plusieurs planètes indépendantes', () => {
  it('chaque planète possédée avance seule ; la neutre reste figée', () => {
    const a = makePlanet({ built: 1 });
    const b = makePlanet({ x: 900, owner: 1 });
    const n = makePlanet({ x: 1700, owner: -1 });
    const world = makeWorld([a, b, n]);
    for (let i = 0; i < 20 / DT; i++) updateBuildings(world, DT);
    // À 20 s : b achève sa tourelle (BUILT émis une fois), a a 20 s sur 30 d'avancement.
    expect(b.buildings[TURRET].built).toBe(true);
    expect(a.buildProgress).toBe(20);
    expect(a.buildings[FACTORY].built).toBe(false);
    expect(n.buildProgress).toBe(0);
    const built = eventsOf(world, EVT.BUILT);
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ a: 1, b: TURRET, x: 900, y: Y });
  });
});

/** Monde réel à une planète (500, 500, r = 40) possédée par la faction 0 : `damageBuilding` lit `world.planets` et `world.events`. */
function makeOwnedWorld({ owner = 0, built = 1, seed = 1 } = {}) {
  return createWorld(
    { width: 2000, height: 2000, planets: [{ x: 500, y: 500, radius: 40, owner, built }] },
    seed,
    { eventCapacity: 512 },
  );
}

/** État de la planète hors `lastHitTick`, écrit en entrée de `damageBuilding` même quand rien d'autre ne change (ADR 0006). */
function stateOf(planet) {
  return JSON.stringify({ ...planet, lastHitTick: 0 });
}

describe('damageBuilding', () => {
  const HP = BUILDINGS[0].hp; // 80

  it('retire les dégâts au premier slot tourelle construit, sans événement tant qu’il reste des PV', () => {
    const world = makeOwnedWorld();
    damageBuilding(world, 0, 10, 1, 2);
    expect(world.planets[0].buildings[0].hp).toBe(HP - 10);
    expect(world.planets[0].buildings[0].built).toBe(true);
    expect(world.events.count).toBe(0);
  });

  it('à 0 PV : built = false, hp = 0, buildProgress = 0, BUILDING_DESTROYED (a = planète, b = slot)', () => {
    const world = makeOwnedWorld();
    world.planets[0].buildProgress = 12.5;
    damageBuilding(world, 0, HP, 123, 456);
    const slot = world.planets[0].buildings[0];
    expect(slot.built).toBe(false);
    expect(slot.hp).toBe(0);
    expect(world.planets[0].buildProgress).toBe(0);
    expect(world.events.count).toBe(1);
    expect(world.events.items[0]).toMatchObject({
      type: EVT.BUILDING_DESTROYED,
      x: 123,
      y: 456,
      a: 0,
      b: 0,
    });
  });

  it('PV − 1 : la tourelle survit avec 1 PV ; un dégât de plus la détruit', () => {
    const world = makeOwnedWorld();
    damageBuilding(world, 0, HP - 1, 0, 0);
    expect(world.planets[0].buildings[0]).toMatchObject({ built: true, hp: 1 });
    expect(world.events.count).toBe(0);
    damageBuilding(world, 0, 1, 0, 0);
    expect(world.planets[0].buildings[0]).toMatchObject({ built: false, hp: 0 });
  });

  it('un dégât excessif détruit sans PV négatifs, un seul événement', () => {
    const world = makeOwnedWorld();
    damageBuilding(world, 0, 10 * HP, 0, 0);
    expect(world.planets[0].buildings[0].hp).toBe(0);
    expect(eventsOf(world, EVT.BUILDING_DESTROYED)).toHaveLength(1);
  });

  it('cumule les coups : 7 balles de 12 détruisent, 6 laissent 8 PV', () => {
    const world = makeOwnedWorld();
    for (let i = 0; i < 6; i++) damageBuilding(world, 0, 12, 0, 0);
    expect(world.planets[0].buildings[0].hp).toBe(HP - 72);
    expect(world.events.count).toBe(0);
    damageBuilding(world, 0, 12, 0, 0);
    expect(world.planets[0].buildings[0].built).toBe(false);
    expect(world.events.count).toBe(1);
  });

  it('la tourelle lourde n’est touchée qu’après la destruction de la tourelle de base', () => {
    const world = makeOwnedWorld({ built: 4 });
    const heavy = world.planets[0].buildings[HEAVY];
    expect(heavy.hp).toBe(BUILDINGS[HEAVY].hp);
    damageBuilding(world, 0, HP - 1, 0, 0);
    expect(heavy.hp).toBe(BUILDINGS[HEAVY].hp); // base à 1 PV : la lourde est intacte
    damageBuilding(world, 0, 1, 0, 0); // base détruite
    expect(world.planets[0].buildings[0].built).toBe(false);
    expect(heavy).toMatchObject({ built: true, hp: BUILDINGS[HEAVY].hp });
    damageBuilding(world, 0, 20, 0, 0); // maintenant la lourde encaisse
    expect(heavy.hp).toBe(BUILDINGS[HEAVY].hp - 20);
  });

  it('détruire la lourde : BUILDING_DESTROYED avec b = 3 et la planète n’a plus de tourelle', () => {
    const world = makeOwnedWorld({ built: 4 });
    damageBuilding(world, 0, HP, 0, 0);
    clearEvents(world.events);
    damageBuilding(world, 0, BUILDINGS[HEAVY].hp, 5, 6);
    expect(world.events.items[0]).toMatchObject({
      type: EVT.BUILDING_DESTROYED,
      a: 0,
      b: HEAVY,
    });
    expect(world.planets[0].buildings[HEAVY]).toMatchObject({ built: false, hp: 0 });
    // Usine et générateur construits (built: 4) : intacts, la destruction n'en touche qu'un.
    expect(world.planets[0].buildings[1].built).toBe(true);
    expect(world.planets[0].buildings[2].built).toBe(true);
  });

  it('sans tourelle construite : rien (ni PV, ni événement, ni chantier touché)', () => {
    const world = makeOwnedWorld({ built: 0 });
    world.planets[0].buildProgress = 7;
    const before = stateOf(world.planets[0]);
    damageBuilding(world, 0, 50, 0, 0);
    expect(stateOf(world.planets[0])).toBe(before);
    expect(world.events.count).toBe(0);
  });

  it('sans tourelle, les bâtiments non tourelles sont ciblés (usine seule construite, ADR 0007)', () => {
    const world = makeOwnedWorld({ built: 0 });
    world.planets[0].buildings[1].built = true;
    world.planets[0].buildings[1].hp = BUILDINGS[1].hp;
    damageBuilding(world, 0, 1000, 0, 0);
    expect(world.planets[0].buildings[1]).toMatchObject({ built: false, hp: 0 });
    expect(eventsOf(world, EVT.BUILDING_DESTROYED)).toHaveLength(1);
  });

  it('une planète autre que celle visée n’est pas touchée', () => {
    const world = createWorld(
      {
        width: 2000,
        height: 2000,
        planets: [
          { x: 200, y: 200, radius: 30, owner: 0, built: 1 },
          { x: 900, y: 900, radius: 30, owner: 0, built: 1 },
        ],
      },
      1,
      { eventCapacity: 8 },
    );
    damageBuilding(world, 1, 10, 0, 0);
    expect(world.planets[0].buildings[0].hp).toBe(HP);
    expect(world.planets[1].buildings[0].hp).toBe(HP - 10);
  });
});
