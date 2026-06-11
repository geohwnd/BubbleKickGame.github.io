import * as THREE from "three";

import {
  FIELD_W,
  GOAL_W,
  PLAYER_BODY_RADIUS,
  clampFieldTarget,
} from "./physicsRush.js";

import { TEAMS, GAME_PHASES } from "./gamestateRush.js";

// =========================
// AI CONFIG · VOLTA / FIFA STREET STYLE
// =========================

export const AI_CONFIG = {
  reactionTime: 145,

  dribbleSpeed: 2.8,
  defenseSpeed: 3.05,
  supportSpeed: 2.85,
  interceptSpeed: 3.7,
  pressSpeed: 4.0,

  shootRange: 4.85,
  shootCooldown: 780,
  shootForceMin: 10,
  shootForceMax: 18.5,

  passCooldown: 650,
  passRange: 5.4,
  passForceMin: 7.5,
  passForceMax: 12.5,
  passPressureDistance: 1.65,
  passForwardBonus: 0.75,

  // Regla clave: NO todos persiguen la pelota.
  // Solo se presiona cuando el rival ya cruzó media cancha o está cerca del arco.
  pressureDistance: 3.4,
  idlePressDistance: 8.0,
  idleCarrierSpeed: 0.28,
  midfieldPressX: 0.15,
  dangerGoalDistance: 5.3,
  looseBallChaseDistance: 3.05,

  defensiveBlockRatio: 0.5,
  markingGoalBias: 0.38,
  coverLaneWidth: 2.55,
  supportWidth: 2.75,
  supportDepth: 1.9,

  dashPressDistance: 2.5,
  dashLooseBallDistance: 3.0,
  attackDashDistance: 4.6,
  dashChance: 0.18,

  keeperSpeed: 0.9,
  keeperSaveChance: 0.72,
  keeperClearForce: 11.5,
};

// =========================
// AI MEMORY
// =========================

export const aiMemory = {
  nextDecisionAt: 0,
  moveTarget: new THREE.Vector3(0, PLAYER_BODY_RADIUS, 0),
  wantsShoot: false,
  wantsPass: false,
  passTargetBody: null,
  lastShotAt: 0,
  lastPassAt: 0,
  tacticalMode: "shape",
};

// =========================
// PUBLIC MAIN AI
// =========================

export function updateRushAI(context) {
  const {
    gameState,
    ballBody,

    playerTeamBodies,
    aiTeamBodies,
    playerOutfieldBodies,
    aiOutfieldBodies,

    p1KeeperBody,
    p2KeeperBody,

    getControlledPlayerBody,
    getAIControlledBody,
    setAIControlledBodyIndex,

    setLastTouch,
    setBallCarrier,

    tryDash,
    playKickSound,
    playCatchForBody,
  } = context;

  if (!gameState || gameState.gamePhase !== GAME_PHASES.PLAYING) return;

  const now = performance.now();

  if (now >= aiMemory.nextDecisionAt) {
    aiMemory.nextDecisionAt = now + AI_CONFIG.reactionTime + Math.random() * 90;
    aiMemory.wantsShoot = false;
    aiMemory.wantsPass = false;
    aiMemory.passTargetBody = null;

    if (gameState.ballCarrier === TEAMS.P2) {
      decideAIInAttack({
        getAIControlledBody,
        playerOutfieldBodies,
        aiOutfieldBodies,
      });
    } else if (gameState.ballCarrier === TEAMS.P1) {
      decideAIInDefense({
        ballBody,
        aiOutfieldBodies,
        getControlledPlayerBody,
        setAIControlledBodyIndex,
        tryDash,
      });
    } else {
      decideAILooseBall({
        ballBody,
        aiOutfieldBodies,
        setAIControlledBodyIndex,
        tryDash,
      });
    }
  }

  const activeAI = getAIControlledBody();

  const activeSpeed =
    gameState.ballCarrier === TEAMS.P2
      ? AI_CONFIG.dribbleSpeed
      : aiMemory.tacticalMode === "press"
      ? AI_CONFIG.pressSpeed
      : aiMemory.tacticalMode === "loose"
      ? AI_CONFIG.interceptSpeed
      : AI_CONFIG.defenseSpeed;

  moveBodyArcadeTo(activeAI, aiMemory.moveTarget, activeSpeed, 0.12);

  if (gameState.ballCarrier === TEAMS.P2) {
    maybeDashToGoal({ body: activeAI, tryDash });

    if (aiMemory.wantsPass && aiMemory.passTargetBody) {
      aiPass({
        gameState,
        ballBody,
        body: activeAI,
        targetBody: aiMemory.passTargetBody,
        setLastTouch,
        setBallCarrier,
        playKickSound,
      });
    } else if (aiMemory.wantsShoot) {
      aiShoot({
        gameState,
        ballBody,
        body: activeAI,
        setLastTouch,
        setBallCarrier,
        playKickSound,
      });
    }
  }

  updateAITeammates({
    gameState,
    ballBody,
    aiOutfieldBodies,
    playerOutfieldBodies,
    getAIControlledBody,
    getControlledPlayerBody,
    tryDash,
  });

  if (p1KeeperBody) {
    updateKeeperAI({
      body: p1KeeperBody,
      teamNumber: TEAMS.P1,
      gameState,
      ballBody,
      playKickSound,
      playCatchForBody,
      setLastTouch,
    });
  }

  if (p2KeeperBody) {
    updateKeeperAI({
      body: p2KeeperBody,
      teamNumber: TEAMS.P2,
      gameState,
      ballBody,
      playKickSound,
      playCatchForBody,
      setLastTouch,
    });
  }
}

