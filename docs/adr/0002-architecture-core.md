# 0002 — Architecture de `src/core/`

- **Statut** : accepté
- **Date** : 2026-11-23

## Contexte

Toute la simulation (vaisseau joueur + 2 bots, planètes fixes à gravité, projectiles/missiles, tourelles, factions, bâtiments, capture) doit vivre dans `src/core/` : pure, déterministe, testable sans navigateur (CLAUDE.md, ADR 0001). Contraintes : pas fixe `FIXED_DT = 1/60`, aucune allocation dans la boucle, aléatoire seedé, bots soumis aux mêmes règles que le joueur. L'échelle est petite (3 vaisseaux, une vingtaine de planètes, quelques centaines de projectiles au pire) : la simplicité prime sur la performance théorique.

## Décision

**Le monde est un objet de données pur (JSON-sérialisable) manipulé par des modules de fonctions ; les entités sont des objets simples dans des tableaux de taille fixe, référencées par index ; `world.step(dt)` est l'unique point d'avancement, alimenté par des intentions de pilotage et vidé de ses événements par la couche Phaser.**

### 1. État du monde et entités

- **Objets simples + fonctions, pas de classes** dans `core/`. Un module par type expose `createX(...)` (appelé au chargement uniquement) et des fonctions `updateX(world, x, dt)`.
- `world` est **JSON pur** : pas de fonctions, pas de `Map`/`Set`, pas de références croisées entre objets. Cela rend snapshot, comparaison et debug triviaux.
- **Identifiant = index dans le tableau du type.** Les références croisées sont des index entiers : `ship.faction`, `planet.owner` (`NEUTRAL = -1`), `ship.landedOn` (`-1` si en vol), `missile.target`. Pas de compteur d'id global.
- **Tableaux fixes, jamais de retrait** :
  - `ships[i]` ↔ faction `i` (`0` = joueur, `1` et `2` = bots). La mort est un état (`alive: false`, `respawnTimer`), l'objet est réutilisé au respawn.
  - `planets[]` créé depuis la carte au chargement ; les bâtiments sont des **slots préalloués** par planète (réinitialisés à la capture, jamais réalloués). Les tourelles sont des bâtiments (PV, cooldown) et tirent dans le pool commun.
  - `projectiles[]` : **pool préalloué** de `PROJECTILE_CAPACITY` objets avec `active: boolean` et `kind` (`'bullet'` | `'missile'`). Spawn = premier slot inactif ; pool plein = tir ignoré (pas de croissance). L'update parcourt tous les slots en sautant les inactifs.
- Pas de module de pool générique tant qu'il n'y a qu'un seul pool (le pool de projectiles gère le sien).

