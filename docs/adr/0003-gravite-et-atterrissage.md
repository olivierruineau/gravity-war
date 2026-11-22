# 0003 — Gravité, collision et atterrissage

- **Statut** : accepté
- **Date** : 2026-11-23

## Contexte

Phase 2 : des planètes **fixes** (cercles, rayon ~30–90 px) attirent le vaisseau sur une carte 2400×1350. Contraintes chiffrées : poussée `SHIP_THRUST = 140 px/s²` (illimitée), rotation 3,2 rad/s, pas fixe 1/60 s, Euler semi-implicite (ADR 0002 §7). Il faut pouvoir **décoller de n'importe quelle planète**, sentir la gravité (orbites, assistance, chute) **sans** que l'espace entre les planètes devienne une soupe de petites forces qui empêche de traverser la carte. L'atterrissage (SPEC §3) dépend de la vitesse radiale et de l'angle du nez ; un impact au-delà des seuils fait des dégâts proportionnels. Les bots (phase 5) utiliseront exactement les mêmes règles et les mêmes mesures.

## Décision

**Chaque planète est réglée par sa gravité de surface `g0` ; elle attire en 1/d² avec une portée finie `R = 5·r` (force décalée qui s'annule continûment en `R`, bornée à `g0` sous la surface), sommée sur toutes les planètes et intégrée en Euler semi-implicite. Le contact vaisseau/planète est soit un atterrissage (3 seuils), soit un impact qui fait des dégâts proportionnels à l'excès de vitesse et provoque un rebond garanti ; un vaisseau posé est figé hors gravité et décolle dès que sa poussée a une composante sortante.**

### 1. Modèle de planète et données de carte

- Carte (`src/data/maps/*.js`) : `planets: [{ x, y, radius, gravity? }]`, `gravity` = **gravité de surface `g0` en px/s²** (défaut `PLANET_GRAVITY`). C'est la grandeur que le level-designer comprend : « à la surface, ça tire à 70, la poussée vaut 140 ».
- `createWorld` appelle `createPlanet(def)` (`core/planet.js`) pour chaque entrée et stocke : `{ pos: { x, y }, radius, owner: NEUTRAL, mu, range }`, avec `NEUTRAL = -1` exporté par `planet.js`. `mu` et `range` sont **dérivés une fois** au chargement (aucun calcul répété dans `step`) :
  `range = GRAVITY_RANGE_FACTOR · r` · `mu = g0 · r² · k² / (k² − 1)` (k = `GRAVITY_RANGE_FACTOR`), ce qui rend la gravité **exactement `g0` à la surface** malgré le décalage ci-dessous.
- Validité d'une carte (testée sur les données, pas à l'exécution) : planètes dans la carte, pas de chevauchement, spawns hors planètes, et **gravité totale en tout point de surface ≤ `PLANET_MAX_GRAVITY = 0,6 · SHIP_THRUST` (84)** : le décollage reste toujours possible avec au moins 56 px/s² nets, chevauchements de champs compris.

### 2. Formule de gravité (`core/gravity.js`)

```
a(d) = mu · (1 / max(d, r)²  −  1 / R²)   si d < R,   0 sinon      (dirigée vers le centre)
U(d) = −mu/d − mu·d/R² + 2·mu/R            pour r ≤ d < R, 0 au-delà (potentiel, pour les tests)
v_circ(d) = sqrt(d · a(d))
```

