import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASSIST_ALTITUDE,
  ASSIST_LANDING_DEADBAND,
  FIXED_DT,
  LANDING_MAX_ANGLE,
  SHIP_COLLISION_RADIUS,
} from '../../src/config.js';
import { createIntent } from '../../src/core/intent.js';
import { evaluateLanding } from '../../src/core/landing.js';
import { wrapAngle } from '../../src/core/math.js';
import { createPlanet } from '../../src/core/planet.js';
import { applyIntent, createShip, integrate } from '../../src/core/ship.js';
import { applyLandingAssist } from '../../src/systems/landingAssist.js';
import {
  ASSIST_MODES,
  cycleAssistMode,
  getAssistMode,
  isAssistActive,
  resetAssistMode,
} from '../../src/systems/assistSetting.js';
import { SOURCE, resetInputSource, setSource } from '../../src/systems/inputSource.js';

const PLANET = createPlanet({ x: 500, y: 500, radius: 60, gravity: 70 });
const world = { planets: [PLANET] };

/** Vaisseau à `altitude` au-dessus de la planète (normale vers le haut), qui descend à `speed` px/s. */
function shipAbove(altitude, speed, angle) {
  const ship = createShip(0, PLANET.pos.x, PLANET.pos.y - PLANET.radius - altitude);
  ship.vel.y = speed;
  ship.angle = angle;
  return ship;
}
const UP = -Math.PI / 2;

describe('aide à la pose', () => {
  it('tourne le nez vers la normale, dans le bon sens', () => {
    const left = shipAbove(50, 30, UP + 1); // nez trop à droite de la normale → il faut tourner vers −
    const intent = createIntent();
    expect(applyLandingAssist(world, left, intent)).toBe(true);
    expect(intent.rotate).toBe(-1);
    const right = shipAbove(50, 30, UP - 1);
    const intent2 = createIntent();
    applyLandingAssist(world, right, intent2);
    expect(intent2.rotate).toBe(1);
  });

  it('aligne le nez sur la normale avant l’impact, avec un vaisseau abandonné à lui-même', () => {
    const ship = shipAbove(65, 25, UP + 2);
    const out = {};
    for (let i = 0; i < 90; i++) {
      ship.intent = createIntent();
      applyLandingAssist(world, ship, ship.intent);
      applyIntent(ship, FIXED_DT);
      integrate(ship, FIXED_DT);
    }
    evaluateLanding(ship, PLANET, out);
    expect(out.angleError).toBeLessThanOrEqual(ASSIST_LANDING_DEADBAND + 0.06);
    expect(out.angleError).toBeLessThan(LANDING_MAX_ANGLE);
  });

  it('ne fait rien dans la zone morte (pas de tremblement)', () => {
    const ship = shipAbove(50, 30, UP + ASSIST_LANDING_DEADBAND / 2);
    const intent = createIntent();
    expect(applyLandingAssist(world, ship, intent)).toBe(false);
    expect(intent.rotate).toBe(0);
  });

  it('cède à un doigt qui tourne ou à un tir en cours', () => {
    const ship = shipAbove(50, 30, UP + 1);
    const turning = { ...createIntent(), rotate: 1 };
    expect(applyLandingAssist(world, ship, turning)).toBe(false);
    expect(turning.rotate).toBe(1);
    const firing = { ...createIntent(), fire: true };
    expect(applyLandingAssist(world, ship, firing)).toBe(false);
    expect(firing.rotate).toBe(0);
  });

  it('se retire quand le joueur pousse', () => {
    const ship = shipAbove(40, 30, UP + 1);
    const intent = { ...createIntent(), thrust: true };
    expect(applyLandingAssist(world, ship, intent)).toBe(false);
    expect(intent.rotate).toBe(0);
  });

  it('vise contre une vitesse latérale forte, pas la normale', () => {
    const ship = shipAbove(40, 20, UP); // nez sur la normale, dérive vers la droite (+x)
    ship.vel.x = 60;
    const intent = createIntent();
    expect(applyLandingAssist(world, ship, intent)).toBe(true);
    ship.angle = Math.PI; // nez vers −x : contre la dérive → plus rien à corriger
    expect(applyLandingAssist(world, ship, createIntent())).toBe(false);
  });

  it('reste inactive loin de la planète, en s’éloignant, posé ou mort', () => {
    const far = shipAbove(ASSIST_ALTITUDE + 30, 30, UP + 1);
    expect(applyLandingAssist(world, far, createIntent())).toBe(false);
    const leaving = shipAbove(50, -30, UP + 1);
    expect(applyLandingAssist(world, leaving, createIntent())).toBe(false);
    const landed = shipAbove(0, 0, UP + 1);
    landed.landedOn = 0;
    expect(applyLandingAssist(world, landed, createIntent())).toBe(false);
    const dead = shipAbove(50, 30, UP + 1);
    dead.alive = false;
    expect(applyLandingAssist(world, dead, createIntent())).toBe(false);
  });

  it('n’écrit que la rotation discrète', () => {
    const ship = shipAbove(50, 30, UP + 1);
    const intent = createIntent();
    applyLandingAssist(world, ship, intent);
    expect(intent).toEqual({ rotate: -1, thrust: false, fire: false, missile: false });
    expect(Math.abs(wrapAngle(ship.angle - (UP + 1)))).toBe(0); // le vaisseau lui-même n'est pas touché
    expect(SHIP_COLLISION_RADIUS).toBeGreaterThan(0);
  });
});

describe('réglage de l’aide', () => {
  beforeEach(() => {
    resetAssistMode();
    resetInputSource();
  });

  it('auto : active au tactile seulement ; oui / non : fixe', () => {
    expect(getAssistMode()).toBe('auto');
    expect(isAssistActive()).toBe(false);
    setSource(SOURCE.TOUCH);
    expect(isAssistActive()).toBe(true);
    expect(cycleAssistMode()).toBe('on');
    setSource(SOURCE.KEYBOARD);
    expect(isAssistActive()).toBe(true);
    expect(cycleAssistMode()).toBe('off');
    setSource(SOURCE.TOUCH);
    expect(isAssistActive()).toBe(false);
  });

  it('le cycle boucle sur tous les modes', () => {
    const seen = ASSIST_MODES.map(() => cycleAssistMode());
    expect(new Set(seen)).toEqual(new Set(ASSIST_MODES));
    expect(getAssistMode()).toBe('auto');
  });
});
