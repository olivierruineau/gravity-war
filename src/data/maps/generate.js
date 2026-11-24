// Générateur de carte seedé (9.9) : même graine, même carte. Comme « Triade », la carte a une symétrie de rotation
// d'ordre 3 autour du centre : les trois bases (planètes 0, 1, 2) sont à la même distance, à 120°, et chaque groupe de
// planètes neutres est posé en trois exemplaires tournés de 120°, donc aucune faction n'est avantagée.
// Contraintes (celles de « Triade », sur lesquelles l'IA est réglée) : surfaces à ≥ `MIN_GAP` px, portées de gravité
// disjointes (`GRAVITY_RANGE_FACTOR × (r1 + r2)` ≤ distance), tout dans la carte avec une marge.
// Pur : aucun Phaser, aucun DOM, aucun `Math.random` (l'aléa vient du RNG seedé de `core/rng.js`).
import { GRAVITY_RANGE_FACTOR } from '../../config.js';
import { hypot } from '../../core/math.js';
import { createRng, int, nextFloat, range } from '../../core/rng.js';

export const MAP_WIDTH = 2600;
export const MAP_HEIGHT = 2400;
const MARGIN = 60; // px entre une surface et le bord de la carte
const MIN_GAP = 120; // px entre deux surfaces
const TRIES = 300; // essais par planète avant d'abandonner le groupe
const BASE_RADIUS = 60;
const BASE_GRAVITY = 70;
const BASE_DISTANCE = [800, 950]; // base ↔ centre
const PERSONAL_DISTANCE = [380, 520]; // neutre « personnel » ↔ sa base
const GROUP_DISTANCE = [350, 1050]; // autres neutres ↔ centre
const GROUP_COUNT = [2, 4]; // groupes de 3 neutres (en plus du personnel et du centre)
const RADII = [30, 40, 50];
const CENTER_RADII = [50, 70];
const CENTER_CHANCE = 0.7;
const SEED_SALT = 0x51ed270b;
const THIRD = (2 * Math.PI) / 3;

const gravityFor = (radius) => Math.round(35 + 0.6 * radius); // 30 → 53, 50 → 65 (plafond du jeu : 84)

/** Les planètes ne se gênent pas : surfaces espacées et portées de gravité disjointes. */
function fits(planets, x, y, radius) {
  for (const p of planets) {
    const d = hypot(x - p.x, y - p.y);
    if (d - radius - p.radius < MIN_GAP) return false;
    if (d < GRAVITY_RANGE_FACTOR * (radius + p.radius)) return false;
  }
  return true;
}

const inside = (x, y, radius, width, height) =>
  x - radius >= MARGIN &&
  x + radius <= width - MARGIN &&
  y - radius >= MARGIN &&
  y + radius <= height - MARGIN;

/** Les trois exemplaires (0°, 120°, 240°) de (x, y) autour de (cx, cy). */
function triple(x, y, cx, cy) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const c = Math.cos(k * THIRD);
    const s = Math.sin(k * THIRD);
    out.push({
      x: Math.round(cx + (x - cx) * c - (y - cy) * s),
      y: Math.round(cy + (x - cx) * s + (y - cy) * c),
    });
  }
  return out;
}

/** Ajoute les trois exemplaires d'une planète si elle tient ; retourne vrai si elle a été posée. */
function tryAddGroup(planets, x, y, radius, cx, cy, width, height) {
  const copies = triple(x, y, cx, cy);
  const placed = [...planets];
  for (const c of copies) {
    if (!inside(c.x, c.y, radius, width, height) || !fits(placed, c.x, c.y, radius)) return false;
    placed.push({ x: c.x, y: c.y, radius });
  }
  for (const c of copies) planets.push({ x: c.x, y: c.y, radius, gravity: gravityFor(radius) });
  return true;
}

/**
 * @param {number} seed graine de la carte
 * @returns {{ width: number, height: number, planets: object[], spawns: object[] }} carte au format de `createWorld`
 *   (planètes 0, 1, 2 = bases des factions 0, 1, 2 ; les autres sont neutres)
 */
export function generateMap(seed) {
  const rng = createRng((seed ^ SEED_SALT) >>> 0);
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const planets = [];

  // Bases : la faction 0 en haut, les deux autres à 120° (bas droite, bas gauche).
  const baseDistance = range(rng, BASE_DISTANCE[0], BASE_DISTANCE[1]);
  const baseX = cx;
  const baseY = cy - baseDistance;
  for (const c of triple(baseX, baseY, cx, cy))
    planets.push({
      x: c.x,
      y: c.y,
      radius: BASE_RADIUS,
      gravity: BASE_GRAVITY,
      owner: planets.length,
      built: 1,
    });
  const bases = planets.length;

  // Astre central, une fois sur trois absent (`CENTER_CHANCE`).
  if (nextFloat(rng) < CENTER_CHANCE) {
    const radius = CENTER_RADII[int(rng, 0, CENTER_RADII.length)];
    if (fits(planets, cx, cy, radius))
      planets.push({ x: cx, y: cy, radius, gravity: gravityFor(radius) });
  }

  // Neutre « personnel » : près de chaque base (essais jusqu'à ce qu'il tienne).
  for (let t = 0; t < TRIES; t++) {
    const radius = RADII[int(rng, 0, RADII.length)];
    const angle = range(rng, 0, 2 * Math.PI);
    const dist = range(rng, PERSONAL_DISTANCE[0], PERSONAL_DISTANCE[1]);
    const x = baseX + Math.cos(angle) * dist;
    const y = baseY + Math.sin(angle) * dist;
    if (tryAddGroup(planets, Math.round(x), Math.round(y), radius, cx, cy, width, height)) break;
  }

  // Autres groupes de trois neutres.
  const groups = int(rng, GROUP_COUNT[0], GROUP_COUNT[1] + 1);
  for (let g = 0; g < groups; g++) {
    for (let t = 0; t < TRIES; t++) {
      const radius = RADII[int(rng, 0, RADII.length)];
      const angle = range(rng, 0, THIRD);
      const dist = range(rng, GROUP_DISTANCE[0], GROUP_DISTANCE[1]);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      if (tryAddGroup(planets, Math.round(x), Math.round(y), radius, cx, cy, width, height)) break;
    }
  }

  return { width, height, planets, spawns: planets.slice(0, bases).map((_, i) => ({ planet: i })) };
}
