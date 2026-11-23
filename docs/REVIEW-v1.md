# Revue globale avant release v1 (7.5)

Revue faite à la main sur la branche `on-going` (phases 5 à 7.4), complétée par des mesures jetables hors du dépôt.

## Conformité aux règles du projet

| Règle (CLAUDE.md)                       | Résultat                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/` sans Phaser ni DOM              | Conforme (aucun import de `phaser`, ESLint l'impose).                                                                                                                                                                                 |
| Aléa seedé dans `core/`                 | Conforme : `Math.random` n'apparaît que pour la graine de partie (`GameScene`) et la rotation cosmétique des rayons d'explosion.                                                                                                      |
| Pas de `console.log` ni de TODO en code | Conforme.                                                                                                                                                                                                                             |
| Pas d'allocation dans la boucle         | **Défaut corrigé en 7.4** : `Math.hypot` allouait à chaque appel (2 049 passages du ramasse-miettes pour 10 min de partie, 63 après). Garde ESLint ajoutée. Reste, hors simulation : le texte du debug F3 (visible seulement).        |
| Nettoyage des listeners                 | **Défaut corrigé en 7.4** : pause, fin de partie et menu retirent leurs touches à la sortie de scène ; vérifié (1 listener après 3 cycles menu → jeu → pause → menu).                                                                 |
| Données hors du code                    | Conforme : cartes, bâtiments, commandes, profil des bots et palette sont en données.                                                                                                                                                  |
| Pas de code mort                        | **Corrigé** : `setSfxEnabled` (jamais appelée) retirée. Restent des exports utilisés seulement par les tests (`vec2`, `lerp`, `int`, `potential`, `impactDamage`, `arena`), conservés comme API de la bibliothèque et cartes de test. |

## Mesures

- **Robustesse** : 30 parties de 10 min sur la carte Triade, joueur aléatoire contre 2 bots. Aucun NaN, aucun vaisseau hors carte, PV / bouclier / missiles toujours dans leurs bornes, compteurs de planètes cohérents avec les propriétaires, `world` toujours sérialisable en JSON, issue de partie écrite une seule fois, **0 événement perdu**, **18 projectiles actifs au maximum sur 256**.
- **Déterminisme** : 3 graines × 240 s, deux exécutions identiques au caractère près ; graines différentes, mondes différents.
- **Performance** : simulation à 0,028 ms par pas (3 factions, 2 IA), soit environ 1,7 ms par seconde de jeu. Navigateur (Chromium sans affichage) : 60 images par seconde stables (médiane 16,7 ms, p99 16,8 ms), tas JS stable sur 40 s (13,3 → 13,6 Mo).
- **Équilibrage** : validé en partie jouée (7.2). Un peu difficile : des niveaux de difficulté sont au backlog.

## Points relevés, non bloquants pour la v1

1. **Tir involontaire au démarrage** : le joueur appuie sur `ESPACE` dans le menu et la touche (aussi « tir principal ») peut rester enfoncée à l'entrée dans la partie. À regarder en jeu.
2. **Sourdine** : résolue après la revue, touche `M` (`audio/mute.js`, `systems/muteKey.js`).
3. **Debug F3** : le texte est reconstruit à chaque image tant qu'il est visible (allocations de chaînes). Sans effet hors debug.
4. **Bundle** : ≈ 1,4 Mo (373 Ko compressés), dominé par Phaser. Acceptable pour un jeu navigateur ; un découpage en deux fichiers n'apporterait que du cache.
5. **IA** (rappel de la revue 5.8) : `findDetour` ignore la vitesse et les tourelles hors cible ; esquive des balles peu efficace. Acceptable au niveau de difficulté actuel.
6. **Aucune partie jouée à la manette ou au tactile** : hors périmètre v1 (backlog).
