// Lueur filaire (7.3) : à appeler AVANT le trait net, avec les mêmes coordonnées.
// Coupée en qualité basse (8.9) : le trait net, lui, est toujours dessiné.
import { GLOW_ALPHA, GLOW_WIDTH } from '../config.js';
import { isGlowOn } from '../systems/quality.js';

export function glowCircle(g, x, y, radius, color, alpha = 1) {
  if (!isGlowOn()) return;
  g.lineStyle(GLOW_WIDTH, color, alpha * GLOW_ALPHA);
  g.strokeCircle(x, y, radius);
}

export function glowLine(g, x1, y1, x2, y2, color, alpha = 1, width = GLOW_WIDTH) {
  if (!isGlowOn()) return;
  g.lineStyle(width, color, alpha * GLOW_ALPHA);
  g.lineBetween(x1, y1, x2, y2);
}

export function glowTriangle(g, x1, y1, x2, y2, x3, y3, color, alpha = 1) {
  if (!isGlowOn()) return;
  g.lineStyle(GLOW_WIDTH, color, alpha * GLOW_ALPHA);
  g.strokeTriangle(x1, y1, x2, y2, x3, y3);
}
