// Disposition des commandes tactiles (ADR 0008 §3), en pixels du jeu (480×270). Paysage seul.
// Boutons ronds : `r` = rayon dessiné (≥ 20 px, soit 40 px de diamètre), la zone de toucher dépasse de `HIT_MARGIN`.
// Gauche : rotation (pouce gauche). Droite : poussée, tir, missile (pouce droit).

export const HIT_MARGIN = 4;

/** `action` : champ de l'`Intent` piloté ; `sign` : sens pour `rotate`. */
export const TOUCH_BUTTONS = [
  { id: 'left', action: 'rotate', sign: -1, x: 34, y: 232, r: 22, label: '◄' },
  { id: 'right', action: 'rotate', sign: 1, x: 92, y: 232, r: 22, label: '►' },
  { id: 'thrust', action: 'thrust', sign: 1, x: 366, y: 236, r: 22, label: '▲' },
  { id: 'fire', action: 'fire', sign: 1, x: 430, y: 222, r: 26, label: 'TIR' },
  { id: 'missile', action: 'missile', sign: 1, x: 430, y: 160, r: 20, label: 'MIS' },
];
