// Couche « décision » de l'IA (ADR 0006 §3), appelée toutes les `decisionPeriod` secondes.
// Pour l'instant : suivi de la santé (`underFire`) ; le but (mode, cible) est posé de l'extérieur.

/** Met à jour l'état de décision du bot : `underFire` vaut vrai si la santé a baissé depuis la décision précédente. */
export function decide(bot, ship) {
  const health = ship.hp + ship.shield;
  bot.underFire = health < bot.lastHealth;
  bot.lastHealth = health;
}
