import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, TOUCH_POINTERS } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ZZFX } from 'zzfx';
import { installAudioLifecycle } from './audio/lifecycle.js';
import { initInputSource } from './systems/inputSource.js';
import { hasCoarsePointer } from './systems/platform.js';
import { currentRenderScale, installRenderPatches } from './systems/renderScale.js';

initInputSource(hasCoarsePointer());

// Service worker : seulement en production (en dev, il masquerait les changements du serveur Vite).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {}),
  );
}
installAudioLifecycle(ZZFX.audioContext, document);

const scaleAtBoot = currentRenderScale();
installRenderPatches(Phaser);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH * scaleAtBoot,
  height: GAME_HEIGHT * scaleAtBoot,
  backgroundColor: PALETTE.bg,
  antialias: true, // traits lissés (9.5) : le canvas est déjà à la résolution de l'écran
  roundPixels: false,
  input: { activePointers: TOUCH_POINTERS }, // + la souris : `manager.pointers[0]`
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene],
});

// Crochet de test (tests/e2e), absent du build de production.
if (import.meta.env.DEV) window.__game = game;
