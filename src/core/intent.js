// Intentions de pilotage : la seule interface entre un pilote (clavier ou IA) et un vaisseau.
// Valeurs discrètes pour tous : un bot n'a pas plus de contrôle que le joueur (ADR 0002).

/** @typedef {{ rotate: -1 | 0 | 1, thrust: boolean, fire: boolean, missile: boolean }} Intent */

export function createIntent() {
  return { rotate: 0, thrust: false, fire: false, missile: false };
}

export function resetIntent(intent) {
  intent.rotate = 0;
  intent.thrust = false;
  intent.fire = false;
  intent.missile = false;
}