// =========================
// DECISIONS
// =========================

function decideAIInAttack(context) {
  const { getAIControlledBody, playerOutfieldBodies, aiOutfieldBodies } =
    context;

  const carrier = getAIControlledBody();
  const attackGoal = getGoalTargetForPlayer(TEAMS.P2);
  const goalDir = new THREE.Vector3().subVectors(attackGoal, carrier.pos);
  goalDir.y = 0;

  if (goalDir.lengthSq() > 0.001) goalDir.normalize();

  const closestDefender = getClosestBodyTo(carrier.pos, playerOutfieldBodies);
  const pressure = closestDefender?.dist ?? Infinity;
  const side = new THREE.Vector3(-goalDir.z, 0, goalDir.x);
  const lateralDirection = carrier.pos.z >= 0 ? -1 : 1;

  const bestPass = findBestPassTarget({
    carrier,
    teammates: aiOutfieldBodies,
    playerOutfieldBodies,
    attackGoal,
  });

  const now = performance.now();
  const canPassAgain = now - aiMemory.lastPassAt > AI_CONFIG.passCooldown;
  const isUnderPressure = pressure < AI_CONFIG.passPressureDistance;
  const passIsUseful = bestPass.body && bestPass.score > 0.55;

  if (canPassAgain && passIsUseful && (isUnderPressure || bestPass.isForward)) {
    aiMemory.wantsPass = true;
    aiMemory.passTargetBody = bestPass.body;
    aiMemory.tacticalMode = "pass";

    const passTarget = bestPass.body.pos.clone();
    aiMemory.moveTarget.copy(clampFieldTarget(passTarget, 0.9));
    return;
  }

  // Con balón: conduce buscando ángulo, no directo al centro.
  const carryTarget = carrier.pos
    .clone()
    .addScaledVector(goalDir, AI_CONFIG.supportDepth + 0.7)
    .addScaledVector(side, lateralDirection * 1.25);

  aiMemory.moveTarget.copy(clampFieldTarget(carryTarget, 0.9));
  aiMemory.tacticalMode = "attack";

  const distToGoal = carrier.pos.distanceTo(attackGoal);
  const isCentral = Math.abs(carrier.pos.z) < GOAL_W / 2 + 0.45;
  const isDeepEnough = carrier.pos.x < -1.35;
  const canShootAgain = now - aiMemory.lastShotAt > AI_CONFIG.shootCooldown;

  aiMemory.wantsShoot =
    canShootAgain &&
    distToGoal < AI_CONFIG.shootRange &&
    (isCentral || isDeepEnough) &&
    pressure > 0.85;
}
function aiPass(context) {
  const {
    gameState,
    ballBody,
    body,
    targetBody,
    setLastTouch,
    setBallCarrier,
    playKickSound,
  } = context;

  if (gameState.ballCarrier !== TEAMS.P2) return;
  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;
  if (!targetBody || targetBody === body) return;

  const now = performance.now();
  if (now - aiMemory.lastPassAt < AI_CONFIG.passCooldown) return;

  const passDir = new THREE.Vector3().subVectors(targetBody.pos, body.pos);
  passDir.y = 0;

  if (passDir.lengthSq() < 0.001) return;

  const passDistance = passDir.length();
  passDir.normalize();

  const force = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(
      AI_CONFIG.passForceMin,
      AI_CONFIG.passForceMax,
      passDistance / AI_CONFIG.passRange
    ),
    AI_CONFIG.passForceMin,
    AI_CONFIG.passForceMax
  );

  setLastTouch?.(TEAMS.P2, gameState.aiCarrierIndex);
  setBallCarrier?.(null);

  gameState.ballCarrier = null;
  gameState.currentTurn = TEAMS.P2;
  gameState.aiPickupBlockedUntil = now + 260;

  aiMemory.wantsPass = false;
  aiMemory.passTargetBody = null;
  aiMemory.lastPassAt = now;

  ballBody.pos
    .copy(body.pos)
    .addScaledVector(passDir, body.r + ballBody.r + 0.34);

  ballBody.pos.y = ballBody.r;
  ballBody.vel.copy(passDir).multiplyScalar(force);
  ballBody.vel.y = 0.38;

  playKickSound?.(0.52);
}

