import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/config.js';
import { TOUCH_BUTTONS, TOUCH_TARGET } from '../../src/data/touchLayout.js';
import {
  BARS,
  BARS_HEIGHT,
  MIN_FONT,
  MINIMAP,
  READOUT,
  TOP_BUTTONS,
} from '../../src/systems/hudLayout.js';
import { minimapSize } from '../../src/systems/minimapLayout.js';
import { triad } from '../../src/data/maps/triad.js';

const rect = (x, y, w, h) => ({ x, y, w, h });
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const centered = (c) =>
  rect(c.x - TOUCH_TARGET / 2, c.y - TOUCH_TARGET / 2, TOUCH_TARGET, TOUCH_TARGET);

const map = minimapSize(triad.width, triad.height, MINIMAP.maxW, MINIMAP.maxH);
const ui = {
  pause: centered(TOP_BUTTONS.pause),
  sound: centered(TOP_BUTTONS.sound),
  bars: rect(BARS.x, BARS.y, BARS.width, BARS_HEIGHT),
  minimap: rect(MINIMAP.x + MINIMAP.maxW - map.width, MINIMAP.y, map.width, map.height),
  readout: rect(READOUT.right - 70, READOUT.y, 70, 2 * READOUT.lineHeight),
};
const thumbs = TOUCH_BUTTONS.map((b) => rect(b.x - b.r, b.y - b.r, 2 * b.r, 2 * b.r));

describe('disposition du HUD', () => {
  it('rien de fixé à l’écran ne recouvre un bouton de jeu (zone des pouces)', () => {
    for (const [name, r] of Object.entries(ui))
      thumbs.forEach((t, i) => expect(hits(r, t), `${name} / ${TOUCH_BUTTONS[i].id}`).toBe(false));
  });

  it('les éléments du haut ne se chevauchent pas entre eux', () => {
    const names = Object.keys(ui);
    for (let i = 0; i < names.length; i++)
      for (let k = i + 1; k < names.length; k++)
        expect(hits(ui[names[i]], ui[names[k]]), `${names[i]} / ${names[k]}`).toBe(false);
  });

  it('tout reste dans l’écran de jeu', () => {
    for (const [name, r] of Object.entries(ui)) {
      expect(r.x, name).toBeGreaterThanOrEqual(0);
      expect(r.y, name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, name).toBeLessThanOrEqual(GAME_WIDTH);
      expect(r.y + r.h, name).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });

  it('police minimale de 10 px du jeu', () => {
    expect(MIN_FONT).toBeGreaterThanOrEqual(10);
  });
});
