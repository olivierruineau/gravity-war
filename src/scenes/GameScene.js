import Phaser from 'phaser';
import { EVENT_CAPACITY, FIXED_DT, MAX_FRAME_DT, MAX_STEPS_PER_FRAME, SCENES } from '../config.js';
import { clearEvents } from '../core/events.js';
import { consumeSteps, createClock } from '../core/clock.js';
import { createWorld, step } from '../core/world.js';
import { arena } from '../data/maps/arena.js';

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
  }

  update(_time, delta) {
    const steps = consumeSteps(this.clock, delta / 1000);
    for (let i = 0; i < steps; i++) step(this.world, FIXED_DT);
    // Rendu et lecture des événements viendront ici (items 1.5+), puis on vide la file.
    clearEvents(this.world.events);
  }
}
