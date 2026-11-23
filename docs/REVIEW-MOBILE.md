# Revue de la phase 8 (mobile)

Revue faite par la session de développement (pas de relecteur indépendant), avec les mesures et les tests de la phase. À refaire par un regard extérieur et sur appareil réel avant une diffusion large : voir [`CHECKLIST-MOBILE.md`](CHECKLIST-MOBILE.md).

## Ce qui a été vérifié

| Sujet                        | Vérification                                                                                                                                                      | Résultat                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Non-régression PC            | Tests unitaires inchangés + scénario clavier (`npm run e2e`) : flèches, Espace, Ctrl, P, Échap, M, fin de partie                                                  | 1808 tests, 46/46 e2e         |
| Multi-touch                  | 3 doigts simultanés (rotation, poussée, tir) sur Pixel 7 et iPhone 13 émulés ; glissement d'un bouton à l'autre ; doigt perdu                                     | OK                            |
| Cohabitation clavier/tactile | Scénario mixte : clavier tenu + doigt, bascule de l'affichage dans les deux sens                                                                                  | OK                            |
| Fuites                       | Écouteurs retirés à l'arrêt de scène (`navigation`, `watchSource`, `watchAway`, audio) ; pointeurs créés une fois (4 = souris + 3 doigts) après plusieurs parties | OK (test e2e)                 |
| Allocation par frame         | `readPointers`, `mergeTouchIntent`, `applyLandingAssist` n'allouent pas ; l'overlay ne se redessine que sur changement d'état                                     | OK (lecture du code)          |
| Cadence                      | CPU ralenti ×4 : 44 fps ; ×6 : 30 fps, 37 fps en qualité basse ; auto bascule seule (voir `ARCHITECTURE.md`, « Performance mobile »)                              | Budget 30 fps tenu jusqu'à ×6 |
| Hors ligne                   | Service worker actif, rechargement en mode hors ligne : la page et le jeu démarrent                                                                               | OK                            |
| Formats d'écran              | 640×360, 844×390 (19,5:9), 1024×768 : jeu centré, HUD et boutons sans recouvrement (`hud-layout.test.js` vérifie aussi les rectangles)                            | OK                            |

## Défauts trouvés et corrigés pendant la phase

- **Doigts empilés à chaque partie** : `input.addPointer(2)` était rappelé à chaque `GameScene.create` ; le gestionnaire d'entrée étant partagé, le nombre de pointeurs montait à chaque « Rejouer ». Corrigé : `input.activePointers` fixé une fois dans la config du jeu (trouvé par le scénario e2e, qui compte les pointeurs).
- **Troisième doigt ignoré** après un premier correctif tenté avec `pointers.length` : `pointers[0]` est la souris. Le test « 3 doigts » l'a signalé tout de suite.
- **Cache ignoré hors ligne** : `vite preview` envoie `Vary: Origin`, ce qui faisait rater toutes les requêtes de modules du service worker. Corrigé (`ignoreVary`).
- **Écran de fin validé par un appui en cours** (point connu de `REVIEW-v1.md`) : l'écran est désormais armé 600 ms après son affichage.
- **HUD sous les pouces** : déplacé en haut ; un test vérifie qu'aucun élément fixé ne recouvre un bouton de jeu.

## Limites connues, sans correctif prévu

1. **Un doigt posé n'est plus lu si une touche est pressée dans le même temps** : l'overlay se masque dès la touche, donc le doigt déjà posé est ignoré jusqu'au prochain toucher. Cas rare (clavier et doigt tenus ensemble) ; le sens inverse (touche tenue puis doigt) fonctionne.
2. **Un frôlement d'écran sur portable tactile** fait réapparaître les boutons ; ils repartent à la touche suivante.
3. **iPhone** : pas de plein écran sans installation (limite d'iOS), le déroulé passe par « Sur l'écran d'accueil ». Verrouillage d'orientation non disponible : l'invite « Tournez l'appareil » en tient lieu.
4. **L'audio sur iOS** ne démarre qu'au relâchement du premier doigt ; le son de validation du menu peut être muet la toute première fois.
5. **Mesures sans GPU** : la cadence vient d'un Chromium logiciel avec CPU ralenti, pas d'un appareil réel. Les chiffres comparent les réglages entre eux ; la valeur absolue reste à confirmer sur un téléphone milieu de gamme.
6. **Les flèches hors écran** peuvent passer sous un bouton tactile ; elles restent lisibles car l'overlay est translucide.
7. **Pas de test automatisé du service worker lui-même** au-delà de la génération (`pwa-plugin.test.js`) et du scénario hors ligne manuel ci-dessus ; la mise à jour entre deux versions est à valider sur un déploiement réel.
8. **La manette** n'est pas gérée ; elle réutilisera la table de navigation et la fusion d'intentions (backlog).

## Phase 9 : retours de playtest sur appareil

Auto-revue de la phase 9 (aide à la pose, difficulté, options, netteté), sans revue Opus indépendante.

- **9.1 Aide à la pose** : toujours un filtre d'intention (`landingAssist.js`), déclenchement ramené de 120 à 70 px, nez contre la vitesse latérale au-delà de 80 % du seuil, retrait dès que le joueur pousse. Réglages `ASSIST_*` à valider en jeu.
- **9.2 / 9.4 Difficulté** ([ADR 0010](adr/0010-niveaux-de-difficulte.md)) : surcharges de profil, rien dans les règles. Le test de duel (6 graines) ordonne facile < normal < difficile ; les valeurs restent à régler en recette. `auto` = facile au tactile.
- **9.3 Options** : modèle pur testé, panneau commun au menu et à la pause. Défaut corrigé au passage : Phaser peut rejouer une même touche dans une image lente, d'où une action doublée (mesuré 2 fois sur 8) ; `createNavigation` ignore désormais un `timeStamp` déjà traité. Le test e2e ne le détectait que par hasard.
- **9.5 Netteté** ([ADR 0011](adr/0011-nettete-rendu-haute-resolution.md)) : changement transversal de rendu. Risque principal : coût de remplissage (jusqu'à 4×). Mesuré en rendu logiciel : à `K` = 2 fixe, ×4 passe de 44 à 34 fps, d'où le repli automatique à `K` = 1 avec la lueur. Avec la qualité auto, les cadences retrouvent celles d'avant (×4 47,7 ; ×6 34,6 ; ×8 27,1 fps). À confirmer sur un vrai GPU, où le surcoût devrait être négligeable.
- **Limites** : changer la taille de la fenêtre en cours de scène (plein écran) ne recalcule `K` qu'à la scène suivante ; les textes créés à `K` = 2 restent un peu flous après un repli à 1.

## Verdict

La phase respecte sa définition de fin (jeu jouable au doigt du menu à la fin, installable, budget de cadence tenu en émulation) sans régression au clavier. La recette sur vrais appareils reste à faire (checklist).
