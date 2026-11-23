// Commandes du jeu : source unique pour l'aide du menu et l'écran de pause (6.5).
// `keyboardInput.js` implémente ces touches ; garder les deux alignés.
export const CONTROLS = [
  { keys: '← →', action: 'Tourner' },
  { keys: '↑', action: 'Poussée' },
  { keys: 'ESPACE', action: 'Tir principal' },
  { keys: 'CTRL', action: 'Missile' },
  { keys: 'P', action: 'Pause' },
  { keys: 'M', action: 'Son on/off' },
  { keys: 'F3', action: 'Debug' },
];

/** Lignes d'aide alignées en colonnes : « ESPACE   Tir principal ». */
export function controlsLines() {
  const width = Math.max(...CONTROLS.map((c) => c.keys.length));
  return CONTROLS.map((c) => `${c.keys.padEnd(width)}  ${c.action}`);
}
