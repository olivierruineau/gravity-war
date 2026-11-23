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
export const SHIP_SIZE = 8; // rayon du triangle dessiné, en px

/** Tir principal : munitions illimitées, balles soumises à la gravité (trajectoires courbées près des planètes). */
export const BULLET_SPEED = 320; // px/s, ajoutée à la vitesse du vaisseau
export const BULLET_LIFETIME = 1.6; // secondes
export const BULLET_DAMAGE = 12;
export const FIRE_COOLDOWN = 0.18; // secondes entre deux tirs
export const PROJECTILE_CAPACITY = 256; // taille du pool ; pool plein = tir ignoré

/** Mort et respawn : délai avant de réapparaître sur la planète possédée la plus proche. */
export const RESPAWN_DELAY = 3; // secondes

/** Gravité (ADR 0003) : chaque planète est réglée par sa gravité de surface g0 (px/s²), en 1/d² à portée finie. */
export const PLANET_GRAVITY = 70; // g0 par défaut
export const GRAVITY_RANGE_FACTOR = 5; // portée = 5 × rayon, coupure douce
export const GRAVITY_DOMINANCE_POWER = 2; // zones qui se chevauchent : poids = profondeur / altitude^p (ADR 0004)
export const PLANET_MAX_GRAVITY = 0.6 * SHIP_THRUST; // le décollage reste toujours possible

/** Atterrissage et impact (ADR 0003 §4) : vitesses en px/s, angle en radians. */
export const SHIP_COLLISION_RADIUS = 6; // le vaisseau est un disque pour les collisions
export const LANDING_MAX_RADIAL_SPEED = 45; // vitesse d'approche max pour se poser
export const LANDING_MAX_TANGENTIAL_SPEED = 35; // vitesse le long de la surface max
export const LANDING_MAX_ANGLE = (25 * Math.PI) / 180; // écart max entre le nez et la normale
export const IMPACT_DAMAGE_PER_SPEED = 1; // PV par px/s d'excès au-delà des seuils
export const IMPACT_RESTITUTION = 0.3; // rebond radial = 30 % de la vitesse d'approche...
export const IMPACT_MIN_BOUNCE_SPEED = 30; // ...mais jamais moins de 30 px/s (pas de contact au repos)
export const IMPACT_TANGENTIAL_DAMPING = 0.5; // frottement sur la composante tangentielle
export const TAKEOFF_MIN_NORMAL_SPEED = 1e-6; // sous ce seuil (bruit d'arrondi), une poussée tangentielle ne fait pas décoller
export const LANDING_AID_ALTITUDE = 120; // altitude sous laquelle l'aide à l'atterrissage s'affiche

/** Mur de carte : rebond amorti, sans dégâts (SPEC §5.6). 0 = collé au mur, 1 = rebond parfait. */
export const BOUNDS_RESTITUTION = 0.5;

/** Factions (ADR 0005) : 0 = joueur, 1 et 2 = bots. */
export const FACTION_COUNT = 3;
export const CAPTURE_TIME = 3; // secondes posé seul sur une planète pour la capturer
export const TURRET_MUZZLE_OFFSET = 2; // px au-delà de la surface où apparaît la balle d'une tourelle

/** Missiles : guidés, insensibles à la gravité, verrouillés par l'usine de missiles. */
export const MISSILE_SPEED = 200; // px/s minimum (+ vitesse du vaisseau vers l'avant)
export const MISSILE_LIFETIME = 4; // secondes
export const MISSILE_DAMAGE = 40;
export const MISSILE_COOLDOWN = 0.5; // secondes entre deux tirs
export const MISSILE_TURN_RATE = 2.0; // rad/s, inférieur à SHIP_ROTATION_SPEED : on peut les esquiver
export const MISSILE_SEEK_ANGLE = (30 * Math.PI) / 180; // demi-angle du cône de recherche, en rad
export const MISSILE_SEEK_RANGE = 350; // px
export const MISSILE_STOCK_MAX = 4;
export const MISSILE_STOCK_MIN = 1; // stock initial et au respawn
export const MISSILE_REARM_TIME = 2; // secondes par missile rechargé

/** Bouclier passif, débloqué par le générateur de bouclier. */
export const SHIELD_MAX = 50;
export const SHIELD_RECHARGE_DELAY = 4; // secondes sans dégâts avant la recharge
export const SHIELD_RECHARGE_RATE = 10; // points/s

/** Effets visuels (cosmétiques, hors simulation) : taille du pool d'effets simultanés. */
export const EFFECT_CAPACITY = 64;

/** Audio : distance (px) au-delà de laquelle un son d'événement n'est plus audible. */
export const AUDIO_RANGE = 700;
export const THRUST_SOUND_INTERVAL = 0.12; // secondes entre deux « pulsations » du moteur

/** Palette restreinte façon années 90 (à ajuster avec la direction artistique). */
export const PALETTE = {
  bg: 0x0b0b14,
  text: 0xe8e8f0,
  accent: 0xffcc33,
  star: 0x7a80a8,
  neutral: 0xffffff, // planète non capturée
  // Couleur du contour d'une planète / d'un vaisseau par faction (0 = joueur, 1 et 2 = bots).
  factions: [0x4ae88a, 0xe84a5f, 0x4ab4ff],
  // L'aide à l'atterrissage a ses propres teintes, distinctes de celles des factions.
  aidGood: 0xc8ff4a,
  aidBad: 0xff8a2a,
  border: 0x30365a,
  danger: 0xe84a5f,
  ok: 0x4ae88a,
};

export const SCENES = {
  BOOT: 'BootScene',
  MENU: 'MenuScene',
  GAME: 'GameScene',
};
