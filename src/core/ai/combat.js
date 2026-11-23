// Combat de l'IA (ADR 0006 §4.5) : avance de visée, tir, missiles, esquive, et manœuvres des modes HUNT et ASSAULT.
// Le tir (`fireControl`) est décidé indépendamment du mouvement, dans tous les modes : il ne part que si le nez est
// déjà sur la cible. Rien n'est alloué : les résultats intermédiaires vivent dans des scratchs de module.
import {
  BULLET_LIFETIME,
  BULLET_SPEED,
  MISSILE_SEEK_ANGLE,
  SHIP_SIZE,
  SHIP_THRUST,
} from '../../config.js';
import { BOT_PROFILE as P } from '../../data/ai.js';
import { defenseRange, hasDefenses } from '../building.js';
import { clamp, wrapAngle } from '../math.js';
import { findMissileTarget } from '../missile.js';
import { predictPath } from '../predict.js';
import { KIND } from '../projectile.js';
import { AI_MODE } from './mode.js';
import { flyTo, steerToAngle, thrustToward } from './navigate.js';

const EPSILON = 1e-9;
const ENGAGE_MID = (P.engageMin + P.engageMax) / 2;
const MIN_SPEED = 1e-6; // sous ce module (ou ce carré), un projectile n'a pas de direction

const aim = { angle: 0, t: 0 }; // cap d'interception (biais inclus) et temps de vol
const muzzle = { x: 0, y: 0 };
const bulletVel = { x: 0, y: 0 };
const path = { hit: -1, t: 0, x: 0, y: 0, vx: 0, vy: 0 };
const threat = { time: Infinity, dx: 0, dy: 0 }; // menace la plus imminente et direction d'esquive

/**
 * Plus petit instant t > 0 où une balle de vitesse `speed` (relative au tireur) rejoint une cible à (dx, dy) de
 * vitesse relative (dvx, dvy) : |r + v·t| = speed·t. −1 si la cible fuit trop vite. La gravité est ignorée (ADR 0006).
 */
export function interceptTime(dx, dy, dvx, dvy, speed) {
  const c = dx * dx + dy * dy;
  if (c === 0) return 0;
  const a = dvx * dvx + dvy * dvy - speed * speed;
  const b = dx * dvx + dy * dvy;
  if (Math.abs(a) < EPSILON) return b < 0 ? -c / (2 * b) : -1;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / a;
  const t2 = (-b + root) / a;
  const low = Math.min(t1, t2);
  if (low > 0) return low;
  return Math.max(t1, t2) > 0 ? Math.max(t1, t2) : -1;
}

/** Vrai si le segment (x0, y0) → (x1, y1) traverse le disque d'une planète autre que `except`. */
function lineBlocked(planets, x0, y0, x1, y1, except) {
  const sx = x1 - x0;
  const sy = y1 - y0;
  const lenSq = sx * sx + sy * sy;
  for (let i = 0; i < planets.length; i++) {
    if (i === except) continue;
    const p = planets[i];
    const u = lenSq === 0 ? 0 : clamp(((p.pos.x - x0) * sx + (p.pos.y - y0) * sy) / lenSq, 0, 1);
    const dx = x0 + sx * u - p.pos.x;
    const dy = y0 + sy * u - p.pos.y;
    if (dx * dx + dy * dy < p.radius * p.radius) return true;
  }
  return false;
}

/** Écrit dans `aim` le cap qui intercepte `target` (+ `aimBias`) ; faux si la balle ne peut pas le rejoindre à temps. */
function leadAim(bot, ship, target) {
  const dx = target.pos.x - ship.pos.x;
  const dy = target.pos.y - ship.pos.y;
  const dvx = target.vel.x - ship.vel.x; // la balle hérite de la vitesse du tireur
  const dvy = target.vel.y - ship.vel.y;
  const t = interceptTime(dx, dy, dvx, dvy, BULLET_SPEED);
  if (t < 0 || t > BULLET_LIFETIME) return false;
  aim.t = t;
  aim.angle = Math.atan2(dy + dvy * t, dx + dvx * t) + bot.aimBias;
  return true;
}

