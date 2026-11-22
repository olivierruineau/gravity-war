# Gravity War

Petit jeu indé rétro (esprit années 90), 100 % JavaScript dans le navigateur.
Spécification fonctionnelle : `docs/SPEC.md` · plan de travail par phases : `TODO.md` · architecture vivante : `docs/ARCHITECTURE.md`.
Rendu 100 % filaire (wireframe) sur fond noir, sans sprites : tout est dessiné en traits.

## Stack

| Rôle               | Choix                                   | Pourquoi                                               |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| Moteur 2D          | **Phaser 4**                            | Scènes, input, audio, tweens, caméra ; pixel-art natif |
| Build / dev server | **Vite**                                | HMR instantané, build statique déployable partout      |
| Sons               | **ZzFX**                                | SFX chiptune synthétisés (~1 Ko), aucun fichier audio  |
| Tests              | **Vitest**                              | Même config que Vite, rapide                           |
| Qualité            | **ESLint** (flat config) + **Prettier** | Règles automatiques, pas de débats de style            |

Langage : JavaScript ESM (pas de TypeScript). JSDoc pour les types des API publiques de `core/`.
Pas de nouvelle dépendance sans passer par l'agent `architect`.

## Commandes

```bash
npm run dev          # serveur de dev (http://localhost:5173)
npm test             # tests Vitest (une passe)
npm run lint         # ESLint
npm run format       # Prettier (écriture)
npm run check        # lint + format + tests + build — à passer avant de dire « terminé »
npm run build        # build de production dans dist/
```

## Structure

```
src/
  main.js        # point d'entrée : config Phaser
  config.js      # TOUTES les constantes (résolution, palette, noms de scènes, pas de temps)
  core/          # logique de jeu PURE : zéro Phaser, zéro DOM → testable
  scenes/        # scènes Phaser, minces (orchestration seulement)
  entities/      # objets de jeu Phaser (sprites, conteneurs) — affichage d'un état de core/
  systems/       # systèmes Phaser transverses (input, caméra, particules, UI…)
  audio/         # sfx.js (ZzFX)
public/assets/   # sprites/, audio/, fonts/ (servis tels quels)
tests/unit/      # miroir de src/core/
docs/            # ARCHITECTURE.md + adr/ (décisions)
.claude/agents/  # sous-agents (voir plus bas)
```

## Règles d'architecture

1. **Séparer simulation et rendu.** L'état du jeu et ses règles vivent dans `src/core/` (fonctions/classes pures). Phaser ne fait que lire cet état et l'afficher. Une règle de jeu dans une scène est un bug d'architecture.
2. **`src/core/` n'importe jamais Phaser ni le DOM** (ESLint l'impose). C'est ce qui rend la logique testable sans navigateur.
3. **Simulation à pas fixe** (`FIXED_DT` dans `config.js`) avec accumulateur : comportement identique quelle que soit la fréquence d'écran, simulation déterministe et testable.
4. **Pas de nombres magiques** : constantes dans `config.js` (ou en tête du module si strictement locales).
5. **Pas d'allocation dans la boucle `update`** : réutiliser les objets/vecteurs, pooling pour projectiles/particules/ennemis.
6. **Nettoyage** : retirer listeners, timers et tweens à la sortie d'une scène (`events.once('shutdown', …)`).
7. **Aléatoire seedable** pour tout ce qui influence la simulation (jamais `Math.random()` directement dans `core/`).
8. **Données séparées du code** : niveaux, stats, paramètres d'équilibrage en données (objets/JSON), pas en dur dans la logique.

## Esthétique rétro

- Résolution interne basse (`GAME_WIDTH × GAME_HEIGHT`, 480×270), mise à l'échelle par entiers quand possible ; `pixelArt: true`, `roundPixels: true`. Ne jamais lisser.
- Palette restreinte centralisée (`PALETTE`). Sprites en pixel-art, polices bitmap/monospace.
- Sons chiptune via ZzFX ; un son = une entrée de `SOUNDS` dans `src/audio/sfx.js`.
- L'audio exige un geste utilisateur : appeler `resumeAudio()` après la première interaction.

## Conventions de code

