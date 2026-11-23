import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  BULLET_SPEED,
  FIRE_COOLDOWN,
  FIXED_DT,
  PROJECTILE_CAPACITY,
  RESPAWN_DELAY,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
  SHIP_SIZE,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { wrapAngle } from '../../src/core/math.js';
import { int, nextFloat } from '../../src/core/rng.js';
import { createShip } from '../../src/core/ship.js';
import { arena } from '../../src/data/maps/arena.js';
import { createWorld, step } from '../../src/core/world.js';

const OPTIONS = { eventCapacity: 256 };

// Vol libre : carte immense, vaisseaux 0 et 1 face à face sur l'axe x (nez de 0 vers +x, nez de 1 vers −x).
// Les bases (planètes possédées, pour le respawn) sont à 5000 px : hors de portée de gravité (5 × 40 = 200).
const X0 = 50000;
const Y0 = 50000;
const DIST = 100;
const BASE_1 = 1;

const BULLET_STEP = BULLET_SPEED * FIXED_DT; // px parcourus par pas par une balle (vaisseau immobile)
const COOLDOWN_STEPS = Math.ceil(FIRE_COOLDOWN / FIXED_DT);
const HITS_TO_KILL = Math.ceil(SHIP_MAX_HP / BULLET_DAMAGE); // 5 avec 60 PV et 12 de dégâts
const R_HIT = SHIP_COLLISION_RADIUS; // une balle touche si elle passe à moins de ce rayon du centre

function freeMap({ dist = DIST, extraPlanets = [] } = {}) {
  return {
    width: 100000,
    height: 100000,
    planets: [
      { x: X0 - 5000, y: Y0 + 5000, radius: 40, owner: 0 },
      { x: X0 + 5000, y: Y0 + 5000, radius: 40, owner: 1 },
      ...extraPlanets,
    ],
    spawns: [
      { x: X0, y: Y0, angle: 0 },
      { x: X0 + dist, y: Y0, angle: Math.PI },
    ],
  };
}

// Combat sur bases : vaisseaux posés sur leurs planètes (nez vers le haut), planètes à 360 px (portée d'une balle : BULLET_SPEED × BULLET_LIFETIME = 512 px).
const BASES_MAP = {
  width: 1000,
  height: 700,
  planets: [
    { x: 300, y: 500, radius: 40, owner: 0 },
    { x: 660, y: 500, radius: 40, owner: 1 },
  ],
  spawns: [{ planet: 0 }, { planet: 1 }],
};

const makeWorld = (map = freeMap(), seed = 1) => createWorld(map, seed, OPTIONS);

function eventsOf(world, type) {
  const out = [];
  for (let i = 0; i < world.events.count; i++) {
    const e = world.events.items[i];
    if (type === undefined || e.type === type) out.push({ ...e });
  }
  return out;
}

/** Un pas ; `fires[i]` = intention de tir du vaisseau i (faux par défaut). Retourne les événements du pas. */
function tick(world, fires = []) {
  world.ships.forEach((ship, i) => {
    ship.intent.fire = fires[i] === true;
  });
  clearEvents(world.events);
  step(world, FIXED_DT);
  return eventsOf(world);
}

const activeCount = (world) => world.projectiles.filter((p) => p.active).length;
const ofType = (events, type) => events.filter((e) => e.type === type);

/**
 * Le vaisseau 0 tire en continu sur le vaisseau 1 jusqu'à la mort de ce dernier, puis cesse de tirer.
 * Retourne le journal des pas (événements, PV du vaisseau 1 après le pas, nombre de balles vivantes).
 */
function fireUntilDead(world, target = 1, maxSteps = 600) {
  const log = [];
  let shots = 0;
  while (world.ships[target].alive && log.length < maxSteps) {
    const events = tick(world, [true]);
    shots += ofType(events, EVT.SHOT).length;
    log.push({
      tick: world.tick - 1,
      events,
      hp: world.ships[target].hp,
      active: activeCount(world),
      shots,
    });
  }
  return log;
}

const hitsIn = (log) =>
  log.flatMap((l) => ofType(l.events, EVT.SHIP_HIT).map((e) => ({ ...e, tick: l.tick, hp: l.hp })));

