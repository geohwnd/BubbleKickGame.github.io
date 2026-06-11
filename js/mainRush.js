
import { RGBELoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/RGBELoader.js";
// Postprocessing disabled for Rush Match.
// import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
// import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
// import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
// import { OutputPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/OutputPass.js";
import * as THREE from "three";

import {
  Body,
  FIELD_W,
  FIELD_H,
  GOAL_W,
  PLAYER_BODY_RADIUS,
  PLAYER_VISUAL_SCALE,
  BALL_RADIUS,
  collideBodies,
  wallBounce,
} from "./physicsRush.js";

import {
  gameState,
  GAME_PHASES,
  TEAMS,
  MATCH_DURATION,
  updateMatchClock,
  shouldEndMatchByTime,
  endMatchByTime,
  setLastTouch,
  setBallCarrier,
  clearBallCarrier,
  addScore,
  registerGoalEvent,
  enterGoalPhase,
  exitGoalPhase,
  resetGameState,
} from "./gamestateRush.js";

import {
  refreshFullUI,
  updateTeamLabels,
  updatePlayerDotColors,
  updateTurnUI,
  updateInstructionText,
  hideStrengthBar,
  showGoalOverlay,
  hideGoalOverlay,
  showWinOverlay,
  hideWinOverlay,
  renderMatchStats,
  onRestartPressed,
  onQuickRestartPressed,
} from "./uiRush.js";

import {
  createFootballStadiumGroup,
  readStoredTeam,
  sanitizeTeamPalette,
  readStoredRoster,
  makeBobble,
  makePlayerNameLabel,
  makeShadow,
  createControlledPlayerIndicator,
  createBallMesh,
  updatePlayerMeshFacing,
  updatePlayerAnimationVariant,
  applyPlayerVisualScale,
  createRushArrowVisuals,
  spawnParticles,
  updateParticles,
  addBackgroundStars,
} from "./modelsRush.js";

import {
  setupInputListeners,
  setInputCallbacks,
  getMoveInput,
  resetDrag,
} from "./inputRush.js";

import {
  updateRushAI,
  updatePlayerTeammateAI,
  resetAIMemory,
  getClosestBodyTo,
} from "./aiRush.js";

// =========================
// THREE SETUP
// =========================

const canvas = document.getElementById("canvas");
const rushLoadingScreen = document.getElementById("rush-loading-screen");
const rushLoadingText = rushLoadingScreen?.querySelector(".rush-loading-text");
let isRushStarting = true;
let rushStartSequenceFinished = false;
let pendingPassReceiver = null;
// Permite que el canvas funcione como control virtual tipo Playroom/mobile.
// Evita scroll, selección, zoom táctil o menú contextual mientras se arrastra.
canvas.style.touchAction = "none";
canvas.style.userSelect = "none";
canvas.style.cursor = "grab";
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
function setRushLoadingText(text) {
  if (rushLoadingText) {
    rushLoadingText.textContent = text;
    rushLoadingText.classList.toggle("is-countdown", text !== "Loading Match...");
  }
}

function showRushLoadingScreen() {
  rushLoadingScreen?.classList.remove("is-hidden");
}

function hideRushLoadingScreen() {
  rushLoadingScreen?.classList.add("is-hidden");
}

function beginRushStartSequence() {
  if (rushStartSequenceFinished) return;

  rushStartSequenceFinished = true;
  isRushStarting = true;

  showRushLoadingScreen();
  setRushLoadingText("Loading Match...");

  window.setTimeout(() => setRushLoadingText("3"), 900);
  window.setTimeout(() => setRushLoadingText("2"), 1650);
  window.setTimeout(() => setRushLoadingText("1"), 2400);
  window.setTimeout(() => setRushLoadingText("GO!"), 3150);

  window.setTimeout(() => {
    hideRushLoadingScreen();
    isRushStarting = false;
  }, 3850);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x051f14);

// Filtro menos agresivo para reducir banding/moiré en la textura de la cancha.
renderer.domElement.style.filter = "saturate(1.22) contrast(1.18) brightness(0.78)";


const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x051f14, 0.02);

// =========================
// HDRI / ENVIRONMENT
// =========================

const rgbeLoader = new RGBELoader();

rgbeLoader.load("models/sunny_rose_garden_2k.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;

  // Iluminación ambiental/reflejos del HDRI sin cambiar el fondo oscuro del juego.
  scene.environment = texture;

  // Si algún día quieres ver el HDR como fondo, descomenta esta línea:
  // scene.background = texture;
});

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 260);
camera.position.set(0, 12, 18);
camera.lookAt(0, 0, 0);

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 10.2, 15.2);
const MOBILE_CAMERA_OFFSET = new THREE.Vector3(0, 10.2, 10.8);
const cameraLookTarget = new THREE.Vector3(0, 0, 0);
const desiredCameraPosition = new THREE.Vector3();

function isMobilePortrait() {
  return window.innerWidth < 700 && window.innerHeight > window.innerWidth;
}

function updateResponsiveCamera() {
  if (!isMobilePortrait()) {
    desiredCameraPosition.copy(DEFAULT_CAMERA_POSITION);
    camera.position.lerp(desiredCameraPosition, 0.045);
    cameraLookTarget.lerp(new THREE.Vector3(0, 0, 0), 0.08);
    camera.lookAt(cameraLookTarget);
    return;
  }

  const targetX = THREE.MathUtils.clamp(ballBody.pos.x, -3.6, 3.6);
  const targetZ = THREE.MathUtils.clamp(ballBody.pos.z, -3.2, 3.2);

  desiredCameraPosition.set(
    targetX + MOBILE_CAMERA_OFFSET.x,
    MOBILE_CAMERA_OFFSET.y,
    targetZ + MOBILE_CAMERA_OFFSET.z
  );

  camera.position.lerp(desiredCameraPosition, 0.075);
  cameraLookTarget.lerp(new THREE.Vector3(targetX, 0, targetZ), 0.11);
  camera.lookAt(cameraLookTarget);
}

// =========================
// POSTPROCESSING · TOON / ARCADE LOOK
// =========================

// Postprocessing disabled for Rush Match.
// const composer = new EffectComposer(renderer);
// const renderPass = new RenderPass(scene, camera);
// composer.addPass(renderPass);
//
// const bloomPass = new UnrealBloomPass(
//   new THREE.Vector2(window.innerWidth, window.innerHeight),
//   0.12,
//   0.25,
//   0.48
// );
// composer.addPass(bloomPass);
//
// const outputPass = new OutputPass();
// composer.addPass(outputPass);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  // composer.setSize(width, height);
  // bloomPass.setSize(width, height);
  camera.aspect = width / height;
  camera.fov = width < 700 && height > width ? 49 : 42;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

// =========================
// LIGHTS
// =========================

