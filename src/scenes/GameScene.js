import Phaser from 'phaser';
import {
  EVENT_CAPACITY,
  FIXED_DT,
  MAX_FRAME_DT,
  MAX_STEPS_PER_FRAME,
  PALETTE,
  SCENES,
} from '../config.js';
import { clearEvents } from '../core/events.js';
import { consumeSteps, createClock } from '../core/clock.js';
import { createWorld, step } from '../core/world.js';
import { arena } from '../data/maps/arena.js';
import { drawPlanet } from '../entities/planetView.js';
import { drawShip } from '../entities/shipView.js';
import { createDebugOverlay } from '../systems/debugOverlay.js';
import { createHealthBar } from '../systems/healthBar.js';
import { createLandingAid } from '../systems/landingAid.js';
import { createKeyboardInput } from '../systems/keyboardInput.js';
import { createStarfield } from '../systems/starfield.js';

/**
 * Scène de jeu. Rester MINCE : elle orchestre la boucle à pas fixe, l'entrée et le rendu ;
 * les règles de jeu vivent dans `src/core` (ADR 0002).
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME);
  }

  create() {
    // Graine tirée ici (couche Phaser) : le core, lui, reste déterministe pour une graine donnée.
    const seed = Math.floor(Math.random() * 2 ** 32);
    this.world = createWorld(arena, seed, { eventCapacity: EVENT_CAPACITY });
    this.clock = createClock({
      dt: FIXED_DT,
      maxFrameDt: MAX_FRAME_DT,
      maxSteps: MAX_STEPS_PER_FRAME,
    });
    this.pilot = createKeyboardInput(this);
    createStarfield(this, this.world.width, this.world.height);
    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.gfx = this.add.graphics();
    this.debug = createDebugOverlay(this);
    this.healthBar = createHealthBar(this);
    this.landingAid = createLandingAid(this);
  }

  update(_time, delta) {
    const player = this.world.ships[0];
    this.pilot.update(player.intent);
    const steps = consumeSteps(this.clock, delta / 1000);
    for (let i = 0; i < steps; i++) step(this.world, FIXED_DT);

    // Rendu immédiat : on efface et on redessine tout depuis l'état du core.
    this.cameras.main.centerOn(player.pos.x, player.pos.y); // bornée à la carte (setBounds)
    this.gfx.clear();
    this.gfx.lineStyle(1, PALETTE.border, 1);
    this.gfx.strokeRect(0, 0, this.world.width, this.world.height);
    for (const planet of this.world.planets) drawPlanet(this.gfx, planet);
    drawShip(this.gfx, player, PALETTE.ok);

    this.landingAid.update(this.world, player);
    this.healthBar.update(player);
    this.debug.update(this.world, player);

    // Les événements (sons, effets) seront lus ici à partir de la phase 3, puis la file est vidée.
    clearEvents(this.world.events);
  }
}
