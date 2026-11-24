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
import { resolveDifficulty } from '../systems/difficultySetting.js';
import { applyRenderScale, placeCamera } from '../systems/renderScale.js';
import { createSpectatorControls } from '../systems/spectatorControls.js';
import { nextFollowed } from '../systems/spectator.js';
import { createMatchStats, recordEvents, summaryLines } from '../systems/matchStats.js';
import { planMatch } from '../systems/matchPlan.js';
import { MAP_LABELS, getBotCount, getMapMode, seedFromSearch } from '../systems/matchSettings.js';
import { createStarfield } from '../systems/starfield.js';

/** Délai (s) entre la fin de partie et l'écran de fin. */
const END_SCREEN_DELAY = 1.5;

/**
 * Scène de jeu. Rester MINCE : elle orchestre la boucle à pas fixe, l'entrée et le rendu ;
 * les règles de jeu vivent dans `src/core` (ADR 0002).
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME);
  }

  init(data) {
    this.spectator = Boolean(data?.spectator);
  }

  create() {
    applyRenderScale(this);
    // Graine tirée ici (couche Phaser) : le core, lui, reste déterministe pour une graine donnée. Elle fixe aussi la carte
    // générée ; `?seed=` dans l'adresse rejoue une carte.
    this.plan = planMatch({
      mapMode: getMapMode(),
      botCount: getBotCount(),
      spectator: this.spectator,
      seedParam: seedFromSearch(window.location.search),
      randomSeed: Math.floor(Math.random() * 2 ** 32),
    });
    this.world = createWorld(this.plan.map, this.plan.seed, {
      eventCapacity: EVENT_CAPACITY,
      bots: this.plan.bots,
      spectator: this.spectator,
      difficulty: resolveDifficulty(),
    });
    this.stats = createMatchStats();
    this.clock = createClock({
      dt: FIXED_DT,
      maxFrameDt: MAX_FRAME_DT,
      maxSteps: MAX_STEPS_PER_FRAME,
    });
    this.followed = 0; // faction suivie par la caméra (observation) ; 0 = le joueur
    if (this.spectator)
      this.spectate = createSpectatorControls(this, this.world, (f) => (this.followed = f));
    else this.pilot = createPlayerInput(this);
    createStarfield(this, this.world.width, this.world.height);
    this.gfx = this.add.graphics();
    this.debug = createDebugOverlay(this);
    this.mute = createMuteKey(this);
    this.hud = createHud(this);
    this.minimap = createMinimap(this, this.world);
    this.offscreen = createOffscreenIndicators(this);
    this.endScreen = createEndScreen(this);
    this.pause = createPauseScreen(
      this,
      () => this.world.outcome === OUTCOME.PLAYING,
      this.mute.refresh,
      this.spectator,
    );
    this.endDelay = END_SCREEN_DELAY; // laisse voir l'explosion finale avant le bandeau
    this.frameMonitor = createFrameMonitor(() => {
      markAutoLow();
      applyRenderScale(this);
    });
    this.landingAid = createLandingAid(this);
    this.effects = createEffects(this);
    this.audio = createAudioEvents();
    this.gravityArrow = createGravityArrow(this);
  }

  /** Lignes du résumé de fin de partie. */
  summary() {
    const mapLabel = MAP_LABELS[this.plan.mapMode];
    return summaryLines(this.stats, this.world, {
      mapLabel,
      seed: this.plan.seed,
      spectator: this.spectator,
    });
  }

  update(_time, delta) {
    if (this.pause.paused) return; // tout est figé : ni simulation, ni entrées, ni effets
    this.frameMonitor.sample(delta / 1000);
    if (this.spectator && this.world.factions[this.followed].eliminated)
      this.followed = nextFollowed(this.world, this.followed, 1);
    const player = this.world.ships[this.followed]; // le joueur, ou le bot suivi en observation
    if (!this.spectator) this.pilot.update(player.intent, this.world, player);
    else this.spectate.update(this.followed);
    const steps = consumeSteps(this.clock, delta / 1000);
    // Partie décidée : on fige la simulation (l'issue est écrite une seule fois par le core) après un court délai.
    const over = this.world.outcome !== OUTCOME.PLAYING;
    if (over) {
      this.endDelay -= delta / 1000;
      if (this.endDelay <= 0) this.endScreen.show(this.world.outcome, this.summary());
    }
    const simStart = performance.now();
    if (!over || this.endDelay > 0) for (let i = 0; i < steps; i++) step(this.world, FIXED_DT);
    const drawStart = performance.now();
    this.debug.recordSim(drawStart - simStart, steps);

    // Rendu immédiat : on efface et on redessine tout depuis l'état du core.
    placeCamera(this.cameras.main, player.pos.x, player.pos.y, this.world.width, this.world.height); // bornée à la carte
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
    this.debug.recordDraw(performance.now() - drawStart);
    this.debug.update(this.world, player);

    this.audio.handle(this.world.events, player.pos);
    this.audio.updateThrust(player, delta / 1000);
    recordEvents(this.stats, this.world.events);
    this.effects.handle(this.world.events);
    this.effects.update(delta / 1000);

    // Les événements ont été lus par l'audio et les effets : on vide la file pour la frame suivante.
    clearEvents(this.world.events);
  }
}
