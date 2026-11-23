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

// Au doigt : les libellés des boutons de l'overlay (`data/touchLayout.js`, `systems/pauseButtons`).
export const CONTROLS_TOUCH = [
  { keys: '◄ ►', action: 'Tourner' },
  { keys: '▲', action: 'Poussée' },
  { keys: 'TIR', action: 'Tir principal' },
  { keys: 'MIS', action: 'Missile' },
  { keys: 'II', action: 'Pause' },
  { keys: 'SON', action: 'Son on/off' },
];

/** Lignes d'aide alignées en colonnes : « ESPACE   Tir principal ». `touch` : la liste des gestes au doigt. */
export function controlsLines(touch = false) {
  const list = touch ? CONTROLS_TOUCH : CONTROLS;
  const width = Math.max(...list.map((c) => c.keys.length));
  return list.map((c) => `${c.keys.padEnd(width)}  ${c.action}`);
}
