import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_COLLISION_RADIUS } from '../../src/config.js';
import { gravityAt } from '../../src/core/gravity.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';
import { arena } from '../../src/data/maps/arena.js';

// Chevauchement de zones de gravité (ADR 0004) : la grosse planète 3 de `arena` (r = 90, g0 = 65)
// et la petite planète 8 nichée dans sa zone (r = 30, g0 = 50, à 350 px). Mini-carte à ces deux seules
// planètes : les autres planètes d'`arena` (la 2 à portée de la bordure basse de la zone de la 8) ne
// doivent pas polluer les mesures.

const BIG_DEF = arena.planets[3];
const SMALL_DEF = arena.planets[8];
const OPTIONS = { eventCapacity: 8 };
const TWO_PI = 2 * Math.PI;

const MAP = {
  width: arena.width,
  height: arena.height,
  planets: [BIG_DEF, SMALL_DEF],
  spawns: [{ x: 100, y: 100, angle: 0 }],
};

function makeWorld(seed = 1) {
  return createWorld(MAP, seed, OPTIONS);
}

const { planets: PLANETS } = makeWorld();
const [BIG, SMALL] = PLANETS;

const accel = (pos, planets = PLANETS) => gravityAt({ x: 0, y: 0 }, pos, planets);
const norm = (v) => Math.hypot(v.x, v.y);
const distTo = (pos, planet) => Math.hypot(pos.x - planet.pos.x, pos.y - planet.pos.y);

it('préconditions : la petite planète est bien nichée dans la zone de la grosse', () => {
  // Si arena.js change, ces scénarios n'ont plus de sens : mieux vaut échouer ici, explicitement.
  expect(BIG.radius).toBe(90);
  expect(SMALL.radius).toBe(30);
  expect(distTo(SMALL.pos, BIG)).toBe(350);
  // Le centre de la petite est dans la zone de la grosse (350 < 450), et sa zone déborde de celle de la grosse.
  expect(distTo(SMALL.pos, BIG)).toBeLessThan(BIG.range);
  expect(distTo(SMALL.pos, BIG) + SMALL.range).toBeGreaterThan(BIG.range);
  expect(distTo(SMALL.pos, BIG) - SMALL.range).toBeGreaterThan(BIG.radius); // zone de la petite hors de la grosse
});

