// Armes d'un vaisseau : tir principal et missiles (touche maintenue, cadence gérée ici, jamais par l'input).
import {
  BULLET_DAMAGE,
  BULLET_LIFETIME,
  BULLET_SPEED,
  FIRE_COOLDOWN,
  MISSILE_COOLDOWN,
  MISSILE_DAMAGE,
  MISSILE_LIFETIME,
  MISSILE_SPEED,
  SHIP_SIZE,
} from '../config.js';
import { EVT, pushEvent } from './events.js';
import { KIND, spawnProjectile } from './projectile.js';
import { hypot } from './math.js';

/** À appeler pour un vaisseau vivant, une fois par pas : décompte les cooldowns et tire si demandé. */
export function updateWeapons(world, shipIndex, dt) {
  const ship = world.ships[shipIndex];
  if (ship.fireCooldown > 0) ship.fireCooldown -= dt;
  if (ship.missileCooldown > 0) ship.missileCooldown -= dt;
  if (ship.intent.fire && ship.fireCooldown <= 0) fireBullet(world, ship, shipIndex);
  if (
    ship.intent.missile &&
    ship.missileCooldown <= 0 &&
    ship.missiles > 0 &&
    world.factions[ship.faction].hasMissiles
  ) {
    fireMissile(world, ship, shipIndex);
  }
}

/** Vrai si (x, y) est à l'intérieur d'une planète : un vaisseau posé qui vise le sol ne tire pas. */
function insideAnyPlanet(planets, x, y) {
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (hypot(x - p.pos.x, y - p.pos.y) < p.radius) return true;
  }
  return false;
}

function fireBullet(world, ship, shipIndex) {
  const dirX = Math.cos(ship.angle);
  const dirY = Math.sin(ship.angle);
  const x = ship.pos.x + dirX * SHIP_SIZE; // part de la pointe du nez
  const y = ship.pos.y + dirY * SHIP_SIZE;
  if (insideAnyPlanet(world.planets, x, y)) return;
  ship.fireCooldown = FIRE_COOLDOWN;
  const index = spawnProjectile(
    world.projectiles,
    KIND.BULLET,
    ship.faction,
    x,
    y,
    ship.vel.x + dirX * BULLET_SPEED,
    ship.vel.y + dirY * BULLET_SPEED,
    BULLET_LIFETIME,
    BULLET_DAMAGE,
  );
  if (index >= 0) pushEvent(world.events, EVT.SHOT, x, y, shipIndex, index);
}

function fireMissile(world, ship, shipIndex) {
  const dirX = Math.cos(ship.angle);
  const dirY = Math.sin(ship.angle);
  // N'hérite que de la vitesse vers l'avant : jamais plus lent que MISSILE_SPEED.
  const speed = MISSILE_SPEED + Math.max(0, ship.vel.x * dirX + ship.vel.y * dirY);
  const x = ship.pos.x + dirX * SHIP_SIZE;
  const y = ship.pos.y + dirY * SHIP_SIZE;
  if (insideAnyPlanet(world.planets, x, y)) return;
  const index = spawnProjectile(
    world.projectiles,
    KIND.MISSILE,
    ship.faction,
    x,
    y,
    dirX * speed,
    dirY * speed,
    MISSILE_LIFETIME,
    MISSILE_DAMAGE,
  );
  if (index < 0) return; // pool plein : on ne consomme pas le stock
  ship.missiles -= 1;
  ship.missileCooldown = MISSILE_COOLDOWN;
  pushEvent(world.events, EVT.MISSILE_LAUNCH, x, y, shipIndex, index);
}
