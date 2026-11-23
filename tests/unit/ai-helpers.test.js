import { describe, expect, it } from 'vitest';
import {
  AI_RNG_SALT,
  EVENT_CAPACITY,
  FACTION_COUNT,
  MISSILE_SEEK_ANGLE,
  MISSILE_SEEK_RANGE,
} from '../../src/config.js';
import { BOT_PROFILE } from '../../src/data/ai.js';
import { createBotState, AI_MODE } from '../../src/core/ai/bot.js';
import { defenseRange, damageBuilding, hasMissileFactory } from '../../src/core/building.js';
import { createPlanet } from '../../src/core/planet.js';
import { findMissileTarget } from '../../src/core/missile.js';
import { createWorld } from '../../src/core/world.js';

// Aides de l'IA et de la défense, sans Phaser ni DOM. Tous les aléas sont seedés (seed 1).

const EPS = 1e-3; // marge angulaire / radiale pour tester « juste dedans / juste dehors »
const ORIGIN = { x: 1000, y: 1000 };
const HEADING = 0; // cap vers +x

/** Vaisseau minimal : seuls alive, faction et pos sont lus par findMissileTarget. */
function ship(faction, x, y, alive = true) {
  return { faction, alive, pos: { x, y } };
}

/** Point à `dist` de l’origine, à l’écart angulaire `offset` du cap HEADING. */
function at(dist, offset = 0) {
  return ship(
    1,
    ORIGIN.x + Math.cos(HEADING + offset) * dist,
    ORIGIN.y + Math.sin(HEADING + offset) * dist,
  );
}

function find(ships, faction = 0, heading = HEADING) {
  return findMissileTarget(ships, ORIGIN.x, ORIGIN.y, heading, faction);
}

// Monde réel avec trois factions (spawns aux positions fixes), pour les tests de createWorld et de damageBuilding.
function makeWorld({ bots, planets = [], spawns } = {}) {
  return createWorld(
    {
      width: 4000,
      height: 4000,
      planets,
      spawns: spawns ?? [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 500, y: 100 },
      ],
    },
    1,
    { eventCapacity: EVENT_CAPACITY, bots },
  );
}

describe('findMissileTarget : sélection de la cible', () => {
  it('aucun vaisseau : −1', () => {
    expect(find([])).toBe(-1);
  });

  it('un vaisseau ennemi dans le cône et la portée : son index', () => {
    expect(find([at(100)])).toBe(0);
  });

  it('parmi plusieurs candidats, le plus proche gagne quel que soit l’ordre', () => {
    expect(find([at(300), at(100), at(200)])).toBe(1);
  });

  it('le cap est pris en compte : un ennemi derrière le cap n’est pas visé', () => {
    expect(find([at(100)], 0, Math.PI)).toBe(-1);
  });

  it('le cap est pris en compte : un ennemi dans le cône du nouveau cap est visé', () => {
    const behind = at(100, Math.PI);
    expect(find([behind], 0, Math.PI)).toBe(0);
  });
});

describe('findMissileTarget : exclusions', () => {
  it('un vaisseau de la même faction n’est jamais visé', () => {
    expect(find([ship(0, ORIGIN.x + 100, ORIGIN.y)], 0)).toBe(-1);
  });

  it('un vaisseau mort n’est pas visé', () => {
    expect(find([ship(1, ORIGIN.x + 100, ORIGIN.y, false)])).toBe(-1);
  });

  it('un vaisseau mort plus proche ne masque pas un vivant plus loin', () => {
    const ships = [ship(1, ORIGIN.x + 50, ORIGIN.y, false), at(200)];
    expect(find(ships)).toBe(1);
  });

  it('un vaisseau au-delà de la portée de recherche n’est pas visé', () => {
    expect(find([at(MISSILE_SEEK_RANGE + EPS)])).toBe(-1);
  });

  it('un vaisseau juste dans la portée est visé', () => {
    expect(find([at(MISSILE_SEEK_RANGE - EPS)])).toBe(0);
  });
});

describe('findMissileTarget : cône de recherche', () => {
  it('juste dans le demi-angle du cône : visé', () => {
    expect(find([at(100, MISSILE_SEEK_ANGLE - EPS)])).toBe(0);
  });

  it('juste hors du demi-angle du cône : non visé', () => {
    expect(find([at(100, MISSILE_SEEK_ANGLE + EPS)])).toBe(-1);
  });

  it('côté opposé du cône : symétrique', () => {
    expect(find([at(100, -(MISSILE_SEEK_ANGLE - EPS))])).toBe(0);
  });

  it('le repliement d’angle autour de ±π est géré : cap proche de π, cible juste de l’autre côté', () => {
    const heading = Math.PI - 0.05;
    const target = ship(
      1,
      ORIGIN.x + Math.cos(Math.PI + 0.1) * 100,
      ORIGIN.y + Math.sin(Math.PI + 0.1) * 100,
    );
    expect(find([target], 0, heading)).toBe(0);
  });
});

