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
- [x] **3.4** Effets filaires : explosion (particules/lignes), flash d'impact (code)
- [x] **3.5** Sons ZzFX : poussée, tir, explosion, impact, atterrissage (code)

## Phase 4 — Factions, capture, bâtiments

**Fin de phase :** on capture des planètes neutres, elles se développent seules ; la planète change de couleur.

- [x] **4.1** Modèle de faction + propriétaire de planète ; départ : une planète de base par faction ; couleurs (blanc/vert/autres) (code, test-s)
- [x] **4.2** Capture d'une planète neutre : 3 s posé, compteur remis à zéro si décollage/éjection, anneau de progression ; tests (code, test-c)
- [x] **4.3** Bâtiments en données (catalogue, ordre de développement, durées) + développement automatique dans le temps ; tests (code, test-c)
- [x] **4.4** Rendu des bâtiments (carrés/rectangles dans le cercle) (code)
- [x] **4.5** Tourelles de défense : détection, tir auto sur ennemis, PV, destruction ; pas de tir ami ; tests (code, test-c)
- [x] **4.6** Capture d'une planète ennemie : défenses détruites puis 3 s posé ; bâtiments réinitialisés ; tests (code, test-c)
- [x] **4.7** Missiles : stock limité, touche `Ctrl`, autoguidage léger, dégâts ; déblocage via bâtiment ; tests (code, test-c)
- [x] **4.8** Réarmement en missiles posé sur planète possédée avec usine ; stock minimum au respawn (code, test-c)
- [x] **4.9** Bouclier passif : déblocage par bâtiment, absorbe avant la vie, recharge en vol hors combat ; tests (code, test-c)
- [x] **4.10** Respawn à la planète possédée la plus proche ; règles d'élimination (plus de planète + vaisseau détruit) ; tests (code, test-c)
- [x] **4.11** Revue de la phase : règles de capture/combat (rev)

### Ajustements demandés après playtest (phases 3-4)