describe('tir sur un vaisseau immobile en vol libre', () => {
  it('chaque balle qui touche retire BULLET_DAMAGE PV : SHIP_HIT (a = victime, b = dégâts), balle consommée', () => {
    const world = makeWorld();
    const log = fireUntilDead(world);
    const hits = hitsIn(log);

    // Cohérence du nombre de coups attendu : HITS_TO_KILL balles tuent, une de moins ne tue pas.
    expect(HITS_TO_KILL * BULLET_DAMAGE).toBeGreaterThanOrEqual(SHIP_MAX_HP);
    expect((HITS_TO_KILL - 1) * BULLET_DAMAGE).toBeLessThan(SHIP_MAX_HP);
    expect(hits).toHaveLength(HITS_TO_KILL);
    hits.forEach((h, k) => {
      expect(h.a).toBe(1);
      expect(h.b).toBe(BULLET_DAMAGE);
      // Le coup est compté après le SHIP_HIT : les PV du pas valent SHIP_MAX_HP − BULLET_DAMAGE·(k+1), plancher à 0 au dernier.
      expect(h.hp).toBe(Math.max(0, SHIP_MAX_HP - BULLET_DAMAGE * (k + 1)));
      // Le point d'impact est celui de la balle : dans le disque de collision du vaisseau cible.
      expect(Math.hypot(h.x - (X0 + DIST), h.y - Y0)).toBeLessThan(R_HIT);
    });

    // Chaque balle qui touche disparaît, les autres sont encore en vol (aucune n'a le temps d'expirer ici).
    for (const l of log) {
      const hitsSoFar = hitsIn(log.filter((x) => x.tick <= l.tick)).length;
      expect(l.active).toBe(l.shots - hitsSoFar);
    }
  });

  it('la première balle touche au pas attendu, puis les touches sont espacées de la cadence de tir', () => {
    const world = makeWorld();
    const hits = hitsIn(fireUntilDead(world));

    // La balle part à SHIP_SIZE du tireur et avance de BULLET_STEP par pas (dès le pas du tir) :
    // elle entre dans le disque (distance < R_HIT) au premier n tel que SHIP_SIZE + n·BULLET_STEP > DIST − R_HIT.
    const expectedFirst = Math.floor((DIST - R_HIT - SHIP_SIZE) / BULLET_STEP) + 1;
    // ±1 pas : marge d'arrondi flottant sur un franchissement de seuil (86 / 5,33 = 16,125, loin d'un entier).
    expect(Math.abs(hits[0].tick + 1 - expectedFirst)).toBeLessThanOrEqual(1);

    const gaps = hits.slice(1).map((h, i) => h.tick - hits[i].tick);
    // Même vitesse de balle et même cooldown réarmé : espacement constant, = plus petit nombre entier de pas
    // couvrant FIRE_COOLDOWN (au plus 1 pas de plus, arrondi flottant du décompte).
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThanOrEqual(FIRE_COOLDOWN / FIXED_DT);
    expect(gaps[0]).toBeLessThanOrEqual(COOLDOWN_STEPS + 1);
  });

  it('la 9e balle tue : alive = false, PV à 0, immobile, un seul EXPLOSION émis APRÈS le dernier SHIP_HIT', () => {
    const world = makeWorld();
    const victim = world.ships[1];
    const log = fireUntilDead(world);
    const last = log[log.length - 1];

    expect(victim.alive).toBe(false);
    expect(victim.hp).toBe(0);
    expect(victim.vel).toEqual({ x: 0, y: 0 });
    expect(victim.respawnTimer).toBe(RESPAWN_DELAY);

    // Dans le pas mortel : SHIP_HIT puis EXPLOSION, dans cet ordre.
    const types = last.events
      .map((e) => e.type)
      .filter((t) => t === EVT.SHIP_HIT || t === EVT.EXPLOSION);
    expect(types).toEqual([EVT.SHIP_HIT, EVT.EXPLOSION]);
    const explosion = ofType(last.events, EVT.EXPLOSION)[0];
    expect(explosion.a).toBe(1);
    expect(explosion.x).toBe(victim.pos.x);
    expect(explosion.y).toBe(victim.pos.y);

    // Un seul EXPLOSION sur toute la séquence, et jamais avant le pas mortel.
    expect(
      ofType(
        log.flatMap((l) => l.events),
        EVT.EXPLOSION,
      ),
    ).toHaveLength(1);
    // Le tireur n'a pas été touché.
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP);
    expect(world.ships[0].alive).toBe(true);
  });

  it('une balle de moins que HITS_TO_KILL ne suffit pas : le vaisseau survit avec SHIP_MAX_HP − (HITS_TO_KILL − 1)·BULLET_DAMAGE PV', () => {
    const world = makeWorld();
    const log = [];
    while (hitsIn(log).length < HITS_TO_KILL - 1) log.push(...fireUntilDeadStep(world));
    expect(world.ships[1].alive).toBe(true);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - (HITS_TO_KILL - 1) * BULLET_DAMAGE);
    expect(world.ships[1].hp).toBeGreaterThan(0);
    expect(
      ofType(
        log.flatMap((l) => l.events),
        EVT.EXPLOSION,
      ),
    ).toHaveLength(0);
  });

  it('puis le vaisseau 1 réapparaît sur sa base après RESPAWN_DELAY, à pleins PV, posé et immobile', () => {
    const world = makeWorld();
    const victim = world.ships[1];
    fireUntilDead(world);
    const deathTick = world.tick;

    let respawnEvent = null;
    let steps = 0;
    while (!victim.alive && steps < 1000) {
      const events = tick(world);
      steps++;
      respawnEvent ??= ofType(events, EVT.RESPAWN)[0] ?? null;
    }
    // Délai quantifié par le pas : RESPAWN_DELAY ± 1 pas (décompte flottant 3 − n/60).
    expect(Math.abs(steps * FIXED_DT - RESPAWN_DELAY)).toBeLessThanOrEqual(FIXED_DT + 1e-9);
    expect(world.tick).toBeGreaterThan(deathTick);

    expect(victim.alive).toBe(true);
    expect(victim.hp).toBe(SHIP_MAX_HP);
    expect(victim.landedOn).toBe(BASE_1);
    expect(victim.vel).toEqual({ x: 0, y: 0 });
    const base = world.planets[BASE_1];
    // Posé au sommet de sa base : exactement rayon + rayon de collision au-dessus du centre.
    expect(victim.pos.x).toBe(base.pos.x);
    expect(victim.pos.y).toBeCloseTo(base.pos.y - (base.radius + SHIP_COLLISION_RADIUS), 9);
    expect(respawnEvent).toMatchObject({ type: EVT.RESPAWN, a: 1, b: BASE_1 });
  });
});

