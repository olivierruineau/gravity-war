import { describe, expect, it } from 'vitest';
import { edgeIndicator } from '../../src/systems/offscreenLayout.js';

// Cadre 480 × 270 centré en (300, 200) : x ∈ [60, 540], y ∈ [65, 335].
const view = { x: 60, y: 65, width: 480, height: 270 };
const out = { x: 0, y: 0, angle: 0 };
const INSET = 8;

describe('edgeIndicator', () => {
  it('cible dans le cadre : pas d indicateur', () => {
    expect(edgeIndicator(view, 300, 200, INSET, 0, out)).toBe(false);
    expect(edgeIndicator(view, 540, 335, INSET, 0, out)).toBe(false); // pile sur le bord = visible
  });

  it('cible juste hors cadre mais dans la marge de visibilité : pas d indicateur', () => {
    expect(edgeIndicator(view, 550, 200, INSET, 12, out)).toBe(false);
    expect(edgeIndicator(view, 560, 200, INSET, 12, out)).toBe(true);
  });

  it('cible à droite : flèche au bord droit réduit, angle 0', () => {
    expect(edgeIndicator(view, 2000, 200, INSET, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(540 - INSET, 9);
    expect(out.y).toBeCloseTo(200, 9);
    expect(out.angle).toBeCloseTo(0, 9);
  });

  it('cible au-dessus : flèche au bord haut réduit, angle -π/2', () => {
    expect(edgeIndicator(view, 300, -1000, INSET, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(300, 9);
    expect(out.y).toBeCloseTo(65 + INSET, 9);
    expect(out.angle).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('cible en diagonale : sur le bord du rectangle réduit, alignée sur la direction centre → cible', () => {
    expect(edgeIndicator(view, 5000, 3000, INSET, 0, out)).toBe(true);
    const onRight = Math.abs(out.x - (540 - INSET)) < 1e-6;
    const onBottom = Math.abs(out.y - (335 - INSET)) < 1e-6;
    expect(onRight || onBottom).toBe(true);
    expect(out.x).toBeLessThanOrEqual(540 - INSET + 1e-6);
    expect(out.y).toBeLessThanOrEqual(335 - INSET + 1e-6);
    // Même direction que le rayon centre → cible.
    expect(Math.atan2(out.y - 200, out.x - 300)).toBeCloseTo(Math.atan2(3000 - 200, 5000 - 300), 9);
  });

  it('cible exactement alignée sur un axe : pas de division par zéro', () => {
    expect(edgeIndicator(view, 300, 5000, INSET, 0, out)).toBe(true);
    expect(Number.isFinite(out.x + out.y + out.angle)).toBe(true);
    expect(out.y).toBeCloseTo(335 - INSET, 9);
  });
});
