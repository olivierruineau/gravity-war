// Couche « décision » de l'IA (ADR 0006 §3), appelée toutes les `decisionPeriod` secondes : score d'utilité de
// chaque couple (mode, cible), hystérésis (bonus d'engagement et verrou `minCommit`), bannissement des cibles
// bloquées, bruit tiré dans `world.aiRng`. Modes décidés : CAPTURE, ASSAULT, HUNT, DEFEND, RETREAT, REARM, IDLE. Les buts posés de l'extérieur
// (GOTO, LAND : tests et debug) ne sont jamais remplacés. Aucune allocation : le meilleur candidat est gardé dans
// `best`, un scratch de module.
import { FIXED_DT, MISSILE_STOCK_MAX, SHIELD_MAX, SHIP_MAX_HP } from '../../config.js';
import { BOT_PROFILE as P, botProfile } from '../../data/ai.js';
import { BUILDINGS } from '../../data/buildings.js';
import { defenseRange, hasDefenses, hasMissileFactory } from '../building.js';
import { clamp, hypot } from '../math.js';
import { range } from '../rng.js';
import { AI_MODE } from './mode.js';
import { TOUCHDOWN_PHASE } from './touchdown.js';

const { NONE, IDLE, CAPTURE, ASSAULT, HUNT, DEFEND, RETREAT, REARM, GOTO, LAND } = AI_MODE;

// Scores d'engagement (finis : Infinity ne se départagerait pas). Un option verrouillée par `minCommit` bat tout
// candidat normal ; un candidat urgent (RETREAT, DEFEND d'une capture en cours) bat même une option verrouillée.
const COMMIT_LOCK = 1e6;
const PREEMPT = 1e9;

const best = { mode: NONE, target: -1, score: -Infinity };

/** 1 / (1 + trajet / travelScale), le trajet étant `gap` parcouru à `cruiseSpeed`. */
function closeness(gap) {
  return 1 / (1 + gap / P.cruiseSpeed / P.travelScale);
}

/** Distance de la surface de la planète au vaisseau (jamais négative), en trajet à `cruiseSpeed`. */
function proximity(ship, planet) {
  const gap = Math.max(
    0,
    hypot(planet.pos.x - ship.pos.x, planet.pos.y - ship.pos.y) - planet.radius,
  );
  return closeness(gap);
}

/** PV cumulés des tourelles construites : plus elles tiennent, moins l'assaut est tentant. */
function turretHp(planet) {
  let hp = 0;
  for (let s = 0; s < BUILDINGS.length; s++) {
    if (BUILDINGS[s].turret !== undefined && planet.buildings[s].built)
      hp += planet.buildings[s].hp;
  }
  return hp;
}

/** Vrai si (x, y) est dans la portée des tourelles d'une planète qui n'est pas à `faction`. */
function underEnemyTurrets(planets, x, y, faction) {
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (p.owner === faction) continue;
    const reach = defenseRange(p);
    if (reach > 0 && hypot(x - p.pos.x, y - p.pos.y) - p.radius < reach) return true;
  }
  return false;
}

/** Vrai si un autre vaisseau vivant, d'une autre faction, est posé sur la planète `index`. */
function occupiedByOther(ships, index, faction) {
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (s.alive && s.faction !== faction && s.landedOn === index) return true;
  }
  return false;
}

/**
 * Vrai si un vaisseau vivant d'une autre faction est à moins de `reach` px de la surface de la planète. Posé,
 * il ne compte que si `landed` (un ennemi qui capture ailleurs ne menace pas cette planète).
 */
function enemyWithin(ships, planet, faction, reach, landed) {
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (!s.alive || s.faction === faction || (!landed && s.landedOn >= 0)) continue;
    if (hypot(s.pos.x - planet.pos.x, s.pos.y - planet.pos.y) - planet.radius < reach) return true;
  }
  return false;
}

/** Vrai si un vaisseau vivant d'une autre faction est à moins de `reach` px du vaisseau `ship`. */
function enemyNearShip(ships, ship, reach) {
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (!s.alive || s.faction === ship.faction) continue;
    if (hypot(s.pos.x - ship.pos.x, s.pos.y - ship.pos.y) < reach) return true;
  }
  return false;
}

