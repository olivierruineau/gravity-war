import { describe, expect, it } from 'vitest';
import {
  BULLET_SPEED,
  FIXED_DT,
  MISSILE_COOLDOWN,
  MISSILE_DAMAGE,
  MISSILE_LIFETIME,
  MISSILE_SPEED,
  SHIP_SIZE,
} from '../../src/config.js';
import { EVT } from '../../src/core/events.js';
import { updateFactions } from '../../src/core/faction.js';
import { createProjectiles, KIND, spawnProjectile } from '../../src/core/projectile.js';
import { updateWeapons } from '../../src/core/weapons.js';
import { createWorld } from '../../src/core/world.js';

// Faction 0 possède une planète avec usine (built: 2 = tourelle + usine de missiles) : hasMissiles vrai.
// Faction 1 n'a aucune planète : hasMissiles faux. Planète loin des vaisseaux (la gravité n'agit pas ici de toute façon).
function makeWorld({ built = 2, angle = 0 } = {}) {
  return createWorld(
    {
      width: 2000,
      height: 2000,
      planets: [{ x: 1900, y: 1900, radius: 30, owner: 0, built }],
      spawns: [
        { x: 500, y: 500, angle },
        { x: 900, y: 500, angle: Math.PI },
      ],
    },
    1,
    { eventCapacity: 16 },
  );
}

const activeProjectiles = (world) => world.projectiles.filter((p) => p.active);
const eventsOf = (world, type) =>
  world.events.items.slice(0, world.events.count).filter((e) => e.type === type);

function fireMissile(world, shipIndex = 0) {
  world.ships[shipIndex].intent.missile = true;
  updateWeapons(world, shipIndex, FIXED_DT);
}

describe('missile : tir bloqué', () => {
  it('bloqué si la faction n’a pas de missiles (aucune usine) : rien ne change', () => {
    const world = makeWorld({ built: 1 }); // tourelle seulement
    expect(world.factions[0].hasMissiles).toBe(false);
    const ship = world.ships[0];
    fireMissile(world);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
    expect(ship.missiles).toBe(1);
    expect(ship.missileCooldown).toBe(0);
  });

  it('bloqué pour une faction sans planète, même si une autre faction a la capacité', () => {
    const world = makeWorld();
    expect(world.factions[0].hasMissiles).toBe(true);
    expect(world.factions[1].hasMissiles).toBe(false);
    fireMissile(world, 1);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.ships[1].missiles).toBe(1);
    expect(world.events.count).toBe(0);
  });

  it('bloqué avec un stock vide', () => {
    const world = makeWorld();
    world.ships[0].missiles = 0;
    fireMissile(world);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(0); // jamais négatif
    expect(world.ships[0].missileCooldown).toBe(0);
    expect(world.events.count).toBe(0);
  });

  it('bloqué pendant le cooldown, et le cooldown décroît de dt à chaque appel', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missileCooldown = 1.5 * FIXED_DT;
    fireMissile(world);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(ship.missiles).toBe(1);
    // 1,5·dt − dt = 0,5·dt (arrondi flottant ~1e-18).
    expect(ship.missileCooldown).toBeCloseTo(0.5 * FIXED_DT, 12);
  });

  it('autorisé dès que le cooldown tombe à 0 (≤ 0) : cooldown = dt exact → tir à cet appel', () => {
    const world = makeWorld();
    world.ships[0].missileCooldown = FIXED_DT;
    fireMissile(world);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('sans intent.missile, aucun missile même avec stock, cooldown nul et capacité', () => {
    const world = makeWorld();
    updateWeapons(world, 0, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.ships[0].missiles).toBe(1);
  });

  it('une capacité perdue bloque à nouveau le tir (usine détruite/capturée)', () => {
    const world = makeWorld();
    expect(world.factions[0].hasMissiles).toBe(true);
    world.planets[0].buildings[1].built = false;
    updateFactions(world); // recalcul des capacités, comme à chaque pas de `step`
    fireMissile(world);
    expect(activeProjectiles(world)).toHaveLength(0);
  });
});

