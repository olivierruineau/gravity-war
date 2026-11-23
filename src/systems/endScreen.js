// Écran de fin (6.4) : bandeau VICTOIRE / DÉFAITE par-dessus la partie figée, et choix rejouer / menu.
// Affichage seulement : l'issue est décidée par le core (`world.outcome`, ADR 0005).
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, SCENES } from '../config.js';
import { toCss } from './color.js';
import { endScreenModel } from './endScreenModel.js';
import { createNavigation } from './navigation.js';
import { isTouch } from './inputSource.js';
import { createButton } from './uiButton.js';

const DEPTH = 1100;

export function createEndScreen(scene) {
  const cx = GAME_WIDTH / 2;
  const veil = scene.add
    .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PALETTE.bg, 0.7)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setVisible(false);
  const title = scene.add
    .text(cx, GAME_HEIGHT * 0.4, '', { fontFamily: 'monospace', fontSize: '24px' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH + 1)
    .setVisible(false);
  const hint = scene.add
    .text(cx, GAME_HEIGHT * 0.6, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: toCss(PALETTE.text),
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH + 1)
    .setVisible(false);
  let shown = false;
  const nav = createNavigation(scene);
  // Les actions ne comptent qu'une fois l'écran affiché ; la première suffit (pas de double redémarrage).
  let chosen = false;
  const choose = (go) => () => {
    if (!shown || chosen) return;
    chosen = true;
    go();
  };
  const replay = choose(() => scene.scene.restart());
  const toMenu = choose(() => scene.scene.start(SCENES.MENU));
  nav.on('confirm', replay);
  nav.on('back', toMenu);

  return {
    /** Affiche l'écran (une fois). */
    show(outcome) {
      const touch = isTouch();
      const model = endScreenModel(outcome, touch);
      if (shown || model === null) return;
      shown = true;
      veil.setVisible(true);
      title.setText(model.title).setColor(toCss(model.color)).setVisible(true);
      hint.setText(model.hint).setVisible(true);
      if (touch) {
        createButton(scene, {
          x: cx - 70,
          y: GAME_HEIGHT * 0.72,
          w: 120,
          h: 40,
          label: 'REJOUER',
          depth: DEPTH + 2,
          color: PALETTE.accent,
          onTap: replay,
        });
        createButton(scene, {
          x: cx + 70,
          y: GAME_HEIGHT * 0.72,
          w: 120,
          h: 40,
          label: 'MENU',
          depth: DEPTH + 2,
          onTap: toMenu,
        });
      }
    },
  };
}
