import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT, SHIP_ROTATION_SPEED, SHIP_THRUST } from '../../src/config.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Mini-carte en ligne, immense : aucun mur ni planète ne perturbe le vol.
// Spawn à angle 0 : le nez pointe vers +x, donc la trajectoire est sur l'axe x.
const X0 = 50000;
const Y0 = 50000;
const MAP = {
  width: 100000,
  height: 100000,
  planets: [],
  spawns: [{ x: X0, y: Y0, angle: 0 }],
};
const OPTIONS = { eventCapacity: EVENT_CAPACITY };

const ROT_STEP = SHIP_ROTATION_SPEED * FIXED_DT; // rad par pas de rotation
const ACC_STEP = SHIP_THRUST * FIXED_DT; // px/s gagnés par pas de poussée

function makeWorld(seed = 1, map = MAP) {
  return createWorld(map, seed, OPTIONS);
}

/** Avance de `steps` pas avec une intention constante écrite avant chaque pas. */
function run(world, steps, { rotate = 0, thrust = false } = {}) {
  const { intent } = world.ships[0];
  for (let i = 0; i < steps; i++) {
    intent.rotate = rotate;
    intent.thrust = thrust;
    step(world, FIXED_DT);
  }
}

describe('vol : inertie (aucun frein)', () => {
  it('sans poussée, la vitesse reste constante et la position avance linéairement', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    const pushSteps = 30;
    const coastSteps = 120;

    run(world, pushSteps, { thrust: true });
    const vx = ship.vel.x;
    const vy = ship.vel.y;
    const xBefore = ship.pos.x;
    const yBefore = ship.pos.y;
    expect(vx).toBeGreaterThan(0);

    let prevX = xBefore;
    for (let i = 0; i < coastSteps; i++) {
      run(world, 1);
      // Aucune opération sur vel pendant la glisse : égalité exacte.
      expect(ship.vel.x).toBe(vx);
      expect(ship.vel.y).toBe(vy);
      // Déplacement par pas = vx·dt. Positions ~5e4 (ulp ~7e-12) : 8 décimales (5e-9) sont sûres.
      expect(ship.pos.x - prevX).toBeCloseTo(vx * FIXED_DT, 8);
      prevX = ship.pos.x;
    }

    // 120 additions sur ~5e4 : erreur cumulée < 1e-9, donc 6 décimales (5e-7) avec marge.
    expect(ship.pos.x).toBeCloseTo(xBefore + vx * coastSteps * FIXED_DT, 6);
    expect(ship.pos.y).toBeCloseTo(yBefore + vy * coastSteps * FIXED_DT, 6);
  });

  it('une poussée ne s’arrête pas d’elle-même : la vitesse ne retombe jamais en glissant', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    run(world, 60, { thrust: true });
    const speed = Math.hypot(ship.vel.x, ship.vel.y);
    run(world, 600);
    expect(Math.hypot(ship.vel.x, ship.vel.y)).toBe(speed);
  });
});

describe('vol : poussée constante depuis le repos', () => {
  // Euler semi-implicite (v += a·dt puis p += v·dt) : après N pas, v = N·a·dt exactement et
  // p = a·dt²·N(N+1)/2. Par rapport à ½·a·t² (t = N·dt), l'écart est donc ½·a·t·dt, soit O(dt),
  // et le schéma surestime toujours légèrement.
  it.each([0.5, 1, 2, 5])('pendant %s s : v ≈ a·t et distance ≈ ½·a·t²', (seconds) => {
    const world = makeWorld();
    const ship = world.ships[0];
    const steps = Math.round(seconds / FIXED_DT);
    const t = steps * FIXED_DT;
    run(world, steps, { thrust: true });

    // Vitesse : exacte à l'arrondi près (≤ 300 additions de ~2,3, erreur < 1e-12) → 9 décimales.
    expect(ship.vel.x).toBeCloseTo(SHIP_THRUST * t, 9);
    expect(ship.vel.y).toBeCloseTo(0, 9); // sin(0) = 0 : aucune dérive latérale

    const distance = ship.pos.x - X0;
    const continuous = 0.5 * SHIP_THRUST * t * t;
    const eulerError = 0.5 * SHIP_THRUST * t * FIXED_DT;
    // Formule discrète exacte (marge d'arrondi : positions ~5e4, ulp ~7e-12) → 6 décimales.
    expect(distance).toBeCloseTo(continuous + eulerError, 6);
    // Écart au continu borné par l'erreur d'Euler O(dt) et de signe positif.
    expect(distance).toBeGreaterThan(continuous);
    expect(distance - continuous).toBeLessThanOrEqual(eulerError + 1e-6);
    expect(ship.pos.y).toBeCloseTo(Y0, 9);
  });
});

