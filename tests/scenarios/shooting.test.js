import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  BULLET_LIFETIME,
  BULLET_SPEED,
  EVENT_CAPACITY,
  FIRE_COOLDOWN,
  FIXED_DT,
  PLANET_GRAVITY,
  PROJECTILE_CAPACITY,
  RESPAWN_DELAY,
  SHIP_SIZE,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { createProjectiles, KIND } from '../../src/core/projectile.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Mini-carte en ligne, immense : aucun mur ni planète ne perturbe un tir (sauf mention contraire).
const X0 = 50000;
const Y0 = 50000;
const OPTIONS = { eventCapacity: EVENT_CAPACITY };
const BIG = { width: 100000, height: 100000, planets: [] };

const BULLET_STEP = BULLET_SPEED * FIXED_DT; // px parcourus par pas par une balle (vaisseau immobile)
const COOLDOWN_STEPS = Math.ceil(FIRE_COOLDOWN / FIXED_DT); // pas entre deux tirs maintenus
const LIFETIME_STEPS = BULLET_LIFETIME / FIXED_DT;

function bigMap(angle = 0, x = X0, y = Y0) {
  return { ...BIG, spawns: [{ x, y, angle }] };
}

function makeWorld(map = bigMap(), seed = 1) {
  return createWorld(map, seed, OPTIONS);
}

/** Un pas avec `fire` écrit dans l'intention ; la file d'événements est vidée avant, lue après. */
function stepFire(world, fire, shipIndex = 0) {
  world.ships[shipIndex].intent.fire = fire;
  clearEvents(world.events);
  step(world, FIXED_DT);
  return eventsOf(world);
}

function eventsOf(world, type) {
  const out = [];
  for (let i = 0; i < world.events.count; i++) {
    const e = world.events.items[i];
    if (type === undefined || e.type === type) out.push({ ...e });
  }
  return out;
}

const shotsOf = (world) => eventsOf(world, EVT.SHOT);
const activeCount = (world) => world.projectiles.filter((p) => p.active).length;

/** Maintient `fire` pendant `steps` pas ; retourne les ticks (0-based) où un SHOT a été émis. */
function holdFire(world, steps) {
  const ticks = [];
  for (let i = 0; i < steps; i++) {
    const tick = world.tick;
    stepFire(world, true);
    ticks.push(...shotsOf(world).map(() => tick));
  }
  return ticks;
}

