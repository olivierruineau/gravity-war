# 0008 — Entrée multi-sources (clavier, tactile, plus tard manette)

- **Statut** : accepté
- **Date** : 2026-11-23
- **Précise** : ADR 0002 §2 (seul point où Phaser écrit dans `world` : `ships[0].intent`).

## Contexte

La v1 n'a qu'une porte d'entrée, `systems/keyboardInput.js`, plus des touches en dur dans le menu, la pause, l'écran de fin et la sourdine. La phase 8 ajoute le tactile (téléphone en **paysage seul**) sans retirer le clavier : un même build doit se jouer au PC, sur un portable à écran tactile et sur une tablette avec clavier. Contraintes : `core/` ne change pas de règles, les bots restent soumis aux mêmes intentions discrètes, aucune allocation par frame, nettoyage des écouteurs à la sortie de scène.

## Décision

**Les sources d'entrée (clavier, tactile, plus tard manette) produisent deux sortes d'actions logiques. Elles sont toutes actives en même temps. Seul l'affichage (commandes visibles, textes d'aide) suit la dernière source utilisée.**

### 1. Deux familles d'actions

- **Pilotage** (chaque frame, état maintenu) : l'`Intent` du core, `{ rotate: -1|0|1, thrust, fire, missile }`. Les sources écrivent à tour de rôle sur `ships[0].intent` : le clavier écrase les quatre champs, puis le tactile ajoute les siens (OU logique ; `rotate` est additionné puis borné à ±1). Une touche et un doigt simultanés ne se gênent donc pas. `rotate` reste discret : ni joystick analogique, ni « demi-rotation ».
- **Navigation** (événements ponctuels) : `confirm`, `back`, `pause`, `mute`, `help`. Une table `data/inputBindings.js` associe chaque action à ses touches ; chaque scène déclare ses gestionnaires par action, jamais par touche. Une manette ajoutera une colonne à la table, pas de code dans les scènes.

### 2. Dernière source utilisée

Un module `systems/inputSource.js` (état partagé, comme `audio/mute.js`) mémorise `'keyboard' | 'touch'` :

