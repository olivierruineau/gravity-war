// Valeur suivante (`dir` = 1) ou précédente (−1) dans une liste circulaire.
export function cycleValue(list, current, dir = 1) {
  const i = list.indexOf(current);
  return list[(i + (dir < 0 ? -1 : 1) + list.length) % list.length];
}
