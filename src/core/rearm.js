// Réarmement des missiles (ADR 0005 §5) : posé sur une planète alliée dotée d'une usine à missiles.
import { MISSILE_REARM_TIME, MISSILE_STOCK_MAX } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';
import { EVT, pushEvent } from './events.js';

function hasMissileFactory(planet) {
  for (let s = 0; s < planet.buildings.length; s++) {
    if (planet.buildings[s].built && BUILDINGS[s].grants === 'missiles') return true;
  }
  return false;
}

/** Fait avancer le réarmement d'un vaisseau vivant ; la progression est perdue dès que les conditions cessent. */
export function updateRearm(world, shipIndex, dt) {
  const ship = world.ships[shipIndex];
  const planet = ship.landedOn >= 0 ? world.planets[ship.landedOn] : undefined;
  if (
    planet === undefined ||
    planet.owner !== ship.faction ||
    ship.missiles >= MISSILE_STOCK_MAX ||
    !hasMissileFactory(planet)
  ) {
    ship.rearmTime = 0;
    return;
  }
  ship.rearmTime += dt;
  if (ship.rearmTime < MISSILE_REARM_TIME) return;
  ship.missiles++;
  ship.rearmTime = 0;
  pushEvent(world.events, EVT.REARM, ship.pos.x, ship.pos.y, shipIndex, ship.missiles);
}
