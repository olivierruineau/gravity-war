import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  EVENT_CAPACITY,
  FIXED_DT,
  MISSILE_COOLDOWN,
  MISSILE_DAMAGE,
  MISSILE_LIFETIME,
  MISSILE_SEEK_ANGLE,
  MISSILE_SPEED,
  MISSILE_STOCK_MAX,
  MISSILE_STOCK_MIN,
  RESPAWN_DELAY,
  SHIP_MAX_HP,
  SHIP_SIZE,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { KIND } from '../../src/core/projectile.js';
import { int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

const OPTIONS = { eventCapacity: EVENT_CAPACITY };
const SX = 1000; // tireur (faction 0)
const SY = 1000;
const LIFETIME_STEPS = MISSILE_LIFETIME / FIXED_DT;

// Base de la faction 0 : planète possédée avec usine construite (built: 2) → capacité « missiles ».
// Loin de la zone de tir (portée de gravité 5·30 = 150 px, portée de la tourelle 150 px de la surface).
const BASE = { x: 100, y: 100, radius: 30, owner: 0, built: 2 };

/** Carte 4000×4000 : le tireur (faction 0, cap `angle`) en (SX, SY), la cible (faction 1) en `target`. */
function makeWorld({ target, angle = 0, planets = [], seed = 1 } = {}) {
  const spawns = [{ x: SX, y: SY, angle }];
  if (target) spawns.push({ x: target.x, y: target.y, angle: Math.PI });
  return createWorld(
    { width: 4000, height: 4000, planets: [BASE, ...planets], spawns },
    seed,
    OPTIONS,
  );
}

function eventsOf(world, type) {
  const out = [];
  for (let i = 0; i < world.events.count; i++) {
    const e = world.events.items[i];
    if (e.type === type) out.push({ ...e });
  }
  return out;
}

/** Un pas avec `missile` écrit dans l'intention du tireur ; file d'événements vidée avant. */
function stepFire(world, missile) {
  world.ships[0].intent.missile = missile;
  clearEvents(world.events);
  step(world, FIXED_DT);
}

const missilesOf = (world) => world.projectiles.filter((p) => p.active && p.kind === KIND.MISSILE);

/** Tire un missile puis avance jusqu'à ce qu'il disparaisse ; retourne les événements cumulés utiles. */
function flyMissile(world, maxSteps = 400) {
  stepFire(world, true);
  const launch = eventsOf(world, EVT.MISSILE_LAUNCH);
  const missile = world.projectiles[launch[0].b];
  const shipHits = eventsOf(world, EVT.SHIP_HIT);
  const bulletHits = eventsOf(world, EVT.BULLET_HIT);
  let steps = 1;
  while (missile.active && steps < maxSteps) {
    stepFire(world, false);
    shipHits.push(...eventsOf(world, EVT.SHIP_HIT));
    bulletHits.push(...eventsOf(world, EVT.BULLET_HIT));
    steps++;
  }
  return { missile, steps, shipHits, bulletHits };
}

describe('missile : tir vers un ennemi', () => {
  it('un missile tiré droit vers un ennemi immobile à portée le touche (SHIP_HIT b = 40)', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    const enemy = world.ships[1];
    const { missile, steps, shipHits } = flyMissile(world);
    expect(shipHits).toHaveLength(1);
    expect(shipHits[0].a).toBe(1);
    expect(shipHits[0].b).toBe(MISSILE_DAMAGE);
    expect(MISSILE_DAMAGE).toBe(40);
    expect(enemy.hp).toBe(SHIP_MAX_HP - MISSILE_DAMAGE);
    expect(missile.active).toBe(false);
    expect(missile.life).toBeGreaterThan(0); // consommé par l'impact, pas par l'expiration
    // Durée : distance (250 − SHIP_SIZE − rayon de collision 6) à 200 px/s, ± 1 pas de marge.
    const expected = (250 - SHIP_SIZE - 6) / (MISSILE_SPEED * FIXED_DT);
    expect(Math.abs(steps - expected)).toBeLessThanOrEqual(2);
  });

  it('le tireur ne se touche pas lui-même et ne subit aucun dégât', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    flyMissile(world);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP);
  });

  it('légèrement de travers (dans le cône) : le missile corrige sa trajectoire et touche', () => {
    // 40 px de décalage à 250 px : ≈ 9° < 30°. Rayon de virage 100 px → corrigeable.
    const target = { x: SX + 250, y: SY + 40 };
    expect(Math.atan2(40, 250)).toBeLessThan(MISSILE_SEEK_ANGLE);
    const world = makeWorld({ target });
    const { shipHits, missile } = flyMissile(world);
    expect(shipHits).toHaveLength(1);
    expect(shipHits[0].b).toBe(MISSILE_DAMAGE);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - MISSILE_DAMAGE);
    expect(missile.active).toBe(false);
  });

  it('la même visée avec une balle rate : seul le guidage explique le coup au but', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY + 40 } });
    world.ships[0].intent.fire = true;
    clearEvents(world.events);
    step(world, FIXED_DT);
    world.ships[0].intent.fire = false;
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      step(world, FIXED_DT);
      hits += eventsOf(world, EVT.SHIP_HIT).length;
    }
    expect(hits).toBe(0);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
  });

  it('côté opposé : le missile corrige aussi vers le haut', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY - 40 } });
    const { shipHits } = flyMissile(world);
    expect(shipHits).toHaveLength(1);
  });

  it('ennemi hors cône (45°) : le missile ne tourne jamais et le manque, puis expire', () => {
    const world = makeWorld({ target: { x: SX + 200, y: SY + 200 } });
    const { missile, steps, shipHits } = flyMissile(world);
    expect(shipHits).toHaveLength(0);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
    // Jamais guidé : trajectoire strictement horizontale à vitesse constante.
    expect(missile.vel.y).toBe(0);
    expect(missile.vel.x).toBe(MISSILE_SPEED);
    expect(missile.pos.y).toBeCloseTo(SY, 9);
    expect(Math.abs(steps - LIFETIME_STEPS)).toBeLessThanOrEqual(1);
  });

  it('ennemi mort : le missile ne le vise pas, il passe sans événement', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY + 40 } });
    world.ships[1].alive = false;
    const { shipHits, missile } = flyMissile(world);
    expect(shipHits).toHaveLength(0);
    expect(missile.vel.y).toBe(0);
  });
});

