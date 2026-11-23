// Overlay de debug (touche F3) : FPS, vitesse, position, tick, événements perdus, mode et cible des bots.
// Lecture seule de `world` ; ne s'actualise que lorsqu'il est visible.
import Phaser from 'phaser';
import { PALETTE } from '../config.js';
import { toCss } from './color.js';
import { AI_MODE } from '../core/ai/mode.js';

const MODE_NAMES = Object.fromEntries(Object.entries(AI_MODE).map(([name, id]) => [id, name]));

export function createDebugOverlay(scene) {
  const text = scene.add
    .text(4, 4, '', { fontFamily: 'monospace', fontSize: '8px', color: toCss(PALETTE.star) })
    .setScrollFactor(0) // collé à l'écran, pas au monde
    .setDepth(1000)
    .setVisible(false);

  const keyboard = scene.input.keyboard;
  keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.F3); // évite la recherche du navigateur
  const toggle = () => text.setVisible(!text.visible);
  keyboard.on('keydown-F3', toggle);
  scene.events.once('shutdown', () => keyboard.off('keydown-F3', toggle));

  return {
    update(world, ship) {
      if (!text.visible) return;
      const speed = Math.hypot(ship.vel.x, ship.vel.y);
      text.setText(
        [
          `FPS ${Math.round(scene.game.loop.actualFps)}  tick ${world.tick}`,
          `pos ${ship.pos.x.toFixed(0)}, ${ship.pos.y.toFixed(0)}`,
          `vitesse ${speed.toFixed(1)}  angle ${((ship.angle * 180) / Math.PI).toFixed(0)}°`,
          `événements perdus ${world.events.dropped}`,
          ...world.ai.map((bot) => {
            const target = bot.target >= 0 ? ` -> ${bot.target}` : '';
            return `bot ${bot.faction} ${MODE_NAMES[bot.mode]}${target}  ${bot.modeTime.toFixed(0)}s`;
          }),
        ].join('\n'),
      );
    },
  };
}
