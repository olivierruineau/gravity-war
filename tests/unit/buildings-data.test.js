import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../src/data/buildings.js';

const TURRET_KEYS = ['range', 'cooldown', 'damage', 'speed', 'life', 'spread'];
const turrets = BUILDINGS.filter((b) => b.turret !== undefined);
const nonTurrets = BUILDINGS.filter((b) => b.turret === undefined);
const byId = (id) => BUILDINGS.find((b) => b.id === id);

describe('catalogue BUILDINGS : ordre et identité', () => {
  it('contient les quatre entrées dans l’ordre de développement', () => {
    expect(BUILDINGS.map((b) => b.id)).toEqual([
      'turret',
      'missileFactory',
      'shieldGenerator',
      'heavyTurret',
    ]);
  });

  it('les ids sont uniques', () => {
    const ids = BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('catalogue BUILDINGS : durées de construction', () => {
  it.each(BUILDINGS.map((b) => [b.id, b]))('%s a un buildTime strictement positif', (_id, b) => {
    expect(b.buildTime).toBeGreaterThan(0);
  });
});

describe('catalogue BUILDINGS : tourelles', () => {
  it('il y a exactement deux tourelles (turret et heavyTurret)', () => {
    expect(turrets.map((b) => b.id)).toEqual(['turret', 'heavyTurret']);
  });

  it.each(turrets.map((b) => [b.id, b]))('%s : bloc turret aux seules clés attendues', (_id, b) => {
    expect(Object.keys(b.turret).sort()).toEqual([...TURRET_KEYS].sort());
  });

  it.each(BUILDINGS.map((b) => [b.id, b]))(
    '%s : hp au niveau du bâtiment, strictement positif',
    (_id, b) => {
      expect(b.hp).toBeGreaterThan(0);
    },
  );

  const turretCases = turrets.flatMap((b) => TURRET_KEYS.map((key) => [b.id, key, b]));
  it.each(turretCases)('%s : turret.%s est strictement positif', (_id, key, b) => {
    expect(b.turret[key]).toBeGreaterThan(0);
  });
});

describe('catalogue BUILDINGS : bâtiments non tourelles', () => {
  it('il y a exactement deux non-tourelles (missileFactory et shieldGenerator)', () => {
    expect(nonTurrets.map((b) => b.id)).toEqual(['missileFactory', 'shieldGenerator']);
  });

  it.each(nonTurrets.map((b) => [b.id, b]))('%s : grants ∈ {missiles, shield}', (_id, b) => {
    expect(['missiles', 'shield']).toContain(b.grants);
  });

  it('missileFactory et shieldGenerator : hp 100', () => {
    expect(byId('missileFactory').hp).toBe(100);
    expect(byId('shieldGenerator').hp).toBe(100);
  });

  it('missileFactory accorde les missiles', () => {
    expect(byId('missileFactory').grants).toBe('missiles');
  });

  it('shieldGenerator accorde le bouclier', () => {
    expect(byId('shieldGenerator').grants).toBe('shield');
  });
});

describe('catalogue BUILDINGS : tourelle lourde plus puissante que la tourelle', () => {
  const light = byId('turret').turret;
  const heavy = byId('heavyTurret').turret;

  it('PV de la lourde > PV de la tourelle', () => {
    expect(byId('heavyTurret').hp).toBeGreaterThan(byId('turret').hp);
  });

  it('portée de la lourde > portée de la tourelle', () => {
    expect(heavy.range).toBeGreaterThan(light.range);
  });
});

describe('catalogue BUILDINGS : valeurs de l’ADR 0005 §3', () => {
  it('turret : buildTime 20 s', () => {
    expect(byId('turret').buildTime).toBe(20);
  });

  it('turret : hp 80, range 150, cooldown 1.0, damage 6, speed 200, life 1.0, spread 0.1', () => {
    expect(byId('turret').hp).toBe(80);
    expect(byId('turret').turret).toEqual({
      range: 150,
      cooldown: 1.0,
      damage: 6,
      speed: 200,
      life: 1.0,
      spread: 0.1,
    });
  });

  it('missileFactory : buildTime 30 s', () => {
    expect(byId('missileFactory').buildTime).toBe(30);
  });

  it('shieldGenerator : buildTime 40 s', () => {
    expect(byId('shieldGenerator').buildTime).toBe(40);
  });

  it('heavyTurret : buildTime 45 s', () => {
    expect(byId('heavyTurret').buildTime).toBe(45);
  });

  it('heavyTurret : hp 160, range 200, cooldown 0.6, damage 8, speed 240, life 1.1, spread 0.06', () => {
    expect(byId('heavyTurret').hp).toBe(160);
    expect(byId('heavyTurret').turret).toEqual({
      range: 200,
      cooldown: 0.6,
      damage: 8,
      speed: 240,
      life: 1.1,
      spread: 0.06,
    });
  });

  it('durée totale de développement = 2 min 15 s (20 + 30 + 40 + 45 s)', () => {
    const total = BUILDINGS.reduce((sum, b) => sum + b.buildTime, 0);
    expect(total).toBe(135);
  });
});
