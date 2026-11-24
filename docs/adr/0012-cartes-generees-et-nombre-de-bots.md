# 0012 — Cartes générées depuis une graine, nombre de bots réglable

- **Statut** : accepté
- **Date** : 2026-11-25

## Contexte

Il n'y avait qu'une carte fixe (« Triade ») et toujours deux bots. On veut de la variété sans perdre l'équité entre factions, un nombre de bots réglable (1 ou 2), et pouvoir rejouer ou partager une carte.

## Décision

- **Générateur seedé** `data/maps/generate.js` : `generateMap(seed)` renvoie une carte au format de `createWorld` (planètes 0, 1, 2 = bases). Même graine, même carte (RNG de `core/rng.js`). La carte a la **symétrie de rotation d'ordre 3** de « Triade » (bases à 120°, chaque groupe de neutres posé en trois exemplaires tournés), donc aucune faction n'est avantagée. Contraintes de « Triade » sur lesquelles l'IA est réglée : surfaces à ≥ 120 px, portées de gravité disjointes, marge de 60 px au bord, gravité ≤ plafond du jeu. Tailles 2600 × 2400 comme « Triade » ; 3 bases, un neutre personnel par base, 2 à 4 groupes de neutres, un astre central dans 70 % des cas, soit 9 à 19 planètes.
- **Réglage « carte »** : `ALEATOIRE` (défaut, générée depuis la graine de la partie) ou `TRIADE` (carte fixe équilibrée à la main). La graine de partie est aussi celle de la simulation ; elle est affichée en pause, au résumé de fin et dans le debug. `?seed=123` dans l'adresse rejoue une carte (et impose le mode généré).
- **Nombre de bots** (1 ou 2, défaut 2) : `limitFactions(map, n)` retire les factions en trop. La base d'une faction retirée devient une planète neutre sans bâtiment et son départ disparaît ; une faction sans planète est « hors jeu » (ADR 0005), aucun changement dans le core. En observation, la faction 0 s'ajoute aux bots.
- **Plan de partie** `systems/matchPlan.js` (pur, testé) : réglages + graine → carte, factions, bots. La scène ne fait que l'appliquer. Les réglages passent par `persistedChoice` (liste de valeurs, `localStorage`).
- **Statistiques** `systems/matchStats.js` : comptage des événements du core (captures par faction, pertes de vaisseaux) pour le résumé de fin (durée, planètes, captures, pertes, carte), ou une ligne par faction en observation.

## Alternatives écartées

- Générateur sans symétrie : une base pourrait être avantagée ; l'équité est la propriété qui compte en jeu à trois.
- Générer sur une grille d'échantillonnage libre (Poisson) : même difficulté d'équité, plus de cas limites pour l'IA.
- Bots à 0 : sans adversaire la victoire est immédiate (aucune faction rivale en jeu).
- Attribuer les destructions de vaisseaux à un tueur : l'événement du core ne porte pas le tireur ; on ne compte donc que les pertes.

## Conséquences

- Tests : validité de 100 graines (création de monde, espacement, portées, symétrie), parties de bots sur 10 cartes générées avec 1 ou 2 bots.
- L'IA a été réglée sur « Triade » : les cartes générées respectent ses contraintes, mais le comportement sur des cartes inédites est à surveiller en recette.
- Le défaut « carte aléatoire » change le premier contact d'un nouveau joueur : « Triade » reste un choix des Options.