describe('cadence de tir', () => {
  it('maintenir fire 2 s tire ≈ 2 / FIRE_COOLDOWN balles (±1), espacées régulièrement', () => {
    const world = makeWorld();
    const steps = Math.round(2 / FIXED_DT);
    const ticks = holdFire(world, steps);

    // Cooldown initial 0 : le premier tir part au tout premier pas.
    expect(ticks[0]).toBe(0);
    // ±1 : le cooldown est quantifié par le pas (11 pas = 0,183 s au lieu de 0,18 s).
    expect(Math.abs(ticks.length - 2 / FIRE_COOLDOWN)).toBeLessThanOrEqual(1);

    // Chaque pas émet au plus un SHOT, et l'espacement est constant : le cooldown est réarmé à
    // la même valeur à chaque tir, donc la suite d'arrondis flottants est identique d'un tir à l'autre.
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(gaps.length).toBeGreaterThan(5);
    expect(new Set(gaps).size).toBe(1);
    // Écart = plus petit nombre entier de pas couvrant le cooldown (au plus 1 pas de plus, arrondi flottant).
    expect(gaps[0]).toBeGreaterThanOrEqual(FIRE_COOLDOWN / FIXED_DT);
    expect(gaps[0]).toBeLessThanOrEqual(COOLDOWN_STEPS + 1);
  });

  it('chaque SHOT est émis à la pointe du nez, avec le tireur (a) et un slot de pool actif (b)', () => {
    const world = makeWorld(bigMap(0));
    const shots = stepFire(world, true);
    expect(shots).toHaveLength(1);
    const [shot] = shots;
    expect(shot.type).toBe(EVT.SHOT);
    expect(shot.a).toBe(0);
    // Position de l'événement = point d'apparition, avant tout déplacement de la balle (angle 0 : sur +x).
    expect(shot.x).toBeCloseTo(X0 + SHIP_SIZE, 9);
    expect(shot.y).toBeCloseTo(Y0, 9);
    const p = world.projectiles[shot.b];
    expect(p.active).toBe(true);
    expect(p.kind).toBe(KIND.BULLET);
    expect(p.owner).toBe(0);
    expect(p.damage).toBe(BULLET_DAMAGE);
  });

  it('sans fire, aucun tir (même après 2 s) ; un appui d’un seul pas tire exactement une balle', () => {
    const world = makeWorld();
    for (let i = 0; i < 120; i++) expect(stepFire(world, false)).toHaveLength(0);
    expect(activeCount(world)).toBe(0);

    expect(stepFire(world, true)).toHaveLength(1);
    for (let i = 0; i < 120; i++) expect(stepFire(world, false)).toHaveLength(0);
  });

  it('en tir continu, le nombre de balles vivantes se stabilise vers BULLET_LIFETIME / FIRE_COOLDOWN', () => {
    const world = makeWorld();
    let maxActive = 0;
    let lastActive = 0;
    for (let i = 0; i < 300; i++) {
      stepFire(world, true);
      lastActive = activeCount(world);
      maxActive = Math.max(maxActive, lastActive);
    }
    // En régime établi : vie / espacement réel (11 pas) = 96 / 11 = 8,7 → au plus 9 balles simultanées.
    expect(maxActive).toBeLessThanOrEqual(Math.ceil(BULLET_LIFETIME / FIRE_COOLDOWN));
    expect(maxActive).toBeGreaterThanOrEqual(Math.floor(BULLET_LIFETIME / FIRE_COOLDOWN));
    expect(lastActive).toBeGreaterThanOrEqual(Math.floor(BULLET_LIFETIME / FIRE_COOLDOWN));
  });
});

describe('vol d’une balle sans planète', () => {
  it('suit une droite à vitesse constante BULLET_SPEED, quel que soit le cap du tireur', () => {
    const angle = 0.7;
    const world = makeWorld(bigMap(angle));
    stepFire(world, true);
    const p = world.projectiles[0];
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const startX = X0 + dirX * SHIP_SIZE;
    const startY = Y0 + dirY * SHIP_SIZE;

    // Le spawn a lieu avant la mise à jour des projectiles du même pas : n pas écoulés = n·v·dt parcourus.
    for (let n = 1; n <= 60; n++) {
      // Vitesse : aucune force, donc strictement constante (égalité exacte).
      expect(p.vel.x).toBe(BULLET_SPEED * dirX);
      expect(p.vel.y).toBe(BULLET_SPEED * dirY);
      // Position : ≤ 60 additions de ~5e-0 sur des valeurs ~5e4 (ulp ~7e-12), erreur < 1e-9 → 6 décimales.
      expect(p.pos.x).toBeCloseTo(startX + n * BULLET_STEP * dirX, 6);
      expect(p.pos.y).toBeCloseTo(startY + n * BULLET_STEP * dirY, 6);
      stepFire(world, false);
    }
    expect(Math.hypot(p.vel.x, p.vel.y)).toBeCloseTo(BULLET_SPEED, 9);
  });

  it('disparaît à BULLET_LIFETIME (± 1 pas), pas avant, sans événement', () => {
    const world = makeWorld();
    stepFire(world, true);
    const p = world.projectiles[0];
    let steps = 1;
    while (p.active && steps < 1000) {
      stepFire(world, false);
      steps++;
      // La balle expire sans BULLET_HIT : rien ne la touche.
      expect(eventsOf(world, EVT.BULLET_HIT)).toHaveLength(0);
    }
    // life -= dt à chaque pas : désactivée au pas 96, ou 97 si l'arrondi flottant laisse life à ~1e-16 > 0.
    expect(Math.abs(steps - LIFETIME_STEPS)).toBeLessThanOrEqual(1);
    expect(p.active).toBe(false);
    // Distance franchie ≈ vitesse × durée de vie (± 1 pas de vol).
    expect(
      Math.abs(p.pos.x - (X0 + SHIP_SIZE) - BULLET_SPEED * BULLET_LIFETIME),
    ).toBeLessThanOrEqual(BULLET_STEP + 1e-6);
    expect(p.pos.y).toBeCloseTo(Y0, 9);
  });

  it('libère son slot : le tir suivant réutilise le premier slot inactif', () => {
    const world = makeWorld();
    stepFire(world, true);
    while (world.projectiles[0].active) stepFire(world, false);
    expect(activeCount(world)).toBe(0);
    const [shot] = stepFire(world, true);
    expect(shot.b).toBe(0);
  });
});

