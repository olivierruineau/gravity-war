# 0004 — Zone de gravité dominante (moyenne pondérée dans les chevauchements)

- **Statut** : accepté
- **Date** : 2026-11-23
- **Amende** : ADR 0003 §2 (« Sommation ») et §1 (règle `PLANET_MAX_GRAVITY`). Le reste de l'ADR 0003 est inchangé : formule `a_i(d)` par planète, `g0`, portée `R = 5·r`, intégrateur, atterrissage.

## Contexte

L'ADR 0003 **somme** les champs de toutes les planètes. Retour de playtest : quand une petite planète est dans le champ d'une grosse, le joueur qui se trouve dans le cercle de portée de la petite est surtout attiré par la grosse, et les cercles dessinés ne disent plus « qui tire ». Mesure sur `arena` : la planète 8 (r = 30, R = 150, g0 = 50) est à 350 px de la planète 3 (r = 90, R = 450, g0 = 65). Sur **40 %** de la zone de la 8 (sa moitié extérieure, côté 3), |a₃| > |a₈|. À 3,33·r de la 8, du côté de la 3, la somme tire **vers la grosse** (−3,5 px/s²).

Contraintes : la transition doit être **continue** (pas de saut d'accélération). Avec une seule planète, le comportement doit rester **identique** à l'ADR 0003 (g0 exact à la surface, tests d'orbite et d'énergie valides). `gravityAt` ne doit pas allouer de mémoire. La règle doit être symétrique : deux planètes identiques sont traitées de la même façon.

### Fait nouveau qui écarte la piste « profondeur relative seule »

La piste initiale était `w_i = 1 − d_i/R_i`, `s_i = w_i^p / Σ w_j^p`. Comme `R = 5·r` pour toutes les planètes, toute mesure de profondeur relative (d/R, (d−r)/(R−r), a/g0…) est **invariante d'échelle**. La frontière où les deux planètes pèsent autant vaut donc toujours `d₈/R₈ = d₃/R₃`, **quel que soit p** : c'est un cercle d'Apollonius. Résultat : la 3 garde **31 %** de la zone de la 8 (au lieu de 40 %), et à 3,33·r côté 3 la grosse gagne encore, et même plus fort que la somme (voir tableau). `p` ne fait que durcir la transition, il ne la déplace pas. Pour avantager la planète proche, il faut une grandeur **absolue** : l'altitude au-dessus de la surface.

## Décision

**Dans un chevauchement, la gravité est la moyenne des accélérations ADR 0003 de chaque planète, pondérée par `u_i = w_i / h_i^p`, où `w_i` est la profondeur relative dans la zone (nulle au bord) et `h_i` l'altitude au-dessus de la surface. La surface la plus proche domine en douceur. Sur toute surface, la gravité vaut exactement g0, et avec une seule zone le résultat est bit à bit celui de l'ADR 0003.**

### 1. Formule (`core/gravity.js`, `gravityAt` seule modifiée)

```
pour chaque planète i avec d_i < R_i :
  a_i = mu_i · (1/max(d_i, r_i)² − 1/R_i²), vecteur dirigé vers le centre de i   (ADR 0003, inchangé)
  w_i = 1 − d_i / R_i          profondeur relative dans la zone : 0 au bord, → 1 vers le centre
  h_i = d_i − r_i              altitude au-dessus de la surface (> 0 hors de la planète)
  u_i = w_i / h_i^p            p = GRAVITY_DOMINANCE_POWER = 2

cas, dans l'ordre :
  (a) point dans la planète k (d_k ≤ r_k)  → a = a_k (borné à g0 ; (0, 0) au centre exact d_k = 0)
  (b) une seule zone contient le point      → a = a_i         (bit à bit identique à l'ADR 0003)
  (c) plusieurs zones, Σu > 0               → a = Σ u_i·a_i / Σ u_i   (s_i = u_i/Σu ∈ [0, 1], Σ s_i = 1)
  (d) aucune zone, ou Σu = 0 (arrondi au bord exact) → a = (0, 0)
```

- **Une seule planète** : chemin (b), aucune pondération, donc aucun écart d'arrondi. Le potentiel `U(d)`, les tests de chute, d'orbite, d'énergie sur 100 tours et la continuité en `R` restent valides tels quels.
- **Près de la surface d'une petite planète dans la zone d'une grosse** : `u_petite → ∞` quand `h → 0`, donc `s_petite → 1`. À la surface, a = g0 exactement et radiale (cas (a), limite continue de (c)). Au contact (r + 6), la grosse pèse 0,03 % (planète 8 : 34,08 px/s² contre 34,09 pour la 8 seule).
- **Continuité** : chaque `u_i` est continu. Il tend vers 0 au bord de la zone (`w_i → 0`), donc une planète entre et sort de la moyenne sans saut. Il tend vers +∞ à la surface, donc le passage (c) → (a) est continu. La moyenne est C0 partout, comme la coupure de l'ADR 0003, avec un coude au bord de zone.
- **Hors de toute zone** : (0, 0) exact. L'espace entre les champs reste strictement inertiel.
- Les planètes sont disjointes (validité de carte), donc le cas (a) concerne au plus une planète : il peut faire un `return` immédiat dans la boucle. `h_i ≥ ~1e-14` hors planète, `h_i²` ne s'annule pas et `u_i` reste fini : aucun epsilon n'est nécessaire.

### 2. Valeurs, cas de la planète 8 (côté de la planète 3, le pire)

Composante de a vers le centre de la 8, en px/s² (négatif = tiré vers la 3) :

| Point (distance au centre de la 8)           | Somme (0003) | `w^p` normalisé, p = 4 | **0004 (p = 2)** |
| -------------------------------------------- | ------------ | ---------------------- | ---------------- |
| surface, d = r = 30                          | 47,4         | 49,1                   | **50,0**         |
| contact, d = 36                              | 31,2         | 33,2                   | **34,08**        |
| d = 2,5·r = 75 (8 seule : 6,25)              | 1,71         | 3,36                   | **5,78**         |
| d = 3,33·r = 100                             | −3,46        | −3,99                  | **+0,84**        |
| frontière s₈ = 0,5 sur l'axe                 | ~82          | 87,5                   | **120 (4·r)**    |
| part de la zone de la 8 où la 8 domine (s>½) | ~60 %        | ~69 %                  | **~88 %**        |

À 2,5·r, s₈ = 0,956 côté 3, 0,989 sur le côté, 0,998 à l'opposé : la petite domine nettement. La part disputée restante est un croissant au bord de la zone, côté grosse, où les deux champs sont faibles (< 8 px/s²) : c'est la bande de transition.

Deux planètes identiques (r = 60) dont les centres sont à 150 px, cas du test « posé : insensible » : à la surface de B face à A, la somme donnait 40,5 px/s² et 0004 donne **70**, soit g0.

### 3. Énergie, potentiel et `PLANET_MAX_GRAVITY`

- **Une seule zone** : champ conservatif, inchangé. `potential(planet, d)` reste exact et sert toujours de référence aux tests.
- **Chevauchements** : le champ pondéré n'est **plus un gradient**. Son rotationnel n'est pas nul, il n'existe donc pas de potentiel global, et l'énergie peut varier un peu le long d'une boucle fermée qui traverse un chevauchement. C'est assumé : les chevauchements sont des zones de champ faible, la poussée est illimitée (pas de carburant, donc l'énergie n'est pas une ressource de jeu), et une orbite autour d'une petite planète nichée devient **plus** stable qu'avec la somme (à 2·r de la 8, côté 3, la marée de la grosse passe de ~35 % à ~2 % de a₈). Aucun test d'énergie en multi-planètes. La JSDoc de `potential` le précise.
- **Plafond** : (c) est une combinaison convexe et `|a_i| ≤ g0_i`, donc **|a| ≤ max_i g0_i partout**, pas seulement en surface. À la surface de i, |a| = g0_i exactement. La règle de carte de l'ADR 0003 §1 se réduit donc à « chaque `g0 ≤ PLANET_MAX_GRAVITY` ». Le test sur 16 points de surface de `arena` reste comme test de non-régression (il donne maintenant g0). Attention : il est faux de dire « ≤ la somme ». Quand deux tirages s'opposent, la moyenne peut dépasser la somme. Ce qui est garanti, c'est le plafond par max g0.

### 4. Coût

Une seule passe sur les planètes, sans allocation. Les accumulateurs sont des locales `sumU`, `ax`, `ay`, `count`, plus `lastX`, `lastY` pour le cas (b). Par planète dans sa portée : 1 `sqrt`, ~3 divisions, `h ** p`. Pour 3 vaisseaux × ~12 planètes, plus les projectiles de la phase 3, c'est négligeable. `count` compte les planètes avec `d < R` (et non `u > 0`), pour que le cas (b) soit strictement celui de l'ADR 0003. API inchangée : `gravityAt(out, pos, planets)`, `applyGravity(body, planets, dt)`.

### 5. Constante (`config.js`)

`GRAVITY_DOMINANCE_POWER = 2`. Commentaire : « dans un chevauchement, poids d'une planète ∝ profondeur relative / altitude^p (ADR 0004) ». C'est le levier de playtest : la frontière s₈ = ½ sur l'axe de la planète 8 passe à 3,7·r pour p = 1, 4·r pour p = 2 et 4,15·r pour p = 3. Elle ne dépasse jamais 4,83·r (p → ∞), qui correspond à la frontière d'égale altitude. 2 est la valeur classique de la pondération inverse (Shepard). La monter durcit la transition sans gain de lisibilité notable.

## Justification

1. **La seule grandeur qui départage une petite planète nichée dans une grosse est absolue.** Les profondeurs relatives sont invariantes d'échelle (`R = 5·r`) et laissent un tiers de la zone à la grosse, quel que soit `p` (voir Contexte).
2. **« La surface la plus proche tire »** se lit d'un coup d'œil. C'est la même règle que `nearestPlanet` (aide à l'atterrissage), donc la planète de l'aide est celle qui domine près du sol.
3. **g0 exact sur toute surface**, même en chevauchement : l'atterrissage, le décollage (seuil `acos(g/T)`) et l'IA raisonnent planète par planète, sans correction.
4. **Le facteur `w_i` garde le cercle dessiné comme frontière d'influence** et garantit la continuité. Sans lui, il y aurait un saut en entrant dans une zone, et des zones mortes hors portée de la petite (cas « surface la plus proche » en version dure).
5. **Un paramètre, une passe, zéro allocation, convexité** : le plafond de gravité est garanti par construction, sans règle de carte supplémentaire.

