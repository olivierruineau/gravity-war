// Couche « décision » de l'IA (ADR 0006 §3), appelée toutes les `decisionPeriod` secondes : score d'utilité de
// chaque couple (mode, cible), hystérésis (bonus d'engagement et verrou `minCommit`), bannissement des cibles
// bloquées, bruit tiré dans `world.aiRng`. Modes décidés : CAPTURE, REARM, IDLE. Les buts posés de l'extérieur
// (GOTO, LAND : tests et debug) ne sont jamais remplacés. Aucune allocation : le meilleur candidat est gardé dans
// `best`, un scratch de module.
import { MISSILE_STOCK_MAX } from '../../config.js';
import { BOT_PROFILE as P } from '../../data/ai.js';
import { hasDefenses, hasMissileFactory } from '../building.js';
import { range } from '../rng.js';
import { AI_MODE } from './mode.js';
import { TOUCHDOWN_PHASE } from './touchdown.js';

const { NONE, IDLE, CAPTURE, REARM, GOTO, LAND } = AI_MODE;

const best = { mode: NONE, target: -1, score: -Infinity };

/** Distance de la surface de la planète au vaisseau (jamais négative), en trajet à `cruiseSpeed`. */
function proximity(ship, planet) {
  const gap = Math.max(
    0,
    Math.hypot(planet.pos.x - ship.pos.x, planet.pos.y - ship.pos.y) - planet.radius,
  );
  return 1 / (1 + gap / P.cruiseSpeed / P.travelScale);
}

/** Vrai si un autre vaisseau vivant, d'une autre faction, est posé sur la planète `index`. */
function occupiedByOther(ships, index, faction) {
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (s.alive && s.faction !== faction && s.landedOn === index) return true;
  }
  return false;
}

function builtSlots(planet) {
  let count = 0;
  for (let s = 0; s < planet.buildings.length; s++) if (planet.buildings[s].built) count++;
  return count;
}

/** Faction adverse en jeu qui a le plus de planètes (−1 si aucune) : ses cibles reçoivent `leaderBonus`. */
function leaderOf(factions, faction) {
  let leader = -1;
  let most = 0;
  for (let f = 0; f < factions.length; f++) {
    if (f === faction || factions[f].eliminated || factions[f].planetCount <= most) continue;
    most = factions[f].planetCount;
    leader = f;
  }
  return leader;
}

/**
 * Propose un candidat : applique le bannissement, le bruit (±`scoreNoise`) et l'hystérésis, puis garde le meilleur.
 * L'option en cours reçoit `commitBonus`, et un score infini (verrou) pendant `minCommit` sauf pour IDLE.
 */
function offer(world, bot, mode, target, score) {
  if (bot.banTimer > 0 && bot.banMode === mode && bot.banTarget === target) return;
  let s = score * (1 + range(world.aiRng, -P.scoreNoise, P.scoreNoise));
  if (bot.mode === mode && bot.target === target) {
    s = mode !== IDLE && bot.modeTime < P.minCommit ? Infinity : s * P.commitBonus;
  }
  if (s > best.score) {
    best.mode = mode;
    best.target = target;
    best.score = s;
  }
}

/**
 * Décide du but du bot : met à jour `underFire`, puis choisit (mode, cible) par utilité. Si le couple change,
 * `phase` et `modeTime` repartent de zéro (sauf un décollage en cours, qui vaut pour tous les modes).
 * @param {object} world
 * @param {object} bot   état du bot (`world.ai[k]`)
 * @param {object} ship  vaisseau du bot, vivant
 */
export function decide(world, bot, ship) {
  const health = ship.hp + ship.shield;
  bot.underFire = health < bot.lastHealth;
  bot.lastHealth = health;
  if (bot.mode === GOTO || bot.mode === LAND) return;

  const { planets, ships, factions } = world;
  const faction = bot.faction;
  // Anti-blocage : une capture trop longue est abandonnée et sa cible bannie (un seul emplacement).
  if (bot.mode === CAPTURE && bot.modeTime > P.giveUpTime) {
    bot.banMode = CAPTURE;
    bot.banTarget = bot.target;
    bot.banTimer = P.banTime;
  }

  best.mode = NONE;
  best.target = -1;
  best.score = -Infinity;
  const leader = leaderOf(factions, faction);
  const wantRearm =
    factions[faction].hasMissiles &&
    (ship.missiles < P.rearmBelow || (bot.mode === REARM && ship.missiles < MISSILE_STOCK_MAX));
  let idleTarget = -1;
  let idleGap = Infinity;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (p.owner === faction) {
      if (wantRearm && hasMissileFactory(p)) {
        const missing = (MISSILE_STOCK_MAX - ship.missiles) / MISSILE_STOCK_MAX;
        offer(world, bot, REARM, i, P.rearm * missing * proximity(ship, p));
      }
      const gap = Math.hypot(ship.pos.x - p.pos.x, ship.pos.y - p.pos.y) - p.radius;
      // Reste sur la planète d'attente actuelle tant qu'elle est possédée : pas d'aller-retour entre deux bases.
      if (bot.mode === IDLE && bot.target === i) {
        idleTarget = i;
        idleGap = -Infinity;
      } else if (gap < idleGap) {
        idleTarget = i;
        idleGap = gap;
      }
    } else if (!hasDefenses(p)) {
      let score = P.capture * (1 + P.slotValue * builtSlots(p)) * proximity(ship, p);
      if (p.owner >= 0) score *= P.enemyCaptureFactor;
      if (p.owner === leader) score *= P.leaderBonus;
      if (occupiedByOther(ships, i, faction)) score *= P.occupiedFactor;
      offer(world, bot, CAPTURE, i, score);
    }
  }
  offer(world, bot, IDLE, idleTarget, P.idle);

  if (best.mode === bot.mode && best.target === bot.target) return;
  bot.mode = best.mode;
  bot.target = best.target;
  bot.modeTime = 0;
  if (bot.phase !== TOUCHDOWN_PHASE.TAKEOFF) bot.phase = 0;
  // Sans planète où se poser, IDLE attend sur place : point d'attente = position au moment du choix.
  bot.goalX = ship.pos.x;
  bot.goalY = ship.pos.y;
}
