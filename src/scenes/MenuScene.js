import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';
import { toCss } from '../systems/color.js';
import { applyRenderScale } from '../systems/renderScale.js';
import { createMuteKey } from '../systems/muteKey.js';
import { createNavigation, watchSource } from '../systems/navigation.js';
import { createButton } from '../systems/uiButton.js';
import { createOptionsPanel } from '../systems/optionsPanel.js';
import { canFullscreen, enterFullscreen } from '../systems/platform.js';
import { playSfx, resumeAudio } from '../audio/sfx.js';
import { controlsLines } from '../data/controls.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.MENU);
  }

  create() {
    applyRenderScale(this);
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT * 0.2, 'GRAVITY WAR', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: toCss(PALETTE.accent),
      })
      .setOrigin(0.5);
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    // Clavier : invites textuelles (ESPACE, H). Tactile : boutons JOUER / COMMANDES. Un seul jeu s'affiche à la fois.
    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.78, 'ESPACE : JOUER', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    const helpHint = this.add
      .text(cx, GAME_HEIGHT * 0.88, 'H : COMMANDES   O : OPTIONS   B : OBSERVER', {
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
    const toggleHelp = () => help.setVisible(!help.visible);

    let started = false;
    const play = (spectator = false) => {
      if (started || options.isBlocking()) return;
      started = true;
      resumeAudio();
      playSfx('select');
      this.scene.start(SCENES.GAME, { spectator });
    };
    const playButton = createButton(this, {
      x: cx - 150,
      y: GAME_HEIGHT * 0.77,
      w: 92,
      h: 40,
      label: 'JOUER',
      fontSize: 14,
      color: PALETTE.accent,
      onTap: () => play(),
    });
    const helpButton = createButton(this, {
      x: cx - 50,
      y: GAME_HEIGHT * 0.77,
      w: 92,
      h: 40,
      label: 'COMMANDES',
      fontSize: 9,
      onTap: toggleHelp,
    });
    const optionsButton = createButton(this, {
      x: cx + 50,
      y: GAME_HEIGHT * 0.77,
      w: 92,
      h: 40,
      label: 'OPTIONS',
      fontSize: 9,
      onTap: () => options.open(),
    });
    const spectateButton = createButton(this, {
      x: cx + 150,
      y: GAME_HEIGHT * 0.77,
      w: 92,
      h: 40,
      label: 'OBSERVER',
      fontSize: 9,
      onTap: () => play(true),
    });
    watchSource(this, (touch) => {
      prompt.setVisible(!touch);
      helpHint.setVisible(!touch);
      playButton.setVisible(touch);
      helpButton.setVisible(touch);
      optionsButton.setVisible(touch);
      spectateButton.setVisible(touch);
      help.setText(controlsLines(touch));
    });

    const mute = createMuteKey(this);
    if (canFullscreen(this)) {
      createButton(this, {
        x: GAME_WIDTH - 44,
        y: 26,
        w: 76,
        h: 24,
        label: 'PLEIN ECRAN',
        fontSize: 8,
        onTap: () => enterFullscreen(this),
      });
    }

    const options = createOptionsPanel(this, { onToggleSound: mute.refresh });
    const nav = createNavigation(this);
    nav.on('help', () => !options.isBlocking() && toggleHelp());
    nav.on('confirm', () => !options.isBlocking() && play());
    nav.on('spectate', () => !options.isBlocking() && play(true));
    nav.on('options', () => !options.isBlocking() && options.open());
  }
}
