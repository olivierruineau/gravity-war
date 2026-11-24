import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/world.js';
import { buildMap, limitFactions } from '../../src/data/maps/index.js';
import { triad } from '../../src/data/maps/triad.js';
import { planMatch } from '../../src/systems/matchPlan.js';
import {
  BOT_COUNTS,
  cycleBotCount,
  cycleMapMode,
  getBotCount,
  getMapMode,
  resetMatchSettings,
  seedFromSearch,
} from '../../src/systems/matchSettings.js';

const base = { mapMode: 'triad', botCount: 2, spectator: false, seedParam: null, randomSeed: 7 };

describe('limitFactions', () => {
  it('à 3 factions, la carte ne change pas', () => {
    expect(limitFactions(triad, 3)).toEqual(triad);
  });

  it('à 2 factions, la base de la troisième devient neutre et son départ disparaît', () => {
    const map = limitFactions(triad, 2);
    expect(map.spawns).toHaveLength(2);
    expect(map.planets[2].owner).toBeUndefined();
    expect(map.planets[2].built).toBeUndefined();
    expect(map.planets[0].owner).toBe(0);
    const world = createWorld(map, 1, { eventCapacity: 8, bots: [1] });
    expect(world.inGame).toEqual([true, true, false]);
    expect(world.planets[2].owner).toBe(-1);
    expect(world.ships).toHaveLength(2);
  });

  it('ne modifie pas la carte d’origine', () => {
    limitFactions(triad, 2);
    expect(triad.planets[2].owner).toBe(2);
  });
});

describe('planMatch', () => {
  it('Triade avec 2 bots : factions 1 et 2', () => {
    const plan = planMatch(base);
    expect(plan.bots).toEqual([1, 2]);
    expect(plan.map).toEqual(triad);
    expect(plan.seed).toBe(7);
  });

  it('1 bot : une seule IA et deux factions', () => {
    const plan = planMatch({ ...base, botCount: 1 });
    expect(plan.bots).toEqual([1]);
    expect(plan.factions).toBe(2);
    expect(plan.map.spawns).toHaveLength(2);
  });

  it('observation : la faction 0 est aussi un bot', () => {
    expect(planMatch({ ...base, spectator: true }).bots).toEqual([0, 1, 2]);
    expect(planMatch({ ...base, spectator: true, botCount: 1 }).bots).toEqual([0, 1]);
  });

  it('mode aléatoire : la carte vient de la graine', () => {
    const a = planMatch({ ...base, mapMode: 'random', randomSeed: 11 });
    const b = planMatch({ ...base, mapMode: 'random', randomSeed: 11 });
    expect(a.map).toEqual(b.map);
    expect(a.map).toEqual(buildMap('random', 11, 3));
    expect(a.map).not.toEqual(planMatch({ ...base, mapMode: 'random', randomSeed: 12 }).map);
  });

  it('une graine d’adresse impose une carte générée, même en mode Triade', () => {
    const plan = planMatch({ ...base, mapMode: 'triad', seedParam: 99 });
    expect(plan.seed).toBe(99);
    expect(plan.mapMode).toBe('random');
    expect(plan.map).toEqual(buildMap('random', 99, 3));
  });
});

describe('réglages de partie', () => {
  it('2 bots et carte aléatoire par défaut, cycle et retour', () => {
    resetMatchSettings();
    expect(getBotCount()).toBe(2);
    expect(getMapMode()).toBe('random');
    expect(cycleBotCount()).toBe(1);
    expect(cycleBotCount()).toBe(2);
    expect(cycleMapMode()).toBe('triad');
    expect(cycleMapMode(-1)).toBe('random');
    expect(BOT_COUNTS).toEqual([1, 2]);
    resetMatchSettings();
  });

  it('graine d’adresse : entiers de 32 bits seulement', () => {
    expect(seedFromSearch('?seed=123')).toBe(123);
    expect(seedFromSearch('?x=1&seed=0')).toBe(0);
    expect(seedFromSearch('')).toBeNull();
    expect(seedFromSearch('?seed=abc')).toBeNull();
    expect(seedFromSearch('?seed=-5')).toBeNull();
    expect(seedFromSearch('?seed=99999999999')).toBeNull();
    expect(seedFromSearch('?seed=4294967296')).toBeNull();
  });
});