describe('héritage de la vitesse du vaisseau', () => {
  const SHIP_VX = 100;
  const SHIP_VY = -30;

  function fireMoving(angle) {
    const world = makeWorld(bigMap(angle));
    const ship = world.ships[0];
    ship.vel.x = SHIP_VX;
    ship.vel.y = SHIP_VY;
    stepFire(world, true);
    return { world, ship, bullet: world.projectiles[0] };
  }

  it.each([
    ['vers l’avant', 0],
    ['vers l’arrière', Math.PI],
    ['de côté', Math.PI / 2],
    ['en diagonale', -0.6],
  ])(
    'tir %s : vitesse balle = vitesse vaisseau + BULLET_SPEED dans l’axe du nez',
    (_label, angle) => {
      const { bullet } = fireMoving(angle);
      // cos(π) et sin(π) valent ±1 et ~1e-16 : l'écart à la formule est de l'ordre de 1e-14 → 9 décimales.
      expect(bullet.vel.x).toBeCloseTo(SHIP_VX + BULLET_SPEED * Math.cos(angle), 9);
      expect(bullet.vel.y).toBeCloseTo(SHIP_VY + BULLET_SPEED * Math.sin(angle), 9);
    },
  );

  it('la vitesse relative balle/vaisseau vaut BULLET_SPEED, quel que soit le mouvement du vaisseau', () => {
    for (const angle of [0, Math.PI, 1.2, -2.5]) {
      const { ship, bullet } = fireMoving(angle);
      expect(Math.hypot(bullet.vel.x - ship.vel.x, bullet.vel.y - ship.vel.y)).toBeCloseTo(
        BULLET_SPEED,
        9,
      );
    }
  });

  it('une balle tirée vers l’avant est plus rapide que vers l’arrière, d’exactement 2·BULLET_SPEED', () => {
    const forward = fireMoving(0).bullet;
    const backward = fireMoving(Math.PI).bullet;
    expect(forward.vel.x).toBeGreaterThan(backward.vel.x);
    expect(forward.vel.x - backward.vel.x).toBeCloseTo(2 * BULLET_SPEED, 9);
    // Composante y : le vaisseau seul la fixe (±1e-14 de sin(π)).
    expect(forward.vel.y).toBeCloseTo(backward.vel.y, 9);
  });

  it('un vaisseau assez rapide vers l’arrière envoie la balle… vers l’arrière (vitesse > BULLET_SPEED)', () => {
    const world = makeWorld(bigMap(0));
    world.ships[0].vel.x = -(BULLET_SPEED + 80);
    stepFire(world, true);
    expect(world.projectiles[0].vel.x).toBeCloseTo(-80, 9);
  });
});

describe('sortie de carte', () => {
  const W = 1000;
  const H = 1000;
  // Vaisseau à 100 px du mur visé, nez dirigé vers ce mur.
  it.each([
    ['droit', 900, 500, 0],
    ['gauche', 100, 500, Math.PI],
    ['bas', 500, 900, Math.PI / 2],
    ['haut', 500, 100, -Math.PI / 2],
  ])(
    'une balle tirée vers le mur %s est désactivée dès qu’elle sort, bien avant la fin de sa vie',
    (_l, x, y, angle) => {
      const world = makeWorld({ width: W, height: H, planets: [], spawns: [{ x, y, angle }] });
      stepFire(world, true);
      const p = world.projectiles[0];
      let steps = 1;
      while (p.active && steps < 200) {
        stepFire(world, false);
        steps++;
      }
      expect(p.active).toBe(false);
      // Distance au mur depuis la pointe du nez : 100 − SHIP_SIZE. Sortie stricte au premier pas où n·v·dt la dépasse.
      expect(steps).toBe(Math.ceil((100 - SHIP_SIZE) / BULLET_STEP));
      // Elle avait encore de la vie : c'est bien la sortie de carte, pas l'expiration, qui l'a retirée.
      expect(p.life).toBeGreaterThan(BULLET_LIFETIME - 0.5);
      expect(eventsOf(world, EVT.BULLET_HIT)).toHaveLength(0);
      // Le slot est de nouveau disponible.
      expect(stepFire(world, true)[0].b).toBe(0);
    },
  );
});