const ambient = new THREE.AmbientLight(0xffffff, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(8, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xddeeff, 5.2);
fill.position.set(-5, 8, -5);
scene.add(fill);


// =========================
// TEAMS / ROSTERS
// =========================

const selectedTeamP1 = readStoredTeam("bubbleKickP1Team");
const selectedTeamP2 = readStoredTeam("bubbleKickP2Team");

const p1TeamColors = sanitizeTeamPalette(selectedTeamP1?.colors, [
  selectedTeamP1?.color || "#ff4444",
  "#ffffff",
  "#ffcc00",
]);

const p2TeamColors = sanitizeTeamPalette(selectedTeamP2?.colors, [
  selectedTeamP2?.color || "#3388ff",
  "#ffffff",
  "#00eebb",
]);

// =========================
// FIELD / STADIUM
// =========================

const footballStadiumGroup = createFootballStadiumGroup(p1TeamColors, p2TeamColors, {
  scale: 1.75,
  position: new THREE.Vector3(0, -0.12, 0),
  rotationY: -Math.PI / 2,
  autoFit: true,
  targetSize: 24,
  verticalOffset: -0.02,
});

scene.add(footballStadiumGroup);

const p1TeamColor = p1TeamColors[0];
const p2TeamColor = p2TeamColors[0];

const p1TeamIcon = selectedTeamP1?.icon || selectedTeamP1?.flag || "🔴";
const p2TeamIcon = selectedTeamP2?.icon || selectedTeamP2?.flag || "🔵";

const p1RosterNames = readStoredRoster("bubbleKickP1Roster", [
  "Capitán",
  "Extremo",
  "Defensa",
  "Portero",
]);

const p2RosterNames = readStoredRoster("bubbleKickP2Roster", [
  "Capitán IA",
  "Atacante IA",
  "Defensa IA",
  "Portero IA",
]);

function readStoredSkinColors(storageKey) {
  try {
    const storedValue = localStorage.getItem(storageKey);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.map((color) =>
        typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
          ? color
          : null
      );
    }

    if (typeof parsedValue === "string" && /^#[0-9a-fA-F]{6}$/.test(parsedValue)) {
      return [parsedValue, parsedValue, parsedValue, parsedValue];
    }
  } catch (_) {
    const storedValue = localStorage.getItem(storageKey);

    if (typeof storedValue === "string" && /^#[0-9a-fA-F]{6}$/.test(storedValue)) {
      return [storedValue, storedValue, storedValue, storedValue];
    }
  }

  return [];
}

const p1SkinColors = readStoredSkinColors("bubbleKickP1SkinColor");
const p2SkinColors = readStoredSkinColors("bubbleKickP2SkinColor");

function getRosterName(playerNumber, index = 0) {
  const roster = playerNumber === TEAMS.P1 ? p1RosterNames : p2RosterNames;
  return roster[index] || (playerNumber === TEAMS.P1 ? "Jugador" : "Jugador IA");
}

function getTeamDisplayName(playerNumber) {
  const selectedTeam = playerNumber === TEAMS.P1 ? selectedTeamP1 : selectedTeamP2;
  const fallback = playerNumber === TEAMS.P1 ? "JUGADOR 1" : "IA";

  return (selectedTeam?.name || selectedTeam?.code || fallback)
    .toString()
    .toUpperCase();
}

const uiTeamOptions = {
  selectedTeamP1,
  selectedTeamP2,
  p1TeamColor,
  p2TeamColor,
  p1TeamIcon,
  p2TeamIcon,
  p1TeamName: getTeamDisplayName(TEAMS.P1),
  p2TeamName: getTeamDisplayName(TEAMS.P2),
};

updateTeamLabels(uiTeamOptions);
updatePlayerDotColors(uiTeamOptions);
updateInstructionText();

// =========================
// GAME CONSTANTS
// =========================

const RUSH_PLAYER_SPEED = 5.0;
const RUSH_PLAYER_ACCEL = 0.28;
const RUSH_DASH_SPEED = 14.4;
const RUSH_DASH_DURATION = 180;
const RUSH_DASH_COOLDOWN = 720;
const RUSH_STEAL_RADIUS = 1.22;
const RUSH_CONTROL_EXTRA = 0.28;
const RUSH_BALL_FRONT_DISTANCE = 0.62;
const RUSH_MAX_KICK_FORCE = 22;
const RUSH_MIN_KICK_FORCE = 6;

const KEEPER_PLAYER_NUMBER = 3;
const DT = 1 / 60;

// =========================
// BODIES
// =========================

const p1Body = new Body(-3.35, PLAYER_BODY_RADIUS, 0, PLAYER_BODY_RADIUS, 2);
const p1Mate1Body = new Body(-4.45, PLAYER_BODY_RADIUS, -2.25, PLAYER_BODY_RADIUS, 2);
const p1Mate2Body = new Body(-4.45, PLAYER_BODY_RADIUS, 2.25, PLAYER_BODY_RADIUS, 2);

const p2Body = new Body(3.35, PLAYER_BODY_RADIUS, 0, PLAYER_BODY_RADIUS, 2);
const p2Mate1Body = new Body(4.45, PLAYER_BODY_RADIUS, -2.25, PLAYER_BODY_RADIUS, 2);
const p2Mate2Body = new Body(4.45, PLAYER_BODY_RADIUS, 2.25, PLAYER_BODY_RADIUS, 2);

const p1KeeperBody = new Body(
  -FIELD_W / 2 + 0.72,
  PLAYER_BODY_RADIUS,
  0,
  PLAYER_BODY_RADIUS,
  2.4
);

const p2KeeperBody = new Body(
  FIELD_W / 2 - 0.72,
  PLAYER_BODY_RADIUS,
  0,
  PLAYER_BODY_RADIUS,
  2.4
);

const ballBody = new Body(0, BALL_RADIUS, 0, BALL_RADIUS, 0.6);

const playerTeamBodies = [p1Body, p1Mate1Body, p1Mate2Body];
const aiTeamBodies = [p2Body, p2Mate1Body, p2Mate2Body];

const allPlayerBodies = [p1Body, p1Mate1Body, p1Mate2Body, p1KeeperBody];
const allAIBodies = [p2Body, p2Mate1Body, p2Mate2Body, p2KeeperBody];

const playerOutfieldBodies = playerTeamBodies;
const aiOutfieldBodies = aiTeamBodies;

function initRushBody(body, facingX) {
  body.facing = new THREE.Vector3(facingX, 0, 0);
  body.dashUntil = 0;
  body.dashCooldownUntil = 0;

  if (body === p1KeeperBody) body.keeperDirection = 1;
  if (body === p2KeeperBody) body.keeperDirection = -1;
}

allPlayerBodies.forEach((body) => initRushBody(body, 1));
allAIBodies.forEach((body) => initRushBody(body, -1));

// =========================
// MESHES
// =========================

const p1Mesh = makeBobble(p1TeamColors, { skinColor: p1SkinColors[0] });
const p1Mate1Mesh = makeBobble(p1TeamColors, { skinColor: p1SkinColors[1] });
const p1Mate2Mesh = makeBobble(p1TeamColors, { skinColor: p1SkinColors[2] });
const p1KeeperMesh = makeBobble(p1TeamColors, {
  isKeeper: true,
  skinColor: p1SkinColors[3],
});

