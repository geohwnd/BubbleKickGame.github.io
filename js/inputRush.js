import * as THREE from "three";

// =========================
// INPUT STATE
// =========================

export const inputState = {
  keys: new Set(),
  dragStart: null,
  dragCurrent: null,
  isDragging: false,

  // Virtual joystick / Playroom-style pointer input.
  // Click/touch inside the canvas, drag in any direction, and player 1 moves.
  joystickActive: false,
  joystickPointerId: null,
  joystickStartScreen: new THREE.Vector2(),
  joystickCurrentScreen: new THREE.Vector2(),
  joystickMove: new THREE.Vector3(),

  // Gamepad / DualSense input.
  gamepadIndex: null,
  gamepadMove: new THREE.Vector3(),
  gamepadButtonsDown: new Set(),
  playerGamepadIndexes: {
    1: null,
    2: null,
  },
  playerGamepadMoves: {
    1: new THREE.Vector3(),
    2: new THREE.Vector3(),
  },
  playerGamepadButtonsDown: {
    1: new Set(),
    2: new Set(),
  },
};

const JOYSTICK_DEADZONE = 5;
const JOYSTICK_MAX_RADIUS = 62;
const JOYSTICK_FULL_INPUT_MODE = true;

const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_AXIS_X = 0;
const GAMEPAD_AXIS_Y = 1;

const GAMEPAD_BUTTONS = {
  CROSS: 0,
  CIRCLE: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SHARE: 8,
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

const LOCAL_CONTROLS_STORAGE_KEY = "rushLocalControls";

function getLocalControlsConfig() {
  const fallback = {
    p1: "keyboard-p1",
    p2: "keyboard-p2",
  };

  if (typeof window === "undefined") return fallback;

  if (window.rushLocalControls) {
    return {
      ...fallback,
      ...window.rushLocalControls,
    };
  }

  try {
    const savedConfig = JSON.parse(
      localStorage.getItem(LOCAL_CONTROLS_STORAGE_KEY) ?? "null"
    );

    return {
      ...fallback,
      ...(savedConfig ?? {}),
    };
  } catch (error) {
    return fallback;
  }
}

function getControlForPlayer(playerNumber = 1) {
  const config = getLocalControlsConfig();
  return playerNumber === 1 ? config.p1 : config.p2;
}

function isKeyboardControlForPlayer(playerNumber = 1) {
  const control = getControlForPlayer(playerNumber);
  return playerNumber === 1
    ? control === "keyboard-p1"
    : control === "keyboard-p2";
}

function getConfiguredGamepadSlot(playerNumber = 1) {
  const control = getControlForPlayer(playerNumber);

  if (control === "gamepad-0") return 0;
  if (control === "gamepad-1") return 1;

  return null;
}

// =========================
// CALLBACKS
// =========================

const callbacks = {
  onDash: null,
  onShoot: null,
  onSwitchDefense: null,
  onPass: null,
  onRestart: null,
  onDragStart: null,
  onDragMove: null,
  onDragEnd: null,
  onBlur: null,
};

export function setInputCallbacks(newCallbacks = {}) {
  Object.assign(callbacks, newCallbacks);
}

// =========================
// KEY HELPERS
// =========================

export function normalizeKey(key) {
  if (key === " ") return "Space";

  if (key === "Shift" || key === "ShiftLeft" || key === "ShiftRight") {
    return "Shift";
  }

  if (typeof key === "string" && key.length === 1) {
    return key.toLowerCase();
  }

  return key;
}

export function isKeyDown(key) {
  return inputState.keys.has(key);
}

export function clearInput() {
  inputState.keys.clear();
  inputState.dragStart = null;
  inputState.dragCurrent = null;
  inputState.isDragging = false;
  resetJoystick();
  resetGamepadInput();

  callbacks.onBlur?.();
}

// =========================
// MOVEMENT
// =========================

export function getMoveInput(playerNumber = 1) {
  const input = new THREE.Vector3();
  const isPlayerOne = playerNumber === 1 || playerNumber === "P1" || playerNumber === "p1";
  const normalizedPlayerNumber = isPlayerOne ? 1 : 2;

  if (isKeyboardControlForPlayer(normalizedPlayerNumber)) {
    if (normalizedPlayerNumber === 1) {
      if (inputState.keys.has("w") || inputState.keys.has("KeyW")) input.z -= 1;
      if (inputState.keys.has("s") || inputState.keys.has("KeyS")) input.z += 1;
      if (inputState.keys.has("a") || inputState.keys.has("KeyA")) input.x -= 1;
      if (inputState.keys.has("d") || inputState.keys.has("KeyD")) input.x += 1;

      // Mouse/touch virtual joystick is only for player 1.
      input.add(inputState.joystickMove);
    } else {
      if (inputState.keys.has("ArrowUp")) input.z -= 1;
      if (inputState.keys.has("ArrowDown")) input.z += 1;
      if (inputState.keys.has("ArrowLeft")) input.x -= 1;
      if (inputState.keys.has("ArrowRight")) input.x += 1;
    }
  }

  input.add(inputState.playerGamepadMoves[normalizedPlayerNumber]);

  if (input.lengthSq() > 1) {
    input.normalize();
  }

  return input;
}

// =========================
// EVENT LISTENERS
// =========================

export function setupInputListeners(options = {}) {
  const {
    canvas = null,
    camera = null,
    groundPlane = null,
    raycaster = null,
    mouse = null,
    canStartDrag = null,
  } = options;

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", clearInput);
  window.addEventListener("gamepadconnected", handleGamepadConnected);
  window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);
  window.addEventListener("rushLocalControlsSelected", handleLocalControlsSelected);

  if (canvas && camera && groundPlane && raycaster && mouse) {
    setupPointerListeners({
      canvas,
      camera,
      groundPlane,
      raycaster,
      mouse,
      canStartDrag,
    });
  }
}

