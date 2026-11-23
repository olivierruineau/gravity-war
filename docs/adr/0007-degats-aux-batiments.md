# 0007 — Dégâts aux bâtiments des planètes

- **Statut** : accepté
- **Date** : 2026-11-23
- **Amende** : ADR 0005 §3 (forme du catalogue, PV posés à la construction), §4 (`damageTurret`, `TURRET_DESTROYED`). §2 (capture) inchangé.

## Contexte

Demande de playtest (TODO 4.13) : « tirer sur une planète habitée doit réduire les défenses PUIS les bâtiments ». Aujourd'hui (ADR 0005 §4), seul le premier slot tourelle construit encaisse. L'usine et le générateur n'ont pas de PV : une fois les tourelles tombées, les tirs sur la planète ne font plus rien. Le fait nouveau est que **tous** les bâtiments ont désormais des PV. Le choix de les ranger dans le bloc `turret` ne tient donc plus. Contraintes inchangées : `world` en JSON pur, slots préalloués, aucune allocation, un seul écrivain par donnée.

## Décision

**Tout projectile ennemi absorbé par une planète possédée inflige ses dégâts à un seul slot construit : d'abord la première tourelle dans l'ordre du catalogue, sinon le premier bâtiment construit dans l'ordre du catalogue. Un bâtiment détruit redevient « non construit », remet le chantier à zéro et émet `BUILDING_DESTROYED`. La reconstruction, la capture et les capacités de faction ne changent pas de règle.**

### 1. PV et forme des données

