// Réglage de l'aide à la pose (8.7) : auto (active au tactile seulement), oui, non. Mémorisé si le navigateur le permet.
import { isTouch } from './inputSource.js';

export const ASSIST_MODES = ['auto', 'on', 'off'];
const KEY = 'gravity-war.assist';

function load() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return ASSIST_MODES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto'; // stockage indisponible (navigation privée, politique du navigateur)
  }
}

let mode = load();

export const getAssistMode = () => mode;

/** Passe au mode suivant (auto → oui → non) et le retient. */
export function cycleAssistMode() {
  mode = ASSIST_MODES[(ASSIST_MODES.indexOf(mode) + 1) % ASSIST_MODES.length];
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // pas grave : le réglage vaut pour la session
  }
  return mode;
}

/** L'aide est-elle active maintenant ? « auto » suit la dernière source utilisée. */
export const isAssistActive = () => mode === 'on' || (mode === 'auto' && isTouch());

export const ASSIST_LABELS = { auto: 'AUTO', on: 'OUI', off: 'NON' };

/** Remise à zéro (tests). */
export function resetAssistMode() {
  mode = 'auto';
}
