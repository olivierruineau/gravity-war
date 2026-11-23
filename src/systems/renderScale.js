// Netteté (9.5, ADR 0011) : le monde reste décrit en 480×270 « unités de jeu » (cartes, vitesses, mises en page),
// mais le canvas est dessiné à `K` fois cette taille, avec `K` choisi pour approcher les pixels réels de l'écran.
// Les caméras zooment de `K` (origine en haut à gauche), les traits sont épaissis de `LINE_PX / K` unités (soit
// `LINE_PX` pixel du canvas) et les textes sont rastérisés à la résolution `K` : traits fins, texte net, sans crénelage
// dû à l'agrandissement par le navigateur. Rien dans `core/` ne le sait.
import { isRenderLow } from './quality.js';
import { GAME_HEIGHT, GAME_WIDTH, LINE_PX, RENDER_SCALE_MAX } from '../config.js';

let current = 1;

/** Facteur de rendu courant (1 = comme avant : un pixel du canvas par unité de jeu). */
export const getRenderScale = () => current;

/**
 * Facteur de rendu pour une fenêtre de `winW × winH` pixels CSS et un `dpr` : le canvas est ajusté (FIT, 16:9) dans la
 * fenêtre, puis on vise autant de pixels de canvas que de pixels physiques, de 1 à `max`.
 */
export function computeRenderScale(winW, winH, dpr = 1, max = RENDER_SCALE_MAX) {
  const cssW = Math.min(winW, (winH * GAME_WIDTH) / GAME_HEIGHT);
  const k = Math.round((cssW * dpr) / GAME_WIDTH);
  return Math.min(Math.max(k, 1), max);
}

export function currentRenderScale() {
  return computeRenderScale(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}

/** Zone du monde visible par la caméra principale (en unités de jeu), pour la minimap et les indicateurs. */
export function viewRect(camera, out) {
  out.x = camera.scrollX;
  out.y = camera.scrollY;
  out.width = GAME_WIDTH;
  out.height = GAME_HEIGHT;
  return out;
}

/** Origine de la caméra en haut à gauche : les objets fixes (scrollFactor 0) se placent en unités de jeu. */
export function placeCamera(camera, x, y, worldWidth, worldHeight) {
  camera.setScroll(
    Math.min(Math.max(x - GAME_WIDTH / 2, 0), Math.max(worldWidth - GAME_WIDTH, 0)),
    Math.min(Math.max(y - GAME_HEIGHT / 2, 0), Math.max(worldHeight - GAME_HEIGHT, 0)),
  );
}

/**
 * À appeler au début de `create()` de chaque scène : ajuste la taille du canvas et le zoom de la caméra. Aussi appelé
 * quand le moniteur de cadence passe en mode bas : le canvas retombe à la taille de jeu (le coût de remplissage baisse).
 */
export function applyRenderScale(scene) {
  current = isRenderLow() ? 1 : currentRenderScale();
  const { scale } = scene;
  if (scale.gameSize.width !== GAME_WIDTH * current)
    scale.resize(GAME_WIDTH * current, GAME_HEIGHT * current);
  scene.cameras.main.setOrigin(0, 0).setZoom(current);
  return current;
}

/** Installe une fois les correctifs de rendu sur Phaser (traits fins, texte net). */
export function installRenderPatches(Phaser) {
  const { Graphics, GameObjectFactory, Shape } = Phaser.GameObjects;
  const lineStyle = Graphics.prototype.lineStyle;
  Graphics.prototype.lineStyle = function (width, color, alpha) {
    return lineStyle.call(this, (width * LINE_PX) / current, color, alpha);
  };
  const setStrokeStyle = Shape.prototype.setStrokeStyle;
  Shape.prototype.setStrokeStyle = function (width, ...rest) {
    return setStrokeStyle.call(
      this,
      width === undefined ? width : (width * LINE_PX) / current,
      ...rest,
    );
  };
  const text = GameObjectFactory.prototype.text;
  GameObjectFactory.prototype.text = function (x, y, value, style) {
    return text.call(this, x, y, value, { resolution: current, ...style });
  };
}
