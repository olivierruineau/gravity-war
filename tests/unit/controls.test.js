import { describe, expect, it } from 'vitest';
import { CONTROLS, CONTROLS_TOUCH, controlsLines } from '../../src/data/controls.js';

describe('controls', () => {
  it('chaque commande a des touches et une action non vides', () => {
    for (const c of CONTROLS) {
      expect(c.keys.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it('couvre les commandes de pilotage et la pause', () => {
    const keys = CONTROLS.map((c) => c.keys).join(' ');
    for (const k of ['←', '↑', 'ESPACE', 'CTRL', 'P']) expect(keys).toContain(k);
  });

  it('lignes alignées : une par commande, actions dans la même colonne', () => {
    const lines = controlsLines();
    expect(lines).toHaveLength(CONTROLS.length);
    const col = lines[0].indexOf(CONTROLS[0].action);
    lines.forEach((l, i) => expect(l.indexOf(CONTROLS[i].action)).toBe(col));
  });

  it('au doigt : gestes tactiles, sans touches du clavier', () => {
    const lines = controlsLines(true);
    expect(lines).toHaveLength(CONTROLS_TOUCH.length);
    const text = lines.join('\n');
    for (const label of ['TIR', 'MIS', 'II', 'SON']) expect(text).toContain(label);
    for (const key of ['ESPACE', 'CTRL', 'F3']) expect(text).not.toContain(key);
  });

  it('les deux aides décrivent les mêmes actions de pilotage', () => {
    const actions = (list) => list.map((c) => c.action).filter((a) => a !== 'Debug');
    expect(actions(CONTROLS_TOUCH)).toEqual(actions(CONTROLS));
  });
});
