// Rendu filaire des projectiles : un court trait dans le sens du mouvement, coloré par faction.
// Les missiles sont plus longs et plus épais, avec une petite pointe.
import { PALETTE } from '../config.js';
import { KIND } from '../core/projectile.js';

const TRAIL = 0.025; // longueur du trait en secondes de vol (≈ 8 px pour une balle à 320 px/s)
const MISSILE_LENGTH = 12; // px
const MISSILE_WIDTH = 2; // px
const MISSILE_HEAD = 3; // px, longueur des barbes de la pointe
const MISSILE_HEAD_ANGLE = 0.5; // rad, écart des barbes par rapport à l'axe

export function drawProjectiles(g, projectiles) {
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;
    const color = PALETTE.factions[p.owner] ?? PALETTE.neutral;
    if (p.kind === KIND.MISSILE) {
      drawMissile(g, p, color);
      continue;
    }
    g.lineStyle(1, color, 1);
    g.lineBetween(p.pos.x, p.pos.y, p.pos.x - p.vel.x * TRAIL, p.pos.y - p.vel.y * TRAIL);
  }
}

function drawMissile(g, p, color) {
  const heading = Math.atan2(p.vel.y, p.vel.x);
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  g.lineStyle(MISSILE_WIDTH, color, 1);
  g.lineBetween(p.pos.x, p.pos.y, p.pos.x - dx * MISSILE_LENGTH, p.pos.y - dy * MISSILE_LENGTH);
  // Barbes de la pointe, repliées vers l'arrière depuis la tête.
  g.lineStyle(1, color, 1);
  for (let side = -1; side <= 1; side += 2) {
    const a = heading + Math.PI + side * MISSILE_HEAD_ANGLE;
    g.lineBetween(
      p.pos.x,
      p.pos.y,
      p.pos.x + Math.cos(a) * MISSILE_HEAD,
      p.pos.y + Math.sin(a) * MISSILE_HEAD,
    );
  }
}
