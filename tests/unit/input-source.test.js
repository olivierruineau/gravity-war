import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOURCE,
  getSource,
  initInputSource,
  isTouch,
  onSourceChange,
  resetInputSource,
  setSource,
} from '../../src/systems/inputSource.js';

describe('dernière source d’entrée', () => {
  beforeEach(resetInputSource);

  it('démarre au clavier, au tactile si le pointeur principal est tactile', () => {
    expect(getSource()).toBe(SOURCE.KEYBOARD);
    initInputSource(true);
    expect(isTouch()).toBe(true);
    initInputSource(false);
    expect(isTouch()).toBe(false);
  });

  it('prévient les abonnés seulement quand la source change', () => {
    const fn = vi.fn();
    onSourceChange(fn);
    setSource(SOURCE.KEYBOARD);
    expect(fn).not.toHaveBeenCalled();
    setSource(SOURCE.TOUCH);
    setSource(SOURCE.TOUCH);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(SOURCE.TOUCH);
  });

  it('le désabonnement coupe les notifications', () => {
    const fn = vi.fn();
    const off = onSourceChange(fn);
    off();
    setSource(SOURCE.TOUCH);
    expect(fn).not.toHaveBeenCalled();
  });
});
