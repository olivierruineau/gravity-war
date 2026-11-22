// Vaisseau : rotation, poussée dans l'axe du nez, inertie. Aucun frein : pour ralentir,
// le pilote fait demi-tour (180°) et pousse. Les interactions (gravité, collisions) vivent ailleurs.
import { SHIP_COLLISION_RADIUS, SHIP_MAX_HP, SHIP_ROTATION_SPEED, SHIP_THRUST } from '../config.js';
import { createIntent, resetIntent } from './intent.js';
import { wrapAngle } from './math.js';

/** Convention d'angle : radians, 0 = nez vers +x, sens positif horaire à l'écran (y vers le bas). */
export function createShip(faction, x, y, angle = -Math.PI / 2) {
  return {
    faction,
    alive: true,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    angle,
    hp: SHIP_MAX_HP,
    respawnTimer: 0, // secondes restantes avant de réapparaître (vaisseau mort)
    landedOn: -1, // index de la planète sur laquelle le vaisseau est posé, -1 en vol
    intent: createIntent(),
  };
}

/** Applique l'intention du pilote : rotation, puis accélération (v += a·dt, Euler semi-implicite). */
export function applyIntent(ship, dt) {
  const { intent } = ship;
  ship.angle = wrapAngle(ship.angle + intent.rotate * SHIP_ROTATION_SPEED * dt);
  if (intent.thrust) {
    ship.vel.x += Math.cos(ship.angle) * SHIP_THRUST * dt;
    ship.vel.y += Math.sin(ship.angle) * SHIP_THRUST * dt;
  }
}

/** Intègre la position avec la vitesse (appelé après toutes les forces). */
export function integrate(ship, dt) {
  ship.pos.x += ship.vel.x * dt;
  ship.pos.y += ship.vel.y * dt;
}

/**
 * Réapparition : le vaisseau est reposé sur la planète (au-dessus, nez sur la normale), à pleins PV, immobile,
 * sans intention résiduelle. Aucun événement LANDED : c'est un état de départ, pas un atterrissage.
 */
export function respawnShip(ship, planetIndex, planet) {
  ship.alive = true;
  ship.hp = SHIP_MAX_HP;
  ship.pos.x = planet.pos.x;
  ship.pos.y = planet.pos.y - (planet.radius + SHIP_COLLISION_RADIUS);
  ship.vel.x = 0;
  ship.vel.y = 0;
  ship.angle = -Math.PI / 2;
  ship.landedOn = planetIndex;
  ship.respawnTimer = 0;
  resetIntent(ship.intent);
}
