import { describe, expect, it } from 'vitest';
import { createRng, int, nextFloat, range } from '../../src/core/rng.js';

function take(rng, count, draw = nextFloat) {
  const values = [];
  for (let i = 0; i < count; i++) values.push(draw(rng));
  return values;
}

describe('createRng', () => {
  it('stocke la seed comme état entier', () => {
    expect(createRng(42)).toEqual({ state: 42 });
  });

  it('ramène une seed négative ou décimale à un entier 32 bits non signé', () => {
    const rng = createRng(-1);
    expect(Number.isInteger(rng.state)).toBe(true);
    expect(rng.state).toBe(0xffffffff);
  });
});

describe('déterminisme', () => {
  it('deux instances avec la même seed donnent la même séquence', () => {
    const first = take(createRng(12345), 5);
    const second = take(createRng(12345), 5);
    expect(second).toEqual(first);
  });

  it('deux seeds différentes donnent des séquences différentes', () => {
    const first = take(createRng(1), 5);
    const second = take(createRng(2), 5);
    expect(second).not.toEqual(first);
  });
});

describe('nextFloat', () => {
  it('reste dans [0, 1) sur 1000 tirages', () => {
    const rng = createRng(7);
    const values = take(rng, 1000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produit des valeurs non constantes', () => {
    const values = take(createRng(7), 100);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe('range', () => {
  it('reste dans [min, max) sur 1000 tirages', () => {
    const values = take(createRng(99), 1000, (rng) => range(rng, -5, 10));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(10);
    }
  });
});

describe('int', () => {
  it('reste dans [min, maxExcl) sur 1000 tirages', () => {
    const values = take(createRng(3), 1000, (rng) => int(rng, 3, 8));
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(8);
    }
  });

  it('n’atteint jamais maxExcl', () => {
    const values = take(createRng(3), 1000, (rng) => int(rng, 0, 2));
    expect(values).not.toContain(2);
  });

  it('atteint toutes les valeurs de l’intervalle sur 500 tirages', () => {
    const values = new Set(take(createRng(11), 500, (rng) => int(rng, 3, 8)));
    expect([...values].sort()).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('sérialisation', () => {
  it("l'état est un entier", () => {
    const rng = createRng(2026);
    take(rng, 10);
    expect(Number.isInteger(rng.state)).toBe(true);
  });

  it('un aller-retour JSON donne la même suite de tirages', () => {
    const rng = createRng(2026);
    take(rng, 10);
    const restored = JSON.parse(JSON.stringify(rng));
    expect(take(restored, 20)).toEqual(take(rng, 20));
  });
});
