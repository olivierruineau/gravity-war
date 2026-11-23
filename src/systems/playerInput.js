// Entrée du joueur (8.4) : fusionne toutes les sources de pilotage actives en même temps (ADR 0008 §1).
// Le clavier écrit l'intention, le tactile la complète ; seul point où Phaser écrit dans `world` (ADR 0002 §2).
import { createKeyboardInput } from './keyboardInput.js';
import { createTouchControls } from './touchControls.js';

export function createPlayerInput(scene) {
  const keyboard = createKeyboardInput(scene);
  const touch = createTouchControls(scene);
  return {
    update(intent) {
      keyboard.update(intent);
      touch.update(intent);
    },
  };
}
