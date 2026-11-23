import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP_MAX_HP } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { int } from '../../src/core/rng.js';
import { respawnShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// Scénarios de tourelles sur mini-cartes 4000×4000 (aucune frontière en jeu). La planète défendue,
// de centre (1000, 2000) ou (2000, 2000), r = 60, g0 = 70, appartient à la faction 1 ; l'intrus est le
// vaisseau 0 (faction 0, sans planète : « hors jeu », donc il ne capture pas et l'élimination ne joue pas).
// Le pas de la simulation est FIXED_DT ; chaque seed donne un monde reproductible à l'identique.
const SIZE = 4000;
const RADIUS = 60;
const TURRET = BUILDINGS[0].turret;
const TURRET_STEPS = Math.round(BUILDINGS[0].buildTime / FIXED_DT); // 1200
// Tolérance en pas sur une durée de chantier : 1200 additions de 1/60 peuvent valoir 20 − 4e-13
// (1200 ou 1201 pas) et `updateBuildings` précède `updateCapture`/les collisions dans `step`.
const TOL = 2;

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Fait avancer d'un pas en vidant les événements avant ; renvoie ceux du pas, regroupés par type utile. */
function createRecorder(world) {
  const log = { shots: [], destroyed: [], built: [], hits: [], shipsHit: [] };
  return {
    log,
    step() {
      clearEvents(world.events);
      step(world, FIXED_DT);
      const tick = world.tick;
      for (const e of eventsOf(world, EVT.TURRET_SHOT)) log.shots.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.TURRET_DESTROYED)) log.destroyed.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BUILT)) log.built.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.BULLET_HIT)) log.hits.push({ tick, ...e });
      for (const e of eventsOf(world, EVT.SHIP_HIT)) log.shipsHit.push({ tick, ...e });
    },
    run(n) {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

/** Intrus posé au sommet de la planète défendue (spawn { planet: 0 } : posé, pleins PV, nez vers le haut). */
function landedIntruder({ built, seed = 1 }) {
  return createWorld(
    {
      width: SIZE,
      height: SIZE,
      planets: [{ x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built }],
      spawns: [{ planet: 0 }],
    },
    seed,
    { eventCapacity: 64 },
  );
}

/** Temps (s) pour tuer l'intrus posé, ou null s'il survit à `maxSeconds`. */
function timeToKill(world, maxSeconds) {
  const maxSteps = Math.round(maxSeconds / FIXED_DT);
  for (let i = 0; i < maxSteps; i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    if (!world.ships[0].alive) return world.tick * FIXED_DT;
  }
  return null;
}

describe('tourelle : un vaisseau posé près d’une planète défendue', () => {
  it('avec la tourelle de base seule, il faut au moins 5 s pour le tuer (en pratique ≥ 9 s)', () => {
    const t = timeToKill(landedIntruder({ built: 1 }), 120);
    expect(t).not.toBeNull();
    // ADR 0005 §4 : « 5 s au minimum » (écrit pour 100 PV ; vérifié ici pour SHIP_MAX_HP actuel). Borne réelle :
    // SHIP_MAX_HP / damage balles (10 avec 60 PV et 6 de dégâts), espacées d'au moins `cooldown` (1 s) → au
    // moins 9 intervalles, soit ≥ 9 s même si aucun tir ne manque. Mesure (seeds 1 à 10) : 9 à 13 s,
    // les tirs ratés (dispersion ±0,1 rad) ajoutant des cycles de 1 s.
    expect(t).toBeGreaterThanOrEqual(5);
    const hitsNeeded = Math.ceil(SHIP_MAX_HP / TURRET.damage);
    expect(t).toBeGreaterThanOrEqual((hitsNeeded - 1) * TURRET.cooldown - 1e-9);
  });

  it('avec les deux tourelles, il meurt plus vite qu’avec la seule tourelle de base, mais pas plus vite que la cadence théorique', () => {
    // Cadence maximale théorique, tous les coups au but : chaque tourelle tire à t = 0, cooldown, 2·cooldown…
    // (base : 6 par 1 s ; lourde : 8 par 0,6 s). On accumule les dégâts dans l'ordre chronologique jusqu'à
    // SHIP_MAX_HP : 3,0 s avec 60 PV (cumul : 14 à t=0, 22 à 0,6, 28 à 1,0, 36 à 1,2, 44 à 1,8, 50 à 2,0,
    // 58 à 2,4, ≥ 64 à 3,0).
    // Tolérance de 0,3 s sur la borne basse : le cooldown est décompté en pas de 1/60 (arrondi < 1 pas par tir).
    // Mesure : 3,017 s pour les seeds 1 à 10 (la lourde, plus précise, fait l'essentiel des dégâts).
    const shots = [];
    for (const b of [
      BUILDINGS.find((b) => b.id === 'turret'),
      BUILDINGS.find((b) => b.id === 'heavyTurret'),
    ].map((b) => b.turret)) {
      for (let k = 0; k * b.cooldown <= 60; k++)
        shots.push({ t: k * b.cooldown, damage: b.damage });
    }
    shots.sort((x, y) => x.t - y.t);
    let total = 0;
    let theoretical = null;
    for (const shot of shots) {
      total += shot.damage;
      if (total >= SHIP_MAX_HP) {
        theoretical = shot.t;
        break;
      }
    }
    expect(theoretical).not.toBeNull();
    const MARGIN = 0.3;

    const baseOnly = timeToKill(landedIntruder({ built: 1 }), 120);
    for (let seed = 1; seed <= 10; seed++) {
      const both = timeToKill(landedIntruder({ built: 4, seed }), 120);
      expect(both).not.toBeNull();
      expect(both).toBeLessThan(baseOnly);
      expect(both).toBeGreaterThanOrEqual(theoretical - MARGIN);
    }
  });

  it('posé sur une planète voisine (écart de surface 60 px), il est visé et tué, mais plus lentement qu’à bout portant', () => {
    // La balle part radialement avec ±0,1 rad de bruit : à 114 px du centre le décalage latéral atteint ±11 px
    // pour un rayon de contact de 6 px, donc une partie des tirs manque (mesure : 28 à 42 s pour les seeds 1 à 3).
    function neighbourWorld(seed) {
      const world = createWorld(
        {
          width: SIZE,
          height: SIZE,
          planets: [
            { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built: 1 },
            { x: 1000, y: 2000 - 2 * RADIUS - 60, radius: RADIUS, gravity: 70 },
          ],
          spawns: [{ planet: 1 }],
        },
        seed,
        { eventCapacity: 64 },
      );
      // Posé sous la planète voisine, côté planète défendue (spawn la pose au sommet, hors de portée).
      const ship = world.ships[0];
      ship.pos.x = world.planets[1].pos.x;
      ship.pos.y = world.planets[1].pos.y + RADIUS + 6;
      ship.angle = Math.PI / 2;
      return world;
    }
    const point = timeToKill(landedIntruder({ built: 1 }), 120);
    for (let seed = 1; seed <= 3; seed++) {
      const t = timeToKill(neighbourWorld(seed), 120);
      expect(t).not.toBeNull();
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeGreaterThan(point * 0.75); // jamais bien plus vite qu'à bout portant (mesure : 1,4 à 2,1 ×)
    }
  });

  it('la tourelle ne touche pas un propriétaire : le vaisseau de la faction 1 posé dessus ne subit rien en 30 s', () => {
    const world = createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: [{ x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built: 4 }],
        spawns: [{ x: 3000, y: 3000 }, { planet: 0 }],
      },
      1,
      { eventCapacity: 64 },
    );
    const rec = createRecorder(world);
    rec.run(30 * 60);
    expect(world.ships[1].hp).toBe(SHIP_MAX_HP);
    expect(rec.log.shots).toHaveLength(0);
  });
});

