import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  RESPAWN_DELAY,
  SHIELD_MAX,
  SHIELD_RECHARGE_DELAY,
  SHIELD_RECHARGE_RATE,
  SHIP_MAX_HP,
} from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { damageShip, updateRespawn } from '../../src/core/lifecycle.js';
import { updateShield } from '../../src/core/shield.js';
import { createWorld, step } from '../../src/core/world.js';

// Bouclier passif (ADR 0005 §6 et §7). Les sommes sont exactes sur des dt binaires (0,5 / 0,25) ; sur
// FIXED_DT = 1/60 l'accumulation flottante laisse un résidu ~1e-13, donc `toBeCloseTo(.., 9)` suffit.
const PRECISION = 9;
const HIT_X = 123;
const HIT_Y = 456;

// Planète de la faction 0 loin des vaisseaux (hors portée de gravité). `built: 3` = tourelle, usine de
// missiles et générateur de bouclier construits (hasShield vrai) ; `built: 2` = pas de générateur.
const FAR_PLANET = { x: 20000, y: 20000, radius: 60, owner: 0 };

function makeWorld(built = 3, planets) {
  return createWorld(
    {
      width: 40000,
      height: 40000,
      planets: planets ?? [{ ...FAR_PLANET, built }],
      spawns: [
        { x: 1000, y: 1000 },
        { x: 3000, y: 1000 },
      ],
    },
    1,
    { eventCapacity: 16 },
  );
}

function eventsOf(world, type) {
  return world.events.items.slice(0, world.events.count).filter((e) => e.type === type);
}

describe('damageShip avec bouclier : absorption', () => {
  it('le bouclier absorbe d’abord : 20 dégâts sur 50 de bouclier laissent 30 de bouclier et les PV intacts', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    const lethal = damageShip(world, 0, 20, HIT_X, HIT_Y);
    expect(lethal).toBe(false);
    expect(ship.shield).toBe(30);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('le débordement passe aux PV : 70 dégâts sur 50 de bouclier → bouclier 0, PV −20', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    expect(damageShip(world, 0, 70, HIT_X, HIT_Y)).toBe(false);
    expect(ship.shield).toBe(0);
    expect(ship.hp).toBe(SHIP_MAX_HP - 20);
  });

  it('un bouclier qui absorbe tout rend le coup non mortel même si les dégâts dépassent les PV restants', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.hp = 10;
    ship.shield = SHIELD_MAX;
    const lethal = damageShip(world, 0, 40, HIT_X, HIT_Y); // 40 ≥ hp = 10
    expect(lethal).toBe(false);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBe(10);
    expect(ship.shield).toBe(10);
  });

  it('absorption exacte : dégâts = bouclier → bouclier 0, PV intacts, pas de mort', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.hp = 1;
    ship.shield = SHIELD_MAX;
    expect(damageShip(world, 0, SHIELD_MAX, HIT_X, HIT_Y)).toBe(false);
    expect(ship.shield).toBe(0);
    expect(ship.hp).toBe(1);
    expect(ship.alive).toBe(true);
  });

  it('sans bouclier (shield 0) : les PV encaissent la totalité, comme avant la phase 4.9', () => {
    const world = makeWorld();
    damageShip(world, 0, 30, HIT_X, HIT_Y);
    expect(world.ships[0].shield).toBe(0);
    expect(world.ships[0].hp).toBe(SHIP_MAX_HP - 30);
  });

  it('les dégâts cumulés conservent shield + hp : somme initiale − somme des dégâts tant qu’il survit', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    let total = 0;
    for (const dmg of [12, 12, 12, 12, 12, 12, 12]) {
      damageShip(world, 0, dmg, HIT_X, HIT_Y);
      total += dmg;
      expect(ship.shield + ship.hp).toBe(SHIELD_MAX + SHIP_MAX_HP - total);
    }
    expect(ship.shield).toBe(0);
    expect(ship.hp).toBe(SHIELD_MAX + SHIP_MAX_HP - 84);
  });
});