export function removeInputListeners() {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", clearInput);
  window.removeEventListener("gamepadconnected", handleGamepadConnected);
  window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
  window.removeEventListener("rushLocalControlsSelected", handleLocalControlsSelected);
}

function handleKeyDown(event) {
  const key = normalizeKey(event.key);

  inputState.keys.add(key);

  if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Shift", "c", "q", "Enter"].includes(key)) {
    event.preventDefault();
  }

  if (key === "Shift" && !event.repeat) {
    callbacks.onDash?.();
  }

  if (key === "Space" && !event.repeat) {
    callbacks.onShoot?.();
  }

  if (key === "c" && !event.repeat) {
    callbacks.onSwitchDefense?.();
  }

  if (key === "q" && !event.repeat) {
    callbacks.onPass?.();
  }

  if (key === "r" && !event.repeat) {
    callbacks.onRestart?.();
  }
}

function handleKeyUp(event) {
  const key = normalizeKey(event.key);

  inputState.keys.delete(key);

  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
    event.preventDefault();
  }
}

// =========================
// GAMEPAD / DUALSENSE
// =========================

function handleGamepadConnected(event) {
  assignConnectedGamepads();
  resetGamepadInput();
}

function handleGamepadDisconnected(event) {
  const disconnectedIndex = event.gamepad.index;

  if (
    inputState.gamepadIndex === disconnectedIndex ||
    inputState.playerGamepadIndexes[1] === disconnectedIndex ||
    inputState.playerGamepadIndexes[2] === disconnectedIndex
  ) {
    assignConnectedGamepads();
    resetGamepadInput();
  }
}

function handleLocalControlsSelected() {
  assignConnectedGamepads();
  resetGamepadInput();
}

function resetGamepadInput() {
  inputState.gamepadMove.set(0, 0, 0);
  inputState.gamepadButtonsDown.clear();
  inputState.playerGamepadMoves[1].set(0, 0, 0);
  inputState.playerGamepadMoves[2].set(0, 0, 0);
  inputState.playerGamepadButtonsDown[1].clear();
  inputState.playerGamepadButtonsDown[2].clear();
}

function assignConnectedGamepads() {
  const gamepads = navigator.getGamepads?.() ?? [];
  const connectedGamepads = gamepads.filter(Boolean);
  const p1Slot = getConfiguredGamepadSlot(1);
  const p2Slot = getConfiguredGamepadSlot(2);

  inputState.playerGamepadIndexes[1] =
    p1Slot !== null ? connectedGamepads[p1Slot]?.index ?? null : null;

  inputState.playerGamepadIndexes[2] =
    p2Slot !== null ? connectedGamepads[p2Slot]?.index ?? null : null;

  inputState.gamepadIndex = inputState.playerGamepadIndexes[1];
}

