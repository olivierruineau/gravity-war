// Qualité d'affichage (8.9) : réglage auto / haute / basse, et moniteur de cadence pour le mode auto.
// Un seul degré de dégradation pour l'instant : la lueur filaire (≈ le double de traits dessinés). Le moniteur est pur.
import { cycleValue } from './cycleValue.js';
import { QUALITY_LOW_FPS, QUALITY_WARMUP, QUALITY_WINDOW } from '../config.js';

export const QUALITY_MODES = ['auto', 'high', 'low'];
export const QUALITY_LABELS = { auto: 'AUTO', high: 'HAUTE', low: 'BASSE' };
const KEY = 'gravity-war.quality';
const MAX_SAMPLE = 0.25; // s

function load() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return QUALITY_MODES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

let mode = load();
let autoLow = false; // le moniteur a constaté une cadence trop basse (collant pour la session)

export const getQualityMode = () => mode;

/** La lueur est-elle dessinée ? « auto » la garde tant que la cadence tient. */
export const isGlowOn = () => mode === 'high' || (mode === 'auto' && !autoLow);

export function cycleQualityMode(dir = 1) {
  mode = cycleValue(QUALITY_MODES, mode, dir);
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // le réglage vaut pour la session
  }
  return mode;
}

/** Le canvas est-il ramené à la taille de jeu (9.5) ? Même condition que la lueur coupée : appareil lent ou qualité BASSE. */
export const isRenderLow = () => mode === 'low' || (mode === 'auto' && autoLow);

/** Appelé par le moniteur quand la cadence est trop basse. */
export function markAutoLow() {
  autoLow = true;
}

/** Remise à zéro (tests). */
export function resetQuality() {
  mode = 'auto';
  autoLow = false;
}

/**
 * Moniteur de cadence : alimenté par la durée de chaque frame, il décide après le temps de chauffe puis sur une
 * fenêtre glissante par blocs. Pas d'allocation. `onLow` n'est appelé qu'une fois.
 */
export function createFrameMonitor(
  onLow,
  { warmup = QUALITY_WARMUP, window = QUALITY_WINDOW, lowFps = QUALITY_LOW_FPS } = {},
) {
  let elapsed = 0;
  let frames = 0;
  let windowTime = 0;
  let fired = false;
  return {
    /** @param {number} dt durée de la frame en secondes */
    sample(dt) {
      if (fired || dt > MAX_SAMPLE) return; // une longue pause (onglet masqué) n'est pas une machine lente
      elapsed += dt;
      if (elapsed < warmup) return;
      frames++;
      windowTime += dt;
      if (windowTime < window) return;
      if (frames / windowTime < lowFps) {
        fired = true;
        onLow();
      }
      frames = 0;
      windowTime = 0;
    },
  };
}
