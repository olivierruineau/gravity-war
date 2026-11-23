// Sons déclenchés par la file d'événements du core. Un son lointain est atténué par la distance à la caméra.
import { AUDIO_RANGE, THRUST_SOUND_INTERVAL } from '../config.js';
import { EVT } from '../core/events.js';
import { playSfx } from '../audio/sfx.js';

// Événement → son (les types absents restent muets).
const SOUND_BY_EVENT = {
  [EVT.SHOT]: 'shot',
  [EVT.EXPLOSION]: 'explosion',
  [EVT.IMPACT]: 'impact',
  [EVT.SHIP_HIT]: 'hit',
  [EVT.BULLET_HIT]: 'tick',
  [EVT.LANDED]: 'landed',
  [EVT.RESPAWN]: 'respawn',
  [EVT.TURRET_SHOT]: 'turretShot',
  [EVT.TURRET_DESTROYED]: 'turretDestroyed',
  [EVT.BUILT]: 'built',
  [EVT.CAPTURED]: 'captured',
  [EVT.MISSILE_LAUNCH]: 'missileLaunch',
  [EVT.REARM]: 'rearm',
  [EVT.ELIMINATED]: 'eliminated',
  [EVT.GAME_OVER]: 'gameOver',
};

// Événements sans position (état de partie) : audibles partout, sans atténuation.
const GLOBAL_EVENTS = new Set([EVT.ELIMINATED, EVT.GAME_OVER]);

const MIN_AUDIBLE = 0.05;

export function createAudioEvents() {
  let thrustTimer = 0;
  return {
    /** `listener` = position du joueur (x, y) ; lecture seule des événements de la frame. */
    handle(events, listener) {
      for (let i = 0; i < events.count; i++) {
        const ev = events.items[i];
        const sound = SOUND_BY_EVENT[ev.type];
        if (!sound) continue;
        if (GLOBAL_EVENTS.has(ev.type)) {
          playSfx(sound);
          continue;
        }
        const closeness = 1 - Math.hypot(ev.x - listener.x, ev.y - listener.y) / AUDIO_RANGE;
        if (closeness <= MIN_AUDIBLE) continue;
        playSfx(sound, closeness * closeness);
      }
    },

    /** Pulsation moteur tant que le joueur pousse (les sons continus se déduisent de l'état, ADR 0002). */
    updateThrust(ship, dt) {
      if (!ship.alive || !ship.intent.thrust) {
        thrustTimer = 0;
        return;
      }
      thrustTimer -= dt;
      if (thrustTimer > 0) return;
      thrustTimer = THRUST_SOUND_INTERVAL;
      playSfx('thrust');
    },
  };
}
