// Effets sonores synthétisés avec ZzFX (~1 Ko, esprit chiptune, zéro fichier audio).
// Générateur de paramètres : https://killedbyapixel.github.io/ZzFX/
import { zzfx, ZZFX } from 'zzfx';

let enabled = true;

export function setSfxEnabled(value) {
  enabled = value;
}

/** Les navigateurs exigent un geste utilisateur avant de jouer du son : appeler après un clic/touche. */
export function resumeAudio() {
  if (ZZFX.audioContext?.state === 'suspended') ZZFX.audioContext.resume();
}

/**
 * Catalogue des sons : nom → paramètres ZzFX
 * [volume, aléa, fréquence, attaque, tenue, relâche, forme, courbe, glissando, delta, saut, délai-saut, répétition, bruit].
 */
const SOUNDS = {
  select: [
    1,
    undefined,
    440,
    undefined,
    0.02,
    0.05,
    undefined,
    1.2,
    undefined,
    undefined,
    200,
    0.03,
  ],
  shot: [0.35, 0.05, 800, 0, 0.01, 0.07, 2, 2, -40],
  explosion: [1, 0.1, 80, 0.01, 0.1, 0.5, 4, 3, -5, 0, 0, 0, 0, 2],
  impact: [0.6, 0.1, 150, 0, 0.02, 0.12, 4, 1, -10, 0, 0, 0, 0, 1],
  hit: [0.5, 0.1, 300, 0, 0.01, 0.06, 3, 1, -5, 0, 0, 0, 0, 0.5],
  tick: [0.2, 0.1, 500, 0, 0, 0.03, 4],
  landed: [0.5, 0, 220, 0.01, 0.03, 0.15, 1, 1.5, 0, 0, 50, 0.05],
  respawn: [0.5, 0, 300, 0.02, 0.1, 0.3, 0, 1, 15, 0, 100, 0.1],
  turretShot: [0.2, 0.05, 300, 0, 0.01, 0.05, 2, 2, -20],
  turretDestroyed: [0.8, 0.1, 100, 0.01, 0.08, 0.35, 4, 2, -4, 0, 0, 0, 0, 1.5],
  built: [0.5, 0, 440, 0.01, 0.05, 0.15, 1, 1, 0, 0, 150, 0.05],
  captured: [0.6, 0, 523, 0.01, 0.1, 0.3, 1, 1, 0, 0, 150, 0.08, 0.1],
  missileLaunch: [0.4, 0.1, 200, 0.02, 0.05, 0.3, 4, 1, 10, 0, 0, 0, 0, 1],
  rearm: [0.3, 0, 900, 0, 0.01, 0.08, 1, 1, 0, 0, 300, 0.02],
  eliminated: [0.8, 0.1, 200, 0.02, 0.2, 0.6, 3, 2, -15, 0, 0, 0, 0, 1],
  gameOver: [0.8, 0, 220, 0.05, 0.3, 0.8, 1, 1.5, -3, 0, -50, 0.15],
  thrust: [0.12, 0.3, 60, 0, 0.05, 0.1, 4, 1, 0, 0, 0, 0, 0, 3],
};

// Pré-calculé au chargement : volume de base séparé du reste, pour ne rien allouer à chaque appel.
const BASE_VOLUME = {};
const REST = {};
for (const name of Object.keys(SOUNDS)) {
  BASE_VOLUME[name] = SOUNDS[name][0];
  REST[name] = SOUNDS[name].slice(1);
}

/** `volume` ∈ [0, 1] multiplie le volume de base du son (atténuation par la distance, voir audioEvents). */
export function playSfx(name, volume = 1) {
  const rest = REST[name];
  if (!enabled || !rest || volume <= 0) return;
  zzfx(BASE_VOLUME[name] * volume, ...rest);
}
