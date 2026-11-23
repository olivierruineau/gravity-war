// Modes de l'IA (entiers : l'état `world.ai` reste JSON pur). Réexporté par bot.js (ADR 0006 §1).
// GOTO n'est pas un mode de jeu : but « rejoindre (goalX, goalY) et s'y arrêter », posé par un test ou le debug.
export const AI_MODE = {
  NONE: 0,
  IDLE: 1,
  CAPTURE: 2,
  ASSAULT: 3,
  HUNT: 4,
  DEFEND: 5,
  RETREAT: 6,
  REARM: 7,
  GOTO: 8,
};