/** Un pas de tir continu avec journal d'une entrée (pour les tests qui s'arrêtent avant la mort). */
function fireUntilDeadStep(world) {
  const events = tick(world, [true]);
  return [{ tick: world.tick - 1, events, hp: world.ships[1].hp, active: 0, shots: 0 }];
}

describe('vaisseau posé sur sa base', () => {
  // Les deux vaisseaux sont posés (nez vers le haut). Le vaisseau 0 est pivoté presque vers +x (état écrasé) :
  // sa balle traverse la carte jusqu'au vaisseau 1, posé à 360 px. Le cap est relevé de 0,015 rad (≈ 5 px de
  // hausse sur 360 px) pour compenser la chute due à l'attraction des deux planètes (mesurée ≈ +6 px sur ce trajet) ;
  // la cible fait 12 px de large (rayon 6), la marge est donc confortable.
  const AIM_UP = -0.015;
  function basesWorld() {
    const world = makeWorld(BASES_MAP);
    world.ships[0].angle = AIM_UP;
    return world;
  }

  it('est touché sans bouger et sans décoller : il reste posé tant qu’il survit', () => {
    const world = basesWorld();
    const victim = world.ships[1];
    expect(victim.landedOn).toBe(1);
    const startPos = { ...victim.pos };

    const log = [];
    while (hitsIn(log).length === 0 && log.length < 200) log.push(...fireUntilDeadStep(world));
    const hit = hitsIn(log)[0];
    expect(hit).toBeDefined();
    expect(hit.a).toBe(1);
    expect(victim.hp).toBe(SHIP_MAX_HP - BULLET_DAMAGE);
    expect(victim.alive).toBe(true);
    expect(victim.landedOn).toBe(1);
    expect(victim.pos).toEqual(startPos);
  });

  it('est tué : alive = false et landedOn remis à −1 ; il réapparaît ensuite posé sur sa base (landedOn = 1)', () => {
    const world = basesWorld();
    const victim = world.ships[1];
    const log = fireUntilDead(world, 1, 1500);

    expect(hitsIn(log)).toHaveLength(HITS_TO_KILL);
    expect(victim.alive).toBe(false);
    expect(victim.hp).toBe(0);
    expect(victim.landedOn).toBe(-1);

    let steps = 0;
    while (!victim.alive && steps < 1000) {
      tick(world);
      steps++;
    }
    expect(victim.alive).toBe(true);
    expect(victim.landedOn).toBe(1);
    expect(victim.hp).toBe(SHIP_MAX_HP);
  });
});