describe('missile : tir autorisé', () => {
  it('consomme 1 missile, arme le cooldown et crée un projectile KIND.MISSILE correctement paramétré', () => {
    const world = makeWorld({ angle: 0 });
    const ship = world.ships[0];
    ship.missiles = 3;
    fireMissile(world);
    expect(ship.missiles).toBe(2);
    // Le cooldown est armé APRÈS le décompte du pas : valeur exacte.
    expect(ship.missileCooldown).toBe(MISSILE_COOLDOWN);
    const live = activeProjectiles(world);
    expect(live).toHaveLength(1);
    const [m] = live;
    expect(m.kind).toBe(KIND.MISSILE);
    expect(m.owner).toBe(0);
    expect(m.damage).toBe(MISSILE_DAMAGE);
    expect(m.life).toBe(MISSILE_LIFETIME);
  });

  it('owner = faction du tireur (vaisseau d’indice 1 d’une faction 1 ayant la capacité)', () => {
    const world = makeWorld();
    world.planets[0].owner = 1;
    updateFactions(world);
    fireMissile(world, 1);
    expect(activeProjectiles(world)[0].owner).toBe(1);
  });

  it('émet MISSILE_LAUNCH (a = vaisseau, b = projectile) à la pointe du nez', () => {
    const world = makeWorld({ angle: 0 });
    fireMissile(world);
    const events = eventsOf(world, EVT.MISSILE_LAUNCH);
    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.a).toBe(0);
    expect(world.projectiles[e.b].active).toBe(true);
    expect(world.projectiles[e.b].kind).toBe(KIND.MISSILE);
    // Position : exactement le point d'apparition (nez sur +x).
    expect(e.x).toBeCloseTo(500 + SHIP_SIZE, 9);
    expect(e.y).toBeCloseTo(500, 9);
    expect(world.projectiles[e.b].pos.x).toBeCloseTo(e.x, 9);
    expect(world.projectiles[e.b].pos.y).toBeCloseTo(e.y, 9);
    // Pas d'événement de tir principal.
    expect(eventsOf(world, EVT.SHOT)).toHaveLength(0);
  });

  it('indice du projectile : premier slot libre, et MISSILE_LAUNCH le désigne', () => {
    const world = makeWorld();
    spawnProjectile(world.projectiles, KIND.BULLET, 1, 0, 0, 0, 0, 1, 1); // slot 0 occupé
    fireMissile(world);
    expect(eventsOf(world, EVT.MISSILE_LAUNCH)[0].b).toBe(1);
    expect(world.projectiles[1].kind).toBe(KIND.MISSILE);
  });

  it('intention maintenue pendant 29 pas (< cooldown) : un seul tir, 4 → 3', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = 4;
    ship.intent.missile = true;
    // Intention maintenue : 1 tir, puis le cooldown (0,5 s = 30 pas) bloque les 29 appels suivants.
    for (let i = 0; i < 29; i++) updateWeapons(world, 0, FIXED_DT);
    expect(ship.missiles).toBe(3);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('intention maintenue : tirs espacés de MISSILE_COOLDOWN (± 1 pas) jusqu’à épuisement du stock', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missiles = 3;
    ship.intent.missile = true;
    const ticks = [];
    for (let i = 0; i < 200; i++) {
      const before = ship.missiles;
      updateWeapons(world, 0, FIXED_DT);
      if (ship.missiles < before) ticks.push(i);
    }
    expect(ticks).toHaveLength(3);
    expect(ticks[0]).toBe(0);
    for (let k = 1; k < ticks.length; k++) {
      // 0,5 s / (1/60 s) = 30 pas, +1 si l'arrondi flottant laisse le cooldown à ~1e-17 > 0.
      const gap = ticks[k] - ticks[k - 1];
      expect(gap).toBeGreaterThanOrEqual(MISSILE_COOLDOWN / FIXED_DT);
      expect(gap).toBeLessThanOrEqual(MISSILE_COOLDOWN / FIXED_DT + 1);
    }
    expect(ship.missiles).toBe(0);
  });
});

