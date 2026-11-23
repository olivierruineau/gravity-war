import { describe, expect, it } from 'vitest';
import { EVENT_CAPACITY, FIXED_DT, SHIP_MAX_HP } from '../../src/config.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { OUTCOME, updateFactions } from '../../src/core/faction.js';
import { damageShip } from '../../src/core/lifecycle.js';
import { NEUTRAL } from '../../src/core/planet.js';
import { respawnShip } from '../../src/core/ship.js';
import { createWorld, step } from '../../src/core/world.js';

// Élimination et issue de partie (ADR 0005 §1, §7). Mini-carte : trois bases (factions 0, 1, 2) à 600 px
// les unes des autres (rayon 40 → portée de gravité 200 px : aucune interaction), vaisseaux 0 et 1 en vol
// libre à 600 px sous leur base ; la faction 2 n'a pas de vaisseau. Les appels directs à `updateFactions`
// sont déterministes sans aucune somme flottante : on compare avec `toBe`.
const BASES = [
  { x: 300, y: 300, radius: 40, owner: 0 },
  { x: 900, y: 300, radius: 40, owner: 1 },
  { x: 1500, y: 300, radius: 40, owner: 2 },
];
const SHIPS = [
  { x: 300, y: 900 },
  { x: 900, y: 900 },
];
const NEUTRAL_PLANET = { x: 2100, y: 300, radius: 40 };

function makeWorld({ planets = BASES, spawns = SHIPS } = {}) {
  const world = createWorld({ width: 2400, height: 1350, planets, spawns }, 1, {
    eventCapacity: EVENT_CAPACITY,
  });
  clearEvents(world.events);
  return world;
}

function eventsOf(world, type) {
  return world.events.items.slice(0, world.events.count).filter((e) => e.type === type);
}

/** Vaisseau `i` tué d'un coup mortel (même chemin que le jeu : `damageShip`). */
function kill(world, i) {
  damageShip(world, i, SHIP_MAX_HP, 0, 0);
  expect(world.ships[i].alive).toBe(false);
  clearEvents(world.events); // écarte l'EXPLOSION : les assertions portent sur les événements de faction
}

/** La faction `f` perd toutes ses planètes au profit de `to` (neutre par défaut). */
function loseAllPlanets(world, f, to = NEUTRAL) {
  for (const p of world.planets) if (p.owner === f) p.owner = to;
}

/** Fait n pas complets et renvoie tous les événements émis, étiquetés par numéro de pas. */
function run(world, n) {
  const all = [];
  for (let i = 0; i < n; i++) {
    clearEvents(world.events);
    step(world, FIXED_DT);
    for (let k = 0; k < world.events.count; k++) {
      all.push({ ...world.events.items[k], tick: world.tick });
    }
  }
  return all;
}

/** Appelle updateFactions n fois en cumulant les événements de chaque appel. */
function updateRepeatedly(world, n) {
  const all = [];
  for (let i = 0; i < n; i++) {
    clearEvents(world.events);
    updateFactions(world);
    for (let k = 0; k < world.events.count; k++) all.push({ ...world.events.items[k] });
  }
  return all;
}

const ofType = (events, type) => events.filter((e) => e.type === type);

describe('inGame : factions en jeu au départ', () => {
  it('trois bases : toutes les factions sont en jeu', () => {
    expect(makeWorld().inGame).toEqual([true, true, true]);
  });

  it('faction sans planète au départ : hors jeu (et déjà « éliminée », sans événement)', () => {
    const world = makeWorld({ planets: BASES.slice(0, 2) });
    expect(world.inGame).toEqual([true, true, false]);
    expect(world.factions[2].eliminated).toBe(true);
    expect(world.events.count).toBe(0);
  });
});

