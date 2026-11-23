// Rendu filaire d'un vaisseau : un triangle dont la pointe est le nez (mode immédiat, ADR 0002 §4).
import { SHIELD_MAX, SHIP_SIZE } from '../config.js';
import { glowCircle, glowTriangle } from './glow.js';

// Les deux coins arrière sont à ±140° du nez : triangle effilé.
const SHIELD_RADIUS = SHIP_SIZE + 4;
const REAR_ANGLE = (140 * Math.PI) / 180;

/** @param {Phaser.GameObjects.Graphics} g  @param {object} ship  état core (lecture seule) */
export function drawShip(g, ship, color) {
  if (!ship.alive) return;
  const { x, y } = ship.pos;
  const a = ship.angle;
  if (ship.shield > 0) {
    glowCircle(g, x, y, SHIELD_RADIUS, color, ship.shield / SHIELD_MAX);
    g.lineStyle(1, color, ship.shield / SHIELD_MAX);
    g.strokeCircle(x, y, SHIELD_RADIUS);
  }
  const x1 = x + Math.cos(a) * SHIP_SIZE;
  const y1 = y + Math.sin(a) * SHIP_SIZE;
  const x2 = x + Math.cos(a + REAR_ANGLE) * SHIP_SIZE;
  const y2 = y + Math.sin(a + REAR_ANGLE) * SHIP_SIZE;
  const x3 = x + Math.cos(a - REAR_ANGLE) * SHIP_SIZE;
  const y3 = y + Math.sin(a - REAR_ANGLE) * SHIP_SIZE;
  glowTriangle(g, x1, y1, x2, y2, x3, y3, color);
  g.lineStyle(1, color, 1);
  g.strokeTriangle(x1, y1, x2, y2, x3, y3);
}
