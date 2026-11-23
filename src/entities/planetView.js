// Rendu filaire d'une planète : un cercle dont la couleur indique le propriétaire, un cercle de portée
// très discret pour lire la zone de gravité, les bâtiments dans le disque (ADR 0005 §3) et l'arc de capture.
import { CAPTURE_TIME, PALETTE } from '../config.js';
import { NEUTRAL } from '../core/planet.js';
import { BUILDINGS } from '../data/buildings.js';

// Cosmétique : disposition 2×2 fixe (slot → coin), tailles en fraction du rayon de la planète.
const SLOT_OFFSET = 0.42; // distance du centre du bâtiment au centre de la planète, par axe
const SLOT_CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
// Demi-largeur et demi-hauteur par type de bâtiment ; `inner` = second carré (tourelle lourde).
const SHAPES = {
  turret: { hw: 0.2, hh: 0.2 },
  missileFactory: { hw: 0.28, hh: 0.14 },
  shieldGenerator: { hw: 0.14, hh: 0.28 },
  heavyTurret: { hw: 0.24, hh: 0.24, inner: 0.12 },
};
const SITE_ALPHA = 0.3; // contour du chantier en cours
const SITE_FILL_ALPHA = 0.6;
const MIN_BUILDING_ALPHA = 0.4; // un bâtiment à 0 PV (avant destruction) reste visible
const CAPTURE_GAP = 4; // px entre la planète et l'arc de capture
const ARC_START = -Math.PI / 2; // l'arc part du haut

export function planetColor(owner) {
  return owner === NEUTRAL ? PALETTE.neutral : (PALETTE.factions[owner] ?? PALETTE.neutral);
}

function drawBuildings(g, planet) {
  const color = planetColor(planet.owner);
  let site = -1; // chantier en cours : premier slot non construit
  for (let s = 0; s < BUILDINGS.length; s++) {
    if (!planet.buildings[s].built) {
      site = s;
      break;
    }
  }
  for (let s = 0; s < BUILDINGS.length; s++) {
    const shape = SHAPES[BUILDINGS[s].id];
    const slot = planet.buildings[s];
    const cx = planet.pos.x + SLOT_CORNERS[s][0] * SLOT_OFFSET * planet.radius;
    const cy = planet.pos.y + SLOT_CORNERS[s][1] * SLOT_OFFSET * planet.radius;
    const hw = shape.hw * planet.radius;
    const hh = shape.hh * planet.radius;
    if (slot.built) {
      const alpha =
        MIN_BUILDING_ALPHA + (1 - MIN_BUILDING_ALPHA) * Math.max(0, slot.hp / BUILDINGS[s].hp);
      g.lineStyle(1, color, alpha);
      g.strokeRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
      if (shape.inner !== undefined) {
        const r = shape.inner * planet.radius;
        g.strokeRect(cx - r, cy - r, 2 * r, 2 * r);
      }
    } else if (s === site && planet.owner !== NEUTRAL) {
      const fraction = Math.min(1, planet.buildProgress / BUILDINGS[s].buildTime);
      g.fillStyle(color, SITE_FILL_ALPHA);
      g.fillRect(cx - hw, cy + hh - 2 * hh * fraction, 2 * hw, 2 * hh * fraction);
      g.lineStyle(1, color, SITE_ALPHA);
      g.strokeRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    }
  }
}

/** @param {Phaser.GameObjects.Graphics} g  @param {object} planet  état core (lecture seule) */
export function drawPlanet(g, planet) {
  const { x, y } = planet.pos;
  g.lineStyle(1, PALETTE.border, 0.5);
  g.strokeCircle(x, y, planet.range);
  g.lineStyle(1, planetColor(planet.owner), 1);
  g.strokeCircle(x, y, planet.radius);
  drawBuildings(g, planet);
  if (planet.captureBy >= 0 && planet.captureTime > 0) {
    g.lineStyle(1, planetColor(planet.captureBy), 1);
    g.beginPath();
    g.arc(
      x,
      y,
      planet.radius + CAPTURE_GAP,
      ARC_START,
      ARC_START + Math.min(1, planet.captureTime / CAPTURE_TIME) * 2 * Math.PI,
    );
    g.strokePath();
  }
}
