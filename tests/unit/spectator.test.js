import { describe, expect, it } from 'vitest';
import { nextFollowed, followedLabel } from '../../src/systems/spectator.js';
import { endScreenModel } from '../../src/systems/endScreenModel.js';
import { OUTCOME } from '../../src/core/faction.js';
import { controlsLines } from '../../src/data/controls.js';

const world = (eliminated, inGame = [true, true, true]) => ({
  inGame,
  factions: eliminated.map((e) => ({ eliminated: e })),
});

describe('observation : bot suivi', () => {
  it('passe au suivant et au précédent, en boucle', () => {
    const w = world([false, false, false]);
    expect(nextFollowed(w, 0, 1)).toBe(1);
    expect(nextFollowed(w, 2, 1)).toBe(0);
    expect(nextFollowed(w, 0, -1)).toBe(2);
    expect(nextFollowed(w, 1, -1)).toBe(0);
  });

  it('saute les factions éliminées ou hors jeu', () => {
    expect(nextFollowed(world([false, true, false]), 0, 1)).toBe(2);
    expect(nextFollowed(world([false, false, false], [true, false, true]), 0, 1)).toBe(2);
  });

  it('reste sur place s’il n’y a personne d’autre', () => {
    expect(nextFollowed(world([false, true, true]), 0, 1)).toBe(0);
  });

  it('un libellé par faction', () => {
    expect([0, 1, 2].map(followedLabel)).toEqual(['BOT VERT', 'BOT ROUGE', 'BOT BLEU']);
  });
});

describe('observation : textes', () => {
  it('l’aide ne parle que du changement de bot, de la pause et du son', () => {
    const keys = controlsLines(false, true).join('\n');
    expect(keys).toContain('Changer de bot');
    expect(keys).not.toMatch(/Tir|Missile|Poussée/);
    expect(controlsLines(true, true).join('\n')).not.toMatch(/TIR|MIS|▲/);
  });

  it('l’écran de fin d’observation ne parle ni de victoire ni de défaite', () => {
    expect(endScreenModel(OUTCOME.OVER).title).toBe('FIN DE PARTIE');
  });
});