describe('missile : propulsé, insensible à la gravité', () => {
  // Tireur à 20 px d'altitude de la surface d'une planète, nez tangent : une balle est déviée vers le centre.
  const PLANET = { x: SX, y: SY + 60, radius: 40 };
  const STEPS = 30;

  it('vol rectiligne près d’une planète, alors qu’une balle tirée au même endroit dévie', () => {
    const world = makeWorld({ planets: [PLANET] });
    const ship = world.ships[0];
    ship.intent.fire = true;
    ship.intent.missile = true;
    clearEvents(world.events);
    step(world, FIXED_DT);
    ship.intent.fire = false;
    ship.intent.missile = false;
    const bullet = world.projectiles.find((p) => p.active && p.kind === KIND.BULLET);
    const missile = world.projectiles.find((p) => p.active && p.kind === KIND.MISSILE);
    expect(bullet).toBeDefined();
    expect(missile).toBeDefined();
    const y0 = missile.pos.y;
    for (let i = 1; i < STEPS; i++) step(world, FIXED_DT);

    // Missile : aucune force → vitesse et ordonnée exactement inchangées.
    expect(missile.active).toBe(true);
    expect(missile.vel.x).toBe(MISSILE_SPEED);
    expect(missile.vel.y).toBe(0);
    expect(missile.pos.y).toBe(y0);
    // Balle : la gravité de la planète l'a infléchie vers le centre (+y), de plusieurs px/s.
    expect(bullet.active).toBe(true);
    expect(bullet.vel.y).toBeGreaterThan(2.5);
    expect(bullet.pos.y).toBeGreaterThan(y0);
    // Le spawn précède la mise à jour des projectiles du même pas : STEPS pas = STEPS·v·dt parcourus
    // (≤ 30 additions sur des valeurs ~1e3, erreur < 1e-10 → 6 décimales).
    expect(missile.pos.x).toBeCloseTo(SX + SHIP_SIZE + STEPS * MISSILE_SPEED * FIXED_DT, 6);
  });

  it('trois missiles tirés au-dessus et en dessous d’une planète volent également en ligne droite', () => {
    for (const dy of [-60, 60]) {
      const world = makeWorld({ planets: [{ x: SX, y: SY + dy, radius: 40 }] });
      stepFire(world, true);
      const [m] = missilesOf(world);
      for (let i = 1; i < STEPS; i++) stepFire(world, false);
      expect(m.vel.y).toBe(0);
      expect(m.vel.x).toBe(MISSILE_SPEED);
    }
  });
});

