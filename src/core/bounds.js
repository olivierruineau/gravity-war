// Mur de carte invisible : ramène un corps dans [radius, width-radius] × [radius, height-radius]
// et inverse (en l'amortissant) la composante de vitesse qui pointait vers l'extérieur.
// La composante tangentielle est conservée.

/**
 * @param {{ pos: {x:number,y:number}, vel: {x:number,y:number} }} body
 * @param {number} restitution  0 = la vitesse normale est annulée, 1 = rebond parfait
 */
export function applyBounds(body, width, height, radius, restitution) {
  const { pos, vel } = body;
  if (pos.x < radius) {
    pos.x = radius;
    if (vel.x < 0) vel.x = -vel.x * restitution;
  } else if (pos.x > width - radius) {
    pos.x = width - radius;
    if (vel.x > 0) vel.x = -vel.x * restitution;
  }
  if (pos.y < radius) {
    pos.y = radius;
    if (vel.y < 0) vel.y = -vel.y * restitution;
  } else if (pos.y > height - radius) {
    pos.y = height - radius;
    if (vel.y > 0) vel.y = -vel.y * restitution;
  }
}