describe('updateFactions : élimination', () => {
  it('planetCount = 0 ET vaisseau mort : ELIMINATED (a = faction) émis par l’appel même', () => {
    const world = makeWorld();
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    clearEvents(world.events);
    updateFactions(world);
    expect(world.factions[1].planetCount).toBe(0);
    expect(world.factions[1].eliminated).toBe(true);
    const eliminated = eventsOf(world, EVT.ELIMINATED);
    expect(eliminated).toHaveLength(1);
    expect(eliminated[0]).toMatchObject({ a: 1, x: 0, y: 0 });
    expect(world.factions[0].eliminated).toBe(false);
    expect(world.factions[2].eliminated).toBe(false);
    expect(world.outcome).toBe(OUTCOME.PLAYING); // la faction 2 reste en jeu
  });

  it('faction sans vaisseau du tout (aucun spawn) : éliminée dès qu’elle n’a plus de planète', () => {
    const world = makeWorld();
    expect(world.ships.some((s) => s.faction === 2)).toBe(false);
    world.planets[2].owner = NEUTRAL;
    updateFactions(world);
    expect(world.factions[2].eliminated).toBe(true);
    expect(eventsOf(world, EVT.ELIMINATED).map((e) => e.a)).toEqual([2]);
  });

  it('via `step` : ELIMINATED est émis au pas où la planète est perdue, pas au suivant', () => {
    const world = makeWorld();
    kill(world, 1);
    expect(run(world, 5)).toHaveLength(0); // mort mais propriétaire : rien
    loseAllPlanets(world, 1, 0);
    const events = run(world, 1);
    expect(ofType(events, EVT.ELIMINATED)).toMatchObject([{ a: 1, tick: world.tick }]);
  });

  it('la mort seule n’élimine pas tant qu’il reste une planète', () => {
    const world = makeWorld();
    kill(world, 1);
    expect(updateRepeatedly(world, 10)).toHaveLength(0);
    expect(world.factions[1].eliminated).toBe(false);
  });

  it('un seul ELIMINATED par faction, même après 600 appels', () => {
    const world = makeWorld();
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    const events = updateRepeatedly(world, 600);
    expect(ofType(events, EVT.ELIMINATED)).toHaveLength(1);
  });

  it('un vaisseau VIVANT sans planète n’est pas éliminé (600 pas)', () => {
    const world = makeWorld();
    loseAllPlanets(world, 1, 0);
    const events = run(world, 600);
    expect(ofType(events, EVT.ELIMINATED)).toHaveLength(0);
    expect(world.ships[1].alive).toBe(true);
    expect(world.factions[1]).toMatchObject({ planetCount: 0, eliminated: false });
    expect(world.outcome).toBe(OUTCOME.PLAYING);
  });

  it('un vaisseau vivant sans planète peut recapturer une neutre et reste en jeu', () => {
    const world = makeWorld({ planets: [...BASES, NEUTRAL_PLANET] });
    loseAllPlanets(world, 1, 0);
    expect(ofType(run(world, 5), EVT.ELIMINATED)).toHaveLength(0);
    // Le vaisseau 1 se pose sur la neutre (index 3) : il y reste figé, seul, sans défense en face.
    respawnShip(world.ships[1], 3, world.planets[3]);
    // Capture au plus tard à CAPTURE_TIME (3 s = 180 pas, ±1 d'arrondi) : 200 pas suffisent largement.
    const events = run(world, 200);
    expect(ofType(events, EVT.CAPTURED)).toMatchObject([{ a: 3, b: 1 }]);
    expect(ofType(events, EVT.ELIMINATED)).toHaveLength(0);
    expect(world.planets[3].owner).toBe(1);
    expect(world.factions[1]).toMatchObject({ planetCount: 1, eliminated: false });
  });

  it('vivant sans planète, puis il meurt : éliminé au pas de la mort', () => {
    const world = makeWorld();
    loseAllPlanets(world, 1, 0);
    expect(updateRepeatedly(world, 3)).toHaveLength(0);
    kill(world, 1);
    clearEvents(world.events);
    updateFactions(world);
    expect(eventsOf(world, EVT.ELIMINATED).map((e) => e.a)).toEqual([1]);
  });

  it('un vaisseau mort qui vient de se faire reprendre sa dernière planète : pas éliminé tant qu’il possède 1 planète', () => {
    const world = makeWorld({ planets: [...BASES, NEUTRAL_PLANET] });
    kill(world, 1);
    world.planets[3].owner = 1; // 2e planète
    world.planets[1].owner = 0; // perd la première
    updateFactions(world);
    expect(world.factions[1]).toMatchObject({ planetCount: 1, eliminated: false });
    expect(world.events.count).toBe(0);
  });
});

