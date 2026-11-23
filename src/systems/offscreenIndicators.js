// Indicateurs de cibles hors écran (6.3) : une flèche au bord de l'écran vers chaque vaisseau ennemi vivant
// et vers la planète non possédée par le joueur la plus proche (prochain objectif). Lecture seule de `world`.
import { PALETTE } from '../config.js';
import { planetColor } from '../entities/planetView.js';
import { edgeIndicator } from './offscreenLayout.js';
import { hypot } from '../core/math.js';
import { viewRect } from './renderScale.js';

const viewScratch = { x: 0, y: 0, width: 0, height: 0 };

const DEPTH = 800;
const INSET = 8; // px de marge entre la flèche et le bord de l'écran
const VISIBLE_MARGIN = 12; // une cible à peine hors cadre est déjà considérée visible
const SIZE = 5; // demi-longueur de la flèche
const ALPHA_NEAR = 1;
const ALPHA_FAR = 0.35;
const FAR_DISTANCE = 1500; // px monde : au-delà, flèche à ALPHA_FAR

const spot = { x: 0, y: 0, angle: 0 };

function drawArrow(g, view, tx, ty, px, py, color) {
  if (!edgeIndicator(view, tx, ty, INSET, VISIBLE_MARGIN, spot)) return;
  const dist = hypot(tx - px, ty - py);
  const alpha = ALPHA_NEAR + (ALPHA_FAR - ALPHA_NEAR) * Math.min(1, dist / FAR_DISTANCE);
  // `view` est en coordonnées monde ; la flèche est fixée à l'écran : on ramène le point dans l'écran.
  const x = spot.x - view.x;
  const y = spot.y - view.y;
  const c = Math.cos(spot.angle);
  const s = Math.sin(spot.angle);
  g.fillStyle(color, alpha);
  g.fillTriangle(
    x + c * SIZE,
    y + s * SIZE,
    x - c * SIZE - s * SIZE * 0.7,
    y - s * SIZE + c * SIZE * 0.7,
    x - c * SIZE + s * SIZE * 0.7,
    y - s * SIZE - c * SIZE * 0.7,
  );
}

export function createOffscreenIndicators(scene) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  return {
    update(world, player) {
      g.clear();
      if (!player.alive) return;
      const view = viewRect(scene.cameras.main, viewScratch);
      const { ships, planets } = world;
      const px = player.pos.x;
      const py = player.pos.y;
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        if (!s.alive || s.faction === player.faction) continue;
        drawArrow(g, view, s.pos.x, s.pos.y, px, py, PALETTE.factions[s.faction]);
      }
      let best = -1;
      let bestSq = Infinity;
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (p.owner === player.faction) continue;
        const dx = p.pos.x - px;
        const dy = p.pos.y - py;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestSq) {
          bestSq = dSq;
          best = i;
        }
      }
      if (best >= 0) {
        const p = planets[best];
        drawArrow(g, view, p.pos.x, p.pos.y, px, py, planetColor(p.owner));
      }
    },
  };
}
