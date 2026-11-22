// Rendu filaire d'une planète : un cercle dont la couleur indique le propriétaire,
// plus un cercle de portée très discret pour lire la zone de gravité.
import { FACTION_COLORS, NEUTRAL_COLOR, PALETTE } from '../config.js';
import { NEUTRAL } from '../core/planet.js';

export function planetColor(owner) {
  return owner === NEUTRAL ? NEUTRAL_COLOR : (FACTION_COLORS[owner] ?? NEUTRAL_COLOR);
}

/** @param {Phaser.GameObjects.Graphics} g  @param {object} planet  état core (lecture seule) */
export function drawPlanet(g, planet) {
  const { x, y } = planet.pos;
  g.lineStyle(1, PALETTE.border, 0.5);
  g.strokeCircle(x, y, planet.range);
  g.lineStyle(1, planetColor(planet.owner), 1);
  g.strokeCircle(x, y, planet.radius);
}
