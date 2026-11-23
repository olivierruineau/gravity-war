# 0005 — Factions, capture, bâtiments, tourelles, missiles, bouclier

- **Statut** : accepté
- **Date** : 2026-11-23
- **Précise** : ADR 0002 (§1 formes, §4 événements, §5 ordre du pas et fichiers). Écarts listés en fin de document.

## Contexte

La phase 4 (TODO 4.1 à 4.10) ajoute toute la couche « stratégie » : factions, capture, développement automatique, tourelles, missiles, bouclier, élimination. Ces systèmes se lisent les uns les autres (la capture dépend des tourelles, les missiles et le bouclier dépendent des bâtiments, l'élimination dépend de la capture). Sans modèle commun fixé d'avance, chaque item referait les formes de l'item précédent. Contraintes : `world` en JSON pur, tableaux fixes et index, aucune allocation dans `step`, RNG seedé, mêmes règles pour les bots. Les ~30 fichiers de tests des phases 2 et 3 doivent passer **sans modification** : beaucoup de mini-cartes posent un vaisseau de la faction 0 sur une planète neutre pendant 10 à 30 s, ou le laissent mort sans planète, en exigeant « aucun événement ».

## Décision

**Une faction = un index (0 joueur, 1-2 bots). Son état (`world.factions[f]`) est un résumé recalculé entièrement à chaque pas depuis les planètes, sauf `eliminated`, qui est définitif. Chaque planète porte son compteur de capture et des slots de bâtiments préalloués, un par entrée du catalogue `src/data/buildings.js`. L'ordre du catalogue est l'ordre de développement. Les tourelles sont des slots avec PV : elles tirent dans le pool commun et leur zone de tir est le disque de la planète. Missiles et bouclier sont des champs du vaisseau, verrouillés par les capacités de sa faction.**

### 1. Factions (`core/faction.js`)

- `world.factions` : `FACTION_COUNT` (3) entrées `{ planetCount, hasMissiles, hasShield, eliminated }`. Le vaisseau de la faction `f` est `ships[f]` (s'il existe ; dans `arena`, la faction 2 n'a pas encore de vaisseau).
- **Résumé recalculé, pas maintenu.** `updateFactions(world)` remet `planetCount`, `hasMissiles` et `hasShield` à zéro, puis les recalcule en une passe sur planètes × slots (moins de 100 tests). Personne d'autre n'écrit ces champs, donc aucun risque d'invalidation oubliée. Lecteurs : armes, bouclier, HUD, IA. Une capacité est vraie dès qu'**une** planète de la faction a le slot correspondant construit (`grants` dans le catalogue). Elle redevient fausse si la faction perd sa dernière usine ou son dernier générateur. Le stock et le bouclier restants sont alors conservés mais inutilisables, ou non rechargés.
- **`world.inGame`** : donnée officielle créée par `createWorld`, tableau de `FACTION_COUNT` booléens (vrai = au moins une planète au départ). `createWorld` lève une `Error` si une carte a plus de spawns que de factions ou un `owner` de planète ≥ `FACTION_COUNT`. Un spawn `{ planet }` applique la même règle de bouclier que le respawn.
- **Hors jeu dès le départ** : `createWorld` initialise `eliminated = (planetCount === 0)`, sans événement. Une faction sans planète de départ (cible d'entraînement, mini-carte de test) ne capture pas, n'émet jamais `ELIMINATED` et ne déclenche aucune fin de partie (son vaisseau, s'il existe, vole et tire normalement). C'est ce qui garde intacts les tests des phases 2 et 3. Dans une vraie carte, chaque faction a une base (test de validité de `arena`).
- **Élimination** (4.10), dans `updateFactions` : une faction non éliminée qui a `planetCount === 0` et dont le vaisseau est absent ou mort passe à `eliminated = true` et émet `ELIMINATED (a = f)`. Cela arrive au pas de la mort si elle n'avait plus de planète, ou au pas de la capture si son vaisseau attendait son respawn. Un vaisseau **vivant** sans planète reste en jeu : il peut recapturer une neutre.
- **Issue** : `world.outcome` vaut `OUTCOME.PLAYING` (0), `VICTORY` (1) ou `DEFEAT` (2), du point de vue de la faction 0. Elle n'est réévaluée qu'au pas où une élimination a lieu : `DEFEAT` seulement si la faction 0 était en jeu au départ (`world.inGame[0]`) et qu'elle est éliminée, sinon `VICTORY` si toutes les autres factions en jeu au départ sont éliminées. Si la faction 0 n'était pas en jeu (bot contre bot), l'issue reste `PLAYING` et aucun `GAME_OVER` n'est émis. Elle est écrite une seule fois, avec `GAME_OVER (a = outcome)`. La simulation continue après : l'écran de fin (6.4) n'est que de l'affichage.

### 2. Capture (`core/capture.js`, 4.2 et 4.6)

- Champs de planète : `captureBy` (faction qui capture, `-1` = personne) et `captureTime` (secondes).
- `updateCapture(world, dt)`, pour chaque planète `p` : on compte les vaisseaux **vivants** dont `landedOn === p`. La capture progresse si et seulement si **exactement un** vaisseau est posé, que sa faction `X` n'est pas `p.owner` et n'est pas éliminée, et que **`hasDefenses(p)` est faux** (aucun slot tourelle construit). Si `captureBy !== X`, on repart de 0. Puis `captureTime += dt`, et à `captureTime ≥ CAPTURE_TIME` (3 s) a lieu la capture. Dans tous les autres cas : `captureBy = -1` et `captureTime = 0`.
- Ce qui remet le compteur à zéro découle de la règle, sans cas particulier : décollage, éjection et mort (le vaisseau n'est plus posé, `damageShip` met déjà `landedOn = -1`), second vaisseau posé (allié du propriétaire, propriétaire qui réapparaît sur sa planète, ou troisième faction), tourelle reconstruite pendant la capture. Tous les vaisseaux capturent, bots compris.
- Neutre ou ennemie : même règle. Une neutre n'a jamais de bâtiment, donc pas de défense.
- **Capture** : `owner = X`, `resetBuildings(p)` (tous les slots `built = false`, `hp = 0`, `cooldown = 0`, et `buildProgress = 0` : SPEC §5.2), compteur remis à zéro, `CAPTURED (x, y = centre, a = planète, b = X)`. L'anneau de progression se lit dans l'état (`captureTime / CAPTURE_TIME`, couleur de `captureBy`). Il n'y a pas d'événement de début ni d'abandon.

### 3. Bâtiments (`src/data/buildings.js`, `core/building.js`, 4.3)

- **Catalogue en données**. L'ordre du tableau est l'ordre de développement, et un type n'y figure qu'une fois :

| Slot | `id`              | `buildTime` (s) | Effet                                                                                            |
| ---- | ----------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| 0    | `turret`          | 20              | `turret: { hp: 80, range: 150, cooldown: 1.0, damage: 6, speed: 200, life: 1.0, spread: 0.10 }`  |
| 1    | `missileFactory`  | 30              | `grants: 'missiles'`                                                                             |
| 2    | `shieldGenerator` | 40              | `grants: 'shield'`                                                                               |
| 3    | `heavyTurret`     | 45              | `turret: { hp: 160, range: 200, cooldown: 0.6, damage: 8, speed: 240, life: 1.1, spread: 0.06 }` |

`range` est mesurée depuis la **surface**, en px. `spread` est un demi-angle en rad. Développement complet en 2 min 15 s.

- **Slots préalloués** (ADR 0002) : `createPlanet` crée `buildings: [{ built, hp, cooldown }]`, un objet par entrée du catalogue (index du slot = index du catalogue, aucun `type` stocké), plus `buildProgress: 0` (secondes écoulées sur le chantier en cours), `captureBy: -1`, `captureTime: 0`. La carte peut fournir `planets[].built?: number`, le nombre de slots déjà construits dans l'ordre. Défaut 0, ignoré pour une planète neutre. Valeur pour les bases d'`arena` : 1 (une tourelle de départ contre le rush).
- `updateBuildings(world, dt)` ne s'applique qu'aux planètes **possédées**. Chantier = premier slot non construit (aucun : rien à faire). On fait `buildProgress += dt`. À `buildProgress ≥ BUILDINGS[slot].buildTime` : `built = true`, `hp` = PV max si c'est une tourelle, `cooldown = 0`, `buildProgress = 0`, et `BUILT (x, y = centre, a = planète, b = slot)`. Une tourelle détruite redevient « non construite » : elle redevient donc le premier chantier et se reconstruit en priorité. **Détruire une tourelle remet le chantier en cours à zéro** (`buildProgress = 0`). C'est voulu : attaquer une planète retarde son développement.
- Rendu (4.4) : formes filaires dans le cercle, disposition fixe en 2×2 décidée dans `entities/planetView.js` (cosmétique, constantes locales). Tourelle = carré, usine = rectangle couché, générateur = rectangle debout, tourelle lourde = carré doublé. Couleur du propriétaire pour un slot construit. Contour à faible alpha, avec un remplissage proportionnel à `buildProgress / buildTime`, pour le chantier. Rien pour les autres slots. L'anneau de capture est un arc à `radius + 4`.

### 4. Tourelles (`core/turret.js`, 4.5)

- `updateTurrets(world, dt)` traite chaque slot tourelle construit d'une planète possédée. `cooldown -= dt`. La cible est le vaisseau **vivant** d'une autre faction le plus proche, à distance de surface `≤ range`, posé ou non (pas de tir ami, SPEC §5.5 et §5.7). Si `cooldown ≤ 0` et qu'une cible existe, la tourelle tire.
- **Tir** : direction `u` = centre de la planète → cible, bruitée de `range(world.rng, −spread, +spread)`. Bouche à `centre + u·(radius + TURRET_MUZZLE_OFFSET)` (2 px). `spawnProjectile(KIND.BULLET, owner = planet.owner, vitesse = u·speed, life, damage)`, puis `TURRET_SHOT (x, y = bouche, a = planète, b = slot)`. Le tir part toujours radialement vers l'extérieur, il ne traverse donc jamais sa propre planète. Il touche un vaisseau posé à `r + 6` dès le pas suivant. Les balles subissent la gravité comme celles des vaisseaux.
- **Pas de tuerie instantanée** : la visée est sans anticipation, avec dispersion et des balles lentes ralenties par la gravité. Un vaisseau qui croise à 100 px/s est presque toujours manqué. Un vaisseau posé ou en approche lente encaisse 6 PV/s (tourelle seule) à ~19 PV/s (les deux tourelles), soit environ 4,8 s pour 100 PV avec les deux tourelles. La tourelle seule met environ 20 s en pratique, car environ 20 % des balles manquent un vaisseau posé. Avec un bouclier, il faut ajouter la durée d'absorption des 50 points du bouclier. La portée effective (vitesse × durée − ½·g0·durée²) reste supérieure à `range` pour g0 ≤ 84.
- **Dégâts subis** : la zone touchable d'une tourelle est le **disque de sa planète**. Dans `collideProjectilesPlanets`, un projectile absorbé par une planète possédée dont `owner ≠ p.owner` appelle `damageTurret(world, planetIndex, damage, x, y)`. Les dégâts vont au **premier slot tourelle construit** dans l'ordre (la tourelle de base, puis la lourde). À 0 PV : `built = false`, `hp = 0`, `planet.buildProgress = 0`, `TURRET_DESTROYED (a = planète, b = slot)`. `BULLET_HIT` reste émis comme aujourd'hui (flash). Il faut 7 balles pour une tourelle (12 dégâts) ou 2 missiles, et 14 balles ou 4 missiles pour une lourde.
- `hasDefenses(planet)` (dans `building.js`) : vrai s'il existe un slot tourelle avec `built`. C'est la condition de capture de §2.

### 5. Missiles (`core/weapons.js`, `core/missile.js`, 4.7 et 4.8)

- Champs du vaisseau : `missiles` (stock), `missileCooldown`, `rearmTime`.
- **Tir** dans `updateWeapons` : `intent.missile && missileCooldown ≤ 0 && missiles > 0 && factions[f].hasMissiles`. Le missile part de la pointe du nez, dans l'axe, à une vitesse `MISSILE_SPEED + max(0, vel·nez)` : il ne va jamais moins vite que `MISSILE_SPEED` et hérite seulement de la vitesse vers l'avant. On a ensuite `KIND.MISSILE`, `owner = faction`, `MISSILE_DAMAGE`, `MISSILE_LIFETIME`, `missiles--`, le cooldown, et `MISSILE_LAUNCH (a = vaisseau, b = projectile)`.
- **Guidage** : `steerMissiles(world, dt)`, appelé avant `updateProjectiles`. Pour chaque missile actif, on cherche le vaisseau vivant d'une autre faction le plus proche dans le cône `|écart| ≤ MISSILE_SEEK_ANGLE` autour du cap actuel et à moins de `MISSILE_SEEK_RANGE`. La cible est **réacquise à chaque pas** : aucun champ `target`, la forme du pool ne change pas. Le cap tourne d'au plus `MISSILE_TURN_RATE·dt` et la norme de la vitesse est conservée. Les missiles **ignorent la gravité** (propulsés) : `updateProjectiles` saute `applyGravity` pour `KIND.MISSILE`. Ils ne visent pas les tourelles, qu'on touche en visant la planète. Les collisions sont celles des balles (planètes, vaisseaux, tourelles).
- **Réarmement** (4.8) : un vaisseau posé sur une planète **de sa faction** dont le slot `missileFactory` est construit, avec `missiles < MISSILE_STOCK_MAX`, fait `rearmTime += dt`. À `MISSILE_REARM_TIME`, on a `missiles++`, `rearmTime = 0` et `REARM (a = vaisseau, b = stock)`. Sinon `rearmTime = 0`.
- Le stock initial et le stock au respawn valent `MISSILE_STOCK_MIN`.

### 6. Bouclier passif (`core/shield.js`, `lifecycle.js`, 4.9)

- Champs du vaisseau : `shield` (points) et `shieldDelay` (secondes avant que la recharge reprenne).
- **Absorption** dans `damageShip` (`SHIP_HIT.b` = dégâts bruts, avant bouclier), seul endroit des dégâts. Si `amount > 0` : `shieldDelay = SHIELD_RECHARGE_DELAY`, le bouclier absorbe `min(shield, amount)`, et le reste passe aux PV puis à la mort, comme aujourd'hui. Les dégâts d'impact au sol passent aussi par le bouclier.
- **Recharge** dans `updateShield(world, i, dt)`, pour un vaisseau vivant, **en vol comme posé**. Si `shieldDelay > 0`, on le décompte. Sinon, si `factions[f].hasShield`, on fait `shield = min(SHIELD_MAX, shield + SHIELD_RECHARGE_RATE·dt)`. « Hors combat » signifie : aucun dégât reçu depuis `SHIELD_RECHARGE_DELAY`.
- Aucun événement dédié : le rendu trace un cercle autour du vaisseau si `shield > 0`, et `SHIP_HIT` existe déjà.

### 7. Respawn et élimination (4.10)

- `respawnShip` remet aussi `missiles = MISSILE_STOCK_MIN`, `missileCooldown = 0`, `rearmTime = 0`, `shield = 0` et `shieldDelay = 0`. Ensuite, `updateRespawn` (qui a accès à `world`) fait `shield = SHIELD_MAX` si `factions[f].hasShield`, pour respecter « vie et bouclier pleins ».
- Une faction éliminée n'a plus de planète, donc `updateRespawn` la laisse déjà morte (`nearestPlanet` vaut −1) : aucun code de plus. Le vaisseau réapparaît sur la planète possédée la plus proche du lieu de sa mort (règle actuelle). S'il réapparaît sur une planète en cours de capture, il la conteste.

### 8. Ordre du pas, formes, performance, tests

**Ordre de `step`** (extension de l'ADR 0002 §5 et de l'ADR 0003 §4) :

1. IA → intentions des bots (phase 5).
2. Par vaisseau. S'il est mort : `updateRespawn`. S'il est vivant : `applyIntent`, `updateWeapons` (balles et missiles), (2b) `updateLanded` (s'il reste posé, il saute la suite), (3) gravité et intégration, (4) bornes, (5) `collideShipPlanets`.
3. `updateTurrets` : les tourelles tirent sur les positions de ce pas.
4. `steerMissiles`, puis `updateProjectiles`.
5. `collideProjectilesPlanets` (avec `damageTurret`), puis `collideProjectilesShips` (`damageShip` : bouclier, PV, mort).
6. Règles, par vaisseau vivant : `updateShield`, puis `updateRearm`. Ensuite `updateBuildings`, `updateCapture` et `updateFactions` (résumé, élimination, issue), dans cet ordre. Une tourelle achevée pendant ce pas bloque la capture de ce même pas, et une capture est visible dans le résumé dès ce pas.
7. `tick++`.

**Formes ajoutées** (JSON pur, tout créé au chargement) :

```
world   += factions: [{ planetCount, hasMissiles, hasShield, eliminated }] × FACTION_COUNT, outcome
planet  += captureBy, captureTime, buildProgress, buildings: [{ built, hp, cooldown }] × BUILDINGS.length
ship    += missiles, missileCooldown, rearmTime, shield, shieldDelay
map.planets[] += built?            projectile : inchangé
```

**Événements** (`EVT`, numéros à la suite) : `CAPTURED` (5, existe déjà : a = planète, b = faction), `BUILT` (9 : a = planète, b = slot), `TURRET_SHOT` (10 : a = planète, b = slot), `TURRET_DESTROYED` (11 : a = planète, b = slot), `MISSILE_LAUNCH` (12 : a = vaisseau, b = projectile), `REARM` (13 : a = vaisseau, b = stock), `ELIMINATED` (14 : a = faction), `GAME_OVER` (15 : a = issue).

**Performance** : boucles indexées, aucune closure ni aucun tableau temporaire, scratch locaux aux modules. Par pas, de l'ordre de 20 planètes × 4 slots × 3 vaisseaux, plus 256 slots de pool × 3 vaisseaux pour le guidage. C'est négligeable. Le pool de 256 suffit : environ 27 balles de vaisseaux, environ 35 de tourelles au pire, quelques missiles.

**Tests existants : ils passent sans modification grâce aux valeurs par défaut.** `built` vaut 0 par défaut et `createPlanet` reste la référence de `world-planets`. La forme du pool ne change pas (`world.test`, `projectile.test`). Les capacités sont verrouillées, le bouclier vaut 0 et le stock vaut le minimum. Le point essentiel est la faction **hors jeu** : les mini-cartes sans planète possédée ne capturent pas et n'éliminent personne, ce qui couvre les tests « posé 30 s sans événement » et « mort sans planète, aucun événement ». Avec `arena` (bases à `built: 1`), le test « 600 pas sans événement » tient, parce que le prochain bâtiment arrive à 30 s, au-delà des 10 s du test. Les scénarios chaotiques de 3000 pas sur des cartes avec bases (combat, respawn) peuvent désormais construire ou capturer, mais ils ne vérifient que le déterminisme et des invariants. Si une assertion `> 0` y tombait, on corrige le script, pas la règle.

### 9. Constantes (`config.js`)

`FACTION_COUNT = 3` · `CAPTURE_TIME = 3` · `TURRET_MUZZLE_OFFSET = 2` · `MISSILE_SPEED = 200` · `MISSILE_LIFETIME = 4` · `MISSILE_DAMAGE = 40` · `MISSILE_COOLDOWN = 0.5` · `MISSILE_TURN_RATE = 2.0` (rad/s, moins que les 3,2 du vaisseau : on peut esquiver) · `MISSILE_SEEK_ANGLE = 30°` (demi-angle, en rad) · `MISSILE_SEEK_RANGE = 350` · `MISSILE_STOCK_MAX = 4` · `MISSILE_STOCK_MIN = 1` · `MISSILE_REARM_TIME = 2` (s par missile) · `SHIELD_MAX = 50` · `SHIELD_RECHARGE_DELAY = 4` · `SHIELD_RECHARGE_RATE = 10` (PV/s, plein en 5 s). Les stats des bâtiments sont dans `src/data/buildings.js` (§3). Tout est réglable en 7.2.

## Justification

1. **Un seul écrivain par donnée** : le résumé de faction est recalculé en bloc (pas de compteur à maintenir), le compteur de capture est réécrit à chaque pas par une seule règle, et les dégâts passent tous par `damageShip` ou `damageTurret`. Les remises à zéro de la SPEC (décollage, éjection, mort, contestation) découlent de la règle au lieu d'être des cas particuliers.
2. **Slot = index du catalogue** : l'ordre fixe, la reconstruction prioritaire des tourelles et la remise à zéro à la capture tiennent en « premier slot non construit » plus une boucle de remise à zéro. Pas de file, pas de type stocké.
3. **Disque de la planète = zone touchable des tourelles** : aucune géométrie de plus, la collision existe déjà, et le joueur comprend « je tire sur la planète ennemie pour faire tomber ses défenses ».
4. **Réacquisition des missiles à chaque pas, sans gravité** : la forme du pool ne change pas, aucun index périmé, comportement prévisible pour le joueur comme pour l'IA.
5. **Hors jeu dès le départ** : une seule règle qui protège les tests des phases 2 et 3 et donne un sens propre aux cibles d'entraînement.

## Alternatives écartées

- **Capacités calculées à la demande** (`factionHas(world, f, type)`) : plusieurs lecteurs par pas, et `eliminated` doit de toute façon être stocké. **Compteurs incrémentaux** mis à jour à la capture : risque de décalage.
- **Développement en `level` entier** : ne sait pas représenter une tourelle détruite au milieu de bâtiments intacts, ni les PV par tourelle.
- **Tourelles en entités séparées, avec position et boîte de collision propres** : géométrie et cycle de vie en plus, pour un rendu qui est de toute façon dans le cercle.
- **Visée avec anticipation** : tourelles trop létales, ce qui va contre l'objectif « ne pas tuer instantanément ».
- **`missile.target` stocké** (ADR 0002 §1) : nouveau champ de pool (tests de forme à réécrire) et index de cible à invalider. **Missiles soumis à la gravité** : le guidage lutte contre la gravité, trajectoires illisibles.
- **Événements de début ou d'abandon de capture, événement de bouclier** : l'état suffit au rendu (ADR 0002 §4 : le continu se déduit de l'état).
- **Élimination évaluée à l'échéance du respawn** : retarde la fin de 3 s sans raison.
- **Capture ouverte à toute faction, y compris hors jeu** : environ 15 tests de « posé sans événement » cassent, et une cible d'entraînement pourrait capturer.

## Conséquences

- Les nouveaux modules `faction.js`, `building.js`, `capture.js`, `turret.js`, `missile.js` et `shield.js` sont tous des modules de **système** (ils reçoivent `world`), plus `src/data/buildings.js`. `planet.js` importe le catalogue pour créer les slots, ce qui est autorisé car c'est une donnée et non un module d'entité.
- **Risques de playtest** : les balles perdues d'un combat près d'une planète ennemie abîment ses tourelles (assumé). L'équilibre tourelles/capture dépend fortement de `range`/`damage`. Les missiles sans gravité peuvent paraître « hors physique » (levier : réduire `MISSILE_SEEK_ANGLE`). Un vaisseau qui réapparaît au sommet de sa planète peut se superposer à un capteur posé au même endroit (pas de collision vaisseau/vaisseau en v1, effet seulement visuel). `Ctrl` + flèches peut déclencher des raccourcis système (changement de bureau sous macOS) : vérifier en 4.7 et prévoir une touche de repli en 6.5 si besoin.
- **Écarts à l'ADR 0002**, à reporter lors d'une révision : (1) pas de `missile.target`, réacquisition à chaque pas ; (2) `missile.js` s'ajoute à la liste du §5 ; (3) `world` gagne `factions` et `outcome` ; (4) l'ordre du pas est celui du §8 ci-dessus ; (5) `planet.js` importe `src/data/buildings.js`.
- L'ADR d'architecture de l'IA (TODO 5.1, annoncé comme « ADR 0004 ») prendra le numéro **0006**.

## Plan d'implémentation (items 4.1 à 4.10)

L'item 4.1 pose **toutes** les formes, constantes, entrées `EVT` et le catalogue. C'est une exception assumée à « pas de code avant l'usage » : elle permet de paralléliser la suite sans conflit sur `config.js`, `events.js`, `planet.js` et `ship.js`. Chaque item ajoute ensuite une ou deux lignes dans `world.js` (`step`) ; les commits restent séquentiels sur `main`.

| Item     | Contenu                                                                                                                                                                                                                                                                                               | Fichiers                                                                                                      | Agents                                                            | Dépend de       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------- |
| **4.1**  | Socle : constantes §9, `EVT` §8, catalogue §3, champs planète (`built?` inclus) et vaisseau, `createFactions`, résumé `updateFactions` (sans élimination), « hors jeu », `outcome`, `arena` (bases à `built: 1`), validité « chaque spawn possède une base ». Tous les tests existants restent verts. | `config.js`, `events.js`, `data/buildings.js`, `planet.js`, `ship.js`, `faction.js`, `world.js`, `arena.js`   | code (Sonnet), test-s                                             | —               |
| **4.2**  | `updateCapture` (neutre ; `hasDefenses` faux par construction), `CAPTURED`. Tests : 3 s d'affilée, remise à zéro au décollage, à la mort et en cas de contestation, faction hors jeu, capture par la faction 1.                                                                                       | `capture.js`, `building.js` (`hasDefenses`, `resetBuildings`), `world.js`                                     | code, test-c                                                      | 4.1             |
| **4.3**  | `updateBuildings` : ordre, durées, possédée seulement, `BUILT`. `updateFactions` voit les capacités. Tests : chronologie complète, neutre figée, `built` initial.                                                                                                                                     | `building.js`, `world.js`                                                                                     | code, test-c                                                      | 4.1 (∥ 4.2)     |
| **4.4**  | Rendu des bâtiments, de l'anneau de capture et de la couleur du propriétaire. Vérification manuelle.                                                                                                                                                                                                  | `entities/planetView.js`, `GameScene.js`                                                                      | code (Sonnet ; Haiku acceptable)                                  | 4.2, 4.3        |
| **4.5**  | `updateTurrets`, `damageTurret`, reconstruction prioritaire, `TURRET_SHOT`/`TURRET_DESTROYED`, sons et effets. Tests : pas de tir ami, portée de surface, dispersion seedée, PV, chantier remis à zéro, temps pour tuer ≥ 5 s.                                                                        | `turret.js`, `collision.js`, `world.js`, `systems/audioEvents.js`, `systems/effects.js`                       | code (effort **high**), test-c, puis revue légère si > 300 lignes | 4.3             |
| **4.6**  | Condition `hasDefenses` dans la capture, remise à zéro des bâtiments à la capture ennemie. Tests : capture bloquée tant qu'une tourelle vit, réinitialisation, puis redéveloppement pour le nouveau propriétaire.                                                                                     | `capture.js`                                                                                                  | code, test-c                                                      | 4.2, 4.5        |
| **4.7**  | Tir de missile verrouillé par `hasMissiles`, `steerMissiles`, missiles sans gravité, `MISSILE_LAUNCH`, rendu (trait orienté) et stock affiché à minima dans `healthBar`. Tests : cône, vitesse angulaire max, cible la plus proche, pas de tir ami, stock et cooldown.                                | `weapons.js`, `missile.js`, `projectile.js`, `world.js`, `entities/projectileView.js`, `systems/healthBar.js` | code (effort **high**), test-s (géométrie du cône), test-c        | 4.1 (∥ 4.2–4.6) |
| **4.8**  | `updateRearm`, `REARM`, minimum au respawn (`respawnShip`). Tests : recharge seulement posé sur sa planète avec usine, plafond, remise à zéro au décollage.                                                                                                                                           | `weapons.js`, `ship.js`, `world.js`                                                                           | code, test-c                                                      | 4.3, 4.7        |
| **4.9**  | Absorption dans `damageShip`, `updateShield`, bouclier plein au respawn si débloqué, cercle de bouclier et barre dans `healthBar`. Tests : absorption puis PV, délai, taux, plafond, impact au sol.                                                                                                   | `lifecycle.js`, `shield.js`, `world.js`, `entities/shipView.js`, `systems/healthBar.js`                       | code, test-s (absorption), test-c (recharge)                      | 4.1 (∥ 4.2–4.8) |
| **4.10** | Élimination et issue dans `updateFactions`, `ELIMINATED`/`GAME_OVER`. Scénarios : dernière planète capturée pendant le respawn ; mort sans planète ; vaisseau vivant sans planète qui recapture ; victoire et défaite ; déterminisme d'une partie scriptée sur `arena`.                               | `faction.js`, `lifecycle.js` (bouclier au respawn si pas fait en 4.9)                                         | code, test-c                                                      | 4.6, 4.8, 4.9   |
| **4.11** | Revue de la phase : règles, ordre du pas, absence d'allocation, écarts à l'ADR 0002.                                                                                                                                                                                                                  | —                                                                                                             | rev (Opus)                                                        | tout            |

**Ordre recommandé** : 4.1, puis {4.2, 4.3, 4.7, 4.9} en parallèle, puis 4.4 et 4.5, puis 4.6 et 4.8, puis 4.10, puis 4.11. Chemin critique : 4.1 → 4.3 → 4.5 → 4.6 → 4.10.
