

// =========================
// MATCH CONSTANTS
// =========================

export const MATCH_DURATION = 90;
export const STOP_SPEED = 0.12;

export const GAME_PHASES = Object.freeze({
  PLAYING: "playing",
  GOAL: "goal",
  WIN: "win",
  DRAGGING: "dragging",
  IDLE: "idle",
});

export const TEAMS = Object.freeze({
  P1: 1,
  P2: 2,
});

// =========================
// STATE
// =========================

export const gameState = {
  p1Score: 0,
  p2Score: 0,

  currentTurn: TEAMS.P1,
  gamePhase: GAME_PHASES.PLAYING,

  matchTimeLeft: MATCH_DURATION,
  matchStartTime: performance.now(),
  matchPausedAt: null,
  matchPausedTotal: 0,

  goalEvents: [],
  goalEventLocked: false,

  ballCarrier: null,
  kickChargingPlayer: null,
  kickChargeStart: 0,

  playerPickupBlockedUntil: 0,
  aiPickupBlockedUntil: 0,
  contactStealBlockedUntil: 0,

  controlledPlayerIndex: 0,
  aiCarrierIndex: 0,

  lastTouchTeam: TEAMS.P1,
  lastTouchIndex: 0,
};

// =========================
// BASIC HELPERS
// =========================

export function isPlaying(state = gameState) {
  return state.gamePhase === GAME_PHASES.PLAYING;
}

export function isGoalPhase(state = gameState) {
  return state.gamePhase === GAME_PHASES.GOAL;
}

export function isWinPhase(state = gameState) {
  return state.gamePhase === GAME_PHASES.WIN;
}

export function getOpponentTeam(teamNumber) {
  return teamNumber === TEAMS.P1 ? TEAMS.P2 : TEAMS.P1;
}

export function getWinningTeam(state = gameState) {
  if (state.p1Score > state.p2Score) return TEAMS.P1;
  if (state.p2Score > state.p1Score) return TEAMS.P2;
  return null;
}

export function formatMatchTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// =========================
// TIMER
// =========================

export function updateMatchClock(state = gameState) {
  const now = state.matchPausedAt ?? performance.now();
  const elapsed = (now - state.matchStartTime - state.matchPausedTotal) / 1000;

  state.matchTimeLeft = Math.max(0, MATCH_DURATION - elapsed);

  return state.matchTimeLeft;
}

export function getMatchElapsedSeconds(state = gameState) {
  updateMatchClock(state);

  return Math.max(0, Math.min(MATCH_DURATION, MATCH_DURATION - state.matchTimeLeft));
}

export function pauseMatchTimer(state = gameState) {
  if (state.matchPausedAt !== null) return;

  state.matchPausedAt = performance.now();
  updateMatchClock(state);
}

export function resumeMatchTimer(state = gameState) {
  if (state.matchPausedAt === null) return;

  state.matchPausedTotal += performance.now() - state.matchPausedAt;
  state.matchPausedAt = null;
  updateMatchClock(state);
}

export function shouldEndMatchByTime(state = gameState) {
  updateMatchClock(state);
  return state.matchTimeLeft <= 0 && state.gamePhase !== GAME_PHASES.WIN;
}

// =========================
// TOUCH / POSSESSION
// =========================

export function setLastTouch(teamNumber, playerIndex = 0, state = gameState) {
  state.lastTouchTeam = teamNumber;
  state.lastTouchIndex = Math.max(0, Math.min(3, playerIndex));
}

export function setBallCarrier(teamNumber, state = gameState) {
  state.ballCarrier = teamNumber;

  if (teamNumber === TEAMS.P1 || teamNumber === TEAMS.P2) {
    state.currentTurn = teamNumber;
  }
}

export function clearBallCarrier(state = gameState) {
  state.ballCarrier = null;
}

export function blockPlayerPickup(ms = 420, state = gameState) {
  state.playerPickupBlockedUntil = performance.now() + ms;
}

export function blockAIPickup(ms = 480, state = gameState) {
  state.aiPickupBlockedUntil = performance.now() + ms;
}

export function blockContactSteal(ms = 380, state = gameState) {
  state.contactStealBlockedUntil = performance.now() + ms;
}

// =========================
// GOALS
// =========================

export function addScore(teamNumber, state = gameState) {
  if (teamNumber === TEAMS.P1) {
    state.p1Score += 1;
  } else if (teamNumber === TEAMS.P2) {
    state.p2Score += 1;
  }
}

export function registerGoalEvent(goalData = {}, state = gameState) {
  const scoreKey = `${state.p1Score}-${state.p2Score}`;

  if (state.goalEventLocked) return null;
  if (state.goalEvents.some((goal) => goal.scoreKey === scoreKey)) return null;

  state.goalEventLocked = true;

  const elapsedSeconds = getMatchElapsedSeconds(state);

  const goalEvent = {
    scoreKey,
    rawTime: performance.now(),
    elapsedSeconds,
    time: formatMatchTime(elapsedSeconds),
    teamNumber: goalData.teamNumber ?? state.currentTurn,
    team: goalData.team ?? "",
    scorer: goalData.scorer ?? "",
  };

  state.goalEvents.push(goalEvent);

  return goalEvent;
}

export function enterGoalPhase(state = gameState) {
  state.gamePhase = GAME_PHASES.GOAL;
  pauseMatchTimer(state);
  state.ballCarrier = null;
  state.kickChargingPlayer = null;
  state.kickChargeStart = 0;
  state.playerPickupBlockedUntil = 0;
  state.aiPickupBlockedUntil = 0;
}

export function exitGoalPhase(state = gameState) {
  state.goalEventLocked = false;
  state.ballCarrier = null;
  state.kickChargingPlayer = null;
  state.kickChargeStart = 0;
  state.playerPickupBlockedUntil = 0;
  state.aiPickupBlockedUntil = 0;
  state.contactStealBlockedUntil = 0;
  state.controlledPlayerIndex = 0;
  state.aiCarrierIndex = 0;
  state.gamePhase = GAME_PHASES.PLAYING;

  resumeMatchTimer(state);
}

// =========================
// MATCH END / RESET
// =========================

export function endMatchByTime(state = gameState) {
  if (state.gamePhase === GAME_PHASES.WIN) return getWinningTeam(state);

  state.gamePhase = GAME_PHASES.WIN;
  pauseMatchTimer(state);

  state.ballCarrier = null;
  state.kickChargingPlayer = null;
  state.kickChargeStart = 0;

  return getWinningTeam(state);
}

export function resetGameState(state = gameState) {
  state.p1Score = 0;
  state.p2Score = 0;

  state.currentTurn = TEAMS.P1;
  state.gamePhase = GAME_PHASES.PLAYING;

  state.matchTimeLeft = MATCH_DURATION;
  state.matchStartTime = performance.now();
  state.matchPausedAt = null;
  state.matchPausedTotal = 0;

  state.goalEvents = [];
  state.goalEventLocked = false;

  state.ballCarrier = null;
  state.kickChargingPlayer = null;
  state.kickChargeStart = 0;

  state.playerPickupBlockedUntil = 0;
  state.aiPickupBlockedUntil = 0;
  state.contactStealBlockedUntil = 0;

  state.controlledPlayerIndex = 0;
  state.aiCarrierIndex = 0;

  state.lastTouchTeam = TEAMS.P1;
  state.lastTouchIndex = 0;

  return state;
}