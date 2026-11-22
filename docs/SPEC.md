# Spécification fonctionnelle — Gravity War

Source de vérité du _quoi_. Le _comment_ est dans [ARCHITECTURE.md](ARCHITECTURE.md) et [adr/](adr/), le _quand_ dans [../TODO.md](../TODO.md).
Les valeurs chiffrées (vitesses, PV, durées…) sont des points de départ à régler en jeu ; elles vivent dans `src/config.js`.

## 1. Identité visuelle et rendu

- 2D minimaliste, abstrait, **100 % filaire (wireframe)** sur fond noir/sombre. Pas de sprites : tout est dessiné en traits (Phaser Graphics), résolution interne 480×270.
- **Vaisseau** : triangle. **Planètes** : cercles, la **couleur du contour = propriétaire** (blanc = neutre, vert = joueur, autres couleurs = bots). **Bâtiments** : carrés/rectangles dessinés à l'intérieur du cercle de la planète.
- **Caméra** : centrée sur le vaisseau, scrolling 2D sur une carte plus grande que l'écran.
- Repères de mouvement : un fond discret (étoiles/grille faible contraste) pour percevoir la vitesse malgré le fond noir.

## 2. Physique et contrôles

- **Newtonienne** : inertie + attraction gravitationnelle des planètes. Pas de frein : pour ralentir, on fait un 180° et on pousse.
- **Pas de jauge de carburant** : la poussée est illimitée.
- **Clavier** : `←` / `→` rotation · `↑` poussée dans l'axe du nez · `Espace` tir principal · `Ctrl` missile · `Maj` réservé (module futur).
- **Planètes fixes** (immobiles), **carte bornée** (mur invisible qui repousse le vaisseau).

## 3. Boucle de jeu

- **Solo contre 2 bots IA** (deux factions/couleurs, une seule difficulté). Les bots pilotent des vaisseaux avec les mêmes règles que le joueur : ils capturent des planètes et attaquent.
- **Départ** : chaque faction (joueur + 2 bots) possède une planète de départ (sa « base »).
- **Carte** : une seule carte fixe écrite à la main pour la v1.

### Atterrissage

- Atterrissage réussi si la vitesse radiale d'approche est sous un seuil **et** que le nez est à peu près orienté radialement (tolérance d'angle).
- Impact au-dessus des seuils : **dégâts proportionnels** à la violence de l'impact (mort si la vie tombe à 0).
- Aide à l'atterrissage affichée près des planètes : indicateur vitesse radiale/angle (vert = OK, rouge = trop risqué).

### Capture

- **Planète neutre** : rester **posé 3 secondes** d'affilée (se décoller ou être éjecté remet le compteur à zéro). Un anneau de progression s'affiche.
- **Planète ennemie** : détruire d'abord ses **défenses** (tourelles à PV, au tir ou au missile), puis se poser 3 s.
- Une planète capturée prend la couleur de la faction.

### Économie et progression

- **Pas de monnaie** : les planètes possédées **développent automatiquement leurs bâtiments dans le temps**, dans un ordre fixe défini en données. Chaque bâtiment apparaît comme un carré/rectangle dans le cercle.
- Les bâtiments **débloquent/améliorent** des capacités de la faction : tourelles de défense auto, usine à missiles, générateur de bouclier, etc.

### Combat et survie

- **Barre de vie** simple. **Bouclier déblocable** : passif, couche de protection supplémentaire absorbée avant la vie, **qui se recharge en vol** (hors combat), sans se poser.
- **Tir principal** : projectiles à munitions illimitées. **Missiles** : **stock limité**, rechargé **au sol sur une planète possédée qui a l'usine à missiles** ; débloqués par bâtiment.
- **Mort** : respawn après un court délai (~3 s) à la **planète possédée la plus proche** (la base au début), vie/bouclier pleins, **stock de missiles remis au minimum**. Planètes et bâtiments conservés.

### Fin de partie

- **Victoire** : tous les bots sont éliminés. Un bot est éliminé quand il **n'a plus aucune planète** (donc plus de lieu de respawn) **et** que son vaisseau est détruit.
- **Défaite** : même règle pour le joueur.

## 4. Interface

- **HUD** : vie, bouclier, stock de missiles, vitesse.
- **Minimap filaire** dans un coin (planètes colorées, vaisseaux) pour une carte plus grande que l'écran.
- **Indicateurs d'aide à l'atterrissage** (voir ci-dessus).

## 5. Hypothèses à valider (proposées par défaut, modifiables)

Ces points n'ont pas été tranchés explicitement ; on part des valeurs ci-dessous, à corriger en playtest.

1. **Ordre de développement des bâtiments** : tourelle de défense → usine à missiles → générateur de bouclier → tourelle améliorée (intervalle de temps à régler). Une capacité est débloquée pour la faction dès qu'**une** de ses planètes a le bâtiment correspondant ; seul le **réarmement en missiles** exige de se poser sur une planète avec usine.
2. **Capture d'une planète ennemie** : ses bâtiments sont **réinitialisés** (la planète repart de zéro et redéveloppe pour son nouveau propriétaire).
3. **Missiles** : légèrement autoguidés vers la cible la plus proche dans un cône devant le vaisseau, dégâts supérieurs au tir principal.
4. **Respawn des bots** : mêmes règles que le joueur.
5. **Pas de tir ami** entre vaisseaux/défenses d'une même faction.
6. **Mur de carte** : rebond amorti sans dégâts.
7. **Tourelles** : tirent sur tout vaisseau ennemi à portée ; ne bloquent pas l'atterrissage d'un allié.

## 6. Hors périmètre v1 (backlog)

Génération procédurale de cartes (seed), campagne de niveaux, réglage du nombre de bots/difficulté au menu, planètes en orbite, carte torique, monnaie et menu de construction, manette/mobile, musique.
