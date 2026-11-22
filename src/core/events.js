// File d'événements à capacité fixe : le core y pousse, la couche rendu/audio lit puis vide.
// Aucune allocation après la création ; file pleine = événement perdu (compteur `dropped`).

/** Types d'événements (la liste grandira avec les phases). */
export const EVT = {
  SHOT: 1,
  EXPLOSION: 2,
  IMPACT: 3,
  LANDED: 4,
  CAPTURED: 5,
};

export function createEvents(capacity) {
  const items = new Array(capacity);
  for (let i = 0; i < capacity; i++) items[i] = { type: 0, x: 0, y: 0, a: 0, b: 0 };
  return { count: 0, dropped: 0, items };
}

/** `a` / `b` : index d'entités ou valeur selon le type d'événement. */
export function pushEvent(events, type, x, y, a = 0, b = 0) {
  if (events.count >= events.items.length) {
    events.dropped++;
    return;
  }
  const e = events.items[events.count++];
  e.type = type;
  e.x = x;
  e.y = y;
  e.a = a;
  e.b = b;
}

/** À appeler par le consommateur après lecture (la scène une fois par frame). */
export function clearEvents(events) {
  events.count = 0;
}
