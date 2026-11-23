import { describe, expect, it } from 'vitest';
import { arena } from '../../src/data/maps/arena.js';
import { minimapSize } from '../../src/systems/minimapLayout.js';

describe('minimapSize', () => {
  it('carte plus large que la boîte : limitée par la largeur, proportions gardées', () => {
    const m = minimapSize(2400, 1350, 96, 96);
    expect(m.width).toBeCloseTo(96, 9);
    expect(m.height).toBeCloseTo(54, 9);
    expect(m.scale).toBeCloseTo(0.04, 9);
  });

  it('carte plus haute que la boîte : limitée par la hauteur', () => {
    const m = minimapSize(1000, 2000, 100, 50);
    expect(m.height).toBeCloseTo(50, 9);
    expect(m.width).toBeCloseTo(25, 9);
  });

  it('ne dépasse jamais la boîte, et conserve le rapport largeur / hauteur', () => {
    const m = minimapSize(arena.width, arena.height, 96, 54);
    expect(m.width).toBeLessThanOrEqual(96 + 1e-9);
    expect(m.height).toBeLessThanOrEqual(54 + 1e-9);
    expect(m.width / m.height).toBeCloseTo(arena.width / arena.height, 9);
  });

  it('un point du monde se projette dans la minimap : coin haut-gauche → 0, coin opposé → taille', () => {
    const m = minimapSize(arena.width, arena.height, 96, 54);
    expect(0 * m.scale).toBe(0);
    expect(arena.width * m.scale).toBeCloseTo(m.width, 9);
    expect(arena.height * m.scale).toBeCloseTo(m.height, 9);
  });
});
