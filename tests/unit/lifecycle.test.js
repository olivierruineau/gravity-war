import { describe, expect, it } from 'vitest';
import { RESPAWN_DELAY, SHIP_COLLISION_RADIUS, SHIP_MAX_HP } from '../../src/config.js';
import { EVT, clearEvents } from '../../src/core/events.js';
import { damageShip, updateRespawn } from '../../src/core/lifecycle.js';
import { NEUTRAL } from '../../src/core/planet.js';
import { createWorld } from '../../src/core/world.js';

const PRECISION = 9;
const DEATH_X = 123;
const DEATH_Y = 456;

/** Monde avec deux vaisseaux (factions 0 et 1) et les planètes données. */
function worldWith(planets) {
  return createWorld(
    {
      width: 2400,
      height: 1350,
      planets,
      spawns: [
        { x: 500, y: 500 },
        { x: 1500, y: 900 },
      ],
    },
    1,
    { eventCapacity: 16 },
  );
}

/** Une planète possédée par la faction 0 en (300, 300), rayon 60. */
function ownedWorld() {
  return worldWith([{ x: 300, y: 300, radius: 60, owner: 0 }]);
}

function eventsOf(world, type) {
  return world.events.items.slice(0, world.events.count).filter((e) => e.type === type);
}

/** Tue le vaisseau `i` d'un coup mortel, puis vide la file pour isoler les assertions suivantes. */
function kill(world, i = 0) {
  damageShip(world, i, SHIP_MAX_HP, DEATH_X, DEATH_Y);
  clearEvents(world.events);
}

describe('damageShip : dégâts non mortels', () => {
  it('retire les PV demandés', () => {
    const world = ownedWorld();
    damageShip(world, 0, 30, DEATH_X, DEATH_Y);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP - 30);
  });

  it('le vaisseau reste vivant', () => {
    const world = ownedWorld();
    damageShip(world, 0, 30, DEATH_X, DEATH_Y);
    expect(world.ships[0].alive).toBe(true);
  });

  it('retourne false', () => {
    const world = ownedWorld();
    expect(damageShip(world, 0, 30, DEATH_X, DEATH_Y)).toBe(false);
  });

  it('n’émet aucun événement', () => {
    const world = ownedWorld();
    damageShip(world, 0, 30, DEATH_X, DEATH_Y);
    expect(world.events.count).toBe(0);
  });

  it('des dégâts cumulés s’additionnent sans mort tant que les PV restent positifs', () => {
    const world = ownedWorld();
    damageShip(world, 0, 40, DEATH_X, DEATH_Y);
    damageShip(world, 0, 40, DEATH_X, DEATH_Y);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP - 80);
    expect(world.ships[0].alive).toBe(true);
  });
});

describe('damageShip : dégâts mortels', () => {
  function lethal(amount = SHIP_MAX_HP + 10) {
    const world = ownedWorld();
    const ship = world.ships[0];
    // État « en vol » avant le coup : chacun de ces champs doit être remis à zéro par la mort.
    ship.vel.x = 50;
    ship.vel.y = -20;
    ship.landedOn = 0;
    ship.intent.thrust = true;
    ship.intent.fire = true;
    ship.intent.missile = true;
    ship.intent.rotate = 1;
    const returned = damageShip(world, 0, amount, DEATH_X, DEATH_Y);
    return { world, ship, returned };
  }

  it('PV = 0, jamais négatif', () => {
    expect(lethal().ship.hp).toBe(0);
  });

  it('alive = false', () => {
    expect(lethal().ship.alive).toBe(false);
  });

  it('landedOn = -1 (détaché du sol)', () => {
    expect(lethal().ship.landedOn).toBe(-1);
  });

  it('vitesse remise à (0, 0)', () => {
    expect(lethal().ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('intention remise à zéro', () => {
    expect(lethal().ship.intent).toEqual({ rotate: 0, thrust: false, fire: false, missile: false });
  });

  it('respawnTimer = RESPAWN_DELAY', () => {
    expect(lethal().ship.respawnTimer).toBe(RESPAWN_DELAY);
  });

  it('retourne true', () => {
    expect(lethal().returned).toBe(true);
  });

  it('émet exactement un EXPLOSION en (x, y)', () => {
    const { world } = lethal();
    const explosions = eventsOf(world, EVT.EXPLOSION);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]).toMatchObject({ x: DEATH_X, y: DEATH_Y });
  });

  it('EXPLOSION.a = index du vaisseau tué', () => {
    const world = worldWith([{ x: 300, y: 300, radius: 60, owner: 0 }]);
    damageShip(world, 1, SHIP_MAX_HP, DEATH_X, DEATH_Y);
    expect(eventsOf(world, EVT.EXPLOSION)[0].a).toBe(1);
  });

  it('dégâts exactement égaux aux PV → mort', () => {
    const { ship, returned } = lethal(SHIP_MAX_HP);
    expect(ship.alive).toBe(false);
    expect(returned).toBe(true);
    expect(ship.hp).toBe(0);
  });

  it('dégâts supérieurs aux PV → PV = 0 et non négatifs', () => {
    expect(lethal(SHIP_MAX_HP * 5).ship.hp).toBe(0);
  });
});

describe('damageShip : vaisseau déjà mort', () => {
  it('ne fait rien : retourne false', () => {
    const world = ownedWorld();
    kill(world);
    expect(damageShip(world, 0, 10, DEATH_X, DEATH_Y)).toBe(false);
  });

  it('ne modifie ni les PV ni le décompte de respawn', () => {
    const world = ownedWorld();
    kill(world);
    world.ships[0].respawnTimer = 1.5;
    damageShip(world, 0, 10, DEATH_X, DEATH_Y);
    expect(world.ships[0].hp).toBe(0);
    expect(world.ships[0].respawnTimer).toBe(1.5);
  });

  it('n’émet pas de deuxième EXPLOSION', () => {
    const world = ownedWorld();
    kill(world);
    damageShip(world, 0, SHIP_MAX_HP, DEATH_X, DEATH_Y);
    expect(world.events.count).toBe(0);
  });
});

describe('damageShip : dégâts nuls', () => {
  it('ne change ni les PV ni l’état du vaisseau', () => {
    const world = ownedWorld();
    damageShip(world, 0, 0, DEATH_X, DEATH_Y);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP);
    expect(world.ships[0].alive).toBe(true);
  });

  it('retourne false et n’émet aucun événement', () => {
    const world = ownedWorld();
    expect(damageShip(world, 0, 0, DEATH_X, DEATH_Y)).toBe(false);
    expect(world.events.count).toBe(0);
  });
});

