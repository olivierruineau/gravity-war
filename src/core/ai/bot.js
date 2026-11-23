// IA des bots (ADR 0006) : appelée à l'étape 1 de `step`, avant les vaisseaux.
// Écrit uniquement `ships[f].intent` des bots, `world.ai[k]` et `world.aiRng`.
import { SHIP_MAX_HP } from '../../config.js';
import { BOT_PROFILE } from '../../data/ai.js';
import { decide } from './decide.js';
import { AI_MODE } from './mode.js';
import { pilot } from './pilot.js';

export { AI_MODE };

/**
 * État d'un bot : nombres et booléens uniquement (JSON pur). `target` = index de planète (de vaisseau pour HUNT),
 * −1 si aucune ; `goalX`/`goalY` = point d'attente (GOTO, IDLE sans planète). Le premier minuteur de décision est décalé par rang
 * pour que deux bots ne décident pas au même pas.
 */
export function createBotState(faction, rank) {
  return {
    faction,
    mode: AI_MODE.NONE,
    target: -1,
    phase: 0,
    decisionTimer: BOT_PROFILE.startDelay + (rank * BOT_PROFILE.decisionPeriod) / 2,
    modeTime: 0,
    fireDelay: 0,
    aimBias: 0,
    lastHealth: SHIP_MAX_HP,
    underFire: false,
    evadeTimer: 0,
    evadeAngle: 0, // direction de l'esquive en cours
    banMode: AI_MODE.NONE,
    banTarget: -1,
    banTimer: 0,
    goalX: 0,
    goalY: 0,
  };
}

/**
 * Fait agir chaque bot dont la faction n'est pas éliminée et dont le vaisseau est vivant : décision à échéance du
 * minuteur (en secondes), puis pilote à chaque pas. Un vaisseau mort remet le bot en mode NONE et force une
 * décision dès son respawn.
 */
export function updateAi(world, dt) {
  const { ai, ships, factions } = world;
  for (let k = 0; k < ai.length; k++) {
    const bot = ai[k];
    if (factions[bot.faction].eliminated) continue;
    const ship = ships[bot.faction];
    if (!ship.alive) {
      bot.mode = AI_MODE.NONE;
      bot.decisionTimer = 0;
      bot.evadeTimer = 0;
      continue;
    }
    bot.modeTime += dt;
    bot.decisionTimer -= dt;
    if (bot.banTimer > 0) bot.banTimer -= dt;
    if (bot.fireDelay > 0) bot.fireDelay -= dt;
    if (bot.evadeTimer > 0) bot.evadeTimer -= dt;
    if (bot.decisionTimer <= 0) {
      decide(world, bot, ship);
      bot.decisionTimer = BOT_PROFILE.decisionPeriod;
    }
    pilot(world, bot, ship);
  }
}