const p2Mesh = makeBobble(p2TeamColors, { skinColor: p2SkinColors[0] });
const p2Mate1Mesh = makeBobble(p2TeamColors, { skinColor: p2SkinColors[1] });
const p2Mate2Mesh = makeBobble(p2TeamColors, { skinColor: p2SkinColors[2] });
const p2KeeperMesh = makeBobble(p2TeamColors, {
  isKeeper: true,
  skinColor: p2SkinColors[3],
});

[
  p1Mesh,
  p1Mate1Mesh,
  p1Mate2Mesh,
  p1KeeperMesh,
  p2Mesh,
  p2Mate1Mesh,
  p2Mate2Mesh,
  p2KeeperMesh,
].forEach((mesh) => {
  applyPlayerVisualScale(mesh, PLAYER_VISUAL_SCALE);
  scene.add(mesh);
});

p1KeeperMesh.scale.setScalar(PLAYER_VISUAL_SCALE * 0.95);
p2KeeperMesh.scale.setScalar(PLAYER_VISUAL_SCALE * 0.95);

const p1NameLabel = makePlayerNameLabel(scene, p1RosterNames[0], p1TeamColor);
const p1Mate1NameLabel = makePlayerNameLabel(scene, p1RosterNames[1], p1TeamColor);
const p1Mate2NameLabel = makePlayerNameLabel(scene, p1RosterNames[2], p1TeamColor);
const p1KeeperNameLabel = makePlayerNameLabel(scene, p1RosterNames[3], p1TeamColor);

const p2NameLabel = makePlayerNameLabel(scene, p2RosterNames[0], p2TeamColor);
const p2Mate1NameLabel = makePlayerNameLabel(scene, p2RosterNames[1], p2TeamColor);
const p2Mate2NameLabel = makePlayerNameLabel(scene, p2RosterNames[2], p2TeamColor);
const p2KeeperNameLabel = makePlayerNameLabel(scene, p2RosterNames[3], p2TeamColor);

const p1Shadow = makeShadow(scene);
const p1Mate1Shadow = makeShadow(scene);
const p1Mate2Shadow = makeShadow(scene);
const p1KeeperShadow = makeShadow(scene);

const p2Shadow = makeShadow(scene);
const p2Mate1Shadow = makeShadow(scene);
const p2Mate2Shadow = makeShadow(scene);
const p2KeeperShadow = makeShadow(scene);

const ballShadow = makeShadow(scene);
const ballMesh = createBallMesh(scene, ballBody);

const { controlledIndicatorGroup, controlledRing, controlledArrow } =
  createControlledPlayerIndicator(scene);

const { arrowLine, arrowGeo, movArrowGroup } = createRushArrowVisuals(scene);

// =========================
// PARTICLES / AUDIO
// =========================

const particles = [];
const MASTER_VOLUME_STORAGE_KEY = "bubbleKickMasterVolume";
let masterVolume = Number(localStorage.getItem(MASTER_VOLUME_STORAGE_KEY) || 0.65);

if (!Number.isFinite(masterVolume)) {
  masterVolume = 0.65;
}

masterVolume = THREE.MathUtils.clamp(masterVolume, 0, 1);

function setMasterVolume(value) {
  masterVolume = THREE.MathUtils.clamp(Number(value), 0, 1);
  localStorage.setItem(MASTER_VOLUME_STORAGE_KEY, String(masterVolume));

  stadiumEnvironmentSound.volume = 0.92 * masterVolume;
  goalSound.volume = 0.82 * masterVolume;
  kickSound.volume = 0.65 * masterVolume;
}
let lastGoalParticleState = false;

const stadiumEnvironmentSound = new Audio("audio/BaumannMusic_Brazil_CLEAN.mp3");
stadiumEnvironmentSound.loop = true;
stadiumEnvironmentSound.preload = "auto";
stadiumEnvironmentSound.volume = 0.32 * masterVolume;

let stadiumEnvironmentStarted = false;

function startStadiumEnvironmentSound() {
  if (stadiumEnvironmentStarted) return;

  stadiumEnvironmentSound
    .play()
    .then(() => {
      stadiumEnvironmentStarted = true;
    })
    .catch(() => {
      stadiumEnvironmentStarted = false;
    });
} 

window.addEventListener("pointerdown", startStadiumEnvironmentSound, { once: true });
window.addEventListener("keydown", startStadiumEnvironmentSound, { once: true });
startStadiumEnvironmentSound();

const goalSound = new Audio("audio/Goal_Sound.mp3");
goalSound.preload = "auto";
goalSound.volume = 0.82 * masterVolume;

function playGoalSound(volume = 0.82) {
  const sound = goalSound.cloneNode();
  sound.volume = volume * masterVolume;
  sound.play().catch(() => {});
}

const kickSound = new Audio("audio/Football Kick Ball01.mp3");
kickSound.preload = "auto";
kickSound.volume = 0.65 * masterVolume;

function playKickSound(volume = 0.65) {
  const sound = kickSound.cloneNode();
  sound.volume = volume * masterVolume;
  sound.play().catch(() => {});
}

setMasterVolume(masterVolume);

// =========================
// BODY HELPERS
// =========================

function getControlledPlayerBody() {
  return playerTeamBodies[gameState.controlledPlayerIndex] || p1Body;
}

function getAIControlledBody() {
  return aiTeamBodies[gameState.aiCarrierIndex] || p2Body;
}


function setAIControlledBodyIndex(index) {
  gameState.aiCarrierIndex = THREE.MathUtils.clamp(
    index,
    0,
    aiTeamBodies.length - 1
  );
}

function canSwitchDefense() {
  return (
    gameState.gamePhase === GAME_PHASES.PLAYING &&
    gameState.ballCarrier === TEAMS.P2
  );
}

function switchControlledDefender() {
  if (!canSwitchDefense()) return;

  const currentBody = getControlledPlayerBody();
  const candidates = playerOutfieldBodies.filter((body) => body !== currentBody);

  if (!candidates.length) return;

  const ballPosition = ballBody.pos;
  const bestCandidate = candidates.reduce((best, body) => {
    const dist = body.pos.distanceTo(ballPosition);
    return dist < best.dist ? { body, dist } : best;
  }, { body: candidates[0], dist: candidates[0].pos.distanceTo(ballPosition) }).body;

  const nextIndex = playerOutfieldBodies.indexOf(bestCandidate);

  if (nextIndex >= 0) {
    gameState.controlledPlayerIndex = nextIndex;
    resetDrag();
    updateTurnUI(gameState, uiTeamOptions);
  }
}

function getBodyByPlayer(playerNumber) {
  return playerNumber === TEAMS.P1 ? getControlledPlayerBody() : getAIControlledBody();
}

function getMeshByBody(body) {
  if (body === p1Body) return p1Mesh;
  if (body === p1Mate1Body) return p1Mate1Mesh;
  if (body === p1Mate2Body) return p1Mate2Mesh;
  if (body === p1KeeperBody) return p1KeeperMesh;

  if (body === p2Body) return p2Mesh;
  if (body === p2Mate1Body) return p2Mate1Mesh;
  if (body === p2Mate2Body) return p2Mate2Mesh;
  if (body === p2KeeperBody) return p2KeeperMesh;

  return null;
}