- [x] **4.12** Équilibrage PV / bouclier / dégâts : les vaisseaux ont trop de PV par rapport au bouclier, il faut trop de tirs directs pour les tuer (9 balles aujourd'hui). Revoir `SHIP_MAX_HP`, `BULLET_DAMAGE`, `SHIELD_MAX`, dégâts de missile et de tourelle de façon cohérente (ex. ~4-5 balles pour tuer sans bouclier, le bouclier compte réellement) ; mettre à jour les tests qui figent les valeurs (tests de seuils, « 9 balles ») ; à refaire/valider en 7.2 (code, test-c)
- [x] **4.13** Dégâts aux planètes habitées : tirer sur une planète possédée réduit d'abord ses défenses (tourelles, déjà fait) PUIS ses bâtiments (PV par bâtiment, un bâtiment détruit retombe en « à reconstruire » et fait perdre sa capacité : usine, générateur) ; décider dans un ADR (0007 ou amendement 0005) : PV des bâtiments, ordre des dégâts, effet sur la reconstruction et la capture, feedback visuel (arch, code, test-c) ; à prendre en compte dans l'IA (5.x)

## Phase 5 — IA des bots

**Fin de phase :** 2 bots pilotent, capturent, défendent et attaquent avec les mêmes règles que le joueur.
**Revue Opus** en fin de phase.

- [x] **5.1** ADR 0006 : architecture de l'IA (machine à états / utilité), les bots produisent les mêmes intentions que le joueur, perception limitée au monde de `core/` (arch)
      Points issus de la revue 4.11 à trancher dans l'ADR : intentions calculées DANS `step` (étape 1) à chaque pas, pas par frame ; flux RNG séparé (`world.aiRng`) pour ne pas décaler les tourelles ; requêtes pures à exposer (`findMissileTarget`, ciblage des tourelles, `nearestPlanet` avec filtres « non possédée par f » / « sans défense », prédiction balistique sans allocation avec `gravityAt` — balles soumises à la gravité, missiles non) ; l'IA lit l'ÉTAT, pas les événements (file perdue si pleine) ; état « planète attaquée » à ajouter (ex. `planet.lastHitTick`) ; ajouter `{ planet: 2 }` aux spawns d'`arena` (5.7).
- [x] **5.2** Navigation sensible à la gravité : s'orienter, rejoindre une cible, freiner par 180° + poussée ; tests de scénarios (code, test-c)
- [x] **5.3** Contrôleur d'atterrissage : approche, alignement, vitesse radiale sous le seuil ; tests (code, test-c)
- [x] **5.4** Comportement « capturer une planète neutre » (choix de cible, trajet, capture) (code, test-c)
- [x] **5.5** Comportement combat : viser et tirer, esquiver, missiles ; attaquer les planètes ennemies (tourelles puis capture) (code, test-c)
- [x] **5.6** Comportement défense/repli : réagir aux attaques sur ses planètes, repli si vie basse (code, test-c)
- [x] **5.7** Déploiement de 2 bots (2 couleurs) sur la carte ; réglage de l'agressivité (code)
- [x] **5.8** Revue de l'IA et de la performance (rev)
      À vérifier en revue : findDetour ignore la vitesse et les tourelles hors cible (seed 14 : 6 PV perdus après décollage) ; esquive des balles peu efficace (14 morts sur 20 face à un tireur parfait) ; écarts 5.5 à consigner dans l'ADR (assaultMinHealth 30, esquive ajoutée) ; ping-pong de captures sur planètes sans tourelle ; constantes slotValue/enemyCaptureFactor/occupiedFactor à lister dans l'ADR 0006.

## Phase 6 — Interface et boucle de partie

**Fin de phase :** partie complète du menu à l'écran de fin, victoire ou défaite.

- [x] **6.1** HUD : vie, bouclier, stock de missiles, vitesse (code)
- [x] **6.2** Minimap filaire (planètes colorées, vaisseaux) (code)
- [x] **6.3** Indicateurs de cibles hors écran (flèches aux bords) (code)
- [x] **6.4** Conditions de victoire/défaite + écran de fin + rejouer (code, test-c)
- [x] **6.5** Menu principal (jouer, aide commandes) + pause (code)

## Phase 7 — Carte finale, équilibrage, finition

**Fin de phase :** version v1 jouable, équilibrée, publiable.
**Revue Opus** globale avant livraison.

- [x] **7.1** Conception de la carte finale (placement, tailles, gravité, planètes de départ équitables) (code)
- [x] **7.2** Équilibrage : seuils d'atterrissage, dégâts, cadences, durées de développement, agressivité des bots (code)
- [x] **7.3** Polish visuel filaire : épaisseurs, lueur légère, cohérence de la palette (code)
- [x] **7.4** Passage de performance : allocations dans `update`, pooling, nettoyage des listeners (code)
- [x] **7.5** Revue globale avant release (rev)
- [x] **7.6** Documentation finale (README, ARCHITECTURE à jour, how-to-play) + build de production (doc)

---

## Phase 8 — Mobile (tactile)

**Fin de phase :** le jeu se joue au doigt sur téléphone en paysage, du menu à l'écran de fin, sans clavier ; il est installable et tient 30 images par seconde au minimum sur un appareil milieu de gamme.
**Revue Opus** en fin de phase (entrée, performance).

**Décisions (utilisateur) :** orientation **paysage uniquement** (en portrait : invite à tourner l'appareil, aucune mise en page portrait). Le jeu reste jouable **à la fois au PC (clavier) et sur mobile (tactile)**, avec la même version : aucune régression au clavier, les deux sources actives en même temps (portable à écran tactile, tablette avec clavier). Les textes et l'affichage des commandes suivent la dernière source utilisée (touches ou doigt).

État de départ (v1) : une seule porte d'entrée, `systems/keyboardInput.js`, qui écrit `ships[0].intent` ; des touches en dur dans le menu (`Espace`, `H`), la pause (`P`, `Echap`), l'écran de fin (`Espace`, `Echap`) et la sourdine (`M`) ; la page a un `viewport` mais aucun réglage tactile (pas de `touch-action`, pas de plein écran, pas de gestion d'orientation) ; l'audio est débloqué sur `Espace` ; le HUD occupe les deux coins du bas, là où se poseront les pouces.

- [x] **8.1** ADR 0008 : entrée multi-sources (clavier, tactile, plus tard manette). Actions logiques de jeu (`rotate`, `thrust`, `fire`, `missile`) et de navigation (`confirm`, `back`, `pause`, `mute`, `help`), plusieurs sources actives en même temps, détection d'un appareil tactile ; bascule dynamique selon la dernière source utilisée (un portable à écran tactile ne doit jamais perdre son clavier ni voir les boutons tactiles le gêner). Disposition des commandes tactiles (rotation et poussée sous le pouce gauche, tir et missile sous le droit : boutons ou joystick, `intent.rotate` reste discret), multi-touch (au moins 3 doigts), cibles d'au moins 44 px CSS, zones de sécurité. Trancher l'aide à la maniabilité tactile (voir 8.7) et les limites de iOS (pas de plein écran sur iPhone hors installation) (arch)
- [x] **8.2** Page et plateforme : `viewport-fit=cover` et zoom désactivé, `touch-action: none`, pas de sélection de texte, de menu contextuel ni de tirer-pour-rafraîchir, marges de zone sûre (encoche), `theme-color` ; bouton plein écran ; invite « tournez l'appareil » en portrait, sans mise en page portrait (paysage seul) ; pause automatique quand la page passe en arrière-plan (`visibilitychange`) (code)
- [x] **8.3** Refactor de l'entrée : extraire les actions de navigation (menu, pause, fin de partie, sourdine, aide) des touches en dur vers une table de correspondance par source ; `keyboardInput.js` devient une source parmi d'autres. Comportement inchangé au clavier (non-régression PC : les tests existants passent tels quels) ; tests de la table (code, test-s)
- [x] **8.4** Commandes tactiles en jeu : overlay Phaser (rotation gauche/droite, poussée, tir, missile) en multi-touch, retour visuel à l'appui, affiché seulement quand le tactile est utilisé (masqué dès qu'une touche est pressée, réaffiché au toucher), écrit `intent` comme le clavier ; modèle pur testable (zones, appui → intention, doigts relâchés ou perdus, `pointercancel`) (code, test-c)
- [x] **8.5** Menus et écrans au doigt : bouton JOUER, aide des commandes qui suit la dernière source utilisée (touches au clavier, gestes au doigt : plus de « ESPACE » ni de « H » en tactile, et inversement), boutons visibles pause, son et menu, écran de fin avec rejouer et menu au toucher (code)
- [ ] **8.6** HUD et lisibilité sur petit écran : déplacer vie, missiles, bouclier et vitesse hors de portée des pouces, taille minimale des textes (aujourd'hui 8 px sur 480×270), contraste, minimap et flèches hors écran toujours lisibles ; vérifier sur plusieurs formats (360×640 en paysage, 19,5:9, tablette) (code)
- [ ] **8.7** Maniabilité tactile : selon l'ADR 8.1, assistances optionnelles (par exemple stabilisation de la rotation, aide à l'atterrissage plus indulgente), réglables, sans toucher aux règles du `core` partagées avec les bots (arch, code, test-c)
- [ ] **8.8** Audio mobile : débloquer l'`AudioContext` au premier toucher (aujourd'hui sur `Espace`), le reprendre au retour au premier plan, le suspendre en arrière-plan ; conserver la sourdine entre deux parties (code)
- [ ] **8.9** Performance mobile : mesurer avec CPU ralenti ×4 (Playwright / CDP) puis sur un vrai appareil ; budget 30 images par seconde au minimum ; réglages de qualité (lueur coupée, rendu allégé) choisis automatiquement ou au menu ; vérifier la facture de `devicePixelRatio` et du redimensionnement (code)
- [ ] **8.10** PWA : manifeste, icônes, cache hors ligne par service worker, installable plein écran, mise à jour propre. Une nouvelle dépendance (par exemple un plugin Vite) passe d'abord par `architect` (arch, code)
- [ ] **8.11** Tests d'appareils : émulation Playwright (téléphone Android et iPhone en paysage, tactile multi-touch), scénario de bout en bout menu → jeu → pause → fin, au toucher **et** au clavier (non-régression PC), puis les deux mélangés ; checklist manuelle iOS Safari et Android Chrome dans `docs/` (test-c, doc)
- [ ] **8.12** Revue mobile et documentation : README et `docs/HOW-TO-PLAY.md` (commandes tactiles, installation), `docs/ARCHITECTURE.md` (couche d'entrée), déploiement (rev, doc)

---

## Backlog (hors v1)

Carte procédurale seedée · campagne de niveaux · nombre de bots et difficulté réglables au menu · planètes en orbite · carte torique · monnaie et menu de construction · manette (réutilisera l'entrée multi-sources de la phase 8) · musique.
