// Mode debug (9.7) : affiche l'overlay (cadence, position, bots). Réglable dans les Options ou par F3 ; mémorisé.
const KEY = 'gravity-war.debug';

function load() {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let on = load();

export const isDebugOn = () => on;

/** Bascule le mode debug et retourne le nouvel état. */
export function toggleDebug() {
  on = !on;
  try {
    globalThis.localStorage?.setItem(KEY, on ? '1' : '0');
  } catch {
    // le réglage vaut pour la session
  }
  return on;
}

/** Remise à zéro (tests). */
export function resetDebug() {
  on = false;
}
