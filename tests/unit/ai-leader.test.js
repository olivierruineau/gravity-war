import { describe, expect, it } from 'vitest';
import { leaderOf } from '../../src/core/ai/decide.js';

const factions = (...counts) => counts.map((planetCount) => ({ planetCount, eliminated: false }));

describe('leaderOf (7.2 : pas de biais d indice)', () => {
  it('égalité entre les adversaires : personne n est désigné (sinon la faction 0 serait la cible permanente)', () => {
    expect(leaderOf(factions(1, 1, 1), 0)).toBe(-1);
    expect(leaderOf(factions(1, 1, 1), 1)).toBe(-1);
    expect(leaderOf(factions(1, 1, 1), 2)).toBe(-1);
  });

  it('un adversaire a strictement plus de planètes : c est lui, quel que soit son indice', () => {
    expect(leaderOf(factions(1, 1, 3), 0)).toBe(2);
    expect(leaderOf(factions(3, 1, 1), 2)).toBe(0);
    expect(leaderOf(factions(1, 4, 1), 0)).toBe(1);
  });

  it('égalité en tête entre deux adversaires : aucun leader, même si un troisième est derrière', () => {
    expect(leaderOf(factions(1, 3, 3), 0)).toBe(-1);
    expect(leaderOf(factions(3, 3, 1), 2)).toBe(-1);
  });

  it('le bot lui-même n est jamais son propre leader, même s il domine', () => {
    expect(leaderOf(factions(5, 1, 1), 0)).toBe(-1);
  });

  it('une faction éliminée ou hors jeu (0 planète) n est jamais leader', () => {
    const f = factions(1, 0, 2);
    f[2].eliminated = true;
    expect(leaderOf(f, 0)).toBe(-1);
  });
});
