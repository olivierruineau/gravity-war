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

## Boucle de jeu

Pas de temps fixe (`FIXED_DT`) avec accumulateur dans `GameScene.update` : on avance la simulation de `core/` par pas de 1/60 s tant que le temps accumulé le permet, puis on rend. La simulation ne dépend jamais de la fréquence d'affichage.

_(À implémenter avec la première feature de gameplay.)_

## Rendu rétro

Résolution interne 480×270, `pixelArt` + `roundPixels`, mise à l'échelle `FIT` centrée, `image-rendering: pixelated` sur le canvas.

## Décisions

| ADR                                 | Sujet           | Statut  |
| ----------------------------------- | --------------- | ------- |
| [0001](adr/0001-stack-technique.md) | Stack technique | Accepté |
