// Clavier → intentions de pilotage. Seul point où Phaser écrit dans `world` (ADR 0002 §2).
import Phaser from 'phaser';

/**
 * Commandes : ← → rotation · ↑ poussée · Espace tir principal · Ctrl missile · Maj réservé.
 * Les touches sont créées via le plugin clavier de la scène : Phaser les libère à l'arrêt de la scène.
 */
export function createKeyboardInput(scene) {
  const { KeyCodes } = Phaser.Input.Keyboard;
  const cursors = scene.input.keyboard.createCursorKeys(); // capture aussi les flèches (pas de scroll de page)
  const keys = scene.input.keyboard.addKeys({ fire: KeyCodes.SPACE, missile: KeyCodes.CTRL });

  return {
    /** À appeler une fois par frame d'affichage, avant les pas de simulation. */
    update(intent) {
      intent.rotate = (cursors.right.isDown ? 1 : 0) - (cursors.left.isDown ? 1 : 0);
      intent.thrust = cursors.up.isDown;
      intent.fire = keys.fire.isDown;
      intent.missile = keys.missile.isDown;
    },
  };
}