function getActiveGamepad(playerNumber = 1) {
  const gamepads = navigator.getGamepads?.() ?? [];

  if (
    inputState.playerGamepadIndexes[playerNumber] !== null &&
    gamepads[inputState.playerGamepadIndexes[playerNumber]]
  ) {
    return gamepads[inputState.playerGamepadIndexes[playerNumber]];
  }

  assignConnectedGamepads();

  const assignedIndex = inputState.playerGamepadIndexes[playerNumber];
  return assignedIndex !== null ? gamepads[assignedIndex] ?? null : null;
}

function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  if (Math.abs(value) < deadzone) return 0;
  return value;
}

function isGamepadButtonPressed(gamepad, buttonIndex) {
  const button = gamepad?.buttons?.[buttonIndex];
  return Boolean(button?.pressed || button?.value > 0.55);
}

function handleGamepadButton(gamepad, buttonIndex, action, playerNumber = 1) {
  const pressed = isGamepadButtonPressed(gamepad, buttonIndex);
  const buttonSet = inputState.playerGamepadButtonsDown[playerNumber];
  const wasPressed = buttonSet.has(buttonIndex);

  if (pressed && !wasPressed) {
    buttonSet.add(buttonIndex);
    action?.();
    return;
  }

  if (!pressed && wasPressed) {
    buttonSet.delete(buttonIndex);
  }
}

function updateSinglePlayerGamepadInput(playerNumber, actions = {}) {
  const gamepad = getActiveGamepad(playerNumber);
  const moveVector = inputState.playerGamepadMoves[playerNumber];

  if (!gamepad) {
    moveVector.set(0, 0, 0);
    inputState.playerGamepadButtonsDown[playerNumber].clear();
    return;
  }

  const leftX = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_X] ?? 0);
  const leftY = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_Y] ?? 0);

  let moveX = leftX;
  let moveZ = leftY;

  if (isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_LEFT)) moveX -= 1;
  if (isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_RIGHT)) moveX += 1;
  if (isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_UP)) moveZ -= 1;
  if (isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_DOWN)) moveZ += 1;

  moveVector.set(moveX, 0, moveZ);

  if (moveVector.lengthSq() > 1) {
    moveVector.normalize();
  }

  // DualSense / PlayStation layout:
  // Cross: shoot, Circle: dash, Square: pass, Triangle: switch defense, Options: restart.
  handleGamepadButton(
    gamepad,
    GAMEPAD_BUTTONS.CROSS,
    actions.onShoot ?? callbacks.onShoot,
    playerNumber
  );
  handleGamepadButton(
    gamepad,
    GAMEPAD_BUTTONS.CIRCLE,
    actions.onDash ?? callbacks.onDash,
    playerNumber
  );
  handleGamepadButton(
    gamepad,
    GAMEPAD_BUTTONS.SQUARE,
    actions.onPass ?? callbacks.onPass,
    playerNumber
  );
  handleGamepadButton(
    gamepad,
    GAMEPAD_BUTTONS.TRIANGLE,
    actions.onSwitchDefense ?? callbacks.onSwitchDefense,
    playerNumber
  );
  handleGamepadButton(
    gamepad,
    GAMEPAD_BUTTONS.OPTIONS,
    actions.onRestart ?? callbacks.onRestart,
    playerNumber
  );
}

export function updateGamepadInput(playerActions = {}) {
  updateSinglePlayerGamepadInput(1, playerActions[1] ?? {});
  updateSinglePlayerGamepadInput(2, playerActions[2] ?? {});

  // Backward compatibility for the original one-player Rush mode.
  inputState.gamepadMove.copy(inputState.playerGamepadMoves[1]);
}

// =========================
// POINTER / SLINGSHOT HELPERS
// =========================

export function getScreenPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;

  return new THREE.Vector2(
    source.clientX - rect.left,
    source.clientY - rect.top
  );
}

