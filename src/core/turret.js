// Tourelles des planètes (ADR 0005 §4) : tir radial automatique.
import { TURRET_MUZZLE_OFFSET } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';
import { EVT, pushEvent } from './events.js';
import { KIND, spawnProjectile } from './projectile.js';
import { range } from './rng.js';
import { hypot } from './math.js';

/** Vaisseau vivant d'une autre faction le plus proche de la surface de `planet` ; −1 si aucun dans `maxRange`. */
function findTarget(world, planet, maxRange) {
  let best = -1;
  let bestGap = maxRange;
  for (let k = 0; k < world.ships.length; k++) {
    const ship = world.ships[k];
    if (!ship.alive || ship.faction === planet.owner) continue;
    const gap = hypot(ship.pos.x - planet.pos.x, ship.pos.y - planet.pos.y) - planet.radius;
    if (gap > bestGap) continue;
    bestGap = gap;
    best = k;
  }
  return best;
}

/** Chaque tourelle construite d'une planète possédée décompte son cooldown et tire sur la cible la plus proche. */
export function updateTurrets(world, dt) {
  const { planets, ships, events } = world;
  for (let i = 0; i < planets.length; i++) {
    const planet = planets[i];
    if (planet.owner < 0) continue;
    for (let s = 0; s < BUILDINGS.length; s++) {
      const spec = BUILDINGS[s].turret;
      const slot = planet.buildings[s];
      if (spec === undefined || !slot.built) continue;
      // Plafonné à 0 : une tourelle au repos ne cumule pas de cooldown négatif.
      if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - dt);
      if (slot.cooldown > 0) continue;
      const target = findTarget(world, planet, spec.range);
      if (target < 0) continue;
      const dx = ships[target].pos.x - planet.pos.x;
      const dy = ships[target].pos.y - planet.pos.y;
      const angle = Math.atan2(dy, dx);
      // Le bruit porte sur le cap : le tir reste radial, donc il ne traverse jamais sa propre planète.
      const dir = angle + range(world.rng, -spec.spread, spec.spread);
      const ux = Math.cos(dir);
      const uy = Math.sin(dir);
      const offset = planet.radius + TURRET_MUZZLE_OFFSET;
      const x = planet.pos.x + ux * offset;
      const y = planet.pos.y + uy * offset;
      const index = spawnProjectile(
        world.projectiles,
        KIND.BULLET,
        planet.owner,
        x,
        y,
        ux * spec.speed,
        uy * spec.speed,
        spec.life,
        spec.damage,
      );
      if (index >= 0) pushEvent(events, EVT.TURRET_SHOT, x, y, i, s); // pool plein : pas de balle, pas d'événement
      slot.cooldown = spec.cooldown;
    }
  }
}