describe('tourelle : un vaisseau qui croise rapidement', () => {
  // Intrus lancé à vitesse constante (selon +x) sous une tourelle de base à 100 px de sa surface.
  // La visée est sans anticipation (ADR 0005 §4) : une balle à 200 px/s met ≈ 0,5 s pour couvrir 100 px,
  // pendant lesquelles un vaisseau à 100 px/s s'est déplacé de 50 px, soit bien plus que le rayon de contact (6 px).
  // `offset` décale le point de départ pour varier la phase du tir par rapport à la trajectoire.
  const GAP = 100;
  const SEEDS = 30;
  const OFFSETS = [0, 17, 33];

  function crossing({ seed, offset, speed, built = 1 }) {
    const world = createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: [{ x: 2000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built }],
        spawns: [{ x: 1700 + offset, y: 2000 - RADIUS - GAP, angle: 0 }],
      },
      seed,
      { eventCapacity: 256 },
    );
    const ship = world.ships[0];
    ship.vel.x = speed;
    const rec = createRecorder(world);
    // Jusqu'à ce que le vaisseau ait dépassé la zone de tir de la tourelle (x > 2400) ou 30 s.
    for (let i = 0; i < 30 * 60 && ship.alive && ship.pos.x < 2400; i++) rec.step();
    return { hp: ship.hp, shots: rec.log.shots.length, hits: rec.log.shipsHit.length };
  }

  function campaign(speed, built = 1) {
    let trials = 0;
    let hit = 0;
    let shots = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const offset of OFFSETS) {
        const r = crossing({ seed, offset, speed, built });
        trials++;
        shots += r.shots;
        if (r.hits > 0) hit++;
      }
    }
    return { trials, hit, shots };
  }

  it('à 100 px/s, il est rarement touché (≤ 5 % des 90 traversées) alors que la tourelle tire bien', () => {
    // Mesure (tourelle de base, puis les deux) : 0 traversée touchée sur 90. Seuil de 5 % = 4 : large devant 0,
    // mais très en dessous du ~27 % observé à 30 px/s (voir le test suivant).
    for (const built of [1, 4]) {
      const { trials, hit, shots } = campaign(100, built);
      expect(trials).toBe(SEEDS * OFFSETS.length);
      // Garde-fou : sans tir, « jamais touché » ne prouverait rien. Trois tirs par traversée en moyenne.
      expect(shots / trials).toBeGreaterThanOrEqual(2);
      expect(hit).toBeLessThanOrEqual(Math.floor(0.05 * trials));
    }
  });

  it('témoin : à 30 px/s, le même vaisseau est touché bien plus souvent (≥ 15 % des traversées)', () => {
    // Mesure : 24/90 (27 %) pour la tourelle de base. Plus lent, il se rapproche d'une trajectoire que la balle
    // (sans anticipation) peut encore atteindre.
    const { trials, hit } = campaign(30);
    expect(hit).toBeGreaterThanOrEqual(Math.ceil(0.15 * trials));
    expect(hit).toBeGreaterThan(campaign(100).hit);
  });

  it('même en traversant, un vaisseau à 100 px/s ne meurt jamais (aucune des 90 traversées, deux tourelles)', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = crossing({ seed, offset: 0, speed: 100, built: 4 });
      expect(r.hp).toBeGreaterThan(0);
    }
  });
});

