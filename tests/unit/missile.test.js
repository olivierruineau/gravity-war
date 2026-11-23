import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  MISSILE_DAMAGE,
  MISSILE_LIFETIME,
  MISSILE_SEEK_ANGLE,
  MISSILE_SEEK_RANGE,
  MISSILE_TURN_RATE,
  SHIP_COLLISION_RADIUS,
} from '../../src/config.js';
import { steerMissiles } from '../../src/core/missile.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { createShip } from '../../src/core/ship.js';
import { createWorld } from '../../src/core/world.js';

const MAX_TURN = MISSILE_TURN_RATE * FIXED_DT; // rad max par pas
const SPEED = 200;
const MX = 1000; // position du missile
const MY = 1000;
const FAR = -50000; // parking des vaisseaux inutilisés : très loin de tout
// Marge angulaire/radiale pour tester « juste dedans / juste dehors » sans dépendre de l'arrondi flottant.
const EPS_ANGLE = 1e-3;
const EPS_RANGE = 0.01;

// 3 vaisseaux (factions 0, 1, 2), tous garés hors de portée ; chaque test place ceux dont il a besoin.
function makeWorld() {
  return createWorld(
    {
      width: 100000,
      height: 100000,
      planets: [],
      spawns: [
        { x: FAR, y: FAR },
        { x: FAR, y: FAR },
        { x: FAR, y: FAR },
      ],
    },
    1,
    { eventCapacity: 16 },
  );
}

/** Place le vaisseau `i` à `dist` du missile, à l'écart angulaire `offset` du cap `heading`. */
function placeShip(world, i, heading, offset, dist) {
  world.ships[i].pos.x = MX + Math.cos(heading + offset) * dist;
  world.ships[i].pos.y = MY + Math.sin(heading + offset) * dist;
}

function addMissile(world, owner = 0, heading = 0, speed = SPEED, kind = KIND.MISSILE) {
  const index = spawnProjectile(
    world.projectiles,
    kind,
    owner,
    MX,
    MY,
    Math.cos(heading) * speed,
    Math.sin(heading) * speed,
    MISSILE_LIFETIME,
    MISSILE_DAMAGE,
  );
  return world.projectiles[index];
}

