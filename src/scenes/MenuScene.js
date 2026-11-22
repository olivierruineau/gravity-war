import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';
import { playSfx, resumeAudio } from '../audio/sfx.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.MENU);
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT * 0.4, 'GRAVITY WAR', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffcc33',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.7, 'PRESS SPACE', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    this.input.keyboard.once('keydown-SPACE', () => {
      resumeAudio();
      playSfx('select');
      this.scene.start(SCENES.GAME);
    });
  }
}
