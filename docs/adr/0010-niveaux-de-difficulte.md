# 0010 — Niveaux de difficulté des bots

- **Statut** : accepté
- **Date** : 2026-11-23

## Contexte

Le test sur mobile a montré que la partie est plus dure au doigt (retour de playtest, phase 9). Il faut trois niveaux de bots (facile, normal, difficile), le plus facile servant de défaut au tactile (9.4), sans toucher aux règles du `core` ni à l'équilibrage validé en 7.2.

## Décision

- `data/ai.js` garde `BOT_PROFILE` (= niveau **normal**, inchangé) et ajoute `DIFFICULTY_LEVELS`, des **surcharges** par niveau et `botProfile(level)` (profil complet gelé, normal si le niveau est inconnu).
- Seuls dix réglages varient : `startDelay`, `decisionPeriod` (cadence), `reactionTime` (délai avant le premier tir), `aimError` et `fireCone` (précision), `fireRange`, `aggression`, `missileNotice` et `bulletNotice` (perception), `dodgeBullets` (esquive). Le facile décide lentement, vise mal, tire de plus près, ne voit pas les balles ; le difficile décide vite, vise juste, tire de loin et est plus agressif.
- Le niveau est une chaîne dans l'état du bot (`bot.level`, JSON pur), passée à `createWorld(map, seed, { difficulty })` (normal par défaut). Les modules d'IA lisent `botProfile(bot.level)` pour ces réglages ; les autres restent sur `BOT_PROFILE`.
- Aucune règle du jeu ne change : mêmes vitesses, mêmes dégâts, mêmes seuils d'atterrissage pour tous.

- **Défaut par appareil (9.4)** : le réglage vaut `auto | easy | normal | hard`, `auto` par défaut. `auto` se résout au lancement de la partie (`resolveDifficulty`) : facile si la dernière source utilisée est le tactile, normal sinon (comme l'aide à la pose). Un niveau choisi à la main prime toujours. Mémorisé dans `localStorage` (`gravity-war.difficulty`).

## Alternatives écartées

- Bonus de PV ou de dégâts pour les bots : triche visible et casse l'égalité des règles (ADR 0006).
- Une copie complète du profil par niveau : dérive silencieuse quand on règle le normal ; les surcharges ne disent que ce qui change.

## Conséquences

- Par défaut, parties et graines identiques à avant (niveau normal).
- Test de scénario `tests/scenarios/ai-difficulty.test.js` : sur 6 graines, le facile finit avec moins de planètes que le normal, le normal moins que le difficile.
- Les valeurs sont des points de départ à régler en playtest (recette sur appareil).