describe('missile : vitesse initiale', () => {
  // Le vaisseau a une vitesse de (100, −30), cap variable.
  function launch(angle, vel = { x: 100, y: -30 }) {
    const world = makeWorld({ angle });
    world.ships[0].vel.x = vel.x;
    world.ships[0].vel.y = vel.y;
    fireMissile(world);
    return { world, m: activeProjectiles(world)[0] };
  }

  it('vaisseau immobile : vitesse = MISSILE_SPEED dans l’axe du nez', () => {
    for (const angle of [0, 0.7, Math.PI / 2, Math.PI, -2.1]) {
      const { m } = launch(angle, { x: 0, y: 0 });
      // cos/sin à ~1e-16 près, vitesse ~200 : 9 décimales.
      expect(m.vel.x).toBeCloseTo(MISSILE_SPEED * Math.cos(angle), 9);
      expect(m.vel.y).toBeCloseTo(MISSILE_SPEED * Math.sin(angle), 9);
      expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(MISSILE_SPEED, 9);
    }
  });

  it('vaisseau qui avance : vitesse = MISSILE_SPEED + composante avant, toujours dans l’axe du nez', () => {
    const { m } = launch(0); // nez +x, vel (100, −30) : composante avant = 100
    expect(m.vel.x).toBeCloseTo(MISSILE_SPEED + 100, 9);
    // La composante latérale (−30) n'est PAS héritée : le missile part exactement dans l'axe.
    expect(m.vel.y).toBeCloseTo(0, 9);
  });

  it('en diagonale : MISSILE_SPEED + vel·nez, dirigé selon le nez', () => {
    const angle = -0.6;
    const forward = 100 * Math.cos(angle) + -30 * Math.sin(angle);
    const { m } = launch(angle);
    expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(MISSILE_SPEED + forward, 9);
    expect(Math.atan2(m.vel.y, m.vel.x)).toBeCloseTo(angle, 9);
  });

  it('vaisseau qui recule (vel·nez < 0) : jamais plus lent que MISSILE_SPEED', () => {
    const { m } = launch(Math.PI); // nez −x, vel (100, −30) : vel·nez = −100
    expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(MISSILE_SPEED, 9);
    expect(m.vel.x).toBeCloseTo(-MISSILE_SPEED, 9);
    // vy = 200·sin(π) ≈ 2,4e-14 : aucun héritage des −30 du vaisseau.
    expect(m.vel.y).toBeCloseTo(0, 9);
  });

  it('même une grande vitesse de recul ne ralentit pas le missile (borne basse stricte)', () => {
    const { m } = launch(0, { x: -1000, y: 0 });
    expect(m.vel.x).toBe(MISSILE_SPEED);
  });

  it('vitesse purement latérale (nez ⟂ vitesse) : rien n’est hérité', () => {
    const { m } = launch(Math.PI / 2, { x: 100, y: 0 }); // nez +y, vitesse +x
    // vel·nez = 100·cos(π/2) ≈ 6e-15 : héritage négligeable (< 1e-9 de la vitesse).
    expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(MISSILE_SPEED, 9);
    expect(m.vel.x).toBeCloseTo(0, 9);
    expect(m.vel.y).toBeCloseTo(MISSILE_SPEED, 9);
  });

  it('le missile est plus rapide que MISSILE_SPEED d’exactement la vitesse avant du vaisseau', () => {
    const slow = launch(0, { x: 0, y: 0 }).m;
    const fast = launch(0, { x: 75, y: 0 }).m;
    expect(Math.hypot(fast.vel.x, fast.vel.y) - Math.hypot(slow.vel.x, slow.vel.y)).toBeCloseTo(
      75,
      9,
    );
  });
});

