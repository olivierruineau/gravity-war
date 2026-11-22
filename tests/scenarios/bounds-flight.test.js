import { describe, expect, it } from 'vitest';
import {
  BOUNDS_RESTITUTION,
  EVENT_CAPACITY,
  FIXED_DT,
  SHIP_SIZE,
  SHIP_THRUST,
} from '../../src/config.js';
import { createWorld, step } from '../../src/core/world.js';

// Petite carte : le vaisseau part de x = 100, nez vers +x (angle 0), et pousse plein gaz contre le mur de droite.
const WIDTH = 400;
const HEIGHT = 400;
const MAP = {
  width: WIDTH,
  height: HEIGHT,
  planets: [],
  spawns: [{ x: 100, y: 200, angle: 0 }],
};
const STEPS = 600;

// Bornes du centre du vaisseau, telles que applyBounds les applique avec rayon SHIP_SIZE.
const X_MIN = SHIP_SIZE;
const X_MAX = WIDTH - SHIP_SIZE;
const Y_MIN = SHIP_SIZE;
const Y_MAX = HEIGHT - SHIP_SIZE;

/**
 * Rejoue le vol plein gaz et relève la position et la vitesse x après chaque pas.
 * Le premier pas où le vaisseau est ramené sur X_MAX est le premier rebond : on y note
 * la vitesse d'impact reconstruite et la vitesse sortante.
 */
function flyIntoRightWall() {
  const world = createWorld(MAP, 1, { eventCapacity: EVENT_CAPACITY });
  const ship = world.ships[0];
  const trace = [];
  let impact = null;
  for (let i = 0; i < STEPS; i++) {
    ship.intent.rotate = 0;
    ship.intent.thrust = true;
    const vxBefore = ship.vel.x;
    step(world, FIXED_DT);
    trace.push({ x: ship.pos.x, y: ship.pos.y, vx: ship.vel.x });
    if (impact === null && ship.pos.x === X_MAX) {
      // La vitesse d'impact n'est pas exposée par le monde : elle est reconstruite comme la vitesse
      // avant le pas plus SHIP_THRUST·dt, soit exactement l'arithmétique d'applyIntent (nez à 0 rad,
      // aucune autre force). Ce n'est donc qu'un arrondi flottant : 9 décimales (5e-10) suffisent.
      impact = {
        step: i,
        speed: vxBefore + SHIP_THRUST * FIXED_DT,
        outgoing: ship.vel.x,
      };
    }
  }
  return { trace, impact };
}

const { trace, impact } = flyIntoRightWall();

describe('vol plein gaz contre un mur de carte', () => {
  it('le vaisseau percute bien le mur de droite pendant la simulation', () => {
    expect(impact).not.toBeNull();
    expect(impact.step).toBeGreaterThan(0);
  });

  it('ne sort jamais de [SHIP_SIZE, largeur - SHIP_SIZE] × [SHIP_SIZE, hauteur - SHIP_SIZE], à aucun pas', () => {
    expect(trace).toHaveLength(STEPS);
    const outside = trace.filter((p) => p.x < X_MIN || p.x > X_MAX || p.y < Y_MIN || p.y > Y_MAX);
    expect(outside).toEqual([]);
  });

  it('au premier rebond, la vitesse sort vers l’intérieur de la carte', () => {
    expect(impact.outgoing).toBeLessThan(0);
  });

  it('au premier rebond, la vitesse sortante vaut BOUNDS_RESTITUTION × la vitesse d’impact', () => {
    expect(Math.abs(impact.outgoing)).toBeCloseTo(BOUNDS_RESTITUTION * impact.speed, 9);
  });

  it('aucune vitesse ultérieure ne dépasse la vitesse d’impact (pas de gain d’énergie au rebond)', () => {
    const maxSpeed = Math.max(...trace.map((p) => Math.abs(p.vx)));
    expect(maxSpeed).toBeLessThanOrEqual(impact.speed + 1e-9);
  });
});
