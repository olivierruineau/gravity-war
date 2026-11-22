import { describe, expect, it } from 'vitest';
import { PLANET_MAX_GRAVITY } from '../../src/config.js';
import { gravityAt } from '../../src/core/gravity.js';
import { createWorld } from '../../src/core/world.js';
import { arena } from '../../src/data/maps/arena.js';

// Validité de la carte `arena` (ADR 0003 §1), vérifiée sur ses données.

// Rayon de collision du vaisseau (ADR 0003 §4). Constante locale : SHIP_COLLISION_RADIUS n'existe pas encore.
const SHIP_COLLISION_RADIUS = 6;
// Écart minimal entre surfaces de deux planètes : de quoi faire passer un vaisseau entre elles.
const PAIR_MARGIN = 2 * SHIP_COLLISION_RADIUS;
// Distance minimale centre-spawn / centre-planète au-delà de `radius + 6 + 20`, soit 26 px entre surfaces.
const SPAWN_SURFACE_CLEARANCE = SHIP_COLLISION_RADIUS + 20;
const MIN_RADIUS = 30;
const MAX_RADIUS = 90;
const MIN_PLANETS = 3;
const SURFACE_SAMPLES = 16;
// Décalage radial pour rester dans le cas « surface » (d > r) sans tomber dans la zone bornée par max(d, r).
const SURFACE_OFFSET = 1e-6;

const world = createWorld(arena, 1, { eventCapacity: 8 });
const planets = world.planets;
const defs = arena.planets;

function label(i) {
  const { x, y, radius } = defs[i];
  return `planète ${i} (${x}, ${y}, r=${radius})`;
}

/** Marge minimale au bord de la carte (négative si la planète dépasse) et le côté concerné. */
function worstEdgeMargin(p) {
  const margins = {
    gauche: p.pos.x - p.radius,
    haut: p.pos.y - p.radius,
    droite: arena.width - p.pos.x - p.radius,
    bas: arena.height - p.pos.y - p.radius,
  };
  let side = 'gauche';
  for (const key of Object.keys(margins)) {
    if (margins[key] < margins[side]) side = key;
  }
  return { side, margin: margins[side] };
}

/** Plus petite distance entre la surface de la planète `p` et le point (x, y). */
function surfaceDistance(p, x, y) {
  return Math.hypot(x - p.pos.x, y - p.pos.y) - p.radius;
}

/** Gravité totale maximale sur les points régulièrement espacés de la surface de la planète `i`. */
function worstSurfaceGravity(i) {
  const p = planets[i];
  const out = { x: 0, y: 0 };
  const d = p.radius + SURFACE_OFFSET;
  let worst = { mag: -Infinity, angle: 0 };
  for (let k = 0; k < SURFACE_SAMPLES; k++) {
    const angle = (2 * Math.PI * k) / SURFACE_SAMPLES;
    const pos = { x: p.pos.x + d * Math.cos(angle), y: p.pos.y + d * Math.sin(angle) };
    gravityAt(out, pos, planets);
    const mag = Math.hypot(out.x, out.y);
    if (mag > worst.mag) worst = { mag, angle };
  }
  return worst;
}

describe('carte arena : planètes dans la carte', () => {
  planets.forEach((p, i) => {
    it(`${label(i)} est entièrement dans la carte`, () => {
      const { side, margin } = worstEdgeMargin(p);
      expect(margin, `dépasse le bord ${side} de ${-margin} px`).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('carte arena : planètes disjointes', () => {
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      it(`planètes ${i} et ${j} : écart de surface ≥ ${PAIR_MARGIN} px`, () => {
        const a = planets[i];
        const b = planets[j];
        const gap = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) - a.radius - b.radius;
        expect(gap, `écart ${gap} px, manque ${PAIR_MARGIN - gap} px`).toBeGreaterThanOrEqual(
          PAIR_MARGIN,
        );
      });
    }
  }
});

describe('carte arena : spawns', () => {
  arena.spawns.forEach((s, i) => {
    it(`spawn ${i} (${s.x}, ${s.y}) est dans la carte`, () => {
      expect(s.x >= 0 && s.x <= arena.width && s.y >= 0 && s.y <= arena.height).toBe(true);
    });

    it(`spawn ${i} est à plus de ${SPAWN_SURFACE_CLEARANCE} px de la surface de toute planète`, () => {
      let nearest = { index: -1, distance: Infinity };
      planets.forEach((p, j) => {
        const distance = surfaceDistance(p, s.x, s.y);
        if (distance < nearest.distance) nearest = { index: j, distance };
      });
      expect(
        nearest.distance,
        `trop près de la planète ${nearest.index} : ${nearest.distance} px, manque ${SPAWN_SURFACE_CLEARANCE - nearest.distance} px`,
      ).toBeGreaterThan(SPAWN_SURFACE_CLEARANCE);
    });
  });
});

describe('carte arena : gravité', () => {
  defs.forEach((def, i) => {
    it(`${label(i)} : gravité explicite ≤ ${PLANET_MAX_GRAVITY}`, () => {
      expect(
        def.gravity,
        `gravité ${def.gravity} > plafond ${PLANET_MAX_GRAVITY} de ${def.gravity - PLANET_MAX_GRAVITY}`,
      ).toBeLessThanOrEqual(PLANET_MAX_GRAVITY);
    });

    it(`${label(i)} : gravité totale en surface ≤ ${PLANET_MAX_GRAVITY} en ${SURFACE_SAMPLES} points`, () => {
      const worst = worstSurfaceGravity(i);
      const angleDeg = ((worst.angle * 180) / Math.PI).toFixed(1);
      expect(
        worst.mag,
        `max ${worst.mag.toFixed(3)} à ${angleDeg}° dépasse ${PLANET_MAX_GRAVITY} de ${(worst.mag - PLANET_MAX_GRAVITY).toFixed(3)}`,
      ).toBeLessThanOrEqual(PLANET_MAX_GRAVITY);
    });
  });
});

describe('carte arena : composition', () => {
  it(`contient au moins ${MIN_PLANETS} planètes (joueur + 2 bots)`, () => {
    expect(planets.length).toBeGreaterThanOrEqual(MIN_PLANETS);
  });

  planets.forEach((p, i) => {
    it(`${label(i)} : rayon entre ${MIN_RADIUS} et ${MAX_RADIUS}`, () => {
      expect(
        p.radius >= MIN_RADIUS && p.radius <= MAX_RADIUS,
        `rayon ${p.radius} hors de [${MIN_RADIUS}, ${MAX_RADIUS}]`,
      ).toBe(true);
    });
  });
});
