// Bouclier passif (ADR 0005 §6) : recharge après un délai sans dégâts, si la faction a le générateur.
import { SHIELD_MAX, SHIELD_RECHARGE_RATE } from '../config.js';

/** Fait avancer le bouclier d'un vaisseau vivant (en vol comme posé). Aucun événement. */
export function updateShield(world, shipIndex, dt) {
  const ship = world.ships[shipIndex];
  if (ship.shieldDelay > 0) {
    ship.shieldDelay -= dt;
    return;
  }
  if (!world.factions[ship.faction].hasShield) return;
  ship.shield = Math.min(SHIELD_MAX, ship.shield + SHIELD_RECHARGE_RATE * dt);
}
