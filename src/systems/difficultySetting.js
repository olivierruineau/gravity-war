// Réglage de la difficulté des bots (9.3, ADR 0010) : facile, normal, difficile. Mémorisé si le navigateur le permet.
import { DEFAULT_DIFFICULTY, DIFFICULTY_LEVELS } from '../data/ai.js';
import { cycleValue } from './cycleValue.js';

export const DIFFICULTY_LABELS = { easy: 'FACILE', normal: 'NORMAL', hard: 'DIFFICILE' };
const KEY = 'gravity-war.difficulty';

function load() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return DIFFICULTY_LEVELS.includes(saved) ? saved : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

let mode = load();

export const getDifficultyMode = () => mode;

/** Niveau passé à `createWorld`. */
export const resolveDifficulty = () => mode;

export function cycleDifficultyMode(dir = 1) {
  mode = cycleValue(DIFFICULTY_LEVELS, mode, dir);
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // le réglage vaut pour la session
  }
  return mode;
}

/** Remise à zéro (tests). */
export function resetDifficultyMode() {
  mode = DEFAULT_DIFFICULTY;
}
