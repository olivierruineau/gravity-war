// Vie et mort des vaisseaux : dégâts, mort, réapparition. Un seul endroit pour ces règles (revue 2.7) :
// contact planète, tirs, tourelles et bouclier (phase 4) passent tous par `damageShip`.
import { RESPAWN_DELAY, SHIELD_MAX, SHIELD_RECHARGE_DELAY } from '../config.js';
import { EVT, pushEvent } from './events.js';
import { resetIntent } from './intent.js';
import { nearestPlanet } from './planet.js';
import { respawnShip } from './ship.js';

/**
 * Retire `amount` PV au vaisseau `shipIndex`. À 0 : il meurt (immobile, sans intention, détaché du sol),
 * un EXPLOSION est émis en (x, y) et le décompte de respawn démarre. Retourne true si le coup est mortel.
 */
export function damageShip(world, shipIndex, amount, x, y) {
  const ship = world.ships[shipIndex];
  if (!ship.alive) return false;
  // Le bouclier absorbe avant les PV (ADR 0005 §6) ; tout dégât relance le délai de recharge.
  if (amount > 0) {
    ship.shieldDelay = SHIELD_RECHARGE_DELAY;
    const absorbed = Math.min(ship.shield, amount);
    ship.shield -= absorbed;
    amount -= absorbed;
  }
  ship.hp -= amount;
  if (ship.hp > 0) return false;
  ship.hp = 0;
  ship.alive = false;
  ship.landedOn = -1;
  ship.vel.x = 0;
  ship.vel.y = 0;
  ship.respawnTimer = RESPAWN_DELAY;
  resetIntent(ship.intent);
  pushEvent(world.events, EVT.EXPLOSION, x, y, shipIndex);
  return true;
}

/** Pose le vaisseau sur sa planète (respawn ou départ) : vie pleine, et bouclier plein si sa faction l'a débloqué. */
export function placeShipOnPlanet(world, ship, planetIndex) {
  respawnShip(ship, planetIndex, world.planets[planetIndex]);
  if (world.factions[ship.faction].hasShield) ship.shield = SHIELD_MAX;
}

/**
 * Décompte le délai de respawn d'un vaisseau mort ; à échéance il réapparaît sur la planète que sa faction
 * possède la plus proche. Sans planète possédée il reste mort (élimination, item 4.10).
 */
export function updateRespawn(world, shipIndex, dt) {
  const ship = world.ships[shipIndex];
  ship.respawnTimer -= dt;
  if (ship.respawnTimer > 0) return;
  const planetIndex = nearestPlanet(world.planets, ship.pos, ship.faction);
  if (planetIndex < 0) {
    ship.respawnTimer = 0;
    return;
  }
  placeShipOnPlanet(world, ship, planetIndex);
  pushEvent(world.events, EVT.RESPAWN, ship.pos.x, ship.pos.y, shipIndex, planetIndex);
}
