# 0006 — IA des bots

- **Statut** : accepté
- **Date** : 2026-11-23
- **Précise** : ADR 0002 (§2 producteurs d'intentions, §5 fichiers et étape 1 du pas), ADR 0005 (§8 étape 1). Tient compte de l'ADR 0007 (dégâts aux bâtiments, proposé), qui réserve `planet.lastHitTick`. Écarts en fin de document.

## Contexte

Phase 5 (TODO 5.1 à 5.8) : deux bots (factions 1 et 2), une seule difficulté, pilotent leur vaisseau avec **exactement** les intentions du joueur (`{ rotate: -1|0|1, thrust, fire, missile }`). Ils capturent des neutres, attaquent les planètes ennemies (tourelles puis capture), se défendent et se battent entre eux et contre le joueur. Contraintes héritées : `world` en JSON pur, aucune allocation dans `step`, aléa seedé, `core/` sans Phaser ni DOM. La difficulté technique est le pilotage : pas de frein (180° + poussée), gravité jusqu'à 84 px/s² contre 140 de poussée, seuils d'atterrissage serrés (45 px/s radial, 35 tangentiel, 25°), tourelles à portée de surface. Une centaine de tests existants posent ou scriptent `ships[1]` (cible d'entraînement) : ils doivent passer sans modification. La revue 4.11 a listé des points à trancher (TODO 5.1).

## Décision

**L'IA est un module pur `core/ai/` appelé à l'étape 1 de `step`, seulement pour les factions déclarées bots (`createWorld(..., { bots: [1, 2] })`). Toutes les 0,5 s, une couche « décision » choisit par score d'utilité, avec hystérésis, un couple (mode, cible). À chaque pas, une couche « pilote » traduit ce but en intentions discrètes, grâce à une prédiction balistique qui utilise `gravityAt` et à `evaluateLanding`. Son seul aléa est `world.aiRng`, et son état vit dans `world.ai` (JSON pur).**

### 1. Exécution : où, quand, quoi

- **Activation explicite.** `createWorld(map, seed, { eventCapacity, bots = [] })` crée `world.ai = bots.map(createBotState)`, un état par bot avec son champ `faction`. Elle lève une `Error` si une faction de `bots` n'a pas de spawn. Par défaut, il n'y a aucun bot : les tests existants et la cible d'entraînement ne changent pas. `GameScene` passe `bots: [1, 2]`.
- **Flux d'aléa séparé.** `world.aiRng = createRng((seed ^ AI_RNG_SALT) >>> 0)` (constante dans `config.js`). Ce flux est toujours créé. L'IA ne tire jamais dans `world.rng`, donc les tirages des tourelles ne sont pas décalés par l'IA.
- **Étape 1 de `step`** : `updateAi(world, dt)` (`core/ai/bot.js`), avant la boucle des vaisseaux. Pour chaque bot dont la faction n'est pas éliminée et dont le vaisseau est vivant, elle fait deux choses :
  1. elle décompte `decisionTimer`. À échéance, elle appelle `decide()` (§3) et réarme le minuteur à `decisionPeriod`. Le minuteur est en secondes et décompté avec `dt`, pas en ticks, pour rester cohérent avec le paramètre `dt` des tests de convergence. Le premier minuteur vaut `startDelay + k · decisionPeriod / 2` (k = rang du bot) : les deux bots ne décident pas au même pas ;
  2. elle appelle `pilot()` (§4) **à chaque pas**, qui réécrit tout `ships[f].intent`.

  Un vaisseau mort est ignoré. Son état passe à `mode = NONE`, ce qui force une décision dès le pas de son respawn.

- **Deux cadences** : la décision tourne à 2 Hz, ce qui simule aussi le temps de réaction stratégique. Le contrôle tourne à 60 Hz, comme un joueur qui tient les touches. La rotation est cinématique (0,053 rad par pas) : décider le contrôle moins souvent ferait osciller le nez.
- **Écritures autorisées** : `ships[f].intent` des bots, `world.ai[k]` et `world.aiRng`. **Rien d'autre**, et surtout pas d'événement : le debug lit `world.ai`. L'IA n'appelle aucune fonction qui modifie le monde (`damageShip`, `spawnProjectile`, `pushEvent`, `update*`).
- **L'IA lit l'état, jamais `world.events`.** La file peut être pleine, et elle est vidée par la scène. Tout ce dont l'IA a besoin est un champ d'état (§5).

**État d'un bot** (nombres et booléens uniquement, créé au chargement) :

```
world.ai[k] = { faction, mode, target, phase, decisionTimer, modeTime, fireDelay, aimBias,
                lastHealth, underFire, evadeTimer, banMode, banTarget, banTimer }
```

`mode` est un entier de `AI_MODE = { NONE, IDLE, CAPTURE, ASSAULT, HUNT, DEFEND, RETREAT, REARM }`, exporté par `bot.js` comme `KIND` ou `OUTCOME`. `target` est un index de planète, ou de vaisseau pour `HUNT`, et vaut −1 s'il n'y en a pas. `phase` est la sous-étape de manœuvre (§4).

### 2. Perception : tout l'état stratégique, le local pour les projectiles

- **Lu partout, sans limite de distance** : planètes (position, rayon, `owner`, bâtiments, `captureBy`/`captureTime`, `lastHitTick`), vaisseaux adverses (`alive`, `pos`, `vel`, `angle`, `hp`, `shield`, `landedOn`), `factions[*]`. C'est ce que montre la minimap (6.2) au joueur, d'où l'équité. Un brouillard de guerre donnerait au bot moins d'information que le joueur et coûterait un état de mémoire.
- **Projectiles** : seulement dans un rayon de `missileNotice` (220 px, environ une demi-largeur d'écran), et seulement les missiles. Le bot n'esquive pas les balles.
- **Interdit** (liste noire vérifiée en revue) : l'`intent`, les cooldowns et le stock de missiles des autres vaisseaux (le joueur ne les voit pas, et l'`intent` du joueur est écrit avant le pas, ce qui équivaudrait à lire le clavier), `world.rng`, `world.ai` d'un autre bot.

### 3. Décision : utilité avec hystérésis

À chaque décision, `decide()` parcourt une fois les planètes et les vaisseaux, calcule le score de chaque candidat, garde le meilleur dans des variables locales (pas de liste) et l'écrit dans l'état. Si le couple (mode, cible) change, `phase = 0` et `modeTime = 0`. Si la cible de tir change, `fireDelay = reactionTime`. `aimBias` est retiré à chaque décision.

| Mode      | Candidats                                                                                           | Score (× `proximity` = 1 / (1 + trajet / `travelScale`), trajet = distance / `cruiseSpeed`)                               |
| --------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CAPTURE` | planète `owner ≠ f` sans tourelle (`!hasDefenses`)                                                  | `capture` × (1 si neutre, 1,3 si ennemie) × (1 + 0,2 · slots construits) × (0,3 si un autre vaisseau y est posé)          |
| `ASSAULT` | planète ennemie défendue, si santé ≥ `assaultMinHealth`                                             | `assault` × `aggression` × 1,3 × (1 + 0,2 · slots) / (1 + PV tourelles / 160) × `healthFactor`                            |
| `HUNT`    | vaisseau ennemi vivant à moins de `huntRange`                                                       | `hunt` × `aggression` × `healthFactor` × (0,3 si la cible est dans la portée de tourelle d'une planète qui n'est pas à f) |
| `DEFEND`  | planète de f avec `captureBy ∉ {−1, f}` (urgent : × 2), ou touchée depuis < `defendMemory`          | `defend` × urgence                                                                                                        |
| `RETREAT` | si santé < `lowHealth` et (`underFire` ou ennemi à < 300 px) : planète de f défendue la plus proche | `retreat` × (1 − santé / `lowHealth`)                                                                                     |
| `REARM`   | si `hasMissiles` et `missiles < rearmBelow` : planète de f avec usine                               | `rearm` × (stock manquant / `MISSILE_STOCK_MAX`)                                                                          |
| `IDLE`    | toujours                                                                                            | `idle` (plancher) : se poser sur la planète possédée la plus proche, ou attendre sur place sans planète                   |

- `santé = hp + shield`. `healthFactor = clamp(santé / SHIP_MAX_HP, 0,3, 1)`. `underFire` vaut vrai si la santé a baissé depuis la décision précédente (`lastHealth`). C'est un état propre à l'IA, sans nouveau champ dans le vaisseau.
- **Contre l'effet boule de neige** : les cibles (planètes ou vaisseau) de la faction adverse qui a le plus de planètes sont multipliées par `leaderBonus`. On n'ajoute aucun biais pour ou contre le joueur : les bots se battent entre eux.
- **Hystérésis** : l'option en cours est multipliée par `commitBonus`. `ASSAULT p` puis `CAPTURE p` compte comme la même option. Pendant `minCommit`, seuls `DEFEND` urgent et `RETREAT` peuvent préempter. Les égalités sont départagées par un bruit de ± `scoreNoise` tiré dans `aiRng`, ce qui empêche aussi les deux bots de faire les mêmes choix.
- **Anti-blocage** : une option `CAPTURE`, `ASSAULT` ou `HUNT` qui dure plus de `giveUpTime` est abandonnée. Sa cible est bannie pendant `banTime` (`banMode`/`banTarget`/`banTimer`, un seul emplacement).
- **Pourquoi l'utilité** : les candidats sont des couples (mode, cible) sur environ 9 planètes et 2 vaisseaux. Des scores se comparent naturellement, alors qu'une machine à états pure aurait besoin de 7 × 6 transitions écrites à la main. La machine à états reste, mais en petit, **dans** chaque mode (`phase`).

### 4. Pilote : contrôle de bas niveau (`pilot.js`, `touchdown.js`, `combat.js`)

Priorité à chaque pas, de la plus haute à la plus basse : **(1) éviter un crash > (2) esquiver un missile > (3) manœuvre du mode**. Le tir (§4.5) est décidé indépendamment du mouvement.

**4.1 Primitives.** `steerToAngle(intent, ship, angle)` fait `rotate = signe(wrapAngle(angle − ship.angle))` si l'écart dépasse la zone morte `SHIP_ROTATION_SPEED · FIXED_DT / 2` (≈ 0,027 rad), et 0 sinon : c'est exact, puisque la rotation n'a pas d'inertie. `thrustToward(intent, ship, ax, ay)` oriente le nez vers l'accélération voulue et met `thrust = true` seulement si le nez est à moins de `thrustCone` de cette direction et que |accélération voulue| dépasse le seuil. Comme le contrôle est bang-bang, la tolérance tient lieu de modulation.

**4.2 Navigation (`flyTo`, 5.2)**, vers un point d'arrivée (cible, entrée d'atterrissage, point d'attente) :

- vitesse désirée orientée vers le point, de norme `v = min(cruiseSpeed, −a·tt + sqrt((a·tt)² + 2·a·dist))`, avec `a = brakeFactor · SHIP_THRUST` et `tt = π / SHIP_ROTATION_SPEED` (temps du demi-tour). C'est un « arrive » qui inclut le temps de retournement : 150 px/s à 800 px, environ 70 px/s à 100 px, environ 18 px/s à 20 px ;
- accélération voulue `(v_des − vel) / velGainTime − g`, avec `g = gravityAt(pos)` : la gravité est compensée (|g| ≤ 84 < 140). On pousse si |v_des − vel| > `velTolerance` ;
- **contournement** : on prend le premier obstacle que coupe le segment vaisseau → but (test segment/disque sur toutes les planètes sauf la cible). Le waypoint est alors centre + perpendiculaire × 1,15 · rayon gonflé, du côté du vaisseau. Il n'y a qu'un niveau, recalculé à chaque pas, sans A*. Rayon gonflé = `r + SHIP_COLLISION_RADIUS + clearance`, plus `defenseRange(p)` si p est ennemie et défendue (c'est l'évitement des tourelles). On ignore un obstacle dont le vaisseau est déjà à l'intérieur (décollage) : le réflexe (1) s'en charge ;
- **murs** : les points d'arrivée sont bornés à `[wallMargin, taille − wallMargin]`. Le rebond est sans dégât, il n'y a rien d'autre à faire.

**4.3 Réflexe anti-crash.** À chaque pas, `predictPath` (§5) simule le vol **sans poussée** sur `avoidHorizon` (2 s) au pas `predictDt` (1/30 s). Si le vaisseau doit toucher une planète qui n'est pas la cible de la descente en cours, la manœuvre est remplacée par une accélération vers l'extérieur au point de contact prévu, plus la composante tangentielle de la vitesse : on s'écarte en gardant son élan.

**4.4 Atterrissage et décollage (`touchdown.js`, 5.3).** Les phases sont les suivantes (h = altitude au-dessus du rayon de contact `r + 6`) :

1. **APPROCHE** : `flyTo` vers le point d'entrée = centre + normale(vaisseau) × (r + 6 + `landEntryAltitude`), sur le rayon qui passe par le vaisseau, avec une vitesse d'arrivée inférieure à `landEntrySpeed` ;
2. **DESCENTE** : nez sur la normale sortante, incliné d'au plus `landMaxTilt` pour annuler la vitesse tangentielle, avec une inclinaison nulle sous h = 15. **Règle de poussée** : on simule le vol sans poussée jusqu'au contact (`predictPath`), on copie l'état prédit dans un vaisseau virtuel (scratch de module), puis on appelle `evaluateLanding(virtuel, planète, out)`, la seule source des seuils. On pousse si `out.approachSpeed > landRadialTarget` (25, pour un seuil réel de 45), ou si |`out.tangentialSpeed`| > `landTangentialMax` (20, pour 35) avec le nez du bon côté. C'est un « suicide burn » bang-bang qui arrive vers 25 px/s, avec une oscillation d'environ (T − g)·dt ≈ 1 px/s ;
3. **REMISE DES GAZ** : si h < 15 et que le contact prévu reste hors des marges (tangentielle > 30 px/s ou nez à plus de 0,35 rad), on pousse plein axe vers l'extérieur et on revient en DESCENTE depuis le point d'entrée. Un rebond dû au seul angle ne coûte rien (ADR 0003) ;
4. **POSÉ** : intentions nulles, sauf le tir opportuniste (§4.5) ;
5. **DÉCOLLAGE** : dès que le but n'est plus la planète où l'on est posé, on tourne le nez vers la normale (à 0,3 rad près), on pousse jusqu'à h > `takeoffAltitude`, puis `flyTo` reprend.

**4.5 Combat (`combat.js`, 5.5).**

- **Avance de visée** : `interceptTime(dx, dy, dvx, dvy, speed)` résout |r + v_rel·t| = `BULLET_SPEED`·t, avec v_rel = vitesse de la cible − vitesse du bot (la balle hérite de la vitesse du tireur). La gravité est ignorée dans l'avance : l'erreur est faible hors des champs, et l'imperfection est voulue. Cap visé = cap d'interception + `aimBias`, avec `aimBias` uniforme dans ± `aimError`, retiré à chaque décision (biais de 0,5 s, comme un humain).
- **Tir** (`fire`), dans **tous** les modes : `fireDelay ≤ 0`, nez à moins de `fireCone` du cap visé, distance < `fireRange`, et ligne de tir libre. La ligne de tir se vérifie avec `predictPath` de la balle (bouche, vitesse héritée, pas de marge de contact) : elle ne doit toucher aucune planète avant le temps d'interception. En `ASSAULT`, le test est inversé : on tire si la balle prédite touche **la planète cible** (le disque est la zone touchable des tourelles).
- **Missiles** (`missile`), conditionnés par `hasMissiles`. Contre un vaisseau, il faut un stock > 0. On vérifie `findMissileTarget(ships, nez, angle, f) === cible`, une distance < `missileRange` et une ligne de vue droite (les missiles ignorent la gravité). En `ASSAULT`, il faut un stock > `missileReserve`, pour garder un missile contre les vaisseaux. On lance alors sur la planète (40 dégâts, soit 2 missiles par tourelle) si aucun vaisseau ennemi n'est dans le cône.
- **HUNT** : on rejoint la bande `[engageMin, engageMax]` autour de la cible. Dans la bande, le nez sert à viser. Hors de la bande, il sert à naviguer.
- **ASSAULT** : point d'attente = surface + `defenseRange(p)` + `standoffMargin` sur la droite planète → bot (250 px de la surface pour une tourelle lourde, hors de sa portée). On s'y tient avec `flyTo` et on tire sur le centre. Dès que `hasDefenses` est faux, le pilote **cesse le feu dans le même pas** : avec l'ADR 0007, les tirs suivants raseraient l'usine pour rien, puisque la capture remet tout à zéro. La décision suivante passe alors en `CAPTURE` de la même planète, sans perdre le bonus d'engagement. Pas de mode « raid » (raser la dernière usine d'une faction, ADR 0007 §6) en v1 : on l'ajoutera seulement si le playtest montre des bots trop passifs.
- **Esquive** : un missile ennemi à moins de `missileNotice`, qui se rapproche, avec le bot dans son cône de recherche. On pousse alors perpendiculairement à sa vitesse, du côté du produit vectoriel, pendant `evadeTimer` ≤ 1 s. Pas d'esquive posé. Le vaisseau tourne à 3,2 rad/s contre 2,0 pour le missile : c'est jouable.
- **DEFEND** : on engage (comme HUNT) le vaisseau ennemi le plus proche dans la zone de gravité de la planète. S'il n'y en a pas, on se pose dessus : un second vaisseau posé conteste et remet la capture à zéro (ADR 0005 §2). **RETREAT/REARM/IDLE** : atterrissage sur la planète cible, puis attente.

### 5. API pures ajoutées à `core/` (sans allocation)

| API                                                                           | Où                                                                                                                                                                                                    | Réutilisée par                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `predictPath(out, pos, vel, planets, contactMargin, horizon, dt)`             | **`core/predict.js`** (système)                                                                                                                                                                       | IA (crash, atterrissage, ligne de tir). Plus tard, peut-être l'aide à l'atterrissage (contact prédit, limite de l'ADR 0003) |
| `findMissileTarget(ships, x, y, heading, faction)` → index ou −1              | `missile.js`, extraite de `steerMissiles`                                                                                                                                                             | `steerMissiles` (qui recalcule l'écart avec la même expression, donc résultat bit à bit identique) et l'IA                  |
| `hasMissileFactory(planet)`                                                   | `building.js` (déplacée de `rearm.js`)                                                                                                                                                                | `updateRearm`, IA                                                                                                           |
| `defenseRange(planet)` : portée max des tourelles construites, 0 sinon        | `building.js`                                                                                                                                                                                         | IA. `hasDefenses` reste tel quel                                                                                            |
| `planet.lastHitTick` (−1 au départ, jamais `Infinity`, qui n'est pas du JSON) | `planet.js`. Écrit **en entrée** de `damageBuilding` (ADR 0007, ou `damageTurret` tant que 4.13 n'est pas livré), avant le test « aucun slot construit » : une planète nue touchée est aussi attaquée | IA (`DEFEND`). Lecture : `lastHitTick >= 0 && tick − lastHitTick < defendMemory / FIXED_DT`                                 |

- `predictPath` intègre en Euler semi-implicite avec `gravityAt`, exactement comme `step`. Elle s'arrête au premier `d < r + contactMargin` ou à `horizon`. Elle écrit `{ hit, t, x, y, vx, vy }` dans `out`, avec `hit` = index de planète ou −1. Avec `dt = FIXED_DT`, elle reproduit **bit à bit** le vol libre réel (c'est un test). Elle ne gère ni poussée, ni murs, ni missiles (guidés).
- **Pas de filtres ajoutés à `nearestPlanet`** : la décision parcourt déjà toutes les planètes une fois, et son score fait office de filtre. `nearestPlanet(planets, pos, owner)` suffit pour `IDLE` et `RETREAT`. **Pas d'export du ciblage des tourelles** : l'IA a besoin de savoir où une tourelle tire (`defenseRange`), pas sur qui.
- Ce qui est propre à l'IA reste dans `core/ai/` : `interceptTime`, segment/disque, `steerToAngle`.

### 6. Profil unique : `src/data/ai.js` (`BOT_PROFILE`, valeurs de départ, réglage en 5.7 et 7.2)

| Groupe       | Valeurs                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réaction     | `startDelay` 2 s · `decisionPeriod` 0,5 s · `reactionTime` 0,3 s (avant le premier tir sur une nouvelle cible) · `missileNotice` 220 px                                                                                                                               |
| Décision     | poids `capture` 1,0 · `assault` 0,8 · `hunt` 0,7 · `defend` 1,6 · `retreat` 1,4 · `rearm` 0,6 · `idle` 0,05 · `aggression` 1,0 · `travelScale` 8 s · `leaderBonus` 1,2 · `commitBonus` 1,3 · `minCommit` 2 s · `scoreNoise` 0,05 · `giveUpTime` 45 s · `banTime` 30 s |
| Seuils       | `huntRange` 700 px · `lowHealth` 40 · `assaultMinHealth` 60 (hp + bouclier) · `rearmBelow` 2 · `defendMemory` 5 s · `defendRadius` 400 px · `defendUrgent` 2 · `defendNearFactor` 0,5 · `retreatThreat` 300 px · `retreatHold` 0,5 · `retreatSafe` 300 px             |
| Navigation   | `cruiseSpeed` 150 px/s · `brakeFactor` 0,6 · `velGainTime` 0,4 s · `velTolerance` 8 px/s · `thrustCone` 0,3 rad · `clearance` 30 px · `wallMargin` 60 px · `avoidHorizon` 2 s · `predictDt` 1/30 s                                                                    |
| Atterrissage | `landEntryAltitude` 50 px · `landEntrySpeed` 20 px/s · `landRadialTarget` 25 px/s · `landTangentialMax` 20 px/s · `landMaxTilt` 0,2 rad · `takeoffAltitude` 40 px                                                                                                     |
| Combat       | `aimError` 0,05 rad · `fireCone` 0,06 rad · `fireRange` 380 px · `engageMin`/`engageMax` 120/260 px · `missileRange` 300 px · `missileReserve` 1 · `standoffMargin` 50 px                                                                                             |

`config.js` reçoit seulement `AI_RNG_SALT`. Une future difficulté (backlog) sera un autre objet profil, sans code de plus.

### 7. Carte et équilibrage de départ

- `arena.spawns` devient `[{ planet: 0 }, { planet: 1 }, { planet: 2 }]` (5.7). Le test « arena : 2 vaisseaux » de `combat.test.js` passe à 3, et c'est la seule modification de test attendue. Le test « 600 pas sans intention » reste valide, car `bots` n'est pas passé.
- Le bot est volontairement plus lent qu'un humain attentif : 2 s d'inertie au départ, environ 0,25 s de latence stratégique moyenne, 0,3 s avant de tirer sur une nouvelle cible, une erreur de visée biaisée, pas d'esquive des balles. Il est en revanche plus régulier qu'un humain pour se poser. C'est assumé, puisque c'est le cœur de son jeu.
- La base du bot 2 est plus centrale (4 neutres à moins de 810 px), donc probablement avantagée. On le signale pour 7.1, on ne corrige pas maintenant.

### 8. Performance

- Budget : **IA ≤ 0,15 ms par pas pour 2 bots**, environ 1 % d'une frame. On mesure une fois en 5.8 avec un script jetable hors du dépôt, pas de test chronométré dans `npm test`.
- Par bot et par pas : environ 3 appels de `predictPath` (anti-crash sur 60 itérations, contact d'atterrissage, ligne de tir seulement si le nez est aligné), soit moins de 2 000 termes de gravité. Il faut aussi un balayage du pool (256) pour les missiles, avec sortie rapide sur `!active`, et P tests segment/disque. Décision : O(P + S) tous les 30 pas. Pas de recherche O(n²).
- **Zéro allocation** dans `core/ai/` et `predict.js` : objets scratch au niveau du module, meilleur candidat gardé dans des locales. Pas de `map`/`filter`/`forEach`, pas de closure ni de littéral `{}`/`[]` dans les fonctions appelées par `step`. Le reviewer le vérifie (5.8).

### 9. Tests déterministes

- **Unitaires** (`tests/unit/ai-*.test.js`, `predict.test.js`) : `predictPath` est bit à bit égal au vol libre réel via `step` (pas `FIXED_DT`, une planète), en ligne droite hors champ, et donne `hit = −1` à l'horizon. `interceptTime` : cible fixe → distance / vitesse, cible qui fuit trop vite → −1, croisement connu. `steerToAngle` : zone morte, passage à ±π. `defenseRange`, `hasMissileFactory`. `lastHitTick` : écrit pour un tir ennemi, pas pour un tir allié ni sur une neutre. Les tests de missiles existants passent inchangés (preuve de l'extraction). Scores sur des mondes construits à la main : la neutre la plus proche gagne ; une planète défendue donne `ASSAULT`, pas `CAPTURE` ; une capture ennemie en cours sur une planète du bot donne `DEFEND` ; un écart de 10 % ne fait pas basculer (hystérésis) ; bannissement après `giveUpTime`.
- **Scénarios nommés** (`tests/scenarios/ai-*.test.js`, mini-cartes, `bots: [1]` ou `[1, 2]`). Les seeds sont fixes (1 à 20) : elles tirent les conditions initiales côté test et seedent `aiRng`. Les seuils sont des taux sur ces seeds (le résultat est déterministe, la marge absorbe les réglages) :
  - _navigation_ : rejoindre un point à 800 px en espace inertiel et s'y arrêter (|v| < 10) en moins de 12 s ; contourner une planète sur la ligne droite sans aucun `IMPACT` ;
  - _atterrissage_ : planètes (r, g0) ∈ {(30, 50), (60, 70), (90, 84)} × positions et vitesses initiales tirées sur 20 seeds. On exige un posé **sans dégât** en moins de 20 s dans **≥ 95 %** des cas, et zéro mort dans tous les cas ;
  - _décollage_ : on atteint h > 100 sans `IMPACT` ;
  - _capture_ : le bot capture la neutre la plus proche (en temps de trajet) en moins de 25 s, et 3 neutres en moins de 90 s ;
  - _assaut_ : planète ennemie avec une tourelle. Destruction de la tourelle (`TURRET_DESTROYED`, renommé `BUILDING_DESTROYED` par l'ADR 0007, avec `b` = slot tourelle) puis `CAPTURED` par le bot en moins de 60 s dans ≥ 80 % des seeds. Aucun `BUILDING_DESTROYED` sur un slot non-tourelle avant la capture (cessez-le-feu) ;
  - _défense_ : un vaisseau ennemi scripté posé sur une planète du bot. `captureTime` repasse à 0 avant la capture dans ≥ 90 % des seeds ;
  - _non-suicide_ (invariants, toutes les parties longues) : au plus 1 mort par impact planétaire par bot et par 10 min simulées ; dégâts d'impact < 10 % des dégâts reçus ; moins de 5 % du temps à moins de 30 px d'un mur ; aucun `NaN` ;
  - _partie vivante_ : `arena`, `bots: [1, 2]`, joueur passif posé, 3 seeds × 8 min. Au moins 6 `CAPTURED`, au moins un `CAPTURED` ou une destruction de bâtiment par fenêtre de 2 min, et la base du joueur attaquée (tourelle détruite sur la planète 0) dans ≥ 2 seeds sur 3. Bot contre bot (faction 0 hors jeu) : au moins une planète **ennemie** capturée en 10 min ;
  - _déterminisme_ : même seed, `JSON.stringify(world)` identique après 3 600 pas avec 2 bots ;
  - _lecture seule et flux séparé_ : on enregistre les intentions des bots d'une partie A. On les rejoue sans IA (`bots: []`) dans une partie B. Le monde B est identique à A, hors `ai` et `aiRng`. Cela prouve que l'IA n'écrit que des intentions et ne touche pas `world.rng`.
- Durée totale des tests IA visée < 15 s. Les parties longues sont limitées à 3 seeds.

## Justification

1. **Mêmes règles par construction** : le bot ne produit que des intentions discrètes, consommées par le même `applyIntent`. Il passe par `evaluateLanding` et `gravityAt`, sans aucune copie des lois. Le rejeu des intentions sans IA le prouve.
2. **Séparer décision (2 Hz, utilité) et pilote (60 Hz, réflexes)** : la stratégie est simple à régler et à tester sur des mondes construits à la main. La difficulté réelle, voler sous gravité sans frein, est isolée dans des fonctions testables une à une (5.2 et 5.3 avant toute stratégie).
3. **Prédire plutôt que modéliser** : `predictPath` réutilise l'intégrateur exact. Le contrôleur d'atterrissage se réduit alors à « poussée si le contact sans poussée dépasse 25 px/s ». Pas de théorie du contrôle, pas de gain à régler planète par planète.
4. **Opt-in `bots`, état JSON dans `world.ai`, flux `aiRng`** : les tests existants et la cible d'entraînement sont intacts, le monde reste sérialisable et rejouable, et les tirages des tourelles ne bougent pas.
5. **Perception = minimap** : équité lisible (le bot sait ce que le joueur peut savoir), aucune mémoire d'observation à maintenir.

## Alternatives écartées

- **Machine à états seule** : explosion des transitions (mode × cible). **Arbre de comportement** : framework maison pour 7 modes. **GOAP/planification** : disproportionné.
- **Décision à chaque pas** : coût inutile et oscillation. **Pilote toutes les N frames** : rotation sans inertie, le nez oscillerait autour de la cible.
- **IA côté Phaser (par frame)** : non déterministe vis-à-vis du pas fixe et non testable (revue 4.11).
- **Bots activés d'office pour les factions 1 et 2** : une centaine de tests scriptent `ships[1]`.
- **Utiliser `world.rng`** : chaque décision décalerait la dispersion des tourelles et casserait la comparaison avec/sans IA.
- **Lire `world.events`** : file à capacité fixe, vidée par la scène, donc perte silencieuse.
- **Brouillard de guerre / rayon de détection** : le joueur aura la minimap. Ce serait de la mémoire en plus pour un bot plus bête, et non plus équitable.
- **Prédiction analytique (v² = v0² + 2gh)** : fausse dans les chevauchements (ADR 0004) et près des petites planètes. `predictPath` est exacte et coûte peu.
- _*Pathfinding (A*, champ de potentiel)_* : 9 planètes disjointes. Un niveau de contournement plus le réflexe anti-crash suffisent ; on y reviendra si la carte 7.1 crée des couloirs.
- **Filtres génériques sur `nearestPlanet` (prédicat)** : un seul usage, déjà couvert par la boucle de score.
- **Esquive des balles** : coûteuse et quasi parfaite, donc injuste.

## Conséquences

- Nouveaux fichiers : `core/predict.js`, `core/ai/{bot,decide,pilot,touchdown,combat}.js`, `src/data/ai.js`. `world` gagne `ai` et `aiRng`, `planet` gagne `lastHitTick`, `createWorld` gagne l'option `bots`. `world.js` importe seulement `ai/bot.js`. `core/ai/*` importe les requêtes pures (`gravity`, `predict`, `landing.evaluateLanding`, `planet.nearestPlanet`, `building`, `missile.findMissileTarget`, `math`, `rng`) et jamais un module qui modifie le monde.
- Le debug F3 (5.7) affiche le mode et la cible de chaque bot en lisant `world.ai`.
- **Risques** :
  - l'attaque à distance (250 px, hors portée) rend les tourelles faibles face à un tireur patient. C'est vrai aussi pour le joueur. Levier 7.2 : portée et vitesse des balles de tourelle ;
  - les contournements à un seul niveau peuvent échouer dans un amas de planètes. Le réflexe anti-crash et le bannissement évitent le blocage, et la carte 7.1 devra garder des couloirs ;
  - le bot se pose mieux qu'un humain moyen. Levier : `landRadialTarget` plus haut, ou un délai de décollage ;
  - `Math.sin/cos` peuvent différer selon le moteur : le déterminisme n'est garanti que sur une même machine (ADR 0002).
- **Écarts à l'ADR 0002**, à reporter lors d'une révision : (1) §2 et §5 citent « ADR 0004 » pour l'IA, il faut lire **0006** ; (2) §5 : `predict.js` s'ajoute aux modules de système ; (3) §6 : un second flux d'aléa, `world.aiRng`, est réservé à l'IA ; (4) §1 : `world` gagne `ai` et `aiRng`, et `createWorld` gagne l'option `bots`.

## Plan d'implémentation (items 5.2 à 5.8)

| Item    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fichiers                                                                                                                                                                                   | Agents                                                                      | Dépend de                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| **5.2** | **Socle + navigation.** Option `bots`, `world.ai`, `world.aiRng`, `AI_RNG_SALT`, `BOT_PROFILE` complet. `updateAi` branché à l'étape 1 : décision réduite à un but posé par le test, pilote complet de navigation (§4.1 à 4.3). `predictPath`. Extractions §5 : `findMissileTarget`, `hasMissileFactory`, `defenseRange`, `lastHitTick` (toutes posées ici pour éviter les conflits). Tests : unitaires §9 (predict, extractions, steer), scénarios de navigation et de contournement, déterminisme, rejeu lecture seule. | `config.js`, `data/ai.js`, `world.js`, `predict.js`, `ai/bot.js`, `ai/pilot.js`, `missile.js`, `building.js`, `rearm.js`, `planet.js`, `building.js` (`lastHitTick` dans `damageBuilding`) | code (Sonnet, effort **high**), test-s (predict, extractions), test-c (vol) | 4.13 (ADR 0007), s'il est en cours : même `building.js` |
| **5.3** | Contrôleur atterrissage/décollage (§4.4) avec vaisseau virtuel et `evaluateLanding`. Scénarios ≥ 95 % sur 20 seeds × 3 planètes, décollage, remise des gaz.                                                                                                                                                                                                                                                                                                                                                               | `ai/touchdown.js`, `ai/pilot.js`                                                                                                                                                           | code (effort **high**), test-c                                              | 5.2                                                     |
| **5.4** | `decide.js` : scores, hystérésis, bannissement, `CAPTURE`/`IDLE`/`REARM`. Le bot complet capture. Tests : scores sur mondes faits à la main, scénarios de capture.                                                                                                                                                                                                                                                                                                                                                        | `ai/decide.js`, `ai/bot.js`                                                                                                                                                                | code (Sonnet), test-s (scores), test-c (capture)                            | 5.3                                                     |
| **5.5** | `combat.js` : `interceptTime`, biais, tir, ligne de tir par `predictPath`, missiles, esquive. Modes `HUNT` et `ASSAULT` (point d'attente, évitement des tourelles dans `flyTo`). Tests : intercept (unitaires), scénarios d'assaut et de duel.                                                                                                                                                                                                                                                                            | `ai/combat.js`, `ai/decide.js`, `ai/pilot.js`                                                                                                                                              | code (effort **high**), test-s (`interceptTime`, à écrire dès 5.3), test-c  | 5.4                                                     |
| **5.6** | `DEFEND` et `RETREAT`, `underFire`. Tests : défense contre une capture scriptée, repli à santé basse sous tourelles alliées.                                                                                                                                                                                                                                                                                                                                                                                              | `ai/decide.js`, `ai/combat.js`                                                                                                                                                             | code (Sonnet), test-c                                                       | 5.5                                                     |
| **5.7** | `arena` à 3 spawns, `GameScene` avec `bots: [1, 2]`, debug F3 (mode et cible), mise à jour du test « arena : 3 vaisseaux ». Scénarios « partie vivante » et invariants de non-suicide. Réglage de `BOT_PROFILE` en playtest.                                                                                                                                                                                                                                                                                              | `data/maps/arena.js`, `scenes/GameScene.js`, `systems/debugOverlay.js`, `data/ai.js`, `tests/scenarios/combat.test.js`                                                                     | code (Sonnet), test-c                                                       | 5.6                                                     |
| **5.8** | Revue : parité des règles (aucune écriture hors liste §1), perception (§2), allocations, mesure du budget §8, écarts à l'ADR 0002.                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                          | rev (Opus)                                                                  | tout                                                    |

**Ordre** : 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8, car tout passe par `decide.js` et `pilot.js` et les commits sont séquentiels sur `main`. **En parallèle** : les tests unitaires de 5.2 (test-s) pendant le code de navigation. `interceptTime` et ses tests (test-s) peuvent être écrits pendant 5.3, puis commités avec 5.5. Chemin critique : 5.2 → 5.3 (le contrôleur d'atterrissage conditionne toute capture).

## Écarts constatés en 5.6 (DEFEND / RETREAT)

- **Verrou et préemption** : le verrou `minCommit` n'est plus `Infinity` mais `COMMIT_LOCK` (1e6), et un candidat urgent (`RETREAT`, `DEFEND` d'un ennemi posé) reçoit `PREEMPT` (1e9) : il passe devant une option verrouillée. Un `Infinity` ne se départagerait pas.
- **Menace sur une planète** (`defendUrgency`) : `defendUrgent` si un ennemi y est posé, 1 si elle a été touchée depuis `defendMemory`, `defendNearFactor` si un ennemi rôde à moins de `defendRadius` de sa surface. Un ennemi posé ailleurs ne la menace pas.
- **RETREAT** : déclenché à santé < `lowHealth` si `underFire`, ennemi à moins de `retreatThreat`, ou déjà en route (pas de renoncement en vol). L'abri est une planète possédée sans ennemi à moins de `retreatSafe` et non touchée récemment. Posé, le bot reste tant que le bouclier se recharge (sévérité minimale `retreatHold`) ; sans bouclier débloqué, le repli ne dure que le temps de la menace.
- **DEFEND** : avec un attaquant (`bot.attacker`, recalculé à chaque pas), même engagement que `HUNT` ; sans attaquant, atterrissage sur la planète. `giveUpTime` s'applique aussi à `DEFEND`.
- `assaultMinHealth` vaut 30 dans le code (5.5), pas 60 comme dans le tableau ci-dessus ; à revoir en 5.8.

## Revue 5.8 (IA et performance)

- **Parité des règles : conforme.** `core/ai/*` n'écrit que `ships[f].intent` (via `resetIntent`), `world.ai[k]` et `world.aiRng`. Aucun appel à `damageShip`, `spawnProjectile`, `pushEvent`, `update*`, `world.events`, `world.rng` ni `Math.random`. Les seuls modules importés qui touchent au monde sont des requêtes pures (`gravityAt`, `predictPath`, `evaluateLanding`, `nearestPlanet`, `findMissileTarget`, `building`).
- **Perception (§2) : conforme.** L'IA lit l'état (`lastHitTick`, `landedOn`, `captureBy`, PV), jamais la file d'événements.
- **Allocations : aucune.** Les seuls objets sont des scratch au niveau du module (`path`, `best`, `aim`, `virtual`…) ; pas de `map`/`filter`/closure dans les chemins appelés par `step`.
- **Budget (§8) : tenu.** Mesure jetable hors du dépôt, arène à 3 vaisseaux, 2 bots, 10 800 pas (180 s) sur 3 seeds : IA moyenne 0,04 à 0,056 ms par pas (budget 0,15 ms), p99 0,17 à 0,20 ms, max ≈ 1 ms (pics isolés, sans doute chauffe du JIT). Le `step` complet coûte 0,05 à 0,065 ms en moyenne.
- **Ping-pong de captures : modéré.** Sur 8 seeds × 180 s, une planète change de propriétaire 1 à 2 fois en général ; 3 à 5 fois sur quelques petites planètes (seeds 3, 4, 7, 8). Pas de blocage. Dans une des seeds mesurées (1), le bot 2 perd sa base : la fin de partie relève de 6.4.
- **Non traité, reporté à 7.2** (réglage) : `findDetour` ignore la vitesse et les tourelles hors cible ; esquive des balles peu efficace face à un tireur parfait (14 morts sur 20 en 5.5) ; constantes `slotValue`, `enemyCaptureFactor`, `occupiedFactor` à ajouter au tableau §6 ; `assaultMinHealth` (30 en code, 60 dans le tableau) et agressivité des bots à régler en playtest. Ces points n'ont pas été remesurés en 5.8.