describe('contact avec une planète', () => {
  const R = 30;
  // Planète 0 écartée (hors de portée de la trajectoire), planète 1 sur l'axe de tir.
  const MAP = {
    width: 1000,
    height: 1000,
    planets: [
      { x: 500, y: 100, radius: R },
      { x: 500, y: 500, radius: R },
    ],
    spawns: [{ x: 300, y: 500, angle: 0 }], // 200 px du centre : hors de la portée (5·R = 150)
  };

  it('une balle tirée droit vers une planète est absorbée au contact, avant la fin de sa vie', () => {
    const world = makeWorld(MAP);
    const [shot] = stepFire(world, true);
    const p = world.projectiles[shot.b];
    let steps = 1;
    let hits = eventsOf(world, EVT.BULLET_HIT);
    while (p.active && steps < 200) {
      stepFire(world, false);
      steps++;
      hits = hits.concat(eventsOf(world, EVT.BULLET_HIT));
    }

    expect(p.active).toBe(false);
    expect(p.life).toBeGreaterThan(0); // retirée par la planète, pas par l'expiration
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit.a).toBe(1); // index de la planète touchée (pas la 0)
    expect(hit.b).toBe(shot.b);

    // Point d'impact : juste à l'intérieur du disque (< R), à moins d'un pas de vol de la surface.
    // Un pas = ≤ (BULLET_SPEED + g0·0,5 s)·dt ≈ 5,9 px (la gravité n'agit que ~0,5 s avant l'impact).
    const maxStep = (BULLET_SPEED + PLANET_GRAVITY * 0.5) * FIXED_DT;
    const depth = R - Math.hypot(hit.x - 500, hit.y - 500);
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThan(maxStep);
    expect(hit.y).toBeCloseTo(500, 9); // tir exactement radial : aucune déviation latérale

    // Durée : jamais plus que sans gravité (la planète accélère la balle vers elle), pas moins qu'à vitesse maximale.
    const gap = 500 - R - (300 + SHIP_SIZE);
    expect(steps).toBeLessThanOrEqual(Math.ceil(gap / BULLET_STEP));
    expect(steps).toBeGreaterThanOrEqual(Math.floor(gap / maxStep));
  });

  it('l’impact ne consomme qu’une balle : les suivantes sont absorbées chacune à leur tour', () => {
    const world = makeWorld(MAP);
    let hits = 0;
    let shots = 0;
    for (let i = 0; i < 180; i++) {
      stepFire(world, true);
      shots += shotsOf(world).length;
      hits += eventsOf(world, EVT.BULLET_HIT).length;
    }
    // Tous les tirs ont eu le temps d'atteindre la planète (vol ≈ 31 pas < 180 − dernier tir), sauf les derniers.
    expect(shots).toBeGreaterThan(10);
    expect(hits).toBeGreaterThan(shots - 4);
    expect(hits).toBeLessThanOrEqual(shots);
  });
});

