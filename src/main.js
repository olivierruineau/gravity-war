import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ZZFX } from 'zzfx';
import { installAudioLifecycle } from './audio/lifecycle.js';
import { initInputSource } from './systems/inputSource.js';
import { hasCoarsePointer } from './systems/platform.js';

initInputSource(hasCoarsePointer());

// Service worker : seulement en production (en dev, il masquerait les changements du serveur Vite).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {}),
  );
}
installAudioLifecycle(ZZFX.audioContext, document);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: PALETTE.bg,
  pixelArt: true, // filtrage "nearest" : pixels nets
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene],
});
