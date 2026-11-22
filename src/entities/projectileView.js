// Rendu filaire des projectiles : un court trait dans le sens du mouvement, coloré par faction.
import { PALETTE } from '../config.js';

const TRAIL = 0.025; // longueur du trait en secondes de vol (≈ 8 px pour une balle à 320 px/s)

export function drawProjectiles(g, projectiles) {
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;
    g.lineStyle(1, PALETTE.factions[p.owner] ?? PALETTE.neutral, 1);
    g.lineBetween(p.pos.x, p.pos.y, p.pos.x - p.vel.x * TRAIL, p.pos.y - p.vel.y * TRAIL);
  }
}
