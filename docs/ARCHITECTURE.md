# Architecture

> Document vivant : à mettre à jour quand la structure change. Les décisions sont tracées dans [`adr/`](adr/).

## Vue d'ensemble

```
        entrée clavier/souris/gamepad
                    │
                    ▼
   ┌──────────────────────────────┐
   │ scenes/ (Phaser, minces)     │  orchestrent : lisent l'input, appellent core, mettent à jour l'affichage
   └──────┬───────────────┬───────┘
          │               │
          ▼               ▼
   ┌─────────────┐  ┌──────────────────┐
   │ core/       │  │ entities/        │
   │ logique pure│─▶│ systems/ (rendu) │  affichent l'état de core/
   │ sans Phaser │  │ audio/           │
   └─────────────┘  └──────────────────┘
```

- **`core/`** possède l'état et les règles du jeu. Pure, déterministe, testée par Vitest.
- **`scenes/`, `entities/`, `systems/`** sont la couche Phaser : rendu, input, caméra, UI, effets.
- **`config.js`** : constantes globales. **`audio/sfx.js`** : sons ZzFX.

## Modèle de `core/` ([ADR 0002](adr/0002-architecture-core.md))

- `world` est un objet de **données pures, JSON-sérialisable** ; les modules de `core/` sont des fonctions (pas de classes). Point d'entrée unique : `createWorld(map, seed)` puis `step(world, dt)`.
- Entités = objets simples dans des **tableaux de taille fixe**, identifiées par leur **index** ; les références croisées sont des index (`planet.owner`, `ship.landedOn`, `-1` = aucun). `ships[i]` ↔ faction `i` (`0` = joueur). Rien n'est retiré : la mort est un état, les projectiles vivent dans un pool préalloué (`active`).
- Pilotage par **intentions** `ship.intent = { rotate: -1|0|1, thrust, fire, missile }` : écrite par `systems/keyboardInput.js` pour le joueur, par `core/ai/` pour les bots. C'est la seule donnée du monde que Phaser écrit.
- Modules d'entité indépendants ; les interactions (gravité, collisions, capture) sont dans des modules de système ; `world.js` est le seul orchestrateur.
- Vec2 à paramètre de sortie (`add(out, a, b)`), RNG mulberry32 dans `world.rng`, `Math.random` interdit dans `core/`. Intégrateur : Euler semi-implicite.

## Gravité et atterrissage ([ADR 0003](adr/0003-gravite-et-atterrissage.md))

- Planète = `{ pos, radius, owner, mu, range }`, créée depuis la carte `{ x, y, radius, gravity? }` ; `gravity` = gravité de surface `g0` (px/s²), plafonnée à `0,6 × SHIP_THRUST` pour garantir le décollage.
- Gravité 1/d² à portée finie `R = 5·r`, force décalée qui s'annule continûment en `R`, bornée à `g0` sous la surface ; espace inertiel hors des champs (`core/gravity.js`).
- Champs qui se chevauchent ([ADR 0004](adr/0004-zone-gravite-dominante.md)) : pas de somme, mais une moyenne des accélérations pondérée par `(1 − d/R) / (d − r)^p` (p = `GRAVITY_DOMINANCE_POWER` = 2). La surface la plus proche domine, g0 exact sur toute surface, |a| ≤ max g0, résultat identique à l'ADR 0003 dans une zone seule. Le rendu (flèche de gravité) relit `gravityAt`, sans recopier la loi.
- Contact vaisseau/planète dans `core/landing.js` : `evaluateLanding` (vitesse d'approche, tangentielle, erreur d'angle) est la seule source des seuils (collision, aide visuelle, IA). Atterrissage → `landedOn`, vitesse nulle, `EVT.LANDED` ; sinon dégâts proportionnels à l'excès de vitesse, rebond garanti, `EVT.IMPACT`.
- Ordre d'un pas, par vaisseau vivant : intentions → maintien/décollage si posé (un vaisseau posé saute la suite) → gravité + intégration → bornes → contact planètes.

## Factions, capture, bâtiments, combat ([ADR 0005](adr/0005-factions-batiments-capture.md), phase 4)