describe('damageShip avec bouclier : délai de recharge', () => {
  it('tout dégât > 0 arme shieldDelay à SHIELD_RECHARGE_DELAY (absorbé en totalité)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    damageShip(world, 0, 5, HIT_X, HIT_Y);
    expect(ship.shieldDelay).toBe(SHIELD_RECHARGE_DELAY);
  });

  it('idem sans bouclier (le délai est armé même si les PV encaissent tout)', () => {
    const world = makeWorld();
    damageShip(world, 0, 5, HIT_X, HIT_Y);
    expect(world.ships[0].shieldDelay).toBe(SHIELD_RECHARGE_DELAY);
  });

  it('un nouveau dégât remet le délai à sa valeur pleine, même s’il avait presque expiré', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = 20;
    ship.shieldDelay = 0.1;
    damageShip(world, 0, 1, HIT_X, HIT_Y);
    expect(ship.shieldDelay).toBe(SHIELD_RECHARGE_DELAY);
  });

  it('dégâts 0 : ni absorption ni redémarrage du délai', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = 30;
    ship.shieldDelay = 1.5;
    const lethal = damageShip(world, 0, 0, HIT_X, HIT_Y);
    expect(lethal).toBe(false);
    expect(ship.shield).toBe(30);
    expect(ship.shieldDelay).toBe(1.5);
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('dégâts 0 avec délai déjà expiré : le délai reste à 0 (la recharge n’est pas retardée)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = 30;
    ship.shieldDelay = 0;
    damageShip(world, 0, 0, HIT_X, HIT_Y);
    expect(ship.shieldDelay).toBe(0);
  });

  it('un vaisseau déjà mort ne reçoit rien : ni bouclier absorbé, ni délai modifié', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    damageShip(world, 0, 1000, HIT_X, HIT_Y);
    ship.shield = 25;
    ship.shieldDelay = 2;
    clearEvents(world.events);
    expect(damageShip(world, 0, 10, HIT_X, HIT_Y)).toBe(false);
    expect(ship.shield).toBe(25);
    expect(ship.shieldDelay).toBe(2);
    expect(world.events.count).toBe(0);
  });
});

describe('damageShip avec bouclier : mort', () => {
  it('meurt malgré le bouclier si le débordement atteint les PV (150 = 50 de bouclier + 100 PV)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    const lethal = damageShip(world, 0, SHIELD_MAX + SHIP_MAX_HP, HIT_X, HIT_Y);
    expect(lethal).toBe(true);
    expect(ship.alive).toBe(false);
    expect(ship.hp).toBe(0);
    expect(ship.shield).toBe(0);
    expect(ship.respawnTimer).toBe(RESPAWN_DELAY);
  });

  it('juste sous le seuil, il survit avec le reliquat de PV (débordement 99,9 sur 100 PV)', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    const lethal = damageShip(world, 0, SHIELD_MAX + SHIP_MAX_HP - 0.1, HIT_X, HIT_Y);
    expect(lethal).toBe(false);
    expect(ship.alive).toBe(true);
    // Soustractions flottantes (150 − 0,1 − 50 → 99,9) : erreur ≪ 1e-9.
    expect(ship.hp).toBeCloseTo(0.1, PRECISION);
  });

  it('un bouclier partiel ne suffit pas : bouclier 10 + 100 PV, 110 dégâts → mort', () => {
    const world = makeWorld();
    const ship = world.ships[0];
    ship.shield = 10;
    expect(damageShip(world, 0, 110, HIT_X, HIT_Y)).toBe(true);
    expect(ship.alive).toBe(false);
  });

  it('EXPLOSION seulement à la mort : aucun événement sur un coup absorbé ni sur un coup avec débordement non mortel', () => {
    const world = makeWorld();
    world.ships[0].shield = SHIELD_MAX;
    damageShip(world, 0, 20, HIT_X, HIT_Y); // absorbé
    damageShip(world, 0, 60, HIT_X, HIT_Y); // 30 absorbés + 30 aux PV
    expect(eventsOf(world, EVT.EXPLOSION)).toHaveLength(0);
    expect(world.events.count).toBe(0);
  });

  it('le coup mortel émet exactement un EXPLOSION au point donné, a = index du vaisseau', () => {
    const world = makeWorld();
    world.ships[1].shield = SHIELD_MAX;
    damageShip(world, 1, SHIELD_MAX + SHIP_MAX_HP, HIT_X, HIT_Y);
    const explosions = eventsOf(world, EVT.EXPLOSION);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]).toMatchObject({ x: HIT_X, y: HIT_Y, a: 1 });
  });
});