describe('tourelle : détruite à coups de balles', () => {
  // Planète défendue avec tourelle de base ET usine (built: 2) : le chantier en cours est le générateur (40 s).
  // Un vaisseau posé ne peut pas tirer vers le sol (le nez serait dans la planète) : l'attaquant est donc EN VOL,
  // à 160 px du centre (100 px de surface, dans la portée de 150 px de la tourelle), nez vers la planète, à
  // vitesse nulle. À cette distance g ≈ 70·(60/160)² ≈ 10 px/s² : il ne dérive que d'une trentaine de px
  // pendant les ~2,5 s de l'attaque (≈ 1,1 s de tir + délai de vol), donc ne touche jamais la planète.
  // Il encaisse les tirs de la tourelle (6 PV/s) et survit. Les balles mettent ~0,3 s à arriver : on compte les
  // impacts (BULLET_HIT sur la planète), pas les tirs.
  const START_Y = 2000 - 160;

  function attackedWorld(seed = 1) {
    return createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: [{ x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built: 2 }],
        spawns: [{ x: 1000, y: START_Y, angle: Math.PI / 2 }],
      },
      seed,
      { eventCapacity: 64 },
    );
  }

  /** Tire jusqu'au TURRET_DESTROYED ; renvoie le nombre de balles de l'intrus absorbées par la planète. */
  function fireUntilDestroyed(world, rec) {
    const ship = world.ships[0];
    let impacts = 0;
    ship.intent.fire = true;
    while (rec.log.destroyed.length === 0) {
      rec.step();
      impacts += eventsOf(world, EVT.BULLET_HIT).length;
      expect(world.tick).toBeLessThan(600); // garde-fou : 10 s max
    }
    ship.intent.fire = false;
    expect(ship.landedOn).toBe(-1); // il a attaqué en vol, sans jamais se poser
    return impacts;
  }

  /** « L'intrus encore là » : posé sur la planète après l'attaque (même état qu'un respawn), pleins PV. */
  function landIntruder(world) {
    respawnShip(world.ships[0], 0, world.planets[0]);
  }

  it('7 balles de 12 (80 PV) : une seule TURRET_DESTROYED (a = planète, b = slot 0), 6 balles laissent 8 PV', () => {
    const world = attackedWorld();
    const rec = createRecorder(world);
    rec.run(60); // 1 s de développement avant l'attaque
    const turret = world.planets[0].buildings[0];
    expect(turret).toMatchObject({ built: true, hp: TURRET.hp });
    const progressBefore = world.planets[0].buildProgress;
    expect(progressBefore).toBeGreaterThan(0.9);

    let impacts = 0;
    let hpAfterSix = -1;
    world.ships[0].intent.fire = true;
    while (rec.log.destroyed.length === 0) {
      rec.step();
      expect(world.tick).toBeLessThan(600); // garde-fou : 10 s max
      impacts += eventsOf(world, EVT.BULLET_HIT).length;
      if (impacts === 6 && hpAfterSix < 0) hpAfterSix = turret.hp;
    }
    world.ships[0].intent.fire = false;

    expect(impacts).toBe(7);
    expect(hpAfterSix).toBe(TURRET.hp - 6 * 12);
    expect(rec.log.destroyed).toHaveLength(1);
    expect(rec.log.destroyed[0]).toMatchObject({ a: 0, b: 0 });
    expect(turret).toMatchObject({ built: false, hp: 0 });
    // Le chantier en cours (≈ 2,3 s de générateur) est remis à zéro ; `updateBuildings`, qui suit les
    // collisions dans le même pas, ajoute alors un dt au nouveau chantier (la tourelle, premier slot libre).
    expect(world.planets[0].buildProgress).toBeLessThanOrEqual(FIXED_DT + 1e-12);
    expect(world.ships[0].alive).toBe(true);
    // Le faction 1 garde son usine : la perte de la tourelle ne la touche pas.
    expect(world.planets[0].buildings[1].built).toBe(true);
  });

  it('la tourelle défend la planète pendant l’attaque : elle tire sur l’attaquant en vol', () => {
    const world = attackedWorld();
    const rec = createRecorder(world);
    rec.run(60);
    fireUntilDestroyed(world, rec);
    expect(rec.log.shots.length).toBeGreaterThan(0);
    expect(rec.log.shots.every((e) => e.a === 0 && e.b === 0)).toBe(true);
  });

  it('la tourelle détruite cesse de tirer, puis est reconstruite en priorité : BUILT slot 0 après 20 s (±2 pas)', () => {
    const world = attackedWorld();
    const rec = createRecorder(world);
    rec.run(60);
    fireUntilDestroyed(world, rec);
    const destroyedAt = rec.log.destroyed[0].tick;
    const shotsBefore = rec.log.shots.length;
    expect(shotsBefore).toBeGreaterThan(0); // elle s'est défendue

    // Pendant la reconstruction : aucun tir de tourelle, intrus indemne de nouveaux dégâts.
    landIntruder(world);
    const hpAtDestruction = world.ships[0].hp;
    rec.run(TURRET_STEPS - TOL - 2);
    expect(rec.log.built).toHaveLength(0);
    expect(rec.log.shots).toHaveLength(shotsBefore);
    expect(world.ships[0].hp).toBe(hpAtDestruction);
    expect(world.planets[0].buildings[0].built).toBe(false);

    rec.run(2 * TOL + 4);
    // La tourelle (slot 0) passe avant le générateur (slot 2), dont le chantier avait commencé.
    expect(rec.log.built).toHaveLength(1);
    expect(rec.log.built[0]).toMatchObject({ a: 0, b: 0 });
    // Le chantier a redémarré dans le pas même de la destruction : 1200 pas (± arrondi) plus tard.
    expect(Math.abs(rec.log.built[0].tick - destroyedAt - (TURRET_STEPS - 1))).toBeLessThanOrEqual(
      TOL,
    );
    expect(world.planets[0].buildings[0]).toMatchObject({ built: true, hp: TURRET.hp });
  });

  it('une fois reconstruite, la tourelle tire de nouveau sur l’intrus encore là', () => {
    const world = attackedWorld();
    const rec = createRecorder(world);
    rec.run(60);
    fireUntilDestroyed(world, rec);
    landIntruder(world);
    const shotsBefore = rec.log.shots.length;
    rec.run(TURRET_STEPS + 120);
    expect(rec.log.built.some((e) => e.b === 0)).toBe(true);
    expect(rec.log.shots.length).toBeGreaterThan(shotsBefore);
  });
});

