// Modèle pur de l'écran d'options (9.3) : une liste de lignes, une sélection, des actions. Aucun Phaser.
// Une ligne : `{ id, label: () => string, change?: (dir) => void, activate?: () => void }`.
// `change` règle une valeur (flèches, validation) ; `activate` déclenche une action (plein écran, commandes).

/** @param {{ id: string, label: () => string, change?: (dir: number) => void, activate?: () => void }[]} rows */
export function createOptionsModel(rows) {
  let selected = 0;
  return {
    rows,
    get selected() {
      return selected;
    },
    /** Sélection circulaire : `dir` = 1 ligne suivante, −1 précédente. */
    move(dir) {
      selected = (selected + (dir < 0 ? -1 : 1) + rows.length) % rows.length;
    },
    select(index) {
      if (index >= 0 && index < rows.length) selected = index;
    },
    /** Flèches : règle la valeur de la ligne sélectionnée (sans effet sur une action). */
    change(dir = 1) {
      rows[selected].change?.(dir);
    },
    /** Validation (ESPACE, toucher) : valeur suivante, ou lance l'action de la ligne. */
    confirm() {
      const row = rows[selected];
      if (row.change) row.change(1);
      else row.activate?.();
    },
    labels() {
      return rows.map((row) => row.label());
    },
  };
}
