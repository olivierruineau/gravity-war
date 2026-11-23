// Modèle des commandes tactiles (8.4), pur : quels boutons sont tenus, et ce que ça donne en `Intent`.
// On lit l'état des pointeurs à chaque frame (position, enfoncé ou non) au lieu de suivre des événements :
// un doigt levé, perdu ou annulé (`touchcancel`) n'est plus `isDown`, son bouton se relâche tout seul,
// et glisser d'un bouton à l'autre fonctionne. Aucune allocation par frame.
import { HIT_MARGIN } from '../data/touchLayout.js';

/** Un état « tenu » par bouton, dans l'ordre de `buttons`. */
export function createPressed(buttons) {
  return buttons.map(() => false);
}

/** Bouton sous le point (x, y) : le plus proche du centre parmi ceux dont la zone de toucher le contient, sinon -1. */
export function buttonAt(buttons, x, y) {
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const dx = x - b.x;
    const dy = y - b.y;
    const d2 = dx * dx + dy * dy;
    const reach = b.r + HIT_MARGIN;
    if (d2 <= reach * reach && d2 < bestD2) {
      best = i;
      bestD2 = d2;
    }
  }
  return best;
}

/**
 * Recalcule `pressed` depuis les pointeurs (`{ isDown, x, y }`, coordonnées du jeu).
 * @returns {boolean} vrai si l'état d'au moins un bouton a changé (pour ne redessiner que si besoin)
 */
export function readPointers(buttons, pointers, pressed) {
  let changed = false;
  for (let i = 0; i < pressed.length; i++) {
    let held = false;
    for (let k = 0; k < pointers.length && !held; k++) {
      const p = pointers[k];
      held = p.isDown && buttonAt(buttons, p.x, p.y) === i;
    }
    if (held !== pressed[i]) changed = true;
    pressed[i] = held;
  }
  return changed;
}

/** Ajoute les boutons tenus à `intent` (OU logique ; rotation bornée à ±1) : le clavier a déjà écrit, le tactile complète. */
export function mergeTouchIntent(buttons, pressed, intent) {
  let rotate = intent.rotate;
  for (let i = 0; i < buttons.length; i++) {
    if (!pressed[i]) continue;
    const b = buttons[i];
    if (b.action === 'rotate') rotate += b.sign;
    else intent[b.action] = true;
  }
  intent.rotate = Math.max(-1, Math.min(1, rotate));
}