- `world.factions[f]` = `{ planetCount, hasMissiles, hasShield, eliminated }`, résumé **recalculé à chaque pas** depuis les planètes par `updateFactions` (seul écrivain), sauf `eliminated`, qui est définitif. Une faction sans planète au départ est **hors jeu** : elle ne capture pas et n'est jamais éliminée (cibles d'entraînement, mini-cartes de test). `world.outcome` vaut PLAYING, VICTORY ou DEFEAT, du point de vue de la faction 0.
- Planète : `captureBy`/`captureTime`. La capture avance si **exactement un** vaisseau vivant est posé, d'une autre faction non éliminée, et qu'aucune tourelle n'est construite. Elle a lieu après `CAPTURE_TIME`, puis les bâtiments sont réinitialisés.
- Bâtiments : slots préalloués `buildings[k]` = `{ built, hp, cooldown }`. `k` est l'index du catalogue `src/data/buildings.js`, dont l'ordre est l'ordre de développement. Le chantier est le premier slot non construit, et seules les planètes possédées se développent.
- Tourelles : tirent radialement dans le pool commun (owner = faction de la planète), sans anticipation et avec dispersion seedée. Leur zone touchable est le disque de la planète : un projectile ennemi absorbé par la planète abîme la première tourelle construite.
- Missiles : stock par vaisseau, débloqués par l'usine. Ils ignorent la gravité, et leur cible est réacquise à chaque pas dans un cône (pas de champ `target`). Réarmement posé sur une planète de sa faction équipée d'une usine.
- Bouclier : absorbé dans `damageShip` avant les PV. Recharge après un délai sans dégâts, en vol comme posé, si la faction a un générateur.
- Ordre d'un pas : IA des bots (intentions) → vaisseaux (respawn, ou intentions, armes, posé, gravité, bornes, contact) → tourelles → guidage et déplacement des projectiles → collisions des projectiles → bouclier et réarmement → bâtiments → capture → factions → `tick++`.

## IA des bots ([ADR 0006](adr/0006-ia-des-bots.md), phase 5)

- `core/ai/` est pur. Il ne s'active que pour les factions passées en option (`createWorld(map, seed, { bots: [1, 2] })`) ; sans cette option, il n'y a aucun bot (tests, cible d'entraînement). Il tourne à l'**étape 1 de `step`** et n'écrit que `ships[f].intent`, `world.ai[k]` (état JSON du bot) et `world.aiRng` (flux d'aléa séparé : les tourelles gardent `world.rng`). Il ne lit jamais `world.events`.
- Deux couches. La **décision** (`decide.js`, toutes les 0,5 s) choisit par score d'utilité un couple (mode, cible) : CAPTURE, ASSAULT, HUNT, DEFEND, RETREAT, REARM ou IDLE. Elle a une hystérésis (bonus de l'option en cours, engagement minimal) et un bannissement anti-blocage. Le **pilote** (`pilot.js`, `touchdown.js`, `combat.js`, à chaque pas) traduit ce but en intentions discrètes. Ses priorités : réflexe anti-crash, puis esquive de missile, puis manœuvre. Il tire indépendamment du mouvement.
- Le pilote prédit avec `core/predict.js` (`predictPath`, le même intégrateur que `step`, avec `gravityAt`) et juge l'atterrissage avec `evaluateLanding` sur l'état de contact prédit : il ne recopie aucune loi physique.
- Perception : tout l'état stratégique, comme la minimap. Les missiles ne sont vus que dans un rayon local. Jamais l'`intent` ni le stock des autres.
- Réglages dans `src/data/ai.js` (`BOT_PROFILE`, une seule difficulté).

## Boucle de jeu

`GameScene.update(time, delta)` :

1. `systems/playerInput.js` écrit `ships[0].intent` : le clavier d'abord, puis les doigts (overlay tactile), puis l'aide à la pose si elle est active ;
2. `n = consumeSteps(clock, delta / 1000)` (`core/clock.js`) : accumulateur, delta plafonné à `MAX_FRAME_DT`, au plus `MAX_STEPS_PER_FRAME` pas, arriéré jeté au-delà ;
3. `n` fois `step(world, FIXED_DT)` — l'IA des bots écrit leurs intentions au début de chaque pas ;
4. rendu **immédiat** : `clear()` des `Graphics` et redessin filaire de tout l'état (fonctions de dessin de `entities/`) ;
5. lecture de la file `world.events` (effets, sons) puis `clearEvents(world)`.

La scène gère aussi deux états d'affichage, hors règles du core : la **pause** (`P`, `systems/pauseScreen.js`) arrête tout, et une partie **décidée** (`world.outcome`) fige la simulation 1,5 s après l'issue (`END_SCREEN_DELAY`) avant d'afficher l'écran de fin (`systems/endScreen.js`) ; `Espace` relance, `Echap` ramène au menu. Les listeners clavier sont retirés à la sortie de scène.

