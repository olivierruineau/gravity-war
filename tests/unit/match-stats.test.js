import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { createEvents, EVT, pushEvent } from '../../src/core/events.js';
import {
  createMatchStats,
  formatDuration,
  recordEvents,
  summaryLines,
} from '../../src/systems/matchStats.js';

describe('statistiques de partie', () => {
  it('compte les captures par faction et les pertes de vaisseaux', () => {
    const stats = createMatchStats();
    const events = createEvents(16);
    pushEvent(events, EVT.CAPTURED, 0, 0, 4, 0);
    pushEvent(events, EVT.CAPTURED, 0, 0, 5, 1);
    pushEvent(events, EVT.CAPTURED, 0, 0, 6, 0);
    pushEvent(events, EVT.EXPLOSION, 0, 0, 2);
    pushEvent(events, EVT.EXPLOSION, 0, 0, 0);
    pushEvent(events, EVT.SHOT, 0, 0, 0, 0); // sans effet
    recordEvents(stats, events);
    expect(stats.captured).toEqual([2, 1, 0]);
    expect(stats.lost).toEqual([1, 0, 1]);
  });

  it('formate la durée en minutes:secondes', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  const world = {
    tick: Math.round(125 / FIXED_DT),
    inGame: [true, true, false],
    planets: [{ owner: 0 }, { owner: 0 }, { owner: 1 }, { owner: -1 }],
  };
  const stats = { captured: [3, 1, 0], lost: [2, 4, 0] };

  it('résumé du joueur : durée, planètes, captures, pertes, carte', () => {
    expect(summaryLines(stats, world, { mapLabel: 'TRIADE', seed: 5, spectator: false })).toEqual([
      'DUREE 2:05',
      'PLANETES 2/4',
      'CAPTURES 3   PERTES 2',
      'CARTE TRIADE #5',
    ]);
  });

  it('résumé d’observation : une ligne par faction en jeu', () => {
    const lines = summaryLines(stats, world, { mapLabel: 'ALEATOIRE', seed: 9, spectator: true });
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('VERT   PLANETES 2  CAPTURES 3  PERTES 2');
    expect(lines[2]).toBe('ROUGE  PLANETES 1  CAPTURES 1  PERTES 4');
    expect(lines[3]).toBe('CARTE ALEATOIRE #9');
  });
});
