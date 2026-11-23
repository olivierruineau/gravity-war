import { describe, expect, it } from 'vitest';
import {
  BULLET_DAMAGE,
  EVENT_CAPACITY,
  FIRE_COOLDOWN,
  FIXED_DT,
  LANDING_MAX_RADIAL_SPEED,
  RESPAWN_DELAY,
  SHIELD_MAX,
  SHIELD_RECHARGE_DELAY,
  SHIELD_RECHARGE_RATE,
  SHIP_COLLISION_RADIUS,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { wrapAngle } from '../../src/core/math.js';
import { createRng, int } from '../../src/core/rng.js';
import { createWorld, step } from '../../src/core/world.js';

// Bouclier passif en simulation (ADR 0005 §6-§7) sur de mini-cartes. Les vaisseaux sont placés loin de toute
// planète (hors portée de gravité : 5 × rayon = 300 px) sauf dans les scénarios de contact au sol.
// Pas fixe FIXED_DT = 1/60 ; les durées en pas sont arrondies car chaque décompte soustrait dt à un flottant.
const OPTIONS = { eventCapacity: EVENT_CAPACITY };
const X0 = 20000;
const Y0 = 20000;
const UP = -Math.PI / 2;
const COOLDOWN_STEPS = Math.ceil(FIRE_COOLDOWN / FIXED_DT); // 11 pas entre deux tirs maintenus (10,8 arrondi)
const DELAY_STEPS = Math.round(SHIELD_RECHARGE_DELAY / FIXED_DT); // 240
const RECHARGE_STEPS = Math.round(SHIELD_MAX / SHIELD_RECHARGE_RATE / FIXED_DT); // 300
const FULL_STEPS = DELAY_STEPS + RECHARGE_STEPS; // 540 = 9 s
// Nombres de balles pour tuer, dérivés de l'équilibrage (10 et 5 avec 60 PV, 50 de bouclier, 12 de dégâts).
const SHIELDED_HITS_TO_KILL = Math.ceil((SHIELD_MAX + SHIP_MAX_HP) / BULLET_DAMAGE);
const BARE_HITS_TO_KILL = Math.ceil(SHIP_MAX_HP / BULLET_DAMAGE);
const HIT_X = 0;
const HIT_Y = 0;

// Planète lointaine de la faction 0 ; `built: 3` = générateur de bouclier construit.
const generatorPlanet = { x: 5000, y: 5000, radius: 60, owner: 0, built: 3 };
const noGeneratorPlanet = { ...generatorPlanet, built: 2 };

/** Vaisseau 0 (faction 0) en vol libre en (X0, Y0), vaisseau 1 (faction 1) à `gap` px à gauche, nez vers lui. */
function duelWorld({ planets = [generatorPlanet], gap = 300, seed = 1 } = {}) {
  return createWorld(
    {
      width: 40000,
      height: 40000,
      planets,
      spawns: [
        { x: X0, y: Y0, angle: UP },
        { x: X0 - gap, y: Y0, angle: 0 },
      ],
    },
    seed,
    OPTIONS,
  );
}

function stepOnce(world, dt = FIXED_DT) {
  clearEvents(world.events);
  step(world, dt);
}

function eventsOf(world, type) {
  const out = [];
  for (let i = 0; i < world.events.count; i++) {
    const e = world.events.items[i];
    if (e.type === type) out.push({ ...e });
  }
  return out;
}

/**
 * Le vaisseau 1 tire en continu sur le vaisseau 0 jusqu'à sa mort (ou `maxSteps`). Renvoie, pour chaque balle
 * qui touche, l'état du vaisseau 0 juste après l'impact et le tick du pas.
 */
function fireUntilDead(world, maxSteps = 2000) {
  const target = world.ships[0];
  const hits = [];
  world.ships[1].intent.fire = true;
  for (let i = 0; i < maxSteps && target.alive; i++) {
    const tick = world.tick;
    stepOnce(world);
    for (const e of eventsOf(world, EVT.SHIP_HIT)) {
      hits.push({ tick, damage: e.b, shield: target.shield, hp: target.hp, alive: target.alive });
    }
  }
  world.ships[1].intent.fire = false;
  return hits;
}

/** Avance jusqu'à ce que le bouclier du vaisseau 0 soit plein ; renvoie le nombre de pas (échec au-delà de `max`). */
function stepsUntilFull(world, max = 2 * FULL_STEPS) {
  for (let n = 1; n <= max; n++) {
    stepOnce(world);
    if (world.ships[0].shield >= SHIELD_MAX) return n;
  }
  throw new Error('le bouclier ne se recharge pas : scénario invalide');
}

describe('balles ennemies contre un bouclier plein', () => {
  it('les premières balles sont absorbées par le bouclier, puis les PV encaissent', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    const hits = fireUntilDead(world);

    // SHIELD_MAX / BULLET_DAMAGE balles entièrement absorbées (4 avec 50 et 12 : 50 → 38 → 26 → 14 → 2), PV intacts.
    const absorbed = Math.floor(SHIELD_MAX / BULLET_DAMAGE);
    // La balle suivante déborde : il doit rester du bouclier non entier pour que le scénario ait un débordement.
    const overflow = BULLET_DAMAGE * (absorbed + 1) - SHIELD_MAX;
    expect(overflow).toBeGreaterThan(0);
    expect(overflow).toBeLessThan(BULLET_DAMAGE);
    for (let n = 0; n < absorbed; n++) {
      expect(hits[n].damage).toBe(BULLET_DAMAGE);
      expect(hits[n].shield).toBe(SHIELD_MAX - BULLET_DAMAGE * (n + 1));
      expect(hits[n].hp).toBe(SHIP_MAX_HP);
    }
    // Balle suivante : le reste du bouclier est absorbé, le débordement va aux PV → bouclier 0.
    expect(hits[absorbed].shield).toBe(0);
    expect(hits[absorbed].hp).toBe(SHIP_MAX_HP - overflow);
    // Ensuite, les PV seuls : −BULLET_DAMAGE par balle.
    expect(hits[absorbed + 1].shield).toBe(0);
    expect(hits[absorbed + 1].hp).toBe(SHIP_MAX_HP - overflow - BULLET_DAMAGE);
  });

  it('shield + hp décroît de BULLET_DAMAGE par balle tant que le vaisseau survit (conservation des points de vie totaux)', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    const hits = fireUntilDead(world);
    hits.forEach((h, n) => {
      if (!h.alive) return;
      expect(h.shield + h.hp).toBe(SHIELD_MAX + SHIP_MAX_HP - BULLET_DAMAGE * (n + 1));
    });
  });

  it('temps pour tuer : (SHIP_MAX_HP + SHIELD_MAX) / BULLET_DAMAGE balles (le dernier coup tue, pas l’avant-dernier)', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    const hits = fireUntilDead(world);

    expect(hits).toHaveLength(SHIELDED_HITS_TO_KILL);
    expect(hits.slice(0, -1).every((h) => h.alive)).toBe(true);
    expect(hits[hits.length - 1].alive).toBe(false);
    expect(world.ships[0].alive).toBe(false);
    // Le bouclier fait encaisser des balles de plus que sans lui (cf. test suivant).
    expect(SHIELDED_HITS_TO_KILL).toBeGreaterThan(BARE_HITS_TO_KILL);
    // Cadence : le décompte du cooldown est quantifié par le pas, donc l'écart entre deux impacts successifs
    // vaut exactement COOLDOWN_STEPS pas (balles identiques, cible immobile) : N − 1 intervalles entre N impacts.
    expect(hits[hits.length - 1].tick - hits[0].tick).toBe(
      (SHIELDED_HITS_TO_KILL - 1) * COOLDOWN_STEPS,
    );
  });

  it('contrôle : sans bouclier (shield 0, pas de générateur) il faut SHIP_MAX_HP / BULLET_DAMAGE balles (arrondi sup.)', () => {
    const world = duelWorld({ planets: [noGeneratorPlanet] });
    const hits = fireUntilDead(world);
    expect(hits).toHaveLength(BARE_HITS_TO_KILL);
    expect(world.ships[0].alive).toBe(false);
  });

  it('un seul EXPLOSION, au coup mortel, et aucun pendant l’absorption', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    world.ships[1].intent.fire = true;
    let explosions = 0;
    let hitsBeforeExplosion = 0;
    for (let i = 0; i < 2000 && explosions === 0; i++) {
      stepOnce(world);
      explosions += eventsOf(world, EVT.EXPLOSION).length;
      if (explosions === 0) hitsBeforeExplosion += eventsOf(world, EVT.SHIP_HIT).length;
    }
    expect(explosions).toBe(1);
    expect(hitsBeforeExplosion).toBe(SHIELDED_HITS_TO_KILL - 1);
  });
});