function playStrikeForBody(body, returnVariant = "run") {
  const mesh = getMeshByBody(body);

  if (mesh && typeof mesh.playStrikeAnimation === "function") {
    mesh.playStrikeAnimation(returnVariant);
  }
}

function playCatchForBody(body, returnVariant = "idle") {
  const mesh = getMeshByBody(body);

  if (mesh && typeof mesh.playCatchAnimation === "function") {
    mesh.playCatchAnimation(returnVariant);
  }
}

function updateKeeperSideFacing(keeperBody, teamNumber) {
  if (!keeperBody) return;

  // El portero patrulla en Z, pero visualmente debe mirar hacia la cancha.
  // Así su recorrido sigue siendo lateral, no hacia enfrente.
  keeperBody.facing.set(teamNumber === TEAMS.P1 ? 1 : -1, 0, 0);
}

function updateKeeperMeshFacing(keeperMesh, keeperBody, teamNumber) {
  if (!keeperMesh || !keeperBody) return;

  // El recorrido del portero sigue siendo sobre Z, pero el modelo mira hacia la cancha.
  // Esto crea el efecto de desplazamiento lateral sobre la línea de gol.
  const targetRotationY = teamNumber === TEAMS.P1 ? Math.PI / 2 : -Math.PI / 2;

  const diff = Math.atan2(
    Math.sin(targetRotationY - keeperMesh.rotation.y),
    Math.cos(targetRotationY - keeperMesh.rotation.y)
  );

  keeperMesh.rotation.y += diff * 0.35;
}

// =========================
// GOAL TEXT HELPERS
// =========================

function getGoalScorerName(scorerTeam) {
  if (gameState.lastTouchTeam === scorerTeam) {
    return getRosterName(scorerTeam, gameState.lastTouchIndex);
  }

  return `${getRosterName(gameState.lastTouchTeam, gameState.lastTouchIndex)} (Autogol)`;
}

function getGoalScorerText(scorerTeam) {
  const teamName = getTeamDisplayName(scorerTeam);

  if (gameState.lastTouchTeam === scorerTeam) {
    return `¡${teamName} anotó! Gol de ${getRosterName(
      scorerTeam,
      gameState.lastTouchIndex
    )}`;
  }

  return `¡${teamName} anotó! Autogol de ${getRosterName(
    gameState.lastTouchTeam,
    gameState.lastTouchIndex
  )}`;
}

// =========================
// GAMEPLAY
// =========================

function resetPositions() {
  gameState.controlledPlayerIndex = 0;
  gameState.aiCarrierIndex = 0;

  p1Body.pos.set(-3.35, PLAYER_BODY_RADIUS, 0);
  p1Body.vel.set(0, 0, 0);

  p1Mate1Body.pos.set(-4.45, PLAYER_BODY_RADIUS, -2.25);
  p1Mate1Body.vel.set(0, 0, 0);

  p1Mate2Body.pos.set(-4.45, PLAYER_BODY_RADIUS, 2.25);
  p1Mate2Body.vel.set(0, 0, 0);

  p2Body.pos.set(3.35, PLAYER_BODY_RADIUS, 0);
  p2Body.vel.set(0, 0, 0);

  p2Mate1Body.pos.set(4.45, PLAYER_BODY_RADIUS, -2.25);
  p2Mate1Body.vel.set(0, 0, 0);

  p2Mate2Body.pos.set(4.45, PLAYER_BODY_RADIUS, 2.25);
  p2Mate2Body.vel.set(0, 0, 0);

  p1KeeperBody.pos.set(-FIELD_W / 2 + 0.72, PLAYER_BODY_RADIUS, 0);
  p1KeeperBody.vel.set(0, 0, 0);

  p2KeeperBody.pos.set(FIELD_W / 2 - 0.72, PLAYER_BODY_RADIUS, 0);
  p2KeeperBody.vel.set(0, 0, 0);

  allPlayerBodies.forEach((body) => initRushBody(body, 1));
  allAIBodies.forEach((body) => initRushBody(body, -1));

  ballBody.pos.set(0, BALL_RADIUS, 0);
  ballBody.vel.set(0, 0, 0);

  gameState.goalEventLocked = false;
}

function ensurePlayerPossessionIfNearBall() {
  if (gameState.ballCarrier === TEAMS.P1) return true;
  if (performance.now() < gameState.playerPickupBlockedUntil) return false;

  const controlledBody = getControlledPlayerBody();

  const isNear =
    controlledBody.pos.distanceTo(ballBody.pos) <
    controlledBody.r + ballBody.r + RUSH_CONTROL_EXTRA + 0.45;

  if (!gameState.ballCarrier && isNear) {
    setLastTouch(TEAMS.P1, gameState.controlledPlayerIndex);
    setBallCarrier(TEAMS.P1);

    ballBody.vel.set(0, 0, 0);
    updateTurnUI(gameState, uiTeamOptions);

    return true;
  }

  return false;
}


function shootControlledPlayer() {
  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;
  if (!ensurePlayerPossessionIfNearBall()) return;

  const body = getControlledPlayerBody();
  const kickDir = body.facing.clone();

  kickDir.y = 0;

  if (kickDir.lengthSq() < 0.001) {
    kickDir.set(1, 0, 0);
  }

  kickDir.normalize();

  const force = THREE.MathUtils.lerp(
    RUSH_MIN_KICK_FORCE,
    RUSH_MAX_KICK_FORCE,
    0.58
  );

  playStrikeForBody(body, "run");

  setLastTouch(TEAMS.P1, gameState.controlledPlayerIndex);

  clearBallCarrier();
  gameState.kickChargingPlayer = null;
  gameState.kickChargeStart = 0;
  gameState.playerPickupBlockedUntil = performance.now() + 420;

  hideStrengthBar();

  ballBody.pos
    .copy(body.pos)
    .addScaledVector(kickDir, body.r + ballBody.r + 0.42);

  ballBody.pos.y = ballBody.r;
  ballBody.vel.copy(kickDir).multiplyScalar(force);
  ballBody.vel.y = 0.85;

  playKickSound(0.72);
  updateTurnUI(gameState, uiTeamOptions);
}