- Code, identifiants, commentaires techniques : **anglais**. Docs, TODO, messages de commit, échanges : **français**.
- Fichiers de classe en `PascalCase.js` (scènes, entités), modules en `camelCase.js`. Imports ESM avec extension `.js` explicite.
- Petites fonctions, un module = une responsabilité. Commenter le _pourquoi_, pas le _quoi_.
- Pas de code mort, pas de `console.log` committé, pas de TODO dans le code (ils vont dans `TODO.md`).
- Prettier et ESLint font foi ; ne pas débattre du style.

## Tests

- Vitest, dans `tests/unit/` (logique) et `tests/scenarios/` (simulations de bout en bout sur `core/`).
- On teste `src/core/` à fond ; scènes/entités Phaser : vérification manuelle (`npm run dev`), pas de mocks de Phaser.
- Tests déterministes : pas de `setTimeout`, RNG seedé, `FIXED_DT`.
- Un bug corrigé = un test de non-régression.

## Orchestration des agents

La session principale tourne en **Sonnet** : elle orchestre et code. Elle délègue aux sous-agents de `.claude/agents/` selon ce tableau :

| Agent                 | Modèle     | Quand l'utiliser                                                             |
| --------------------- | ---------- | ---------------------------------------------------------------------------- |
| `researcher`          | **Haiku**  | Recherche, lecture de docs, comparaison de libs, exploration (lecture seule) |
| `doc-writer`          | **Haiku**  | README, TODO.md, docs/, mise en forme d'ADR                                  |
| `test-writer-simple`  | **Haiku**  | Tests de fonctions pures, maths, utilitaires                                 |
| `test-writer-complex` | **Sonnet** | Simulations, physique multi-corps, machines à états, scénarios               |
| `coder`               | **Sonnet** | Implémentation d'un item du TODO / correction de bug                         |
| `architect`           | **Opus**   | Décisions de structure, nouvelle dépendance, nouveau système, ADR            |
| `reviewer`            | **Opus**   | Revue approfondie, _seulement quand nécessaire_ (voir ci-dessous)            |

Principes :

- **Pas de sur-délégation.** Un changement trivial (renommer, corriger une constante, une ligne) se fait directement ; un agent démarre à froid et coûte du contexte.
- **Prompts autonomes.** Un sous-agent ne voit pas la conversation : donner l'objectif, les fichiers concernés, les contraintes et le format de rapport attendu.
- **Parallélisme** pour les tâches indépendantes (ex. `researcher` + `test-writer-simple` en même temps) ; séquentiel quand l'une dépend de l'autre.
- **Flux type d'une feature** : `architect` (si structurant) → `coder` → `test-writer-*` → `npm run check` → `reviewer` (si critère ci-dessous) → `doc-writer` (mise à jour doc/TODO).
- **Opus (reviewer) seulement si** : feature structurante, toucher la simulation/physique/boucle de jeu, gros diff (> ~300 lignes), ou avant une release. Sinon, `npm run check` suffit.
- **Choix du testeur** : si le test se résume à des entrées/sorties claires → Haiku. Si la difficulté est de spécifier le comportement (temps, état, plusieurs entités, tolérances numériques) → Sonnet.
- Le résultat d'un agent est une information à vérifier, pas une vérité : relire les diffs importants et relancer `npm run check`.

## Workflow

1. Prendre un item de `TODO.md`, le passer « en cours ».
2. `npm run check` vert avant de cocher l'item.
3. Décision structurante → ADR dans `docs/adr/` (template `0000-template.md`).
4. Mettre à jour `docs/ARCHITECTURE.md` quand la structure change.
5. Commit (voir ci-dessous), puis item suivant.

### Git

- **Tout se passe sur `main`** (projet à deux, pas de branches ni de PR). Pas de `push --force`, pas de réécriture d'historique.
- **Claude gère les commits** : granularité standard = **une fonctionnalité (item du TODO) = un commit**. Le commit contient le code, ses tests, la doc/ADR associés et la case cochée dans `TODO.md`. Pas de commit « WIP » ni de mélange de deux features.
- Commit uniquement quand `npm run check` est vert.
- Message en français, format Conventional Commits : `feat: …`, `fix: …`, `refactor: …`, `test: …`, `docs: …`, `chore: …`. Titre ≤ 72 caractères, à l'impératif ; corps optionnel pour le « pourquoi ».
- Le `push` vers un éventuel dépôt distant n'est fait que sur demande.
