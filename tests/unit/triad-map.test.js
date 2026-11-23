import { describe, expect, it } from 'vitest';
import { FIXED_DT, GRAVITY_RANGE_FACTOR, PLANET_MAX_GRAVITY } from '../../src/config.js';
import { createWorld, step } from '../../src/core/world.js';
import { triad } from '../../src/data/maps/triad.js';

const { planets, width, height } = triad;
const CENTER = { x: 1300, y: 1200 };
const TOL = 2; // px : coordonnées arrondies à l'entier
const MIN_GAP = 120; // px entre deux surfaces : couloirs praticables pour l'IA et le joueur
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('carte triad', () => {
  it('est valide pour createWorld, avec 3 spawns posés sur 3 bases', () => {
    const world = createWorld(triad, 1, { eventCapacity: 64 });
    expect(world.ships.map((s) => s.landedOn)).toEqual([0, 1, 2]);
    expect(world.planets.slice(0, 3).map((p) => p.owner)).toEqual([0, 1, 2]);
    expect(world.planets.slice(3).every((p) => p.owner === -1)).toBe(true);
  });

  it('toutes les planètes sont dans la carte, marge de 30 px incluse', () => {
    for (const p of planets) {
      expect(p.x - p.radius).toBeGreaterThanOrEqual(30);
      expect(width - p.x - p.radius).toBeGreaterThanOrEqual(30);
      expect(p.y - p.radius).toBeGreaterThanOrEqual(30);
      expect(height - p.y - p.radius).toBeGreaterThanOrEqual(30);
    }
  });

  it('surfaces espacées d au moins 120 px, portées de gravité disjointes', () => {
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const d = dist(planets[i], planets[j]);
        const a = planets[i];
        const b = planets[j];
        expect(d - a.radius - b.radius, `${i}/${j} gap`).toBeGreaterThanOrEqual(MIN_GAP);
        expect(d, `${i}/${j} portées`).toBeGreaterThanOrEqual(
          GRAVITY_RANGE_FACTOR * (a.radius + b.radius),
        );
      }
    }
  });

  it('gravité de surface sous le plafond : le décollage reste possible', () => {
    for (const p of planets) expect(p.gravity).toBeLessThanOrEqual(PLANET_MAX_GRAVITY);
  });

  it('symétrie d ordre 3 : la rotation de 120° autour du centre envoie chaque planète sur une autre identique', () => {
    const c = Math.cos((2 * Math.PI) / 3);
    const s = Math.sin((2 * Math.PI) / 3);
    for (const p of planets) {
      const dx = p.x - CENTER.x;
      const dy = p.y - CENTER.y;
      const r = { x: CENTER.x + dx * c - dy * s, y: CENTER.y + dx * s + dy * c };
      const twin = planets.find((q) => dist(q, r) <= TOL);
      expect(twin, `image de (${p.x}, ${p.y})`).toBeDefined();
      expect(twin.radius).toBe(p.radius);
      expect(twin.gravity).toBe(p.gravity);
      expect(twin.owner === undefined).toBe(p.owner === undefined);
    }
  });

  it('équité : chaque base voit les mêmes distances triées vers les neutres', () => {
    const neutrals = planets.filter((p) => p.owner === undefined);
    const profile = (base) =>
      neutrals
        .map((n) => dist(base, n))
        .sort((a, b) => a - b)
        .map(Math.round);
    const [p0, p1, p2] = [profile(planets[0]), profile(planets[1]), profile(planets[2])];
    for (let k = 0; k < p0.length; k++) {
      expect(Math.abs(p1[k] - p0[k]), `rang ${k}`).toBeLessThanOrEqual(TOL * 2);
      expect(Math.abs(p2[k] - p0[k]), `rang ${k}`).toBeLessThanOrEqual(TOL * 2);
    }
  });

  it('3 bots pendant 60 s : aucun NaN, vaisseaux dans la carte', () => {
    const world = createWorld(triad, 3, { eventCapacity: 256, bots: [0, 1, 2] });
    for (let i = 0; i < 60 / FIXED_DT; i++) step(world, FIXED_DT);
    for (const ship of world.ships) {
      expect(Number.isFinite(ship.pos.x + ship.pos.y + ship.hp)).toBe(true);
      expect(ship.pos.x).toBeGreaterThanOrEqual(0);
      expect(ship.pos.x).toBeLessThanOrEqual(width);
      expect(ship.pos.y).toBeGreaterThanOrEqual(0);
      expect(ship.pos.y).toBeLessThanOrEqual(height);
    }
  });
});