function passControlledPlayer() {
  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;
  if (!ensurePlayerPossessionIfNearBall()) return;

  const body = getControlledPlayerBody();
  const teammates = playerOutfieldBodies.filter((mate) => mate !== body);

  if (!teammates.length) return;

  const forwardDir = body.facing.clone().setY(0);

  if (forwardDir.lengthSq() < 0.001) {
    forwardDir.set(1, 0, 0);
  }

  forwardDir.normalize();

  const bestMate = teammates.reduce((best, mate) => {
    const toMate = new THREE.Vector3().subVectors(mate.pos, body.pos).setY(0);
    const dist = Math.max(toMate.length(), 0.001);
    const dirToMate = toMate.clone().normalize();
    const forwardScore = dirToMate.dot(forwardDir);
    const score = forwardScore * 2.2 - dist * 0.08;

    return score > best.score ? { mate, score } : best;
  }, { mate: teammates[0], score: -Infinity }).mate;

  const passDir = new THREE.Vector3().subVectors(bestMate.pos, body.pos).setY(0);

  if (passDir.lengthSq() < 0.001) {
    passDir.copy(forwardDir);
  }

  passDir.normalize();

  playStrikeForBody(body, "run");
  setLastTouch(TEAMS.P1, gameState.controlledPlayerIndex);
  clearBallCarrier();
  pendingPassReceiver = bestMate;

  gameState.kickChargingPlayer = null;
  gameState.kickChargeStart = 0;
  gameState.playerPickupBlockedUntil = performance.now() + 360;

  hideStrengthBar();

  ballBody.pos
    .copy(body.pos)
    .addScaledVector(passDir, body.r + ballBody.r + 0.42);

  ballBody.pos.y = ballBody.r;
  ballBody.vel.copy(passDir).multiplyScalar(12.8);
  ballBody.vel.y = 0.42;

  playKickSound(0.48);
  updateTurnUI(gameState, uiTeamOptions);
}

function tryDash(body, preferredDirection = null) {
  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;

  const now = performance.now();

  if (now < body.dashCooldownUntil) return;

  let dashDir = preferredDirection ? preferredDirection.clone() : null;

  if (!dashDir && playerOutfieldBodies.includes(body)) {
    dashDir = getMoveInput(TEAMS.P1);
  }

  if (!dashDir || dashDir.lengthSq() < 0.001) {
    dashDir = body.facing.clone();
  }

  dashDir.y = 0;

  if (dashDir.lengthSq() < 0.001) {
    dashDir.set(body === p2Body ? -1 : 1, 0, 0);
  }

  dashDir.normalize();

  body.facing.copy(dashDir);
  body.dashUntil = now + RUSH_DASH_DURATION;
  body.dashCooldownUntil = now + RUSH_DASH_COOLDOWN;
  body.vel.x = dashDir.x * RUSH_DASH_SPEED;
  body.vel.z = dashDir.z * RUSH_DASH_SPEED;
}

function moveRushPlayer(body, playerNumber) {
  if (body === p1KeeperBody || body === p2KeeperBody) return;

  const now = performance.now();
  const input = getMoveInput(playerNumber);
  const isDashing = now < body.dashUntil;

  if (playerNumber === TEAMS.P1 && body !== getControlledPlayerBody()) {
    updatePlayerTeammateAI({
      body,
      gameState,
      ballBody,
      playerTeamBodies,
      getControlledPlayerBody,
      getAIControlledBody,
      tryDash,
    });
    return;
  }

  if (input.lengthSq() > 0) {
    body.facing.copy(input);
  }

  if (isDashing) {
    const dashBlend = input.lengthSq() > 0 ? input : body.facing;
    body.vel.x = dashBlend.x * RUSH_DASH_SPEED;
    body.vel.z = dashBlend.z * RUSH_DASH_SPEED;
  } else if (input.lengthSq() > 0) {
    const targetVel = input.multiplyScalar(RUSH_PLAYER_SPEED);

    body.vel.x = THREE.MathUtils.lerp(
      body.vel.x,
      targetVel.x,
      RUSH_PLAYER_ACCEL
    );

    body.vel.z = THREE.MathUtils.lerp(
      body.vel.z,
      targetVel.z,
      RUSH_PLAYER_ACCEL
    );
  } else {
    body.vel.x *= 0.82;
    body.vel.z *= 0.82;
  }
}

function updateBallPossession() {
  if (gameState.ballCarrier) {
    pendingPassReceiver = null;
    const carrierBody = getBodyByPlayer(gameState.ballCarrier);

    ballBody.pos
      .copy(carrierBody.pos)
      .addScaledVector(carrierBody.facing, RUSH_BALL_FRONT_DISTANCE);

    ballBody.pos.y = ballBody.r;
    ballBody.vel.copy(carrierBody.vel);

    updateTurnUI(gameState, uiTeamOptions);
    return;
  }

  const closestPlayer = getClosestBodyTo(ballBody.pos, playerTeamBodies);
  const closestAI = getClosestBodyTo(ballBody.pos, aiTeamBodies);
  const now = performance.now();
  if (pendingPassReceiver) {
    const receiveDistance = pendingPassReceiver.pos.distanceTo(ballBody.pos);

    if (receiveDistance < 0.9) {
      gameState.controlledPlayerIndex = playerTeamBodies.indexOf(pendingPassReceiver);

      setLastTouch(TEAMS.P1, gameState.controlledPlayerIndex);
      setBallCarrier(TEAMS.P1);

      ballBody.vel.set(0, 0, 0);
      pendingPassReceiver = null;

      playCatchForBody(playerTeamBodies[gameState.controlledPlayerIndex], "run");
      updateTurnUI(gameState, uiTeamOptions);
      return;
    }
  }

  if (
    now >= gameState.playerPickupBlockedUntil &&
    closestPlayer.dist < closestPlayer.body.r + ballBody.r + RUSH_CONTROL_EXTRA
  ) {
    gameState.controlledPlayerIndex = playerTeamBodies.indexOf(closestPlayer.body);

    setLastTouch(TEAMS.P1, gameState.controlledPlayerIndex);
    setBallCarrier(TEAMS.P1);
  } else if (
    now >= gameState.aiPickupBlockedUntil &&
    closestAI.dist < closestAI.body.r + ballBody.r + RUSH_CONTROL_EXTRA
  ) {
    gameState.aiCarrierIndex = aiTeamBodies.indexOf(closestAI.body);

    setLastTouch(TEAMS.P2, gameState.aiCarrierIndex);
    setBallCarrier(TEAMS.P2);
  }

  updateTurnUI(gameState, uiTeamOptions);
}

function updateDashSteal() {
  if (!gameState.ballCarrier) return;

  const now = performance.now();
  const carrierBody = getBodyByPlayer(gameState.ballCarrier);

  const challengerBodies =
    gameState.ballCarrier === TEAMS.P1 ? aiOutfieldBodies : playerOutfieldBodies;

  const challengerNumber =
    gameState.ballCarrier === TEAMS.P1 ? TEAMS.P2 : TEAMS.P1;

  const activeChallenger = challengerBodies.find(
    (body) =>
      now < body.dashUntil &&
      body.pos.distanceTo(carrierBody.pos) < RUSH_STEAL_RADIUS
  );

  if (!activeChallenger) return;

  if (challengerNumber === TEAMS.P1) {
    gameState.controlledPlayerIndex = playerOutfieldBodies.indexOf(activeChallenger);
  } else {
    gameState.aiCarrierIndex = aiOutfieldBodies.indexOf(activeChallenger);
  }

  setLastTouch(
    challengerNumber,
    challengerNumber === TEAMS.P1
      ? gameState.controlledPlayerIndex
      : gameState.aiCarrierIndex
  );

  setBallCarrier(challengerNumber);

  ballBody.vel.set(0, 0, 0);
  hideStrengthBar();
  updateTurnUI(gameState, uiTeamOptions);
}

