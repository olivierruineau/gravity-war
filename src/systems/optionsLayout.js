// Disposition de l'écran d'options (9.9), pure : une colonne tant que la liste tient, deux au-delà (cibles tactiles
// de 26 unités de jeu de haut au moins). Les rangées se remplissent colonne après colonne (↑ ↓ suivent cet ordre).
import { GAME_WIDTH } from '../config.js';

export const ROW_H = 30;
export const FIRST_Y = 58;
const ONE_COLUMN_MAX = 6;
const ROW_W_ONE = 300;
const ROW_W_TWO = 224;
const COLUMN_OFFSET = 118; // centre d'une colonne ↔ axe de l'écran, à deux colonnes

/** @returns {{ rows: { x: number, y: number, w: number, h: number }[], back: { x: number, y: number } }} */
export function optionsLayout(count) {
  const cx = GAME_WIDTH / 2;
  const columns = count > ONE_COLUMN_MAX ? 2 : 1;
  const perColumn = Math.ceil(count / columns);
  const w = columns === 2 ? ROW_W_TWO : ROW_W_ONE;
  const rows = [];
  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / perColumn);
    const x = columns === 2 ? cx + (column === 0 ? -COLUMN_OFFSET : COLUMN_OFFSET) : cx;
    rows.push({ x, y: FIRST_Y + (i % perColumn) * ROW_H, w, h: ROW_H - 4 });
  }
  return { rows, back: { x: cx, y: FIRST_Y + perColumn * ROW_H + 10 } };
}