## Alternatives écartées

- **Somme (statu quo de l'ADR 0003)** : 40 % de la zone de la 8 sont tenus par la grosse. C'est le problème constaté.
- **`w_i^p / Σ w^p` avec `w = 1 − d/R`** (piste initiale) : invariance d'échelle, frontière d'Apollonius indépendante de p, 31 % disputés, et pire que la somme à 3,33·r.
- **Sphère d'influence dure, la plus petite zone gagne (patched conics à la KSP)** : discontinue sans bande ajoutée. Avec un ordre par taille, elle casse le cas de deux planètes égales et celui d'une petite zone qui recouvre la surface d'une grosse. Il faudrait des règles supplémentaires.
- **« Le plus fort gagne » (max |a_i|)** : saut de direction, et même frontière que la somme.
- **Surface la plus proche, version dure** : discontinue, et elle crée des zones mortes, puisque la petite « possède » des points hors de sa portée où a₈ = 0.
- **Corriger seulement la carte** (sortir la 8 de la portée de la 3) : traite le symptôme. Avec ~12 planètes à portée 5·r sur 2400×1350, les chevauchements sont inévitables à l'item 7.1. Rien n'empêche de le faire en plus.
- **Réduire `GRAVITY_RANGE_FACTOR`** : change toutes les sensations validées en phase 2 pour un problème local.

## Conséquences

- `gravityAt` change de sémantique dans les chevauchements uniquement. `applyGravity`, `updateLanded`, l'IA (5.x) et les projectiles (3.1) en héritent sans modification.
- Tests à réécrire (ils vérifiaient la somme, maintenant fausse par conception) : unitaires `gravity.test.js` « alignées du même côté : somme » et « perpendiculaires : somme vectorielle », scénario `gravity.test.js` « planètes inégales : somme des individuelles ». Les tests symétriques restent vrais **bit à bit** (poids égaux, contributions opposées).
- **Risques** : le gradient de a est plus fort entre deux surfaces très proches, car la domination bascule sur la largeur de l'écart. Il reste borné, et la marge de carte de 2·`SHIP_COLLISION_RADIUS` rend ce cas rare. Une petite non-conservation de l'énergie existe dans les chevauchements (§3). Un projectile qui traverse une planète ne sent que cette planète (cas (a)).
- **Rendu, flèche de gravité** (debug ou HUD) : elle appelle `gravityAt(scratch, ship.pos, world.planets)` avec un scratch de module, sans réimplémenter la loi. Elle reflète donc automatiquement la domination. Longueur ∝ |a| / `PLANET_MAX_GRAVITY` (|a| ≤ max g0 ≤ plafond, §3), masquée quand |a| = 0 (espace inertiel). On n'expose pas `s_i` ni la « planète dominante » tant qu'aucun second usage ne le demande (par exemple surligner le cercle dominant).

## Plan d'implémentation

1. **Code**, **Sonnet** (`coder`, effort `high` car c'est de la physique). Ajouter `GRAVITY_DOMINANCE_POWER = 2` dans `config.js`. Réécrire `gravityAt` selon §1 et §4 (une passe, cas (a) à (d), `return` immédiat dans une planète). Mettre à jour l'en-tête de `gravity.js`, la JSDoc de `potential` (« exact là où une seule zone agit ») et le commentaire de `planet.js`. Réécrire les 3 tests « somme » en tests de combinaison convexe : `a` sur le segment `[a_A, a_B]`, |a| ≤ max(|a_A|, |a_B|). `npm run check` vert, tous les autres tests inchangés.
2. **Tests unitaires**, **Haiku** (`test-writer-simple`), `tests/unit/gravity.test.js`, planètes en ligne P3 = (1200, 400, r 90, g0 65) et P8 = (1200, 750, r 30, g0 50) :
   - identité bit à bit : avec deux planètes, un point dans une seule zone donne `toEqual` le résultat à une planète ;
   - surface de P8 face à P3 : |a| = 50 à 1e-9, radiale ; contact (1200, 714) : écart relatif à a₈ seule < 1e-3 ;
   - d = 2,5·r, point (1200, 675) : `|a.x| < 1e-12`, `5,5 < a.y < 6,25` (8 seule : 6,25 ; somme : 1,71) ; à (1200, 650) : `a.y > 0` ;
   - à l'intérieur de P8 : a = a₈ bornée à g0 ; centre exact : (0, 0) ; hors de toute zone : (0, 0) exact ; `out` retourné et écrasé ;
   - |a| ≤ max g0 sur une grille de 10 px couvrant l'union des deux zones.
3. **Tests de scénario et numériques**, **Sonnet** (`test-writer-complex`), `tests/scenarios/gravity.test.js` :
   - _continuité_ : segments qui traversent la frontière de portée de P8, celle de P3 et la surface de P8 (axe x = 1200 de y = 740, dans P8 sans passer par son centre où la direction s'inverse déjà dans l'ADR 0003, jusqu'à y = 490, surface de P3 ; plus une transversale y = 700 de x = 800 à 1600), pas de 0,05 px, |Δa| < 0,5 px/s² entre deux échantillons consécutifs (gradient max attendu ≈ 3,5 px/s²/px) ;
   - _domination_ : sur une grille de 5 px de la couronne r < d₈ < R de P8, la part des points où |a − a₈| < |a − a₃| (équivalent à s₈ > ½, via l'API publique) est **≥ 80 %** (attendu ~88 % ; somme ~60 %) ;
   - _orbite nichée_ : orbite circulaire à d = 2·r autour de P8 (v_circ lue via `gravityAt` avec P8 seule) dans le monde P3 + P8 : rayon à ±10 % sur 10 tours, sans contact. Le testeur mesure l'écart réel et garde une marge ×2 ; perturbation attendue ≤ 2 % de a₈, contre 35 % avec la somme ;
   - remplacer le scénario « planètes inégales : somme » par « un pas : vitesse sur le segment [v_A, v_B] ». Les scénarios de chute, d'orbite, d'énergie et d'espace inertiel doivent passer **inchangés**.
4. **Revue**, **Opus** (`reviewer`), courte, parce que la physique est touchée : absence d'allocation, cas (b) bit à bit, garde Σu = 0, ordre des cas.
5. **Docs**, **Haiku** (`doc-writer`) : item dans `TODO.md` (phase 2, « 2.8 Zone de gravité dominante, ADR 0004 »), coché avec le commit `feat:` du code.
