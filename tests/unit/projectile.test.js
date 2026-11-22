import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { createWorld } from '../../src/core/world.js';
import {
  KIND,
  createProjectiles,
  spawnProjectile,
  updateProjectiles,
} from '../../src/core/projectile.js';

const WIDTH = 480;
const HEIGHT = 270;

function worldWith(planets = []) {
  return createWorld({ width: WIDTH, height: HEIGHT, planets }, 1, { eventCapacity: 8 });
}

/** Active un projectile de balle (propriétaire 0) et retourne son index. */
function spawnBullet(pool, x, y, vx, vy, life = 10) {
  return spawnProjectile(pool, KIND.BULLET, 0, x, y, vx, vy, life, 1);
}

describe('createProjectiles', () => {
  it('crée exactement `n` slots', () => {
    expect(createProjectiles(5)).toHaveLength(5);
  });

  it('crée un pool vide pour une capacité nulle', () => {
    expect(createProjectiles(0)).toHaveLength(0);
  });

  it('crée des slots tous inactifs', () => {
    const pool = createProjectiles(4);
    expect(pool.every((p) => p.active === false)).toBe(true);
  });

  it('crée des objets distincts pour chaque slot', () => {
    const pool = createProjectiles(4);
    expect(new Set(pool).size).toBe(4);
  });

  it('crée des `pos` distincts d’un slot à l’autre', () => {
    const pool = createProjectiles(4);
    expect(new Set(pool.map((p) => p.pos)).size).toBe(4);
  });

  it('crée des `vel` distincts d’un slot à l’autre', () => {
    const pool = createProjectiles(4);
    expect(new Set(pool.map((p) => p.vel)).size).toBe(4);
  });

  it('ne partage pas `pos` et `vel` au sein d’un même slot', () => {
    const [p] = createProjectiles(1);
    expect(p.pos).not.toBe(p.vel);
  });
});

describe('spawnProjectile', () => {
  it('active le premier slot libre et retourne son index', () => {
    const pool = createProjectiles(3);
    expect(spawnProjectile(pool, KIND.BULLET, 0, 1, 2, 3, 4, 5, 6)).toBe(0);
    expect(pool[0].active).toBe(true);
  });

  it('saute les slots déjà actifs', () => {
    const pool = createProjectiles(3);
    spawnBullet(pool, 0, 0, 0, 0);
    expect(spawnBullet(pool, 0, 0, 0, 0)).toBe(1);
  });

  it('remplit tous les champs du slot activé', () => {
    const pool = createProjectiles(2);
    spawnProjectile(pool, KIND.MISSILE, 2, 10, 20, 30, -40, 1.5, 7);
    expect(pool[0]).toEqual({
      active: true,
      kind: KIND.MISSILE,
      owner: 2,
      pos: { x: 10, y: 20 },
      vel: { x: 30, y: -40 },
      life: 1.5,
      damage: 7,
    });
  });

  it('réutilise le slot libéré le plus bas', () => {
    const world = worldWith();
    spawnBullet(world.projectiles, 100, 100, 0, 0, FIXED_DT);
    spawnBullet(world.projectiles, 100, 100, 0, 0, 10);
    updateProjectiles(world, FIXED_DT);
    expect(spawnBullet(world.projectiles, 50, 50, 0, 0)).toBe(0);
  });

  it('retourne −1 quand le pool est plein', () => {
    const pool = createProjectiles(2);
    spawnBullet(pool, 0, 0, 0, 0);
    spawnBullet(pool, 0, 0, 0, 0);
    expect(spawnBullet(pool, 0, 0, 0, 0)).toBe(-1);
  });

  it('ne modifie aucun slot quand le pool est plein', () => {
    const pool = createProjectiles(2);
    spawnBullet(pool, 1, 2, 3, 4);
    spawnBullet(pool, 5, 6, 7, 8);
    const before = structuredClone(pool);
    spawnBullet(pool, 99, 99, 99, 99);
    expect(pool).toEqual(before);
  });
});

describe('updateProjectiles', () => {
  it('sans planète, déplace le projectile de vel·dt', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, 100, 60, -30);
    updateProjectiles(world, FIXED_DT);
    const p = world.projectiles[i];
    expect(p.pos.x).toBeCloseTo(100 + 60 * FIXED_DT, 10);
    expect(p.pos.y).toBeCloseTo(100 - 30 * FIXED_DT, 10);
  });

  it('décrémente la durée de vie de dt', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, 100, 0, 0, 0.5);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].life).toBeCloseTo(0.5 - FIXED_DT, 10);
  });

  it('désactive le projectile dont la durée de vie atteint 0', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, 100, 0, 0, FIXED_DT);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('garde actif le projectile dont la durée de vie reste positive', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, 100, 0, 0, 1);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('désactive le projectile qui sort par la gauche (x < 0)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, -1, 100, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('désactive le projectile qui sort par le haut (y < 0)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, -1, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('désactive le projectile qui sort par la droite (x > width)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, WIDTH + 1, 100, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('désactive le projectile qui sort par le bas (y > height)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 100, HEIGHT + 1, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(false);
  });

  it('garde actif le projectile exactement sur le bord gauche (x = 0)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 0, 100, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('garde actif le projectile exactement sur le bord droit (x = width)', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, WIDTH, 100, 0, 0);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].active).toBe(true);
  });

  it('ne touche pas aux slots inactifs', () => {
    const world = worldWith();
    const slot = world.projectiles[0];
    slot.vel.x = 100;
    slot.vel.y = 100;
    updateProjectiles(world, FIXED_DT);
    expect(slot.pos).toEqual({ x: 0, y: 0 });
  });

  it('ne réactive pas un slot inactif', () => {
    const world = worldWith();
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles.some((p) => p.active)).toBe(false);
  });

  it('avec une planète, la gravité modifie la vitesse vers le centre', () => {
    const world = worldWith([{ x: 240, y: 135, radius: 20 }]);
    const i = spawnBullet(world.projectiles, 280, 135, 0, 50);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].vel.x).toBeLessThan(0);
  });

  it('sans planète, la vitesse ne change pas', () => {
    const world = worldWith();
    const i = spawnBullet(world.projectiles, 280, 135, 0, 50);
    updateProjectiles(world, FIXED_DT);
    expect(world.projectiles[i].vel).toEqual({ x: 0, y: 50 });
  });
});
