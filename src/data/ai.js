// Profil unique des bots (ADR 0006 §6) : valeurs de départ, à régler en playtest (5.7 et 7.2).
// Durées en secondes, distances en px, vitesses en px/s, angles en radians.
export const BOT_PROFILE = {
  // Réaction
  startDelay: 2,
  decisionPeriod: 0.5,
  reactionTime: 0.3, // avant le premier tir sur une nouvelle cible
  missileNotice: 220, // rayon de perception des missiles

  // Décision : poids des modes, puis réglages de l'utilité
  capture: 1.0,
  assault: 0.8,
  hunt: 0.7,
  defend: 1.6,
  retreat: 1.4,
  rearm: 0.6,
  idle: 0.05,
  aggression: 1.0,
  travelScale: 8,
  leaderBonus: 1.2,
  commitBonus: 1.3,
  minCommit: 2,
  scoreNoise: 0.05,
  giveUpTime: 45,
  banTime: 30,
  slotValue: 0.2, // bonus de score par bâtiment construit sur la cible
  enemyCaptureFactor: 1.3, // capturer une planète ennemie sans défense vaut plus qu'une neutre (ADR 0006 §3)
  occupiedFactor: 0.3, // un autre vaisseau est posé sur la cible : la capture est contestée
  assaultFactor: 1.3, // une planète ennemie vaut plus qu'une neutre (comme enemyCaptureFactor)
  turretHpScale: 160, // PV de tourelles qui divisent par 2 l'envie d'assaut
  healthFloor: 0.3, // plancher du facteur de santé (hp + bouclier) des modes offensifs
  shelterFactor: 0.3, // HUNT : la cible est sous la portée des tourelles d'une planète adverse

  // Seuils
  huntRange: 700,
  lowHealth: 40,
  assaultMinHealth: 30, // hp + bouclier (la moitié de SHIP_MAX_HP : à 60 la moindre égratignure interdisait l'assaut)
  rearmBelow: 2,
  defendMemory: 5, // s : une planète touchée depuis moins longtemps est « attaquée » (planet.lastHitTick)
  defendRadius: 400, // px depuis la surface : un ennemi plus proche menace la planète (portée d'une balle : 512)
  defendUrgent: 2, // facteur de DEFEND quand un ennemi est posé sur la planète (capture en cours) : préempte l'engagement
  defendNearFactor: 0.5, // facteur de DEFEND quand un ennemi rôde sans avoir tiré ni s'être posé
  retreatThreat: 300, // px : un ennemi plus proche que cela (vaisseau à vaisseau) met le bot « en danger »
  retreatHold: 0.5, // sévérité minimale du repli tant que le bouclier se recharge (les PV ne reviennent pas)
  retreatSafe: 300, // px depuis la surface : une planète sans ennemi dans ce rayon est un abri

  // Navigation
  cruiseSpeed: 150,
  brakeFactor: 0.6, // part de la poussée utilisée pour freiner
  velGainTime: 0.4, // temps visé pour rejoindre la vitesse désirée
  velTolerance: 8,
  thrustCone: 0.3,
  clearance: 30,
  wallMargin: 60,
  avoidHorizon: 2,
  predictDt: 1 / 30,

  // Atterrissage
  landEntryAltitude: 50,
  landEntrySpeed: 20,
  landRadialTarget: 25,
  landTangentialMax: 20,
  landMaxTilt: 0.2,
  takeoffAltitude: 40,
  landDescentSpeed: 12, // vitesse visée vers la planète quand aucun contact n'est prévu (px/s)
  landEntryTolerance: 10, // marge sur l'altitude d'entrée pour passer en descente
  landFlareAltitude: 15, // sous cette altitude : nez sur la normale, remise des gaz possible
  landBrakeFactor: 0.7, // part de la poussée sur laquelle compte le « suicide burn » (le reste = marge)
  landHorizon: 3, // s, horizon de la prédiction du contact (chute de l'altitude d'entrée en < 3 s)
  landAbortTangential: 30, // vitesse tangentielle prévue au-delà de laquelle on remet les gaz
  landAbortTilt: 0.35, // écart de nez prévu au-delà duquel on remet les gaz
  landAbortRadial: 40, // vitesse d'approche que même une poussée pleine ne ramènerait plus sous ce seuil : gaz
  landGoAroundSpeed: 30, // vitesse de fuite (px/s) à laquelle la remise des gaz passe la main à l'approche
  landAbortAltitude: 2, // × landEntryAltitude : au-delà, la descente redevient une approche

  // Combat
  aimError: 0.05,
  fireCone: 0.06,
  fireRange: 380,
  engageMin: 120,
  engageMax: 260,
  missileRange: 300,
  missileReserve: 1,
  standoffMargin: 50,
  assaultSlack: 30, // écart au point d'attente sous lequel le nez sert à viser plutôt qu'à naviguer
  aimLookahead: 1, // s : on ne vise que si, à ce délai, la dérive laisserait encore dans la zone de visée
  evadeTime: 1, // durée d'une esquive (s) : poussée dans une direction fixée au départ
  dodgeBullets: true, // écart à l'ADR 0006 (qui n'esquive que les missiles) : esquive des balles proches
  bulletNotice: 120, // rayon de perception des balles
  bulletHorizon: 0.4, // s : une balle qui frôlerait le vaisseau plus tard n'est pas esquivée
  dodgeRadius: 16, // distance d'approche minimale prévue sous laquelle une balle est une menace
};