- `hp` (PV max) monte **au niveau de l'entrée du catalogue**, pour tous les bâtiments, et sort du bloc `turret`. Ce bloc ne garde que les paramètres de tir. Une seule source pour les PV max, lue par `createPlanet`, `updateBuildings`, la fonction de dégâts et le rendu.
- Le slot garde sa forme `{ built, hp, cooldown }`. Un slot construit a `hp = BUILDINGS[s].hp`, quel que soit son type (avant : 0 pour l'usine et le générateur).

| Slot | `id`              | `hp` | Balles de 12 / missiles de 40 | Changement         |
| ---- | ----------------- | ---- | ----------------------------- | ------------------ |
| 0    | `turret`          | 80   | 7 / 2                         | inchangé (déplacé) |
| 1    | `missileFactory`  | 100  | 9 / 3                         | nouveau            |
| 2    | `shieldGenerator` | 100  | 9 / 3                         | nouveau            |
| 3    | `heavyTurret`     | 160  | 14 / 4                        | inchangé (déplacé) |

Les PV des tourelles restent ceux de l'ADR 0005 : les temps pour les abattre ont été validés par les tests. L'usine et le générateur sont un peu plus solides que la tourelle de base, parce que les raser prive **toute la faction** d'une capacité.

### 2. Ordre des dégâts

- `damageBuilding(world, planetIndex, damage, x, y)` remplace `damageTurret`, dans `core/building.js`, qui possède les slots. Une première passe sur le catalogue cherche le premier slot **tourelle** construit (la base, puis la lourde). S'il n'y en a pas, une seconde passe cherche le premier slot construit (l'usine, puis le générateur). Pas de champ de priorité dans les données : l'ordre du catalogue suffit, et l'ordre de destruction des bâtiments économiques suit l'ordre de reconstruction (§3).
- **Un projectile = un coup = un slot.** L'excédent est perdu, sans report sur le slot suivant. Pas de régénération des PV d'un bâtiment endommagé en v1.
- L'appel dans `collideProjectilesPlanets` est inchangé : planète possédée, `owner` du projectile différent de celui de la planète. Rien à faire si aucun slot n'est construit.

### 3. Destruction et reconstruction

- À 0 PV : `built = false`, `hp = 0`, `cooldown = 0`, `planet.buildProgress = 0`, puis `BUILDING_DESTROYED (x, y = impact, a = planète, b = slot)`. C'est la règle de l'ADR 0005 §4, étendue à tous les slots.
- **Perte de capacité** : rien à coder. `updateFactions` recalcule `hasMissiles` et `hasShield` à la fin du même pas. La faction ne perd la capacité que si c'était sa dernière usine ou son dernier générateur. Le stock et le bouclier restants sont conservés, mais inutilisables ou non rechargés (ADR 0005 §1). Le réarmement lit directement le slot de la planète et s'arrête tout de suite. Le bouclier peut se recharger pendant un pas de plus, ce qui est négligeable.
- **Reconstruction inchangée** : le chantier reste le premier slot non construit. Une non-tourelle ne peut être détruite que s'il n'y a plus aucune tourelle construite, donc la base (slot 0) est forcément la première reconstruite, puis l'usine, le générateur et la lourde. L'ordre fixe du catalogue est respecté sans cas particulier. Chaque destruction remet le chantier à zéro : un raid soutenu gèle le développement, et c'est voulu.

### 4. Capture

Inchangée : seules les tourelles bloquent la capture (`hasDefenses`). L'usine et le générateur ne la bloquent pas, et la capture remet de toute façon tout à zéro. Raser les bâtiments économiques est donc un **raid** (priver l'ennemi de missiles ou de bouclier sans tenir la planète), pas une étape de la capture.

### 5. Feedback

- **Événement** : `TURRET_DESTROYED` est **renommé** `BUILDING_DESTROYED`, avec le même numéro (11) et la même charge utile. On n'ajoute pas de second événement pour le même fait. Un consommateur qui veut distinguer les tourelles lit `BUILDINGS[b].turret`.
- **Pas de `BUILDING_HIT`** : `BULLET_HIT` donne déjà le flash et le son d'impact, et les PV restants se lisent dans l'état (ADR 0002 §4). À ajouter seulement si le playtest réclame un son « touché » distinct.
- **Rendu** (`planetView.js`) : l'alpha proportionnel aux PV s'applique à **tous** les slots construits (`MIN_TURRET_ALPHA` devient `MIN_BUILDING_ALPHA`, et la formule utilise `BUILDINGS[s].hp`). La destruction garde la `MEDIUM_EXPLOSION` au point d'impact (`effects.js`). Son : `turretDestroyed` est renommé `buildingDestroyed`, avec le même son.

### 6. Équilibrage et IA

- Raser une planète complète demande 80 + 160 + 100 + 100 = 440 PV, soit 39 balles (environ 7 s de tir continu à 100 % de réussite) ou 12 missiles. Les 21 premières balles partent sous le feu des tourelles, et les 18 suivantes sans riposte. La planète met ensuite au moins 50 s pour retrouver ses missiles (tourelle 20 s, puis usine 30 s) et 90 s pour son bouclier. Une capture reste plus rapide qu'un rasage (tourelles, puis 3 s posé). Les leviers de réglage (7.2) sont `hp` dans le catalogue et la régénération, à ne pas ajouter avant d'avoir vu le jeu. Si 4.12 change `BULLET_DAMAGE`, il faut recompter les balles du tableau.
- **IA** (ADR 0006, qui décide) : l'état exposé suffit, avec `buildings[s].built` et `hp` comparés à `BUILDINGS[s].hp`. Pour capturer, un bot n'a besoin d'abattre que les tourelles, puis il doit se poser au lieu de continuer à tirer. Raser l'usine ou le générateur n'a d'intérêt que contre la **dernière** usine ou le dernier générateur d'une faction (lecture de `factions[f]` et des slots). Si l'ADR 0006 a besoin de savoir qu'une planète est attaquée, le champ réservé est `planet.lastHitTick` (−1 au départ), écrit uniquement par `damageBuilding`. Il sera ajouté par l'item qui l'utilise, pas avant.

## Alternatives écartées

- **Le dernier bâtiment construit encaisse d'abord** : avec un ordre fixe, cela revient à l'ordre inverse du catalogue. Il faudrait alors détruire la lourde avant la base, ce qui contredit l'ADR 0005, et l'ordre de destruction ne correspondrait plus à l'ordre de reconstruction.
- **Le plus précieux d'abord** (générateur, ou un champ `priority`) : une donnée et un réglage de plus sans demande, et une règle moins lisible pour le joueur que « défenses, puis le reste dans l'ordre ».
- **Dégâts répartis sur tous les slots, ou report de l'excédent** : plus de calcul pour un résultat moins lisible. On perd « un tir = un bâtiment visé ».
- **Garder `turret.hp` et ajouter `hp` aux seules non-tourelles** : deux endroits pour la même notion, et des `?.` partout.
- **Garder `TURRET_DESTROYED` et ajouter `BUILDING_DESTROYED`** : deux événements pour un même fait. Le renommage est mécanique.
- **L'usine et le générateur bloquent la capture** : la capture deviendrait une corvée de rasage, alors qu'elle remet tout à zéro de toute façon.

## Conséquences

- `damageTurret` quitte `turret.js` (qui ne garde que le tir) et devient `damageBuilding` dans `building.js`. `collision.js` change d'import.
- Les balles encore en vol après la chute de la dernière tourelle abîment désormais l'usine. C'est voulu, et cela ne casse pas les scénarios existants (100 PV, 1 à 2 balles en vol).
- Pas de régénération : les balles perdues d'un combat près d'une planète ennemie usent ses bâtiments pour de bon (même risque que celui assumé par l'ADR 0005 pour les tourelles).
- **Tests impactés**, à adapter dans le même commit :
  - `unit/buildings-data` : `TURRET_KEYS` sans `hp`, blocs `turret` sans `hp`, nouveaux `hp` au niveau du bâtiment.
  - `unit/planet` (l. 287-289, usine avec PV), `unit/building` (l. 180-183, PV de l'usine et du générateur) et `scenarios/buildings` (l. 105-108).
  - `.turret.hp` devient `.hp` dans `unit/turret`, `unit/collision-turret`, `unit/capture`, `scenarios/turret` (y compris l'invariant de la l. 410, sinon il échoue), `scenarios/capture` et `scenarios/capture-enemy`.
  - Le renommage `EVT.TURRET_DESTROYED` → `BUILDING_DESTROYED` touche `unit/turret`, `unit/collision-turret`, `scenarios/turret` et `scenarios/capture-enemy`.
  - Le cas `unit/turret` « les bâtiments non tourelles ne sont jamais ciblés » (l. 511) **s'inverse**.
  - Les tests de `damageTurret` déménagent dans `unit/building`.
- À reporter dans l'ADR 0005 lors d'une révision : §4 « Dégâts subis » amendé par 0007.

## Plan d'implémentation (item 4.13, un commit)

- **A — Données, cœur et renommages** (coder **Sonnet**, effort medium) :
  - `hp` au niveau de l'entrée du catalogue (§1) ; `createPlanet` et `updateBuildings` posent `BUILDINGS[s].hp`.
  - `damageBuilding` (§2-3) remplace `damageTurret`.
  - `EVT.BUILDING_DESTROYED`, avec ses consommateurs (`effects.js`, `audioEvents.js`, son `buildingDestroyed` dans `sfx.js`), pour que le build reste vert.
  - Adaptation mécanique des tests existants listés plus haut.
  - Fichiers : `data/buildings.js`, `core/planet.js`, `core/building.js`, `core/turret.js`, `core/collision.js`, `core/events.js`, `systems/effects.js`, `systems/audioEvents.js`, `audio/sfx.js`, tests.
- **B — Rendu** (coder **Haiku**, après A) : alpha selon les PV pour tous les slots construits (`MIN_BUILDING_ALPHA`), dans `entities/planetView.js`. Vérification manuelle (`npm run dev`).
- **C — Nouveaux tests** (test-writer-complex **Sonnet**, après A), dans `tests/unit/building.test.js` et un nouveau `tests/scenarios/raid.test.js` :
  - ordre des dégâts : base → lourde → usine → générateur ;
  - un coup touche un seul slot, l'excédent est perdu ;
  - destruction d'une non-tourelle : `built`, `hp`, chantier remis à zéro, événement avec `b = slot` ;
  - perte de `hasMissiles`/`hasShield` dans le même pas si c'était la dernière usine ou le dernier générateur, capacité conservée si une autre planète l'a ;
  - reconstruction dans l'ordre 0 → 1 → 2 → 3 après un rasage ;
  - capture non bloquée par l'usine ou le générateur ;
  - scénario de rasage complet (39 balles, 12 missiles) ;
  - déterminisme.
- **D — Clôture** (doc-writer **Haiku**) :
  - `npm run check`, puis cocher 4.13 dans `TODO.md` ;
  - dans `ARCHITECTURE.md`, compléter la puce « Tourelles » : « abîme la première tourelle, puis les autres bâtiments » ;
  - ajouter une note d'amendement en tête de l'ADR 0005.

B et C peuvent se faire en parallèle une fois A terminé. Pas de revue Opus : le diff est inférieur à 300 lignes et ne touche ni la physique ni l'ordre du pas.