describe('pas de tir ami', () => {
  it('une balle passant au travers de son propre tireur ne le blesse pas (contrôle : un ennemi au même point est touché)', () => {
    // Vaisseau immobile, balle tirée puis tireur replacé exactement sur la balle (distance 0 < R_HIT).
    function overlap(shooterIndex) {
      const world = makeWorld();
      tick(world, [true]); // le vaisseau 0 tire
      const bullet = world.projectiles.find((p) => p.active);
      expect(bullet.owner).toBe(0);
      const ship = world.ships[shooterIndex];
      ship.pos.x = bullet.pos.x;
      ship.pos.y = bullet.pos.y;
      const events = [];
      for (let i = 0; i < 3; i++) events.push(...tick(world));
      return { world, bullet, ship, events };
    }

    const own = overlap(0);
    expect(ofType(own.events, EVT.SHIP_HIT)).toHaveLength(0);
    expect(own.ship.hp).toBe(SHIP_MAX_HP);
    expect(own.ship.alive).toBe(true);
    expect(own.bullet.active).toBe(true); // elle traverse le tireur

    const foe = overlap(1);
    expect(ofType(foe.events, EVT.SHIP_HIT)).toHaveLength(1);
    expect(foe.ship.hp).toBe(SHIP_MAX_HP - BULLET_DAMAGE);
    expect(foe.bullet.active).toBe(false);
  });

  it('deux vaisseaux de la faction 0 ne se touchent pas, dans les deux sens (contrôle : faction 1 touchée)', () => {
    function crossFire(factionOfTarget) {
      const world = makeWorld(freeMap());
      world.ships[1] = createShip(factionOfTarget, X0 + DIST, Y0, Math.PI);
      const events = [];
      for (let i = 0; i < 60; i++) {
        // Les deux vaisseaux tirent l'un sur l'autre en continu.
        events.push(...tick(world, [true, true]));
      }
      return { world, events };
    }

    const friends = crossFire(0);
    expect(ofType(friends.events, EVT.SHIP_HIT)).toHaveLength(0);
    expect(friends.world.ships[0].hp).toBe(SHIP_MAX_HP);
    expect(friends.world.ships[1].hp).toBe(SHIP_MAX_HP);
    // Les balles ont bien été tirées et sont passées de l'autre côté (traversée) : aucune n'a été consommée.
    const shots = ofType(friends.events, EVT.SHOT).length;
    expect(shots).toBeGreaterThan(8);
    expect(activeCount(friends.world)).toBe(shots);

    const enemies = crossFire(1);
    expect(ofType(enemies.events, EVT.SHIP_HIT).length).toBeGreaterThan(2);
    expect(enemies.world.ships[0].hp).toBeLessThan(SHIP_MAX_HP);
    expect(enemies.world.ships[1].hp).toBeLessThan(SHIP_MAX_HP);
  });
});