- **1/d² décalé plutôt que softening** : le vaisseau entre en collision à `r + 6`, donc la singularité est inaccessible ; un softening de Plummer ne ferait que fausser `g0`. Le `max(d, r)` suffit à garantir `|a| ≤ g0` et l'absence de NaN si un corps traverse (pas de collision en 2.1, projectiles futurs) ; `d = 0` est sauté explicitement.
- **Portée finie à coupure douce** : le terme `−mu/R²` annule la force continûment en `R` (pas de saut d'accélération, potentiel continu donc énergie conservée). Entre les champs, l'espace est **strictement inertiel** : le « pas de frein » reste lisible, les bots (5.2) naviguent en ligne droite hors champ, et les mini-cartes de test ne se perturbent pas. Coût négligeable de toute façon (3 vaisseaux × ~12 planètes).
- **k = 5** : à 2·r la gravité vaut ~0,22·g0, à 3·r ~0,07·g0 ; un survol rapproché à 100–150 px/s dévie de 15–30°, l'assistance gravitationnelle existe sans piéger. Les orbites précessent légèrement (loi non képlérienne) : assumé, et les tests ne vérifient pas la fermeture d'orbites excentriques.
- **Sommation** sur toutes les planètes, appliquée en accélération `v += a·dt` évaluée à la position **avant** intégration (étape 3 de l'ADR 0002 §5), juste après la poussée et juste avant `pos += v·dt`. API : `gravityAt(out, pos, planets)` (réutilisable par les projectiles en 3.1 et par l'IA pour prédire) et `applyGravity(body, planets, dt)` (vecteur scratch local au module).
- Ordres de grandeur (r = 60, g0 = 70) : chute libre depuis le bord du champ → 75 px/s à la surface (il faut freiner) ; vitesse de libération depuis la surface 75 px/s. Petite planète (30, 70) : 53 px/s, presque posable sans freiner. Grosse (90, 84) : 100 px/s.

### 3. Intégrateur

**Euler semi-implicite confirmé** : symplectique (pas de dérive d'énergie), une seule évaluation de gravité, compatible avec les impulsions (poussée, rebond, atterrissage). Le cas le plus raide (orbite rasante, r = 30, g0 = 84) donne ω·dt ≈ 0,03, très loin de la limite de stabilité (2) ; l'erreur d'énergie oscille en O(ω·dt), soit < 1 %. Leapfrog/Verlet n'apporterait qu'un ordre de précision invisible à l'écran.

### 4. Collision et atterrissage (`core/landing.js`)

Le vaisseau est un disque de rayon `SHIP_COLLISION_RADIUS = 6` (≈ recul de la base du triangle). Pour une planète : `n` = normale sortante unitaire `(pos − centre)/d`, `t = (−n.y, n.x)`.
**Vitesse d'approche** `vIn = −dot(vel, n)` (> 0 = vers le centre), **vitesse tangentielle** `vT = dot(vel, t)`, **erreur d'angle** `|wrapAngle(angle − atan2(n.y, n.x))|`.

- `evaluateLanding(ship, planet, out)` écrit `{ approachSpeed, tangentialSpeed, angleError, ok }` dans un objet fourni par l'appelant (aucune allocation). **Seule source de vérité des seuils**, utilisée par la collision, l'aide visuelle (2.6) et l'IA (5.3).
- **Contact** si `d < r + SHIP_COLLISION_RADIUS`. On reprojette toujours la position à `d = r + 6`. Si `vIn ≤ 0` (déjà en train de sortir), rien d'autre. Premier contact trouvé = traité, puis on sort de la boucle (planètes disjointes).
- **Atterrissage réussi** si `vIn ≤ LANDING_MAX_RADIAL_SPEED (45 px/s)` **et** `|vT| ≤ LANDING_MAX_TANGENTIAL_SPEED (35 px/s)` **et** `angleError ≤ LANDING_MAX_ANGLE (25°)` : `landedOn = index`, `vel = 0`, l'angle du nez est conservé, événement `EVT.LANDED` (x, y = position, a = ship, b = planète).
- **Sinon, impact** : `damage = IMPACT_DAMAGE_PER_SPEED (1 PV par px/s) × (max(0, vIn − 45) + max(0, |vT| − 35))` ; un échec dû au seul angle fait 0 dégât (le rebond est la sanction). `hp −= damage` ; à `hp ≤ 0` : `hp = 0`, `alive = false`, `landedOn = -1`, `EVT.EXPLOSION (a = ship)`. Avec 100 PV, un impact radial à 90 px/s coûte 45 PV, la mort arrive vers 145 px/s.
- **Réponse à l'impact : rebond garanti**, jamais d'arrêt : composante radiale sortante = `max(IMPACT_RESTITUTION (0,3) · vIn, IMPACT_MIN_BOUNCE_SPEED (30 px/s))`, composante tangentielle × `IMPACT_TANGENTIAL_DAMPING (0,5)`. Le rebond minimal (≈ 6 px de saut, ~0,9 s) supprime tout contact au repos et toute micro-vibration, et laisse le temps de corriger l'angle : les sauts convergent vers un atterrissage. `EVT.IMPACT (x, y = point de surface, a = ship, b = damage)`, émis même à 0 dégât (son « clonk »).
- **Vaisseau posé** (`landedOn ≥ 0`) : `applyIntent` s'exécute (rotation autorisée, poussée ajoutée à `vel = 0`), puis `updateLanded` : si `dot(vel, n) > 0` (la poussée a une composante sortante) → **décollage** : `landedOn = -1`, la vitesse acquise est conservée et le vaisseau entre dans le pas normal ; sinon `vel = 0` et le vaisseau **saute gravité, intégration, bornes et collision**. Pas de « recollage » : poussée à < ~50° de la normale, l'accélération sortante dépasse toute gravité de surface autorisée ; au-delà, le vaisseau retombe en douceur et fait un petit saut sans dégât. `LANDED` n'est jamais réémis tant qu'il reste posé.
- **Éjection** : toute sortie de l'état posé passe par `landedOn = -1` (décollage, mort ; knockback éventuel futur). La capture (4.2) n'a qu'à observer `landedOn` à chaque pas : aucun événement dédié.
- **Ordre dans `step`, par vaisseau vivant** : (2) `applyIntent` → (2b) si posé : `updateLanded`, et `continue` s'il reste posé → (3) `applyGravity` puis `integrate` → (4) `applyBounds` → (5) `collideShipPlanets`. La boucle par vaisseau équivaut à l'ordre global de l'ADR 0002 §5 tant que les vaisseaux n'interagissent pas ; les collisions projectiles (phase 3) seront une boucle séparée à l'étape (5).
- **Pas de détection continue** : traverser une planète de 30 px en un pas exigerait > 4000 px/s, inatteignable.

### 5. Tests

- **Unitaires** (`gravity`, `planet`, `landing`) : `|a(r)| = g0` exactement (à 1e-9) ; `a(R) = 0` et `a = 0` au-delà ; continuité en `R` (`a(R − ε) → 0`) ; direction vers le centre ; superposition de deux planètes ; `max(d, r)` sous la surface et pas de NaN au centre ; `evaluateLanding` aux bornes exactes (45 / 45,001 px/s, 35 / 35,001, 25° ± 0,01°) ; formule de dégâts (somme des excès, 0 si seul l'angle échoue) ; rebond (radiale ≥ 30 sortante, tangentielle × 0,5).
- **Scénarios** (mini-cartes en ligne, une planète r = 60, g0 = 70, loin des murs) :
  - _chute_ : depuis le repos à 3·r, `d` décroît strictement ; vitesse d'impact = `sqrt(2·(U(d0) − U(r+6)))` à 2 % ; temps de chute à `dt = 1/60` et `dt = 1/240` à 2 % l'un de l'autre (convergence) ;
  - _orbite circulaire_ à `d = 2·r` avec `v_circ` : rayon dans ±1 % sur 10 tours ; énergie `½v² + U` dans ±1 % sur **100 tours** (pas de dérive, preuve du caractère symplectique) ; orbite rasante (r = 30, g0 = 84, d = r + 10) : rayon ±3 % sur 10 tours ;
  - _atterrissage vs crash_ avec marge (le pas ajoute g·dt ≈ 1,2 px/s) : 40 px/s → posé + `LANDED` ; 50 px/s → impact, dégâts entre 5 et 8, rebond ; nez à 20° → posé, à 30° → impact 0 dégât puis, nez corrigé, posé après les sauts ; 150 px/s → mort + `EXPLOSION` ;
  - _posé_ : 600 pas sans intention → position/vitesse identiques à l'octet, aucun événement ; rotation → position inchangée ; poussée vers le sol → reste posé ; poussée dans la normale → `d` croît strictement et dépasse `R` en < 4 s ;
  - _déterminisme_ : `JSON.stringify` identique après un vol scripté autour de planètes ; données de `arena` valides (§1).

## Alternatives écartées

- **Masse `m` + constante G** : deux nombres sans signification pour le level-designer ; `g0` se compare directement à la poussée.
- **1/d² pur à portée infinie** : la somme des queues de ~12 planètes crée une dérive partout, l'espace n'est jamais inertiel, bots et tests plus durs.
- **Softening de Plummer `1/(d² + ε²)`** : traite une singularité inatteignable et fausse la gravité de surface.
- **Coupure franche ou fondu linéaire entre deux rayons** : saut d'accélération, ou un paramètre de plus pour le même effet.
- **Leapfrog / Verlet, RK4** : gain invisible au pas 1/60 ; RK4 n'est pas symplectique (dérive d'énergie) et coûte 4 évaluations.
- **Arrêt sur impact dur / rebond purement proportionnel** : contact au repos ambigu et micro-rebonds infinis, sources de vibrations et d'événements en rafale.
- **Recaler le nez sur la normale à l'atterrissage, ou état « aide » stocké dans `world`** : inutile ; `evaluateLanding` se recalcule à la demande.

## Conséquences

- Nouvelles constantes dans `config.js` : `PLANET_GRAVITY = 70`, `PLANET_MAX_GRAVITY = 0.6 * SHIP_THRUST`, `GRAVITY_RANGE_FACTOR = 5`, `SHIP_COLLISION_RADIUS = 6`, `LANDING_MAX_RADIAL_SPEED = 45`, `LANDING_MAX_TANGENTIAL_SPEED = 35`, `LANDING_MAX_ANGLE = (25 * Math.PI) / 180`, `IMPACT_DAMAGE_PER_SPEED = 1`, `IMPACT_RESTITUTION = 0.3`, `IMPACT_MIN_BOUNCE_SPEED = 30`, `IMPACT_TANGENTIAL_DAMPING = 0.5`, `LANDING_AID_ALTITUDE = 120`. Toutes réglables en 7.2.
- **Risques à surveiller en playtest** : gravité peu sensible au-delà de ~150 px/s (levier : `g0` plus haut, `k` = 6) ; un frôlement rapide tue (excès tangentiel, assumé façon Lunar Lander/Gravitar) ; décoller très en biais produit des sauts.
- Pas de mort → respawn avant l'item 3.3 : un crash mortel fige la partie (recharger la page en attendant).

### Écarts à l'ADR 0002 (à reporter lors d'une révision, l'ADR 0002 n'est pas modifié ici)

1. §5 fichiers : le contact vaisseau/planète vit dans **`landing.js`** (au lieu de `collision.js`) ; `collision.js` reste réservé aux projectiles (3.1) si besoin.
2. §1 formes : `planet = { pos, radius, owner, mu, range }` (bâtiments ajoutés en phase 4) ; `ship.landedOn = -1` créé par `createShip`.
3. `createWorld(map, …)` : le type de `map` gagne `planets: { x, y, radius, gravity? }[]`.
4. §5 ordre du pas : étape (2b) « maintien/décollage des vaisseaux posés » ; un vaisseau posé saute (3), (4), (5).
5. §4 événements : charges utiles fixées — `LANDED (a = ship, b = planète)`, `IMPACT (a = ship, b = dégâts)`, `EXPLOSION (a = ship)` ; aucun nouveau type.
6. §4 pont : la couche Phaser peut **appeler** des fonctions pures de lecture de `core/` (`evaluateLanding`, `nearestPlanet`) avec ses propres objets scratch, sans écrire dans `world`.

## Plan d'implémentation (items 2.1 à 2.6)

1. **2.1** — code **Sonnet**, tests unitaires **Haiku** (test-s), scénarios **Sonnet** (test-c). Constantes gravité dans `config.js` ; `core/planet.js` (`NEUTRAL`, `createPlanet({ x, y, radius, gravity })` → `mu`, `range`) ; `core/gravity.js` (`gravityAt`, `applyGravity`) ; `createWorld` remplit `planets` ; `step` appelle `applyGravity` avant `integrate`. Tests : unitaires §5 (gravité) ; scénarios chute, convergence, orbites, énergie, déterminisme. Les tests de vol existants (`planets: []`) doivent passer inchangés.
2. **2.2** — code **Sonnet**, test **Haiku**. `src/data/maps/arena.js` : 8 à 10 planètes (r 30–90, `gravity` 50–84), spawn joueur dégagé ; `entities/planetView.js` : `drawPlanet(g, planet, color)` (cercle, blanc = `NEUTRAL`) + cercle de portée très discret (`PALETTE.border`) pour lire les zones de gravité. Test de validité de `arena` (§1 : dans la carte, disjointes avec marge `2·SHIP_COLLISION_RADIUS`, spawns hors planètes, gravité totale ≤ `PLANET_MAX_GRAVITY` en 16 points de chaque surface).
3. **2.3** — code **Sonnet**, tests **Sonnet** (test-c) + unitaires **Haiku**. `createShip` ajoute `landedOn: -1` ; `core/landing.js` : `evaluateLanding`, `impactDamage(approach, tangential)`, `collideShipPlanets(world, shipIndex)` (reprojection, atterrissage, rebond, événements) ; le vaisseau posé est figé dans `step` (le décollage vient en 2.5). Dégâts calculés et portés par `IMPACT.b`, pas encore appliqués. Tests : bornes de `evaluateLanding`, rebond, scénarios atterrissage/crash §5.
4. **2.4** — code **Sonnet**, tests **Haiku** (test-s). Application des dégâts dans `collideShipPlanets` (`hp`, mort, `EXPLOSION`, `landedOn = -1`) ; barre de vie minimale `systems/healthBar.js` (fixe à l'écran, `PALETTE.ok`/`danger`). Tests : formule, plancher à 0, mort et événement unique.
5. **2.5** — code **Sonnet**, tests **Sonnet** (test-c). `updateLanded(ship, planets)` dans `landing.js` (décollage si `dot(vel, n) > 0`, sinon `vel = 0`) branché en (2b). Scénarios « posé » §5, plus décollage en biais à 70° (sauts sans dégâts, état fini) et absence de `LANDED` en rafale.
6. **2.6** — code **Sonnet**. `nearestPlanet(planets, pos)` dans `planet.js` (pur, réutilisé par l'IA) + test **Haiku** ; `systems/landingAid.js` : si le joueur est en vol à moins de `LANDING_AID_ALTITUDE` de la surface de la planète la plus proche, `evaluateLanding` dans un objet scratch, petite jauge de vitesse d'approche + trait d'orientation du nez, vert si `ok`, rouge sinon. Vérification manuelle (`npm run dev`).

Revue Opus (2.7) prévue en fin de phase : vérifier l'ordre du pas, l'absence d'allocation et le respect des écarts listés ci-dessus.
