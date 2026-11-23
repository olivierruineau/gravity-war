// Modèle du HUD (6.1) : ce que le joueur doit voir, calculé en pur depuis l'état du core. Testé sans Phaser.
import { SHIELD_MAX, SHIP_MAX_HP } from '../config.js';
import { hypot } from '../core/math.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @param {object} ship vaisseau du joueur
 * @param {{ hasShield: boolean, hasMissiles: boolean }} faction sa faction
 * @returns {{ hpRatio: number, shieldRatio: number, missiles: number, showShield: boolean,
 *   showMissiles: boolean, speed: number }} `speed` en px/s, arrondie (0 si le vaisseau est mort)
 */
export function hudModel(ship, faction) {
  return {
    hpRatio: clamp01(ship.hp / SHIP_MAX_HP),
    shieldRatio: clamp01(ship.shield / SHIELD_MAX),
    missiles: ship.missiles,
    // Le bouclier reste affiché tant qu'il en reste, même si le bâtiment qui le débloque a été perdu.
    showShield: faction.hasShield || ship.shield > 0,
    showMissiles: faction.hasMissiles,
    speed: ship.alive ? Math.round(hypot(ship.vel.x, ship.vel.y)) : 0,
  };
}
