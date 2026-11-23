// Couche « pilote » de l'IA (ADR 0006 §4), appelée à chaque pas : traduit le but du bot en intentions discrètes,
// les mêmes que celles du joueur. Réflexe anti-crash (§4.3) et aiguillage par mode ; navigation dans navigate.js,
// atterrissage/décollage dans touchdown.js ; le combat viendra s'y ajouter.
import { SHIP_COLLISION_RADIUS, SHIP_THRUST } from '../../config.js';
import { BOT_PROFILE as P } from '../../data/ai.js';
import { resetIntent } from '../intent.js';
import { predictPath } from '../predict.js';
import { AI_MODE } from './mode.js';
import { flyTo, thrustToward } from './navigate.js';
import { land, takeoff } from './touchdown.js';

const CRASH_MARGIN = SHIP_COLLISION_RADIUS + P.clearance; // même marge que le contournement

const path = { hit: -1, t: 0, x: 0, y: 0, vx: 0, vy: 0 };

/**
 * Réflexe anti-crash : si le vol sans poussée touche une planète dans l'horizon `avoidHorizon`, accélère vers
 * l'extérieur au point de contact prévu, en gardant la composante tangentielle de la vitesse (on s'écarte sans
 * perdre son élan). Retourne vrai si le réflexe a pris la main. Un vaisseau posé n'est pas concerné, et la planète
 * `exempt` (cible d'un atterrissage, gérée par touchdown.js) non plus ; −1 pour n'en exempter aucune.
 */
function avoidCrash(world, ship, intent, exempt) {
  if (ship.landedOn >= 0) return false;
  predictPath(path, ship.pos, ship.vel, world.planets, CRASH_MARGIN, P.avoidHorizon, P.predictDt);
  if (path.hit < 0 || path.hit === exempt) return false;
  const planet = world.planets[path.hit];
  const dx = path.x - planet.pos.x;
  const dy = path.y - planet.pos.y;
  const d = Math.hypot(dx, dy);
  const nx = d === 0 ? 0 : dx / d; // centre exact : même normale arbitraire (0, −1) que les collisions
  const ny = d === 0 ? -1 : dy / d;
  const normalSpeed = ship.vel.x * nx + ship.vel.y * ny;
  const tangentX = (ship.vel.x - normalSpeed * nx) / P.cruiseSpeed;
  const tangentY = (ship.vel.y - normalSpeed * ny) / P.cruiseSpeed;
  thrustToward(intent, ship, SHIP_THRUST * (nx + tangentX), SHIP_THRUST * (ny + tangentY));
  return true;
}

/** Réécrit tout `ships[f].intent` du bot : réflexe anti-crash d'abord, puis manœuvre du mode. */
export function pilot(world, bot, ship) {
  const intent = ship.intent;
  resetIntent(intent);
  if (bot.mode === AI_MODE.NONE) return;
  const landing = bot.mode === AI_MODE.LAND;
  // Le décollage passe avant le réflexe : c'est lui qui s'écarte de la planète que l'on quitte.
  if (takeoff(world, bot, ship, intent)) return;
  if (avoidCrash(world, ship, intent, landing ? bot.target : -1)) return;
  if (bot.mode === AI_MODE.GOTO) flyTo(world, ship, intent, bot.goalX, bot.goalY, ship.landedOn);
  else if (landing) land(world, bot, ship, intent);
}