describe('vol : manœuvre de freinage (180° puis poussée)', () => {
  // Le demi-tour dure ceil(π / (ω·dt)) pas : l'angle final dépasse π d'au plus un pas de rotation
  // (ω·dt ≈ 0,053 rad). La poussée de freinage a donc un défaut d'alignement ε ∈ [0, ω·dt) :
  //   vitesse résiduelle = v0·sqrt(2 − 2·cos ε) ≈ v0·ε  ≤  v0·ω·dt.
  it.each([
    ['droite', 1],
    ['gauche', -1],
  ])('accélérer, demi-tour par la %s, pousser autant : vitesse finale ≈ 0', (_label, rotate) => {
    const world = makeWorld();
    const ship = world.ships[0];
    const thrustSteps = 60;
    const turnSteps = Math.ceil(Math.PI / ROT_STEP);

    run(world, thrustSteps, { thrust: true });
    const v0 = Math.hypot(ship.vel.x, ship.vel.y);
    expect(v0).toBeCloseTo(thrustSteps * ACC_STEP, 9);

    run(world, turnSteps, { rotate });
    // La rotation seule n'a pas touché la vitesse, et le nez pointe (à ε près) vers -x.
    expect(Math.hypot(ship.vel.x, ship.vel.y)).toBeCloseTo(v0, 9);
    const heading = Math.atan2(ship.vel.y, ship.vel.x);
    expect(heading).toBeCloseTo(0, 9);
    const epsilon = turnSteps * ROT_STEP - Math.PI;
    expect(epsilon).toBeGreaterThanOrEqual(0);
    expect(epsilon).toBeLessThan(ROT_STEP);

    run(world, thrustSteps, { thrust: true });
    const residual = Math.hypot(ship.vel.x, ship.vel.y);
    // Valeur attendue exacte de la formule ci-dessus (arrondi flottant seul : 9 décimales).
    expect(residual).toBeCloseTo(v0 * Math.sqrt(2 - 2 * Math.cos(epsilon)), 9);
    // Borne de la tolérance : le défaut d'alignement est quantifié par le pas.
    expect(residual).toBeLessThan(v0 * ROT_STEP);
    // Et c'est bien un freinage : moins de 6 % de la vitesse initiale (v0·ω·dt / v0 ≈ 5,3 %).
    expect(residual / v0).toBeLessThan(0.06);
  });

  it('un demi-tour en ne poussant que la moitié du temps divise la vitesse par deux (± quantification)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    run(world, 60, { thrust: true });
    const v0 = ship.vel.x;
    run(world, Math.ceil(Math.PI / ROT_STEP), { rotate: 1 });
    run(world, 30, { thrust: true });
    // Composante x : v0 + 30·a·dt·cos(π+ε) = v0·(1 − 0,5·cos ε) = v0/2 + 0,5·v0·(1 − cos ε).
    // ε < ω·dt ≈ 0,053 donc l'écart à v0/2 est au plus 0,5·v0·(ε²/2) ≈ 0,1 px/s (0,15 % de v0).
    const maxGap = 0.5 * v0 * (0.5 * ROT_STEP * ROT_STEP);
    expect(ship.vel.x - v0 / 2).toBeGreaterThanOrEqual(0);
    expect(ship.vel.x - v0 / 2).toBeLessThanOrEqual(maxGap + 1e-9);
  });
});

