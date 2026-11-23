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

## Verdict

La phase respecte sa définition de fin (jeu jouable au doigt du menu à la fin, installable, budget de cadence tenu en émulation) sans régression au clavier. La recette sur vrais appareils reste à faire (checklist).
