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

  // Seuils
  huntRange: 700,
  lowHealth: 40,
  assaultMinHealth: 60, // hp + bouclier
  rearmBelow: 2,
  defendMemory: 5,

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

  // Combat
  aimError: 0.05,
  fireCone: 0.06,
  fireRange: 380,
  engageMin: 120,
  engageMax: 260,
  missileRange: 300,
  missileReserve: 1,
  standoffMargin: 50,
};
