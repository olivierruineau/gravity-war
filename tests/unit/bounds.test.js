import { describe, expect, it } from 'vitest';
import { applyBounds } from '../../src/core/bounds.js';

// Carte 100×100, rayon 5 : le centre du corps reste dans [5, 95] × [5, 95].
// Valeurs dyadiques (8, 4, 0.5…) pour que les résultats soient exacts en flottant.
const W = 100;
const H = 100;
const R = 5;
const RESTITUTION = 0.5;

function body(x, y, vx, vy) {
  return { pos: { x, y }, vel: { x: vx, y: vy } };
}

function bounce(b, restitution = RESTITUTION) {
  applyBounds(b, W, H, R, restitution);
  return b;
}

describe('applyBounds : corps à l’intérieur', () => {
  it('ne change ni la position ni la vitesse', () => {
    expect(bounce(body(50, 50, 3, -4))).toEqual(body(50, 50, 3, -4));
  });

  it('un corps juste au-dessus de la limite n’est pas touché', () => {
    expect(bounce(body(5.5, 94.5, -10, 10))).toEqual(body(5.5, 94.5, -10, 10));
  });
});

describe('applyBounds : dépassement, position ramenée sur la limite', () => {
  it.each([
    ['gauche', body(2, 50, -4, 0), { x: 5, y: 50 }],
    ['droite', body(98, 50, 4, 0), { x: 95, y: 50 }],
    ['haut', body(50, 1, 0, -4), { x: 50, y: 5 }],
    ['bas', body(50, 99, 0, 4), { x: 50, y: 95 }],
  ])('mur %s : la position est ramenée exactement à la limite', (_label, start, expectedPos) => {
    expect(bounce(start).pos).toEqual(expectedPos);
  });
});

describe('applyBounds : composante normale inversée et multipliée par la restitution', () => {
  it.each([
    ['gauche', body(2, 50, -8, 0), { x: 4, y: 0 }],
    ['droite', body(98, 50, 8, 0), { x: -4, y: 0 }],
    ['haut', body(50, 1, 0, -8), { x: 0, y: 4 }],
    ['bas', body(50, 99, 0, 8), { x: 0, y: -4 }],
  ])('mur %s : vitesse normale = -v × 0,5', (_label, start, expectedVel) => {
    expect(bounce(start).vel).toEqual(expectedVel);
  });
});

describe('applyBounds : composante tangentielle conservée', () => {
  it.each([
    ['gauche', body(2, 30, -8, 7), { x: 4, y: 7 }],
    ['bas', body(40, 99, -6, 8), { x: -6, y: -4 }],
  ])('mur %s : la composante parallèle au mur ne change pas', (_label, start, expectedVel) => {
    expect(bounce(start).vel).toEqual(expectedVel);
  });
});

describe('applyBounds : vitesse déjà sortante du mur', () => {
  it('à gauche, vx > 0 : pas d’inversion, la position est tout de même ramenée', () => {
    expect(bounce(body(2, 50, 3, 0))).toEqual(body(5, 50, 3, 0));
  });

  it('à droite, vx < 0 : pas d’inversion, la position est tout de même ramenée', () => {
    expect(bounce(body(98, 50, -3, 0))).toEqual(body(95, 50, -3, 0));
  });
});

describe('applyBounds : valeurs extrêmes de la restitution', () => {
  it.each([
    ['gauche', body(2, 50, -8, 6)],
    ['droite', body(98, 50, 8, 6)],
  ])('restitution 0, mur %s : la composante normale est annulée', (_label, start) => {
    // -0 possible à droite (-8 × 0) : toBeCloseTo accepte -0 comme 0.
    expect(bounce(start, 0).vel.x).toBeCloseTo(0, 12);
  });

  it('restitution 0 : la composante tangentielle reste intacte', () => {
    expect(bounce(body(2, 50, -8, 6), 0).vel.y).toBe(6);
  });

  it.each([
    ['gauche', body(2, 50, -8, 0), { x: 8, y: 0 }],
    ['droite', body(98, 50, 8, 0), { x: -8, y: 0 }],
    ['haut', body(50, 1, 0, -8), { x: 0, y: 8 }],
    ['bas', body(50, 99, 0, 8), { x: 0, y: -8 }],
  ])(
    'restitution 1, mur %s : rebond parfait, vitesse normale renversée à l’identique',
    (_label, start, expectedVel) => {
      expect(bounce(start, 1).vel).toEqual(expectedVel);
    },
  );
});

describe('applyBounds : coin (dépassement sur x et y)', () => {
  it('coin bas-gauche : les deux axes sont ramenés et amortis', () => {
    expect(bounce(body(2, 97, -4, 6))).toEqual(body(5, 95, 2, -3));
  });

  it('coin haut-droite : les deux axes sont ramenés et amortis', () => {
    expect(bounce(body(98, 1, 4, -6))).toEqual(body(95, 5, -2, 3));
  });
});

describe('applyBounds : corps pile sur la limite', () => {
  it.each([
    ['gauche (x = rayon)', body(5, 50, -8, 0)],
    ['droite (x = largeur - rayon)', body(95, 50, 8, 0)],
    ['haut (y = rayon)', body(50, 5, 0, -8)],
    ['bas (y = hauteur - rayon)', body(50, 95, 0, 8)],
  ])('%s : rien ne change', (_label, start) => {
    expect(bounce(start)).toEqual(start);
  });
});

describe('applyBounds : bornes et entrées invalides', () => {
  it('rayon 0 : les bords de la carte sont les limites', () => {
    const b = body(-1, 50, -8, 0);
    applyBounds(b, W, H, 0, RESTITUTION);
    expect(b).toEqual(body(0, 50, 4, 0));
  });

  it('position NaN : aucune borne n’est appliquée, la valeur reste NaN (pas de mur fantôme)', () => {
    expect(bounce(body(NaN, 50, -8, 0))).toEqual(body(NaN, 50, -8, 0));
  });
});
