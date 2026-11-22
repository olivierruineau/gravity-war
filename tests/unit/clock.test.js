import { describe, expect, it } from 'vitest';
import { consumeSteps, createClock } from '../../src/core/clock.js';
import { createRng, range } from '../../src/core/rng.js';

const DT = 1 / 60;
const OPTIONS = { dt: DT, maxFrameDt: 0.25, maxSteps: 5 };

function makeClock(overrides = {}) {
  return createClock({ ...OPTIONS, ...overrides });
}

describe('createClock', () => {
  it('démarre avec un accumulateur vide et conserve les paramètres', () => {
    expect(createClock(OPTIONS)).toEqual({ acc: 0, ...OPTIONS });
  });
});

describe('consumeSteps : cas nominaux', () => {
  it('une frame d’exactement un pas donne 1 pas', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, DT)).toBe(1);
    expect(clock.acc).toBeCloseTo(0, 9);
  });

  it('une frame plus courte qu’un pas donne 0 pas et est mise en réserve', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, DT / 2)).toBe(0);
    expect(clock.acc).toBeCloseTo(DT / 2, 12);
  });

  it('60 frames de 1/60 s donnent exactement 60 pas au total (arrondi flottant)', () => {
    const clock = makeClock();
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const n = consumeSteps(clock, 1 / 60);
      // Une frame de 1/60 s ne doit jamais produire 0 ou 2 pas à cause d'une erreur d'arrondi.
      expect(n).toBe(1);
      total += n;
    }
    expect(total).toBe(60);
  });

  it('écran 144 Hz : 144 frames d’une seconde donnent 60 pas (±1 de reliquat)', () => {
    const clock = makeClock();
    let total = 0;
    for (let i = 0; i < 144; i++) total += consumeSteps(clock, 1 / 144);
    // Le reliquat final peut valoir presque un pas non consommé : tolérance de 1 pas.
    expect(Math.abs(total - 60)).toBeLessThanOrEqual(1);
  });

  it('5 pas exacts dans une frame sont exécutés sans jeter l’arriéré (limite non dépassée)', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, 5 * DT)).toBe(5);
    expect(clock.acc).toBeCloseTo(0, 9);
  });
});

describe('consumeSteps : reliquat entre frames', () => {
  it('conserve le reliquat d’une frame (1,5 pas) pour la suivante', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, 1.5 * DT)).toBe(1);
    expect(clock.acc).toBeCloseTo(0.5 * DT, 12);
    // 0,5 (reliquat) + 1,5 = 2 pas pile.
    expect(consumeSteps(clock, 1.5 * DT)).toBe(2);
    expect(clock.acc).toBeCloseTo(0, 9);
  });

  it('deux demi-frames successives produisent un pas à la seconde', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, DT / 2)).toBe(0);
    expect(consumeSteps(clock, DT / 2)).toBe(1);
  });

  it('avec une limite plus large, une frame de 0,1 s donne 6 pas', () => {
    const clock = makeClock({ maxSteps: 10 });
    expect(consumeSteps(clock, 0.1)).toBe(6);
    expect(clock.acc).toBeCloseTo(0, 9);
  });
});

describe('consumeSteps : garde-fous', () => {
  it('une frame de 0,1 s avec maxSteps = 5 est plafonnée à 5 pas et jette l’arriéré', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, 0.1)).toBe(5);
    expect(clock.acc).toBe(0);
  });

  it('une frame de 1 s est ramenée à maxFrameDt puis à maxSteps, arriéré jeté', () => {
    const clock = makeClock();
    expect(consumeSteps(clock, 1)).toBe(5);
    expect(clock.acc).toBe(0);
  });

  it('pas de rattrapage après une frame trop longue : la frame suivante repart de zéro', () => {
    const clock = makeClock();
    consumeSteps(clock, 1);
    expect(consumeSteps(clock, DT)).toBe(1);
    expect(consumeSteps(clock, 0)).toBe(0);
  });

  it('une frame très longue produit le même résultat qu’une frame de maxFrameDt', () => {
    const a = makeClock({ maxSteps: 100 });
    const b = makeClock({ maxSteps: 100 });
    // 0,25 s = 15 pas : le plafond de frame, pas le plafond de pas, est ce qui borne ici.
    expect(consumeSteps(a, 1000)).toBe(consumeSteps(b, 0.25));
    expect(a.acc).toBeCloseTo(b.acc, 12);
  });

  it('avec maxSteps large, une frame de 10 s est limitée à maxFrameDt (15 pas)', () => {
    const clock = makeClock({ maxSteps: 100 });
    expect(consumeSteps(clock, 10)).toBe(15);
  });

  it('une frame de 0 donne 0 pas et laisse l’accumulateur intact', () => {
    const clock = makeClock();
    consumeSteps(clock, 1.5 * DT);
    const before = clock.acc;
    expect(consumeSteps(clock, 0)).toBe(0);
    expect(clock.acc).toBe(before);
  });

  it('une frame négative (horloge qui recule) donne 0 pas sans corrompre l’accumulateur', () => {
    const clock = makeClock();
    consumeSteps(clock, 1.5 * DT);
    const before = clock.acc;
    expect(consumeSteps(clock, -1)).toBe(0);
    expect(clock.acc).toBe(before);
    expect(clock.acc).toBeGreaterThanOrEqual(0);
    // Le reliquat reste exploitable ensuite.
    expect(consumeSteps(clock, DT)).toBe(1);
  });

  it('l’accumulateur reste dans [0, dt) après chaque appel qui ne jette pas l’arriéré', () => {
    const clock = makeClock();
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      consumeSteps(clock, range(rng, 0, 0.05));
      expect(clock.acc).toBeGreaterThanOrEqual(0);
      // Marge 1e-9 : la même que l'epsilon de tolérance du module.
      expect(clock.acc).toBeLessThan(DT + 1e-9);
    }
  });
});

describe('consumeSteps : scénario long', () => {
  it('la somme des pas sur des frames irrégulières vaut temps total / dt (±1)', () => {
    const clock = makeClock();
    const rng = createRng(2024);
    let totalTime = 0;
    let totalSteps = 0;
    for (let i = 0; i < 5000; i++) {
      // Frames de 1 à 45 ms : au plus 3 pas par frame, donc jamais de plafond atteint.
      const frame = range(rng, 0.001, 0.045);
      totalTime += frame;
      totalSteps += consumeSteps(clock, frame);
    }
    expect(Math.abs(totalSteps - totalTime / DT)).toBeLessThanOrEqual(1);
  });

  it('mêmes frames, même suite de pas (déterminisme)', () => {
    const run = () => {
      const clock = makeClock();
      const rng = createRng(99);
      const counts = [];
      for (let i = 0; i < 500; i++) counts.push(consumeSteps(clock, range(rng, 0, 0.1)));
      return counts;
    };
    expect(run()).toEqual(run());
  });

  it("ignore une frame NaN ou infinie sans corrompre l'accumulateur", () => {
    const clock = createClock({ dt: 1 / 60, maxFrameDt: 0.25, maxSteps: 5 });
    expect(consumeSteps(clock, NaN)).toBe(0);
    expect(consumeSteps(clock, Infinity)).toBe(0);
    expect(clock.acc).toBe(0);
    expect(consumeSteps(clock, 1 / 60)).toBe(1);
  });
});
