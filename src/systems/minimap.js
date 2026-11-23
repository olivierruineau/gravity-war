// Minimap filaire (6.2), fixée à l'écran en haut à droite : carte entière, planètes à la couleur de leur
// propriétaire, vaisseaux vivants, cadre de la caméra. Lecture seule de `world`.
import { PALETTE } from '../config.js';
import { MINIMAP } from './hudLayout.js';
import { planetColor } from '../entities/planetView.js';
import { minimapSize } from './minimapLayout.js';

const DEPTH = 900;
const MIN_PLANET_RADIUS = 1.5; // les petites planètes restent visibles
const SHIP_RADIUS = 1.5;
const PLAYER_RADIUS = 2.5; // le joueur ressort davantage que les bots

export function createMinimap(scene, world) {
  const { scale, width, height } = minimapSize(
    world.width,
    world.height,
    MINIMAP.maxW,
    MINIMAP.maxH,
  );
  const x0 = MINIMAP.x + MINIMAP.maxW - width;
  const y0 = MINIMAP.y;
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);

  return {
    update() {
      g.clear();
      g.fillStyle(PALETTE.bg, 0.7);
      g.fillRect(x0, y0, width, height);
      g.lineStyle(1, PALETTE.border, 1);
      g.strokeRect(x0, y0, width, height);

      const { planets, ships } = world;
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        g.lineStyle(1, planetColor(p.owner), 1);
        g.strokeCircle(
          x0 + p.pos.x * scale,
          y0 + p.pos.y * scale,
          Math.max(MIN_PLANET_RADIUS, p.radius * scale),
        );
      }
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        if (!s.alive) continue;
        g.fillStyle(PALETTE.factions[s.faction], 1);
        g.fillCircle(
          x0 + s.pos.x * scale,
          y0 + s.pos.y * scale,
          s.faction === 0 ? PLAYER_RADIUS : SHIP_RADIUS,
        );
      }

      const view = scene.cameras.main.worldView; // ce que le joueur voit
      g.lineStyle(1, PALETTE.text, 0.5);
      g.strokeRect(
        x0 + view.x * scale,
        y0 + view.y * scale,
        view.width * scale,
        view.height * scale,
      );
    },
  };
}