function decideAIInDefense(context) {
  const {
    ballBody,
    aiOutfieldBodies,
    getControlledPlayerBody,
    setAIControlledBodyIndex,
    tryDash,
  } = context;

  const playerCarrier = getControlledPlayerBody();
  const ownGoal = getOwnGoalForPlayer(TEAMS.P2);
  const closestToCarrier = getClosestBodyTo(
    playerCarrier.pos,
    aiOutfieldBodies
  );
  const distanceToOwnGoal = playerCarrier.pos.distanceTo(ownGoal);

  // P1 ataca hacia +X. La IA solo presiona fuerte si P1 ya pasó media cancha
  // o si está cerca del arco. Antes de eso, mantiene marca y bloque.
  const carrierCrossedMidfield = playerCarrier.pos.x > AI_CONFIG.midfieldPressX;
  const carrierNearGoal = distanceToOwnGoal < AI_CONFIG.dangerGoalDistance;
  const carrierInOwnHalf = playerCarrier.pos.x < -AI_CONFIG.midfieldPressX;
  const carrierIsIdle =
    playerCarrier.vel.lengthSq() <
    AI_CONFIG.idleCarrierSpeed * AI_CONFIG.idleCarrierSpeed;

  const shouldIdlePress =
    carrierInOwnHalf &&
    carrierIsIdle &&
    closestToCarrier.dist < AI_CONFIG.idlePressDistance;

  const shouldPress =
    shouldIdlePress ||
    ((carrierCrossedMidfield || carrierNearGoal) &&
      closestToCarrier.dist < AI_CONFIG.pressureDistance);

  if (shouldPress) {
    setAIControlledBodyIndex(closestToCarrier.index);
    aiMemory.tacticalMode = "press";

    // Presiona al espacio delante del atacante para cortar avance.
    const playerToGoal = new THREE.Vector3().subVectors(
      getGoalTargetForPlayer(TEAMS.P1),
      playerCarrier.pos
    );
    playerToGoal.y = 0;
    if (playerToGoal.lengthSq() > 0.001) playerToGoal.normalize();

    aiMemory.moveTarget
      .copy(playerCarrier.pos)
      .addScaledVector(playerToGoal, shouldIdlePress ? 0.28 : 0.62);

    clampFieldTarget(aiMemory.moveTarget, 0.8);

    const dashDir = new THREE.Vector3().subVectors(
      playerCarrier.pos,
      closestToCarrier.body.pos
    );
    dashDir.y = 0;

    const dashChance = shouldIdlePress ? 0.42 : AI_CONFIG.dashChance;
    const dashDistance = shouldIdlePress
      ? AI_CONFIG.dashPressDistance + 0.65
      : AI_CONFIG.dashPressDistance;

    if (
      dashDir.lengthSq() > 0.001 &&
      closestToCarrier.dist < dashDistance &&
      Math.random() < dashChance
    ) {
      tryDash?.(closestToCarrier.body, dashDir);
    }
  } else {
    const bestBlocker = getBestDefensiveBlocker(
      aiOutfieldBodies,
      ballBody.pos,
      TEAMS.P2
    );
    setAIControlledBodyIndex(bestBlocker.index);
    aiMemory.tacticalMode = "shape";
    aiMemory.moveTarget.copy(getAIDefensivePoint(ballBody, 0));
  }
}