describe('recharge du bouclier', () => {
  it('en vol : recharge complète ≈ délai + 50 / 10 = 9 s après le dernier dégât (±2 pas, voir commentaire)', () => {
    const world = duelWorld();
    const ship = world.ships[0];
    ship.vel.x = 10; // en mouvement, loin de toute planète : vol libre
    ship.shield = SHIELD_MAX;
    damageShip(world, 0, SHIELD_MAX, HIT_X, HIT_Y); // vide le bouclier, PV intacts, délai armé
    expect(ship.shield).toBe(0);
    expect(ship.hp).toBe(SHIP_MAX_HP);

    const n = stepsUntilFull(world);
    expect(ship.landedOn).toBe(-1);
    // Théorie : 240 pas de délai + 300 pas de recharge = 540. Écart toléré ±2 pas : le délai (4 − 240/60 en
    // flottant) peut demander un pas de plus, et le dernier incrément (+1/6) arrive un pas plus tôt ou plus tard
    // selon l'arrondi cumulé ; une dérive plus grande signalerait un vrai bug de rythme.
    expect(Math.abs(n - FULL_STEPS)).toBeLessThanOrEqual(2);
    expect(ship.shield).toBe(SHIELD_MAX);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('en vol : aucune recharge pendant le délai, puis ≈ +10 par seconde', () => {
    const world = duelWorld();
    const ship = world.ships[0];
    damageShip(world, 0, 1, HIT_X, HIT_Y); // shield 0 : le dégât arme seulement le délai
    for (let i = 0; i < DELAY_STEPS - 2; i++) {
      stepOnce(world);
      expect(ship.shield).toBe(0);
    }
    for (let i = 0; i < 2 + 2 + 60; i++) stepOnce(world); // franchit la fin du délai (≤ +2 pas) puis 60 pas
    // Entre 58 et 60 pas de recharge effective (délai de 240 ou 241 pas) × 1/6 par pas : 9,67 à 10 ; ± 0,5 de marge.
    expect(ship.shield).toBeGreaterThan(9);
    expect(ship.shield).toBeLessThanOrEqual(SHIELD_RECHARGE_RATE + 0.5);
  });

  it('posé sur une planète de sa faction : même durée de recharge (≈ 9 s ±2 pas)', () => {
    const planet = { x: 3000, y: 3000, radius: 60, owner: 0, built: 3 };
    const world = createWorld(
      { width: 6000, height: 6000, planets: [planet], spawns: [{ planet: 0 }] },
      1,
      OPTIONS,
    );
    const ship = world.ships[0];
    expect(ship.landedOn).toBe(0);
    // Le spawn { planet } donne un bouclier plein (générateur construit) : on le vide d'abord, sinon il n'y a rien à recharger.
    expect(ship.shield).toBe(SHIELD_MAX);
    ship.shield = 0;
    damageShip(world, 0, 1, HIT_X, HIT_Y);
    const n = stepsUntilFull(world);
    // Dégât de 1 sur un bouclier à 0 : le délai part de SHIELD_RECHARGE_DELAY, même tolérance que ci-dessus.
    expect(Math.abs(n - FULL_STEPS)).toBeLessThanOrEqual(2);
    expect(ship.landedOn).toBe(0); // il n'a pas décollé
  });

  it('un tir pendant la recharge relance le délai complet', () => {
    const world = duelWorld();
    const ship = world.ships[0];
    ship.shield = 0;
    ship.shieldDelay = 0;
    for (let i = 0; i < 120; i++) stepOnce(world); // 2 s de recharge : ≈ 20
    expect(ship.shield).toBeCloseTo(2 * SHIELD_RECHARGE_RATE, 0); // ±0,5 : granularité d'un pas (1/6)
    const before = ship.shield;

    damageShip(world, 0, 5, HIT_X, HIT_Y);
    expect(ship.shield).toBeCloseTo(before - 5, 9);
    const afterHit = ship.shield;
    // Pendant DELAY_STEPS − 2 pas, aucune recharge.
    for (let i = 0; i < DELAY_STEPS - 2; i++) stepOnce(world);
    expect(ship.shield).toBe(afterHit);
    // Puis la recharge reprend.
    for (let i = 0; i < 20; i++) stepOnce(world);
    expect(ship.shield).toBeGreaterThan(afterHit);
  });
});

describe('perte et regain du générateur', () => {
  it('le bouclier n’est plus rechargé quand la faction perd son générateur (planète rendue neutre)', () => {
    const world = duelWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    damageShip(world, 0, 30, HIT_X, HIT_Y);
    expect(ship.shield).toBe(20);
    expect(world.factions[0].hasShield).toBe(true);

    world.planets[0].owner = -1; // la planète devient neutre : la faction 0 n'a plus de générateur
    stepOnce(world);
    expect(world.factions[0].hasShield).toBe(false);
    for (let i = 0; i < 2 * FULL_STEPS; i++) stepOnce(world);
    // Le délai est écoulé depuis longtemps : sans générateur, rien ne se recharge.
    expect(ship.shield).toBe(20);
    expect(ship.shieldDelay).toBeLessThanOrEqual(0);
  });

  it('perte en pleine recharge : le bouclier se fige à sa valeur, puis repart si la faction reprend le générateur', () => {
    const world = duelWorld();
    const ship = world.ships[0];
    ship.shield = 0;
    ship.shieldDelay = 0;
    for (let i = 0; i < 120; i++) stepOnce(world); // ≈ 20
    world.planets[0].owner = -1;
    stepOnce(world); // le pas qui suit la perte peut encore recharger (hasShield est recalculé en fin de pas)
    const frozen = ship.shield;
    expect(frozen).toBeGreaterThan(15);
    for (let i = 0; i < 300; i++) stepOnce(world);
    expect(ship.shield).toBe(frozen);

    world.planets[0].owner = 0; // les bâtiments sont conservés (assignation directe, pas de capture)
    stepOnce(world);
    for (let i = 0; i < 60; i++) stepOnce(world);
    // ≈ +10 sur la seconde (±0,5 : un pas de recharge de plus ou de moins selon le pas de resynchronisation).
    expect(ship.shield - frozen).toBeGreaterThan(SHIELD_RECHARGE_RATE - 0.5);
    expect(ship.shield - frozen).toBeLessThan(SHIELD_RECHARGE_RATE + 1);
  });

  it('sans générateur dès le départ, un bouclier à 0 reste à 0 et les PV absorbent tout', () => {
    const world = duelWorld({ planets: [noGeneratorPlanet] });
    for (let i = 0; i < 600; i++) stepOnce(world);
    expect(world.ships[0].shield).toBe(0);
    damageShip(world, 0, 10, HIT_X, HIT_Y);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP - 10);
  });
});

describe('impact au sol et bouclier', () => {
  const PLANET = { x: 3000, y: 3000, radius: 60, gravity: 70, owner: 0, built: 3 };
  const CONTACT = PLANET.radius + SHIP_COLLISION_RADIUS;

  /** Vaisseau 0 à 0,5 px au-dessus du seuil de contact, nez vers l'extérieur, lancé vers le centre à `speed`. */
  function approachWorld(speed, steps = 1) {
    const world = createWorld(
      { width: 6000, height: 6000, planets: [PLANET], spawns: [{ x: 0, y: 0, angle: UP }] },
      1,
      OPTIONS,
    );
    const ship = world.ships[0];
    ship.pos.x = PLANET.x;
    ship.pos.y = PLANET.y - (CONTACT + 0.5);
    ship.vel.y = speed;
    ship.shield = SHIELD_MAX;
    let impacts = [];
    for (let i = 0; i < steps && impacts.length === 0 && ship.landedOn < 0; i++) {
      stepOnce(world);
      impacts = eventsOf(world, EVT.IMPACT);
    }
    return { world, ship, damage: impacts.length > 0 ? impacts[0].b : 0, impacts };
  }

  /** Impact attendu au premier pas (vitesse d'approche ≥ 60 px/s : plus de 1 px par pas). */
  function crashWorld(speed) {
    const result = approachWorld(speed);
    expect(result.impacts).toHaveLength(1);
    return result;
  }

  it('un impact modéré est absorbé d’abord par le bouclier : IMPACT.b = dégâts, PV intacts', () => {
    const moderate = 0.4 * SHIELD_MAX; // largement sous le bouclier plein
    const { ship, damage, world } = crashWorld(LANDING_MAX_RADIAL_SPEED + moderate);
    // Dégâts = excès de vitesse d'approche (moderate) + l'accélération gravitationnelle du pas (≤ 70/60 ≈ 1,2).
    expect(damage).toBeGreaterThanOrEqual(moderate);
    expect(damage).toBeLessThan(moderate + 1.5);
    expect(ship.hp).toBe(SHIP_MAX_HP);
    expect(ship.shield).toBeCloseTo(SHIELD_MAX - damage - 0, 9); // le même pas ne recharge pas (délai armé)
    expect(ship.alive).toBe(true);
    expect(eventsOf(world, EVT.EXPLOSION)).toHaveLength(0);
  });

  it('un impact qui dépasse le bouclier déborde sur les PV : shield 0, hp = SHIP_MAX_HP − (dégâts − SHIELD_MAX)', () => {
    // Dégâts visés = SHIELD_MAX + la moitié des PV : déborde sans tuer.
    const { ship, damage } = crashWorld(LANDING_MAX_RADIAL_SPEED + SHIELD_MAX + SHIP_MAX_HP / 2);
    expect(damage).toBeGreaterThan(SHIELD_MAX);
    expect(ship.shield).toBe(0);
    expect(ship.hp).toBeCloseTo(SHIP_MAX_HP - (damage - SHIELD_MAX), 9);
    expect(ship.alive).toBe(true);
  });

  it('un impact qui aurait tué sans bouclier (≥ SHIP_MAX_HP) est survécu avec un bouclier plein si dégâts < SHIP_MAX_HP + SHIELD_MAX', () => {
    // Dégâts visés = SHIP_MAX_HP + la moitié du bouclier : au-dessus des PV, sous PV + bouclier (marge ≥ g·dt).
    const { ship, damage } = crashWorld(LANDING_MAX_RADIAL_SPEED + SHIP_MAX_HP + SHIELD_MAX / 2);
    expect(damage).toBeGreaterThan(SHIP_MAX_HP);
    expect(damage).toBeLessThan(SHIELD_MAX + SHIP_MAX_HP);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBeCloseTo(SHIP_MAX_HP + SHIELD_MAX - damage, 9);
  });

  it('un impact ≥ SHIP_MAX_HP + SHIELD_MAX reste mortel malgré le bouclier plein', () => {
    const { ship } = crashWorld(LANDING_MAX_RADIAL_SPEED + SHIP_MAX_HP + SHIELD_MAX + 10);
    expect(ship.alive).toBe(false);
    expect(ship.shield).toBe(0);
  });

  it('un atterrissage réussi ne consomme pas le bouclier et ne relance pas le délai', () => {
    // 30 px/s = 0,5 px par pas : quelques pas pour franchir la marge de 0,5 px.
    const { ship, impacts } = approachWorld(LANDING_MAX_RADIAL_SPEED - 15, 10);
    expect(impacts).toHaveLength(0);
    expect(ship.landedOn).toBe(0);
    expect(ship.shield).toBe(SHIELD_MAX);
    expect(ship.shieldDelay).toBe(0);
  });
});

describe('respawn et bouclier', () => {
  /** Tue le vaisseau 0 à coups de balles puis avance jusqu'à sa réapparition. */
  function killAndRespawn(world) {
    fireUntilDead(world);
    const ship = world.ships[0];
    expect(ship.alive).toBe(false);
    let steps = 0;
    while (!ship.alive && steps < 2 * RESPAWN_DELAY * 60) {
      stepOnce(world);
      steps++;
    }
    return steps;
  }

  it('réapparaît avec bouclier plein et PV pleins si la faction a débloqué le générateur', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    const steps = killAndRespawn(world);
    const ship = world.ships[0];
    expect(ship.alive).toBe(true);
    // 3 s = 180 pas ; le décompte flottant autorise ±1 pas.
    expect(Math.abs(steps - RESPAWN_DELAY / FIXED_DT)).toBeLessThanOrEqual(1);
    expect(ship.hp).toBe(SHIP_MAX_HP);
    expect(ship.shield).toBe(SHIELD_MAX);
    expect(ship.shieldDelay).toBe(0);
    expect(ship.landedOn).toBe(0);
    // Il reste plein : aucun dépassement du plafond après le respawn.
    for (let i = 0; i < 200; i++) stepOnce(world);
    expect(ship.shield).toBe(SHIELD_MAX);
  });

  it('réapparaît sans bouclier si la faction n’a pas de générateur, et n’en gagne pas ensuite', () => {
    const world = duelWorld({ planets: [noGeneratorPlanet] });
    killAndRespawn(world);
    const ship = world.ships[0];
    expect(ship.alive).toBe(true);
    expect(ship.shield).toBe(0);
    for (let i = 0; i < 600; i++) stepOnce(world);
    expect(ship.shield).toBe(0);
  });

  it('le bouclier de respawn absorbe à nouveau : il faut encore autant de balles que la première fois pour le tuer', () => {
    const world = duelWorld();
    world.ships[0].shield = SHIELD_MAX;
    killAndRespawn(world);
    // Il est posé sur la planète lointaine : on rapproche le tireur (tir en vol libre, cible immobile).
    const ship = world.ships[0];
    const shooter = world.ships[1];
    ship.landedOn = -1;
    ship.pos.x = X0;
    ship.pos.y = Y0;
    ship.vel.x = 0;
    ship.vel.y = 0;
    shooter.pos.x = X0 - 300;
    shooter.pos.y = Y0;
    shooter.angle = 0;
    const hits = fireUntilDead(world);
    expect(hits).toHaveLength(SHIELDED_HITS_TO_KILL);
  });
});

