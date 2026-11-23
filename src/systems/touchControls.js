// Commandes tactiles en jeu (8.4) : overlay filaire fixé à l'écran, lu à chaque frame (voir touchModel).
// Affiché seulement quand la dernière source utilisée est le tactile ; sinon ignoré (le clavier a la main).
import { PALETTE } from '../config.js';
import { TOUCH_BUTTONS } from '../data/touchLayout.js';
import { toCss } from './color.js';
import { isTouch, onSourceChange } from './inputSource.js';
import { createPressed, mergeTouchIntent, readPointers } from './touchModel.js';

const DEPTH = 940;
const IDLE_ALPHA = 0.55;
const PRESSED_FILL_ALPHA = 0.35;

export function createTouchControls(scene) {
  const { pointers } = scene.input.manager; // souris + doigts, créés une fois pour toutes (config du jeu)
  const pressed = createPressed(TOUCH_BUTTONS);
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
  const labels = TOUCH_BUTTONS.map((b) =>
    scene.add
      .text(b.x, b.y, b.label, {
        fontFamily: 'monospace',
        fontSize: b.label.length > 1 ? '10px' : '14px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1),
  );
  let visible = false;

  const draw = () => {
    g.clear();
    g.setVisible(visible);
    for (const label of labels) label.setVisible(visible);
    if (!visible) return;
    for (let i = 0; i < TOUCH_BUTTONS.length; i++) {
      const b = TOUCH_BUTTONS[i];
      if (pressed[i]) {
        g.fillStyle(PALETTE.accent, PRESSED_FILL_ALPHA);
        g.fillCircle(b.x, b.y, b.r);
      }
      g.lineStyle(1, pressed[i] ? PALETTE.accent : PALETTE.text, pressed[i] ? 1 : IDLE_ALPHA);
      g.strokeCircle(b.x, b.y, b.r);
    }
  };
  const refresh = () => {
    visible = isTouch();
    pressed.fill(false);
    draw();
  };
  const off = onSourceChange(refresh);
  scene.events.once('shutdown', off);
  refresh();

  return {
    /** À appeler après le clavier : complète l'intention avec les doigts posés. */
    update(intent) {
      if (!visible) return;
      if (readPointers(TOUCH_BUTTONS, pointers, pressed)) draw();
      mergeTouchIntent(TOUCH_BUTTONS, pressed, intent);
    },
  };
}
