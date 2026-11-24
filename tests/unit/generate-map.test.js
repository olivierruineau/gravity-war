import { describe, expect, it } from 'vitest';
import { GRAVITY_RANGE_FACTOR, PLANET_MAX_GRAVITY } from '../../src/config.js';
import { createWorld } from '../../src/core/world.js';
import { generateMap, MAP_HEIGHT, MAP_WIDTH } from '../../src/data/maps/generate.js';

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const CENTER = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('carte générée', () => {
  it('même graine, même carte ; graines différentes, cartes différentes', () => {
    expect(generateMap(42)).toEqual(generateMap(42));
    expect(generateMap(42)).not.toEqual(generateMap(43));
  });

  it('est valide pour createWorld : 3 bases possédées, spawns posés dessus, le reste neutre', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      const world = createWorld(map, seed, { eventCapacity: 64 });
      expect(
        world.ships.map((s) => s.landedOn),
        `seed ${seed}`,
      ).toEqual([0, 1, 2]);
      expect(world.planets.slice(0, 3).map((p) => p.owner)).toEqual([0, 1, 2]);
      expect(world.planets.slice(3).every((p) => p.owner === -1)).toBe(true);
      expect(world.inGame).toEqual([true, true, true]);
    }
  });

  it('assez de planètes pour jouer (au moins 3 bases + 3 neutres personnels)', () => {
    for (const seed of SEEDS)
      expect(generateMap(seed).planets.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
  });

  it('tout est dans la carte, surfaces à 120 px, portées de gravité disjointes, gravité jouable', () => {
    for (const seed of SEEDS) {
      const { planets, width, height } = generateMap(seed);
      for (const p of planets) {
        expect(p.x - p.radius).toBeGreaterThanOrEqual(60 - 1);
        expect(width - p.x - p.radius).toBeGreaterThanOrEqual(60 - 1);
        expect(p.y - p.radius).toBeGreaterThanOrEqual(60 - 1);
        expect(height - p.y - p.radius).toBeGreaterThanOrEqual(60 - 1);
        expect(p.gravity).toBeLessThanOrEqual(PLANET_MAX_GRAVITY);
      }
      for (let i = 0; i < planets.length; i++)
        for (let j = i + 1; j < planets.length; j++) {
          const d = dist(planets[i], planets[j]);
          const rr = planets[i].radius + planets[j].radius;
          expect(d - rr, `seed ${seed} ${i}/${j} écart`).toBeGreaterThanOrEqual(120 - 2);
          expect(d, `seed ${seed} ${i}/${j} portées`).toBeGreaterThanOrEqual(
            GRAVITY_RANGE_FACTOR * rr - 2,
          );
        }
    }
  });

  it('équitable : les trois bases sont à la même distance du centre, à 120°, et leurs voisinages se correspondent', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const { planets } = generateMap(seed);
      const bases = planets.slice(0, 3);
      const d0 = dist(bases[0], CENTER);
      for (const b of bases) expect(Math.abs(dist(b, CENTER) - d0)).toBeLessThan(2);
      // pour chaque planète, il existe une image tournée de 120° dans la carte (même rayon)
      for (const p of planets) {
        const a = Math.atan2(p.y - CENTER.y, p.x - CENTER.x) + (2 * Math.PI) / 3;
        const r = dist(p, CENTER);
        const image = { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r };
        const match = planets.some((q) => q.radius === p.radius && dist(q, image) < 3);
        expect(match, `seed ${seed} planète ${p.x},${p.y}`).toBe(true);
      }
    }
  });
});