/** Vrai si la planète a été touchée depuis moins de `defendMemory` secondes. */
function isRecentlyHit(world, planet) {
  return planet.lastHitTick >= 0 && (world.tick - planet.lastHitTick) * FIXED_DT < P.defendMemory;
}

/**
 * Menace sur une planète possédée, en facteur de DEFEND : `defendUrgent` si un ennemi y est posé, 1 si elle a été
 * touchée depuis moins de `defendMemory` (planet.lastHitTick), `defendNearFactor` si un ennemi rôde à moins de
 * `defendRadius`, 0 sinon.
 */
function defendUrgency(world, planet, index, faction) {
  const { ships } = world;
  for (let k = 0; k < ships.length; k++) {
    if (ships[k].alive && ships[k].faction !== faction && ships[k].landedOn === index)
      return P.defendUrgent;
  }
  if (isRecentlyHit(world, planet)) return 1;
  return enemyWithin(ships, planet, faction, P.defendRadius, false) ? P.defendNearFactor : 0;
}

function builtSlots(planet) {
  let count = 0;
  for (let s = 0; s < planet.buildings.length; s++) if (planet.buildings[s].built) count++;
  return count;
}

/**
 * Faction adverse en jeu qui a strictement le plus de planètes (−1 si aucune, ou si plusieurs sont à égalité) :
 * ses cibles reçoivent `leaderBonus`. Une égalité ne désigne personne : départager par l'indice ferait de la
 * faction 0 la cible permanente des deux autres au début de partie (biais mesuré en 7.2).
 */
export function leaderOf(factions, faction) {
  let leader = -1;
  let most = 0;
  for (let f = 0; f < factions.length; f++) {
    if (f === faction || factions[f].eliminated) continue;
    const count = factions[f].planetCount;
    if (count > most) {
      most = count;
      leader = f;
    } else if (count === most) leader = -1;
  }
  return leader;
}

/** Même option : même couple, ou ASSAULT puis CAPTURE de la même planète (la tourelle tombée, on enchaîne). */
function sameOption(modeA, targetA, modeB, targetB) {
  if (targetA !== targetB) return false;
  return (
    modeA === modeB ||
    (modeA === ASSAULT && modeB === CAPTURE) ||
    (modeA === CAPTURE && modeB === ASSAULT)
  );
}

/**
 * Propose un candidat : applique le bannissement, le bruit (±`scoreNoise`) et l'hystérésis, puis garde le meilleur.
 * L'option en cours reçoit `commitBonus`, et un score de verrou pendant `minCommit` sauf pour IDLE ; `urgent`
 * ajoute `PREEMPT`, qui passe devant ce verrou.
 */
