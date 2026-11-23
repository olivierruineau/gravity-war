import { describe, expect, it } from 'vitest';
import { NAV_ACTIONS, NAV_KEYS } from '../../src/data/inputBindings.js';

describe('table de navigation', () => {
  it('chaque action a au moins une touche, et rien d’autre n’est déclaré', () => {
    expect(Object.keys(NAV_KEYS).sort()).toEqual([...NAV_ACTIONS].sort());
    for (const action of NAV_ACTIONS) expect(NAV_KEYS[action].length).toBeGreaterThan(0);
  });

  it('aucune touche ne déclenche deux actions', () => {
    const all = NAV_ACTIONS.flatMap((a) => NAV_KEYS[a]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('garde les touches de la v1 (plus les réglages du menu, ajoutés en 8.7 et 8.9) (non-régression clavier)', () => {
    expect(NAV_KEYS).toEqual({
      confirm: ['SPACE'],
      back: ['ESC'],
      pause: ['P'],
      mute: ['M'],
      help: ['H'],
      assist: ['A'],
      quality: ['Q'],
    });
  });
});
