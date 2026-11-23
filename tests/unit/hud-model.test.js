import { describe, expect, it } from 'vitest';
import { MISSILE_STOCK_MAX, SHIELD_MAX, SHIP_MAX_HP } from '../../src/config.js';
import { hudModel } from '../../src/systems/hudModel.js';

const ship = (over = {}) => ({
  alive: true,
  hp: SHIP_MAX_HP,
  shield: 0,
  missiles: 0,
  vel: { x: 0, y: 0 },
  ...over,
});
const faction = (over = {}) => ({ hasShield: false, hasMissiles: false, ...over });

describe('hudModel', () => {
  it('vie : ratio de SHIP_MAX_HP, borné à [0, 1]', () => {
    expect(hudModel(ship(), faction()).hpRatio).toBe(1);
    expect(hudModel(ship({ hp: SHIP_MAX_HP / 2 }), faction()).hpRatio).toBe(0.5);
    expect(hudModel(ship({ hp: -5 }), faction()).hpRatio).toBe(0);
    expect(hudModel(ship({ hp: SHIP_MAX_HP * 2 }), faction()).hpRatio).toBe(1);
  });

  it('bouclier : ratio de SHIELD_MAX, borné', () => {
    expect(hudModel(ship({ shield: SHIELD_MAX / 2 }), faction()).shieldRatio).toBe(0.5);
    expect(hudModel(ship({ shield: SHIELD_MAX * 3 }), faction()).shieldRatio).toBe(1);
    expect(hudModel(ship({ shield: -1 }), faction()).shieldRatio).toBe(0);
  });

  it('bouclier affiché si débloqué, ou s il en reste malgré la perte du bâtiment', () => {
    expect(hudModel(ship(), faction()).showShield).toBe(false);
    expect(hudModel(ship(), faction({ hasShield: true })).showShield).toBe(true);
    expect(hudModel(ship({ shield: 10 }), faction()).showShield).toBe(true);
  });

  it('missiles : affichés seulement si débloqués, stock recopié', () => {
    expect(hudModel(ship({ missiles: 2 }), faction()).showMissiles).toBe(false);
    const m = hudModel(ship({ missiles: MISSILE_STOCK_MAX }), faction({ hasMissiles: true }));
    expect(m.showMissiles).toBe(true);
    expect(m.missiles).toBe(MISSILE_STOCK_MAX);
  });

  it('vitesse : norme arrondie en px/s (3-4-5 → 5, 0 si mort)', () => {
    expect(hudModel(ship({ vel: { x: 3, y: 4 } }), faction()).speed).toBe(5);
    expect(hudModel(ship({ vel: { x: 10.4, y: 0 } }), faction()).speed).toBe(10);
    expect(hudModel(ship({ vel: { x: 10.6, y: 0 } }), faction()).speed).toBe(11);
    expect(hudModel(ship({ alive: false, vel: { x: 99, y: 0 } }), faction()).speed).toBe(0);
  });
});
