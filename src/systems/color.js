// Conversion d'une couleur de PALETTE (entier 0xRRGGBB) en chaîne CSS pour les textes Phaser (7.3) :
// la palette reste la seule source des couleurs.
export function toCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}
