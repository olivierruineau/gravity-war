# TODO

Spécification : [docs/SPEC.md](docs/SPEC.md). Architecture : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

> Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait.
> **Un item = un commit** (code + tests + doc), `npm run check` vert avant de cocher.
> Agent suggéré entre parenthèses : `arch` = architect (Opus) · `code` = coder (Sonnet) · `test-s` = test-writer-simple (Haiku) · `test-c` = test-writer-complex (Sonnet) · `doc` = doc-writer (Haiku) · `rev` = reviewer (Opus).
> Chaque phase se termine par un état **jouable** (critère de fin) et, si indiqué, une revue Opus.

---

## Phase 0 — Socle ✅

- [x] Structure du projet, Vite + Phaser 4 + Vitest + ESLint/Prettier
- [x] CLAUDE.md, agents (`.claude/agents/`), git sur `main`
- [x] Scènes Boot → Menu → Game (squelette)
- [x] Spécification fonctionnelle (`docs/SPEC.md`)

---

## Phase 1 — Vaisseau et monde

**Fin de phase :** on pilote un triangle avec inertie dans une carte bornée, la caméra le suit, on perçoit la vitesse.

- [x] **1.1** ADR 0002 : architecture de `core/` — état du monde, modèle d'entités, intentions de pilotage (`{rotate, thrust, fire, missile}` partagées joueur/bots), pas fixe + accumulateur, pont `core` → rendu Phaser (arch)
- [x] **1.2** `core/vec2` (opérations sans allocation) + RNG seedé, avec tests (code, test-s)
- [x] **1.3** Boucle à pas fixe : accumulateur dans `GameScene`, `core/world` avec `step(dt)` vide, test de déterminisme (code, test-c)
- [x] **1.4** Physique du vaisseau : rotation, poussée dans l'axe du nez, inertie ; tests (pas de frein, 180° + poussée annule la vitesse) (code, test-c)
- [x] **1.5** Rendu filaire du vaisseau (triangle) + entrées clavier (`←` `→` `↑`) → intentions (code)
- [x] **1.6** Carte bornée : mur invisible avec rebond amorti ; tests des bornes (code, test-s)
- [x] **1.7** Caméra qui suit le vaisseau + fond d'étoiles/grille discret (repère de vitesse) (code)
- [x] **1.8** Overlay de debug (touche F3) : FPS, vitesse, position (code)

## Phase 2 — Planètes, gravité, atterrissage

**Fin de phase :** des planètes attirent le vaisseau ; on peut se poser, ou se crasher et perdre de la vie.
**Revue Opus** en fin de phase (physique).

- [x] **2.1** Modèle planète (rayon, masse, position) + attraction gravitationnelle dans `core/` ; ADR 0003 sur la formule (adoucissement près de la surface, intégrateur) ; tests d'invariants (orbite stable, chute vers la planète) (arch, code, test-c)
- [x] **2.2** Carte fixe v0 en données (`src/data/maps/`) + rendu filaire des planètes (cercles, contour blanc = neutre) (code)
- [x] **2.3** Collision vaisseau/planète : critères d'atterrissage (vitesse radiale, angle du nez) vs impact ; tests aux limites des seuils (code, test-c)
- [x] **2.4** Vie du vaisseau + dégâts d'impact proportionnels + barre de vie minimale à l'écran (code, test-s)
- [x] **2.5** État « posé » : le vaisseau reste sur la surface, décollage possible (code, test-c)
- [x] **2.6** Aide à l'atterrissage : indicateur vitesse radiale/angle vert/rouge près des planètes (code)
- [x] **2.7** Revue de la physique et du code de la phase (rev)
- [x] **2.8** Zone de gravité dominante lissée (ADR 0004) + flèche de gravité sur le vaisseau, suite au retour de playtest (arch, code, test-s, test-c)

## Phase 3 — Tir et mort

**Fin de phase :** on tire, on peut détruire une cible d'entraînement, on meurt et on respawn.

