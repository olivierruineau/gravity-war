// Overlay de debug (touche F3 ou option DEBUG) : FPS, temps de calcul/affichage, vitesse, position, tick, événements perdus, mode et cible des bots.
// Lecture seule de `world` ; ne s'actualise que lorsqu'il est visible.
import Phaser from 'phaser';
import { PALETTE } from '../config.js';
import { toCss } from './color.js';
import { isDebugOn, toggleDebug } from './debugSetting.js';
import { AI_MODE } from '../core/ai/mode.js';
import { hypot } from '../core/math.js';

const MODE_NAMES = Object.fromEntries(Object.entries(AI_MODE).map(([name, id]) => [id, name]));

const DEBUG_Y = 50; // sous les boutons II et SON du haut
const TIMING_WINDOW_MS = 1000; // les moyennes de temps portent sur la dernière seconde
const TIMING_CAPACITY = 1024; // mesures conservées au plus (largement > images/s)

/** Moyenne pondérée (somme des valeurs / somme des poids) sur une fenêtre glissante, sans allocation. */
function createWindowAverage() {
  const times = new Float64Array(TIMING_CAPACITY);
  const values = new Float64Array(TIMING_CAPACITY);
  const weights = new Float64Array(TIMING_CAPACITY);
  let head = 0; // plus ancienne mesure
  let size = 0;
  let sumValues = 0;
  let sumWeights = 0;

  function prune(now) {
    while (size > 0 && now - times[head] > TIMING_WINDOW_MS) {
      sumValues -= values[head];
      sumWeights -= weights[head];
      head = (head + 1) % TIMING_CAPACITY;
      size--;
    }
  }

  return {
    add(now, value, weight) {
      prune(now);
      if (size === TIMING_CAPACITY) {
        sumValues -= values[head];
        sumWeights -= weights[head];
        head = (head + 1) % TIMING_CAPACITY;
        size--;
      }
      const slot = (head + size) % TIMING_CAPACITY;
      times[slot] = now;
      values[slot] = value;
      weights[slot] = weight;
      sumValues += value;
      sumWeights += weight;
      size++;
    },
    average(now) {
      prune(now);
      return sumWeights > 0 ? sumValues / sumWeights : 0;
    },
  };
}

export function createDebugOverlay(scene) {
  const text = scene.add
    .text(4, DEBUG_Y, '', { fontFamily: 'monospace', fontSize: '8px', color: toCss(PALETTE.star) })
    .setScrollFactor(0) // collé à l'écran, pas au monde
    .setDepth(1000)
    .setVisible(isDebugOn());

  const keyboard = scene.input.keyboard;
  keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.F3); // évite la recherche du navigateur
  const toggle = toggleDebug;
  keyboard.on('keydown-F3', toggle);
  scene.events.once('shutdown', () => keyboard.off('keydown-F3', toggle));

  // Un tick de simulation (pondéré par le nombre de ticks de l'image) et le dessin d'une image (CPU, hors présentation GPU).
  const tickAvg = createWindowAverage();
  const drawAvg = createWindowAverage();

  return {
    recordSim(totalMs, steps) {
      if (steps > 0) tickAvg.add(performance.now(), totalMs, steps);
    },
    recordDraw(ms) {
      drawAvg.add(performance.now(), ms, 1);
    },
    update(world, ship) {
      text.setVisible(isDebugOn());
      if (!isDebugOn()) return;
      const now = performance.now();
      const speed = hypot(ship.vel.x, ship.vel.y);
      text.setText(
        [
          `FPS ${Math.round(scene.game.loop.actualFps)}  tick ${world.tick}`,
          `calcul ${tickAvg.average(now).toFixed(2)} ms/tick  affichage ${drawAvg.average(now).toFixed(2)} ms`,
          `pos ${ship.pos.x.toFixed(0)}, ${ship.pos.y.toFixed(0)}`,
          `vitesse ${speed.toFixed(1)}  angle ${((ship.angle * 180) / Math.PI).toFixed(0)}°`,
          `événements perdus ${world.events.dropped}`,
          ...world.ai.map((bot) => {
            const target = bot.target >= 0 ? ` -> ${bot.target}` : '';
            return `bot ${bot.faction} ${MODE_NAMES[bot.mode]}${target}  ${bot.modeTime.toFixed(0)}s`;
          }),
        ].join('\n'),
      );
    },
  };
}