describe('chevauchement : continuité numérique de gravityAt', () => {
  const STEP = 0.05; // px, pas d'échantillonnage de l'ADR 0004
  // Gradient maximal attendu ≈ 3,5 px/s² par px (près de la surface de la petite), soit ≈ 0,17 px/s² par pas
  // de 0,05 px. Un saut (coupure franche, discontinuité de sommation) vaudrait au moins ~2 px/s² : 0,5 sépare
  // nettement les deux cas et laisse une marge ×3 sur le gradient attendu.
  const MAX_JUMP = 0.5;

  /** Signature des zones occupées : exercice effectif des frontières le long du chemin. */
  function zoneState(pos) {
    const dBig = distTo(pos, BIG);
    const dSmall = distTo(pos, SMALL);
    return `${dBig < BIG.range ? 'G' : '-'}${dSmall < SMALL.range ? 'p' : '-'}${dSmall <= SMALL.radius ? 'C' : '-'}`;
  }

  /** Parcourt le segment [from, to] au pas de 0,05 px ; renvoie le plus grand écart entre échantillons consécutifs. */
  function scan(from, to) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.ceil(length / STEP);
    const pos = { x: 0, y: 0 };
    const prev = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const states = new Set();
    let maxJump = 0;
    for (let i = 0; i <= n; i++) {
      pos.x = from.x + ((to.x - from.x) * i) / n;
      pos.y = from.y + ((to.y - from.y) * i) / n;
      gravityAt(cur, pos, PLANETS);
      states.add(zoneState(pos));
      expect(Number.isFinite(cur.x) && Number.isFinite(cur.y)).toBe(true);
      if (i > 0) maxJump = Math.max(maxJump, Math.hypot(cur.x - prev.x, cur.y - prev.y));
      prev.x = cur.x;
      prev.y = cur.y;
    }
    return { maxJump, states };
  }

  it('axe x = 1200 de y = 740 à y = 490 : surface de la petite, bord de sa zone, surface de la grosse', () => {
    // Départ dans la petite (sans passer par son centre, où la direction s'inverse déjà dans l'ADR 0003),
    // arrivée sur la surface de la grosse (y = 400 + 90).
    const { maxJump, states } = scan({ x: 1200, y: 740 }, { x: 1200, y: 490 });
    // Les trois régimes ont été traversés : dans la petite, dans les deux zones, dans la grosse seule.
    expect(states.has('GpC')).toBe(true);
    expect(states.has('Gp-')).toBe(true);
    expect(states.has('G--')).toBe(true);
    expect(maxJump).toBeLessThan(MAX_JUMP);
  });

  it('transversale y = 700 de x = 800 à x = 1600 : bords des deux zones, sans toucher la petite', () => {
    const { maxJump, states } = scan({ x: 800, y: 700 }, { x: 1600, y: 700 });
    // Hors de toute zone, grosse seule, deux zones : les quatre frontières (2 par planète) sont franchies.
    expect(states.has('---')).toBe(true);
    expect(states.has('G--')).toBe(true);
    expect(states.has('Gp-')).toBe(true);
    expect(maxJump).toBeLessThan(MAX_JUMP);
  });

  it('axe x = 1200 de y = 900 à y = 775 : bord de la grosse en y = 850 et bord de la petite en y = 900', () => {
    const { maxJump, states } = scan({ x: 1200, y: 900 }, { x: 1200, y: 775 });
    // En y = 900 on est pile sur le bord de la zone de la petite ; la zone de la grosse se termine à y = 850.
    expect(states.has('-p-')).toBe(true);
    expect(states.has('Gp-')).toBe(true);
    expect(states.has('GpC')).toBe(true);
    expect(maxJump).toBeLessThan(MAX_JUMP);
  });

  it('segment oblique qui frôle la surface de la petite côté grosse : continu aussi', () => {
    // Passe à ~38 px du centre de la petite (surface à 30) et traverse son bord de zone des deux côtés.
    const { maxJump, states } = scan({ x: 1050, y: 640 }, { x: 1350, y: 790 });
    expect(states.has('Gp-')).toBe(true);
    expect(maxJump).toBeLessThan(MAX_JUMP);
  });
});

