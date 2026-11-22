// Fond d'étoiles en parallaxe : sur fond noir, c'est le seul repère pour percevoir la vitesse.
// Purement cosmétique : n'influence pas la simulation, donc hors des règles de déterminisme de core/.
import { PALETTE } from '../config.js';
import { createRng, nextFloat } from '../core/rng.js';

// Chaque couche : facteur de parallaxe (1 = fixe dans le monde), nombre d'étoiles, opacité.
const LAYERS = [
  { scrollFactor: 0.25, count: 900, alpha: 0.35 },
  { scrollFactor: 0.5, count: 600, alpha: 0.6 },
  { scrollFactor: 1, count: 350, alpha: 1 },
];

/** Dessine les étoiles une seule fois (Graphics statiques) ; positions reproductibles (graine fixe). */
export function createStarfield(scene, width, height) {
  const rng = createRng(1990);
  for (const layer of LAYERS) {
    const g = scene.add.graphics().setScrollFactor(layer.scrollFactor).setDepth(-10);
    g.fillStyle(PALETTE.star, layer.alpha);
    for (let i = 0; i < layer.count; i++) {
      g.fillRect(Math.floor(nextFloat(rng) * width), Math.floor(nextFloat(rng) * height), 1, 1);
    }
  }
}
