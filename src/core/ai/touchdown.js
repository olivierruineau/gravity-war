// Atterrissage et décollage de l'IA (ADR 0006 §4.4). Les seuils ne sont jamais recopiés : on prédit le contact
// sans poussée (`predictPath`), on le mesure avec `evaluateLanding` sur un vaisseau virtuel, et on ne garde ici
// que des marges (data/ai.js). La phase est mémorisée dans `bot.phase`.
import { SHIP_COLLISION_RADIUS, SHIP_THRUST } from '../../config.js';
import { BOT_PROFILE as P } from '../../data/ai.js';
import { gravityAt } from '../gravity.js';
import { evaluateLanding } from '../landing.js';
import { clamp, hypot, wrapAngle } from '../math.js';
import { nearestPlanet } from '../planet.js';
import { predictPath } from '../predict.js';
import { isLanding } from './mode.js';
import { flyTo, steerToAngle, thrustToward } from './navigate.js';

/** Phases d'un bot en LAND (0 = repos, aussi valable pour tout autre mode). TAKEOFF vaut pour tous les modes. */
export const TOUCHDOWN_PHASE = { APPROACH: 0, DESCENT: 1, GO_AROUND: 2, TAKEOFF: 3 };
const { APPROACH, DESCENT, GO_AROUND, TAKEOFF } = TOUCHDOWN_PHASE;

const TILT_GAIN = P.landMaxTilt / P.landTangentialMax; // inclinaison pleine à landTangentialMax de dérive
const BRAKE_ACCEL = P.landBrakeFactor * SHIP_THRUST;
const ABORT_ENERGY = P.landAbortRadial * P.landAbortRadial;
const TARGET_ENERGY = P.landRadialTarget * P.landRadialTarget;

const gravity = { x: 0, y: 0 };
const path = { hit: -1, t: 0, x: 0, y: 0, vx: 0, vy: 0 };
const virtual = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0 }; // vaisseau au contact prévu
const now = { approachSpeed: 0, tangentialSpeed: 0, angleError: 0, ok: false };
const then = { approachSpeed: 0, tangentialSpeed: 0, angleError: 0, ok: false };

/** Altitude au-dessus du rayon de contact (surface + rayon du vaisseau) ; écrit la normale sortante dans `n`. */
function altitudeAbove(ship, planet, n) {
  const dx = ship.pos.x - planet.pos.x;
  const dy = ship.pos.y - planet.pos.y;
  const d = hypot(dx, dy);
  n.x = d === 0 ? 0 : dx / d; // centre exact : même normale arbitraire (0, −1) que les collisions
  n.y = d === 0 ? -1 : dy / d;
  return d - planet.radius - SHIP_COLLISION_RADIUS;
}

const normal = { x: 0, y: 0 };

/** Nez vers `angle` ; pousse si `wantThrust` et que le nez est dans le cône de poussée. */
function burn(intent, ship, angle, wantThrust) {
  steerToAngle(intent, ship, angle);
  intent.thrust = wantThrust && Math.abs(wrapAngle(angle - ship.angle)) <= P.thrustCone;
}

/**
 * Décollage : tant que le vaisseau est posé sur une planète qui n'est pas la cible d'un LAND, puis jusqu'à
 * `takeoffAltitude`, nez sur la normale et poussée. Retourne vrai si la manœuvre a pris la main.
 */
export function takeoff(world, bot, ship, intent) {
  let planet;
  if (ship.landedOn >= 0) {
    if (isLanding(bot) && bot.target === ship.landedOn) {
      bot.phase = APPROACH; // posé sur le but : rien à quitter
      return false;
    }
    bot.phase = TAKEOFF;
    planet = world.planets[ship.landedOn];
  } else {
    if (bot.phase !== TAKEOFF) return false;
    planet = world.planets[nearestPlanet(world.planets, ship.pos)];
  }
  if (altitudeAbove(ship, planet, normal) > P.takeoffAltitude) {
    bot.phase = APPROACH;
    return false;
  }
  burn(intent, ship, Math.atan2(normal.y, normal.x), true);
  return true;
}

/**
 * Atterrissage sur `bot.target` : approche vers le point d'entrée (sur le rayon du vaisseau, `landEntryAltitude`
 * au-dessus du contact), puis descente en « suicide burn » : on pousse seulement quand freiner plus tard ne
 * suffirait plus à arriver sous `landRadialTarget`. Posé sur la cible : intentions nulles.
 */