describe('updateFactions : factions hors jeu', () => {
  // Carte à deux bases seulement : la faction 2 est hors jeu dès le départ.
  const TWO = BASES.slice(0, 2);

  it('une faction hors jeu n’émet jamais ELIMINATED (600 appels, avec ou sans vaisseau)', () => {
    const world = makeWorld({ planets: TWO, spawns: [...SHIPS, { x: 1500, y: 900 }] });
    kill(world, 2);
    expect(updateRepeatedly(world, 600)).toHaveLength(0);
    expect(world.factions[2].eliminated).toBe(true);
    expect(world.outcome).toBe(OUTCOME.PLAYING);
  });

  it('elle ne compte pas pour la victoire : éliminer la seule rivale en jeu suffit', () => {
    const world = makeWorld({ planets: TWO });
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    clearEvents(world.events);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
    expect(eventsOf(world, EVT.ELIMINATED).map((e) => e.a)).toEqual([1]); // jamais 2
    expect(eventsOf(world, EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.VICTORY }]);
  });

  it('un vaisseau hors jeu posé sur une neutre ne la capture jamais (faction « éliminée » dès le départ)', () => {
    const world = makeWorld({
      planets: [...TWO, { x: 1500, y: 300, radius: 40 }],
      spawns: [...SHIPS, { planet: 2 }],
    });
    expect(world.ships[2].landedOn).toBe(2);
    const events = run(world, 600); // 10 s ≫ CAPTURE_TIME
    expect(ofType(events, EVT.CAPTURED)).toHaveLength(0);
    expect(world.planets[2].owner).toBe(NEUTRAL);
    expect(world.factions[2].planetCount).toBe(0);
  });

  it('une faction éliminée en cours de partie ne capture plus', () => {
    const world = makeWorld({ planets: [...BASES, NEUTRAL_PLANET] });
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    updateFactions(world);
    expect(world.factions[1].eliminated).toBe(true);
    // État forcé (aucun chemin du jeu ne ressuscite une faction éliminée) : on remet le vaisseau
    // en vie, posé sur la neutre, pour vérifier que la règle de capture l'ignore quand même.
    respawnShip(world.ships[1], 3, world.planets[3]);
    const events = run(world, 600);
    expect(ofType(events, EVT.CAPTURED)).toHaveLength(0);
    expect(world.planets[3].owner).toBe(NEUTRAL);
    expect(world.planets[3].captureBy).toBe(-1);
    expect(world.factions[1].eliminated).toBe(true); // l'élimination est définitive
  });
});

