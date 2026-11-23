// Table de correspondance des actions de navigation (ADR 0008) : action logique → touches du clavier.
// Les scènes ne connaissent que les actions ; une manette ajoutera une colonne ici, pas du code dans les scènes.
// Noms de touches : ceux de Phaser (`keydown-<NOM>`).

/** Actions ponctuelles de navigation (par opposition au pilotage, qui est un état maintenu). */
export const NAV_ACTIONS = ['confirm', 'back', 'pause', 'mute', 'help'];

export const NAV_KEYS = {
  confirm: ['SPACE'], // valider : jouer, rejouer
  back: ['ESC'], // retour : menu
  pause: ['P'],
  mute: ['M'],
  help: ['H'],
};
