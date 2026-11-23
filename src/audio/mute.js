// État de sourdine (touche M), partagé par toutes les scènes et testable sans AudioContext.
let muted = false;

export const isMuted = () => muted;

/** Bascule la sourdine et retourne le nouvel état. */
export function toggleMute() {
  muted = !muted;
  return muted;
}

/** Remise à zéro (tests). */
export function resetMute() {
  muted = false;
}