describe('updateFactions : issue de la partie', () => {
  it('DEFEAT si la faction 0 est éliminée : GAME_OVER a = DEFEAT, une seule fois sur 600 appels', () => {
    const world = makeWorld();
    kill(world, 0);
    loseAllPlanets(world, 0, 1);
    const events = updateRepeatedly(world, 600);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([0]);
    expect(ofType(events, EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.DEFEAT, x: 0, y: 0 }]);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);
  });

  it('GAME_OVER suit ELIMINATED dans la file du même appel', () => {
    const world = makeWorld();
    kill(world, 0);
    loseAllPlanets(world, 0, 1);
    updateFactions(world);
    expect(world.events.items[0].type).toBe(EVT.ELIMINATED);
    expect(world.events.items[1].type).toBe(EVT.GAME_OVER);
    expect(world.events.count).toBe(2);
  });

  it('VICTORY quand tous les rivaux en jeu sont éliminés : PLAYING tant qu’il en reste un', () => {
    const world = makeWorld();
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.PLAYING);
    expect(eventsOf(world, EVT.GAME_OVER)).toHaveLength(0);

    clearEvents(world.events);
    loseAllPlanets(world, 2, 0); // faction 2 : pas de vaisseau, dernière rivale
    const events = updateRepeatedly(world, 600);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([2]);
    expect(ofType(events, EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.VICTORY }]);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });

  it('élimination simultanée de deux rivaux au même pas : deux ELIMINATED (ordre des factions), un GAME_OVER', () => {
    const world = makeWorld();
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    loseAllPlanets(world, 2, 0);
    const events = updateRepeatedly(world, 600);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([1, 2]);
    expect(ofType(events, EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.VICTORY }]);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });

  it('tout le monde éliminé au même pas : la défaite l’emporte (la faction 0 est testée d’abord)', () => {
    const world = makeWorld();
    kill(world, 0);
    kill(world, 1);
    for (const p of world.planets) p.owner = NEUTRAL;
    const events = updateRepeatedly(world, 10);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([0, 1, 2]);
    expect(ofType(events, EVT.GAME_OVER)).toMatchObject([{ a: OUTCOME.DEFEAT }]);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);
  });

  it('l’issue n’est pas réécrite : après VICTORY, la perte de la faction 0 émet ELIMINATED mais ni 2e GAME_OVER ni DEFEAT', () => {
    const world = makeWorld();
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    loseAllPlanets(world, 2, 0);
    run(world, 1);
    expect(world.outcome).toBe(OUTCOME.VICTORY);

    kill(world, 0);
    loseAllPlanets(world, 0, NEUTRAL);
    const events = run(world, 600);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([0]);
    expect(ofType(events, EVT.GAME_OVER)).toHaveLength(0);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });

  it('l’issue n’est pas réécrite : après DEFEAT, l’élimination des rivaux ne donne pas VICTORY', () => {
    const world = makeWorld();
    kill(world, 0);
    loseAllPlanets(world, 0, 1);
    run(world, 1);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);

    kill(world, 1);
    loseAllPlanets(world, 1, NEUTRAL);
    loseAllPlanets(world, 2, NEUTRAL);
    const events = run(world, 600);
    expect(ofType(events, EVT.ELIMINATED).map((e) => e.a)).toEqual([1, 2]);
    expect(ofType(events, EVT.GAME_OVER)).toHaveLength(0);
    expect(world.outcome).toBe(OUTCOME.DEFEAT);
  });

  it('pas de GAME_OVER sans élimination : 600 pas de partie calme', () => {
    const world = makeWorld();
    const events = run(world, 600);
    expect(events.filter((e) => e.type === EVT.GAME_OVER || e.type === EVT.ELIMINATED)).toEqual([]);
    expect(world.outcome).toBe(OUTCOME.PLAYING);
  });
});

describe('updateFactions : monde sans `inGame`', () => {
  it('toutes les factions comptent en jeu (`?? true`) : la rivale 2 retarde la victoire', () => {
    const world = makeWorld();
    delete world.inGame; // monde assemblé à la main, sans la liste de départ
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.PLAYING);

    loseAllPlanets(world, 2, 0);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });

  it('contre-épreuve : avec inGame[2] = false, la faction 2 (qui a pourtant une planète) est ignorée', () => {
    const world = makeWorld();
    world.inGame[2] = false;
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
    expect(world.factions[2].eliminated).toBe(false);
  });

  it('sans inGame, une faction sans planète au départ ne bloque pas la victoire (elle est déjà éliminée)', () => {
    const world = makeWorld({ planets: BASES.slice(0, 2) });
    delete world.inGame;
    kill(world, 1);
    loseAllPlanets(world, 1, 0);
    updateFactions(world);
    expect(world.outcome).toBe(OUTCOME.VICTORY);
  });
});
