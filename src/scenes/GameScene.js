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
import { OUTCOME } from '../core/faction.js';
import { createWorld, step } from '../core/world.js';
import { triad } from '../data/maps/triad.js';
import { drawPlanet } from '../entities/planetView.js';
import { drawProjectiles } from '../entities/projectileView.js';
import { drawShip } from '../entities/shipView.js';
import { createAudioEvents } from '../systems/audioEvents.js';
import { createEndScreen } from '../systems/endScreen.js';
import { createMuteKey } from '../systems/muteKey.js';
import { createDebugOverlay } from '../systems/debugOverlay.js';
import { createEffects } from '../systems/effects.js';
import { createGravityArrow } from '../systems/gravityArrow.js';
import { createHud } from '../systems/hud.js';
import { createMinimap } from '../systems/minimap.js';
import { createPauseScreen } from '../systems/pauseScreen.js';
import { createOffscreenIndicators } from '../systems/offscreenIndicators.js';
import { createLandingAid } from '../systems/landingAid.js';
import { createPlayerInput } from '../systems/playerInput.js';
import { createFrameMonitor, markAutoLow } from '../systems/quality.js';
import { createStarfield } from '../systems/starfield.js';

/** Délai (s) entre la fin de partie et l'écran de fin. */
const END_SCREEN_DELAY = 1.5;

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
    this.world = createWorld(triad, seed, { eventCapacity: EVENT_CAPACITY, bots: BOT_FACTIONS });
    this.clock = createClock({
      dt: FIXED_DT,
      maxFrameDt: MAX_FRAME_DT,
      maxSteps: MAX_STEPS_PER_FRAME,
    });
    this.pilot = createPlayerInput(this);
    createStarfield(this, this.world.width, this.world.height);
    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.gfx = this.add.graphics();
    this.debug = createDebugOverlay(this);
    createMuteKey(this);
    this.hud = createHud(this);
    this.minimap = createMinimap(this, this.world);
    this.offscreen = createOffscreenIndicators(this);
    this.endScreen = createEndScreen(this);
    this.pause = createPauseScreen(this, () => this.world.outcome === OUTCOME.PLAYING);
    this.endDelay = END_SCREEN_DELAY; // laisse voir l'explosion finale avant le bandeau
    this.frameMonitor = createFrameMonitor(markAutoLow);
    this.landingAid = createLandingAid(this);
    this.effects = createEffects(this);
    this.audio = createAudioEvents();
    this.gravityArrow = createGravityArrow(this);
  }

  update(_time, delta) {
    if (this.pause.paused) return; // tout est figé : ni simulation, ni entrées, ni effets
    this.frameMonitor.sample(delta / 1000);
    const player = this.world.ships[0];
    this.pilot.update(player.intent, this.world, player);
    const steps = consumeSteps(this.clock, delta / 1000);
    // Partie décidée : on fige la simulation (l'issue est écrite une seule fois par le core) après un court délai.
    const over = this.world.outcome !== OUTCOME.PLAYING;
    if (over) {
      this.endDelay -= delta / 1000;
      if (this.endDelay <= 0) this.endScreen.show(this.world.outcome);
    }
    if (!over || this.endDelay > 0) for (let i = 0; i < steps; i++) step(this.world, FIXED_DT);

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
    this.minimap.update();
    this.offscreen.update(this.world, player);
    this.debug.update(this.world, player);

    this.audio.handle(this.world.events, player.pos);
    this.audio.updateThrust(player, delta / 1000);
    this.effects.handle(this.world.events);
    this.effects.update(delta / 1000);

    // Les événements ont été lus par l'audio et les effets : on vide la file pour la frame suivante.
    clearEvents(this.world.events);
  }
}
