import Phaser from 'phaser';
import { SCENES } from '../config.js';

/**
 * Scène de jeu. Rester MINCE : elle orchestre les entités (src/entities),
 * les systèmes (src/systems) et la logique pure (src/core), sans porter de règles de jeu.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME);
  }

  create() {
    // À remplir avec les fonctionnalités du TODO.
  }

  update(_time, _delta) {}
}