describe('tourelle : déterminisme', () => {
  const STEPS = 3000;

  /**
   * Intrus posé sur sa propre planète, face à une planète défendue (deux tourelles) à 130 px de surface, avec
   * des impulsions de poussée, des rotations et des tirs tirés dans world.rng : tourelles, balles du joueur,
   * impacts, morts et respawns.
   */
  function run(seed) {
    const world = createWorld(
      {
        width: SIZE,
        height: SIZE,
        planets: [
          { x: 1000, y: 2000, radius: RADIUS, gravity: 70, owner: 1, built: 4 },
          { x: 1250, y: 2000, radius: RADIUS, gravity: 70, owner: 0, built: 1 },
        ],
        spawns: [{ planet: 1 }, { planet: 0 }],
      },
      seed,
      { eventCapacity: 256 },
    );
    const ship = world.ships[0];
    const rec = createRecorder(world);
    for (let i = 0; i < STEPS; i++) {
      // Le nez vise (à peu près) la planète défendue : les balles du joueur y sont absorbées.
      if (ship.landedOn >= 0) ship.angle = Math.atan2(2000 - ship.pos.y, 1000 - ship.pos.x);
      ship.intent.thrust = int(world.rng, 0, 60) === 0;
      ship.intent.rotate = int(world.rng, -1, 2);
      ship.intent.fire = int(world.rng, 0, 3) === 0;
      rec.step();
    }
    return { world, rec };
  }

  function allFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(allFinite);
    if (value && typeof value === 'object') return Object.values(value).every(allFinite);
    return true;
  }

  it('même seed, même script : monde et journal identiques à l’octet (3000 pas), état fini', () => {
    const a = run(21);
    const b = run(21);
    expect(a.world.tick).toBe(STEPS);
    // Le scénario exerce bien la tourelle et les collisions, sinon l'égalité serait triviale.
    expect(a.rec.log.shots.length).toBeGreaterThan(0);
    expect(a.rec.log.hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(JSON.stringify(a.rec.log)).toBe(JSON.stringify(b.rec.log));
    expect(allFinite(a.world)).toBe(true); // JSON.stringify masquerait un NaN en null
  });

  it('une autre seed donne un déroulement différent (le bruit des tourelles et le script dépendent du rng)', () => {
    expect(JSON.stringify(run(21).rec.log)).not.toBe(JSON.stringify(run(22).rec.log));
  });

  it('invariants sur toute la partie : PV tourelles bornés, hp des slots non construits à 0, pool borné', () => {
    const { world } = run(33);
    for (const planet of world.planets) {
      planet.buildings.forEach((slot, s) => {
        const max = BUILDINGS[s].turret?.hp ?? 0;
        expect(slot.hp).toBeGreaterThanOrEqual(0);
        expect(slot.hp).toBeLessThanOrEqual(max);
        if (!slot.built) expect(slot.hp).toBe(0);
      });
    }
    expect(world.ships[0].hp).toBeGreaterThanOrEqual(0);
    expect(world.ships[0].hp).toBeLessThanOrEqual(SHIP_MAX_HP);
  });
});
