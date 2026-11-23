import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';
import { toCss } from '../systems/color.js';
import { createMuteKey } from '../systems/muteKey.js';
import { playSfx, resumeAudio } from '../audio/sfx.js';
import { controlsLines } from '../data/controls.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.MENU);
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT * 0.2, 'GRAVITY WAR', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: toCss(PALETTE.accent),
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.78, 'ESPACE : JOUER', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    // Aide des commandes : H affiche / masque le panneau.
    this.add
      .text(cx, GAME_HEIGHT * 0.88, 'H : COMMANDES', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: toCss(PALETTE.star),
      })
      .setOrigin(0.5);
    const help = this.add
      .text(cx, GAME_HEIGHT * 0.48, controlsLines(), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: toCss(PALETTE.text),
        backgroundColor: toCss(PALETTE.bg),
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    createMuteKey(this);
    const toggleHelp = () => help.setVisible(!help.visible);
    this.input.keyboard.on('keydown-H', toggleHelp);
    this.events.once('shutdown', () => this.input.keyboard.off('keydown-H', toggleHelp));

    this.input.keyboard.once('keydown-SPACE', () => {
      resumeAudio();
      playSfx('select');
      this.scene.start(SCENES.GAME);
    });
  }
}
