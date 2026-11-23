# Gravity War

Petit jeu indé rétro (esprit années 90) en JavaScript, dans le navigateur. Vous pilotez un vaisseau triangulaire dans un champ de planètes, vous capturez des mondes et vous affrontez deux bots. Rendu 100 % filaire sur fond sombre, sons chiptune synthétisés. Phaser 4 + Vite.

## Jouer

```bash
npm install
npm run dev      # http://localhost:5173
```

Une version de production se construit avec `npm run build` (dossier `dist/`, chemins relatifs : déployable tel quel sur GitHub Pages, itch.io ou n'importe quel hébergement statique, en HTTPS pour l'installation et le hors ligne). `npm run preview` la sert en local.

**Sur téléphone ou tablette** : ouvrez la page en paysage ; les commandes tactiles s'affichent au premier toucher. Pour jouer sans barre du navigateur et hors ligne, installez le jeu (Android Chrome : « Installer l'application » ; iPhone : Partager → « Sur l'écran d'accueil »). Clavier et tactile marchent ensemble.

**But** : éliminer les deux bots. Un bot est éliminé quand il n'a plus aucune planète et que son vaisseau est détruit. Vous perdez dans le même cas.

### Commandes

| Touche     | Action                                         |
| ---------- | ---------------------------------------------- |
| `←` `→`    | Tourner                                        |
| `↑`        | Poussée (dans l'axe du nez, illimitée)         |
| `Espace`   | Tir principal                                  |
| `Ctrl`     | Missile (déblocage par bâtiment, stock limité) |
| `P`        | Pause (`Echap` : retour au menu)               |
| `M`        | Couper / rétablir le son                       |
| `F3`       | Overlay de debug (FPS, mode des bots)          |
| `H` (menu) | Aide des commandes                             |
| `A` (menu) | Aide à l'atterrissage : auto, oui, non         |
| `Q` (menu) | Qualité : auto, haute, basse                   |

**Au doigt (paysage)** : ◄ ► à gauche pour tourner ; à droite ▲ (poussée), TIR et MIS (missile) ; II (pause) et SON en haut à gauche. Trois doigts en même temps sont pris en charge. L'aide à l'atterrissage (alignement automatique du nez à l'approche) est active au tactile par défaut.

Pas de frein : pour ralentir, faites demi-tour et poussez. Détails des règles : [`docs/HOW-TO-PLAY.md`](docs/HOW-TO-PLAY.md).

### L'écran

- **Planète** : cercle dont le contour indique le propriétaire (blanc = neutre, vert = vous, rouge et bleu = les bots). Les bâtiments sont les carrés dessinés dedans.
- **Haut** : barre de vie, bouclier et stock de missiles (à droite des boutons II et SON), vitesse à gauche de la minimap. **Haut droite** : minimap de toute la carte. **Bords de l'écran** : flèches vers les ennemis et vers la planète objectif la plus proche quand ils sont hors de vue.
- Près d'une planète, des jauges vertes ou oranges disent si l'atterrissage est sûr.

## Développer

```bash
npm test         # Vitest, une passe
npm run lint     # ESLint
npm run check    # lint + format + tests + build : à passer avant de commiter
npm run e2e      # scénarios d'appareils (Playwright, voir tests/e2e/run.cjs) : tactile, clavier, mixte
```

Node 22 ou plus. Le code de jeu pur est dans `src/core/` (sans Phaser ni DOM, testable) ; Phaser ne fait que lire cet état et l'afficher. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la structure, [`docs/SPEC.md`](docs/SPEC.md) pour la spécification, [`docs/adr/`](docs/adr/) pour les décisions, [`docs/REVIEW-v1.md`](docs/REVIEW-v1.md) et [`docs/REVIEW-MOBILE.md`](docs/REVIEW-MOBILE.md) pour les revues, [`docs/CHECKLIST-MOBILE.md`](docs/CHECKLIST-MOBILE.md) pour la recette sur appareil, [`TODO.md`](TODO.md) pour l'avancement et [`CLAUDE.md`](CLAUDE.md) pour les règles du projet (stack, conventions, orchestration des agents).

## Version actuelle (v1 + mobile)

Une carte fixe (« Triade », 13 planètes, symétrique pour trois bases), deux bots, une seule difficulté. Jouable au clavier et au doigt (paysage), installable hors ligne. Hors périmètre : niveaux de difficulté, nombre de bots réglable, génération de cartes, campagne, manette, musique.
