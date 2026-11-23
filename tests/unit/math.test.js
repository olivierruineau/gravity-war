import { describe, expect, it } from 'vitest';
import { clamp, hypot, lerp, wrapAngle } from '../../src/core/math.js';

describe('clamp', () => {
  it('borne la valeur', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpole et borne t', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 2)).toBe(10);
    expect(lerp(0, 10, -1)).toBe(0);
  });
});

describe('wrapAngle', () => {
  it('laisse 0 inchangé', () => {
    expect(wrapAngle(0)).toBe(0);
  });

  it('ramène 3π dans [-π, π)', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
  });

  it('ramène -3π dans [-π, π)', () => {
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
  });

  it('ramène 2π à 0', () => {
    expect(wrapAngle(2 * Math.PI)).toBeCloseTo(0);
  });

  it('ramène π à -π (borne haute exclue)', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(-Math.PI);
  });

  it('laisse -π inchangé (borne basse incluse)', () => {
    expect(wrapAngle(-Math.PI)).toBeCloseTo(-Math.PI);
  });
});

describe('hypot', () => {
  it('norme euclidienne : 3-4-5, zéro, signes indifférents', () => {
    expect(hypot(3, 4)).toBe(5);
    expect(hypot(0, 0)).toBe(0);
    expect(hypot(-3, 4)).toBe(5);
    expect(hypot(3, -4)).toBe(5);
  });

  it('même résultat que Math.hypot à 1e-12 près sur des valeurs de jeu', () => {
    for (const [x, y] of [
      [123.456, -789.01],
      [0.001, 2400],
      [-1350.5, 0.25],
    ]) {
      expect(hypot(x, y)).toBeCloseTo(Math.hypot(x, y), 12);
    }
  });
});