/** Prédit le vol d'une balle tirée maintenant (museau, vitesse héritée) sur `horizon` s : résultat dans `path`. */
function predictBullet(world, ship, horizon) {
  const dirX = Math.cos(ship.angle);
  const dirY = Math.sin(ship.angle);
  muzzle.x = ship.pos.x + dirX * SHIP_SIZE;
  muzzle.y = ship.pos.y + dirY * SHIP_SIZE;
  bulletVel.x = ship.vel.x + dirX * BULLET_SPEED;
  bulletVel.y = ship.vel.y + dirY * BULLET_SPEED;
  predictPath(path, muzzle, bulletVel, world.planets, 0, horizon, P.predictDt);
}

/** Tir (balles, missile) sur le vaisseau `index`. `missileFloor` = stock de missiles à ne pas entamer. */
function shootShip(world, bot, ship, intent, index, missileFloor) {
  const target = world.ships[index];
  const dist = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y);
  if (dist < P.fireRange && leadAim(bot, ship, target)) {
    if (Math.abs(wrapAngle(aim.angle - ship.angle)) <= P.fireCone) {
      // Ligne de tir libre : la balle ne doit toucher aucune planète (ni le sol sous le nez) avant l'interception.
      predictBullet(world, ship, aim.t);
      if (path.hit < 0) intent.fire = true;
    }
  }
  if (
    dist < P.missileRange &&
    world.factions[bot.faction].hasMissiles &&
    ship.missiles > missileFloor &&
    findMissileTarget(world.ships, ship.pos.x, ship.pos.y, ship.angle, bot.faction) === index &&
    !lineBlocked(world.planets, ship.pos.x, ship.pos.y, target.pos.x, target.pos.y, -1)
  ) {
    intent.missile = true;
  }
}

/**
 * Tir sur la planète cible d'un ASSAULT : seulement tant qu'elle a une tourelle (ensuite, les tirs raseraient
 * l'usine pour rien : la capture remet tout à zéro). La zone touchable est le disque : on tire si le nez est dans
 * son rayon angulaire et que la balle prédite l'atteint, avant toute autre planète.
 */
function shootPlanet(world, bot, ship, intent) {
  const planet = world.planets[bot.target];
  if (planet.owner < 0 || planet.owner === bot.faction || !hasDefenses(planet)) return;
  const dx = planet.pos.x - ship.pos.x;
  const dy = planet.pos.y - ship.pos.y;
  const dist = Math.hypot(dx, dy);
  const gap = dist - planet.radius;
  if (gap <= 0 || gap > P.fireRange) return;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - ship.angle)) > Math.asin(planet.radius / dist))
    return;
  predictBullet(world, ship, BULLET_LIFETIME);
  if (path.hit === bot.target) intent.fire = true;
  // Réserve de missiles pour les vaisseaux ; un vaisseau ennemi dans le cône capterait le missile.
  if (
    gap < P.missileRange &&
    world.factions[bot.faction].hasMissiles &&
    ship.missiles > P.missileReserve &&
    findMissileTarget(world.ships, ship.pos.x, ship.pos.y, ship.angle, bot.faction) < 0 &&
    !lineBlocked(world.planets, ship.pos.x, ship.pos.y, planet.pos.x, planet.pos.y, bot.target)
  ) {
    intent.missile = true;
  }
}

/** Vaisseau ennemi vivant le plus proche dans `fireRange`, ou −1. */
function nearestEnemy(world, faction, ship) {
  let best = -1;
  let bestSq = P.fireRange * P.fireRange;
  for (let k = 0; k < world.ships.length; k++) {
    const other = world.ships[k];
    if (!other.alive || other.faction === faction) continue;
    const dx = other.pos.x - ship.pos.x;
    const dy = other.pos.y - ship.pos.y;
    if (dx * dx + dy * dy >= bestSq) continue;
    bestSq = dx * dx + dy * dy;
    best = k;
  }
  return best;
}