- [x] **3.0** Refactor préparatoire (issu de la revue 2.7) : `damageShip(world, i, amount, x, y)` (bouclier → PV → mort : `alive`, `landedOn = -1`, `EXPLOSION` en un seul endroit, appelé par `landing.js`) ; `respawnShip(ship, planet…)` (remet vel/PV/intent, pose le vaisseau sur la planète de respawn sans `LANDED`) ; `step` doit pouvoir décompter un `respawnTimer` pour un vaisseau mort ; filtre `owner` optionnel pour `nearestPlanet` ; tests (arch si l'API est discutée, code, test-c)
- [x] **3.1** Projectiles : pool, tir principal (`Espace`), cadence, durée de vie, collision avec planètes ; tests (code, test-c)
- [x] **3.2** Dégâts projectiles → vaisseau ; cible d'entraînement statique/dérivante pour tester (code, test-s)
- [x] **3.3** Mort + respawn à la planète de départ après délai (~3 s) (code, test-c) — réalisé avec 3.0 (respawn sur la planète possédée la plus proche, bases dotées d'un propriétaire dans la carte)
- [ ] **3.4** Effets filaires : explosion (particules/lignes), flash d'impact (code)
- [ ] **3.5** Sons ZzFX : poussée, tir, explosion, impact, atterrissage (code)

## Phase 4 — Factions, capture, bâtiments

**Fin de phase :** on capture des planètes neutres, elles se développent seules ; la planète change de couleur.

- [ ] **4.1** Modèle de faction + propriétaire de planète ; départ : une planète de base par faction ; couleurs (blanc/vert/autres) (code, test-s)
- [ ] **4.2** Capture d'une planète neutre : 3 s posé, compteur remis à zéro si décollage/éjection, anneau de progression ; tests (code, test-c)
- [ ] **4.3** Bâtiments en données (catalogue, ordre de développement, durées) + développement automatique dans le temps ; tests (code, test-c)
- [ ] **4.4** Rendu des bâtiments (carrés/rectangles dans le cercle) (code)
- [ ] **4.5** Tourelles de défense : détection, tir auto sur ennemis, PV, destruction ; pas de tir ami ; tests (code, test-c)
- [ ] **4.6** Capture d'une planète ennemie : défenses détruites puis 3 s posé ; bâtiments réinitialisés ; tests (code, test-c)
- [ ] **4.7** Missiles : stock limité, touche `Ctrl`, autoguidage léger, dégâts ; déblocage via bâtiment ; tests (code, test-c)
- [ ] **4.8** Réarmement en missiles posé sur planète possédée avec usine ; stock minimum au respawn (code, test-c)
- [ ] **4.9** Bouclier passif : déblocage par bâtiment, absorbe avant la vie, recharge en vol hors combat ; tests (code, test-c)
- [ ] **4.10** Respawn à la planète possédée la plus proche ; règles d'élimination (plus de planète + vaisseau détruit) ; tests (code, test-c)
- [ ] **4.11** Revue de la phase : règles de capture/combat (rev)

## Phase 5 — IA des bots

**Fin de phase :** 2 bots pilotent, capturent, défendent et attaquent avec les mêmes règles que le joueur.
**Revue Opus** en fin de phase.

- [ ] **5.1** ADR 0004 : architecture de l'IA (machine à états / utilité), les bots produisent les mêmes intentions que le joueur, perception limitée au monde de `core/` (arch)
- [ ] **5.2** Navigation sensible à la gravité : s'orienter, rejoindre une cible, freiner par 180° + poussée ; tests de scénarios (code, test-c)
- [ ] **5.3** Contrôleur d'atterrissage : approche, alignement, vitesse radiale sous le seuil ; tests (code, test-c)
- [ ] **5.4** Comportement « capturer une planète neutre » (choix de cible, trajet, capture) (code, test-c)
- [ ] **5.5** Comportement combat : viser et tirer, esquiver, missiles ; attaquer les planètes ennemies (tourelles puis capture) (code, test-c)
- [ ] **5.6** Comportement défense/repli : réagir aux attaques sur ses planètes, repli si vie basse (code, test-c)
- [ ] **5.7** Déploiement de 2 bots (2 couleurs) sur la carte ; réglage de l'agressivité (code)
- [ ] **5.8** Revue de l'IA et de la performance (rev)

## Phase 6 — Interface et boucle de partie

**Fin de phase :** partie complète du menu à l'écran de fin, victoire ou défaite.

- [ ] **6.1** HUD : vie, bouclier, stock de missiles, vitesse (code)
- [ ] **6.2** Minimap filaire (planètes colorées, vaisseaux) (code)
- [ ] **6.3** Indicateurs de cibles hors écran (flèches aux bords) (code)
- [ ] **6.4** Conditions de victoire/défaite + écran de fin + rejouer (code, test-c)
- [ ] **6.5** Menu principal (jouer, aide commandes) + pause (code)

## Phase 7 — Carte finale, équilibrage, finition

**Fin de phase :** version v1 jouable, équilibrée, publiable.
**Revue Opus** globale avant livraison.

- [ ] **7.1** Conception de la carte finale (placement, tailles, gravité, planètes de départ équitables) (code)
- [ ] **7.2** Équilibrage : seuils d'atterrissage, dégâts, cadences, durées de développement, agressivité des bots (code)
- [ ] **7.3** Polish visuel filaire : épaisseurs, lueur légère, cohérence de la palette (code)
- [ ] **7.4** Passage de performance : allocations dans `update`, pooling, nettoyage des listeners (code)
- [ ] **7.5** Revue globale avant release (rev)
- [ ] **7.6** Documentation finale (README, ARCHITECTURE à jour, how-to-play) + build de production (doc)

---

## Backlog (hors v1)

Carte procédurale seedée · campagne de niveaux · nombre de bots et difficulté réglables au menu · planètes en orbite · carte torique · monnaie et menu de construction · manette/mobile · musique.
