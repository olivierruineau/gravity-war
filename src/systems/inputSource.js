// Dernière source d'entrée utilisée (ADR 0008) : seule l'affichage s'y adapte (overlay, aide) ;
// toutes les sources restent actives. État partagé par les scènes, testable sans Phaser ni DOM.

export const SOURCE = { KEYBOARD: 'keyboard', TOUCH: 'touch' };

let current = SOURCE.KEYBOARD;
const listeners = new Set();

export const getSource = () => current;
export const isTouch = () => current === SOURCE.TOUCH;

/** Change de source ; prévient les abonnés seulement si elle change réellement. */
export function setSource(source) {
  if (source === current) return;
  current = source;
  for (const fn of listeners) fn(source);
}

/** Abonnement aux changements ; retourne la fonction de désabonnement. */
export function onSourceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Source de départ : tactile si le pointeur principal est tactile (un portable tactile démarre au clavier). */
export function initInputSource(coarsePointer) {
  current = coarsePointer ? SOURCE.TOUCH : SOURCE.KEYBOARD;
}

/** Remise à zéro (tests). */
export function resetInputSource() {
  current = SOURCE.KEYBOARD;
  listeners.clear();
}
