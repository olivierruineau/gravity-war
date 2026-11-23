import { describe, expect, it } from 'vitest';
import { FIXED_DT, PROJECTILE_CAPACITY, TURRET_MUZZLE_OFFSET } from '../../src/config.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { clearEvents, EVT } from '../../src/core/events.js';
import { KIND, spawnProjectile } from '../../src/core/projectile.js';
import { updateTurrets } from '../../src/core/turret.js';
import { createWorld } from '../../src/core/world.js';

// Planète de test : centre (500, 500), r = 40, possédée par la faction 0, tourelle de base construite.
// Aucun appel à `step` : `updateTurrets` est testé isolément, sans gravité ni déplacement de balles.
const CX = 500;
const CY = 500;
const R = 40;
const BASE = BUILDINGS[0].turret; // range 150, cooldown 1, damage 6, speed 200, life 1, spread 0.1
const HEAVY = BUILDINGS[3].turret; // range 200, cooldown 0.6, damage 8, speed 240, life 1.1, spread 0.06
const HEAVY_SLOT = 3;
// Tolérance sur les angles : cos/sin/atan2 en double précision, erreur de l'ordre de 1e-15 rad.
const ANGLE_EPS = 1e-9;

function makeWorld({ owner = 0, built = 1, seed = 1 } = {}) {
  return createWorld(
    {
      width: 2000,
      height: 2000,
      planets: [{ x: CX, y: CY, radius: R, owner, built }],
      // Trois vaisseaux (un par faction), tous hors de portée au départ (> 1000 px de la planète).
      spawns: [
        { x: 1900, y: 1900 },
        { x: 1900, y: 100 },
        { x: 100, y: 1900 },
      ],
    },
    seed,
    { eventCapacity: 512 },
  );
}

/** Pose le vaisseau `i` sur le rayon d'angle `angle`, à `gap` px de la SURFACE de la planète. */
function placeShip(world, i, gap, angle = 0) {
  const ship = world.ships[i];
  ship.pos.x = CX + Math.cos(angle) * (R + gap);
  ship.pos.y = CY + Math.sin(angle) * (R + gap);
  ship.alive = true;
  return ship;
}

function activeProjectiles(world) {
  return world.projectiles.filter((p) => p.active);
}

function eventsOf(world, type) {
  const found = [];
  for (let i = 0; i < world.events.count; i++) {
    if (world.events.items[i].type === type) found.push({ ...world.events.items[i] });
  }
  return found;
}

