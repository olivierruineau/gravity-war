// Constantes globales du jeu. Pas de "magic numbers" ailleurs : tout passe par ici.

/** Résolution interne basse (16:9). Le canvas est ensuite mis à l'échelle (pixel-perfect). */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

/** Pas de temps fixe de la simulation (en secondes) : physique déterministe. */
export const FIXED_DT = 1 / 60;

/** Garde-fous de la boucle à pas fixe : l'arriéré au-delà est jeté (le jeu ralentit, il ne spirale pas). */
export const MAX_FRAME_DT = 0.25;
export const MAX_STEPS_PER_FRAME = 5;

/** Capacité de la file d'événements core → rendu/audio (au-delà : événements perdus). */
export const EVENT_CAPACITY = 256;

/** Vaisseau : rotation à vitesse angulaire constante, poussée illimitée (pas de carburant), aucun frein. */
export const SHIP_ROTATION_SPEED = 3.2; // rad/s
export const SHIP_THRUST = 140; // px/s², dans l'axe du nez
export const SHIP_MAX_HP = 100;

/** Palette restreinte façon années 90 (à ajuster avec la direction artistique). */
export const PALETTE = {
  bg: 0x0b0b14,
  text: 0xe8e8f0,
  accent: 0xffcc33,
  danger: 0xe84a5f,
  ok: 0x4ae88a,
};

export const SCENES = {
  BOOT: 'BootScene',
  MENU: 'MenuScene',
  GAME: 'GameScene',
};
