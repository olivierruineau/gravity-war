import { beforeEach, describe, expect, it } from 'vitest';
import { isMuted, resetMute, toggleMute } from '../../src/audio/mute.js';
import { CONTROLS } from '../../src/data/controls.js';

describe('sourdine', () => {
  beforeEach(resetMute);

  it('le son est actif au départ', () => {
    expect(isMuted()).toBe(false);
  });

  it('toggleMute bascule et retourne le nouvel état', () => {
    expect(toggleMute()).toBe(true);
    expect(isMuted()).toBe(true);
    expect(toggleMute()).toBe(false);
    expect(isMuted()).toBe(false);
  });

  it('la touche M est documentée dans les commandes', () => {
    expect(CONTROLS.some((c) => c.keys === 'M')).toBe(true);
  });
});