describe('vol : vaisseau mort', () => {
  const TWO_SHIPS = {
    ...MAP,
    spawns: [
      { x: X0, y: Y0, angle: 0 },
      { x: X0 + 1000, y: Y0, angle: 0 },
    ],
  };

  it('n’est ni déplacé, ni accéléré, ni tourné, même avec une intention active', () => {
    const world = makeWorld(1, TWO_SHIPS);
    const [alive, dead] = world.ships;
    dead.alive = false;
    dead.vel.x = 25;
    dead.vel.y = -10;
    const snapshot = () => JSON.stringify({ ...dead, intent: null });
    const before = snapshot();

    for (let i = 0; i < 100; i++) {
      // Intentions écrites sur les deux vaisseaux, y compris le mort (intent exclu de la comparaison ci-dessous).
      for (const ship of world.ships) {
        ship.intent.thrust = true;
        ship.intent.rotate = 1;
      }
      step(world, FIXED_DT);
    }

    expect(snapshot()).toBe(before);
    // Le vaisseau vivant, lui, a bien évolué : le test ne passe pas par un monde figé.
    expect(alive.vel.x).not.toBe(0);
    expect(alive.pos.x).not.toBe(X0);
    expect(world.tick).toBe(100);
  });

  it('un vaisseau mort depuis le repos reste à sa position initiale', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.alive = false;
    run(world, 120, { thrust: true });
    expect(ship.pos).toEqual({ x: X0, y: Y0 });
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('vol : rotation seule', () => {
  it('ne modifie ni la vitesse ni la position depuis le repos', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    run(world, 200, { rotate: 1 });
    expect(ship.vel).toEqual({ x: 0, y: 0 });
    expect(ship.pos).toEqual({ x: X0, y: Y0 });
    expect(ship.angle).not.toBe(0);
  });

  it('ne modifie pas la vitesse en vol : le cap change, la trajectoire reste rectiligne', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    run(world, 40, { thrust: true });
    const { x: vx, y: vy } = ship.vel;
    const x0 = ship.pos.x;
    const turnSteps = 100;
    run(world, turnSteps, { rotate: -1 });
    expect(ship.vel).toEqual({ x: vx, y: vy });
    expect(ship.pos.y).toBe(Y0); // vy = 0 : exactement aucune dérive
    // 100 additions de vx·dt sur ~5e4 : erreur cumulée < 1e-9 → 6 décimales.
    expect(ship.pos.x - x0).toBeCloseTo(vx * turnSteps * FIXED_DT, 6);
  });
});

describe('vol : déterminisme', () => {
  // Script d'intentions alimenté par world.rng : la seed influence réellement la trajectoire.
  function fly(seed, steps = 600) {
    const world = makeWorld(seed);
    const { intent } = world.ships[0];
    for (let i = 0; i < steps; i++) {
      intent.rotate = int(world.rng, -1, 2);
      intent.thrust = world.tick % 7 < 4;
      intent.fire = world.tick % 11 === 0;
      step(world, FIXED_DT);
    }
    return world;
  }

  it('deux mondes de même seed et même script ont un JSON strictement identique', () => {
    const a = fly(2024);
    const b = fly(2024);
    expect(a.tick).toBe(600);
    expect(a.ships[0].pos.x).not.toBe(X0); // le vaisseau a réellement volé
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('deux seeds différentes donnent des trajectoires différentes', () => {
    expect(JSON.stringify(fly(1).ships[0])).not.toBe(JSON.stringify(fly(2).ships[0]));
  });

  it('la trajectoire reste finie sur une longue simulation', () => {
    const ship = fly(7, 5000).ships[0];
    for (const v of [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.angle]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
