// Contenu de l'écran de fin (6.4), pur et testé sans Phaser.
import { PALETTE } from '../config.js';
import { OUTCOME } from '../core/faction.js';

/**
 * @param {boolean} touch vrai au doigt : les boutons remplacent la ligne de touches (`hint` vide)
 * @returns {{ title: string, color: string, hint: string } | null} `null` tant que la partie continue
 */
export function endScreenModel(outcome, touch = false) {
  const hint = touch ? '' : 'ESPACE : rejouer · ECHAP : menu';
  if (outcome === OUTCOME.VICTORY) return { title: 'VICTOIRE', color: PALETTE.ok, hint };
  if (outcome === OUTCOME.DEFEAT) return { title: 'DEFAITE', color: PALETTE.danger, hint };
  if (outcome === OUTCOME.OVER) return { title: 'FIN DE PARTIE', color: PALETTE.accent, hint };
  return null;
}
