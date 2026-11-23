import { describe, expect, it } from 'vitest';
import { createNavigation } from '../../src/systems/navigation.js';

/** Scène minimale : un émetteur d'événements clavier et un `events.once` inerte. */
function fakeScene() {
  const handlers = {};
  const on = (name, fn) => (handlers[name] ??= []).push(fn);
  const emit = (name, ...args) => (handlers[name] ?? []).forEach((fn) => fn(...args));
  return {
    emit,
    scene: { input: { keyboard: { on, off() {} }, on }, events: { once() {} } },
  };
}

describe('navigation : touches rejouées', () => {
  it('un même événement navigateur ne déclenche l’action qu’une fois', () => {
    const { scene, emit } = fakeScene();
    let calls = 0;
    createNavigation(scene).on('right', () => calls++);
    const event = { timeStamp: 1234 };
    emit('keydown-RIGHT', event);
    emit('keydown-RIGHT', event);
    emit('keydown-RIGHT', event);
    expect(calls).toBe(1);
    emit('keydown-RIGHT', { timeStamp: 1300 });
    expect(calls).toBe(2);
  });
});
