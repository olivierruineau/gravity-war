import { describe, expect, it, vi } from 'vitest';
import { UNLOCK_EVENTS, installAudioLifecycle } from '../../src/audio/lifecycle.js';

function fakeDoc() {
  const handlers = new Map();
  return {
    hidden: false,
    handlers,
    addEventListener: (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    removeEventListener: (name, fn) =>
      handlers.set(
        name,
        (handlers.get(name) ?? []).filter((f) => f !== fn),
      ),
    fire: (name) => (handlers.get(name) ?? []).slice().forEach((fn) => fn()),
    count: (name) => (handlers.get(name) ?? []).length,
  };
}
function fakeCtx(state = 'suspended') {
  const ctx = {
    state,
    resume: vi.fn(() => {
      ctx.state = 'running';
    }),
    suspend: vi.fn(() => {
      ctx.state = 'suspended';
    }),
  };
  return ctx;
}

describe('cycle de vie de l’audio', () => {
  it('débloque au premier geste puis cesse d’écouter', () => {
    const doc = fakeDoc();
    const ctx = fakeCtx();
    installAudioLifecycle(ctx, doc);
    doc.fire('touchend');
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    for (const name of UNLOCK_EVENTS) expect(doc.count(name)).toBe(0);
  });

  it('un appui seul ne débloque pas iOS : il faut un relâchement (touchend, pointerup), un clic ou une touche', () => {
    expect(UNLOCK_EVENTS).toEqual(expect.arrayContaining(['touchend', 'pointerup', 'keydown']));
    expect(UNLOCK_EVENTS).not.toContain('touchstart');
    expect(UNLOCK_EVENTS).not.toContain('pointerdown');
  });

  it('reste à l’écoute si le navigateur refuse (contexte toujours suspendu)', () => {
    const doc = fakeDoc();
    const ctx = fakeCtx();
    ctx.resume = vi.fn(); // refus : l'état ne change pas
    installAudioLifecycle(ctx, doc);
    doc.fire('keydown');
    expect(doc.count('keydown')).toBe(1);
    ctx.state = 'running';
    doc.fire('keydown');
    expect(doc.count('keydown')).toBe(0);
  });

  it('suspend en arrière-plan, reprend et se réarme au retour', () => {
    const doc = fakeDoc();
    const ctx = fakeCtx('running');
    installAudioLifecycle(ctx, doc);
    doc.hidden = true;
    doc.fire('visibilitychange');
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    doc.fire('visibilitychange');
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running');
  });

  it('ne suspend pas un contexte qui n’a jamais démarré', () => {
    const doc = fakeDoc();
    const ctx = fakeCtx('suspended');
    installAudioLifecycle(ctx, doc);
    doc.hidden = true;
    doc.fire('visibilitychange');
    expect(ctx.suspend).not.toHaveBeenCalled();
  });

  it('le désabonnement retire tous les écouteurs', () => {
    const doc = fakeDoc();
    const off = installAudioLifecycle(fakeCtx(), doc);
    off();
    for (const name of [...UNLOCK_EVENTS, 'visibilitychange']) expect(doc.count(name)).toBe(0);
  });
});
