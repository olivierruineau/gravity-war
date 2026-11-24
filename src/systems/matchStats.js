// Statistiques de partie (9.10), pures : alimentées par les événements du core à chaque image (avant qu'ils soient
// vidés), lues à l'écran de fin. Aucune règle de jeu ici : on ne fait que compter ce que le core annonce.
import { FIXED_DT } from '../config.js';
import { EVT } from '../core/events.js';
import { FACTION_NAMES } from './spectator.js';

export function createMatchStats() {
  return { captured: [0, 0, 0], lost: [0, 0, 0] };
}

/** Compte les captures (par faction) et les pertes de vaisseaux (l'index d'un vaisseau est sa faction). */
export function recordEvents(stats, events) {
  for (let i = 0; i < events.count; i++) {
    const e = events.items[i];
    if (e.type === EVT.CAPTURED) stats.captured[e.b]++;
    else if (e.type === EVT.EXPLOSION) stats.lost[e.a]++;
  }
}

/** « 6:05 » */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const ownedBy = (world, faction) => world.planets.filter((p) => p.owner === faction).length;

/**
 * Lignes du résumé de fin. Au jeu : la partie du joueur ; en observation : une ligne par faction en jeu.
 * @param {{ mapLabel: string, seed: number, spectator: boolean }} match
 */
export function summaryLines(stats, world, { mapLabel, seed, spectator }) {
  const lines = [`DUREE ${formatDuration(world.tick * FIXED_DT)}`];
  const total = world.planets.length;
  if (spectator) {
    for (let f = 0; f < stats.captured.length; f++) {
      if (!world.inGame[f]) continue;
      lines.push(
        `${FACTION_NAMES[f].padEnd(6)} PLANETES ${ownedBy(world, f)}  CAPTURES ${stats.captured[f]}  PERTES ${stats.lost[f]}`,
      );
    }
  } else {
    lines.push(`PLANETES ${ownedBy(world, 0)}/${total}`);
    lines.push(`CAPTURES ${stats.captured[0]}   PERTES ${stats.lost[0]}`);
  }
  lines.push(`CARTE ${mapLabel} #${seed}`);
  return lines;
}
