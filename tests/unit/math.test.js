import { describe, expect, it } from 'vitest';
import { clamp, lerp, wrapAngle } from '../../src/core/math.js';

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