describe('missile : fuite et expiration', () => {
  it('un ennemi qui fuit plus vite que MISSILE_SPEED n’est jamais rattrapé ; le missile expire à MISSILE_LIFETIME', () => {
    const world = makeWorld({ target: { x: SX + 150, y: SY } });
    const enemy = world.ships[1];
    enemy.vel.x = MISSILE_SPEED + 50; // 250 px/s, sans poussée : vitesse constante (aucune planète proche)
    const { missile, steps, shipHits } = flyMissile(world, 1000);
    expect(shipHits).toHaveLength(0);
    expect(enemy.hp).toBe(SHIP_MAX_HP);
    // Écart toujours croissant : l'ennemi est loin devant. 4 s à 250 px/s = 1000 px d'avance sur 800 px parcourus.
    expect(enemy.pos.x - missile.pos.x).toBeGreaterThan(300);
    // Expire à MISSILE_LIFETIME ± 1 pas (arrondi flottant de life −= dt).
    expect(Math.abs(steps - LIFETIME_STEPS)).toBeLessThanOrEqual(1);
    expect(missile.active).toBe(false);
  });

  it('un ennemi plus lent est rattrapé', () => {
    const world = makeWorld({ target: { x: SX + 150, y: SY } });
    world.ships[1].vel.x = MISSILE_SPEED / 2;
    const { shipHits } = flyMissile(world, 1000);
    expect(shipHits).toHaveLength(1);
  });

  it('le missile expire sans BULLET_HIT quand rien ne le touche, et libère son slot', () => {
    const world = makeWorld();
    const { missile, bulletHits, steps } = flyMissile(world, 1000);
    expect(bulletHits).toHaveLength(0);
    expect(missile.active).toBe(false);
    expect(Math.abs(steps - LIFETIME_STEPS)).toBeLessThanOrEqual(1);
    // Distance ≈ vitesse × durée de vie (±1 pas de vol).
    expect(
      Math.abs(missile.pos.x - (SX + SHIP_SIZE) - MISSILE_SPEED * MISSILE_LIFETIME),
    ).toBeLessThanOrEqual(MISSILE_SPEED * FIXED_DT + 1e-6);
  });
});

describe('missile : stock et cadence', () => {
  it('stock de départ = MISSILE_STOCK_MIN (1) : le premier tir part, le second est refusé', () => {
    const world = makeWorld();
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MIN);
    expect(MISSILE_STOCK_MIN).toBe(1);
    stepFire(world, true);
    expect(eventsOf(world, EVT.MISSILE_LAUNCH)).toHaveLength(1);
    expect(world.ships[0].missiles).toBe(0);

    // Intention maintenue très longtemps (cooldown largement écoulé) : plus aucun lancement.
    let launches = 0;
    for (let i = 0; i < 300; i++) {
      stepFire(world, true);
      launches += eventsOf(world, EVT.MISSILE_LAUNCH).length;
    }
    expect(launches).toBe(0);
    expect(world.ships[0].missiles).toBe(0);
  });

  it('le second tir est aussi refusé pendant le cooldown, même avec un stock suffisant', () => {
    const world = makeWorld();
    world.ships[0].missiles = MISSILE_STOCK_MAX;
    stepFire(world, true);
    const gapSteps = Math.floor(MISSILE_COOLDOWN / FIXED_DT) - 1;
    for (let i = 0; i < gapSteps; i++) {
      stepFire(world, true);
      expect(eventsOf(world, EVT.MISSILE_LAUNCH)).toHaveLength(0);
    }
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MAX - 1);
  });

  it('sans usine (planète construite à built: 1), aucun lancement même avec du stock', () => {
    const world = createWorld(
      {
        width: 4000,
        height: 4000,
        planets: [{ ...BASE, built: 1 }],
        spawns: [{ x: SX, y: SY, angle: 0 }],
      },
      1,
      OPTIONS,
    );
    expect(world.factions[0].hasMissiles).toBe(false);
    world.ships[0].missiles = MISSILE_STOCK_MAX;
    for (let i = 0; i < 120; i++) stepFire(world, true);
    expect(missilesOf(world)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(MISSILE_STOCK_MAX);
  });
});

