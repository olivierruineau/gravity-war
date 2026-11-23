import { describe, expect, it } from 'vitest';
import { interceptTime } from '../../src/core/ai/combat.js';
import { createRng, range } from '../../src/core/rng.js';

// interceptTime(dx, dy, dvx, dvy, speed) : plus petit t > 0 tel que |(dx, dy) + (dvx, dvy)·t| = speed·t, −1 sinon.
// Les cas exacts sont calculables à la main ; la précision attendue est celle de l'arithmétique flottante (10 chiffres).
const DIGITS = 10;
const SPEED = 300;

/** Résidu de l'équation d'interception à l'instant t : |r + v·t| − speed·t (nul à une solution). */
const residual = (dx, dy, dvx, dvy, speed, t) => Math.hypot(dx + dvx * t, dy + dvy * t) - speed * t;

describe('interceptTime : cible immobile', () => {
  it('vaut distance / vitesse, quelle que soit la direction', () => {
    expect(interceptTime(300, 0, 0, 0, SPEED)).toBeCloseTo(1, DIGITS);
    expect(interceptTime(0, -600, 0, 0, SPEED)).toBeCloseTo(2, DIGITS);
    expect(interceptTime(-120, 160, 0, 0, SPEED)).toBeCloseTo(200 / SPEED, DIGITS); // triangle 3-4-5
  });

  it('est symétrique : r et −r donnent le même temps', () => {
    expect(interceptTime(-120, 160, 0, 0, SPEED)).toBeCloseTo(
      interceptTime(120, -160, 0, 0, SPEED),
      DIGITS,
    );
  });

  it('est proportionnelle à la distance et inversement à la vitesse', () => {
    const t = interceptTime(100, 50, 0, 0, SPEED);
    expect(interceptTime(200, 100, 0, 0, SPEED)).toBeCloseTo(2 * t, DIGITS);
    expect(interceptTime(100, 50, 0, 0, 2 * SPEED)).toBeCloseTo(t / 2, DIGITS);
  });

  it('cible à distance nulle : 0 (déjà dessus)', () => {
    expect(interceptTime(0, 0, 50, -20, SPEED)).toBe(0);
  });
});

describe('interceptTime : cible mobile', () => {
  it('cible qui fuit dans l axe, plus lentement que la balle : d / (speed − v)', () => {
    // r = (300, 0), v = (100, 0) : 300 + 100 t = 300 t  =>  t = 1,5
    expect(interceptTime(300, 0, 100, 0, SPEED)).toBeCloseTo(1.5, DIGITS);
  });

  it('cible qui fonce vers le tireur : d / (speed + v)', () => {
    // r = (300, 0), v = (−100, 0) : 300 − 100 t = 300 t  =>  t = 0,75
    expect(interceptTime(300, 0, -100, 0, SPEED)).toBeCloseTo(0.75, DIGITS);
  });

  it('cible qui traverse à angle droit : racine du triangle rectangle', () => {
    // r = (300, 0), v = (0, 100) : 300² + 100² t² = 300² t²  =>  t = 300 / sqrt(300² − 100²)
    expect(interceptTime(300, 0, 0, 100, SPEED)).toBeCloseTo(
      300 / Math.sqrt(300 * 300 - 100 * 100),
      DIGITS,
    );
  });

  it('le point d interception est atteint à la vitesse de la balle (résidu nul), t > 0', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const dx = range(rng, -600, 600);
      const dy = range(rng, -600, 600);
      const dvx = range(rng, -200, 200); // toujours < speed : une solution existe
      const dvy = range(rng, -200, 200);
      const t = interceptTime(dx, dy, dvx, dvy, SPEED);
      expect(t).toBeGreaterThan(0);
      // |r| ~ 10² à 10³ et t ~ 1 : l'erreur de la racine carrée reste très en dessous de 1e-6 px
      expect(residual(dx, dy, dvx, dvy, SPEED, t)).toBeCloseTo(0, 6);
    }
  });

  it('la vitesse de la cible est relative : même vitesse de part et d autre = cible immobile', () => {
    // Tireur et cible à la même vitesse (dvx = dvy = 0) : la balle hérite de la vitesse du tireur
    expect(interceptTime(250, -90, 0, 0, SPEED)).toBeCloseTo(Math.hypot(250, 90) / SPEED, DIGITS);
  });
});

describe('interceptTime : cible inatteignable', () => {
  it('cible qui fuit plus vite que la balle : −1', () => {
    expect(interceptTime(300, 0, 400, 0, SPEED)).toBe(-1);
    expect(interceptTime(-300, 100, -400, 133, SPEED)).toBe(-1);
  });

  it('cible qui fuit exactement à la vitesse de la balle : −1 (jamais rattrapée)', () => {
    expect(interceptTime(300, 0, SPEED, 0, SPEED)).toBe(-1);
  });

  it('cible plus rapide que la balle mais qui s éloigne de biais : −1 (discriminant négatif)', () => {
    // v = (0, 400) perpendiculaire à r : |r + v t| > |v t| > speed·t pour tout t > 0
    expect(interceptTime(300, 0, 0, 400, SPEED)).toBe(-1);
  });

  it('même vitesse que la balle et qui approche : solution unique t = −|r|² / (2 r·v)', () => {
    // r = (300, 0), v = (−300, 0) : 300 − 300 t = 300 t  =>  t = 0,5
    expect(interceptTime(300, 0, -SPEED, 0, SPEED)).toBeCloseTo(0.5, DIGITS);
  });
});

describe('interceptTime : plus petit t > 0', () => {
  it('cible plus rapide que la balle qui fonce sur le tireur : deux racines positives, on garde la première', () => {
    // r = (100, 0), v = (−400, 0), speed = 300 : t = 1/7 (balle devant la cible) et t = 1 (cible déjà passée).
    const t = interceptTime(100, 0, -400, 0, SPEED);
    expect(t).toBeCloseTo(1 / 7, DIGITS);
    expect(residual(100, 0, -400, 0, SPEED, t)).toBeCloseTo(0, 8);
  });

  it('aucun instant antérieur ne convient : le résidu est strictement positif avant t', () => {
    const rng = createRng(11);
    for (let i = 0; i < 300; i++) {
      const dx = range(rng, -500, 500);
      const dy = range(rng, -500, 500);
      const dvx = range(rng, -600, 600); // inclut des cibles plus rapides que la balle
      const dvy = range(rng, -600, 600);
      const t = interceptTime(dx, dy, dvx, dvy, SPEED);
      const horizon = t > 0 ? t : 20; // −1 : aucune racine positive, résidu > 0 sur tout l'échantillon
      for (let k = 1; k < 200; k++) {
        const s = (horizon * k) / 200 - 1e-9; // reste strictement avant la racine
        expect(residual(dx, dy, dvx, dvy, SPEED, s)).toBeGreaterThan(-1e-6);
      }
    }
  });

  it('le résultat est toujours −1 ou strictement positif (jamais négatif ni NaN)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const t = interceptTime(
        range(rng, -800, 800),
        range(rng, -800, 800),
        range(rng, -500, 500),
        range(rng, -500, 500),
        SPEED,
      );
      expect(Number.isNaN(t)).toBe(false);
      expect(t === -1 || t > 0).toBe(true);
    }
  });
});
