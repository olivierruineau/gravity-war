// Réglage de la difficulté des bots (9.3, 9.4, ADR 0010) : auto, facile, normal, difficile. Mémorisé si le navigateur le permet.
// « auto » (défaut) : facile quand la dernière source utilisée est le tactile (le jeu y est plus dur), normal au clavier.
import { DEFAULT_DIFFICULTY, DIFFICULTY_LEVELS } from '../data/ai.js';
import { cycleValue } from './cycleValue.js';
import { isTouch } from './inputSource.js';

export const DIFFICULTY_MODES = ['auto', ...DIFFICULTY_LEVELS];
export const DIFFICULTY_LABELS = {
  auto: 'AUTO',
  easy: 'FACILE',
  normal: 'NORMAL',
  hard: 'DIFFICILE',
};
export const TOUCH_DIFFICULTY = 'easy';
const KEY = 'gravity-war.difficulty';

function load() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return DIFFICULTY_MODES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

let mode = load();

export const getDifficultyMode = () => mode;

/** Niveau réel passé à `createWorld` : « auto » suit la dernière source utilisée. */
export const resolveDifficulty = () =>
  mode === 'auto' ? (isTouch() ? TOUCH_DIFFICULTY : DEFAULT_DIFFICULTY) : mode;

export function cycleDifficultyMode(dir = 1) {
  mode = cycleValue(DIFFICULTY_MODES, mode, dir);
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // le réglage vaut pour la session
  }
  return mode;
}

/** Remise à zéro (tests). */
export function resetDifficultyMode() {
  mode = 'auto';
}