- au démarrage : `touch` si l'appareil a un pointeur grossier principal (`matchMedia('(pointer: coarse)')`), sinon `keyboard`. Un portable à écran tactile démarre donc au clavier ;
- un `keydown` passe à `keyboard`, un `pointerdown` tactile (`pointer.wasTouch`) passe à `touch` ; la souris ne change rien (c'est un PC).

Les vues (overlay de commandes, aide, bascule de textes) lisent cette valeur ; elles ne la déduisent jamais elles-mêmes. Conséquence : l'overlay tactile n'apparaît que quand on touche l'écran et se masque dès qu'une touche est pressée, sans réglage.

### 3. Tactile : lecture par pointeurs, sans événements

Chaque frame, un modèle pur (`touchModel.js`) parcourt `scene.input.manager.pointers` et met à jour les boutons enfoncés selon la position (`isDown`, `x`, `y`). Aucune machine à états par doigt : un doigt levé, perdu ou annulé (`touchcancel`) ne se voit plus `isDown` et son bouton se relâche tout seul ; glisser d'un bouton à l'autre fonctionne ; zéro allocation. Phaser fournit les coordonnées en pixels du jeu (480×270).

Disposition en paysage (coordonnées du jeu, boutons ronds de **40 px de diamètre minimum**, soit au moins 44 px CSS dès que l'écran fait 297 px de haut ; la zone de toucher dépasse le dessin de 4 px) :

| Pouce / doigt | Boutons                                                          |
| ------------- | ---------------------------------------------------------------- |
| gauche        | ◄ et ► (rotation), côte à côte, en bas à gauche                  |
| droit         | poussée, TIR (le plus grand), MISSILE au-dessus, en bas à droite |

La poussée est à droite pour qu'un pouce gauche puisse tourner pendant que le droit pousse et tire ; trois doigts sont pris en charge (`input.activePointers: 3` dans la config du jeu, plus la souris). Pause, son et plein écran sont de petits boutons en haut, hors de portée des pouces de jeu ; ils sont aussi des cibles de 40 px. Le HUD quitte les coins du bas (8.6).

### 4. Aide à la maniabilité tactile : réglable, active par défaut au tactile

L'aide vit **dans la couche d'entrée**, comme un filtre d'intention du joueur seul. Le core, les règles d'atterrissage et les bots ne changent pas. Elle est désactivée au clavier par défaut, activée au tactile, réglable au menu. Détail (8.7) : une seule aide, **l'alignement à la pose** (`systems/landingAssist.js`). Près d'une planète (altitude ≤ `ASSIST_ALTITUDE` = 70, révisé en 9.1 : l'aide arrivait trop tôt) et en approche, si le joueur ne tourne pas, ne tire pas et ne pousse pas, elle tourne le nez vers la normale (critère d'angle de `evaluateLanding`) jusqu'à une zone morte de `LANDING_MAX_ANGLE / 4` ; si la vitesse latérale dépasse `ASSIST_TANGENTIAL_SPEED` (80 % du seuil de pose), le nez vise au contraire contre cette vitesse, pour qu'une poussée l'annule. Les seuils d'atterrissage ne bougent pas : l'aide ne fait que l'orientation, la vitesse reste au joueur. Pas de « stabilisation de rotation » : la rotation du vaisseau est déjà à vitesse constante, sans inertie. Réglage au menu (`A` ou bouton) : AUTO (actif au tactile seulement), OUI, NON, mémorisé dans `localStorage`. Le principe est fixé ici : elle ne produit que des `Intent` valides (rotation discrète), jamais d'accès direct à l'angle ou à la vitesse du vaisseau.

### 5. Plateforme

- **Paysage seul** : en portrait sur un appareil tactile, une invite DOM « tournez l'appareil » couvre la page, et la partie se met en pause. Pas de mise en page portrait. Tentative de verrouillage `screen.orientation.lock('landscape')` au passage en plein écran (ignorée si refusée).
- **iOS** : l'API plein écran n'existe pas sur iPhone en navigateur. Le bouton plein écran est donc masqué quand `scale.fullscreen.available` est faux ; la voie iPhone est l'installation (PWA, 8.10), qui lance le jeu sans barre.
- **Audio** : débloqué au premier geste, quel qu'il soit (8.8).

## Alternatives écartées

- **Joystick analogique virtuel** — `rotate` est discret pour que les bots et le joueur aient les mêmes moyens (ADR 0002) ; un angle continu briserait cette égalité et le déterminisme des tests. Les boutons ◄ ► s'y adaptent.
- **Deux builds (PC / mobile)** — double maintenance, et un portable tactile aurait perdu l'un ou l'autre.
- **Détecter « mobile » par le user-agent** — fragile ; la dernière source réellement utilisée est plus juste.
- **Suivi des doigts par événements `pointerdown`/`up`** — il faut gérer les annulations, les doigts perdus hors du canevas et les doublons ; la lecture d'état par frame les évite.
- **Aide à la maniabilité dans le core** — elle affecterait les bots et l'équilibrage validé en 7.2.

## Conséquences

- Nouveau : `inputBindings`, `inputSource`, `navigation`, `touchModel`, `touchControls` (overlay) et un `playerInput` qui fusionne les sources dans `systems/`. `keyboardInput.js` reste une source.
- Non-régression PC : aucune touche ne change ; les tests existants passent tels quels.
- Risques : sur un portable tactile, un frôlement d'écran fait basculer l'affichage vers le tactile. Il revient au clavier dès la prochaine touche. À vérifier en 8.11.
- Plus tard : une manette (Gamepad API) ajoute une source de pilotage et une colonne dans la table de navigation.
