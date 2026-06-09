import {
  TEAMS,
  GAME_PHASES,
  formatMatchTime,
  getWinningTeam,
} from "./gamestateRush.js";

// =========================
// DOM REFERENCES
// =========================

export const scoreP1El = document.getElementById("score-p1");
export const scoreP2El = document.getElementById("score-p2");

export const matchClockEl = document.getElementById("match-clock");
export const scoreP1LabelEl = document.getElementById("p1-score-label");
export const scoreP2LabelEl = document.getElementById("p2-score-label");

export const turnIndicatorEl = document.getElementById("turn-indicator");
export const turnDotEl = document.getElementById("turn-dot");
export const turnTextEl = document.getElementById("turn-text");

export const strengthWrapEl = document.getElementById("strength-bar-wrap");
export const strengthFillEl = document.getElementById("strength-fill");

export const goalOverlayEl = document.getElementById("goal-overlay");
export const goalTextEl = document.getElementById("goal-text");
export const scorerTextEl = document.getElementById("scorer-text");

export const winOverlayEl = document.getElementById("win-overlay");
export const winTitleEl = document.getElementById("win-title");
export const winSubEl = document.getElementById("win-sub");
export const matchStatsContentEl = document.getElementById("match-stats-content");

export const instructionEl = document.getElementById("instruction");
export const rushHelpEl = document.getElementById("rush-help");

export const restartBtnEl = document.getElementById("restart-btn");
export const quickRestartBtnEl = document.getElementById("quick-restart-btn");

// =========================
// TEAM UI
// =========================

export function updateTeamLabels(options = {}) {
  const {
    selectedTeamP1 = null,
    selectedTeamP2 = null,
    p1TeamIcon = "🔴",
    p2TeamIcon = "🔵",
  } = options;

  if (scoreP1LabelEl && selectedTeamP1) {
    scoreP1LabelEl.textContent = `${p1TeamIcon} ${selectedTeamP1.code || "J1"}`;
  }

  if (scoreP2LabelEl && selectedTeamP2) {
    scoreP2LabelEl.textContent = `${p2TeamIcon} ${selectedTeamP2.code || "J2"}`;
  }
}

export function updatePlayerDotColors(options = {}) {
  const {
    p1TeamColor = "#ff4444",
    p2TeamColor = "#3388ff",
  } = options;

  const p1Dot = document.querySelector(".score-side.p1 .player-dot");
  const p2Dot = document.querySelector(".score-side.p2 .player-dot");

  p1Dot?.style.setProperty("background", p1TeamColor);
  p1Dot?.style.setProperty("box-shadow", `0 0 8px ${p1TeamColor}`);

  p2Dot?.style.setProperty("background", p2TeamColor);
  p2Dot?.style.setProperty("box-shadow", `0 0 8px ${p2TeamColor}`);
}

// =========================
// SCOREBOARD / CLOCK
// =========================

export function updateScoreboard(gameState) {
  if (scoreP1El) scoreP1El.textContent = gameState.p1Score;
  if (scoreP2El) scoreP2El.textContent = gameState.p2Score;
}

export function updateMatchClockUI(gameState) {
  if (!matchClockEl) return;

  matchClockEl.textContent = formatMatchTime(gameState.matchTimeLeft);
}

// =========================
// TURN / POSSESSION
// =========================

export function updateTurnUI(gameState, options = {}) {
  const {
    p1TeamColor = "#ff4444",
    p2TeamColor = "#3388ff",
  } = options;

  if (!turnDotEl || !turnTextEl) return;

  const activeColor = gameState.ballCarrier === TEAMS.P2 ? p2TeamColor : p1TeamColor;

  turnDotEl.style.background = activeColor;
  turnDotEl.style.boxShadow = `0 0 8px ${activeColor}`;

  if (gameState.gamePhase === GAME_PHASES.PLAYING) {
    if (gameState.ballCarrier === TEAMS.P1) {
      turnTextEl.textContent = "POSESIÓN J1";
    } else if (gameState.ballCarrier === TEAMS.P2) {
      turnTextEl.textContent = "POSESIÓN IA";
    } else {
      turnTextEl.textContent = "MODO RUSH VS IA";
    }
  }
}

// =========================
// STRENGTH BAR
// =========================

export function showStrengthBar() {
  strengthWrapEl?.classList.add("visible");
}

export function hideStrengthBar() {
  strengthWrapEl?.classList.remove("visible");

  if (strengthFillEl) {
    strengthFillEl.style.width = "0%";
  }
}

export function updateStrengthBarPercent(percent = 0) {
  if (!strengthFillEl) return;

  const safePercent = Math.max(0, Math.min(100, percent));
  strengthFillEl.style.width = `${safePercent}%`;
}

export function updateStrengthBarFromDrag(dragStart, dragCurrent, maxDrag) {
  if (!dragStart || !dragCurrent || !maxDrag) return;

  showStrengthBar();

  const drag = dragStart.distanceTo(dragCurrent);
  const percent = Math.min(drag / maxDrag, 1) * 100;

  updateStrengthBarPercent(percent);
}

// =========================
// GOAL OVERLAY
// =========================