describe('gravité sur les balles', () => {
  // Vaisseau juste au-dessus d'une planète, nez tangent (+x) : la gravité attire la balle vers le bas (centre).
  const PLANET = { x: 500, y: 500, radius: 40 };
  const MAP_PLANET = (shipY) => ({
    width: 2000,
    height: 2000,
    planets: [PLANET],
    spawns: [{ x: 500, y: shipY, angle: 0 }],
  });
  const MAP_EMPTY = (shipY) => ({ ...MAP_PLANET(shipY), planets: [] });
  const STEPS = 30; // 0,5 s : la balle parcourt 160 px, reste dans la portée (200 px) sans toucher la planète

  function flyBullet(map) {
    const world = makeWorld(map);
    stepFire(world, true);
    const p = world.projectiles[0];
    let hits = 0;
    for (let i = 1; i < STEPS; i++) {
      stepFire(world, false);
      hits += eventsOf(world, EVT.BULLET_HIT).length;
    }
    return { p, hits };
  }

  it('dévie vers le centre une balle tirée tangentiellement, par rapport à la même balle sans planète', () => {
    const shipY = 440; // 60 px du centre, 20 px d'altitude
    const withPlanet = flyBullet(MAP_PLANET(shipY));
    const without = flyBullet(MAP_EMPTY(shipY));

    // Référence : trajectoire exactement rectiligne et horizontale.
    expect(without.p.vel.y).toBe(0);
    expect(without.p.pos.y).toBeCloseTo(shipY, 9);

    expect(withPlanet.hits).toBe(0); // elle rase la planète sans la toucher
    expect(withPlanet.p.active).toBe(true);
    // Déviation vers le centre (+y) : vitesse et position.
    expect(withPlanet.p.vel.y).toBeGreaterThan(0);
    expect(withPlanet.p.pos.y - without.p.pos.y).toBeGreaterThan(0);
    // Ordre de grandeur : au premier pas g ≈ 30 px/s² (1/d² à d = 60, coupure douce comprise), et la gravité ne
    // tombe pas sous ~5 px/s² avant la fin de la trajectoire → vy ≥ 5 · 0,5 s = 2,5 px/s au moins.
    expect(withPlanet.p.vel.y).toBeGreaterThan(2.5);
    // Et pas de gravité démesurée : bornée par g0 (surface) pendant 0,5 s.
    expect(withPlanet.p.vel.y).toBeLessThan(PLANET_GRAVITY * STEPS * FIXED_DT);
    // La gravité courbe la trajectoire sans changer son ordre de grandeur : vitesse à ±10 % de BULLET_SPEED
    // (mesuré ≈ 317 px/s : la balle est un peu freinée en s'éloignant).
    expect(Math.hypot(withPlanet.p.vel.x, withPlanet.p.vel.y)).toBeGreaterThan(BULLET_SPEED * 0.9);
    expect(Math.hypot(withPlanet.p.vel.x, withPlanet.p.vel.y)).toBeLessThan(BULLET_SPEED * 1.1);
  });

  it('symétrie : une balle tirée sous la planète est déviée vers le haut, du même montant', () => {
    const above = flyBullet(MAP_PLANET(440)).p; // 60 px au-dessus du centre
    const below = flyBullet(MAP_PLANET(560)).p; // 60 px au-dessous du centre
    // Miroir exact par rapport à y = 500 : les écarts dy sont ±60 (exacts en flottant), donc les accélérations
    // sont opposées au bit près ; 9 décimales couvrent largement l'arrondi.
    expect(above.vel.y).toBeGreaterThan(0);
    expect(below.vel.y).toBeLessThan(0);
    expect(below.vel.y).toBeCloseTo(-above.vel.y, 9);
    expect(below.vel.x).toBeCloseTo(above.vel.x, 9);
    expect(below.pos.y - 500).toBeCloseTo(-(above.pos.y - 500), 9);
    expect(below.pos.x).toBeCloseTo(above.pos.x, 9);
  });

  it('symétrie gauche/droite : tirer vers −x donne la même déviation verticale que vers +x', () => {
    const right = flyBullet(MAP_PLANET(440)).p;
    const leftMap = MAP_PLANET(440);
    leftMap.spawns[0].angle = Math.PI;
    // Départ à x = 500 − 8 vers la gauche : miroir de (500 + 8) vers la droite par rapport à x = 500.
    const left = flyBullet(leftMap).p;
    // sin(π) ≈ 1,2e-16 induit un écart de position de l'ordre de 1e-14 : 9 décimales.
    expect(left.vel.y).toBeCloseTo(right.vel.y, 9);
    expect(left.vel.x).toBeCloseTo(-right.vel.x, 9);
    expect(left.pos.y).toBeCloseTo(right.pos.y, 9);
    expect(left.pos.x - 500).toBeCloseTo(-(right.pos.x - 500), 9);
  });

  it('plus la balle passe près de la surface, plus elle est déviée', () => {
    const near = flyBullet(MAP_PLANET(450)).p; // 50 px du centre (10 px d'altitude)
    const far = flyBullet(MAP_PLANET(380)).p; // 120 px du centre
    expect(near.vel.y).toBeGreaterThan(far.vel.y);
    expect(far.vel.y).toBeGreaterThan(0); // 120 < portée 200 : encore dans le champ
  });
});