describe('chevauchement : la petite planète domine sa zone', () => {
  it('la grosse ne domine qu’au plus ~12 % de la couronne r < d < R de la petite (grille de 5 px)', () => {
    const aBig = { x: 0, y: 0 };
    const aSmall = { x: 0, y: 0 };
    const a = { x: 0, y: 0 };
    const { x: cx, y: cy } = SMALL.pos;
    let total = 0;
    let bigDominates = 0;
    // Domination : le champ réel est plus proche de celui de la planète seule que de l'autre
    // (équivalent à s > ½ pour la combinaison convexe).
    for (let x = cx - SMALL.range; x <= cx + SMALL.range; x += 5) {
      for (let y = cy - SMALL.range; y <= cy + SMALL.range; y += 5) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= SMALL.radius || d >= SMALL.range) continue;
        const pos = { x, y };
        gravityAt(a, pos, PLANETS);
        gravityAt(aBig, pos, [BIG]);
        gravityAt(aSmall, pos, [SMALL]);
        total++;
        if (Math.hypot(a.x - aSmall.x, a.y - aSmall.y) >= Math.hypot(a.x - aBig.x, a.y - aBig.y))
          bigDominates++;
      }
    }
    // ~2700 points : l'erreur de discrétisation de l'aire est ≪ 1 %. Part observée de la grosse ≈ 11,6 %
    // (l'ADR annonce ~88 % dominé par la petite) ; la somme de l'ADR 0003 en donnait ~40 %.
    expect(total).toBeGreaterThan(2500);
    expect(bigDominates / total).toBeLessThanOrEqual(0.12);
  });

  it('au contact de la petite, la grosse pèse moins de 0,1 % (ADR : 34,08 contre 34,09 px/s²)', () => {
    const pos = { x: 1200, y: SMALL.pos.y - (SMALL.radius + 6) }; // côté grosse : le pire cas
    const both = accel(pos);
    const alone = accel(pos, [SMALL]);
    // Écart relatif observé ≈ 3e-4 (0,03 % annoncé) ; 1e-3 laisse un facteur ×3.
    expect(Math.hypot(both.x - alone.x, both.y - alone.y) / norm(alone)).toBeLessThan(1e-3);
  });

  it('au repos à 3,33·r côté grosse, le vaisseau est attiré vers la petite (la somme le tirait vers la grosse)', () => {
    // ADR 0004 §2 : +0,84 px/s² vers la petite (somme de l'ADR 0003 : −3,46, donc vers la grosse).
    const world = makeWorld();
    const ship = world.ships[0];
    ship.pos.x = SMALL.pos.x;
    ship.pos.y = SMALL.pos.y - 100;
    ship.vel.x = 0;
    ship.vel.y = 0;
    for (let i = 0; i < 60; i++) step(world, FIXED_DT);
    // ~0,84 px/s² pendant 1 s (légèrement croissant en descendant) : ≈ +0,85 px/s vers la petite (y croissant).
    expect(ship.vel.y).toBeGreaterThan(0.5);
    expect(ship.vel.y).toBeLessThan(1.5);
    expect(ship.vel.x).toBeCloseTo(0, 9); // axe de symétrie des deux planètes : aucune dérive latérale
  });
});

