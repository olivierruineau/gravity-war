import { describe, expect, it } from 'vitest';
import { GLOW_ALPHA, GLOW_WIDTH, PALETTE } from '../../src/config.js';
import { toCss } from '../../src/systems/color.js';

describe('toCss', () => {
  it('convertit un entier 0xRRGGBB en #rrggbb, zéros de tête compris', () => {
    expect(toCss(0xffcc33)).toBe('#ffcc33');
    expect(toCss(0x0b0b14)).toBe('#0b0b14');
    expect(toCss(0)).toBe('#000000');
  });

  it('toute la palette donne une chaîne CSS valide', () => {
    const colors = [...Object.values(PALETTE).flat()].filter((v) => typeof v === 'number');
    expect(colors.length).toBeGreaterThan(8);
    for (const c of colors) expect(toCss(c)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('lueur filaire', () => {
  it('halo plus large que le trait net (1 px) et plus discret que lui', () => {
    expect(GLOW_WIDTH).toBeGreaterThan(1);
    expect(GLOW_ALPHA).toBeGreaterThan(0);
    expect(GLOW_ALPHA).toBeLessThan(0.5);
  });
});