describe('déterminisme et invariants sur 3000 pas', () => {
  const STEPS = 3000;

  /**
   * Duel entre deux pilotes aléatoires (RNG seedé, décisions maintenues 5 pas), deux planètes (la faction 0 a
   * le générateur). Vérifie à chaque pas les invariants du bouclier, et renvoie l'état final + des compteurs.
   */
  function runDuel(seed) {
    const world = createWorld(
      {
        width: 1600,
        height: 900,
        planets: [
          { x: 400, y: 450, radius: 60, owner: 0, built: 3 },
          { x: 1200, y: 450, radius: 60, owner: 1 },
        ],
        spawns: [
          { x: 700, y: 300, angle: 0 },
          { x: 900, y: 600, angle: Math.PI },
        ],
      },
      seed,
      OPTIONS,
    );
    world.ships[0].shield = SHIELD_MAX;
    const pilot = createRng(seed + 1000); // RNG des pilotes, distinct de world.rng
    const stats = { hits: 0, deaths: 0, respawns: 0, absorbed: 0 };

    for (let tick = 0; tick < STEPS; tick++) {
      if (tick % 5 === 0) {
        // Chaque pilote vise l'adversaire (avec 12 % d'erreur de manoeuvre), tire en continu et pousse rarement.
        for (const s of world.ships) {
          const foe = world.ships[1 - world.ships.indexOf(s)];
          const err = wrapAngle(Math.atan2(foe.pos.y - s.pos.y, foe.pos.x - s.pos.x) - s.angle);
          s.intent.rotate = int(pilot, 0, 8) === 0 ? int(pilot, -1, 2) : Math.sign(err);
          s.intent.thrust = int(pilot, 0, 16) === 0;
          s.intent.fire = true;
        }
      }
      const before = world.ships.map((s) => ({
        alive: s.alive,
        shield: s.shield,
        delay: s.shieldDelay,
        hasShield: world.factions[s.faction].hasShield,
      }));
      stepOnce(world);
      stats.hits += eventsOf(world, EVT.SHIP_HIT).length;
      stats.deaths += eventsOf(world, EVT.EXPLOSION).length;
      stats.respawns += eventsOf(world, EVT.RESPAWN).length;

      world.ships.forEach((s, i) => {
        const b = before[i];
        expect(s.shield).toBeGreaterThanOrEqual(0);
        expect(s.shield).toBeLessThanOrEqual(SHIELD_MAX);
        expect(s.hp).toBeGreaterThanOrEqual(0);
        expect(s.hp).toBeLessThanOrEqual(SHIP_MAX_HP);
        if (s.shield > b.shield && b.alive) {
          // Une hausse en vol n'arrive que sans dégât récent et avec un générateur.
          expect(b.hasShield).toBe(true);
          expect(b.delay).toBeLessThanOrEqual(0);
        }
        if (s.shield < b.shield && s.alive) {
          stats.absorbed++;
          // Après une absorption, le délai est réarmé puis décompté une fois dans le même pas.
          expect(s.shieldDelay).toBeCloseTo(SHIELD_RECHARGE_DELAY - FIXED_DT, 9);
        }
      });
    }
    return { json: JSON.stringify(world), stats };
  }

  it('deux exécutions de même graine donnent un monde identique à l’octet près', () => {
    const a = runDuel(7);
    const b = runDuel(7);
    expect(a.json).toBe(b.json);
    expect(a.stats).toEqual(b.stats);
  });

  it('le scénario exerce vraiment le bouclier (tirs reçus, absorptions) et respecte les invariants', () => {
    const { stats } = runDuel(7);
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.absorbed).toBeGreaterThan(0);
    // Au moins une mort et un respawn : le bouclier de respawn est lui aussi dans la boucle.
    expect(stats.deaths).toBeGreaterThan(0);
    expect(stats.respawns).toBeGreaterThan(0);
  });

  it('des graines différentes donnent des parties différentes', () => {
    expect(runDuel(7).json).not.toBe(runDuel(8).json);
  });
});