function updateContactSteal() {
  if (!gameState.ballCarrier || gameState.gamePhase !== GAME_PHASES.PLAYING) {
    return;
  }

  const now = performance.now();

  if (now < gameState.contactStealBlockedUntil) return;

  const carrierBody = getBodyByPlayer(gameState.ballCarrier);

  const challengerBodies =
    gameState.ballCarrier === TEAMS.P1 ? aiTeamBodies : playerTeamBodies;

  const challengerNumber =
    gameState.ballCarrier === TEAMS.P1 ? TEAMS.P2 : TEAMS.P1;

  let bestChallenger = null;
  let bestDistance = Infinity;

  challengerBodies.forEach((body) => {
    const dist = body.pos.distanceTo(carrierBody.pos);
    const contactRange = carrierBody.r + body.r + 0.16;

    if (dist < contactRange && dist < bestDistance) {
      bestChallenger = body;
      bestDistance = dist;
    }
  });

  if (!bestChallenger) return;

  if (challengerNumber === TEAMS.P1) {
    gameState.controlledPlayerIndex = playerTeamBodies.indexOf(bestChallenger);
  } else {
    gameState.aiCarrierIndex = aiTeamBodies.indexOf(bestChallenger);
  }

  const stealDir = new THREE.Vector3().subVectors(
    bestChallenger.pos,
    carrierBody.pos
  );

  stealDir.y = 0;

  if (stealDir.lengthSq() < 0.001) {
    stealDir.copy(
      bestChallenger.facing ||
        new THREE.Vector3(challengerNumber === TEAMS.P1 ? 1 : -1, 0, 0)
    );
  }

  stealDir.normalize();

  setLastTouch(
    challengerNumber,
    challengerNumber === TEAMS.P1
      ? gameState.controlledPlayerIndex
      : gameState.aiCarrierIndex
  );

  setBallCarrier(challengerNumber);

  gameState.contactStealBlockedUntil = now + 380;

  ballBody.vel.set(0, 0, 0);

  bestChallenger.pos.addScaledVector(stealDir, 0.08);
  carrierBody.pos.addScaledVector(stealDir, -0.08);

  hideStrengthBar();
  updateTurnUI(gameState, uiTeamOptions);
}

function checkGoal() {
  const inZRange = Math.abs(ballBody.pos.z) < GOAL_W / 2;
  const inHeight = ballBody.pos.y < 1.4 + 0.3;

  if (inZRange && inHeight && ballBody.pos.x < -(FIELD_W / 2 - 0.1)) {
    triggerGoal(TEAMS.P2);
    return true;
  }

  if (inZRange && inHeight && ballBody.pos.x > FIELD_W / 2 - 0.1) {
    triggerGoal(TEAMS.P1);
    return true;
  }

  return false;
}

let goalTimeout = null;

function triggerGoal(scorer) {
  if (
    gameState.gamePhase === GAME_PHASES.GOAL ||
    gameState.gamePhase === GAME_PHASES.WIN
  ) {
    return;
  }

  enterGoalPhase();
  pendingPassReceiver = null;

  addScore(scorer);

  const scorerText = getGoalScorerText(scorer);
  const scorerName = getGoalScorerName(scorer);

  registerGoalEvent({
    teamNumber: scorer,
    team: getTeamDisplayName(scorer),
    scorer: scorerName,
  });

  refreshFullUI(gameState, uiTeamOptions);
  playGoalSound();

  showGoalOverlay({
    scoringTeam: scorer,
    scorerText,
    p1TeamColor,
    p2TeamColor,
  });

  clearTimeout(goalTimeout);

  goalTimeout = setTimeout(() => {
    hideGoalOverlay();
    resetPositions();
    resetAIMemory();

    clearBallCarrier();

    exitGoalPhase();

    refreshFullUI(gameState, uiTeamOptions);
    updateInstructionText();
  }, 2200);
}

function endMatch() {
  endMatchByTime();

  hideStrengthBar();

  showWinOverlay(gameState, uiTeamOptions);
  updateTurnUI(gameState, uiTeamOptions);
}

function restartGame() {
  resetGameState();
  resetPositions();
  pendingPassReceiver = null;
  resetAIMemory();

  clearTimeout(goalTimeout);

  hideGoalOverlay();
  hideWinOverlay();
  hideStrengthBar();

  arrowLine.visible = false;
  movArrowGroup.visible = false;

  const zero = new THREE.Vector3();
  arrowGeo.setFromPoints([zero, zero]);

  resetDrag();

  refreshFullUI(gameState, uiTeamOptions);
  renderMatchStats(gameState, uiTeamOptions);
  updateInstructionText();
}

window.restartGame = restartGame;

// =========================
// INPUT
// =========================

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

setupInputListeners({
  canvas,
  camera,
  groundPlane,
  raycaster,
  mouse,
  canStartDrag: (point) => {
    // El joystick virtual debe funcionar durante PLAYING.
    // Este bloque solo controla el modo slingshot/drag viejo, no el movimiento por mouse/touch.
    if (gameState.gamePhase !== GAME_PHASES.IDLE) return false;
    return point.distanceTo(getControlledPlayerBody().pos) < 1.4;
  },
});

setInputCallbacks({
  onDash: () => {
    if (isRushPaused) return;
    tryDash(getControlledPlayerBody());
  },

  onShoot: () => {
    if (isRushPaused) return;
    shootControlledPlayer();
  },

  onSwitchDefense: () => {
    if (isRushPaused) return;
    switchControlledDefender();
  },

  onPass: () => {
    if (isRushPaused) return;
    passControlledPlayer();
  },

  onRestart: () => {
    restartGame();
  },

  onBlur: () => {
    p1Body.dashUntil = 0;
    p1Body.vel.x = 0;
    p1Body.vel.z = 0;
    hideStrengthBar();
  },
});

onRestartPressed(restartGame);
onQuickRestartPressed(restartGame);


const mobileShootButton = document.getElementById("mobile-shoot-btn");
const mobileDashButton = document.getElementById("mobile-dash-btn");
const mobileContextButton = document.getElementById("mobile-switch-defense-btn");
const mobileContextIcon = document.getElementById("mobile-context-icon");
const mobileContextLabel = document.getElementById("mobile-context-label");

const pauseButton = document.getElementById("pause-btn");
const pauseOverlay = document.getElementById("pause-overlay");
const resumeButton = document.getElementById("resume-btn");

let isRushPaused = false;

function setRushPaused(isPaused) {
  isRushPaused = isPaused;

  pauseOverlay?.classList.toggle("is-hidden", !isRushPaused);
  pauseOverlay?.setAttribute("aria-hidden", isRushPaused ? "false" : "true");

  if (pauseButton) {
    pauseButton.innerHTML = isRushPaused ? "▶ Reanudar" : "⏸ Pausa";
  }
}

function toggleRushPause() {
  setRushPaused(!isRushPaused);
}

pauseButton?.addEventListener("click", toggleRushPause);
resumeButton?.addEventListener("click", () => setRushPaused(false));

function setMobileActionButtonsVisible(isVisible) {
  [mobileShootButton, mobileDashButton, mobileContextButton].forEach((button) => {
    if (!button) return;
    button.classList.toggle("is-hidden", !isVisible);
  });
}

