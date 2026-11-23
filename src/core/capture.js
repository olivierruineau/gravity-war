// Capture des planètes (ADR 0005 §2) : un seul vaisseau posé, sans tourelle active, pendant CAPTURE_TIME.
import { CAPTURE_TIME } from '../config.js';
import { hasDefenses, resetBuildings } from './building.js';
import { EVT, pushEvent } from './events.js';

export function updateCapture(world, dt) {
  const { planets, ships, factions, events } = world;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    let count = 0;
    let by = -1;
    for (let k = 0; k < ships.length; k++) {
      if (ships[k].alive && ships[k].landedOn === i) {
        count++;
        by = ships[k].faction;
      }
    }
    if (count !== 1 || by === p.owner || factions[by].eliminated || hasDefenses(p)) {
      p.captureBy = -1;
      p.captureTime = 0;
      continue;
    }
    if (p.captureBy !== by) {
      p.captureBy = by;
      p.captureTime = 0;
    }
    p.captureTime += dt;
    if (p.captureTime >= CAPTURE_TIME) {
      p.owner = by;
      resetBuildings(p);
      p.captureBy = -1;
      p.captureTime = 0;
      pushEvent(events, EVT.CAPTURED, p.pos.x, p.pos.y, i, by);
    }
  }
}
