import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUALITY_LOW_FPS, QUALITY_WARMUP, QUALITY_WINDOW } from '../../src/config.js';
import {
  QUALITY_MODES,
  createFrameMonitor,
  cycleQualityMode,
  getQualityMode,
  isGlowOn,
  markAutoLow,
  resetQuality,
} from '../../src/systems/quality.js';

const run = (monitor, fps, seconds) => {
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) monitor.sample(1 / fps);
};

describe('moniteur de cadence', () => {
  it('60 fps : jamais de dégradation', () => {
    const onLow = vi.fn();
    run(createFrameMonitor(onLow), 60, 30);
    expect(onLow).not.toHaveBeenCalled();
  });

  it('cadence trop basse : une seule alerte, après la chauffe et une fenêtre', () => {
    const onLow = vi.fn();
    const m = createFrameMonitor(onLow);
    run(m, QUALITY_LOW_FPS - 10, QUALITY_WARMUP + QUALITY_WINDOW - 0.5);
    expect(onLow).not.toHaveBeenCalled(); // pas encore une fenêtre complète
    run(m, QUALITY_LOW_FPS - 10, 10);
    expect(onLow).toHaveBeenCalledTimes(1);
  });

  it('ignore le temps de chauffe : un chargement lent ne dégrade pas', () => {
    const onLow = vi.fn();
    const m = createFrameMonitor(onLow);
    run(m, 10, QUALITY_WARMUP - 0.1);
    run(m, 60, 20);
    expect(onLow).not.toHaveBeenCalled();
  });

  it('une longue pause (onglet masqué) n’est pas une machine lente', () => {
    const onLow = vi.fn();
    const m = createFrameMonitor(onLow);
    run(m, 60, 5);
    m.sample(8);
    run(m, 60, 10);
    expect(onLow).not.toHaveBeenCalled();
  });

  it('une fenêtre lente isolée suivie d’une fenêtre saine ne dégrade que si la lente est complète', () => {
    const onLow = vi.fn();
    const m = createFrameMonitor(onLow, { warmup: 0, window: 1, lowFps: 40 });
    run(m, 30, 1.05);
    expect(onLow).toHaveBeenCalledTimes(1);
  });
});

describe('réglage de qualité', () => {
  beforeEach(resetQuality);

  it('auto : lueur tant que la cadence tient, puis coupée', () => {
    expect(isGlowOn()).toBe(true);
    markAutoLow();
    expect(isGlowOn()).toBe(false);
  });

  it('haute : lueur toujours ; basse : jamais, quelle que soit la cadence', () => {
    markAutoLow();
    expect(cycleQualityMode()).toBe('high');
    expect(isGlowOn()).toBe(true);
    expect(cycleQualityMode()).toBe('low');
    expect(isGlowOn()).toBe(false);
  });

  it('le cycle boucle sur tous les modes', () => {
    const seen = QUALITY_MODES.map(() => cycleQualityMode());
    expect(new Set(seen)).toEqual(new Set(QUALITY_MODES));
    expect(getQualityMode()).toBe('auto');
  });
});
