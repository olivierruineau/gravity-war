// Disposition de l'écran de jeu (8.6), en pixels du jeu (480×270) : tout ce qui est fixé à l'écran est en HAUT,
// les deux coins du bas sont réservés aux pouces (voir `data/touchLayout.js`). Constantes pures, testées sans Phaser.
import { GAME_WIDTH } from '../config.js';
import { TOUCH_TARGET } from '../data/touchLayout.js';

export const MARGIN = 6;

/** Boutons tactiles du haut : pause puis son, côte à côte à gauche (centres). */
export const TOP_BUTTONS = {
  pause: { x: MARGIN + TOUCH_TARGET / 2, y: MARGIN + TOUCH_TARGET / 2 },
  sound: { x: MARGIN * 2 + TOUCH_TARGET * 1.5, y: MARGIN + TOUCH_TARGET / 2 },
};

/** Barres de vie, bouclier et missiles : à droite des boutons du haut. */
export const BARS = {
  x: MARGIN * 3 + TOUCH_TARGET * 2,
  y: MARGIN,
  width: 60,
  hpHeight: 5,
  shieldHeight: 3,
  gap: 2,
  tick: 4, // côté d'un carré de stock de missiles
  tickGap: 2,
};

/** Hauteur de la pile complète (vie + bouclier + missiles). */
export const BARS_HEIGHT = BARS.hpHeight + BARS.gap + BARS.shieldHeight + BARS.gap + BARS.tick;

export const MINIMAP = { maxW: 96, maxH: 64, x: GAME_WIDTH - MARGIN - 96, y: MARGIN };

/** Vitesse et indicateur de son coupé : juste à gauche de la minimap, alignés à droite. */
export const READOUT = { right: MINIMAP.x - MARGIN, y: MARGIN, lineHeight: 12 };

/** Taille minimale d'un texte du jeu (px du jeu) : 10 px sur 270 donnent ~13 px CSS sur un téléphone de 360 px de haut. */
export const MIN_FONT = 10;