Pas d'interpolation de rendu en v1 (à ajouter seulement si une saccade est constatée sur écran > 60 Hz). La simulation ne dépend jamais de la fréquence d'affichage.

## Rendu rétro

Unités de jeu 480×270, canvas dessiné à `K` fois cette taille (`systems/renderScale.js`, [ADR 0011](adr/0011-nettete-rendu-haute-resolution.md)), antialiasing, mise à l'échelle `FIT` centrée. Une lueur discrète (`entities/glow.js` : un halo de `GLOW_WIDTH` px à `GLOW_ALPHA` sous le trait net) habille vaisseaux, planètes, projectiles et explosions. Les couleurs viennent toutes de `PALETTE` (les textes passent par `systems/color.js`).

## Interface (phase 6)

Tout est dans `systems/`, en lecture seule de `world`. La logique de ce qui s'affiche est séparée du dessin quand elle est testable :

- `hud.js` + `hudModel.js` : vie, bouclier, missiles et vitesse, **en haut** : les deux coins du bas sont réservés aux pouces. Les positions vivent dans `hudLayout.js` (testé : rien ne recouvre un bouton de jeu).
- `minimap.js` + `minimapLayout.js` : carte entière en haut à droite, cadre de la caméra.
- `offscreenIndicators.js` + `offscreenLayout.js` : flèches au bord vers les ennemis et la planète objectif.
- `endScreen.js` + `endScreenModel.js`, `pauseScreen.js`, et l'aide des commandes dont la source unique est `data/controls.js`.

## Entrée multi-sources (phase 8, [ADR 0008](adr/0008-entree-multi-sources.md))

Clavier et tactile sont actifs **en même temps** ; seul l'affichage suit la dernière source utilisée (`systems/inputSource.js`, état partagé : `keyboard` ou `touch`).

- **Navigation** : `data/inputBindings.js` associe les actions (`confirm`, `back`, `pause`, `mute`, `help`, `assist`, `quality`) à leurs touches ; `systems/navigation.js` expose `on(action, fn)` aux scènes, qui ne connaissent jamais les touches, et `watchSource(scene, fn)` pour adapter les vues. Une manette ajoutera une colonne à la table.
- **Pilotage** : `keyboardInput.js` écrit les quatre champs de l'`Intent`, `touchControls.js` (overlay, disposition dans `data/touchLayout.js`) les complète par OU logique, `landingAssist.js` n'écrit que `rotate`. Le modèle tactile (`touchModel.js`) lit l'état des pointeurs à chaque frame : un doigt perdu ou annulé se relâche seul.
- **Boutons d'interface** : `uiButton.js` (cibles de 40 px du jeu, soit ≥ 44 px CSS dès 297 px de hauteur), `optionsPanel.js` + `optionsModel.js` (écran d'options 9.3 : difficulté, aide à la pose, qualité, son, plein écran, commandes ; panneau superposé au menu et à la pause, modèle pur testé), réglages persistés dans `localStorage` (`difficultySetting.js`, `assistSetting.js`, `quality.js`, `audio/mute.js`).
- **Plateforme** : `platform.js` (pointeur grossier, portrait, plein écran, `watchAway` → pause automatique), `audio/lifecycle.js` (déblocage au premier geste, suspension en arrière-plan), `build/pwaPlugin.js` + `build/sw.template.js` (hors ligne, [ADR 0009](adr/0009-pwa-hors-ligne.md)), `quality.js` (lueur coupée si la cadence passe sous 40 fps).

Tests : unitaires sur les modèles purs ; scénarios d'appareils Playwright (`npm run e2e`, `tests/e2e/`) ; checklist manuelle [`CHECKLIST-MOBILE.md`](CHECKLIST-MOBILE.md). Revue : [`REVIEW-MOBILE.md`](REVIEW-MOBILE.md).

## Carte (7.1)

`src/data/maps/triad.js` : 2600×2400, 13 planètes, symétrie de rotation d'ordre 3 (trois bases à 900 px du centre, à 120°), surfaces espacées d'au moins 120 px et portées de gravité disjointes. `tests/unit/triad-map.test.js` vérifie symétrie, équité des distances et bornes. `arena.js` reste la carte de développement des tests. Aperçu : [`triad-map.png`](triad-map.png).

## Performance (7.4)