/** Cap (rad) du centre de la planète vers le projectile `p`, comparé au cap voulu : écart signé dans ]−π, π]. */
function headingError(p, aimAngle) {
  const d = Math.atan2(p.pos.y - CY, p.pos.x - CX) - aimAngle;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Instants (s) des tirs sur `steps` appels de pas `dt` face à une cible immobile. */
function shotTimes(world, steps, dt) {
  const times = [];
  for (let i = 0; i < steps; i++) {
    clearEvents(world.events);
    updateTurrets(world, dt);
    if (eventsOf(world, EVT.TURRET_SHOT).length > 0) times.push(i * dt);
  }
  return times;
}

describe('updateTurrets : choix de la cible', () => {
  it('tire sur un vaisseau ennemi juste dans la portée (149,9 px de la surface)', () => {
    const world = makeWorld();
    placeShip(world, 1, BASE.range - 0.1);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
    expect(eventsOf(world, EVT.TURRET_SHOT)).toHaveLength(1);
  });

  it('ne tire pas juste hors de la portée (150,1 px de la surface)', () => {
    const world = makeWorld();
    placeShip(world, 1, BASE.range + 0.1);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
  });

  it('la portée est inclusive : tire à exactement 150 px de la surface', () => {
    // Le vaisseau est sur l'axe x : hypot(190, 0) − 40 vaut exactement 150 en flottant.
    const world = makeWorld();
    placeShip(world, 1, BASE.range);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('la portée se mesure depuis la surface, pas depuis le centre', () => {
    // Centre à 189,9 px (> 150) mais surface à 149,9 px : tire. Un calcul depuis le centre ne tirerait pas.
    const world = makeWorld();
    placeShip(world, 1, BASE.range - 0.1, Math.PI / 3);
    expect(Math.hypot(world.ships[1].pos.x - CX, world.ships[1].pos.y - CY)).toBeGreaterThan(
      BASE.range,
    );
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('ne tire jamais sur sa propre faction, même collée à la planète', () => {
    const world = makeWorld();
    placeShip(world, 0, 5);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
  });

  it('la faction qui possède la planète est celle qu’on épargne (planète de la faction 1)', () => {
    const world = makeWorld({ owner: 1 });
    placeShip(world, 1, 5);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    placeShip(world, 0, 5);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
    expect(activeProjectiles(world)[0].owner).toBe(1);
  });

  it('ne tire pas sur un vaisseau mort, même tout proche', () => {
    const world = makeWorld();
    placeShip(world, 1, 10).alive = false;
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
  });

  it('un vaisseau mort plus proche ne masque pas un vaisseau vivant plus lointain', () => {
    const world = makeWorld();
    placeShip(world, 1, 10, 0).alive = false;
    placeShip(world, 2, 100, Math.PI); // à gauche de la planète
    updateTurrets(world, FIXED_DT);
    const [p] = activeProjectiles(world);
    expect(p).toBeDefined();
    expect(Math.abs(headingError(p, Math.PI))).toBeLessThanOrEqual(BASE.spread + ANGLE_EPS);
  });

  it('cible aussi un vaisseau posé sur la planète (distance de surface ≈ rayon du vaisseau)', () => {
    const world = makeWorld();
    const ship = placeShip(world, 1, 6, -Math.PI / 2);
    ship.landedOn = 0;
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('vise le vaisseau ennemi le plus proche de la surface (le plus lointain est ignoré)', () => {
    const world = makeWorld();
    placeShip(world, 1, 120, 0); // à droite, plus loin
    placeShip(world, 2, 60, Math.PI / 2); // en bas (y vers le bas), plus près
    updateTurrets(world, FIXED_DT);
    const [p] = activeProjectiles(world);
    expect(Math.abs(headingError(p, Math.PI / 2))).toBeLessThanOrEqual(BASE.spread + ANGLE_EPS);
  });

  it('un allié plus proche n’empêche pas de viser l’ennemi plus lointain', () => {
    const world = makeWorld();
    placeShip(world, 0, 20, 0); // allié, très près
    placeShip(world, 2, 100, -Math.PI / 2); // ennemi au-dessus
    updateTurrets(world, FIXED_DT);
    const [p] = activeProjectiles(world);
    expect(Math.abs(headingError(p, -Math.PI / 2))).toBeLessThanOrEqual(BASE.spread + ANGLE_EPS);
  });
});

describe('updateTurrets : cadence', () => {
  it('un tir par cooldown : dt = 0,25 (exact en binaire) → un tir tous les 4 appels', () => {
    // Pas exact en binaire : 1 − 4·0,25 vaut exactement 0, donc aucun arrondi ne décale le tir.
    const world = makeWorld();
    placeShip(world, 1, 100);
    const times = shotTimes(world, 40, 0.25);
    expect(times).toHaveLength(10);
    times.forEach((t, k) => expect(t).toBe(k * BASE.cooldown));
  });

  it('premier tir immédiat (cooldown initial 0), puis intervalles dans [cooldown, cooldown + dt[ au pas de 1/60', () => {
    // Les soustractions de 1/60 s'accumulent en flottant : un intervalle peut valoir 60 ou 61 pas.
    // On borne donc l'intervalle à [cooldown, cooldown + dt] (+ 1e-9 d'erreur d'arrondi), jamais plus court.
    const world = makeWorld();
    placeShip(world, 1, 100);
    const times = shotTimes(world, 600, FIXED_DT); // 10 s
    expect(times[0]).toBe(0);
    for (let k = 1; k < times.length; k++) {
      const gap = times[k] - times[k - 1];
      expect(gap).toBeGreaterThanOrEqual(BASE.cooldown - 1e-9);
      expect(gap).toBeLessThanOrEqual(BASE.cooldown + FIXED_DT + 1e-9);
    }
    expect(times.length).toBeGreaterThanOrEqual(10);
    expect(times.length).toBeLessThanOrEqual(11);
  });

  it('pas de cooldown accumulé hors combat : une cible qui arrive tard déclenche un tir immédiat', () => {
    const world = makeWorld();
    for (let i = 0; i < 300; i++) updateTurrets(world, FIXED_DT); // 5 s sans cible
    expect(world.planets[0].buildings[0].cooldown).toBe(0);
    placeShip(world, 1, 100);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);
  });

  it('le cooldown décompte aussi sans cible, puis la tourelle retire le reste après un tir', () => {
    const world = makeWorld();
    const ship = placeShip(world, 1, 100);
    updateTurrets(world, 0.25); // tir, cooldown = 1
    ship.alive = false;
    updateTurrets(world, 0.5); // pas de cible : le cooldown tombe à 0,5
    expect(world.planets[0].buildings[0].cooldown).toBe(0.5);
    ship.alive = true;
    updateTurrets(world, 0.25); // 0,25 : toujours en recharge
    expect(activeProjectiles(world)).toHaveLength(1);
    updateTurrets(world, 0.25); // 0 : tire
    expect(activeProjectiles(world)).toHaveLength(2);
  });

  it('tourelle lourde seule (slot 3) : portée 200 et cadence 0,6 s', () => {
    const world = makeWorld({ built: 0 });
    const slot = world.planets[0].buildings[HEAVY_SLOT];
    slot.built = true;
    slot.hp = BUILDINGS[HEAVY_SLOT].hp;
    const ship = placeShip(world, 1, 199.9);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(1);

    const far = makeWorld({ built: 0 });
    far.planets[0].buildings[HEAVY_SLOT].built = true;
    placeShip(far, 1, 200.1);
    updateTurrets(far, FIXED_DT);
    expect(activeProjectiles(far)).toHaveLength(0);

    // Intervalle : dt = 0,125 (exact) donne 0,6 → 0,475 → 0,35 → 0,225 → 0,1 → ≤ 0 : un tir tous les 5 appels.
    ship.alive = true;
    const times = shotTimes(world, 40, 0.125);
    for (let k = 1; k < times.length; k++) {
      const gap = times[k] - times[k - 1];
      expect(gap).toBeGreaterThanOrEqual(HEAVY.cooldown - 1e-9);
      expect(gap).toBeLessThan(HEAVY.cooldown + 0.125 + 1e-9);
    }
    expect(times.length).toBeGreaterThanOrEqual(7);
  });

  it('les deux tourelles ont chacune leur cooldown : à 175 px seule la lourde tire (b = 3)', () => {
    const world = makeWorld({ built: 4 });
    placeShip(world, 1, 175);
    updateTurrets(world, FIXED_DT);
    const shots = eventsOf(world, EVT.TURRET_SHOT);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ a: 0, b: HEAVY_SLOT });
  });

  it('à 100 px, les deux tourelles tirent au même pas (b = 0 puis b = 3), avec leurs stats propres', () => {
    const world = makeWorld({ built: 4 });
    placeShip(world, 1, 100);
    updateTurrets(world, FIXED_DT);
    const shots = eventsOf(world, EVT.TURRET_SHOT);
    expect(shots.map((e) => e.b)).toEqual([0, HEAVY_SLOT]);
    const [base, heavy] = activeProjectiles(world);
    expect(base.damage).toBe(BASE.damage);
    expect(heavy.damage).toBe(HEAVY.damage);
    expect(Math.hypot(base.vel.x, base.vel.y)).toBeCloseTo(BASE.speed, 9); // cos² + sin² = 1 à 1e-16 près
    expect(Math.hypot(heavy.vel.x, heavy.vel.y)).toBeCloseTo(HEAVY.speed, 9);
    expect(heavy.life).toBe(HEAVY.life);
  });
});

describe('updateTurrets : le tir', () => {
  it('part radialement de centre + u·(radius + TURRET_MUZZLE_OFFSET), vitesse ≈ speed, owner, life, damage', () => {
    const world = makeWorld();
    const aim = -0.7;
    placeShip(world, 1, 100, aim);
    updateTurrets(world, FIXED_DT);
    const [p] = activeProjectiles(world);

    expect(p.kind).toBe(KIND.BULLET);
    expect(p.owner).toBe(0); // faction de la planète
    expect(p.life).toBe(BASE.life);
    expect(p.damage).toBe(BASE.damage);

    // 9 décimales : trig en double précision, erreur ≈ 1e-13 px sur ces ordres de grandeur.
    const muzzle = Math.hypot(p.pos.x - CX, p.pos.y - CY);
    expect(muzzle).toBeCloseTo(R + TURRET_MUZZLE_OFFSET, 9);
    expect(Math.hypot(p.vel.x, p.vel.y)).toBeCloseTo(BASE.speed, 9);
    // Radial : la vitesse est colinéaire à (position − centre) et dirigée vers l'extérieur.
    const ux = (p.pos.x - CX) / muzzle;
    const uy = (p.pos.y - CY) / muzzle;
    expect(p.vel.x / BASE.speed).toBeCloseTo(ux, 9);
    expect(p.vel.y / BASE.speed).toBeCloseTo(uy, 9);
    // Et le cap reste dans la dispersion autour de la cible.
    expect(Math.abs(headingError(p, aim))).toBeLessThanOrEqual(BASE.spread + ANGLE_EPS);
  });

  it('émet TURRET_SHOT (a = planète, b = slot) à la bouche du canon', () => {
    const world = makeWorld();
    placeShip(world, 1, 100);
    updateTurrets(world, FIXED_DT);
    const [e] = eventsOf(world, EVT.TURRET_SHOT);
    const [p] = activeProjectiles(world);
    expect(e).toMatchObject({ a: 0, b: 0 });
    expect(e.x).toBe(p.pos.x);
    expect(e.y).toBe(p.pos.y);
  });

  it('dispersion bornée par ±spread sur 200 tirs seedés, réellement utilisée et centrée', () => {
    const world = makeWorld({ seed: 42 });
    const aim = 1.1;
    placeShip(world, 1, 100, aim);
    const slot = world.planets[0].buildings[0];
    const errors = [];
    for (let i = 0; i < 200; i++) {
      slot.cooldown = 0; // on force un tir par appel pour échantillonner le bruit
      updateTurrets(world, FIXED_DT);
    }
    for (const p of activeProjectiles(world)) errors.push(headingError(p, aim));
    expect(errors).toHaveLength(200);

    for (const e of errors) expect(Math.abs(e)).toBeLessThanOrEqual(BASE.spread + ANGLE_EPS);
    // Bruit uniforme sur ±0,1 : l'étendue observée sur 200 tirs dépasse 90 % de la borne (P(échec) ≈ 1e-9).
    expect(Math.max(...errors)).toBeGreaterThan(0.9 * BASE.spread);
    expect(Math.min(...errors)).toBeLessThan(-0.9 * BASE.spread);
    // Moyenne : écart-type = spread/√3 ≈ 0,058, donc σ_moyenne ≈ 0,0041 sur 200 tirs ; 0,02 ≈ 5σ.
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
  });

  it('la dispersion de la tourelle lourde est bornée par son propre spread (0,06)', () => {
    const world = makeWorld({ built: 0, seed: 7 });
    world.planets[0].buildings[HEAVY_SLOT].built = true;
    const aim = 0.3;
    placeShip(world, 1, 100, aim);
    for (let i = 0; i < 200; i++) {
      world.planets[0].buildings[HEAVY_SLOT].cooldown = 0;
      updateTurrets(world, FIXED_DT);
    }
    const errors = activeProjectiles(world).map((p) => headingError(p, aim));
    expect(errors).toHaveLength(200);
    for (const e of errors) expect(Math.abs(e)).toBeLessThanOrEqual(HEAVY.spread + ANGLE_EPS);
    expect(Math.max(...errors)).toBeGreaterThan(0.9 * HEAVY.spread);
  });

  it('reproductible : même seed, mêmes tirs à l’identique ; autre seed, autres tirs', () => {
    function volley(seed) {
      const world = makeWorld({ seed });
      placeShip(world, 1, 100, 2);
      for (let i = 0; i < 50; i++) {
        world.planets[0].buildings[0].cooldown = 0;
        updateTurrets(world, FIXED_DT);
      }
      return JSON.stringify(activeProjectiles(world));
    }
    expect(volley(5)).toBe(volley(5));
    expect(volley(5)).not.toBe(volley(6));
  });

  it('le tir consomme le RNG du monde (état du rng avancé : un tirage par tir)', () => {
    const world = makeWorld({ seed: 3 });
    placeShip(world, 1, 100);
    const before = world.rng.state;
    updateTurrets(world, FIXED_DT);
    expect(world.rng.state).not.toBe(before);
  });
});

describe('updateTurrets : cas où rien ne se passe', () => {
  it('planète neutre : aucune tourelle ne tire, même construite et avec une cible à bout portant', () => {
    const world = makeWorld({ owner: -1, built: 1 });
    placeShip(world, 1, 5);
    placeShip(world, 0, 5, Math.PI);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.events.count).toBe(0);
  });

  it('tourelle non construite : rien, et le cooldown n’est pas touché', () => {
    const world = makeWorld({ built: 0 });
    placeShip(world, 1, 5);
    world.planets[0].buildings[0].cooldown = 0.5;
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
    expect(world.planets[0].buildings[0].cooldown).toBe(0.5);
  });

  it('un bâtiment non tourelle construit (usine, générateur) ne tire pas', () => {
    const world = makeWorld({ built: 0 });
    world.planets[0].buildings[1].built = true;
    world.planets[0].buildings[2].built = true;
    placeShip(world, 1, 5);
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
  });

  it('aucun vaisseau ennemi vivant : rien', () => {
    const world = makeWorld();
    world.ships[1].alive = false;
    world.ships[2].alive = false;
    updateTurrets(world, FIXED_DT);
    expect(activeProjectiles(world)).toHaveLength(0);
  });

  it('pool plein : aucune exception, le pool reste saturé', () => {
    const world = makeWorld();
    placeShip(world, 1, 100);
    for (let i = 0; i < PROJECTILE_CAPACITY; i++) {
      spawnProjectile(world.projectiles, KIND.BULLET, 1, 0, 0, 0, 0, 10, 1);
    }
    expect(() => updateTurrets(world, FIXED_DT)).not.toThrow();
    expect(activeProjectiles(world)).toHaveLength(PROJECTILE_CAPACITY);
  });
});
