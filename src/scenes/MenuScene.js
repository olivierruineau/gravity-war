import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';
import { toCss } from '../systems/color.js';
import { createMuteKey } from '../systems/muteKey.js';
import { createNavigation, watchSource } from '../systems/navigation.js';
import { createButton } from '../systems/uiButton.js';
import { createSettingRow } from '../systems/settingRow.js';
import { QUALITY_LABELS, cycleQualityMode, getQualityMode } from '../systems/quality.js';
import { canFullscreen, enterFullscreen } from '../systems/platform.js';
import { playSfx, resumeAudio } from '../audio/sfx.js';
import { controlsLines } from '../data/controls.js';
import { ASSIST_LABELS, cycleAssistMode, getAssistMode } from '../systems/assistSetting.js';

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
    const toggleHelp = () => help.setVisible(!help.visible);

    let started = false;
    const play = () => {
      if (started) return;
      started = true;
      resumeAudio();
      playSfx('select');
      this.scene.start(SCENES.GAME);
    };
    const playButton = createButton(this, {
      x: cx - 70,
      y: GAME_HEIGHT * 0.77,
      w: 120,
      h: 40,
      label: 'JOUER',
      fontSize: 14,
      color: PALETTE.accent,
      onTap: play,
    });
    const helpButton = createButton(this, {
      x: cx + 70,
      y: GAME_HEIGHT * 0.77,
      w: 120,
      h: 40,
      label: 'COMMANDES',
      onTap: toggleHelp,
    });
    const assistRow = createSettingRow(this, {
      x: cx - 110,
      y: GAME_HEIGHT * 0.92,
      w: 210,
      key: 'A',
      label: () => `AIDE POSE ${ASSIST_LABELS[getAssistMode()]}`,
      cycle: cycleAssistMode,
    });
    const qualityRow = createSettingRow(this, {
      x: cx + 110,
      y: GAME_HEIGHT * 0.92,
      w: 210,
      key: 'Q',
      label: () => `QUALITE ${QUALITY_LABELS[getQualityMode()]}`,
      cycle: cycleQualityMode,
    });
    watchSource(this, (touch) => {
      assistRow.showTouch(touch);
      qualityRow.showTouch(touch);
      prompt.setVisible(!touch);
      helpHint.setVisible(!touch);
      playButton.setVisible(touch);
      helpButton.setVisible(touch);
      help.setText(controlsLines(touch));
    });

    createMuteKey(this);
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

    const nav = createNavigation(this);
    nav.on('help', toggleHelp);
    nav.on('confirm', play);
    nav.on('assist', assistRow.cycle);
    nav.on('quality', qualityRow.cycle);
  }
}
