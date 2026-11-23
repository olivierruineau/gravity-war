// Géométrie de la minimap (6.2), pure : échelle monde → écran et projection. Testée sans Phaser.

/**
 * Dimensions de la minimap : la carte entière tient dans `maxW` × `maxH` en gardant ses proportions.
 * @returns {{ scale: number, width: number, height: number }} `scale` = pixels de minimap par pixel de monde
 */
export function minimapSize(worldW, worldH, maxW, maxH) {
  const scale = Math.min(maxW / worldW, maxH / worldH);
  return { scale, width: worldW * scale, height: worldH * scale };
}
