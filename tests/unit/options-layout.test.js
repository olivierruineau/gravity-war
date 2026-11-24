import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/config.js';
import { optionsLayout } from '../../src/systems/optionsLayout.js';

describe('disposition des options', () => {
  it('une colonne centrée quand la liste est courte', () => {
    const { rows } = optionsLayout(5);
    expect(new Set(rows.map((r) => r.x))).toEqual(new Set([GAME_WIDTH / 2]));
    expect(rows.map((r) => r.y)).toEqual([...rows.map((r) => r.y)].sort((a, b) => a - b));
  });

  it('deux colonnes remplies l’une après l’autre au-delà', () => {
    const { rows } = optionsLayout(9);
    const left = rows.filter((r) => r.x < GAME_WIDTH / 2);
    const right = rows.filter((r) => r.x > GAME_WIDTH / 2);
    expect(left).toHaveLength(5);
    expect(right).toHaveLength(4);
    expect(rows.slice(0, 5)).toEqual(left);
  });

  it('tout tient à l’écran, rangées assez hautes pour le doigt, sans chevauchement', () => {
    for (const n of [5, 8, 9, 10]) {
      const { rows, back } = optionsLayout(n);
      for (const r of rows) {
        expect(r.h).toBeGreaterThanOrEqual(26);
        expect(r.x - r.w / 2).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w / 2).toBeLessThanOrEqual(GAME_WIDTH);
        expect(r.y + r.h / 2).toBeLessThan(back.y);
      }
      expect(back.y + 13).toBeLessThan(GAME_HEIGHT - 12); // laisse la ligne d'aide du bas
      const ys = rows.filter((r) => r.x === rows[0].x).map((r) => r.y);
      for (let i = 1; i < ys.length; i++)
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(r26(rows));
    }
  });
});

const r26 = (rows) => rows[0].h;