const headingOf = (m) => Math.atan2(m.vel.y, m.vel.x);
/** Écart signé (a − b) ramené dans [−π, π). */
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe('steerMissiles : acquisition de la cible', () => {
  it('sans aucune cible, rien ne change (ni vitesse ni position, ni durée de vie)', () => {
    const world = makeWorld();
    addMissile(world, 0, 0.4);
    const before = JSON.stringify(world.projectiles);
    steerMissiles(world, FIXED_DT);
    expect(JSON.stringify(world.projectiles)).toBe(before);
  });

  it('un ennemi dans le cône et à portée fait tourner le missile vers lui', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeGreaterThan(0); // l'ennemi est du côté +angle
  });

  it('virage dans le bon sens des deux côtés du cap', () => {
    for (const offset of [0.3, -0.3]) {
      const world = makeWorld();
      const m = addMissile(world, 0, 0);
      placeShip(world, 1, 0, offset, 200);
      steerMissiles(world, FIXED_DT);
      expect(Math.sign(headingOf(m))).toBe(Math.sign(offset));
    }
  });

  it('portée : juste dedans guide, juste dehors laisse la trajectoire inchangée', () => {
    const inside = makeWorld();
    const mIn = addMissile(inside, 0, 0);
    placeShip(inside, 1, 0, 0.2, MISSILE_SEEK_RANGE - EPS_RANGE);
    steerMissiles(inside, FIXED_DT);
    expect(headingOf(mIn)).toBeGreaterThan(0);

    const outside = makeWorld();
    const mOut = addMissile(outside, 0, 0);
    placeShip(outside, 1, 0, 0.2, MISSILE_SEEK_RANGE + EPS_RANGE);
    steerMissiles(outside, FIXED_DT);
    expect(mOut.vel.x).toBe(SPEED);
    expect(mOut.vel.y).toBe(0);
  });

  it.each([1, -1])(
    'cône (côté %i) : juste dans MISSILE_SEEK_ANGLE guide, juste au-delà est ignoré',
    (side) => {
      const inside = makeWorld();
      const mIn = addMissile(inside, 0, 0);
      placeShip(inside, 1, 0, side * (MISSILE_SEEK_ANGLE - EPS_ANGLE), 200);
      steerMissiles(inside, FIXED_DT);
      expect(Math.sign(headingOf(mIn))).toBe(side);

      const outside = makeWorld();
      const mOut = addMissile(outside, 0, 0);
      placeShip(outside, 1, 0, side * (MISSILE_SEEK_ANGLE + EPS_ANGLE), 200);
      steerMissiles(outside, FIXED_DT);
      expect(mOut.vel.x).toBe(SPEED);
      expect(mOut.vel.y).toBe(0);
    },
  );

  it('un ennemi derrière le missile n’est jamais visé', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, Math.PI, 100);
    steerMissiles(world, FIXED_DT);
    expect(m.vel.x).toBe(SPEED);
    expect(m.vel.y).toBe(0);
  });

  it('le cône suit le cap actuel, y compris à travers la coupure ±π', () => {
    const world = makeWorld();
    const heading = Math.PI - 0.01;
    const m = addMissile(world, 0, heading);
    placeShip(world, 1, heading, 0.2, 200); // angle absolu ≈ −π + 0,19 : de l'autre côté de la coupure
    steerMissiles(world, FIXED_DT);
    // Le virage se fait par le chemin court (sens +), donc l'écart signé au cap initial vaut +MAX_TURN.
    expect(angleDiff(headingOf(m), heading)).toBeCloseTo(MAX_TURN, 9);
  });

  it('pas de tir ami : un vaisseau de la faction du tireur n’attire pas le missile', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    // Le vaisseau 0 (même faction) est dans le cône, plus un second vaisseau allié ajouté à la main.
    placeShip(world, 0, 0, 0.2, 100);
    const ally = createShip(0, MX + 150, MY + 20, 0);
    world.ships.push(ally);
    steerMissiles(world, FIXED_DT);
    expect(m.vel.x).toBe(SPEED);
    expect(m.vel.y).toBe(0);
  });

  it('un allié proche ne masque pas un ennemi plus lointain', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 0, 0, -0.2, 50); // allié, plus près
    placeShip(world, 1, 0, 0.2, 300); // ennemi
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeGreaterThan(0);
  });

  it('un vaisseau mort est ignoré, même seul dans le cône', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.2, 100);
    world.ships[1].alive = false;
    steerMissiles(world, FIXED_DT);
    expect(m.vel.x).toBe(SPEED);
    expect(m.vel.y).toBe(0);
  });

  it('un vaisseau mort plus proche ne masque pas un ennemi vivant plus loin', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, -0.2, 100);
    world.ships[1].alive = false;
    placeShip(world, 2, 0, 0.2, 300);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeGreaterThan(0);
  });

  it('entre deux ennemis dans le cône, vise le plus proche (dans les deux configurations)', () => {
    const a = makeWorld();
    const mA = addMissile(a, 0, 0);
    placeShip(a, 1, 0, 0.3, 150); // proche, côté +
    placeShip(a, 2, 0, -0.3, 300); // loin, côté −
    steerMissiles(a, FIXED_DT);
    expect(headingOf(mA)).toBeGreaterThan(0);

    const b = makeWorld();
    const mB = addMissile(b, 0, 0);
    placeShip(b, 1, 0, 0.3, 300);
    placeShip(b, 2, 0, -0.3, 150);
    steerMissiles(b, FIXED_DT);
    expect(headingOf(mB)).toBeLessThan(0);
  });

  it('le plus proche gagne même s’il est moins bien aligné que l’autre', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.45, 100); // proche, presque en bord de cône
    placeShip(world, 2, 0, -0.01, 200); // loin, quasi dans l'axe
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeGreaterThan(0);
  });

  it('un ennemi plus proche mais hors cône est ignoré au profit d’un ennemi plus loin dans le cône', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, -(MISSILE_SEEK_ANGLE + 0.3), 50); // proche mais hors cône
    placeShip(world, 2, 0, 0.2, 300);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeGreaterThan(0);
  });

  it('chaque missile vise les ennemis de SA faction (tireurs différents, cibles différentes)', () => {
    const world = makeWorld();
    const m0 = addMissile(world, 0, 0);
    const m1 = addMissile(world, 1, 0);
    // Un seul vaisseau dans le cône : la faction 2, ennemie des deux tireurs, côté +.
    placeShip(world, 2, 0, 0.3, 200);
    // La faction 1 est ennemie du missile 0 : on la met côté −, plus loin → le missile 0 vise la 2.
    placeShip(world, 1, 0, -0.3, 300);
    // La faction 0 est ennemie du missile 1 : côté −, plus loin → le missile 1 vise aussi la 2.
    placeShip(world, 0, 0, -0.3, 320);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m0)).toBeGreaterThan(0);
    expect(headingOf(m1)).toBeGreaterThan(0);

    // Et si la faction 2 disparaît : m0 vise la faction 1 (côté −), m1 la faction 0 (côté −).
    world.ships[2].alive = false;
    const before0 = headingOf(m0);
    const before1 = headingOf(m1);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m0)).toBeLessThan(before0);
    expect(headingOf(m1)).toBeLessThan(before1);
  });
});