describe('chevauchement : orbite autour de la petite planète nichée', () => {
  const D = 2 * SMALL.radius;
  const TURNS = 10;

  it('la perturbation de la grosse sur le cercle d = 2·r reste sous 3 % de a₈ (ADR : ~2 %)', () => {
    let worst = 0;
    for (let k = 0; k < 360; k++) {
      const t = (k * TWO_PI) / 360;
      const pos = { x: SMALL.pos.x + D * Math.cos(t), y: SMALL.pos.y + D * Math.sin(t) };
      const both = accel(pos);
      const alone = accel(pos, [SMALL]);
      worst = Math.max(worst, Math.hypot(both.x - alone.x, both.y - alone.y) / norm(alone));
    }
    // Maximum observé ≈ 1,8 % côté grosse (35 % avec la somme) ; 3 % laisse une marge sur la discrétisation à 1°.
    expect(worst).toBeLessThan(0.03);
    expect(worst).toBeGreaterThan(0.001); // la grosse est bien présente (sinon le test serait trivial)
  });

  /** Orbite circulaire à D de la petite, départ à `angle`, v_circ lue via gravityAt avec la petite seule. */
  function orbit(angle) {
    const world = makeWorld();
    const small = world.planets[1];
    const big = world.planets[0];
    const a = accel({ x: small.pos.x + D, y: small.pos.y }, [small]);
    const v = Math.sqrt(D * norm(a));
    const ship = world.ships[0];
    ship.pos.x = small.pos.x + D * Math.cos(angle);
    ship.pos.y = small.pos.y + D * Math.sin(angle);
    ship.vel.x = -v * Math.sin(angle);
    ship.vel.y = v * Math.cos(angle);
    const total = Math.round(((TWO_PI * D) / v / FIXED_DT) * TURNS);
    let dMin = D;
    let dMax = D;
    let minBigClearance = Infinity;
    let prevTheta = angle;
    let unwound = 0;
    for (let i = 0; i < total; i++) {
      step(world, FIXED_DT);
      const d = distTo(ship.pos, small);
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
      minBigClearance = Math.min(minBigClearance, distTo(ship.pos, big) - big.radius);
      expect(ship.alive).toBe(true);
      expect(d).toBeGreaterThan(small.radius + SHIP_COLLISION_RADIUS); // jamais de contact
      const theta = Math.atan2(ship.pos.y - small.pos.y, ship.pos.x - small.pos.x);
      let dTheta = theta - prevTheta;
      if (dTheta > Math.PI) dTheta -= TWO_PI;
      if (dTheta < -Math.PI) dTheta += TWO_PI;
      unwound += dTheta;
      prevTheta = theta;
    }
    return { total, dMin, dMax, turns: unwound / TWO_PI, minBigClearance };
  }

  // Départs vers la grosse (haut, −y), à l'opposé, et sur les côtés : la marée de la grosse varie sur l'orbite.
  it.each([
    ['côté grosse', -Math.PI / 2],
    ['côté opposé', Math.PI / 2],
    ['côté droit', 0],
    ['côté gauche', Math.PI],
  ])('rayon à ±10 %% sur 10 tours (départ %s)', (_label, angle) => {
    const t = orbit(angle);
    expect(t.total).toBeGreaterThan(8000); // ~883 pas par tour : le test a vraiment tourné
    // 10 tours réellement parcourus à 4 % près : observé ~2,5 % (v_circ est celle de la petite seule, le
    // champ réel du monde à deux planètes diffère de ~1 % et la vitesse angulaire de même ; Euler : < 0,5 %).
    expect(Math.abs(t.turns - TURNS) / TURNS).toBeLessThan(0.04);
    // Observé : de −5,5 % à +7,5 % (orbite autour de la petite seule : ±0,5 %). La différence est la
    // perturbation non conservative de la grosse (≤ 2 % de a₈) accumulée sur 10 tours ; borne de l'ADR : ±10 %.
    expect(t.dMin).toBeGreaterThan(D * 0.9);
    expect(t.dMax).toBeLessThan(D * 1.1);
    // Garde-fou : jamais près de la grosse. Géométrie : 350 − 90 (rayon de la grosse) − 60 (rayon d'orbite)
    // = 200 px de surface à surface, moins l'excursion radiale (≤ 7,5 % de 60 px) ; 180 est donc sûr.
    expect(t.minBigClearance).toBeGreaterThan(180);
  });
});

describe('chevauchement : déterminisme', () => {
  const STEPS = 3000;

  /** Vol scripté (rotation tirée dans world.rng, poussée par rafales) dans la zone commune des deux planètes. */
  function fly(seed) {
    const world = makeWorld(seed);
    const ship = world.ships[0];
    ship.pos.x = 1200;
    ship.pos.y = 650; // d = 100 de la petite : dans les deux zones, vitesse tangentielle ~ orbitale
    ship.vel.x = 20;
    ship.vel.y = 0;
    let overlapSteps = 0;
    for (let i = 0; i < STEPS; i++) {
      ship.intent.rotate = int(world.rng, -1, 2);
      ship.intent.thrust = world.tick % 90 < 1; // poussée brève : le vaisseau reste dans le champ
      step(world, FIXED_DT);
      if (distTo(ship.pos, BIG) < BIG.range && distTo(ship.pos, SMALL) < SMALL.range)
        overlapSteps++;
    }
    return { world, overlapSteps };
  }

  it('même seed et même script : JSON identique après 3000 pas, état fini, chevauchement réellement parcouru', () => {
    const a = fly(7);
    const b = fly(7);
    expect(a.world.tick).toBe(STEPS);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    const ship = a.world.ships[0];
    for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Le vol passe une part significative du temps dans le chevauchement (la moyenne pondérée est exercée).
    expect(a.overlapSteps).toBeGreaterThan(200); // ~300 observés avant de quitter la zone commune
  });

  it('une autre seed donne une trajectoire différente', () => {
    expect(JSON.stringify(fly(7).world.ships[0])).not.toBe(JSON.stringify(fly(8).world.ships[0]));
  });
});
