import { describe, expect, it } from 'vitest';
import { createIntent, resetIntent } from '../../src/core/intent.js';

describe('createIntent', () => {
  it('retourne les valeurs par défaut : aucune action', () => {
    expect(createIntent()).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });
  });

  it('retourne un objet neuf à chaque appel', () => {
    expect(createIntent()).not.toBe(createIntent());
  });
});

describe('resetIntent', () => {
  it('remet tous les champs à zéro', () => {
    const intent = { rotate: 1, thrust: true, fire: true, missile: true };
    resetIntent(intent);
    expect(intent).toEqual(createIntent());
  });

  it('agit en place : même objet, mêmes clés (pas de réallocation)', () => {
    const intent = createIntent();
    intent.rotate = -1;
    intent.thrust = true;
    const keys = Object.keys(intent);
    const alias = intent;
    resetIntent(intent);
    expect(alias.rotate).toBe(0);
    expect(Object.keys(intent)).toEqual(keys);
    expect(intent.rotate).toBe(0);
    expect(intent.thrust).toBe(false);
  });

  it('retourne rien et reste idempotent', () => {
    const intent = createIntent();
    expect(resetIntent(intent)).toBeUndefined();
    resetIntent(intent);
    expect(intent).toEqual(createIntent());
  });
});