/**
 * Écrit `intent.fire` / `intent.missile`, après la manœuvre : tir seulement vers des cibles ennemies (HUNT : sa
 * cible ; ASSAULT : sa planète tant qu'elle a une tourelle ; tout mode : le vaisseau ennemi le plus proche si le nez
 * est déjà dessus). `fireDelay` = temps de réaction avant le premier tir sur une nouvelle cible.
 */
export function fireControl(world, bot, ship, intent) {
  const { mode } = bot;
  // GOTO et LAND sont des buts de test : navigation pure, le bot ne tire pas.
  if (bot.fireDelay > 0 || mode === AI_MODE.GOTO || mode === AI_MODE.LAND) return;
  if (mode === AI_MODE.HUNT) {
    const target = world.ships[bot.target];
    if (target.alive && target.faction !== bot.faction)
      shootShip(world, bot, ship, intent, bot.target, 0);
    return;
  }
  if (mode === AI_MODE.ASSAULT) shootPlanet(world, bot, ship, intent);
  const index = nearestEnemy(world, bot.faction, ship);
  if (index >= 0) shootShip(world, bot, ship, intent, index, P.missileReserve);
}

/** Menace d'un missile ennemi dont le cône de recherche contient le vaisseau, dans `missileNotice`. */
function missileThreat(m, ship) {
  const sx = ship.pos.x - m.pos.x;
  const sy = ship.pos.y - m.pos.y;
  const speed = Math.hypot(m.vel.x, m.vel.y);
  const dist = Math.hypot(sx, sy);
  if (speed < MIN_SPEED || dist > P.missileNotice || dist / speed >= threat.time) return;
  if (Math.abs(wrapAngle(Math.atan2(sy, sx) - Math.atan2(m.vel.y, m.vel.x))) > MISSILE_SEEK_ANGLE)
    return;
  // On s'écarte de la trajectoire du missile, du côté où l'on se trouve (produit vectoriel).
  const side = m.vel.x * sy - m.vel.y * sx >= 0 ? 1 : -1;
  threat.time = dist / speed;
  threat.dx = (-side * m.vel.y) / speed;
  threat.dy = (side * m.vel.x) / speed;
}

/** Menace d'une balle ennemie dont l'approche la plus proche (< `bulletHorizon`) passerait dans `dodgeRadius`. */
function bulletThreat(b, ship) {
  const rx = b.pos.x - ship.pos.x;
  const ry = b.pos.y - ship.pos.y;
  if (rx * rx + ry * ry > P.bulletNotice * P.bulletNotice) return;
  const ux = b.vel.x - ship.vel.x;
  const uy = b.vel.y - ship.vel.y;
  const speedSq = ux * ux + uy * uy;
  if (speedSq < MIN_SPEED) return;
  const t = -(rx * ux + ry * uy) / speedSq;
  if (t <= 0 || t > P.bulletHorizon || t >= threat.time) return;
  const mx = rx + ux * t; // position relative à l'approche la plus proche
  const my = ry + uy * t;
  const miss = Math.hypot(mx, my);
  if (miss >= P.dodgeRadius) return;
  threat.time = t;
  if (miss < MIN_SPEED) {
    const speed = Math.sqrt(speedSq);
    threat.dx = -uy / speed;
    threat.dy = ux / speed;
  } else {
    threat.dx = -mx / miss;
    threat.dy = -my / miss;
  }
}

/** Cherche la menace la plus imminente (missile ou balle d'une autre faction) : vrai si `threat` est écrit. */
function scanThreats(world, faction, ship) {
  threat.time = Infinity;
  const pool = world.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active || p.owner === faction) continue;
    if (p.kind === KIND.MISSILE) missileThreat(p, ship);
    else if (P.dodgeBullets) bulletThreat(p, ship);
  }
  return threat.time < Infinity;
}

/**
 * Esquive : sur une menace, pousse perpendiculairement à sa trajectoire pendant `evadeTime`, dans une direction
 * fixée au départ (`evadeAngle`). Retourne vrai si l'esquive a pris la main. Pas d'esquive posé (le décollage s'en
 * charge si le but l'exige).
 */
