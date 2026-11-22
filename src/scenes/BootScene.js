import Phaser from 'phaser';
import { SCENES } from '../config.js';

/** Chargement des assets puis passage au menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload() {
    // this.load.image('ship', 'assets/sprites/ship.png');
  }

  create() {
    this.scene.start(SCENES.MENU);
  }
}