function decideAILooseBall(context) {
  const { ballBody, aiOutfieldBodies, setAIControlledBodyIndex, tryDash } =
    context;

  const closestToBall = getClosestBodyTo(ballBody.pos, aiOutfieldBodies);

  // Pelota suelta: ahí sí el más cercano va por la pelota.
  if (
    closestToBall.dist < AI_CONFIG.looseBallChaseDistance ||
    ballBody.pos.x > -0.4
  ) {
    setAIControlledBodyIndex(closestToBall.index);
    aiMemory.tacticalMode = "loose";
    aiMemory.moveTarget.copy(ballBody.pos);
    clampFieldTarget(aiMemory.moveTarget, 0.8);

    const dashToBall = new THREE.Vector3().subVectors(
      ballBody.pos,
      closestToBall.body.pos
    );
    dashToBall.y = 0;

    if (
      dashToBall.lengthSq() > 0.001 &&
      closestToBall.dist < AI_CONFIG.dashLooseBallDistance &&
      Math.random() < 0.35
    ) {
      tryDash?.(closestToBall.body, dashToBall);
    }
  } else {
    const bestBlocker = getBestDefensiveBlocker(
      aiOutfieldBodies,
      ballBody.pos,
      TEAMS.P2
    );
    setAIControlledBodyIndex(bestBlocker.index);
    aiMemory.tacticalMode = "shape";
    aiMemory.moveTarget.copy(getAIDefensivePoint(ballBody, 0));
  }
}

// =========================
// TEAMMATES · VOLTA STYLE
// =========================

export function updatePlayerTeammateAI(context) {
  const {
    body,
    gameState,
    ballBody,
    playerTeamBodies,
    getControlledPlayerBody,
    getAIControlledBody,
    tryDash,
  } = context;

  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;
  if (body === getControlledPlayerBody()) return;

  const bodyIndex = playerTeamBodies.indexOf(body);
  const controlledBody = getControlledPlayerBody();
  const aiCarrier = getAIControlledBody();
  let target;

  if (gameState.ballCarrier === TEAMS.P2) {
    // Si la IA trae la pelota, tus compañeros NO se amontonan.
    // Uno puede cerrar si la IA ya cruzó media cancha; los demás marcan carril.
    const supportBodies = playerTeamBodies.filter(
      (item) => item !== controlledBody
    );
    const closestToAI = getClosestBodyTo(aiCarrier.pos, supportBodies);
    const aiCrossedMidfield = aiCarrier.pos.x < -AI_CONFIG.midfieldPressX;
    const aiNearGoal =
      aiCarrier.pos.distanceTo(getOwnGoalForPlayer(TEAMS.P1)) <
      AI_CONFIG.dangerGoalDistance;
    const shouldPress =
      closestToAI.body === body &&
      closestToAI.dist < AI_CONFIG.pressureDistance &&
      (aiCrossedMidfield || aiNearGoal);

    if (shouldPress) {
      const aiToGoal = new THREE.Vector3().subVectors(
        getGoalTargetForPlayer(TEAMS.P2),
        aiCarrier.pos
      );
      aiToGoal.y = 0;
      if (aiToGoal.lengthSq() > 0.001) aiToGoal.normalize();

      target = aiCarrier.pos.clone().addScaledVector(aiToGoal, 0.55);
      clampFieldTarget(target, 0.8);
    } else {
      const lane =
        bodyIndex === 1 ? -AI_CONFIG.coverLaneWidth : AI_CONFIG.coverLaneWidth;
      target = getPlayerDefensivePoint(ballBody, lane);
    }
  } else if (gameState.ballCarrier === TEAMS.P1) {
    // Tu equipo con pelota: compañeros se abren para recibir, estilo Volta.
    const lane =
      bodyIndex === 1 ? -AI_CONFIG.supportWidth : AI_CONFIG.supportWidth;

    target = getPlayerAttackSupportPoint({
      carrier: controlledBody,
      laneOffset: lane,
    });

    const toGoal = new THREE.Vector3().subVectors(
      getGoalTargetForPlayer(TEAMS.P1),
      controlledBody.pos
    );
    toGoal.y = 0;

    if (toGoal.lengthSq() > 0.001) {
      toGoal.normalize();
      target.addScaledVector(toGoal, 0.35);
    }

    clampFieldTarget(target, 0.9);
  } else {
    // Pelota suelta: solo el más cercano va si está cerca; el resto cubre.
    const closest = getClosestBodyTo(ballBody.pos, playerTeamBodies);

    if (
      closest.body === body &&
      closest.dist < AI_CONFIG.looseBallChaseDistance
    ) {
      target = ballBody.pos;
    } else {
      const lane =
        bodyIndex === 1 ? -AI_CONFIG.coverLaneWidth : AI_CONFIG.coverLaneWidth;
      target = getPlayerDefensivePoint(ballBody, lane);
    }
  }

  const speed =
    gameState.ballCarrier === TEAMS.P2
      ? AI_CONFIG.defenseSpeed
      : AI_CONFIG.supportSpeed;

  moveBodyArcadeTo(body, target, speed, 0.09);

  if (gameState.ballCarrier === TEAMS.P2) {
    const dashDir = new THREE.Vector3().subVectors(aiCarrier.pos, body.pos);
    dashDir.y = 0;

    if (
      dashDir.lengthSq() > 0.001 &&
      body.pos.distanceTo(aiCarrier.pos) < AI_CONFIG.dashPressDistance &&
      Math.random() < 0.01
    ) {
      tryDash?.(body, dashDir);
    }
  }
}