describe('pool de projectiles plein', () => {
  it.each([0, 1, 3])(
    'capacité %i : les tirs excédentaires sont ignorés sans exception ni événement SHOT',
    (capacity) => {
      const world = makeWorld();
      world.projectiles = createProjectiles(capacity);
      // 90 pas : 9 tirs possibles côté cadence (pas 0, 11, …, 88), mais toutes les balles vivent encore (96 pas).
      let shots = 0;
      for (let i = 0; i < 90; i++) {
        expect(() => stepFire(world, true)).not.toThrow();
        shots += shotsOf(world).length;
        expect(activeCount(world)).toBeLessThanOrEqual(capacity);
        expect(world.projectiles).toHaveLength(capacity); // le pool ne grandit jamais
      }
      expect(shots).toBe(capacity);
      expect(world.events.dropped).toBe(0);
    },
  );

  it('un tir ignoré n’émet pas de SHOT, et le tir reprend dès qu’un slot se libère', () => {
    const world = makeWorld();
    world.projectiles = createProjectiles(1);
    const shotTicks = [];
    for (let i = 0; i < 130; i++) {
      const tick = world.tick;
      const shots = stepFire(world, true).filter((e) => e.type === EVT.SHOT);
      if (shots.length > 0) shotTicks.push(tick);
    }
    // Un tir au pas 0, puis le slot ne se libère qu'à ~96 : le prochain tir autorisé par la cadence
    // après cela est le premier multiple de l'espacement ≥ 96 − 1.
    expect(shotTicks[0]).toBe(0);
    expect(shotTicks.length).toBeGreaterThanOrEqual(2);
    expect(shotTicks[1]).toBeGreaterThanOrEqual(LIFETIME_STEPS - 1);
    expect(shotTicks[1] % COOLDOWN_STEPS).toBe(0);
    expect(shotTicks[1] - LIFETIME_STEPS).toBeLessThan(COOLDOWN_STEPS + 1); // pas de retard injustifié
  });

  it('un pool plein de balles d’autres vaisseaux bloque aussi ce vaisseau (pool commun)', () => {
    const world = makeWorld({
      ...BIG,
      spawns: [
        { x: X0, y: Y0, angle: 0 },
        { x: X0, y: Y0 + 500 },
      ],
    });
    world.projectiles = createProjectiles(2);
    // Le vaisseau 1 sature le pool pendant que le 0 se tait.
    world.ships[1].angle = 0;
    for (let i = 0; i < 40; i++) stepFire(world, true, 1);
    expect(activeCount(world)).toBe(2);
    let shots = 0;
    for (let i = 0; i < 30; i++) {
      stepFire(world, true, 0);
      shots += shotsOf(world).filter((e) => e.a === 0).length;
    }
    expect(shots).toBe(0);
  });
});

describe('vaisseau mort', () => {
  it('ne tire pas, même avec fire maintenu', () => {
    const world = makeWorld();
    world.ships[0].alive = false;
    const ticks = holdFire(world, 240);
    expect(ticks).toEqual([]);
    expect(activeCount(world)).toBe(0);
    expect(world.events.dropped).toBe(0);
  });

  it('cesse de tirer à la mort en pleine rafale', () => {
    const world = makeWorld();
    const before = holdFire(world, 60);
    expect(before.length).toBeGreaterThan(3);
    world.ships[0].alive = false;
    expect(holdFire(world, 120)).toEqual([]);
  });
});