function updateMobileActionButtonsVisibility() {
  setMobileActionButtonsVisible(gameState.gamePhase !== GAME_PHASES.WIN);
}

function updateMobileContextButton() {
  if (!mobileContextButton) return;

  const isDefending = gameState.ballCarrier === TEAMS.P2;

  mobileContextButton.classList.toggle("is-defense", isDefending);
  mobileContextButton.classList.toggle("is-attack", !isDefending);
  mobileContextButton.setAttribute(
    "aria-label",
    isDefending ? "Cambiar defensa" : "Pase"
  );

  if (mobileContextIcon) {
    mobileContextIcon.textContent = isDefending ? "🔁" : "🤝";
  }

  if (mobileContextLabel) {
    mobileContextLabel.textContent = isDefending ? "DEFENSA" : "PASE";
  }
}

if (mobileShootButton) {
  const handleMobileShoot = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRushPaused) return;
    shootControlledPlayer();
  };

  mobileShootButton.addEventListener("pointerdown", handleMobileShoot);
  mobileShootButton.addEventListener("touchstart", handleMobileShoot, {
    passive: false,
  });
}



if (mobileDashButton) {
  const handleMobileDash = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRushPaused) return;
    tryDash(getControlledPlayerBody());
  };

  mobileDashButton.addEventListener("pointerdown", handleMobileDash);
  mobileDashButton.addEventListener("touchstart", handleMobileDash, {
    passive: false,
  });
}

if (mobileContextButton) {
  const handleMobileContextAction = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRushPaused) return;

    if (canSwitchDefense()) {
      switchControlledDefender();
    } else {
      passControlledPlayer();
    }
  };

  mobileContextButton.addEventListener("pointerdown", handleMobileContextAction);
  mobileContextButton.addEventListener("touchstart", handleMobileContextAction, {
    passive: false,
  });
}

// =========================
// SIMULATION
// =========================

function simulate() {
  updateMatchClock();

  if (shouldEndMatchByTime()) {
    endMatch();
  }

  if (gameState.gamePhase !== GAME_PHASES.PLAYING) return;

  for (let i = 0; i < 3; i++) {
    playerTeamBodies.forEach((body) => moveRushPlayer(body, TEAMS.P1));

    updateRushAI({
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
    });

    allPlayerBodies.forEach((body) => body.update(DT / 3));
    allAIBodies.forEach((body) => body.update(DT / 3));

    if (!gameState.ballCarrier) {
      ballBody.update(DT / 3);
    }

    allPlayerBodies.forEach((body) => wallBounce(body));
    allAIBodies.forEach((body) => wallBounce(body));

    if (!gameState.ballCarrier) {
      wallBounce(ballBody);
    }

    for (let a = 0; a < playerTeamBodies.length; a++) {
      for (let b = a + 1; b < playerTeamBodies.length; b++) {
        collideBodies(playerTeamBodies[a], playerTeamBodies[b]);
      }
    }

    for (let a = 0; a < aiTeamBodies.length; a++) {
      for (let b = a + 1; b < aiTeamBodies.length; b++) {
        collideBodies(aiTeamBodies[a], aiTeamBodies[b]);
      }
    }

    allPlayerBodies.forEach((playerBody) => {
      allAIBodies.forEach((aiBody) => {
        collideBodies(playerBody, aiBody);
      });
    });

    if (!gameState.ballCarrier) {
      allPlayerBodies.forEach((body) => collideBodies(body, ballBody));
      allAIBodies.forEach((body) => collideBodies(body, ballBody));
    }

    updateBallPossession();
    updateDashSteal();
    updateContactSteal();
  }

  checkGoal();
}

// =========================
// VISUAL SYNC
// =========================

