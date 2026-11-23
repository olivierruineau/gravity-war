// Modes de l'IA (entiers : l'état `world.ai` reste JSON pur). Réexporté par bot.js (ADR 0006 §1).
// LAND : but « se poser sur la planète `bot.target` » (brique de CAPTURE, DEFEND, RETREAT, REARM, IDLE ; ADR 0006 §4.4).
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
  LAND: 9,
};

/** Vrai si le but du bot est de se poser sur la planète `bot.target` (IDLE sans planète attend sur place). */
export function isLanding(bot) {
  const { mode } = bot;
  return (
    mode === AI_MODE.LAND ||
    mode === AI_MODE.CAPTURE ||
    mode === AI_MODE.REARM ||
    (mode === AI_MODE.IDLE && bot.target >= 0)
  );
}