export function evade(world, bot, ship, intent) {
  if (ship.landedOn >= 0) return false;
  if (bot.evadeTimer <= 0) {
    if (!scanThreats(world, bot.faction, ship)) return false;
    bot.evadeAngle = Math.atan2(threat.dy, threat.dx);
    bot.evadeTimer = P.evadeTime;
  }
  thrustToward(
    intent,
    ship,
    Math.cos(bot.evadeAngle) * SHIP_THRUST,
    Math.sin(bot.evadeAngle) * SHIP_THRUST,
  );
  return true;
}

/**
 * Pendant qu'on vise, le nez sert à viser : on garde la poussée de la navigation seulement si le nez était déjà
 * dans le cône de poussée (le contrôle est bang-bang, la dérive est reprise dès qu'on sort de la zone de visée).
 */
function aimInstead(intent, ship, angle) {
  const thrust = intent.thrust;
  steerToAngle(intent, ship, angle);
  intent.thrust = thrust;
}

/**
 * HUNT : rejoint la bande [engageMin, engageMax] autour de la cible, à sa vitesse ; dans la bande, le nez vise
 * (avance de visée). Cible morte : freine sur place et force une nouvelle décision.
 */
export function hunt(world, bot, ship, intent) {
  const target = world.ships[bot.target];
  if (!target.alive || target.faction === bot.faction) {
    bot.decisionTimer = 0;
    flyTo(world, ship, intent, ship.pos.x, ship.pos.y, -1);
    return;
  }
  const dx = ship.pos.x - target.pos.x;
  const dy = ship.pos.y - target.pos.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist === 0 ? 0 : dx / dist;
  const uy = dist === 0 ? -1 : dy / dist; // même normale arbitraire que les collisions
  flyTo(
    world,
    ship,
    intent,
    target.pos.x + ux * ENGAGE_MID,
    target.pos.y + uy * ENGAGE_MID,
    -1,
    target.vel.x,
    target.vel.y,
  );
  // Distance dans une seconde (vitesse relative constante) : une dérive qui sortirait de la bande ne laisse pas viser.
  const ahead = Math.hypot(
    dx + (ship.vel.x - target.vel.x) * P.aimLookahead,
    dy + (ship.vel.y - target.vel.y) * P.aimLookahead,
  );
  if (ahead < P.engageMin || ahead > P.engageMax) return;
  aimInstead(
    intent,
    ship,
    leadAim(bot, ship, target) ? aim.angle : Math.atan2(-dy, -dx) + bot.aimBias,
  );
}

/**
 * ASSAULT : se tient au point d'attente (surface + portée des tourelles + `standoffMargin`) sur la droite
 * planète → vaisseau, donc hors de portée, et vise le centre de la planète. Plus de tourelle (ou planète changée de
 * main) : le tir cesse dans le même pas (`fireControl`) et on force une décision, qui passera en CAPTURE.
 */
export function assault(world, bot, ship, intent) {
  const planet = world.planets[bot.target];
  if (planet.owner === bot.faction || planet.owner < 0 || !hasDefenses(planet))
    bot.decisionTimer = 0;
  const dx = ship.pos.x - planet.pos.x;
  const dy = ship.pos.y - planet.pos.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist === 0 ? 0 : dx / dist;
  const uy = dist === 0 ? -1 : dy / dist;
  const standoff = planet.radius + defenseRange(planet) + P.standoffMargin;
  const goalX = clamp(planet.pos.x + ux * standoff, P.wallMargin, world.width - P.wallMargin);
  const goalY = clamp(planet.pos.y + uy * standoff, P.wallMargin, world.height - P.wallMargin);
  flyTo(world, ship, intent, goalX, goalY, -1);
  const driftX = goalX - ship.pos.x - ship.vel.x * P.aimLookahead;
  const driftY = goalY - ship.pos.y - ship.vel.y * P.aimLookahead;
  if (Math.hypot(driftX, driftY) > P.assaultSlack) return;
  aimInstead(intent, ship, Math.atan2(-dy, -dx));
}