describe('updateRespawn : décompte', () => {
  it('le respawnTimer décroît de dt', () => {
    const world = ownedWorld();
    kill(world);
    updateRespawn(world, 0, 0.5);
    expect(world.ships[0].respawnTimer).toBeCloseTo(RESPAWN_DELAY - 0.5, PRECISION);
  });

  it('avant échéance : le vaisseau reste mort', () => {
    const world = ownedWorld();
    kill(world);
    updateRespawn(world, 0, RESPAWN_DELAY - 0.1);
    expect(world.ships[0].alive).toBe(false);
  });

  it('avant échéance : aucun événement RESPAWN', () => {
    const world = ownedWorld();
    kill(world);
    updateRespawn(world, 0, RESPAWN_DELAY - 0.1);
    expect(eventsOf(world, EVT.RESPAWN)).toHaveLength(0);
  });
});

describe('updateRespawn : réapparition à échéance', () => {
  function respawned() {
    const world = ownedWorld();
    const ship = world.ships[0];
    kill(world);
    // Intention résiduelle : doit être effacée à la réapparition.
    ship.intent.rotate = -1;
    ship.intent.thrust = true;
    updateRespawn(world, 0, RESPAWN_DELAY);
    return { world, ship };
  }

  it('le vaisseau est vivant', () => {
    expect(respawned().ship.alive).toBe(true);
  });

  it('PV au maximum', () => {
    expect(respawned().ship.hp).toBe(SHIP_MAX_HP);
  });

  it('posé sur la planète : landedOn = index de la planète', () => {
    expect(respawned().ship.landedOn).toBe(0);
  });

  it('positionné au-dessus de la planète, à r + SHIP_COLLISION_RADIUS du centre', () => {
    const { ship } = respawned();
    expect(ship.pos.x).toBeCloseTo(300, PRECISION);
    expect(ship.pos.y).toBeCloseTo(300 - (60 + SHIP_COLLISION_RADIUS), PRECISION);
  });

  it('vitesse nulle', () => {
    expect(respawned().ship.vel).toEqual({ x: 0, y: 0 });
  });

  it('nez vers le haut (−π/2)', () => {
    expect(respawned().ship.angle).toBe(-Math.PI / 2);
  });

  it('intention remise à zéro', () => {
    expect(respawned().ship.intent).toEqual({
      rotate: 0,
      thrust: false,
      fire: false,
      missile: false,
    });
  });

  it('respawnTimer remis à zéro', () => {
    expect(respawned().ship.respawnTimer).toBe(0);
  });

  it('émet un événement RESPAWN avec a = vaisseau et b = planète', () => {
    const events = eventsOf(respawned().world, EVT.RESPAWN);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ a: 0, b: 0 });
  });

  it('n’émet aucun LANDED', () => {
    expect(eventsOf(respawned().world, EVT.LANDED)).toHaveLength(0);
  });
});

describe('updateRespawn : choix de la planète', () => {
  it('choisit la planète possédée la plus proche du lieu de mort, pas la plus proche tout court', () => {
    // Lieu de mort (500, 500). La planète 0 (ennemie) est la plus proche ; la planète 1 est
    // possédée et plus proche que la planète 2, elle aussi possédée.
    const world = worldWith([
      { x: 520, y: 500, radius: 10, owner: 1 },
      { x: 700, y: 500, radius: 10, owner: 0 },
      { x: 0, y: 500, radius: 10, owner: 0 },
    ]);
    kill(world);
    updateRespawn(world, 0, RESPAWN_DELAY);
    expect(world.ships[0].landedOn).toBe(1);
  });
});

describe('updateRespawn : sans planète possédée par la faction', () => {
  function eliminatedWorld() {
    const world = worldWith([
      { x: 300, y: 300, radius: 60, owner: 1 },
      { x: 900, y: 300, radius: 60, owner: NEUTRAL },
    ]);
    kill(world);
    updateRespawn(world, 0, RESPAWN_DELAY);
    return world;
  }

  it('reste mort', () => {
    expect(eliminatedWorld().ships[0].alive).toBe(false);
  });

  it('respawnTimer ≤ 0', () => {
    expect(eliminatedWorld().ships[0].respawnTimer).toBeLessThanOrEqual(0);
  });

  it('n’émet aucun événement', () => {
    expect(eliminatedWorld().events.count).toBe(0);
  });

  it('reste à réessayer sans planète : toujours mort après plusieurs pas', () => {
    const world = eliminatedWorld();
    for (let k = 0; k < 10; k++) updateRespawn(world, 0, 1);
    expect(world.ships[0].alive).toBe(false);
  });
});