describe('une balle ne touche qu’un vaisseau', () => {
  it('deux ennemis superposés : un seul SHIP_HIT, sur le premier de la liste ; l’autre est intact', () => {
    const world = makeWorld();
    world.ships.push(createShip(2, X0 + DIST, Y0, Math.PI)); // même position que le vaisseau 1
    const events = [];
    events.push(...tick(world, [true]));
    for (let i = 0; i < 30; i++) events.push(...tick(world));

    const hits = ofType(events, EVT.SHIP_HIT);
    expect(hits).toHaveLength(1);
    expect(hits[0].a).toBe(1);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP - BULLET_DAMAGE);
    expect(world.ships[2].hp).toBe(SHIP_MAX_HP);
    expect(activeCount(world)).toBe(0);
  });

  it('deux ennemis alignés : la balle s’arrête sur le plus proche, le second n’est touché qu’une fois le premier mort', () => {
    const world = makeWorld();
    world.ships.push(createShip(2, X0 + 2 * DIST, Y0, Math.PI));
    const events = [];
    events.push(...tick(world, [true]));
    for (let i = 0; i < 30; i++) events.push(...tick(world));
    expect(ofType(events, EVT.SHIP_HIT).map((e) => e.a)).toEqual([1]);
    expect(world.ships[2].hp).toBe(SHIP_MAX_HP);

    // En tir continu : le vaisseau 2 ne souffre qu'à partir du moment où le vaisseau 1 est tombé.
    const log = fireUntilDead(world, 1);
    events.push(...log.flatMap((l) => l.events));
    expect(world.ships[1].alive).toBe(false);
    expect(world.ships[2].hp).toBe(SHIP_MAX_HP);
    for (let i = 0; i < 60; i++) events.push(...tick(world, [true]));
    const victims = ofType(events, EVT.SHIP_HIT).map((e) => e.a);
    expect(victims.slice(0, HITS_TO_KILL)).toEqual(new Array(HITS_TO_KILL).fill(1));
    expect(victims.slice(HITS_TO_KILL).every((a) => a === 2)).toBe(true);
    expect(victims.length).toBeGreaterThan(HITS_TO_KILL);
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('planète interposée', () => {
  // Planète de gravité nulle (n'influence pas les vaisseaux) entre les deux : rayon 20, à mi-chemin.
  const WALL = { x: X0 + DIST / 2, y: Y0, radius: 20, gravity: 0 };
  const WALL_INDEX = 2;

  it('absorbe la balle avant le vaisseau : BULLET_HIT, aucun SHIP_HIT, cible intacte', () => {
    const world = makeWorld(freeMap({ extraPlanets: [WALL] }));
    const events = [];
    for (let i = 0; i < 200; i++) events.push(...tick(world, [true]));

    const planetHits = ofType(events, EVT.BULLET_HIT);
    const shots = ofType(events, EVT.SHOT).length;
    expect(shots).toBeGreaterThan(10);
    expect(ofType(events, EVT.SHIP_HIT)).toHaveLength(0);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
    // Toutes les balles tirées finissent sur la planète (vol ≈ 6 pas ≪ 200), sauf la dernière éventuellement en vol.
    expect(planetHits.length).toBeGreaterThanOrEqual(shots - 1);
    expect(planetHits.every((e) => e.a === WALL_INDEX)).toBe(true);
    // Point d'impact : côté tireur de la planète (juste dans le disque), loin du vaisseau cible.
    for (const e of planetHits) {
      expect(e.x).toBeGreaterThan(WALL.x - WALL.radius);
      expect(e.x).toBeLessThan(WALL.x);
    }
  });

  it('contrôle : sans la planète, la même salve touche le vaisseau', () => {
    const world = makeWorld(freeMap());
    const events = [];
    for (let i = 0; i < 200; i++) events.push(...tick(world, [true]));
    expect(ofType(events, EVT.SHIP_HIT).length).toBeGreaterThan(0);
    expect(ofType(events, EVT.BULLET_HIT)).toHaveLength(0);
  });
});

describe('vaisseau mort et délai de respawn', () => {
  it('le vaisseau 1 mort est traversé : aucune touche, aucun dégât, aucun second EXPLOSION', () => {
    const world = makeWorld();
    const victim = world.ships[1];
    fireUntilDead(world);

    // Pendant tout le délai (moins un pas de marge), le tireur continue d'arroser la position du mort.
    const events = [];
    let crossed = false;
    const steps = Math.floor(RESPAWN_DELAY / FIXED_DT) - 2;
    for (let i = 0; i < steps; i++) {
      events.push(...tick(world, [true]));
      expect(victim.alive).toBe(false);
      // Une balle a dépassé le vaisseau mort sans être consommée : preuve de la traversée.
      if (world.projectiles.some((p) => p.active && p.pos.x > victim.pos.x + R_HIT + BULLET_STEP)) {
        crossed = true;
      }
    }
    expect(crossed).toBe(true);
    expect(ofType(events, EVT.SHIP_HIT)).toHaveLength(0);
    expect(ofType(events, EVT.EXPLOSION)).toHaveLength(0);
    expect(victim.hp).toBe(0);
    expect(victim.alive).toBe(false);
  });

  it('une balle déjà en vol au moment de la mort passe au travers sans effet', () => {
    const world = makeWorld();
    const victim = world.ships[1];
    // Vaisseau 1 à 1 coup de la mort ; deux balles à la suite : la 1re le tue, la 2e (déjà en vol) le traverse.
    victim.hp = BULLET_DAMAGE;
    const events = [];
    for (let i = 0; i < COOLDOWN_STEPS + 1; i++) events.push(...tick(world, [true]));
    for (let i = 0; i < 30; i++) events.push(...tick(world));
    expect(ofType(events, EVT.SHOT)).toHaveLength(2);
    expect(ofType(events, EVT.SHIP_HIT)).toHaveLength(1);
    expect(ofType(events, EVT.EXPLOSION)).toHaveLength(1);
    expect(victim.hp).toBe(0);
  });
});

describe('le tireur meurt, sa balle déjà en vol continue', () => {
  // Observé : le projectile est indépendant de son tireur (seul `owner` est conservé) : la balle d'un vaisseau mort
  // continue et blesse l'adversaire. Le vaisseau 1 tire en premier (tick 0) sur le vaisseau 0 (1 coup de la mort,
  // PV écrasés) ; le vaisseau 0 tire 5 pas après : sa balle est encore en vol quand il tombe.
  const FAR = 300;
  const HEAD_START = 5;

  it('la balle du mort touche encore, après sa mort', () => {
    const world = makeWorld(freeMap({ dist: FAR }));
    const [shooter, foe] = world.ships;
    shooter.hp = BULLET_DAMAGE;

    const log = [];
    for (let i = 0; i < 200; i++) {
      const fires = [i === HEAD_START, i === 0];
      const events = tick(world, fires);
      log.push({ tick: world.tick - 1, events, aliveShooter: shooter.alive, foeHp: foe.hp });
    }

    const explosion = log.find((l) => ofType(l.events, EVT.EXPLOSION).length > 0);
    const foeHit = log.find((l) => ofType(l.events, EVT.SHIP_HIT).some((e) => e.a === 1));
    expect(explosion).toBeDefined();
    expect(ofType(explosion.events, EVT.EXPLOSION)[0].a).toBe(0);
    expect(foeHit).toBeDefined();

    // La balle du mort touche exactement HEAD_START pas après celle qui l'a tué (même vitesse, même trajet).
    expect(foeHit.tick - explosion.tick).toBe(HEAD_START);
    expect(foeHit.aliveShooter).toBe(false);
    expect(shooter.alive).toBe(false);
    expect(shooter.hp).toBe(0);
    expect(foe.hp).toBe(SHIP_MAX_HP - BULLET_DAMAGE);
    // Chaque vaisseau n'a tiré qu'une fois : 2 SHOT, aucun tir posthume.
    expect(
      ofType(
        log.flatMap((l) => l.events),
        EVT.SHOT,
      ),
    ).toHaveLength(2);
    expect(activeCount(world)).toBe(0);
  });
});

describe('déterminisme d’un combat', () => {
  const STEPS = 3000;

  /** Pilotage mi-aléatoire (world.rng) : vise l'ennemi 7 fois sur 10, sinon tourne au hasard ; pousse parfois ; tire souvent. */
  function script(world) {
    world.ships.forEach((ship, i) => {
      const foe = world.ships[1 - i];
      const aim = Math.atan2(foe.pos.y - ship.pos.y, foe.pos.x - ship.pos.x);
      ship.intent.rotate =
        nextFloat(world.rng) < 0.7 ? Math.sign(wrapAngle(aim - ship.angle)) : int(world.rng, -1, 2);
      ship.intent.thrust = int(world.rng, 0, 12) === 0;
      ship.intent.fire = int(world.rng, 0, 3) !== 0;
    });
  }

  function simulate(seed) {
    const world = makeWorld(BASES_MAP, seed);
    const counts = { shots: 0, hits: 0, deaths: 0, planetHits: 0, respawns: 0 };
    for (let i = 0; i < STEPS; i++) {
      script(world);
      clearEvents(world.events);
      step(world, FIXED_DT);
      counts.shots += ofType(eventsOf(world), EVT.SHOT).length;
      counts.hits += ofType(eventsOf(world), EVT.SHIP_HIT).length;
      counts.deaths += ofType(eventsOf(world), EVT.EXPLOSION).length;
      counts.planetHits += ofType(eventsOf(world), EVT.BULLET_HIT).length;
      counts.respawns += ofType(eventsOf(world), EVT.RESPAWN).length;
    }
    return { world, counts };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed + même script → JSON identique après 3000 pas, état fini, mêmes compteurs', () => {
    const a = simulate(777);
    const b = simulate(777);

    expect(a.world.tick).toBe(STEPS);
    // Le scénario exerce vraiment le combat : tirs, touches, morts et réapparitions.
    expect(a.counts.shots).toBeGreaterThan(100);
    expect(a.counts.hits).toBeGreaterThan(0);
    expect(a.counts.deaths).toBeGreaterThan(0);
    expect(a.counts.respawns).toBeGreaterThan(0);
    expect(a.counts).toEqual(b.counts);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(allFinite(a.world)).toBe(true);
    expect(a.world.projectiles).toHaveLength(PROJECTILE_CAPACITY);
    expect(a.world.events.dropped).toBe(0);
    // Invariants de bornes : PV dans [0, SHIP_MAX_HP], et mort ⇔ PV à 0.
    for (const ship of a.world.ships) {
      expect(ship.hp).toBeGreaterThanOrEqual(0);
      expect(ship.hp).toBeLessThanOrEqual(SHIP_MAX_HP);
      expect(ship.alive).toBe(ship.hp > 0);
    }
  });

  it('une autre seed donne un autre combat', () => {
    expect(JSON.stringify(simulate(1).world)).not.toBe(JSON.stringify(simulate(2).world));
  });
});

describe('carte arena (intégration)', () => {
  it('le monde contient 3 vaisseaux posés sur leurs bases et 3 planètes possédées par 0, 1 et 2', () => {
    const world = createWorld(arena, 1, { eventCapacity: 64 });
    expect(world.ships).toHaveLength(3);
    expect(world.ships.map((s) => s.landedOn)).toEqual([0, 1, 2]);
    expect(world.ships.map((s) => s.faction)).toEqual([0, 1, 2]);
    expect(world.planets.filter((p) => p.owner >= 0).map((p) => p.owner)).toEqual([0, 1, 2]);
    expect(world.planets.slice(0, 3).map((p) => p.owner)).toEqual([0, 1, 2]);
    for (const ship of world.ships) {
      const base = world.planets[ship.landedOn];
      expect(ship.pos.x).toBe(base.pos.x);
      // Posé au sommet : rayon + rayon de collision au-dessus du centre (arrondi flottant → 9 décimales).
      expect(ship.pos.y).toBeCloseTo(base.pos.y - (base.radius + SHIP_COLLISION_RADIUS), 9);
    }
  });

  it('600 pas sans intention : aucune erreur, vaisseaux toujours posés et intacts, état fini', () => {
    const world = createWorld(arena, 1, { eventCapacity: 64 });
    const before = JSON.stringify(world.ships);
    expect(() => {
      for (let i = 0; i < 600; i++) step(world, FIXED_DT);
    }).not.toThrow();

    expect(world.tick).toBe(600);
    // Sans pilote, rien ne bouge ni ne tire : les vaisseaux n'ont pas décollé et la file d'événements est vide.
    expect(JSON.stringify(world.ships)).toBe(before);
    expect(world.events.count).toBe(0);
    expect(world.events.dropped).toBe(0);
    expect(world.projectiles.some((p) => p.active)).toBe(false);
    const finite = JSON.stringify(world, (_k, v) =>
      typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v,
    );
    expect(finite).not.toContain('"NaN"');
  });
});
