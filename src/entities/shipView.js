// Rendu filaire d'un vaisseau : un triangle dont la pointe est le nez (mode immédiat, ADR 0002 §4).
import { SHIP_SIZE } from '../config.js';

// Les deux coins arrière sont à ±140° du nez : triangle effilé.
const REAR_ANGLE = (140 * Math.PI) / 180;

/** @param {Phaser.GameObjects.Graphics} g  @param {object} ship  état core (lecture seule) */
export function drawShip(g, ship, color) {
  if (!ship.alive) return;
  const { x, y } = ship.pos;
  const a = ship.angle;
  g.lineStyle(1, color, 1);
  g.strokeTriangle(
    x + Math.cos(a) * SHIP_SIZE,
    y + Math.sin(a) * SHIP_SIZE,
    x + Math.cos(a + REAR_ANGLE) * SHIP_SIZE,
    y + Math.sin(a + REAR_ANGLE) * SHIP_SIZE,
    x + Math.cos(a - REAR_ANGLE) * SHIP_SIZE,
    y + Math.sin(a - REAR_ANGLE) * SHIP_SIZE,
  );
}
