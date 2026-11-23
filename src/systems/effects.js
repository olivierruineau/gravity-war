// Effets visuels filaires déclenchés par les événements du core (explosions, flashs d'impact, apparitions).
// Purement cosmétique : pool préalloué, `Math.random` autorisé ici (n'influence pas la simulation).
import { EFFECT_CAPACITY, PALETTE } from '../config.js';
import { EVT } from '../core/events.js';

const RAYS = 8;
// Types d'effet : forme et durée (s), rayon max (px).
const EXPLOSION = { duration: 0.7, radius: 36, rays: true };
const FLASH = { duration: 0.15, radius: 5, rays: false };
const RING = { duration: 0.4, radius: 20, rays: false };
const MEDIUM_EXPLOSION = { duration: 0.5, radius: 24, rays: true };
const BIG_RING = { duration: 0.6, radius: 48, rays: false }; // à l'échelle d'une planète

export function createEffects(scene) {
  const g = scene.add.graphics().setDepth(60);
  const pool = new Array(EFFECT_CAPACITY);
  for (let i = 0; i < EFFECT_CAPACITY; i++) {
    pool[i] = { active: false, x: 0, y: 0, age: 0, spec: FLASH, color: 0, spin: 0 };
  }

  function spawn(spec, x, y, color) {
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i];
      if (e.active) continue;
      e.active = true;
      e.x = x;
      e.y = y;
      e.age = 0;
      e.spec = spec;
      e.color = color;
      e.spin = Math.random() * Math.PI; // décale les rayons : deux explosions ne se ressemblent pas
      return;
    }
  }

  return {
    /** Lit les événements de la frame (sans les vider : c'est le rôle de la scène). */
    handle(events) {
      for (let i = 0; i < events.count; i++) {
        const ev = events.items[i];
        switch (ev.type) {
          case EVT.EXPLOSION:
            spawn(EXPLOSION, ev.x, ev.y, PALETTE.accent);
            break;
          case EVT.SHIP_HIT:
          case EVT.BULLET_HIT:
            spawn(FLASH, ev.x, ev.y, PALETTE.text);
            break;
          case EVT.IMPACT:
            spawn(FLASH, ev.x, ev.y, ev.b > 0 ? PALETTE.danger : PALETTE.text);
            break;
          case EVT.LANDED:
            spawn(RING, ev.x, ev.y, PALETTE.aidGood);
            break;
          case EVT.RESPAWN:
            spawn(RING, ev.x, ev.y, PALETTE.factions[ev.a] ?? PALETTE.neutral);
            break;
          case EVT.TURRET_SHOT:
          case EVT.MISSILE_LAUNCH:
            spawn(FLASH, ev.x, ev.y, PALETTE.accent);
            break;
          case EVT.TURRET_DESTROYED:
            spawn(MEDIUM_EXPLOSION, ev.x, ev.y, PALETTE.accent);
            break;
          case EVT.CAPTURED:
            spawn(BIG_RING, ev.x, ev.y, PALETTE.factions[ev.b] ?? PALETTE.neutral);
            break;
          case EVT.BUILT:
            spawn(BIG_RING, ev.x, ev.y, PALETTE.accent);
            break;
        }
      }
    },

    /** `dt` en secondes d'affichage ; redessine tous les effets actifs. */
    update(dt) {
      g.clear();
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i];
        if (!e.active) continue;
        e.age += dt;
        const t = e.age / e.spec.duration;
        if (t >= 1) {
          e.active = false;
          continue;
        }
        const radius = e.spec.radius * Math.sqrt(t); // freine vers la fin
        g.lineStyle(1, e.color, 1 - t);
        g.strokeCircle(e.x, e.y, radius);
        if (!e.spec.rays) continue;
        for (let k = 0; k < RAYS; k++) {
          const a = e.spin + (k * 2 * Math.PI) / RAYS;
          g.lineBetween(
            e.x + Math.cos(a) * radius * 0.5,
            e.y + Math.sin(a) * radius * 0.5,
            e.x + Math.cos(a) * radius,
            e.y + Math.sin(a) * radius,
          );
        }
      }
    },
  };
}