describe('updateShield : recharge', () => {
  it('sans générateur (hasShield faux) : aucune recharge, délai expiré ou non', () => {
    const world = makeWorld(2);
    expect(world.factions[0].hasShield).toBe(false);
    const ship = world.ships[0];
    ship.shield = 10;
    ship.shieldDelay = 0;
    for (let i = 0; i < 100; i++) updateShield(world, 0, 1);
    expect(ship.shield).toBe(10);
  });

  it('sans générateur, le bouclier d’un vaisseau de faction sans planète ne bouge pas non plus', () => {
    const world = makeWorld(3);
    expect(world.factions[1].hasShield).toBe(false); // la faction 1 n'a aucune planète
    world.ships[1].shield = 0;
    for (let i = 0; i < 100; i++) updateShield(world, 1, 1);
    expect(world.ships[1].shield).toBe(0);
  });

  it('avec générateur : le délai décroît de dt par appel et le bouclier ne bouge pas pendant ce temps', () => {
    const world = makeWorld(3);
    expect(world.factions[0].hasShield).toBe(true);
    const ship = world.ships[0];
    ship.shield = 0;
    ship.shieldDelay = SHIELD_RECHARGE_DELAY;
    // dt = 0,5 : 8 appels ramènent le délai à 0 exactement (puissances de 2), sans recharge.
    for (let i = 1; i <= 8; i++) {
      updateShield(world, 0, 0.5);
      expect(ship.shieldDelay).toBe(SHIELD_RECHARGE_DELAY - 0.5 * i);
      expect(ship.shield).toBe(0);
    }
  });

  it('une fois le délai écoulé : shield += RATE·dt à chaque appel', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 0;
    ship.shieldDelay = 0;
    updateShield(world, 0, 0.5);
    expect(ship.shield).toBe(SHIELD_RECHARGE_RATE * 0.5);
    updateShield(world, 0, 0.25);
    expect(ship.shield).toBe(SHIELD_RECHARGE_RATE * 0.75);
  });

  it('l’appel qui épuise le délai ne recharge pas encore ; le suivant oui (pas de recharge sur un dt « partagé »)', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 0;
    ship.shieldDelay = 0.5;
    updateShield(world, 0, 0.5);
    expect(ship.shieldDelay).toBe(0);
    expect(ship.shield).toBe(0);
    updateShield(world, 0, 0.5);
    expect(ship.shield).toBe(5);
  });

  it('une seconde de recharge au pas fixe donne +SHIELD_RECHARGE_RATE', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 0;
    for (let i = 0; i < 60; i++) updateShield(world, 0, FIXED_DT);
    expect(ship.shield).toBeCloseTo(SHIELD_RECHARGE_RATE, PRECISION);
  });

  it('le plafond SHIELD_MAX n’est jamais dépassé, même avec un gros dt', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 48;
    ship.shieldDelay = 0;
    updateShield(world, 0, 1); // +10 → 58 sans plafond
    expect(ship.shield).toBe(SHIELD_MAX);
    updateShield(world, 0, 100);
    expect(ship.shield).toBe(SHIELD_MAX);
  });

  it('un bouclier plein reste plein sur 1000 pas (pas de dérive au-dessus du plafond)', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    for (let i = 0; i < 1000; i++) {
      updateShield(world, 0, FIXED_DT);
      expect(ship.shield).toBeLessThanOrEqual(SHIELD_MAX);
    }
    expect(ship.shield).toBe(SHIELD_MAX);
  });

  it('un nouveau dégât remet le délai : la recharge en cours s’arrête puis reprend après SHIELD_RECHARGE_DELAY', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 10;
    ship.shieldDelay = 0;
    updateShield(world, 0, 1);
    expect(ship.shield).toBe(20);

    damageShip(world, 0, 5, HIT_X, HIT_Y);
    expect(ship.shield).toBe(15);
    for (let i = 0; i < SHIELD_RECHARGE_DELAY; i++) {
      updateShield(world, 0, 1); // 4 appels d'une seconde : le délai s'épuise, aucune recharge
      expect(ship.shield).toBe(15);
    }
    expect(ship.shieldDelay).toBe(0);
    updateShield(world, 0, 1);
    expect(ship.shield).toBe(25);
  });
});

