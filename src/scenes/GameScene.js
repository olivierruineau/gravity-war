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
import { drawProjectiles } from '../entities/projectileView.js';
import { drawShip } from '../entities/shipView.js';
import { createAudioEvents } from '../systems/audioEvents.js';
import { createDebugOverlay } from '../systems/debugOverlay.js';
import { createEffects } from '../systems/effects.js';
import { createGravityArrow } from '../systems/gravityArrow.js';
import { createHud } from '../systems/hud.js';
import { createLandingAid } from '../systems/landingAid.js';
import { createKeyboardInput } from '../systems/keyboardInput.js';
import { createStarfield } from '../systems/starfield.js';

/** Factions pilotées par l'IA (ADR 0006) ; la faction 0 est le joueur. */
const BOT_FACTIONS = [1, 2];

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
    this.world = createWorld(arena, seed, { eventCapacity: EVENT_CAPACITY, bots: BOT_FACTIONS });
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
    this.hud = createHud(this);
    this.landingAid = createLandingAid(this);
    this.effects = createEffects(this);
    this.audio = createAudioEvents();
    this.gravityArrow = createGravityArrow(this);
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
    const { planets } = this.world;
    for (let i = 0; i < planets.length; i++) drawPlanet(this.gfx, planets[i]);
    drawProjectiles(this.gfx, this.world.projectiles);
    const { ships } = this.world;
    for (let i = 0; i < ships.length; i++)
      drawShip(this.gfx, ships[i], PALETTE.factions[ships[i].faction]);

    this.gravityArrow.update(this.world, player);
    this.landingAid.update(this.world, player);
    const faction = this.world.factions[player.faction];
    this.hud.update(player, faction);
    this.debug.update(this.world, player);

    this.audio.handle(this.world.events, player.pos);
    this.audio.updateThrust(player, delta / 1000);
    this.effects.handle(this.world.events);
    this.effects.update(delta / 1000);

    // Les événements ont été lus par l'audio et les effets : on vide la file pour la frame suivante.
    clearEvents(this.world.events);
  }
}