describe('hasMissileFactory', () => {
  it('planète sans bâtiment : faux', () => {
    expect(hasMissileFactory(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 0 }))).toBe(
      false,
    );
  });

  it('seule la tourelle construite (slot 0) : faux', () => {
    expect(hasMissileFactory(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 1 }))).toBe(
      false,
    );
  });

  it('usine construite (slot 1) : vrai', () => {
    expect(hasMissileFactory(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 2 }))).toBe(
      true,
    );
  });

  it('planète neutre : faux, même si on passe built', () => {
    expect(hasMissileFactory(createPlanet({ x: 0, y: 0, radius: 40, built: 4 }))).toBe(false);
  });
});

describe('defenseRange', () => {
  it('planète sans bâtiment : 0', () => {
    expect(defenseRange(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 0 }))).toBe(0);
  });

  it('tourelle + usine construites : la portée de la tourelle, l’usine n’ajoute rien', () => {
    expect(defenseRange(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 2 }))).toBe(150);
  });

  it('tourelle de base construite : sa portée (150 px)', () => {
    expect(defenseRange(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 1 }))).toBe(150);
  });

  it('tourelle lourde construite : sa portée (200 px), la plus grande des tourelles', () => {
    expect(defenseRange(createPlanet({ x: 0, y: 0, radius: 40, owner: 0, built: 4 }))).toBe(200);
  });

  it('neutre : 0 même avec built', () => {
    expect(defenseRange(createPlanet({ x: 0, y: 0, radius: 40, built: 4 }))).toBe(0);
  });
});

describe('lastHitTick (écrit par damageBuilding)', () => {
  it('une planète jamais touchée vaut −1', () => {
    expect(createPlanet({ x: 0, y: 0, radius: 40, owner: 0 }).lastHitTick).toBe(-1);
  });

  it('un tir sur une planète nue enregistre le tick courant', () => {
    const world = makeWorld({ planets: [{ x: 500, y: 500, radius: 40, owner: 0 }] });
    world.tick = 42;
    damageBuilding(world, 0, 5, 500, 500);
    expect(world.planets[0].lastHitTick).toBe(42);
  });

  it('un tir sur une planète bâtie enregistre aussi le tick courant', () => {
    const world = makeWorld({ planets: [{ x: 500, y: 500, radius: 40, owner: 0, built: 4 }] });
    world.tick = 7;
    damageBuilding(world, 0, 5, 500, 500);
    expect(world.planets[0].lastHitTick).toBe(7);
  });

  it('un nouveau tir écrase le tick précédent', () => {
    const world = makeWorld({ planets: [{ x: 500, y: 500, radius: 40, owner: 0 }] });
    world.tick = 3;
    damageBuilding(world, 0, 5, 500, 500);
    world.tick = 9;
    damageBuilding(world, 0, 5, 500, 500);
    expect(world.planets[0].lastHitTick).toBe(9);
  });

  it('les autres planètes ne sont pas marquées', () => {
    const world = makeWorld({
      planets: [
        { x: 500, y: 500, radius: 40, owner: 0 },
        { x: 1500, y: 500, radius: 40, owner: 1 },
      ],
    });
    world.tick = 5;
    damageBuilding(world, 0, 5, 500, 500);
    expect(world.planets[1].lastHitTick).toBe(-1);
  });
});

describe('createWorld : option bots', () => {
  it('sans option bots : aucune IA', () => {
    expect(makeWorld().ai).toHaveLength(0);
  });

  it('bots = [0, 2] : deux états d’IA, dans l’ordre donné', () => {
    expect(makeWorld({ bots: [0, 2] }).ai.map((b) => b.faction)).toEqual([0, 2]);
  });

  it('une faction de bots sans spawn : Error', () => {
    const spawns = [{ x: 100, y: 100 }];
    expect(() => makeWorld({ bots: [0, 2], spawns })).toThrow(/faction 2 has no spawn/);
  });

  it('un bot sur une faction sans spawn au début de la liste : Error', () => {
    expect(() => makeWorld({ bots: [FACTION_COUNT - 1], spawns: [{ x: 1, y: 1 }] })).toThrow(Error);
  });

  it('le flux IA est dérivé du seed avec le sel dédié (distinct du flux de simulation)', () => {
    const world = makeWorld({ bots: [0] });
    expect(world.aiRng.state).toBe((1 ^ AI_RNG_SALT) >>> 0);
  });

  it('le flux de simulation reste sur le seed brut', () => {
    expect(makeWorld({ bots: [0] }).rng.state).toBe(1);
  });
});

describe('createBotState', () => {
  it('rattaché à la faction donnée', () => {
    expect(createBotState(2, 0).faction).toBe(2);
  });

  it('démarre en mode NONE sans cible', () => {
    const bot = createBotState(0, 0);
    expect([bot.mode, bot.target]).toEqual([AI_MODE.NONE, -1]);
  });

  it('le premier minuteur vaut le délai de départ pour le rang 0', () => {
    expect(createBotState(0, 0).decisionTimer).toBe(BOT_PROFILE.startDelay);
  });

  it('les rangs décalent le premier minuteur d’une demi-période par rang', () => {
    const delta = createBotState(1, 2).decisionTimer - createBotState(0, 0).decisionTimer;
    expect(delta).toBeCloseTo(BOT_PROFILE.decisionPeriod, 12);
  });

  it('deux instances ne partagent pas leur état', () => {
    const a = createBotState(0, 0);
    const b = createBotState(0, 0);
    a.goalX = 99;
    expect(b.goalX).toBe(0);
  });
});