describe('updateShield dans step : vaisseau mort', () => {
  it('un vaisseau mort n’est pas rechargé et son délai ne décroît pas', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    damageShip(world, 0, 1000, HIT_X, HIT_Y);
    // Valeurs forcées : un vaisseau mort a shield 0 par construction, on vérifie qu'`step` n'y touche pas.
    ship.shield = 5;
    ship.shieldDelay = 0;
    const steps = Math.round(RESPAWN_DELAY / FIXED_DT / 2); // reste mort : moitié du délai de respawn
    for (let i = 0; i < steps; i++) step(world, FIXED_DT);
    expect(ship.alive).toBe(false);
    expect(ship.shield).toBe(5);

    ship.shieldDelay = 2;
    for (let i = 0; i < 10; i++) step(world, FIXED_DT);
    expect(ship.shieldDelay).toBe(2);
  });

  it('un vaisseau vivant est bien rechargé par step quand le délai est écoulé (contrôle du test précédent)', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = 5;
    ship.shieldDelay = 0;
    for (let i = 0; i < 60; i++) step(world, FIXED_DT);
    expect(ship.shield).toBeCloseTo(5 + SHIELD_RECHARGE_RATE, PRECISION);
  });
});

describe('updateRespawn : bouclier au respawn', () => {
  it('shield = SHIELD_MAX si la faction possède un générateur, avec shieldDelay à 0 et PV pleins', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    ship.shield = SHIELD_MAX;
    damageShip(world, 0, SHIELD_MAX + SHIP_MAX_HP, HIT_X, HIT_Y);
    expect(ship.shieldDelay).toBe(SHIELD_RECHARGE_DELAY); // le coup mortel arme le délai...
    updateRespawn(world, 0, RESPAWN_DELAY);
    expect(ship.alive).toBe(true);
    expect(ship.shield).toBe(SHIELD_MAX);
    expect(ship.shieldDelay).toBe(0); // ...mais le respawn le remet à zéro
    expect(ship.hp).toBe(SHIP_MAX_HP);
  });

  it('shield = 0 si la faction n’a pas de générateur', () => {
    const world = makeWorld(2);
    const ship = world.ships[0];
    damageShip(world, 0, 1000, HIT_X, HIT_Y);
    ship.shield = 30; // valeur parasite : le respawn doit la remettre à zéro
    updateRespawn(world, 0, RESPAWN_DELAY);
    expect(ship.alive).toBe(true);
    expect(ship.shield).toBe(0);
    expect(ship.shieldDelay).toBe(0);
  });

  it('pas de bouclier tant que le délai de respawn n’est pas écoulé', () => {
    const world = makeWorld(3);
    const ship = world.ships[0];
    damageShip(world, 0, 1000, HIT_X, HIT_Y);
    updateRespawn(world, 0, RESPAWN_DELAY / 2);
    expect(ship.alive).toBe(false);
    expect(ship.shield).toBe(0);
  });

  it('le bouclier se débloque au niveau de la faction : réapparition sur une planète sans générateur, bouclier plein', () => {
    // Planète B (sans bâtiment) proche du lieu de mort ; le générateur est sur la planète A, lointaine.
    const planets = [
      { ...FAR_PLANET, built: 3 },
      { x: 1000, y: 1500, radius: 60, owner: 0 },
    ];
    const world = makeWorld(3, planets);
    const ship = world.ships[0];
    damageShip(world, 0, 1000, 1000, 1000);
    updateRespawn(world, 0, RESPAWN_DELAY);
    expect(ship.landedOn).toBe(1); // B est la plus proche de (1000, 1000)
    expect(ship.shield).toBe(SHIELD_MAX);
  });

  it('un respawn n’affecte pas le bouclier de l’autre vaisseau', () => {
    const world = makeWorld(3);
    world.ships[1].shield = 17;
    damageShip(world, 0, 1000, HIT_X, HIT_Y);
    updateRespawn(world, 0, RESPAWN_DELAY);
    expect(world.ships[1].shield).toBe(17);
  });
});