describe('steerMissiles : virage et conservation', () => {
  it('le cap tourne d’au plus MISSILE_TURN_RATE·dt par pas (grand écart : exactement le maximum)', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, MISSILE_SEEK_ANGLE - EPS_ANGLE, 200);
    steerMissiles(world, FIXED_DT);
    // atan2(sin, cos) reconstruit le cap à ~1e-16 près : 9 décimales suffisent.
    expect(headingOf(m)).toBeCloseTo(MAX_TURN, 9);
  });

  it('petit écart (< MISSILE_TURN_RATE·dt) : le missile s’aligne exactement, sans dépasser la cible', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    const offset = MAX_TURN / 4;
    placeShip(world, 1, 0, offset, 200);
    steerMissiles(world, FIXED_DT);
    // Tolérance 1e-9 : l'écart à la cible est reconstruit via atan2/cos/sin (erreurs de l'ordre de 1e-15).
    expect(headingOf(m)).toBeCloseTo(offset, 9);
  });

  it('le pas de temps borne le virage : dt double → virage max double', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, MISSILE_SEEK_ANGLE - EPS_ANGLE, 200);
    steerMissiles(world, 2 * FIXED_DT);
    expect(headingOf(m)).toBeCloseTo(2 * MAX_TURN, 9);
  });

  it('norme de la vitesse conservée, quelle que soit la vitesse initiale', () => {
    for (const speed of [120, 200, 523.7]) {
      const world = makeWorld();
      const m = addMissile(world, 0, 0.3, speed);
      placeShip(world, 1, 0.3, 0.4, 200);
      steerMissiles(world, FIXED_DT);
      // cos²+sin² = 1 à ~1e-16 relatif : 9 décimales sur des normes de l'ordre de 1e2–1e3.
      expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(speed, 9);
    }
  });

  it('ne touche ni à la position, ni à la durée de vie, ni aux dégâts, ni au propriétaire', () => {
    const world = makeWorld();
    const m = addMissile(world, 1, 0);
    placeShip(world, 0, 0, 0.3, 200);
    const { pos, life, damage, owner, kind, active } = JSON.parse(JSON.stringify(m));
    steerMissiles(world, FIXED_DT);
    expect({
      pos: m.pos,
      life: m.life,
      damage: m.damage,
      owner: m.owner,
      kind: m.kind,
      active: m.active,
    }).toEqual({
      pos,
      life,
      damage,
      owner,
      kind,
      active,
    });
  });

  it('sur un vol complet : chaque pas tourne ≤ MAX_TURN, la norme est constante et le missile converge sur la cible', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.35, 250); // cible fixe, dans le cône
    const target = world.ships[1].pos;
    let prev = headingOf(m);
    let minDist = Infinity;
    for (let i = 0; i < 90; i++) {
      steerMissiles(world, FIXED_DT);
      const h = headingOf(m);
      // Marge 1e-12 : erreurs d'arrondi de atan2/cos/sin sur le cap.
      expect(Math.abs(angleDiff(h, prev))).toBeLessThanOrEqual(MAX_TURN + 1e-12);
      expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(SPEED, 9);
      prev = h;
      m.pos.x += m.vel.x * FIXED_DT; // avance manuelle (l'intégration vit dans updateProjectiles)
      m.pos.y += m.vel.y * FIXED_DT;
      minDist = Math.min(minDist, Math.hypot(target.x - m.pos.x, target.y - m.pos.y));
    }
    // Rayon de virage = 200 / 2 = 100 px : largement de quoi atteindre une cible à 250 px et 20° ;
    // il passe donc dans le rayon de collision d'un vaisseau.
    expect(minDist).toBeLessThan(SHIP_COLLISION_RADIUS);
  });

  it('réacquisition à chaque pas : la cible est recalculée depuis la position courante des vaisseaux', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    const afterFirst = headingOf(m);
    expect(afterFirst).toBeCloseTo(MAX_TURN, 9);

    // L'ennemi 1 sort de portée, l'ennemi 2 apparaît côté − relativement au cap actuel.
    world.ships[1].pos.x = FAR;
    world.ships[1].pos.y = FAR;
    placeShip(world, 2, afterFirst, -0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeCloseTo(afterFirst - MAX_TURN, 9);

    // La cible meurt : le missile garde son cap, sans état résiduel.
    world.ships[2].alive = false;
    const frozen = headingOf(m);
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeCloseTo(frozen, 12);
  });

  it('une cible qui se déplace est suivie : le virage change de sens avec la position', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    const up = headingOf(m);
    placeShip(world, 1, up, -0.3, 200); // même vaisseau, désormais de l'autre côté
    steerMissiles(world, FIXED_DT);
    expect(headingOf(m)).toBeLessThan(up);
  });
});

