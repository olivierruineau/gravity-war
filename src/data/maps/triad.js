// Carte finale v1 (7.1) : « Triade ». Symétrie de rotation d'ordre 3 autour du centre (1300, 1200) : les trois
// bases sont à 900 px du centre, à 120° les unes des autres, donc aucune faction n'est avantagée.
// Chaque base a la même géographie : 1 neutre « personnel » à 450 px, 2 « portes » à ≈ 800 px (partagées avec
// une voisine), 2 neutres extérieurs à ≈ 984 px (en bordure), et le gros astre central, à 900 px de tous.
// Toutes les surfaces sont à ≥ 120 px les unes des autres (couloirs pour l'IA) et aucune portée de gravité
// (5 × rayon) ne chevauche une autre : pas de zone de dominance à arbitrer.
// `gravity` = g0 de surface en px/s² (poussée du vaisseau : 140 ; plafond : 84).
// Les nombres sont arrondis à l'entier ; `tests/unit/triad-map.test.js` vérifie symétrie et équité.
export const triad = {
  width: 2600,
  height: 2400,
  planets: [
    { x: 1300, y: 300, radius: 60, gravity: 70, owner: 0, built: 1 }, //  0 : base du joueur (haut)
    { x: 2079, y: 1650, radius: 60, gravity: 70, owner: 1, built: 1 }, //  1 : base du bot 1 (bas droite)
    { x: 521, y: 1650, radius: 60, gravity: 70, owner: 2, built: 1 }, //  2 : base du bot 2 (bas gauche)
    { x: 1300, y: 1200, radius: 70, gravity: 60 }, //  3 : astre central
    { x: 1075, y: 690, radius: 30, gravity: 50 }, //  4 : neutre personnel de la base 0
    { x: 1854, y: 1260, radius: 30, gravity: 50 }, //  5 : neutre personnel de la base 1
    { x: 971, y: 1650, radius: 30, gravity: 50 }, //  6 : neutre personnel de la base 2
    { x: 1837, y: 890, radius: 40, gravity: 55 }, //  7 : porte entre les bases 0 et 1
    { x: 1300, y: 1820, radius: 40, gravity: 55 }, //  8 : porte entre les bases 1 et 2
    { x: 763, y: 890, radius: 40, gravity: 55 }, //  9 : porte entre les bases 2 et 0
    { x: 2209, y: 675, radius: 30, gravity: 50 }, // 10 : extérieur, côté bases 0 et 1
    { x: 1300, y: 2250, radius: 30, gravity: 50 }, // 11 : extérieur, côté bases 1 et 2
    { x: 391, y: 675, radius: 30, gravity: 50 }, // 12 : extérieur, côté bases 2 et 0
  ],
  spawns: [{ planet: 0 }, { planet: 1 }, { planet: 2 }],
};