function updateAITeammates(context) {
  const {
    gameState,
    ballBody,
    aiOutfieldBodies,
    playerOutfieldBodies,
    getAIControlledBody,
    getControlledPlayerBody,
    tryDash,
  } = context;

  const activeAI = getAIControlledBody();
  const playerCarrier = getControlledPlayerBody();

  aiOutfieldBodies.forEach((body, index) => {
    if (body === activeAI) return;

    let target;

    if (gameState.ballCarrier === TEAMS.P1) {
      // Si el jugador trae la pelota, uno presiona solo si ya cruzó media cancha.
      // Los demás marcan jugadores/carriles, no pelota.
      const closestToCarrier = getClosestBodyTo(
        playerCarrier.pos,
        aiOutfieldBodies
      );
      const carrierCrossedMidfield =
        playerCarrier.pos.x > AI_CONFIG.midfieldPressX;
      const carrierNearGoal =
        playerCarrier.pos.distanceTo(getOwnGoalForPlayer(TEAMS.P2)) <
        AI_CONFIG.dangerGoalDistance;
      const shouldPress =
        closestToCarrier.body === body &&
        closestToCarrier.dist < AI_CONFIG.pressureDistance &&
        (carrierCrossedMidfield || carrierNearGoal);

      if (shouldPress) {
        const playerToGoal = new THREE.Vector3().subVectors(
          getGoalTargetForPlayer(TEAMS.P1),
          playerCarrier.pos
        );
        playerToGoal.y = 0;
        if (playerToGoal.lengthSq() > 0.001) playerToGoal.normalize();

        target = playerCarrier.pos.clone().addScaledVector(playerToGoal, 0.58);
        clampFieldTarget(target, 0.8);
      } else {
        const markTarget = playerOutfieldBodies[index] || playerCarrier;
        const lane = index % 2 === 0 ? -0.35 : 0.35;
        target = getMarkingPoint(markTarget, TEAMS.P2, lane);
      }
    } else if (gameState.ballCarrier === TEAMS.P2) {
      // IA con pelota: compañeros se abren, no se pegan al balón.
      const lane =
        index % 2 === 0 ? -AI_CONFIG.supportWidth : AI_CONFIG.supportWidth;

      target = getAIAttackSupportPoint({
        carrier: activeAI,
        laneOffset: lane,
      });
    } else {
      // Pelota suelta: el más cercano va; los demás forman bloque.
      const closest = getClosestBodyTo(ballBody.pos, aiOutfieldBodies);

      if (
        closest.body === body &&
        closest.dist < AI_CONFIG.looseBallChaseDistance
      ) {
        target = ballBody.pos;
      } else {
        const lane =
          index % 2 === 0
            ? -AI_CONFIG.coverLaneWidth
            : AI_CONFIG.coverLaneWidth;
        target = getAIDefensivePoint(ballBody, lane);
      }
    }

    const speed =
      gameState.ballCarrier === TEAMS.P1
        ? AI_CONFIG.defenseSpeed
        : AI_CONFIG.supportSpeed;

    moveBodyArcadeTo(body, target, speed, 0.09);

    if (gameState.ballCarrier === TEAMS.P1) {
      const dashDir = new THREE.Vector3().subVectors(
        playerCarrier.pos,
        body.pos
      );
      dashDir.y = 0;

      if (
        dashDir.lengthSq() > 0.001 &&
        body.pos.distanceTo(playerCarrier.pos) < AI_CONFIG.dashPressDistance &&
        Math.random() < 0.008
      ) {
        tryDash?.(body, dashDir);
      }
    }
  });
}

// =========================
// KEEPER
// =========================