export function showGoalOverlay(options = {}) {
  const {
    scorerText = "",
    scoringTeam = TEAMS.P1,
    p1TeamColor = "#ff4444",
    p2TeamColor = "#3388ff",
  } = options;

  if (goalTextEl) {
    goalTextEl.textContent = "⚽ ¡GOL!";
    goalTextEl.style.color = scoringTeam === TEAMS.P1 ? p1TeamColor : p2TeamColor;
  }

  if (scorerTextEl) {
    scorerTextEl.textContent = scorerText;
  }

  goalOverlayEl?.classList.add("show");
}

export function hideGoalOverlay() {
  goalOverlayEl?.classList.remove("show");
}

// =========================
// MATCH STATS / WIN OVERLAY
// =========================

export function renderMatchStats(gameState, options = {}) {
  const {
    p1TeamIcon = "🔴",
    p2TeamIcon = "🔵",
    p1TeamName = "JUGADOR 1",
    p2TeamName = "IA",
  } = options;

  if (!matchStatsContentEl) return;

  if (!gameState.goalEvents.length) {
    matchStatsContentEl.className = "stats-empty";
    matchStatsContentEl.textContent = "Sin goles registrados";
    return;
  }

  const p1Goals = gameState.goalEvents.filter((goal) => goal.teamNumber === TEAMS.P1);
  const p2Goals = gameState.goalEvents.filter((goal) => goal.teamNumber === TEAMS.P2);

  const renderGoalList = (goals, side = "left") => {
    if (!goals.length) {
      return '<div class="google-goal-item">Sin goles</div>';
    }

    return goals
      .map((goal) => {
        const minute = Math.max(1, Math.ceil(goal.elapsedSeconds / 60));
        const minuteHtml = `<span class="goal-minute">${minute}'</span>`;
        const scorerHtml = `<span>${goal.scorer}</span>`;

        return side === "right"
          ? `<div class="google-goal-item">${scorerHtml} ${minuteHtml}</div>`
          : `<div class="google-goal-item">${minuteHtml} ${scorerHtml}</div>`;
      })
      .join("");
  };

  matchStatsContentEl.className = "";
  matchStatsContentEl.innerHTML = `
    <div class="google-goals-summary">
      <div class="google-score-row">
        <div class="google-team-side">
          <div class="google-team-flag">${p1TeamIcon}</div>
          <div class="google-team-name">${p1TeamName}</div>
          <div class="google-team-role">Jugador 1</div>
        </div>

        <div class="google-score">
          <span>${gameState.p1Score}</span>
          <span>-</span>
          <span>${gameState.p2Score}</span>
        </div>

        <div class="google-team-side right">
          <div class="google-team-flag">${p2TeamIcon}</div>
          <div class="google-team-name">${p2TeamName}</div>
          <div class="google-team-role">IA</div>
        </div>
      </div>

      <div class="google-goals-title">Goles</div>

      <div class="google-goals-row">
        <div class="google-goals-list">
          ${renderGoalList(p1Goals, "left")}
        </div>
        <div class="google-goals-divider"></div>
        <div class="google-goals-list right">
          ${renderGoalList(p2Goals, "right")}
        </div>
      </div>
    </div>
  `;
}

export function showWinOverlay(gameState, options = {}) {
  const {
    p1TeamName = "JUGADOR 1",
    p2TeamName = "IA",
  } = options;

  const winner = getWinningTeam(gameState);

  if (winTitleEl) {
    if (winner === TEAMS.P1) {
      winTitleEl.textContent = `🎉 ${p1TeamName} GANA`;
    } else if (winner === TEAMS.P2) {
      winTitleEl.textContent = `🤖 ${p2TeamName} GANA`;
    } else {
      winTitleEl.textContent = "🤝 EMPATE";
    }
  }

  if (winSubEl) {
    winSubEl.textContent = `Marcador final ${gameState.p1Score} - ${gameState.p2Score}`;
  }

  renderMatchStats(gameState, options);
  winOverlayEl?.classList.add("show");
}

export function hideWinOverlay() {
  winOverlayEl?.classList.remove("show");
}

// =========================
// INSTRUCTIONS
// =========================

export function updateInstructionText() {
  if (instructionEl) {
    instructionEl.textContent =
      "J1: WASD para moverte · Space dispara al frente · La IA roba, conduce y chuta";
  }

  if (rushHelpEl) {
    rushHelpEl.textContent =
      "J1 WASD · Space dispara al frente · La IA presiona, roba y chuta";
  }
}

export function setInstructionText(text = "") {
  if (!instructionEl) return;

  instructionEl.textContent = text;
}

// =========================
// BUTTON EVENTS
// =========================

export function onRestartPressed(callback) {
  restartBtnEl?.addEventListener("click", callback);
}

export function onQuickRestartPressed(callback) {
  quickRestartBtnEl?.addEventListener("click", callback);
}

// =========================
// FULL UI REFRESH
// =========================

export function refreshFullUI(gameState, options = {}) {
  updateScoreboard(gameState);
  updateMatchClockUI(gameState);
  updateTurnUI(gameState, options);
}