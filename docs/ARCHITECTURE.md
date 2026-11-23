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

1. l'input clavier écrit `ships[0].intent` ;
2. `n = consumeSteps(clock, delta / 1000)` (`core/clock.js`) : accumulateur, delta plafonné à `MAX_FRAME_DT`, au plus `MAX_STEPS_PER_FRAME` pas, arriéré jeté au-delà ;
3. `n` fois `step(world, FIXED_DT)` — l'IA des bots écrit leurs intentions au début de chaque pas ;
4. rendu **immédiat** : `clear()` des `Graphics` et redessin filaire de tout l'état (fonctions de dessin de `entities/`) ;
5. lecture de la file `world.events` (effets, sons) puis `clearEvents(world)`.

Pas d'interpolation de rendu en v1 (à ajouter seulement si une saccade est constatée sur écran > 60 Hz). La simulation ne dépend jamais de la fréquence d'affichage.

## Rendu rétro

Résolution interne 480×270, `pixelArt` + `roundPixels`, mise à l'échelle `FIT` centrée, `image-rendering: pixelated` sur le canvas.

## Décisions

| ADR                                            | Sujet                                                       | Statut                                      |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| [0001](adr/0001-stack-technique.md)            | Stack technique                                             | Accepté                                     |
| [0002](adr/0002-architecture-core.md)          | Architecture de `core/` et pont rendu                       | Accepté                                     |
| [0003](adr/0003-gravite-et-atterrissage.md)    | Gravité, collision et atterrissage                          | Accepté (§2 « sommation » amendé par 0004)  |
| [0004](adr/0004-zone-gravite-dominante.md)     | Zone de gravité dominante (chevauchements)                  | Accepté                                     |
| [0005](adr/0005-factions-batiments-capture.md) | Factions, capture, bâtiments, tourelles, missiles, bouclier | Accepté (précise 0002 ; amendé par 0007)    |
| [0006](adr/0006-ia-des-bots.md)                | IA des bots : décision par utilité, pilote, prédiction      | Accepté (précise 0002 §2, §5, §6 ; 0005 §8) |
| [0007](adr/0007-degats-aux-batiments.md)       | Dégâts aux bâtiments : défenses, puis bâtiments             | Accepté (amende 0005 §3, §4)                |
