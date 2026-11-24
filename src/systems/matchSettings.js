// Réglages de la partie (9.9) : nombre de bots (1 ou 2) et carte (générée depuis la graine, ou « Triade »).
import { MAP_MODES } from '../data/maps/index.js';
import { persistedChoice } from './persistedChoice.js';

export const BOT_COUNTS = [1, 2];
export const MAP_LABELS = { random: 'ALEATOIRE', triad: 'TRIADE' };

const bots = persistedChoice('gravity-war.bots', BOT_COUNTS, 2, Number);
const map = persistedChoice('gravity-war.map', MAP_MODES, 'random');

export const getBotCount = bots.get;
export const cycleBotCount = bots.cycle;
export const getMapMode = map.get;
export const cycleMapMode = map.cycle;

/** Remise à zéro (tests). */
export function resetMatchSettings() {
  bots.reset();
  map.reset();
}

/**
 * Graine imposée par l'adresse (`?seed=123`), pour rejouer ou partager une carte ; `null` sinon.
 * @param {string} search `location.search`
 */
export function seedFromSearch(search) {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 0xffffffff ? value : null;
}