export function land(world, bot, ship, intent) {
  if (ship.landedOn === bot.target) return;
  const planet = world.planets[bot.target];
  const h = altitudeAbove(ship, planet, normal);
  const normalAngle = Math.atan2(normal.y, normal.x);

  if (bot.phase === GO_AROUND) {
    // On remonte jusqu'à l'altitude d'entrée, ou jusqu'à une vitesse de fuite : flyTo prend alors le relais.
    evaluateLanding(ship, planet, now);
    if (h < P.landEntryAltitude && -now.approachSpeed < P.landGoAroundSpeed) {
      burn(intent, ship, normalAngle, true);
      return;
    }
    bot.phase = APPROACH;
  }
  if (bot.phase === DESCENT && h > P.landEntryAltitude * P.landAbortAltitude) bot.phase = APPROACH;
  if (bot.phase !== DESCENT) {
    const speed = hypot(ship.vel.x, ship.vel.y);
    if (h > P.landEntryAltitude + P.landEntryTolerance || speed > P.landEntrySpeed) {
      const reach = planet.radius + SHIP_COLLISION_RADIUS + P.landEntryAltitude;
      flyTo(
        world,
        ship,
        intent,
        planet.pos.x + normal.x * reach,
        planet.pos.y + normal.y * reach,
        bot.target,
      );
      return;
    }
    bot.phase = DESCENT;
  }
  descend(world, bot, ship, intent, planet, h, normalAngle);
}

function descend(world, bot, ship, intent, planet, h, normalAngle) {
  predictPath(
    path,
    ship.pos,
    ship.vel,
    world.planets,
    SHIP_COLLISION_RADIUS,
    P.landHorizon,
    P.predictDt,
  );
  evaluateLanding(ship, planet, now);
  if (path.hit !== bot.target) {
    // Rien à brûler : en orbite basse ou en vol libre, la gravité seule ne fait pas descendre. On annule la dérive
    // en visant une vitesse de descente lente ; dès qu'un contact est prévu, le « suicide burn » reprend la main.
    gravityAt(gravity, ship.pos, world.planets);
    thrustToward(
      intent,
      ship,
      (-normal.x * P.landDescentSpeed - ship.vel.x) / P.velGainTime - gravity.x,
      (-normal.y * P.landDescentSpeed - ship.vel.y) / P.velGainTime - gravity.y,
    );
    return;
  }
  virtual.pos.x = path.x;
  virtual.pos.y = path.y;
  virtual.vel.x = path.vx;
  virtual.vel.y = path.vy;
  virtual.angle = ship.angle;
  const contact = evaluateLanding(virtual, planet, then);
  const remaining = hypot(path.x - ship.pos.x, path.y - ship.pos.y);

  const flare = h < P.landFlareAltitude;
  if (
    flare &&
    (Math.abs(contact.tangentialSpeed) > P.landAbortTangential ||
      contact.angleError > P.landAbortTilt ||
      // Même à pleine poussée, la distance restante ne suffit plus à descendre sous la vitesse limite.
      contact.approachSpeed * contact.approachSpeed - ABORT_ENERGY > 2 * SHIP_THRUST * remaining)
  ) {
    bot.phase = GO_AROUND;
    burn(intent, ship, normalAngle, true);
    return;
  }

  // L'énergie de chute (vitesse de contact sans poussée) se dissipe à ≈ SHIP_THRUST·v : on freine quand la
  // distance restante ne suffit plus à passer de cette vitesse à la cible.
  const tooFast =
    now.approachSpeed > 0 &&
    contact.approachSpeed > P.landRadialTarget &&
    contact.approachSpeed * contact.approachSpeed - TARGET_ENERGY > 2 * BRAKE_ACCEL * remaining;
  const drifting = Math.abs(contact.tangentialSpeed) > P.landTangentialMax;
  // Inclinaison opposée à la dérive : le nez tourne vers t = normale + 90° pour une poussée de signe +.
  const tilt = flare ? 0 : clamp(-now.tangentialSpeed * TILT_GAIN, -P.landMaxTilt, P.landMaxTilt);
  burn(intent, ship, normalAngle + tilt, tooFast || drifting);
}