describe('missile : impact sur planète', () => {
  it('un missile tiré vers une planète est absorbé (BULLET_HIT), sans la dévier avant', () => {
    const planet = { x: SX + 300, y: SY, radius: 30 };
    const world = makeWorld({ planets: [planet] });
    const { missile, bulletHits, steps } = flyMissile(world, 400);
    expect(missile.active).toBe(false);
    expect(missile.life).toBeGreaterThan(0); // absorbé, pas expiré
    expect(bulletHits).toHaveLength(1);
    expect(bulletHits[0].a).toBe(1); // index de la planète (0 = BASE)
    // Impact juste à l'intérieur du disque, à moins d'un pas de vol de la surface.
    const depth =
      planet.radius - Math.hypot(bulletHits[0].x - planet.x, bulletHits[0].y - planet.y);
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThanOrEqual(MISSILE_SPEED * FIXED_DT + 1e-6);
    // Vol rectiligne : l'impact est exactement sur l'axe de tir.
    expect(bulletHits[0].y).toBeCloseTo(SY, 9);
    // Durée : (300 − 30 − SHIP_SIZE) px à 200 px/s, ± 1 pas.
    expect(
      Math.abs(steps - (300 - planet.radius - SHIP_SIZE) / (MISSILE_SPEED * FIXED_DT)),
    ).toBeLessThanOrEqual(2);
  });

  it('une planète entre le tireur et l’ennemi protège l’ennemi', () => {
    const planet = { x: SX + 150, y: SY, radius: 30 };
    const world = makeWorld({ planets: [planet], target: { x: SX + 300, y: SY } });
    const { shipHits, bulletHits } = flyMissile(world);
    expect(bulletHits).toHaveLength(1);
    expect(shipHits).toHaveLength(0);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
  });
});

describe('missile : létalité', () => {
  /** Tire `count` missiles à la cadence maximale sur l'ennemi immobile ; retourne le nombre de SHIP_HIT. */
  function volley(count) {
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    world.ships[0].missiles = count;
    let hits = 0;
    let launches = 0;
    // 2 s : cooldown 0,5 s → jusqu'à 4 tirs, vol ≈ 1,2 s ; tout est résolu largement avant la fin.
    for (let i = 0; i < 180; i++) {
      stepFire(world, true);
      launches += eventsOf(world, EVT.MISSILE_LAUNCH).length;
      hits += eventsOf(world, EVT.SHIP_HIT).filter((e) => e.b === MISSILE_DAMAGE).length;
    }
    return { world, hits, launches };
  }

  // Nombre de missiles qui tuent un vaisseau neuf, dérivé des constantes d'équilibrage (2 avec 60 PV et 40 de dégâts).
  const MISSILES_TO_KILL = Math.ceil(SHIP_MAX_HP / MISSILE_DAMAGE);

  it('MISSILES_TO_KILL − 1 missiles ne tuent pas un vaisseau neuf (dégâts cumulés < SHIP_MAX_HP)', () => {
    const survivors = MISSILES_TO_KILL - 1;
    expect(survivors).toBeGreaterThan(0); // garde-fou : si un seul missile tuait, ce test n'aurait plus de sens
    const { world, hits, launches } = volley(survivors);
    expect(launches).toBe(survivors);
    expect(hits).toBe(survivors);
    expect(MISSILE_DAMAGE * survivors).toBeLessThan(SHIP_MAX_HP);
    expect(world.ships[1].alive).toBe(true);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - survivors * MISSILE_DAMAGE);
  });

  it('MISSILES_TO_KILL missiles tuent un vaisseau neuf (dégâts cumulés ≥ SHIP_MAX_HP), avec un EXPLOSION', () => {
    expect(MISSILE_DAMAGE * MISSILES_TO_KILL).toBeGreaterThanOrEqual(SHIP_MAX_HP);
    expect(MISSILES_TO_KILL).toBeLessThanOrEqual(MISSILE_STOCK_MAX); // le stock permet la salve
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    world.ships[0].missiles = MISSILES_TO_KILL;
    let explosions = 0;
    let hits = 0;
    for (let i = 0; i < 180; i++) {
      stepFire(world, true);
      explosions += eventsOf(world, EVT.EXPLOSION).length;
      hits += eventsOf(world, EVT.SHIP_HIT).length;
    }
    expect(hits).toBe(MISSILES_TO_KILL);
    expect(explosions).toBe(1);
    expect(world.ships[1].alive).toBe(false);
    expect(world.ships[1].hp).toBe(0);
  });

  it('un missile (MISSILE_DAMAGE) + une balle (BULLET_DAMAGE) s’additionnent sur les PV', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    world.ships[0].intent.fire = true;
    stepFire(world, true);
    world.ships[0].intent.fire = false;
    for (let i = 0; i < 120; i++) stepFire(world, false);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - MISSILE_DAMAGE - BULLET_DAMAGE);
  });
});