describe('steerMissiles : portée du guidage', () => {
  it('ne guide que les KIND.MISSILE : une balle dans la même situation garde sa trajectoire', () => {
    const world = makeWorld();
    const bullet = addMissile(world, 0, 0, 320, KIND.BULLET);
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(bullet.vel.x).toBe(320);
    expect(bullet.vel.y).toBe(0);
  });

  it('balle et missile ensemble : seul le missile tourne', () => {
    const world = makeWorld();
    const bullet = addMissile(world, 0, 0, 320, KIND.BULLET);
    const missile = addMissile(world, 0, 0);
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(bullet.vel.y).toBe(0);
    expect(missile.vel.y).toBeGreaterThan(0);
  });

  it('un slot inactif est ignoré, même avec une vitesse résiduelle et une cible dans son cône', () => {
    const world = makeWorld();
    const m = addMissile(world, 0, 0);
    m.active = false;
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(m.vel.x).toBe(SPEED);
    expect(m.vel.y).toBe(0);
  });

  it('plusieurs missiles sont guidés indépendamment, chacun vers sa propre cible la plus proche', () => {
    const world = makeWorld();
    const a = addMissile(world, 0, 0);
    // Second missile ailleurs, cap vers −y : la cible ennemie est dans son propre cône.
    const index = spawnProjectile(world.projectiles, KIND.MISSILE, 0, 5000, 5000, 0, -SPEED, 4, 40);
    const b = world.projectiles[index];
    placeShip(world, 1, 0, 0.3, 200); // cible de a (côté +)
    world.ships[2].pos.x = 5000 + Math.cos(-Math.PI / 2 - 0.3) * 200; // cible de b (côté −)
    world.ships[2].pos.y = 5000 + Math.sin(-Math.PI / 2 - 0.3) * 200;
    steerMissiles(world, FIXED_DT);
    expect(headingOf(a)).toBeCloseTo(MAX_TURN, 9);
    expect(headingOf(b)).toBeCloseTo(-Math.PI / 2 - MAX_TURN, 9);
  });

  it('n’alloue aucun projectile : le pool garde sa taille et ses slots actifs', () => {
    const world = makeWorld();
    addMissile(world, 0, 0);
    const length = world.projectiles.length;
    placeShip(world, 1, 0, 0.3, 200);
    steerMissiles(world, FIXED_DT);
    expect(world.projectiles).toHaveLength(length);
    expect(world.projectiles.filter((p) => p.active)).toHaveLength(1);
  });
});