Aucune allocation dans la boucle de simulation. `Math.hypot` alloue à chaque appel : utiliser `hypot` de `core/math.js` (ESLint l'impose dans tout `src/`). Mesure : ≈ 0,03 ms par pas pour 3 vaisseaux et 2 IA, soit 63 passages du ramasse-miettes pour 10 min de partie. Revue complète : [`REVIEW-v1.md`](REVIEW-v1.md).

### Performance mobile (8.9)

Depuis 9.5 ([ADR 0011](adr/0011-nettete-rendu-haute-resolution.md)) le canevas est dessiné à `K` × 480×270 (`K` ≤ 2) pour des traits fins : le remplissage coûte jusqu'à 4× plus. Mesuré en rendu logiciel (sans GPU, donc pire cas) : avec `K` = 2 en permanence, ×4 tombe à 34 fps et ×6 à 25 fps (K = 3 : 24 et 18 fps, plafond abandonné). Le moniteur de cadence ramène donc **aussi** le canevas à `K` = 1 (`applyRenderScale`, avec la lueur coupée) quand il passe sous 40 fps, ce qui rend les chiffres ci-dessous (inchangés en ordre de grandeur : ×4 47,7 fps, ×6 34,6 fps, ×8 27,1 fps avec la qualité auto). La qualité BASSE force `K` = 1. Avant 9.5, le canevas restait à 480×270 pixels réels et le coût venait des traits dessinés et de la simulation (rattrapage de pas quand la cadence baisse). Mesure : Chromium sans GPU, émulation Pixel 7 en paysage, CPU ralenti, trois doigts posés (poussée, tir, rotation), 10 s après 2 s de chauffe.

| CPU ralenti | Lueur | Cadence moyenne |
| ----------- | ----- | --------------- |
| ×1          | oui   | 59,7 fps        |
| ×4          | oui   | 44,3 fps        |
| ×6          | oui   | 29,9 fps        |
| ×6          | non   | 37,8 fps        |
| ×6          | auto  | 37,2 fps        |
| ×8          | non   | 27,6 fps        |
| ×8          | oui   | 22,3 fps        |

Le budget de 30 images par seconde tient donc jusqu'à ×6 grâce à la qualité basse. La **lueur** (halo sous chaque trait, `entities/glow.js`) est le seul degré de dégradation : en mode `auto`, `systems/quality.js` la coupe pour la session si la cadence moyenne d'une fenêtre de 3 s passe sous 40 fps (après 2 s de chauffe). Réglage manuel dans les Options : AUTO, HAUTE, BASSE, mémorisé. À confirmer sur un vrai appareil (checklist de `docs/CHECKLIST-MOBILE.md`).

## Décisions

| ADR                                                | Sujet                                                               | Statut                                      |
| -------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| [0001](adr/0001-stack-technique.md)                | Stack technique                                                     | Accepté                                     |
| [0002](adr/0002-architecture-core.md)              | Architecture de `core/` et pont rendu                               | Accepté                                     |
| [0003](adr/0003-gravite-et-atterrissage.md)        | Gravité, collision et atterrissage                                  | Accepté (§2 « sommation » amendé par 0004)  |
| [0004](adr/0004-zone-gravite-dominante.md)         | Zone de gravité dominante (chevauchements)                          | Accepté                                     |
| [0005](adr/0005-factions-batiments-capture.md)     | Factions, capture, bâtiments, tourelles, missiles, bouclier         | Accepté (précise 0002 ; amendé par 0007)    |
| [0006](adr/0006-ia-des-bots.md)                    | IA des bots : décision par utilité, pilote, prédiction              | Accepté (précise 0002 §2, §5, §6 ; 0005 §8) |
| [0007](adr/0007-degats-aux-batiments.md)           | Dégâts aux bâtiments : défenses, puis bâtiments                     | Accepté (amende 0005 §3, §4)                |
| [0008](adr/0008-entree-multi-sources.md)           | Entrée multi-sources (clavier, tactile)                             | Accepté                                     |
| [0009](adr/0009-pwa-hors-ligne.md)                 | PWA : installation et hors ligne sans dépendance                    | Accepté                                     |
| [0010](adr/0010-niveaux-de-difficulte.md)          | Niveaux de difficulté des bots (surcharges de profil)               | Accepté                                     |
| [0011](adr/0011-nettete-rendu-haute-resolution.md) | Netteté : canvas à la résolution de l'écran, monde en unités de jeu | Accepté                                     |