export function updateKeeperAI(context) {
  const {
    body,
    teamNumber,
    gameState,
    ballBody,
    playKickSound,
    playCatchForBody,
    setLastTouch,
  } = context;

  if (!body || gameState.gamePhase !== GAME_PHASES.PLAYING) return;

  const isPlayerKeeper = teamNumber === TEAMS.P1;

  const keeperX = isPlayerKeeper ? -FIELD_W / 2 + 0.85 : FIELD_W / 2 - 0.85;

  const maxZ = GOAL_W / 2 - 0.32;

  if (body.keeperDirection === undefined) {
    body.keeperDirection = isPlayerKeeper ? 1 : -1;
  }

  body.facing.set(isPlayerKeeper ? 1 : -1, 0, 0);

  body.vel.x = THREE.MathUtils.lerp(body.vel.x, 0, 0.22);
  body.vel.z = THREE.MathUtils.lerp(
    body.vel.z,
    body.keeperDirection * AI_CONFIG.keeperSpeed,
    0.11
  );

  body.pos.x = THREE.MathUtils.lerp(body.pos.x, keeperX, 0.18);

  if (body.pos.z >= maxZ) {
    body.pos.z = maxZ;
    body.keeperDirection = -1;
  } else if (body.pos.z <= -maxZ) {
    body.pos.z = -maxZ;
    body.keeperDirection = 1;
  }

  keeperClearIfNeeded({
    body,
    teamNumber,
    gameState,
    ballBody,
    playKickSound,
    playCatchForBody,
    setLastTouch,
  });
}

function keeperClearIfNeeded(context) {
  const {
    body,
    teamNumber,
    gameState,
    ballBody,
    playKickSound,
    playCatchForBody,
    setLastTouch,
  } = context;

  if (gameState.ballCarrier) return;

  if (body.pos.distanceTo(ballBody.pos) > body.r + ballBody.r + 0.32) {
    return;
  }

  if (Math.random() > AI_CONFIG.keeperSaveChance) {
    body.vel.z += THREE.MathUtils.randFloatSpread(1.2);
    return;
  }

  setLastTouch?.(teamNumber, 3);
  playCatchForBody?.(body, "idle");

  const isPlayerKeeper = teamNumber === TEAMS.P1;
  const direction = isPlayerKeeper ? 1 : -1;

  const clearDir = new THREE.Vector3(
    direction,
    0,
    THREE.MathUtils.randFloatSpread(1.1)
  ).normalize();

  if (isPlayerKeeper) {
    gameState.playerPickupBlockedUntil = performance.now() + 520;
  } else {
    gameState.aiPickupBlockedUntil = performance.now() + 520;
  }

  ballBody.pos
    .copy(body.pos)
    .addScaledVector(clearDir, body.r + ballBody.r + 0.5);

  ballBody.pos.y = ballBody.r;
  ballBody.vel.copy(clearDir).multiplyScalar(AI_CONFIG.keeperClearForce);
  ballBody.vel.y = 0.75;

  playKickSound?.(0.58);
}

// =========================
// SHOOTING
// =========================

function aiShoot(context) {
  const {
    gameState,
    ballBody,
    body,
    setLastTouch,
    setBallCarrier,
    playKickSound,
  } = context;

  if (gameState.ballCarrier !== TEAMS.P2) return;
  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;

  const now = performance.now();

  if (now - aiMemory.lastShotAt < AI_CONFIG.shootCooldown) return;

  const goal = getGoalTargetForPlayer(TEAMS.P2);
  const dir = new THREE.Vector3().subVectors(goal, body.pos);

  dir.y = 0;

  if (dir.lengthSq() === 0) return;

  dir.normalize();

  const aimError = THREE.MathUtils.randFloatSpread(0.32);
  const cos = Math.cos(aimError);
  const sin = Math.sin(aimError);

  const aimedDir = new THREE.Vector3(
    dir.x * cos - dir.z * sin,
    0,
    dir.x * sin + dir.z * cos
  ).normalize();

  const distanceToGoal = body.pos.distanceTo(goal);

  const distanceBoost = THREE.MathUtils.clamp(1 - distanceToGoal / 7, 0, 1);

  const force = THREE.MathUtils.lerp(
    AI_CONFIG.shootForceMin,
    AI_CONFIG.shootForceMax,
    0.42 + distanceBoost * 0.45
  );

  setLastTouch?.(TEAMS.P2, gameState.aiCarrierIndex);

  setBallCarrier?.(null);

  gameState.ballCarrier = null;
  gameState.currentTurn = TEAMS.P2;
  aiMemory.wantsShoot = false;
  aiMemory.lastShotAt = now;
  gameState.aiPickupBlockedUntil = now + 480;

  ballBody.pos
    .copy(body.pos)
    .addScaledVector(aimedDir, body.r + ballBody.r + 0.42);
  ballBody.pos.y = ballBody.r;
  ballBody.vel.copy(aimedDir).multiplyScalar(force);
  ballBody.vel.y = 0.9;

  playKickSound?.(0.68);
}

// =========================
// VOLTA TARGETS
// =========================