function offer(world, bot, mode, target, score, urgent = false) {
  if (bot.banTimer > 0 && bot.banMode === mode && bot.banTarget === target) return;
  let s = score * (1 + range(world.aiRng, -P.scoreNoise, P.scoreNoise));
  if (sameOption(bot.mode, bot.target, mode, target)) {
    s = mode !== IDLE && bot.modeTime < P.minCommit ? COMMIT_LOCK : s * P.commitBonus;
  }
  if (urgent) s = Math.max(s, 0) + PREEMPT;
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
  // Anti-blocage : une option offensive trop longue est abandonnée et sa cible bannie (un seul emplacement).
  if (
    (bot.mode === CAPTURE || bot.mode === ASSAULT || bot.mode === HUNT || bot.mode === DEFEND) &&
    bot.modeTime > P.giveUpTime
  ) {
    bot.banMode = bot.mode;
    bot.banTarget = bot.target;
    bot.banTimer = P.banTime;
  }

  bot.aimBias = range(world.aiRng, -botProfile(bot.level).aimError, botProfile(bot.level).aimError); // biais de visée : retiré à chaque décision
  best.mode = NONE;
  best.target = -1;
  best.score = -Infinity;
  const leader = leaderOf(factions, faction);
  const { aggression } = botProfile(bot.level);
  const healthFactor = clamp(health / SHIP_MAX_HP, P.healthFloor, 1);
  const canAssault = health >= P.assaultMinHealth;
  const wantRearm =
    factions[faction].hasMissiles &&
    (ship.missiles < P.rearmBelow || (bot.mode === REARM && ship.missiles < MISSILE_STOCK_MAX));
  // Repli : PV bas et en danger (touché, ennemi proche, ou déjà en route vers l'abri : on ne renonce pas en
  // vol). Une fois posé, on reste à l'abri tant que le bouclier se recharge (les PV, eux, ne reviennent pas :
  // sans bouclier, le repli ne dure que le temps de la menace).
  const recovering =
    bot.mode === RETREAT && factions[faction].hasShield && ship.shield < SHIELD_MAX;
  const fleeing = bot.mode === RETREAT && ship.landedOn !== bot.target;
  const inDanger =
    health < P.lowHealth &&
    (bot.underFire || fleeing || enemyNearShip(ships, ship, P.retreatThreat));
  const severity = Math.max(
    1 - Math.min(health, P.lowHealth) / P.lowHealth,
    recovering ? P.retreatHold : 0,
  );
  let idleTarget = -1;
  let idleGap = Infinity;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (p.owner === faction) {
      if (wantRearm && hasMissileFactory(p)) {
        const missing = (MISSILE_STOCK_MAX - ship.missiles) / MISSILE_STOCK_MAX;
        offer(world, bot, REARM, i, P.rearm * missing * proximity(ship, p));
      }
      const urgency = defendUrgency(world, p, i, faction);
      if (urgency > 0) {
        const score = P.defend * urgency * (1 + P.slotValue * builtSlots(p)) * healthFactor;
        offer(world, bot, DEFEND, i, score * proximity(ship, p), urgency >= P.defendUrgent);
      }
      if (
        (inDanger || recovering) &&
        !enemyWithin(ships, p, faction, P.retreatSafe, true) &&
        !isRecentlyHit(world, p)
      ) {
        const score = P.retreat * severity * (1 + P.slotValue * builtSlots(p));
        offer(world, bot, RETREAT, i, score * proximity(ship, p), true);
      }
      const gap = hypot(ship.pos.x - p.pos.x, ship.pos.y - p.pos.y) - p.radius;
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
    } else if (canAssault) {
      // Planète ennemie défendue : tourelles d'abord (ADR 0007), la capture suivra.
      let score = P.assault * aggression * P.assaultFactor * (1 + P.slotValue * builtSlots(p));
      score *= (healthFactor * proximity(ship, p)) / (1 + turretHp(p) / P.turretHpScale);
      if (p.owner === leader) score *= P.leaderBonus;
      offer(world, bot, ASSAULT, i, score);
    }
  }
  for (let k = 0; k < ships.length; k++) {
    const other = ships[k];
    if (!other.alive || other.faction === faction) continue;
    const gap = hypot(other.pos.x - ship.pos.x, other.pos.y - ship.pos.y);
    if (gap >= P.huntRange) continue;
    let score = P.hunt * aggression * healthFactor * closeness(gap);
    if (underEnemyTurrets(planets, other.pos.x, other.pos.y, faction)) score *= P.shelterFactor;
    if (other.faction === leader) score *= P.leaderBonus;
    offer(world, bot, HUNT, k, score);
  }
  offer(world, bot, IDLE, idleTarget, P.idle);

  if (best.mode === bot.mode && best.target === bot.target) return;
  // ASSAULT → CAPTURE de la même planète ne repart pas de zéro (engagement, délai anti-blocage conservés).
  const continued = sameOption(bot.mode, bot.target, best.mode, best.target);
  bot.mode = best.mode;
  bot.target = best.target;
  if (!continued) {
    bot.modeTime = 0;
    bot.fireDelay = botProfile(bot.level).reactionTime;
  }
  if (bot.phase !== TOUCHDOWN_PHASE.TAKEOFF) bot.phase = 0;
  // Sans planète où se poser, IDLE attend sur place : point d'attente = position au moment du choix.
  bot.goalX = ship.pos.x;
  bot.goalY = ship.pos.y;
}
