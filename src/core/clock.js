// Accumulateur à pas fixe : transforme le temps réel écoulé en nombre de pas de simulation.
// Module "feuille" : les paramètres sont injectés (voir ADR 0002), il n'importe rien du projet.

/**
 * @param {{ dt: number, maxFrameDt: number, maxSteps: number }} options
 *   dt : durée d'un pas · maxFrameDt : plafond du temps d'une frame · maxSteps : pas max par frame
 */
export function createClock({ dt, maxFrameDt, maxSteps }) {
  return { acc: 0, dt, maxFrameDt, maxSteps };
}

// Tolère l'erreur d'arrondi flottante (ex. 60 frames de 1/60 s doivent donner 60 pas, pas 59).
const EPSILON = 1e-9;

/**
 * Ajoute le temps de la frame et retourne le nombre de pas à exécuter.
 * Si le retard dépasse `maxSteps`, l'arriéré est jeté : le jeu ralentit au lieu de spiraler.
 */
export function consumeSteps(clock, frameSeconds) {
  // Une frame non numérique (NaN/Infinity) est ignorée : sinon `acc` serait corrompu pour toute la partie.
  if (!Number.isFinite(frameSeconds)) frameSeconds = 0;
  clock.acc += Math.min(Math.max(frameSeconds, 0), clock.maxFrameDt);
  const steps = Math.floor(clock.acc / clock.dt + EPSILON);
  if (steps > clock.maxSteps) {
    clock.acc = 0;
    return clock.maxSteps;
  }
  clock.acc = Math.max(0, clock.acc - steps * clock.dt);
  return steps;
}