function getGoalTargetForPlayer(playerNumber) {
  return playerNumber === TEAMS.P1
    ? new THREE.Vector3(FIELD_W / 2, PLAYER_BODY_RADIUS, 0)
    : new THREE.Vector3(-FIELD_W / 2, PLAYER_BODY_RADIUS, 0);
}

function getOwnGoalForPlayer(playerNumber) {
  return playerNumber === TEAMS.P1
    ? new THREE.Vector3(-FIELD_W / 2, PLAYER_BODY_RADIUS, 0)
    : new THREE.Vector3(FIELD_W / 2, PLAYER_BODY_RADIUS, 0);
}

function getAIDefensivePoint(ballBody, laneOffset = 0) {
  const ownGoal = getOwnGoalForPlayer(TEAMS.P2);

  const ballFlat = new THREE.Vector3(
    ballBody.pos.x,
    PLAYER_BODY_RADIUS,
    ballBody.pos.z
  );

  const target = ballFlat.clone().lerp(ownGoal, AI_CONFIG.defensiveBlockRatio);
  target.z += laneOffset;

  return clampFieldTarget(target, 0.85);
}

function getPlayerDefensivePoint(ballBody, laneOffset = 0) {
  const ownGoal = getOwnGoalForPlayer(TEAMS.P1);

  const ballFlat = new THREE.Vector3(
    ballBody.pos.x,
    PLAYER_BODY_RADIUS,
    ballBody.pos.z
  );

  const target = ballFlat.clone().lerp(ownGoal, AI_CONFIG.defensiveBlockRatio);
  target.z += laneOffset;

  return clampFieldTarget(target, 0.85);
}

function getMarkingPoint(attackerBody, defendingTeam, laneOffset = 0) {
  const ownGoal = getOwnGoalForPlayer(defendingTeam);

  const target = attackerBody.pos
    .clone()
    .lerp(ownGoal, AI_CONFIG.markingGoalBias);

  target.y = PLAYER_BODY_RADIUS;
  target.z += laneOffset;

  return clampFieldTarget(target, 0.85);
}

function getAIAttackSupportPoint(context) {
  const { carrier, laneOffset = 0 } = context;

  const attackGoal = getGoalTargetForPlayer(TEAMS.P2);
  const toGoal = new THREE.Vector3().subVectors(attackGoal, carrier.pos);

  toGoal.y = 0;

  if (toGoal.lengthSq() > 0.001) {
    toGoal.normalize();
  }

  const side = new THREE.Vector3(-toGoal.z, 0, toGoal.x);

  const target = carrier.pos
    .clone()
    .addScaledVector(toGoal, 1.65)
    .addScaledVector(side, laneOffset);

  return clampFieldTarget(target, 0.9);
}

function getPlayerAttackSupportPoint(context) {
  const { carrier, laneOffset = 0 } = context;

  const attackGoal = getGoalTargetForPlayer(TEAMS.P1);
  const toGoal = new THREE.Vector3().subVectors(attackGoal, carrier.pos);

  toGoal.y = 0;

  if (toGoal.lengthSq() > 0.001) {
    toGoal.normalize();
  }

  const side = new THREE.Vector3(-toGoal.z, 0, toGoal.x);

  const target = carrier.pos
    .clone()
    .addScaledVector(toGoal, 1.85)
    .addScaledVector(side, laneOffset);

  return clampFieldTarget(target, 0.9);
}

function findBestPassTarget(context) {
  const {
    carrier,
    teammates = [],
    playerOutfieldBodies = [],
    attackGoal,
  } = context;

  let bestBody = null;
  let bestScore = -Infinity;
  let bestIsForward = false;

  teammates.forEach((teammate) => {
    if (!teammate || teammate === carrier) return;

    const distance = carrier.pos.distanceTo(teammate.pos);
    if (distance > AI_CONFIG.passRange || distance < 1.05) return;

    const closestDefender = getClosestBodyTo(
      teammate.pos,
      playerOutfieldBodies
    );
    const defenderDistance = closestDefender?.dist ?? 999;

    const carrierGoalDistance = carrier.pos.distanceTo(attackGoal);
    const teammateGoalDistance = teammate.pos.distanceTo(attackGoal);
    const isForward =
      teammateGoalDistance + AI_CONFIG.passForwardBonus < carrierGoalDistance;

    const openScore = THREE.MathUtils.clamp(defenderDistance / 3.2, 0, 1);
    const distanceScore =
      1 - THREE.MathUtils.clamp(distance / AI_CONFIG.passRange, 0, 1);
    const forwardScore = isForward ? 0.45 : 0;

    const score = openScore * 0.55 + distanceScore * 0.25 + forwardScore;

    if (score > bestScore) {
      bestScore = score;
      bestBody = teammate;
      bestIsForward = isForward;
    }
  });

  return {
    body: bestBody,
    score: bestScore,
    isForward: bestIsForward,
  };
}

