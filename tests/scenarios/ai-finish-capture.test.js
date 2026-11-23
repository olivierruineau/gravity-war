// Une capture presque terminée est menée à bout (retour de playtest 9.x : un bot posé sur une planète ennemie
// repartait à 2,9 s sur 3 s, sur un repli déclenché à PV bas).
import { describe, expect, it } from 'vitest';
import { CAPTURE_TIME } from '../../src/config.js';
import { AI_MODE } from '../../src/core/ai/bot.js';
import { decide } from '../../src/core/ai/decide.js';
import { createWorld } from '../../src/core/world.js';
import { BOT_PROFILE as P } from '../../src/data/ai.js';

const TARGET = 2;

/** Bot 1 posé sur la planète ennemie 2 (sans bâtiment), capture en cours, PV bas et sous le feu. */
function setup(captureTime) {
  const planets = [
    { x: 2250, y: 1450, radius: 40, owner: 0, built: 1 },
    { x: 150, y: 1450, radius: 40, owner: 1, built: 0 }, // abri de repli
    { x: 1200, y: 300, radius: 40, owner: 2, built: 0 }, // cible, sans tourelle
  ];
  const spawns = [{ planet: 0 }, { planet: TARGET }, { x: 2300, y: 100 }]; // l'ennemi est loin
  const world = createWorld({ width: 2400, height: 1600, planets, spawns }, 1, {
    eventCapacity: 64,
    bots: [1],
  });
  const bot = world.ai[0];
  const ship = world.ships[1];
  bot.mode = AI_MODE.CAPTURE;
  bot.target = TARGET;
  bot.modeTime = 10;
  bot.lastHealth = 60;
  ship.hp = 10; // sous lowHealth : le repli est urgent
  world.planets[TARGET].captureBy = 1;
  world.planets[TARGET].captureTime = captureTime;
  return { world, bot, ship };
}

describe('IA : capture presque terminée', () => {
  it('reste posé quand il ne manque que captureFinish', () => {
    const { world, bot, ship } = setup(CAPTURE_TIME - P.captureFinish + 0.1);
    expect(ship.landedOn).toBe(TARGET);
    decide(world, bot, ship);
    expect(bot.mode).toBe(AI_MODE.CAPTURE);
    expect(bot.target).toBe(TARGET);
  });

  it('en début de capture, le repli reste possible (témoin)', () => {
    const { world, bot, ship } = setup(0.3);
    decide(world, bot, ship);
    expect(bot.mode).toBe(AI_MODE.RETREAT);
  });
});
