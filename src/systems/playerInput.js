// Entrée du joueur (8.4) : fusionne toutes les sources de pilotage actives en même temps (ADR 0008 §1).
// Le clavier écrit l'intention, le tactile la complète ; seul point où Phaser écrit dans `world` (ADR 0002 §2).
import { createKeyboardInput } from './keyboardInput.js';
import { createTouchControls } from './touchControls.js';
import { isAssistActive } from './assistSetting.js';
import { applyLandingAssist } from './landingAssist.js';

export function createPlayerInput(scene) {
  const keyboard = createKeyboardInput(scene);
  const touch = createTouchControls(scene);
  return {
    /** `world` et `ship` : pour l'aide à la pose, qui lit l'état sans jamais l'écrire. */
    update(intent, world, ship) {
      keyboard.update(intent);
      touch.update(intent);
      if (isAssistActive()) applyLandingAssist(world, ship, intent);
    },
  };
}
