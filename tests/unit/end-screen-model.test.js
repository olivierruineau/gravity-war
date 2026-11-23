import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/config.js';
import { OUTCOME } from '../../src/core/faction.js';
import { endScreenModel } from '../../src/systems/endScreenModel.js';

describe('endScreenModel', () => {
  it('partie en cours : pas d écran de fin', () => {
    expect(endScreenModel(OUTCOME.PLAYING)).toBeNull();
  });

  it('victoire : titre vert, propose de rejouer ou de retourner au menu', () => {
    const m = endScreenModel(OUTCOME.VICTORY);
    expect(m.title).toBe('VICTOIRE');
    expect(m.color).toBe(PALETTE.ok);
    expect(m.hint).toContain('ESPACE');
    expect(m.hint).toContain('ECHAP');
  });

  it('défaite : titre rouge', () => {
    const m = endScreenModel(OUTCOME.DEFEAT);
    expect(m.title).toBe('DEFAITE');
    expect(m.color).toBe(PALETTE.danger);
  });
});
