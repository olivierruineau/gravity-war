// Carte de développement (sera affinée à l'item 7.1). Disposition :
// 3 grosses planètes de départ en triangle (joueur, bot 1, bot 2) et 6 planètes neutres entre elles.
// `gravity` = gravité de surface g0 en px/s² (poussée du vaisseau : 140 ; plafond de la carte : 84).
export const arena = {
  width: 2400,
  height: 1350,
  planets: [
    { x: 300, y: 250, radius: 60, gravity: 70, owner: 0 }, // 0 : base du joueur
    { x: 2100, y: 250, radius: 60, gravity: 70, owner: 1 }, // 1 : base du bot 1
    { x: 1200, y: 1150, radius: 60, gravity: 70, owner: 2 }, // 2 : base du bot 2
    { x: 1200, y: 400, radius: 90, gravity: 65 }, // gros astre central haut
    { x: 700, y: 800, radius: 40, gravity: 55 },
    { x: 1700, y: 800, radius: 40, gravity: 55 },
    { x: 400, y: 1050, radius: 30, gravity: 50 },
    { x: 2000, y: 1100, radius: 50, gravity: 60 },
    { x: 1200, y: 750, radius: 30, gravity: 50 },
  ],
  // spawns[i] = départ de la faction i, posée sur sa planète de base. La faction 1 (futur bot 1) est pour
  // l'instant une cible d'entraînement immobile : elle réapparaît sur sa base après sa mort.
  spawns: [{ planet: 0 }, { planet: 1 }],
};
