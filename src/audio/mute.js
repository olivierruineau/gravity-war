// État de sourdine (touche M), partagé par toutes les scènes et testable sans AudioContext.
// Mémorisé si le navigateur le permet (9.3 : toutes les options persistent).
const KEY = 'gravity-war.muted';

function load() {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let muted = load();

export const isMuted = () => muted;

/** Bascule la sourdine et retourne le nouvel état. */
export function toggleMute() {
  muted = !muted;
  try {
    globalThis.localStorage?.setItem(KEY, muted ? '1' : '0');
  } catch {
    // le réglage vaut pour la session
  }
  return muted;
}

/** Remise à zéro (tests). */
export function resetMute() {
  muted = false;
}
