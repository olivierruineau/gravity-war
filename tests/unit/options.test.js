import { beforeEach, describe, expect, it } from 'vitest';
import { resetMute, isMuted } from '../../src/audio/mute.js';
import { cycleValue } from '../../src/systems/cycleValue.js';
import {
  DIFFICULTY_LABELS,
  cycleDifficultyMode,
  getDifficultyMode,
  resetDifficultyMode,
  resolveDifficulty,
} from '../../src/systems/difficultySetting.js';
import { DIFFICULTY_LEVELS } from '../../src/data/ai.js';
import { createOptionsModel } from '../../src/systems/optionsModel.js';
import { buildOptionRows } from '../../src/systems/optionsPanel.js';
import {
  cycleAssistMode,
  getAssistMode,
  resetAssistMode,
} from '../../src/systems/assistSetting.js';
import { cycleQualityMode, getQualityMode, resetQuality } from '../../src/systems/quality.js';

describe('cycleValue', () => {
  it('avance et recule en boucle', () => {
    const list = ['a', 'b', 'c'];
    expect(cycleValue(list, 'a', 1)).toBe('b');
    expect(cycleValue(list, 'c', 1)).toBe('a');
    expect(cycleValue(list, 'a', -1)).toBe('c');
    expect(cycleValue(list, 'b')).toBe('c');
  });
});

describe('réglage de difficulté', () => {
  beforeEach(resetDifficultyMode);

  it('normal par défaut, cycle dans les deux sens', () => {
    expect(getDifficultyMode()).toBe('normal');
    expect(resolveDifficulty()).toBe('normal');
    expect(cycleDifficultyMode()).toBe('hard');
    expect(cycleDifficultyMode()).toBe('easy');
    expect(cycleDifficultyMode(-1)).toBe('hard');
  });

  it('un libellé par niveau', () => {
    for (const level of DIFFICULTY_LEVELS) expect(DIFFICULTY_LABELS[level]).toBeTruthy();
  });
});

describe('modèle de l’écran d’options', () => {
  function rows() {
    const log = [];
    const model = createOptionsModel([
      { id: 'a', label: () => 'A', change: (d) => log.push(['a', d]) },
      { id: 'b', label: () => 'B', activate: () => log.push(['b']) },
    ]);
    return { model, log };
  }

  it('la sélection est circulaire', () => {
    const { model } = rows();
    model.move(1);
    expect(model.selected).toBe(1);
    model.move(1);
    expect(model.selected).toBe(0);
    model.move(-1);
    expect(model.selected).toBe(1);
    model.select(0);
    model.select(9); // hors liste : ignoré
    expect(model.selected).toBe(0);
  });

  it('change règle une valeur, confirm règle ou lance l’action', () => {
    const { model, log } = rows();
    model.change(-1);
    model.confirm();
    model.move(1);
    model.change(1); // ligne d'action : sans effet
    model.confirm();
    expect(log).toEqual([['a', -1], ['a', 1], ['b']]);
  });

  it('labels() suit les valeurs courantes', () => {
    expect(rows().model.labels()).toEqual(['A', 'B']);
  });
});

describe('lignes réelles des options', () => {
  beforeEach(() => {
    resetDifficultyMode();
    resetAssistMode();
    resetQuality();
    resetMute();
  });
  const scene = { scale: { fullscreen: { available: false } } };

  it('contient les réglages attendus, sans plein écran quand il est indisponible', () => {
    const ids = buildOptionRows(scene, { onControls() {} }).map((r) => r.id);
    expect(ids).toEqual(['difficulty', 'assist', 'quality', 'sound', 'controls']);
    const withFs = { scale: { fullscreen: { available: true } } };
    expect(buildOptionRows(withFs, { onControls() {} }).map((r) => r.id)).toContain('fullscreen');
  });

  it('chaque ligne agit sur son réglage', () => {
    const model = createOptionsModel(buildOptionRows(scene, { onControls() {} }));
    model.change(1);
    expect(getDifficultyMode()).toBe('hard');
    model.move(1);
    model.change(1);
    expect(getAssistMode()).not.toBe('auto');
    model.move(1);
    model.change(1);
    expect(getQualityMode()).not.toBe('auto');
    model.move(1);
    model.change(1);
    expect(isMuted()).toBe(true);
    expect(model.labels()[3]).toContain('COUPE');
    cycleAssistMode(-1);
    cycleQualityMode(-1);
  });
});