describe('respawn', () => {
  const MAP = {
    width: 1000,
    height: 1000,
    planets: [{ x: 500, y: 500, radius: 40, owner: 0 }],
    spawns: [{ x: 500, y: 300, angle: 0 }], // 200 px du centre : hors de la portée de gravité (5·40)
  };

  it('remet le cooldown à 0 : le vaisseau peut tirer au premier pas qui suit sa réapparition', () => {
    const world = makeWorld(MAP);
    const ship = world.ships[0];
    stepFire(world, true);
    // Cooldown armé par le tir, puis gelé par la mort (un vaisseau mort ne décompte rien).
    expect(ship.fireCooldown).toBeGreaterThan(0);
    damageShip(world, 0, 1e6, ship.pos.x, ship.pos.y);
    expect(ship.alive).toBe(false);
    expect(ship.fireCooldown).toBeGreaterThan(0);

    let steps = 0;
    while (!ship.alive && steps < 600) {
      expect(stepFire(world, true)).not.toContainEqual(expect.objectContaining({ type: EVT.SHOT }));
      steps++;
    }
    expect(ship.alive).toBe(true);
    // Délai de respawn quantifié par le pas : RESPAWN_DELAY ± 1 pas.
    expect(Math.abs(steps * FIXED_DT - RESPAWN_DELAY)).toBeLessThanOrEqual(FIXED_DT + 1e-9);
    expect(ship.fireCooldown).toBe(0);

    // Dès le pas suivant, fire maintenu produit un tir immédiat (cooldown déjà à 0).
    const shots = stepFire(world, true).filter((e) => e.type === EVT.SHOT);
    expect(shots).toHaveLength(1);
    expect(shots[0].a).toBe(0);
    // La balle part vers le haut (nez sur la normale de la planète, y négatif).
    expect(world.projectiles[shots[0].b].vel.y).toBeLessThan(0);
  });
});

describe('déterminisme du tir', () => {
  // Deux planètes (gravité, absorption, atterrissages/chocs, respawn) + deux vaisseaux qui rotent, poussent et tirent
  // au gré du RNG du monde : la seed influence réellement tirs, trajectoires, impacts.
  const MAP = {
    width: 1200,
    height: 700,
    planets: [
      { x: 300, y: 350, radius: 50, owner: 0 },
      { x: 900, y: 350, radius: 50, owner: 1 },
    ],
    spawns: [
      { x: 300, y: 200, angle: 0 },
      { x: 900, y: 200, angle: Math.PI },
    ],
  };
  const STEPS = 3000;

  function simulate(seed) {
    const world = makeWorld(MAP, seed);
    const counts = { shots: 0, hits: 0 };
    for (let i = 0; i < STEPS; i++) {
      for (const ship of world.ships) {
        ship.intent.rotate = int(world.rng, -1, 2);
        ship.intent.thrust = world.tick % 9 < 3;
        ship.intent.fire = int(world.rng, 0, 4) !== 0;
      }
      clearEvents(world.events);
      step(world, FIXED_DT);
      counts.shots += shotsOf(world).length;
      counts.hits += eventsOf(world, EVT.BULLET_HIT).length;
    }
    return { world, counts };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed + même script de tirs/rotations → JSON identique après 3000 pas, état fini', () => {
    const a = simulate(4242);
    const b = simulate(4242);
    expect(a.world.tick).toBe(STEPS);
    // Le scénario exerce vraiment le tir : beaucoup de tirs, et des balles absorbées par les planètes.
    expect(a.counts.shots).toBeGreaterThan(100);
    expect(a.counts.hits).toBeGreaterThan(0);
    expect(a.counts).toEqual(b.counts);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(allFinite(a.world)).toBe(true);
    expect(a.world.projectiles).toHaveLength(PROJECTILE_CAPACITY);
    expect(a.world.events.dropped).toBe(0);
  });

  it('une autre seed diverge', () => {
    expect(JSON.stringify(simulate(1).world)).not.toBe(JSON.stringify(simulate(2).world));
  });
});