describe('missile : respawn', () => {
  it.each([0, MISSILE_STOCK_MAX])(
    'le respawn remet le stock à MISSILE_STOCK_MIN (stock avant la mort : %i)',
    (stock) => {
      const world = makeWorld();
      const ship = world.ships[0];
      ship.missiles = stock;
      ship.missileCooldown = 0.3;
      damageShip(world, 0, 1e6, ship.pos.x, ship.pos.y);
      expect(ship.alive).toBe(false);
      let steps = 0;
      while (!ship.alive && steps < 600) {
        stepFire(world, false);
        steps++;
      }
      expect(ship.alive).toBe(true);
      // Délai quantifié par le pas : RESPAWN_DELAY ± 1 pas.
      expect(Math.abs(steps * FIXED_DT - RESPAWN_DELAY)).toBeLessThanOrEqual(FIXED_DT + 1e-9);
      expect(ship.missiles).toBe(MISSILE_STOCK_MIN);
      expect(ship.missileCooldown).toBe(0);
    },
  );

  it('après le respawn, le vaisseau peut tirer son missile (planète de base toujours équipée)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = 0;
    damageShip(world, 0, 1e6, ship.pos.x, ship.pos.y);
    while (!ship.alive) stepFire(world, false);
    stepFire(world, true);
    expect(eventsOf(world, EVT.MISSILE_LAUNCH)).toHaveLength(1);
    expect(ship.missiles).toBe(0);
  });

  it('un missile en vol survit à la mort de son tireur et touche quand même', () => {
    const world = makeWorld({ target: { x: SX + 250, y: SY } });
    stepFire(world, true);
    damageShip(world, 0, 1e6, world.ships[0].pos.x, world.ships[0].pos.y);
    let hits = 0;
    for (let i = 0; i < 120; i++) {
      stepFire(world, false);
      hits += eventsOf(world, EVT.SHIP_HIT).length;
    }
    expect(hits).toBe(1);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - MISSILE_DAMAGE);
  });
});

describe('missile : déterminisme', () => {
  // Deux planètes équipées (une par faction), gravité, tirs, missiles guidés, impacts, respawns : seed influente via le RNG.
  const MAP = {
    width: 1200,
    height: 700,
    planets: [
      { x: 300, y: 350, radius: 50, owner: 0, built: 2 },
      { x: 900, y: 350, radius: 50, owner: 1, built: 2 },
    ],
    spawns: [
      { x: 300, y: 200, angle: 0 },
      { x: 900, y: 200, angle: Math.PI },
    ],
  };
  const STEPS = 3000;

  function simulate(seed) {
    const world = createWorld(MAP, seed, OPTIONS);
    const counts = { launches: 0, shipHits: 0, missileHits: 0 };
    for (let i = 0; i < STEPS; i++) {
      for (const ship of world.ships) {
        ship.intent.rotate = int(world.rng, -1, 2);
        ship.intent.thrust = world.tick % 9 < 3;
        ship.intent.fire = int(world.rng, 0, 6) === 0;
        ship.intent.missile = int(world.rng, 0, 3) !== 0;
        // Le réarmement relève d'une autre règle : on recharge à la main, de façon déterministe.
        if (world.tick % 90 === 0) ship.missiles = MISSILE_STOCK_MAX;
      }
      clearEvents(world.events);
      step(world, FIXED_DT);
      counts.launches += eventsOf(world, EVT.MISSILE_LAUNCH).length;
      counts.shipHits += eventsOf(world, EVT.SHIP_HIT).length;
      counts.missileHits += eventsOf(world, EVT.SHIP_HIT).filter(
        (e) => e.b === MISSILE_DAMAGE,
      ).length;
    }
    return { world, counts };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed + même script → JSON identique après 3000 pas, état fini, stock borné', () => {
    const a = simulate(777);
    const b = simulate(777);
    expect(a.world.tick).toBe(STEPS);
    expect(a.counts.launches).toBeGreaterThan(10); // le scénario exerce vraiment les missiles
    expect(a.counts).toEqual(b.counts);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(allFinite(a.world)).toBe(true);
    for (const ship of a.world.ships) {
      expect(ship.missiles).toBeGreaterThanOrEqual(0);
      expect(ship.missiles).toBeLessThanOrEqual(MISSILE_STOCK_MAX);
    }
    expect(a.world.events.dropped).toBe(0);
  });

  it('une autre seed diverge', () => {
    expect(JSON.stringify(simulate(1).world)).not.toBe(JSON.stringify(simulate(2).world));
  });
});