export function findBestPlayerPassTarget(context) {
  const { carrier, teammates = [], aiOutfieldBodies = [] } = context;

  if (!carrier || !teammates.length) {
    return {
      body: null,
      score: -Infinity,
      isForward: false,
    };
  }

  const attackGoal = getGoalTargetForPlayer(TEAMS.P1);

  return findBestPassTarget({
    carrier,
    teammates,
    playerOutfieldBodies: aiOutfieldBodies,
    attackGoal,
  });
}

// =========================
// MOVEMENT HELPERS
// =========================

export function moveBodyArcadeTo(body, target, speed, accel = 0.12) {
  if (!body || !target) return;

  const dir = new THREE.Vector3().subVectors(target, body.pos);
  dir.y = 0;

  if (dir.lengthSq() > 0.04) {
    dir.normalize();

    body.facing.copy(dir);

    body.vel.x = THREE.MathUtils.lerp(body.vel.x, dir.x * speed, accel);
    body.vel.z = THREE.MathUtils.lerp(body.vel.z, dir.z * speed, accel);
  } else {
    body.vel.x *= 0.88;
    body.vel.z *= 0.88;
  }
}

function maybeDashToGoal(context) {
  const { body, tryDash } = context;

  const attackGoal = getGoalTargetForPlayer(TEAMS.P2);
  const distToGoal = body.pos.distanceTo(attackGoal);

  const dashToGoal = new THREE.Vector3().subVectors(attackGoal, body.pos);
  dashToGoal.y = 0;

  const now = performance.now();

  if (
    dashToGoal.lengthSq() > 0.001 &&
    distToGoal < AI_CONFIG.attackDashDistance &&
    Math.abs(body.pos.z) < GOAL_W / 2 + 1.15 &&
    now >= body.dashCooldownUntil
  ) {
    tryDash?.(body, dashToGoal);
  }
}

function getBestDefensiveBlocker(bodies = [], ballPos, defendingTeam) {
  if (!bodies.length) {
    return {
      body: null,
      index: 0,
      dist: Infinity,
    };
  }

  const ownGoal = getOwnGoalForPlayer(defendingTeam);
  const ballFlat = ballPos.clone();
  ballFlat.y = PLAYER_BODY_RADIUS;

  const goalToBall = new THREE.Vector3().subVectors(ballFlat, ownGoal);
  goalToBall.y = 0;

  if (goalToBall.lengthSq() < 0.001) {
    return getClosestBodyTo(ballFlat, bodies);
  }

  const blockDir = goalToBall.normalize();
  const idealBlockPoint = ownGoal
    .clone()
    .addScaledVector(blockDir, AI_CONFIG.dangerGoalDistance * 0.46);

  idealBlockPoint.y = PLAYER_BODY_RADIUS;
  clampFieldTarget(idealBlockPoint, 0.85);

  let bestBody = bodies[0];
  let bestIndex = 0;
  let bestScore = Infinity;
  let bestDist = Infinity;

  bodies.forEach((body, index) => {
    if (!body) return;

    const distanceToBlock = body.pos.distanceTo(idealBlockPoint);
    const distanceToBall = body.pos.distanceTo(ballFlat);

    const score = distanceToBlock * 0.72 + distanceToBall * 0.28;

    if (score < bestScore) {
      bestScore = score;
      bestDist = distanceToBlock;
      bestBody = body;
      bestIndex = index;
    }
  });

  return {
    body: bestBody,
    index: bestIndex,
    dist: bestDist,
    target: idealBlockPoint,
  };
}

export function getClosestBodyTo(targetPos, bodies = []) {
  let closestBody = bodies[0];
  let closestIndex = 0;
  let closestDist = Infinity;

  bodies.forEach((body, index) => {
    const dist = body.pos.distanceTo(targetPos);

    if (dist < closestDist) {
      closestBody = body;
      closestIndex = index;
      closestDist = dist;
    }
  });

  return {
    body: closestBody,
    index: closestIndex,
    dist: closestDist,
  };
}

export function resetAIMemory() {
  aiMemory.nextDecisionAt = 0;
  aiMemory.moveTarget.set(0, PLAYER_BODY_RADIUS, 0);
  aiMemory.wantsShoot = false;
  aiMemory.wantsPass = false;
  aiMemory.passTargetBody = null;
  aiMemory.lastShotAt = 0;
  aiMemory.lastPassAt = 0;
  aiMemory.tacticalMode = "shape";
}