describe('missile : pool plein', () => {
  it('pool plein : stock et cooldown intacts, aucun événement, aucune exception', () => {
    const world = makeWorld();
    world.projectiles = createProjectiles(1);
    spawnProjectile(world.projectiles, KIND.BULLET, 1, 0, 0, 0, 0, 10, 1);
    const ship = world.ships[0];
    ship.missiles = 3;
    expect(() => fireMissile(world)).not.toThrow();
    expect(ship.missiles).toBe(3);
    expect(ship.missileCooldown).toBe(0);
    expect(world.events.count).toBe(0);
    expect(world.projectiles).toHaveLength(1);
  });

  it('pool de capacité 0 : même comportement', () => {
    const world = makeWorld();
    world.projectiles = createProjectiles(0);
    fireMissile(world);
    expect(world.ships[0].missiles).toBe(1);
    expect(world.ships[0].missileCooldown).toBe(0);
    expect(world.events.count).toBe(0);
  });

  it('dès qu’un slot se libère, le tir réussi (le refus n’a pas consommé de cooldown)', () => {
    const world = makeWorld();
    world.projectiles = createProjectiles(1);
    spawnProjectile(world.projectiles, KIND.BULLET, 1, 0, 0, 0, 0, 10, 1);
    fireMissile(world);
    expect(world.ships[0].missiles).toBe(1);
    world.projectiles[0].active = false;
    updateWeapons(world, 0, FIXED_DT); // intent.missile toujours vrai
    expect(world.ships[0].missiles).toBe(0);
    expect(world.projectiles[0].kind).toBe(KIND.MISSILE);
  });
});

describe('missile : cohabitation avec le tir principal', () => {
  it('fire seul : une balle, stock de missiles et cooldown missile intacts', () => {
    const world = makeWorld({ angle: 0 });
    const ship = world.ships[0];
    ship.intent.fire = true;
    updateWeapons(world, 0, FIXED_DT);
    const [p] = activeProjectiles(world);
    expect(p.kind).toBe(KIND.BULLET);
    expect(p.vel.x).toBeCloseTo(BULLET_SPEED, 9);
    expect(ship.missiles).toBe(1);
    expect(ship.missileCooldown).toBe(0);
    expect(eventsOf(world, EVT.MISSILE_LAUNCH)).toHaveLength(0);
    expect(eventsOf(world, EVT.SHOT)).toHaveLength(1);
  });

  it('missile seul : aucune balle, le cooldown de tir principal reste à 0', () => {
    const world = makeWorld();
    fireMissile(world);
    expect(world.ships[0].fireCooldown).toBe(0);
    expect(eventsOf(world, EVT.SHOT)).toHaveLength(0);
    expect(activeProjectiles(world).every((p) => p.kind === KIND.MISSILE)).toBe(true);
  });

  it('fire + missile au même pas : une balle ET un missile, cooldowns indépendants', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.intent.fire = true;
    ship.intent.missile = true;
    updateWeapons(world, 0, FIXED_DT);
    const kinds = activeProjectiles(world)
      .map((p) => p.kind)
      .sort();
    expect(kinds).toEqual([KIND.BULLET, KIND.MISSILE]);
    expect(ship.fireCooldown).toBeGreaterThan(0);
    expect(ship.missileCooldown).toBe(MISSILE_COOLDOWN);
    expect(ship.missiles).toBe(0);
  });

  it('le cooldown du missile ne bloque pas la cadence du tir principal', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.missileCooldown = 10;
    ship.intent.fire = true;
    updateWeapons(world, 0, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
    expect(activeProjectiles(world)[0].kind).toBe(KIND.BULLET);
  });

  it('pool d’un seul slot avec fire + missile : la balle (tirée d’abord) prend le slot, le stock est préservé', () => {
    const world = makeWorld();
    world.projectiles = createProjectiles(1);
    const ship = world.ships[0];
    ship.intent.fire = true;
    ship.intent.missile = true;
    updateWeapons(world, 0, FIXED_DT);
    expect(world.projectiles[0].kind).toBe(KIND.BULLET);
    expect(ship.missiles).toBe(1);
    expect(ship.missileCooldown).toBe(0);
  });
});
