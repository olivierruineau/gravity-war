import { describe, expect, it } from 'vitest';
import { BULLET_DAMAGE, MISSILE_DAMAGE } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { damageBuilding } from '../../src/core/building.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { createWorld } from '../../src/core/world.js';

// Slots du catalogue (ADR 0005 §3, ADR 0007 §1) : 0 tourelle, 1 usine, 2 générateur, 3 tourelle lourde.
// Ordre de ciblage (ADR 0007 §2) : tourelle de base, tourelle lourde, PUIS usine, générateur.
const TURRET = 0;
const FACTORY = 1;
const GENERATOR = 2;
const HEAVY = 3;
const TARGET_ORDER = [TURRET, HEAVY, FACTORY, GENERATOR];

// Les dégâts sont des entiers et les PV aussi : toutes les comparaisons de PV sont exactes (toBe), sans tolérance.

/** Planète(s) réelle(s) via `createWorld` : `damageBuilding` ne lit que `planets` et `events`. */
function makeWorld({ owner = 0, built = 4 } = {}) {
  return createWorld(
    {
      width: 2000,
      height: 2000,
      planets: [
        { x: 500, y: 500, radius: 40, owner, built },
        { x: 1200, y: 1200, radius: 40, owner: 0, built: 4 },
      ],
    },
    1,
    { eventCapacity: 64 },
  );
}

function slotsOf(world, planet = 0) {
  return world.planets[planet].buildings;
}

function hpOf(world, planet = 0) {
  return slotsOf(world, planet).map((s) => s.hp);
}

function destroyedEvents(world) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === EVT.BUILDING_DESTROYED)
      found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Détruit d'un coup (dégâts énormes) les slots donnés, dans l'ordre où `damageBuilding` les choisit. */
function destroyNext(world, count, planet = 0) {
  for (let i = 0; i < count; i++) damageBuilding(world, planet, 1e6, 0, 0);
}

/** Ne laisse construits que les slots listés (PV pleins) : état de départ ciblé pour un test. */
function onlyBuilt(world, slots, planet = 0) {
  slotsOf(world, planet).forEach((slot, s) => {
    slot.built = slots.includes(s);
    slot.hp = slot.built ? BUILDINGS[s].hp : 0;
    slot.cooldown = 0;
  });
}

