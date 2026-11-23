// Navigation (8.3) : traduit les entrées (clavier, tactile) en actions logiques `confirm`, `back`, `pause`, `mute`, `help`.
// Les scènes s'abonnent aux actions, jamais aux touches. Met aussi à jour la dernière source utilisée.
import { NAV_ACTIONS, NAV_KEYS } from '../data/inputBindings.js';
import { SOURCE, isTouch, onSourceChange, setSource } from './inputSource.js';

/**
 * @param {Phaser.Scene} scene
 * @returns {{ on: (action: string, handler: () => void) => void }} `on` ajoute un gestionnaire d'action
 */
export function createNavigation(scene) {
  const { keyboard } = scene.input;
  const bound = []; // [événement, fonction] pour tout retirer à l'arrêt de la scène

  const bind = (target, event, fn) => {
    target.on(event, fn);
    bound.push([target, event, fn]);
  };
  const onKey = () => setSource(SOURCE.KEYBOARD);
  const onPointer = (pointer) => {
    if (pointer.wasTouch) setSource(SOURCE.TOUCH);
  };
  bind(keyboard, 'keydown', onKey);
  bind(scene.input, 'pointerdown', onPointer);
  scene.events.once('shutdown', () => {
    for (const [target, event, fn] of bound) target.off(event, fn);
  });

  return {
    on(action, handler) {
      if (!NAV_ACTIONS.includes(action))
        throw new Error(`Action de navigation inconnue : ${action}`);
      for (const key of NAV_KEYS[action]) bind(keyboard, `keydown-${key}`, handler);
    },
  };
}

/**
 * Appelle `apply(touch)` tout de suite puis à chaque changement de dernière source utilisée
 * (vrai = tactile). Retiré à l'arrêt de la scène.
 */
export function watchSource(scene, apply) {
  apply(isTouch());
  const off = onSourceChange(() => apply(isTouch()));
  scene.events.once('shutdown', off);
}
