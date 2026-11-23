import { describe, expect, it } from 'vitest';
import { TOUCH_BUTTONS, HIT_MARGIN } from '../../src/data/touchLayout.js';
import { createIntent } from '../../src/core/intent.js';
import {
  buttonAt,
  createPressed,
  mergeTouchIntent,
  readPointers,
} from '../../src/systems/touchModel.js';

const index = (id) => TOUCH_BUTTONS.findIndex((b) => b.id === id);
const at = (id, dx = 0, dy = 0) => {
  const b = TOUCH_BUTTONS[index(id)];
  return { isDown: true, x: b.x + dx, y: b.y + dy };
};
const up = { isDown: false, x: 0, y: 0 };

describe('disposition tactile', () => {
  it('cibles d’au moins 40 px de diamètre, entièrement dans l’écran de 480×270', () => {
    for (const b of TOUCH_BUTTONS) {
      expect(b.r * 2).toBeGreaterThanOrEqual(40);
      expect(b.x - b.r).toBeGreaterThanOrEqual(0);
      expect(b.x + b.r).toBeLessThanOrEqual(480);
      expect(b.y - b.r).toBeGreaterThanOrEqual(0);
      expect(b.y + b.r).toBeLessThanOrEqual(270);
    }
  });

  it('les zones de toucher ne se chevauchent pas', () => {
    for (let i = 0; i < TOUCH_BUTTONS.length; i++)
      for (let k = i + 1; k < TOUCH_BUTTONS.length; k++) {
        const a = TOUCH_BUTTONS[i];
        const b = TOUCH_BUTTONS[k];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r + 2 * HIT_MARGIN);
        expect(gap).toBeGreaterThanOrEqual(0);
      }
  });

  it('couvre toutes les commandes de pilotage', () => {
    expect(new Set(TOUCH_BUTTONS.map((b) => b.action))).toEqual(
      new Set(['rotate', 'thrust', 'fire', 'missile']),
    );
  });
});

describe('buttonAt', () => {
  it('trouve le bouton au centre et dans la marge, aucun au-delà', () => {
    const b = TOUCH_BUTTONS[index('fire')];
    expect(buttonAt(TOUCH_BUTTONS, b.x, b.y)).toBe(index('fire'));
    expect(buttonAt(TOUCH_BUTTONS, b.x + b.r + HIT_MARGIN, b.y)).toBe(index('fire'));
    expect(buttonAt(TOUCH_BUTTONS, b.x + b.r + HIT_MARGIN + 1, b.y)).toBe(-1);
  });
});

describe('readPointers', () => {
  it('un doigt enfonce un bouton, et le relâche en se levant', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    expect(readPointers(TOUCH_BUTTONS, [at('thrust')], pressed)).toBe(true);
    expect(pressed[index('thrust')]).toBe(true);
    expect(readPointers(TOUCH_BUTTONS, [at('thrust')], pressed)).toBe(false); // inchangé
    expect(readPointers(TOUCH_BUTTONS, [up], pressed)).toBe(true);
    expect(pressed.some(Boolean)).toBe(false);
  });

  it('trois doigts : rotation, poussée et tir en même temps', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    readPointers(TOUCH_BUTTONS, [at('left'), at('thrust'), at('fire')], pressed);
    const intent = createIntent();
    mergeTouchIntent(TOUCH_BUTTONS, pressed, intent);
    expect(intent).toEqual({ rotate: -1, thrust: true, fire: true, missile: false });
  });

  it('un doigt qui glisse d’un bouton à l’autre change de bouton', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    const finger = at('left');
    readPointers(TOUCH_BUTTONS, [finger], pressed);
    Object.assign(finger, at('right'));
    readPointers(TOUCH_BUTTONS, [finger], pressed);
    expect(pressed[index('left')]).toBe(false);
    expect(pressed[index('right')]).toBe(true);
  });

  it('un doigt perdu ou annulé (isDown faux) relâche tout, même sur le bouton', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    readPointers(TOUCH_BUTTONS, [at('fire')], pressed);
    readPointers(TOUCH_BUTTONS, [{ ...at('fire'), isDown: false }], pressed);
    expect(pressed.some(Boolean)).toBe(false);
  });

  it('deux doigts sur le même bouton : il reste tenu tant qu’un doigt y est', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    const a = at('fire');
    const b = at('fire', 3);
    readPointers(TOUCH_BUTTONS, [a, b], pressed);
    a.isDown = false;
    readPointers(TOUCH_BUTTONS, [a, b], pressed);
    expect(pressed[index('fire')]).toBe(true);
  });

  it('un doigt hors de tout bouton ne fait rien', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    expect(readPointers(TOUCH_BUTTONS, [{ isDown: true, x: 240, y: 135 }], pressed)).toBe(false);
  });
});

describe('mergeTouchIntent', () => {
  it('complète l’intention du clavier sans l’effacer', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    readPointers(TOUCH_BUTTONS, [at('missile')], pressed);
    const intent = { rotate: 1, thrust: true, fire: false, missile: false };
    mergeTouchIntent(TOUCH_BUTTONS, pressed, intent);
    expect(intent).toEqual({ rotate: 1, thrust: true, fire: false, missile: true });
  });

  it('gauche et droite ensemble s’annulent ; clavier + tactile même sens restent à ±1', () => {
    const pressed = createPressed(TOUCH_BUTTONS);
    readPointers(TOUCH_BUTTONS, [at('left'), at('right')], pressed);
    const intent = createIntent();
    mergeTouchIntent(TOUCH_BUTTONS, pressed, intent);
    expect(intent.rotate).toBe(0);

    readPointers(TOUCH_BUTTONS, [at('right')], pressed);
    const both = { ...createIntent(), rotate: 1 };
    mergeTouchIntent(TOUCH_BUTTONS, pressed, both);
    expect(both.rotate).toBe(1);
  });
});
