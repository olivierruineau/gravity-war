// 9.8 : observation, trois bots sur la vraie carte. Le monde progresse sans NaN, la faction 0 pilote seule, et la
// partie se termine (OVER) quand il ne reste qu'une faction ; elle ne finit jamais en VICTORY / DEFEAT.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config.js';
import { arena } from '../../src/data/maps/arena.js';
import { OUTCOME } from '../../src/core/faction.js';
import { createWorld, step } from '../../src/core/world.js';

function observe(seed, seconds) {
  const world = createWorld(arena, seed, {
    eventCapacity: 256,
    bots: [0, 1, 2],
    spectator: true,
  });
  let nan = false;
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    step(world, FIXED_DT);
    for (const s of world.ships)
      if (!Number.isFinite(s.pos.x + s.pos.y + s.vel.x + s.vel.y + s.hp)) nan = true;
  }
  return { world, nan };
}

describe('observation : trois bots', () => {
  const { world, nan } = observe(3, 120);

  it('aucun NaN et trois IA', () => {
    expect(nan).toBe(false);
    expect(world.ai.map((b) => b.faction)).toEqual([0, 1, 2]);
  });

  it('la faction 0 est pilotée par une IA qui a décidé', () => {
    expect(world.ai[0].mode).not.toBe(0);
  });

  it('jamais VICTORY ni DEFEAT en observation', () => {
    expect([OUTCOME.PLAYING, OUTCOME.OVER]).toContain(world.outcome);
  });

  it('finit en OVER quand une seule faction reste', () => {
    const w = createWorld(arena, 1, { eventCapacity: 256, bots: [0, 1, 2], spectator: true });
    for (const p of w.planets) if (p.owner === 1 || p.owner === 2) p.owner = 0;
    for (const s of w.ships) if (s.faction !== 0) s.alive = false;
    step(w, FIXED_DT);
    expect(w.outcome).toBe(OUTCOME.OVER);
  });
});
