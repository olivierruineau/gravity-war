import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE_MAX } from '../../src/config.js';
import { computeRenderScale, placeCamera, viewRect } from '../../src/systems/renderScale.js';
import { readPointers } from '../../src/systems/touchModel.js';

describe('facteur de rendu', () => {
  it('vise un pixel de canvas par pixel physique, entre 1 et le plafond', () => {
    expect(computeRenderScale(480, 270, 1)).toBe(1);
    expect(computeRenderScale(960, 540, 1)).toBe(2);
    expect(computeRenderScale(915, 412, 2.625)).toBe(RENDER_SCALE_MAX); // Pixel 7 : ~1900 px physiques → plafond
    expect(computeRenderScale(640, 360, 1)).toBe(1);
    expect(computeRenderScale(3840, 2160, 2)).toBe(RENDER_SCALE_MAX);
    expect(computeRenderScale(200, 100, 1)).toBe(1);
  });

  it('la hauteur limite la largeur utile (canvas 16:9 ajusté)', () => {
    // fenêtre très large mais basse : la largeur affichée est 16/9 de la hauteur
    expect(computeRenderScale(2000, 270, 1)).toBe(1);
  });
});

describe('caméra', () => {
  const cam = {
    scrollX: 0,
    scrollY: 0,
    setScroll(x, y) {
      this.scrollX = x;
      this.scrollY = y;
    },
  };

  it('centre sur le joueur et reste dans la carte', () => {
    placeCamera(cam, 1000, 700, 2400, 1350);
    expect([cam.scrollX, cam.scrollY]).toEqual([1000 - GAME_WIDTH / 2, 700 - GAME_HEIGHT / 2]);
    placeCamera(cam, 5, 5, 2400, 1350);
    expect([cam.scrollX, cam.scrollY]).toEqual([0, 0]);
    placeCamera(cam, 2399, 1349, 2400, 1350);
    expect([cam.scrollX, cam.scrollY]).toEqual([2400 - GAME_WIDTH, 1350 - GAME_HEIGHT]);
  });

  it('viewRect donne la zone visible en unités de jeu', () => {
    cam.scrollX = 100;
    cam.scrollY = 50;
    expect(viewRect(cam, {})).toEqual({ x: 100, y: 50, width: GAME_WIDTH, height: GAME_HEIGHT });
  });
});

describe('doigts à l’échelle du canvas', () => {
  it('les coordonnées du canvas sont ramenées en unités de jeu', () => {
    const buttons = [{ x: 100, y: 100, r: 20 }];
    const pressed = [false];
    const pointers = [{ isDown: true, x: 200, y: 200 }];
    expect(readPointers(buttons, pointers, pressed, 1)).toBe(false);
    expect(readPointers(buttons, pointers, pressed, 2)).toBe(true);
    expect(pressed).toEqual([true]);
  });
});
