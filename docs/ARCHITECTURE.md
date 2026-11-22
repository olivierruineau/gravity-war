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
- Contact vaisseau/planète dans `core/landing.js` : `evaluateLanding` (vitesse d'approche, tangentielle, erreur d'angle) est la seule source des seuils (collision, aide visuelle, IA). Atterrissage → `landedOn`, vitesse nulle, `EVT.LANDED` ; sinon dégâts proportionnels à l'excès de vitesse, rebond garanti, `EVT.IMPACT`.
- Ordre d'un pas, par vaisseau vivant : intentions → maintien/décollage si posé (un vaisseau posé saute la suite) → gravité + intégration → bornes → contact planètes.

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

| ADR                                         | Sujet                                 | Statut  |
| ------------------------------------------- | ------------------------------------- | ------- |
| [0001](adr/0001-stack-technique.md)         | Stack technique                       | Accepté |
| [0002](adr/0002-architecture-core.md)       | Architecture de `core/` et pont rendu | Accepté |
| [0003](adr/0003-gravite-et-atterrissage.md) | Gravité, collision et atterrissage    | Accepté |
