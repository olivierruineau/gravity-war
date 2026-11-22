import { describe, expect, it } from 'vitest';
import * as vec2 from '../../src/core/vec2.js';

describe('create', () => {
  it('crée un vecteur à (0, 0) par défaut', () => {
    expect(vec2.create()).toEqual({ x: 0, y: 0 });
  });

  it('crée un vecteur aux coordonnées données', () => {
    expect(vec2.create(3, -4)).toEqual({ x: 3, y: -4 });
  });
});

describe('set', () => {
  it('écrit les coordonnées dans out et retourne out', () => {
    const out = vec2.create();
    const result = vec2.set(out, 2, 5);
    expect(result).toBe(out);
    expect(out).toEqual({ x: 2, y: 5 });
  });
});

describe('copy', () => {
  it('copie a dans out et retourne out', () => {
    const a = vec2.create(1, 2);
    const out = vec2.create();
    const result = vec2.copy(out, a);
    expect(result).toBe(out);
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it('ne modifie pas a', () => {
    const a = vec2.create(1, 2);
    vec2.copy(vec2.create(), a);
    expect(a).toEqual({ x: 1, y: 2 });
  });
});

describe('add', () => {
  it('additionne a et b dans out et retourne out', () => {
    const out = vec2.create();
    const result = vec2.add(out, vec2.create(1, 2), vec2.create(10, -5));
    expect(result).toBe(out);
    expect(out).toEqual({ x: 11, y: -3 });
  });

  it('fonctionne quand out est a', () => {
    const a = vec2.create(1, 2);
    const result = vec2.add(a, a, vec2.create(10, -5));
    expect(result).toBe(a);
    expect(a).toEqual({ x: 11, y: -3 });
  });

  it('fonctionne quand out est b', () => {
    const b = vec2.create(10, -5);
    const result = vec2.add(b, vec2.create(1, 2), b);
    expect(result).toBe(b);
    expect(b).toEqual({ x: 11, y: -3 });
  });
});

describe('sub', () => {
  it('soustrait b à a dans out et retourne out', () => {
    const out = vec2.create();
    const result = vec2.sub(out, vec2.create(5, 5), vec2.create(2, 7));
    expect(result).toBe(out);
    expect(out).toEqual({ x: 3, y: -2 });
  });

  it('fonctionne quand out est a', () => {
    const a = vec2.create(5, 5);
    vec2.sub(a, a, vec2.create(2, 7));
    expect(a).toEqual({ x: 3, y: -2 });
  });

  it('fonctionne quand out est b', () => {
    const b = vec2.create(2, 7);
    vec2.sub(b, vec2.create(5, 5), b);
    expect(b).toEqual({ x: 3, y: -2 });
  });
});

describe('scale', () => {
  it('multiplie a par le scalaire dans out et retourne out', () => {
    const out = vec2.create();
    const result = vec2.scale(out, vec2.create(2, -3), 4);
    expect(result).toBe(out);
    expect(out).toEqual({ x: 8, y: -12 });
  });

  it('fonctionne quand out est a', () => {
    const a = vec2.create(2, -3);
    const result = vec2.scale(a, a, 0.5);
    expect(result).toBe(a);
    expect(a.x).toBeCloseTo(1);
    expect(a.y).toBeCloseTo(-1.5);
  });

  it('donne le vecteur nul pour un scalaire nul', () => {
    const out = vec2.scale(vec2.create(), vec2.create(2, -3), 0);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });
});

describe('addScaled', () => {
  it('calcule a + b * s dans out et retourne out', () => {
    const out = vec2.create();
    const result = vec2.addScaled(out, vec2.create(1, 1), vec2.create(2, -4), 0.5);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(-1);
  });

  it('avec s = 0, retourne a', () => {
    expect(vec2.addScaled(vec2.create(), vec2.create(7, 8), vec2.create(100, 100), 0)).toEqual({
      x: 7,
      y: 8,
    });
  });

  it('fonctionne quand out est a (intégration pos += vel * dt)', () => {
    const pos = vec2.create(10, 20);
    const vel = vec2.create(3, -2);
    const result = vec2.addScaled(pos, pos, vel, 0.5);
    expect(result).toBe(pos);
    expect(pos.x).toBeCloseTo(11.5);
    expect(pos.y).toBeCloseTo(19);
  });
});

describe('fromAngle', () => {
  it('angle 0 donne +x', () => {
    const out = vec2.create();
    const result = vec2.fromAngle(out, 0);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('angle π/2 donne +y (axe y vers le bas)', () => {
    const out = vec2.fromAngle(vec2.create(), Math.PI / 2);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });

  it('applique la longueur demandée', () => {
    const out = vec2.fromAngle(vec2.create(), 0, 5);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
  });

  it('produit un vecteur de longueur 1 par défaut', () => {
    const out = vec2.fromAngle(vec2.create(), 1.234);
    expect(vec2.len(out)).toBeCloseTo(1);
  });
});

describe('normalize', () => {
  it('ramène un vecteur à la longueur 1 et retourne out', () => {
    const out = vec2.create();
    const result = vec2.normalize(out, vec2.create(3, 4));
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(0.6);
    expect(out.y).toBeCloseTo(0.8);
  });

  it('un vecteur nul reste (0, 0)', () => {
    expect(vec2.normalize(vec2.create(), vec2.create(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('un vecteur nul ne produit jamais de NaN', () => {
    const out = vec2.normalize(vec2.create(), vec2.create(0, 0));
    expect(Number.isNaN(out.x)).toBe(false);
    expect(Number.isNaN(out.y)).toBe(false);
  });

  it('fonctionne quand out est a', () => {
    const a = vec2.create(0, -10);
    vec2.normalize(a, a);
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(-1);
  });
});

describe('dot', () => {
  it('calcule le produit scalaire', () => {
    expect(vec2.dot(vec2.create(2, 3), vec2.create(4, -5))).toBe(-7);
  });

  it('vaut 0 pour deux vecteurs orthogonaux', () => {
    expect(vec2.dot(vec2.create(1, 0), vec2.create(0, 9))).toBe(0);
  });
});

describe('len2', () => {
  it('calcule le carré de la longueur', () => {
    expect(vec2.len2(vec2.create(3, 4))).toBe(25);
  });

  it('vaut 0 pour le vecteur nul', () => {
    expect(vec2.len2(vec2.create())).toBe(0);
  });
});

describe('len', () => {
  it('calcule la longueur euclidienne', () => {
    expect(vec2.len(vec2.create(3, 4))).toBe(5);
  });

  it('vaut 0 pour le vecteur nul', () => {
    expect(vec2.len(vec2.create())).toBe(0);
  });
});

describe('dist2', () => {
  it('calcule le carré de la distance entre deux points', () => {
    expect(vec2.dist2(vec2.create(1, 1), vec2.create(4, 5))).toBe(25);
  });

  it('est symétrique', () => {
    const a = vec2.create(-2, 7);
    const b = vec2.create(3, -1);
    expect(vec2.dist2(a, b)).toBe(vec2.dist2(b, a));
  });

  it('vaut 0 pour deux points identiques', () => {
    expect(vec2.dist2(vec2.create(2, 2), vec2.create(2, 2))).toBe(0);
  });
});
