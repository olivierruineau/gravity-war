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

/** Catalogue des sons : nom → paramètres ZzFX. */
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
};

export function playSfx(name) {
  const params = SOUNDS[name];
  if (enabled && params) zzfx(...params);
}