function updateJoystickFromScreenPoint(screenPoint) {
  if (!inputState.joystickActive || !screenPoint) return;

  inputState.joystickCurrentScreen.copy(screenPoint);

  const delta = new THREE.Vector2().subVectors(
    inputState.joystickCurrentScreen,
    inputState.joystickStartScreen
  );

  const distance = delta.length();

  if (distance < JOYSTICK_DEADZONE) {
    inputState.joystickMove.set(0, 0, 0);
    return;
  }

  const clampedDistance = Math.min(distance, JOYSTICK_MAX_RADIUS);
  const rawStrength = clampedDistance / JOYSTICK_MAX_RADIUS;
  const strength = JOYSTICK_FULL_INPUT_MODE ? 1 : rawStrength;
  const direction = delta.normalize();

  inputState.joystickMove.set(
    direction.x * strength,
    0,
    direction.y * strength
  );
}

function resetJoystick() {
  inputState.joystickActive = false;
  inputState.joystickPointerId = null;
  inputState.joystickStartScreen.set(0, 0);
  inputState.joystickCurrentScreen.set(0, 0);
  inputState.joystickMove.set(0, 0, 0);
}

function setupPointerListeners(context) {
  const { canvas } = context;

  canvas.addEventListener("mousedown", (event) => handlePointerStart(event, context));
  canvas.addEventListener("mousemove", (event) => handlePointerMove(event, context));
  window.addEventListener("mouseup", (event) => handlePointerEnd(event, context));

  canvas.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      handlePointerStart(event, context);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
      handlePointerMove(event, context);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
      handlePointerEnd(event, context);
    },
    { passive: false }
  );
}

function handlePointerStart(event, context) {
  const screenPoint = getScreenPoint(event, context.canvas);
  inputState.joystickActive = true;
  inputState.joystickPointerId = event.pointerId ?? "mouse";
  inputState.joystickStartScreen.copy(screenPoint);
  inputState.joystickCurrentScreen.copy(screenPoint);
  inputState.joystickMove.set(0, 0, 0);

  const point = getGroundPoint(event, context);

  if (!point) return;

  if (typeof context.canStartDrag === "function" && !context.canStartDrag(point)) {
    return;
  }

  inputState.isDragging = true;
  inputState.dragStart = point.clone();
  inputState.dragCurrent = point.clone();

  callbacks.onDragStart?.({
    point,
    dragStart: inputState.dragStart,
    dragCurrent: inputState.dragCurrent,
  });
}

function handlePointerMove(event, context) {
  if (inputState.joystickActive) {
    updateJoystickFromScreenPoint(getScreenPoint(event, context.canvas));
  }

  if (!inputState.isDragging) return;

  const point = getGroundPoint(event, context);

  if (!point) return;

  inputState.dragCurrent = point.clone();

  callbacks.onDragMove?.({
    point,
    dragStart: inputState.dragStart,
    dragCurrent: inputState.dragCurrent,
  });
}

function handlePointerEnd(event, context) {
  resetJoystick();

  if (!inputState.isDragging) return;

  const point = getGroundPoint(event, context);

  callbacks.onDragEnd?.({
    point,
    dragStart: inputState.dragStart,
    dragCurrent: inputState.dragCurrent,
  });

  inputState.isDragging = false;
  inputState.dragStart = null;
  inputState.dragCurrent = null;
}

export function getGroundPoint(event, context) {
  const {
    canvas,
    camera,
    groundPlane,
    raycaster,
    mouse,
  } = context;

  const rect = canvas.getBoundingClientRect();

  const source = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;

  const x = source.clientX - rect.left;
  const y = source.clientY - rect.top;

  mouse.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);

  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, target);

  return target;
}

export function isNearBody(point, body, threshold = 1.4) {
  if (!point || !body) return false;

  return point.distanceTo(new THREE.Vector3(body.pos.x, 0, body.pos.z)) < threshold;
}

export function resetDrag() {
  inputState.dragStart = null;
  inputState.dragCurrent = null;
  inputState.isDragging = false;
  resetJoystick();
}

export function getJoystickMoveInput() {
  return inputState.joystickMove.clone();
}

export function getGamepadMoveInput(playerNumber = 1) {
  return inputState.playerGamepadMoves[playerNumber]?.clone() ?? new THREE.Vector3();
}

export function hasGamepadConnected(playerNumber = 1) {
  return Boolean(getActiveGamepad(playerNumber));
}