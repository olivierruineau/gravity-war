# 0001 — Stack technique

- **Statut** : accepté
- **Date** : 2026-11-23

## Contexte

Jeu indé rétro (esprit années 90), 100 % JavaScript dans le navigateur, développé avec une forte assistance d'agents IA. Besoin : boucle de jeu, scènes, input, audio, rendu pixel-art, build statique simple.

## Décision

- **Phaser 4** comme moteur 2D, **Vite** pour dev/build, **ZzFX** pour les SFX, **Vitest** pour les tests, **ESLint + Prettier** pour la qualité.
- JavaScript ESM sans TypeScript.
- Séparation stricte `core/` (logique pure) / couche Phaser, pour garder la simulation testable.

## Alternatives écartées

- **PixiJS + libs à la carte** : rendu excellent mais il faut assembler soi-même scènes, input, audio, caméra.
- **Kaplay** : très rapide pour prototyper, moins adapté à une architecture testable et à la croissance du projet.
- **Canvas 2D / Matter.js pur** : plus de contrôle, mais on réécrit tout le moteur.
- **TypeScript** : non retenu pour rester léger ; JSDoc sur les API de `core/` en compensation.

## Conséquences

- Bundle ~350 Ko gzip dominé par Phaser (acceptable pour un jeu navigateur).
- La gravité/physique spécifique au jeu sera codée dans `core/` plutôt que via la physique de Phaser (à confirmer par ADR dès la première feature de simulation).
