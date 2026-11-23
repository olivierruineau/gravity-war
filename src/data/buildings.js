// Catalogue des bâtiments (ADR 0005 §3). L'ordre du tableau = ordre de développement = index du slot.
// `range` est mesurée depuis la surface de la planète (px), `spread` est un demi-angle (rad).
export const BUILDINGS = [
  {
    id: 'turret',
    buildTime: 20,
    turret: { hp: 80, range: 150, cooldown: 1.0, damage: 6, speed: 200, life: 1.0, spread: 0.1 },
  },
  { id: 'missileFactory', buildTime: 30, grants: 'missiles' },
  { id: 'shieldGenerator', buildTime: 40, grants: 'shield' },
  {
    id: 'heavyTurret',
    buildTime: 45,
    turret: { hp: 160, range: 200, cooldown: 0.6, damage: 8, speed: 240, life: 1.1, spread: 0.06 },
  },
];