Forme indicative (les champs s'ajoutent phase par phase) :

```
world = { tick, width, height, rng: { state }, ships: [], planets: [], projectiles: [], events: { count, dropped, items: [] } }
ship  = { faction, alive, pos: { x, y }, vel: { x, y }, angle, hp, intent: { rotate, thrust, fire, missile }, ... }
```

Convention d'angle : radians, `0` = nez vers `+x`, sens positif horaire à l'écran (y vers le bas, comme Phaser).

### 2. Intentions de pilotage

- Forme exacte, un objet **préalloué par vaisseau** (`ship.intent`), réécrit en place :
  `{ rotate: -1 | 0 | 1, thrust: boolean, fire: boolean, missile: boolean }`.
- Valeurs **discrètes** pour tous : un bot n'a pas de contrôle plus fin que le clavier (parité des règles).
- `fire` / `missile` sont des **états maintenus** ; cadence et stock sont gérés par le core (cooldowns), jamais par l'input.
- **Producteurs** : `systems/keyboardInput.js` (Phaser) écrit `ships[0].intent` une fois par frame d'affichage, avant les pas de simulation ; l'IA (`core/ai/`, ADR 0004) écrit `ships[1..2].intent` **dans** `step`, en début de pas. `ship.intent` est la **seule** donnée du monde que la couche Phaser a le droit d'écrire.
- **Consommateur unique** : `core/ship.js` au moment du pas.

### 3. Boucle à pas fixe

- Accumulateur dans un module pur `core/clock.js` : `clock = { acc }` et `consumeSteps(clock, frameSeconds)` qui retourne le **nombre de pas** à exécuter (pas de callback). `GameScene.update` fait : input → `n = consumeSteps(...)` → `n × step(world, FIXED_DT)` → rendu → drainage des événements.
- Garde-fous : delta de frame plafonné à `MAX_FRAME_DT = 0.25` s (onglet en arrière-plan) et au plus `MAX_STEPS_PER_FRAME = 5` pas ; au-delà, l'arriéré est **jeté** (`acc = 0`) : le jeu ralentit au lieu de spiraler.
- **Pas d'interpolation de rendu en v1** : à 480×270 avec `roundPixels`, le gain est invisible sur un écran 60 Hz. Si une saccade est constatée sur écran 120/144 Hz lors de l'item 1.7, on ajoutera `prevPos`/`prevAngle` côté core et un `alpha` retourné par `consumeSteps` (changement local, prévu).
- `step(world, dt)` reçoit toujours `FIXED_DT` en jeu ; le paramètre existe pour les tests de convergence (ADR 0003).

### 4. Pont core → rendu

- **Lecture directe** de `world` par la couche Phaser, en lecture seule par convention (pas de copie, pas de `Object.freeze`).
- **Rendu en mode immédiat** : le jeu est filaire, donc chaque frame on `clear()` quelques `Graphics` (monde, HUD) et on redessine tout depuis l'état. `entities/` contient des fonctions de dessin par type (`drawShip(g, ship, color)`…), pas d'objets Phaser synchronisés 1-pour-1 : aucun cycle de vie à gérer à la création/destruction d'entités.
- **Événements** : `core/events.js` fournit une file à **capacité fixe** (`EVENT_CAPACITY`) d'objets préalloués `{ type, x, y, a, b }` (`a`/`b` = index d'entités ou valeur). Le core y pousse (`EVT.SHOT`, `EVT.EXPLOSION`, `EVT.IMPACT`, `EVT.LANDED`, `EVT.CAPTURED`…) ; file pleine = événement perdu et `events.dropped++` (jamais d'exception).
- La file s'accumule sur tous les pas d'une frame ; **c'est le consommateur qui la vide** (`clearEvents(world)`) après l'avoir lue : la scène une fois par frame (effets, sons via `audio/`), les tests quand ils le souhaitent.
- Les sons continus (poussée) se déduisent de l'état (`intent.thrust`), pas d'un événement. Le core ne connaît ni les sons ni les couleurs.

### 5. Fichiers de `src/core/` et dépendances

```
core/
  math.js       clamp, lerp, wrapAngle            (feuille)
  vec2.js       opérations sans allocation         (feuille)
  rng.js        mulberry32                         (feuille)
  clock.js      accumulateur à pas fixe            (feuille)
  events.js     file d'événements + EVT
  intent.js     createIntent, resetIntent
  world.js      createWorld(map, seed), step(world, dt) : seul orchestrateur
  ship.js       rotation, poussée, tir                       (phase 1/3)
  bounds.js     mur de carte, rebond amorti                  (phase 1)
  planet.js, gravity.js, collision.js                        (phase 2, ADR 0003)
  projectile.js pool + update                                (phase 3)
  faction.js, building.js, capture.js, turret.js, shield.js  (phase 4)
  ai/                                                        (phase 5, ADR 0004)
```

Règles :

- Les **feuilles** n'importent rien du projet (sauf `math.js`).
- Les modules d'entité (`ship`, `planet`, `projectile`, `building`…) **ne s'importent pas entre eux**. Toute interaction entre deux types (gravité, collisions, capture, ciblage) vit dans un module de système dédié qui les reçoit en paramètres.
- **`world.js` est le seul à tout importer** et fixe l'ordre d'un pas : (1) IA → intentions des bots, (2) application des intentions (rotation, poussée, tirs), (3) forces + intégration, (4) bornes de carte, (5) collisions, (6) règles (capture, bâtiments, tourelles, bouclier, respawn, élimination), (7) `tick++`.
- `core/` peut importer `config.js` et `src/data/` (données pures). La **carte est injectée** dans `createWorld(map, seed)` pour que les tests utilisent des mini-cartes.
- `core/` n'importe jamais `scenes/`, `entities/`, `systems/`, `audio/`, Phaser ni le DOM (ESLint).

### 6. Vec2 et RNG

- **Vec2** : objets `{ x, y }` créés une fois (dans les entités ou en scratch), API style gl-matrix **à paramètre de sortie** : `add(out, a, b)`, `scale(out, a, s)`, `fromAngle(out, angle, length)`… qui retournent `out` (alias `out === a` autorisé) ; scalaires purs `dot`, `len`, `len2`, `dist2`. Pas de classe, pas de chaînage. Les vecteurs scratch sont des `const` **locaux au module**, jamais exportés ni conservés d'un appel à l'autre.
- **RNG** : **mulberry32** (10 lignes, 32 bits, qualité suffisante pour un jeu, état = un entier donc sérialisable). API : `createRng(seed)` → `{ state }`, `nextFloat(rng)` ∈ [0, 1), `range(rng, min, max)`, `int(rng, min, maxExcl)`. Un seul flux `world.rng` pour la simulation.
- **`Math.random` interdit dans `core/`** (règle ESLint `no-restricted-properties` à ajouter). Le cosmétique pur côté Phaser (étoiles de fond, particules d'explosion) peut utiliser `Math.random` puisqu'il n'influence pas la simulation.

### 7. Intégrateur

**Euler semi-implicite** (`vel += acc·dt` puis `pos += vel·dt`) : symplectique donc orbites stables, trivial, et compatible avec les impulsions (rebonds, atterrissage) ; la formule de gravité et son adoucissement restent à l'ADR 0003.

### 8. Tests de simulation

- `tests/unit/` miroir de `core/` (fonctions pures : vec2, rng, clock, events, ship…).
- `tests/scenarios/` : mini-carte en ligne + **script d'intentions par tick**, N pas de `FIXED_DT`, puis **assertions d'invariants** (`toBeCloseTo`) : pas de frein, 180° + poussée annule la vitesse, le vaisseau reste dans la carte, etc.
- **Déterminisme** : deux mondes même seed + même script → `JSON.stringify(worldA) === JSON.stringify(worldB)` après N pas. C'est possible précisément parce que `world` est du JSON pur.
- **Pas de snapshots Vitest de l'état complet** : ils casseraient à chaque réglage d'équilibrage sans rien prouver. Snapshots ciblés autorisés seulement pour de petites structures stables (ex. séquence RNG d'un seed).

## Alternatives écartées

- **Classes `Ship`/`Planet` avec méthodes** : tentation de l'héritage et de références croisées, sérialisation et comparaison d'état plus pénibles ; aucun gain à cette échelle.
- **ECS (maison ou bitecs)** : framework pour un jeu à 3 vaisseaux ; dépendance ou abstraction avant le besoin.
- **Physique Phaser (Arcade/Matter)** : gravité multi-corps et atterrissage spécifiques, et simulation hors `core/` donc non testable.
- **Références directes entre objets** : cycles, JSON impossible, risque de référence pendante vers un slot de pool recyclé.
- **Événements via `EventEmitter` / callbacks synchrones** : le rendu s'exécuterait au milieu d'un pas ; la file drainée garde le core aveugle au rendu.
- **Un `GameObject` Phaser par entité** : synchronisation création/destruction à maintenir, inutile pour du filaire redessiné chaque frame.
- **Interpolation de rendu dès maintenant** : coût (état précédent partout) sans bénéfice visible démontré.
- **Verlet** : vitesse implicite, peu pratique pour la vitesse radiale d'atterrissage et les impulsions.

## Conséquences

- Un seul point d'entrée (`createWorld` / `step`), facile à tester et à rejouer ; les bots (phase 5) se branchent en écrivant des intentions, sans chemin de code parallèle.
- Les capacités (`PROJECTILE_CAPACITY`, `EVENT_CAPACITY`) doivent être dimensionnées dans `config.js` ; un dépassement est silencieux (compteur `dropped` à surveiller dans l'overlay de debug).
- Le rendu immédiat redessine tout à chaque frame : à surveiller en 7.4, mais quelques centaines de traits restent négligeables.
- Discipline requise : ne jamais écrire dans `world` depuis Phaser hors `ships[0].intent`, ni garder de référence à un slot de pool d'une frame à l'autre. À contrôler en revue.
- Déterminisme garanti sur une même machine/moteur JS (suffisant : pas de réseau) ; `Math.sin/cos` peuvent différer entre navigateurs.

## Plan d'implémentation (items 1.2 à 1.8)

1. **1.2** — coder **Sonnet** (tests **Haiku**) : `core/vec2.js` (API §6), `core/rng.js` (mulberry32), `wrapAngle` dans `math.js` ; règle ESLint interdisant `Math.random` dans `src/core/`. Tests : aliasing `out === a`, séquence reproductible d'un seed, bornes de `range`/`int`.
2. **1.3** — coder **Sonnet** (tests **Sonnet**) : `core/clock.js` (`consumeSteps`, plafonds), `core/events.js`, `core/intent.js`, `core/world.js` (`createWorld(map, seed)`, `step` vide sauf `tick++`), constantes `MAX_FRAME_DT`, `MAX_STEPS_PER_FRAME`, `EVENT_CAPACITY` dans `config.js` ; branchement dans `GameScene.update`. Tests : `consumeSteps` (cas limites, jet de l'arriéré), file d'événements (débordement, `clearEvents`), déterminisme par `JSON.stringify`.
3. **1.4** — coder **Sonnet** (tests **Sonnet**) : `core/ship.js` (rotation à vitesse angulaire constante, poussée dans l'axe du nez, Euler semi-implicite) appelé par `world.step` ; constantes du vaisseau dans `config.js`. Scénarios : inertie sans poussée, pas de frein, 180° + poussée ramène la vitesse à ~0.
4. **1.5** — coder **Sonnet** : `systems/keyboardInput.js` (← → ↑ vers `ships[0].intent`, `Espace`/`Ctrl` câblés mais sans effet avant phase 3), `entities/shipView.js` (`drawShip` triangle filaire), rendu immédiat dans `GameScene`.
5. **1.6** — coder **Sonnet** (tests **Haiku**) : `core/bounds.js`, dimensions de carte dans `world` (défaut `config.js`, puis carte en 2.2), rebond amorti par coefficient de restitution. Tests : position ramenée dans la carte, composante normale inversée et amortie, composante tangentielle conservée.
6. **1.7** — coder **Sonnet** : caméra positionnée chaque frame sur `ships[0].pos` (scroll direct, bornée à la carte), fond d'étoiles/grille côté Phaser (cosmétique, `Math.random` permis). Vérifier sur écran > 60 Hz ; si saccade, ouvrir un item « interpolation » (§3).
7. **1.8** — coder **Haiku** (tâche simple, aucune règle) : overlay F3 (FPS, vitesse, position, `tick`, `events.dropped`), nettoyage du listener à `shutdown`.

Revue Opus non requise avant la fin de la phase 2, sauf si le diff de 1.3 + 1.4 dépasse ~300 lignes.