function syncMeshes() {
  p1Mesh.position.copy(p1Body.pos);
  p1Mate1Mesh.position.copy(p1Mate1Body.pos);
  p1Mate2Mesh.position.copy(p1Mate2Body.pos);
  p1KeeperMesh.position.copy(p1KeeperBody.pos);

  p2Mesh.position.copy(p2Body.pos);
  p2Mate1Mesh.position.copy(p2Mate1Body.pos);
  p2Mate2Mesh.position.copy(p2Mate2Body.pos);
  p2KeeperMesh.position.copy(p2KeeperBody.pos);

  ballMesh.position.copy(ballBody.pos);

  updatePlayerMeshFacing(p1Mesh, p1Body);
  updatePlayerMeshFacing(p1Mate1Mesh, p1Mate1Body);
  updatePlayerMeshFacing(p1Mate2Mesh, p1Mate2Body);

  updateKeeperSideFacing(p1KeeperBody, TEAMS.P1);
  updateKeeperMeshFacing(p1KeeperMesh, p1KeeperBody, TEAMS.P1);

  updatePlayerMeshFacing(p2Mesh, p2Body);
  updatePlayerMeshFacing(p2Mate1Mesh, p2Mate1Body);
  updatePlayerMeshFacing(p2Mate2Mesh, p2Mate2Body);

  updateKeeperSideFacing(p2KeeperBody, TEAMS.P2);
  updateKeeperMeshFacing(p2KeeperMesh, p2KeeperBody, TEAMS.P2);

  const p1HasBall = gameState.ballCarrier === TEAMS.P1;
  const p2HasBall = gameState.ballCarrier === TEAMS.P2;
  const p1IsDefending = p2HasBall;
  const p2IsDefending = p1HasBall;

  // Estado visual de animación:
  // - idle: si el cuerpo está prácticamente quieto.
  // - jog: si está defendiendo/marcando.
  // - run: si tiene la pelota o está atacando.
  // La validación fina de "quieto" vive dentro de updatePlayerAnimationVariant().
  updatePlayerAnimationVariant(p1Mesh, p1Body, p1HasBall ? "run" : p1IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p1Mate1Mesh, p1Mate1Body, p1HasBall ? "run" : p1IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p1Mate2Mesh, p1Mate2Body, p1HasBall ? "run" : p1IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p1KeeperMesh, p1KeeperBody, p1IsDefending ? "jog" : "idle");

  updatePlayerAnimationVariant(p2Mesh, p2Body, p2HasBall ? "run" : p2IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p2Mate1Mesh, p2Mate1Body, p2HasBall ? "run" : p2IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p2Mate2Mesh, p2Mate2Body, p2HasBall ? "run" : p2IsDefending ? "jog" : "run");
  updatePlayerAnimationVariant(p2KeeperMesh, p2KeeperBody, p2IsDefending ? "jog" : "idle");

  p1NameLabel.position.set(p1Body.pos.x, p1Body.pos.y + 1.45, p1Body.pos.z);
  p1Mate1NameLabel.position.set(
    p1Mate1Body.pos.x,
    p1Mate1Body.pos.y + 1.45,
    p1Mate1Body.pos.z
  );
  p1Mate2NameLabel.position.set(
    p1Mate2Body.pos.x,
    p1Mate2Body.pos.y + 1.45,
    p1Mate2Body.pos.z
  );
  p1KeeperNameLabel.position.set(
    p1KeeperBody.pos.x,
    p1KeeperBody.pos.y + 1.45,
    p1KeeperBody.pos.z
  );

  p2NameLabel.position.set(p2Body.pos.x, p2Body.pos.y + 1.45, p2Body.pos.z);
  p2Mate1NameLabel.position.set(
    p2Mate1Body.pos.x,
    p2Mate1Body.pos.y + 1.45,
    p2Mate1Body.pos.z
  );
  p2Mate2NameLabel.position.set(
    p2Mate2Body.pos.x,
    p2Mate2Body.pos.y + 1.45,
    p2Mate2Body.pos.z
  );
  p2KeeperNameLabel.position.set(
    p2KeeperBody.pos.x,
    p2KeeperBody.pos.y + 1.45,
    p2KeeperBody.pos.z
  );

  const controlledBody = getControlledPlayerBody();

  controlledIndicatorGroup.visible =
    gameState.gamePhase !== GAME_PHASES.WIN && !!controlledBody;

  if (controlledBody) {
    const arrowBob = Math.sin(Date.now() * 0.008) * 0.08;

    const movementDir = controlledBody.vel ? controlledBody.vel.clone() : new THREE.Vector3();
    movementDir.y = 0;

    const facingDir =
      movementDir.lengthSq() > 0.08
        ? movementDir
        : controlledBody.facing
        ? controlledBody.facing.clone()
        : new THREE.Vector3(1, 0, 0);

    facingDir.y = 0;

    if (facingDir.lengthSq() < 0.001) {
      facingDir.set(1, 0, 0);
    }

    facingDir.normalize();

    controlledIndicatorGroup.position.set(controlledBody.pos.x, 0, controlledBody.pos.z);

    controlledArrow.position.y = controlledBody.pos.y + 1.08 + arrowBob;
    controlledRing.rotation.y += 0.018;

    const markerAngle = Math.atan2(facingDir.x, facingDir.z) + Math.PI;
    controlledIndicatorGroup.rotation.y = markerAngle;
  }

  if (ballBody.vel.lengthSq() > 0.0001) {
    const rollAxis = new THREE.Vector3(ballBody.vel.z, 0, -ballBody.vel.x).normalize();
    const rollSpeed = ballBody.vel.length() * 0.05;
    ballMesh.rotateOnWorldAxis(rollAxis, rollSpeed);
  }

  p1Shadow.position.set(p1Body.pos.x, 0.01, p1Body.pos.z);
  p1Mate1Shadow.position.set(p1Mate1Body.pos.x, 0.01, p1Mate1Body.pos.z);
  p1Mate2Shadow.position.set(p1Mate2Body.pos.x, 0.01, p1Mate2Body.pos.z);
  p1KeeperShadow.position.set(p1KeeperBody.pos.x, 0.01, p1KeeperBody.pos.z);

  p2Shadow.position.set(p2Body.pos.x, 0.01, p2Body.pos.z);
  p2Mate1Shadow.position.set(p2Mate1Body.pos.x, 0.01, p2Mate1Body.pos.z);
  p2Mate2Shadow.position.set(p2Mate2Body.pos.x, 0.01, p2Mate2Body.pos.z);
  p2KeeperShadow.position.set(p2KeeperBody.pos.x, 0.01, p2KeeperBody.pos.z);

  ballShadow.position.set(ballBody.pos.x, 0.01, ballBody.pos.z);

  p1Shadow.material.opacity = Math.max(0.05, 0.28 - p1Body.pos.y * 0.06);
  p1Mate1Shadow.material.opacity = Math.max(0.05, 0.28 - p1Mate1Body.pos.y * 0.06);
  p1Mate2Shadow.material.opacity = Math.max(0.05, 0.28 - p1Mate2Body.pos.y * 0.06);
  p1KeeperShadow.material.opacity = Math.max(0.05, 0.28 - p1KeeperBody.pos.y * 0.06);

  p2Shadow.material.opacity = Math.max(0.05, 0.28 - p2Body.pos.y * 0.06);
  p2Mate1Shadow.material.opacity = Math.max(0.05, 0.28 - p2Mate1Body.pos.y * 0.06);
  p2Mate2Shadow.material.opacity = Math.max(0.05, 0.28 - p2Mate2Body.pos.y * 0.06);
  p2KeeperShadow.material.opacity = Math.max(0.05, 0.28 - p2KeeperBody.pos.y * 0.06);

  ballShadow.material.opacity = Math.max(0.04, 0.22 - ballBody.pos.y * 0.07);

  const now = Date.now();

  p1Mesh.scale.y =
    PLAYER_VISUAL_SCALE * (1 + Math.sin(now * 0.02) * Math.min(p1Body.speed / 10, 0.12));
  p1Mate1Mesh.scale.y =
    PLAYER_VISUAL_SCALE *
    (1 + Math.sin(now * 0.02 + 0.45) * Math.min(p1Mate1Body.speed / 10, 0.12));
  p1Mate2Mesh.scale.y =
    PLAYER_VISUAL_SCALE *
    (1 + Math.sin(now * 0.02 + 0.9) * Math.min(p1Mate2Body.speed / 10, 0.12));

  p2Mesh.scale.y =
    PLAYER_VISUAL_SCALE *
    (1 + Math.sin(now * 0.02 + 1) * Math.min(p2Body.speed / 10, 0.12));
  p2Mate1Mesh.scale.y =
    PLAYER_VISUAL_SCALE *
    (1 + Math.sin(now * 0.02 + 1.45) * Math.min(p2Mate1Body.speed / 10, 0.12));
  p2Mate2Mesh.scale.y =
    PLAYER_VISUAL_SCALE *
    (1 + Math.sin(now * 0.02 + 1.9) * Math.min(p2Mate2Body.speed / 10, 0.12));
}

// =========================
// PARTICLES
// =========================

function checkGoalParticles() {
  const scored = ballBody.pos.x < -FIELD_W / 2 || ballBody.pos.x > FIELD_W / 2;

  if (scored && !lastGoalParticleState) {
    spawnParticles(scene, particles, ballBody.pos.x, 1, ballBody.pos.z, 0xffee44, 20);
    spawnParticles(scene, particles, ballBody.pos.x, 1, ballBody.pos.z, 0xff6644, 15);
  }

  lastGoalParticleState = scored;
}

// =========================
// LOOP
// =========================

let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);

  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (isRushStarting || isRushPaused) {
    syncMeshes();
    refreshFullUI(gameState, uiTeamOptions);
    updateMobileActionButtonsVisibility();
    updateMobileContextButton();
    updateResponsiveCamera();
    renderer.render(scene, camera);
    return;
  }

  simulate();
  syncMeshes();
  updateParticles(scene, particles, dt);
  checkGoalParticles();
  refreshFullUI(gameState, uiTeamOptions);
  updateMobileActionButtonsVisibility();
  updateMobileContextButton();
  updateResponsiveCamera();

  renderer.render(scene, camera);
}

// =========================
// START
// =========================

resetPositions();
refreshFullUI(gameState, uiTeamOptions);
renderMatchStats(gameState, uiTeamOptions);
addBackgroundStars(scene);
beginRushStartSequence();
requestAnimationFrame(animate);