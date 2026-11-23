// Contenu de l'écran de fin (6.4), pur et testé sans Phaser.
import { PALETTE } from '../config.js';
import { OUTCOME } from '../core/faction.js';

/** @returns {{ title: string, color: string, hint: string } | null} `null` tant que la partie continue */
export function endScreenModel(outcome) {
  if (outcome === OUTCOME.VICTORY)
    return { title: 'VICTOIRE', color: PALETTE.ok, hint: 'ESPACE : rejouer · ECHAP : menu' };
  if (outcome === OUTCOME.DEFEAT)
    return { title: 'DEFAITE', color: PALETTE.danger, hint: 'ESPACE : rejouer · ECHAP : menu' };
  return null;
}
