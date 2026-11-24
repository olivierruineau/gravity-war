// Réglage à choix dans une liste, mémorisé dans `localStorage` si le navigateur le permet.
import { cycleValue } from './cycleValue.js';

/**
 * @template T
 * @param {string} key clé de stockage
 * @param {T[]} values valeurs permises, en ordre de cycle
 * @param {T} fallback valeur par défaut
 * @param {(raw: string) => T} [parse] conversion de la valeur stockée (texte) vers `T`
 */
export function persistedChoice(key, values, fallback, parse = (raw) => raw) {
  function load() {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      const value = raw === null || raw === undefined ? undefined : parse(raw);
      return values.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  let current = load();
  return {
    get: () => current,
    /** Valeur suivante (`dir` = 1) ou précédente (−1) ; retenue. */
    cycle(dir = 1) {
      current = cycleValue(values, current, dir);
      try {
        globalThis.localStorage?.setItem(key, String(current));
      } catch {
        // le réglage vaut pour la session
      }
      return current;
    },
    reset() {
      current = fallback;
    },
  };
}
