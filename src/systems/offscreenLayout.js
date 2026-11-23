// Géométrie des indicateurs hors écran (6.3), pure et testée sans Phaser.

/**
 * Si la cible (tx, ty) est hors du cadre de la caméra, point où le rayon centre → cible coupe le cadre réduit de
 * `inset` px, et angle de la flèche (rad, 0 = vers +x). Sinon `false`. Écrit dans `out`, sans allocation.
 * @param {{ x: number, y: number, width: number, height: number }} view cadre visible en coordonnées monde
 * @param {{ x: number, y: number, angle: number }} out
 * @param {number} margin distance au-delà du bord avant laquelle la cible compte comme visible (px monde)
 */
export function edgeIndicator(view, tx, ty, inset, margin, out) {
  const cx = view.x + view.width / 2;
  const cy = view.y + view.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const halfW = view.width / 2;
  const halfH = view.height / 2;
  if (Math.abs(dx) <= halfW + margin && Math.abs(dy) <= halfH + margin) return false;
  // Facteur d'échelle ramenant (dx, dy) sur le bord du rectangle réduit : le plus contraignant des deux axes.
  const sx = dx === 0 ? Infinity : (halfW - inset) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (halfH - inset) / Math.abs(dy);
  const s = Math.min(sx, sy);
  out.x = cx + dx * s;
  out.y = cy + dy * s;
  out.angle = Math.atan2(dy, dx);
  return true;
}