describe('damageBuilding : ordre des dégâts', () => {
  it('base, lourde, usine puis générateur : un slot ne perd de PV qu’après la chute des précédents', () => {
    const world = makeWorld();
    const destroyedOrder = [];
    for (const target of TARGET_ORDER) {
      // Avant d'être ciblé, chaque slot suivant est intact ; un coup de 1 PV touche exactement `target`.
      const before = hpOf(world);
      damageBuilding(world, 0, 1, 0, 0);
      const after = hpOf(world);
      for (let s = 0; s < BUILDINGS.length; s++) {
        expect(after[s]).toBe(s === target ? before[s] - 1 : before[s]);
      }
      // Achève le slot visé.
      clearEvents(world.events);
      damageBuilding(world, 0, 1e6, 0, 0);
      destroyedOrder.push(...destroyedEvents(world).map((e) => e.b));
    }
    expect(destroyedOrder).toEqual(TARGET_ORDER);
    for (const slot of slotsOf(world)) expect(slot).toEqual({ built: false, hp: 0, cooldown: 0 });
  });

  it('la tourelle lourde passe avant l’usine et le générateur, bien que son index soit plus grand', () => {
    const world = makeWorld();
    destroyNext(world, 1); // la base tombe
    damageBuilding(world, 0, 10, 0, 0);
    expect(slotsOf(world)[HEAVY].hp).toBe(BUILDINGS[HEAVY].hp - 10);
    expect(slotsOf(world)[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp);
    expect(slotsOf(world)[GENERATOR].hp).toBe(BUILDINGS[GENERATOR].hp);
  });

  it('une tourelle construite protège l’usine : base seule + usine, l’usine reste intacte jusqu’à la chute de la base', () => {
    const world = makeWorld({ built: 2 }); // slots 0 (tourelle) et 1 (usine)
    for (let i = 0; i < 6; i++) damageBuilding(world, 0, BULLET_DAMAGE, 0, 0);
    expect(slotsOf(world)[FACTORY]).toMatchObject({ built: true, hp: BUILDINGS[FACTORY].hp });
    expect(slotsOf(world)[TURRET].hp).toBe(BUILDINGS[TURRET].hp - 6 * BULLET_DAMAGE);
    damageBuilding(world, 0, BULLET_DAMAGE, 0, 0); // 7e balle : la tourelle tombe
    expect(slotsOf(world)[TURRET].built).toBe(false);
    expect(slotsOf(world)[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp);
    damageBuilding(world, 0, BULLET_DAMAGE, 0, 0); // 8e balle : l'usine encaisse enfin
    expect(slotsOf(world)[FACTORY].hp).toBe(BUILDINGS[FACTORY].hp - BULLET_DAMAGE);
  });

  it('seule la lourde protège aussi l’usine (base absente, lourde construite)', () => {
    const world = makeWorld();
    onlyBuilt(world, [FACTORY, GENERATOR, HEAVY]);
    damageBuilding(world, 0, 5, 0, 0);
    expect(hpOf(world)).toEqual([
      0,
      BUILDINGS[FACTORY].hp,
      BUILDINGS[GENERATOR].hp,
      BUILDINGS[HEAVY].hp - 5,
    ]);
  });

  it('usine absente : le générateur passe juste après les tourelles', () => {
    const world = makeWorld();
    onlyBuilt(world, [GENERATOR]);
    damageBuilding(world, 0, 7, 0, 0);
    expect(hpOf(world)).toEqual([0, 0, BUILDINGS[GENERATOR].hp - 7, 0]);
  });
});

describe('damageBuilding : un coup, un slot', () => {
  it('l’excédent est perdu : un énorme coup détruit la base et n’entame ni la lourde ni le reste', () => {
    const world = makeWorld();
    damageBuilding(world, 0, 10 * BUILDINGS[TURRET].hp, 0, 0);
    expect(hpOf(world)).toEqual([
      0,
      BUILDINGS[FACTORY].hp,
      BUILDINGS[GENERATOR].hp,
      BUILDINGS[HEAVY].hp,
    ]);
    expect(destroyedEvents(world)).toHaveLength(1);
  });

  it('un coup de PV + 1 sur la base : exactement 1 événement et la lourde reste pleine', () => {
    const world = makeWorld();
    damageBuilding(world, 0, BUILDINGS[TURRET].hp + 1, 0, 0);
    expect(slotsOf(world)[HEAVY].hp).toBe(BUILDINGS[HEAVY].hp);
    expect(destroyedEvents(world)).toHaveLength(1);
  });

  it('un coup n’affecte qu’une planète : l’autre planète possédée est inchangée', () => {
    const world = makeWorld();
    const other = JSON.stringify(world.planets[1]);
    damageBuilding(world, 0, 1e6, 0, 0);
    expect(JSON.stringify(world.planets[1])).toBe(other);
  });
});

describe('damageBuilding : destruction', () => {
  it.each([TURRET, FACTORY, GENERATOR, HEAVY])(
    'slot %i détruit : built = false, hp = 0, cooldown = 0, buildProgress = 0 (même si le chantier en cours est un autre slot)',
    (slotIndex) => {
      const world = makeWorld();
      const planet = world.planets[0];
      // Détruit d'abord les slots qui passent avant celui visé : le chantier est alors l'un d'eux (ou aucun pour la base).
      destroyNext(world, TARGET_ORDER.indexOf(slotIndex));
      planet.buildings[slotIndex].cooldown = 0.37;
      planet.buildProgress = 12.5; // progression d'un chantier sans rapport avec le slot détruit
      clearEvents(world.events);
      damageBuilding(world, 0, 1e6, 77, 88);
      expect(planet.buildings[slotIndex]).toEqual({ built: false, hp: 0, cooldown: 0 });
      expect(planet.buildProgress).toBe(0);
      expect(world.events.count).toBe(1);
      expect(world.events.items[0]).toMatchObject({
        type: EVT.BUILDING_DESTROYED,
        x: 77,
        y: 88,
        a: 0,
        b: slotIndex,
      });
    },
  );

  it('chantier à un autre slot : détruire l’usine remet à zéro le chantier du slot 0 en cours', () => {
    const world = makeWorld();
    onlyBuilt(world, [FACTORY, GENERATOR]); // le chantier est donc le slot 0
    world.planets[0].buildProgress = 19;
    damageBuilding(world, 0, 1e6, 0, 0);
    expect(slotsOf(world)[FACTORY].built).toBe(false);
    expect(world.planets[0].buildProgress).toBe(0);
  });

  it('un coup qui ne détruit pas laisse le chantier et le cooldown intacts', () => {
    const world = makeWorld();
    world.planets[0].buildProgress = 9;
    slotsOf(world)[TURRET].cooldown = 0.4;
    damageBuilding(world, 0, 1, 0, 0);
    expect(world.planets[0].buildProgress).toBe(9);
    expect(slotsOf(world)[TURRET].cooldown).toBe(0.4);
    expect(world.events.count).toBe(0);
  });

  it('l’événement porte l’index de la planète touchée (a = 1 pour la seconde)', () => {
    const world = makeWorld();
    damageBuilding(world, 1, 1e6, 3, 4);
    expect(world.events.items[0]).toMatchObject({
      type: EVT.BUILDING_DESTROYED,
      a: 1,
      b: TURRET,
      x: 3,
      y: 4,
    });
    expect(slotsOf(world, 0)[TURRET].built).toBe(true);
  });

  it('l’usine tombe quand il n’y a plus aucune tourelle construite, et pas avant', () => {
    const world = makeWorld();
    destroyNext(world, 1); // base
    expect(slotsOf(world)[FACTORY].built).toBe(true); // la lourde protège encore
    destroyNext(world, 1); // lourde
    expect(slotsOf(world)[FACTORY].built).toBe(true);
    clearEvents(world.events);
    destroyNext(world, 1); // usine
    expect(slotsOf(world)[FACTORY].built).toBe(false);
    expect(slotsOf(world)[GENERATOR].built).toBe(true);
    expect(destroyedEvents(world).map((e) => e.b)).toEqual([FACTORY]);
  });
});

describe('damageBuilding : cas où rien ne se passe', () => {
  it('planète possédée sans aucun bâtiment : état strictement inchangé, aucun événement', () => {
    const world = makeWorld({ built: 0 });
    world.planets[0].buildProgress = 6;
    const before = JSON.stringify(world.planets[0]);
    damageBuilding(world, 0, 1e6, 0, 0);
    expect(JSON.stringify(world.planets[0])).toBe(before);
    expect(world.events.count).toBe(0);
  });

  it('planète neutre : rien (elle n’a jamais de bâtiment, même si la carte en demande)', () => {
    const world = makeWorld({ owner: -1, built: 4 });
    const before = JSON.stringify(world.planets[0]);
    damageBuilding(world, 0, 1e6, 0, 0);
    expect(JSON.stringify(world.planets[0])).toBe(before);
    expect(world.events.count).toBe(0);
  });

  it('planète entièrement rasée : un coup de plus ne change rien et n’émet rien', () => {
    const world = makeWorld();
    destroyNext(world, 4);
    clearEvents(world.events);
    const before = JSON.stringify(world.planets[0]);
    damageBuilding(world, 0, 1e6, 0, 0);
    expect(JSON.stringify(world.planets[0])).toBe(before);
    expect(world.events.count).toBe(0);
  });
});

describe('damageBuilding : dégâts et PV limites', () => {
  it.each(TARGET_ORDER)('dégâts = PV exacts du slot %i : détruit (≥ hp suffit)', (slotIndex) => {
    const world = makeWorld();
    const before = TARGET_ORDER.indexOf(slotIndex);
    destroyNext(world, before);
    damageBuilding(world, 0, BUILDINGS[slotIndex].hp, 0, 0);
    expect(slotsOf(world)[slotIndex]).toMatchObject({ built: false, hp: 0 });
  });

  it.each(TARGET_ORDER)('dégâts = PV − 1 sur le slot %i : survit avec 1 PV', (slotIndex) => {
    const world = makeWorld();
    destroyNext(world, TARGET_ORDER.indexOf(slotIndex));
    clearEvents(world.events);
    damageBuilding(world, 0, BUILDINGS[slotIndex].hp - 1, 0, 0);
    expect(slotsOf(world)[slotIndex]).toMatchObject({ built: true, hp: 1 });
    expect(world.events.count).toBe(0);
  });

  it('les PV ne sont jamais négatifs, quels que soient les dégâts, et chaque destruction émet un seul événement', () => {
    const world = makeWorld();
    const damages = [1, 79, 1000, 0.5, 33, 1e9, 12, 12, 12, 1e3, 7];
    for (const d of damages) {
      damageBuilding(world, 0, d, 0, 0);
      for (const slot of slotsOf(world)) {
        expect(slot.hp).toBeGreaterThanOrEqual(0);
        if (!slot.built) expect(slot.hp).toBe(0);
      }
    }
    // Au plus un événement par slot détruit : 4 bâtiments, donc au plus 4 événements.
    expect(destroyedEvents(world).length).toBeLessThanOrEqual(4);
  });

  it('dégâts nuls : aucune perte de PV et aucun événement', () => {
    const world = makeWorld();
    const before = JSON.stringify(world.planets[0]);
    damageBuilding(world, 0, 0, 0, 0);
    // 0 dégât : hp − 0 > 0, aucun changement (le slot n'est pas détruit).
    expect(JSON.stringify(world.planets[0])).toBe(before);
    expect(world.events.count).toBe(0);
  });
});

describe('damageBuilding : combien de coups pour détruire (valeurs d’équilibrage de l’ADR 0007 §1)', () => {
  /** Applique `n` coups de `damage` sur le slot visé (les précédents de l'ordre étant déjà détruits). */
  function hitsToDestroy(slotIndex, damage) {
    const world = makeWorld();
    destroyNext(world, TARGET_ORDER.indexOf(slotIndex));
    clearEvents(world.events);
    let hits = 0;
    while (slotsOf(world)[slotIndex].built) {
      damageBuilding(world, 0, damage, 0, 0);
      hits++;
      expect(hits).toBeLessThan(100); // garde-fou
    }
    return hits;
  }

  it('les constantes utilisées sont celles de l’ADR : balle 12, missile 40, PV 80 / 100 / 100 / 160', () => {
    expect(BULLET_DAMAGE).toBe(12);
    expect(MISSILE_DAMAGE).toBe(40);
    expect(BUILDINGS.map((b) => b.hp)).toEqual([80, 100, 100, 160]);
  });

  it('7 balles de 12 détruisent la tourelle de base (80 PV), 6 non', () => {
    expect(hitsToDestroy(TURRET, BULLET_DAMAGE)).toBe(7);
    const world = makeWorld();
    for (let i = 0; i < 6; i++) damageBuilding(world, 0, BULLET_DAMAGE, 0, 0);
    expect(slotsOf(world)[TURRET]).toMatchObject({ built: true, hp: 8 });
  });

  it('9 balles détruisent l’usine (100 PV), 8 non (4 PV restants)', () => {
    expect(hitsToDestroy(FACTORY, BULLET_DAMAGE)).toBe(9);
    const world = makeWorld();
    onlyBuilt(world, [FACTORY]);
    for (let i = 0; i < 8; i++) damageBuilding(world, 0, BULLET_DAMAGE, 0, 0);
    expect(slotsOf(world)[FACTORY]).toMatchObject({ built: true, hp: 4 });
  });

  it('9 balles pour le générateur, 14 pour la tourelle lourde', () => {
    expect(hitsToDestroy(GENERATOR, BULLET_DAMAGE)).toBe(9);
    expect(hitsToDestroy(HEAVY, BULLET_DAMAGE)).toBe(14);
  });

  it('2 missiles de 40 détruisent la tourelle (80 PV), 3 l’usine et le générateur (100 PV), 4 la lourde (160 PV)', () => {
    expect(hitsToDestroy(TURRET, MISSILE_DAMAGE)).toBe(2);
    expect(hitsToDestroy(FACTORY, MISSILE_DAMAGE)).toBe(3);
    expect(hitsToDestroy(GENERATOR, MISSILE_DAMAGE)).toBe(3);
    expect(hitsToDestroy(HEAVY, MISSILE_DAMAGE)).toBe(4);
  });

  it('raser une planète complète : 39 balles ou 12 missiles (80 + 160 + 100 + 100 = 440 PV)', () => {
    for (const [damage, total] of [
      [BULLET_DAMAGE, 39],
      [MISSILE_DAMAGE, 12],
    ]) {
      const world = makeWorld();
      let hits = 0;
      while (slotsOf(world).some((s) => s.built)) {
        damageBuilding(world, 0, damage, 0, 0);
        hits++;
        expect(hits).toBeLessThan(100);
      }
      expect(hits).toBe(total);
      expect(destroyedEvents(world).map((e) => e.b)).toEqual(TARGET_ORDER);
    }
  });
});
