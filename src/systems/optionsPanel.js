// Écran d'options (9.3) : un panneau plein écran superposé à la scène hôte (menu ou pause). Clavier : ↑ ↓ choisissent
// la ligne, ← → règlent, ESPACE valide, ECHAP ferme. Tactile : un toucher sur une ligne la règle, RETOUR ferme.
// L'hôte doit ignorer ses propres actions tant que `isBlocking()` est vrai.
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config.js';
import { controlsLines } from '../data/controls.js';
import { isMuted, toggleMute } from '../audio/mute.js';
import { ASSIST_LABELS, cycleAssistMode, getAssistMode } from './assistSetting.js';
import { toCss } from './color.js';
import { DIFFICULTY_LABELS, cycleDifficultyMode, getDifficultyMode } from './difficultySetting.js';
import { createNavigation, watchSource } from './navigation.js';
import { createOptionsModel } from './optionsModel.js';
import { canFullscreen, enterFullscreen } from './platform.js';
import { QUALITY_LABELS, cycleQualityMode, getQualityMode } from './quality.js';

const ROW_H = 24;
const ROW_W = 300;
const FIRST_Y = 54;

/** Lignes de l'écran d'options, dans l'ordre d'affichage. `scene` sert au plein écran. */
export function buildOptionRows(scene, { onControls }) {
  const rows = [
    {
      id: 'difficulty',
      label: () => `DIFFICULTE : ${DIFFICULTY_LABELS[getDifficultyMode()]}`,
      change: cycleDifficultyMode,
    },
    {
      id: 'assist',
      label: () => `AIDE A LA POSE : ${ASSIST_LABELS[getAssistMode()]}`,
      change: cycleAssistMode,
    },
    {
      id: 'quality',
      label: () => `QUALITE : ${QUALITY_LABELS[getQualityMode()]}`,
      change: cycleQualityMode,
    },
    { id: 'sound', label: () => `SON : ${isMuted() ? 'COUPE' : 'OUI'}`, change: toggleMute },
  ];
  if (canFullscreen(scene))
    rows.push({
      id: 'fullscreen',
      label: () => 'PLEIN ECRAN',
      activate: () => enterFullscreen(scene),
    });
  rows.push({ id: 'controls', label: () => 'COMMANDES', activate: onControls });
  return rows;
}

/**
 * @param {Phaser.Scene} scene hôte
 * @param {{ depth?: number, onToggleSound?: () => void }} [opts] `onToggleSound` : l'hôte met à jour son indicateur de son
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean, isBlocking: () => boolean }}
 */
export function createOptionsPanel(scene, { depth = 1200, onToggleSound } = {}) {
  const cx = GAME_WIDTH / 2;
  const objects = [];
  const add = (obj) => {
    obj.setScrollFactor(0).setDepth(depth + (obj.type === 'Rectangle' ? 0 : 1));
    objects.push(obj);
    return obj;
  };
  let opened = false;
  let closing = false;
  let showControls = false;
  const toggleControls = () => {
    showControls = !showControls;
    render();
  };
  const model = createOptionsModel(buildOptionRows(scene, { onControls: toggleControls }));
  const soundIndex = model.rows.findIndex((row) => row.id === 'sound');
  const soundRow = model.rows[soundIndex];
  const toggleSound = soundRow.change;
  soundRow.change = (dir) => {
    toggleSound(dir);
    onToggleSound?.();
  };

  add(scene.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PALETTE.bg, 1));
  add(
    scene.add
      .text(cx, 24, 'OPTIONS', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: toCss(PALETTE.accent),
      })
      .setOrigin(0.5),
  );
  const boxes = [];
  const texts = [];
  model.rows.forEach((_row, i) => {
    const y = FIRST_Y + i * ROW_H;
    const box = add(scene.add.rectangle(cx, y, ROW_W, ROW_H - 4, PALETTE.bg, 1));
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      if (!opened) return;
      model.select(i);
      model.confirm();
      render();
    });
    boxes.push(box);
    texts.push(
      add(scene.add.text(cx, y, '', { fontFamily: 'monospace', fontSize: '10px' }).setOrigin(0.5)),
    );
  });
  const backY = FIRST_Y + model.rows.length * ROW_H + 8;
  const back = add(scene.add.rectangle(cx, backY, 120, ROW_H - 4, PALETTE.bg, 1));
  back.setInteractive({ useHandCursor: true });
  back.on('pointerdown', () => opened && close());
  const backText = add(
    scene.add
      .text(cx, backY, 'RETOUR', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: toCss(PALETTE.accent),
      })
      .setOrigin(0.5),
  );
  back.setStrokeStyle(1, PALETTE.accent, 0.9);
  const hint = add(
    scene.add
      .text(cx, GAME_HEIGHT - 10, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: toCss(PALETTE.star),
      })
      .setOrigin(0.5),
  );
  const controls = add(
    scene.add
      .text(cx, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: toCss(PALETTE.text),
        backgroundColor: toCss(PALETTE.bg),
        padding: { x: 8, y: 6 },
        align: 'left',
      })
      .setOrigin(0.5),
  );

  let touch = false;
  function render() {
    const labels = model.labels();
    for (let i = 0; i < labels.length; i++) {
      const on = !touch && i === model.selected;
      texts[i].setText(`${on ? '> ' : ''}${labels[i]}${on ? ' <' : ''}`);
      texts[i].setColor(toCss(on ? PALETTE.accent : PALETTE.text));
      boxes[i].setStrokeStyle(1, on ? PALETTE.accent : PALETTE.border, 0.9);
    }
    hint.setText(touch ? '' : '↑ ↓ CHOISIR   ← → REGLER   ESPACE VALIDER   ECHAP RETOUR');
    controls.setText(controlsLines(touch)).setVisible(opened && showControls);
    objects.forEach((o) => {
      if (o !== controls) o.setVisible(opened);
    });
    if (opened) {
      boxes.forEach((b) => b.setInteractive());
      back.setInteractive();
    } else {
      boxes.forEach((b) => b.disableInteractive());
      back.disableInteractive();
    }
    backText.setVisible(opened);
  }

  function open() {
    if (opened) return;
    opened = true;
    showControls = false;
    model.select(0);
    render();
  }
  function close() {
    if (!opened) return;
    opened = false;
    closing = true; // ECHAP ferme ici puis atteindrait l'hôte au même événement : on le fait attendre un tour
    scene.time.delayedCall(0, () => {
      closing = false;
    });
    render();
  }

  const nav = createNavigation(scene);
  const when = (fn) => () => {
    if (!opened) return;
    fn();
    render();
  };
  nav.on(
    'up',
    when(() => model.move(-1)),
  );
  nav.on(
    'down',
    when(() => model.move(1)),
  );
  nav.on(
    'left',
    when(() => model.change(-1)),
  );
  nav.on(
    'right',
    when(() => model.change(1)),
  );
  nav.on(
    'confirm',
    when(() => model.confirm()),
  );
  nav.on('back', () => {
    if (!opened) return;
    if (showControls) toggleControls();
    else close();
  });
  watchSource(scene, (isTouch) => {
    touch = isTouch;
    render();
  });
  render();

  return {
    open,
    close,
    isOpen: () => opened,
    isBlocking: () => opened || closing,
  };
}
