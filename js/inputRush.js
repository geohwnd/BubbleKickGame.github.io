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

// =========================
// CALLBACKS
// =========================

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

  if (playerNumber === 1) {
    if (inputState.keys.has("w")) input.z -= 1;
    if (inputState.keys.has("s")) input.z += 1;
    if (inputState.keys.has("a")) input.x -= 1;
    if (inputState.keys.has("d")) input.x += 1;

    // Mouse/touch virtual joystick. This combines with WASD.
    input.add(inputState.joystickMove);

    // DualSense / gamepad left stick + D-pad. This combines with WASD and touch joystick.
    input.add(inputState.gamepadMove);
  } else {
    if (inputState.keys.has("ArrowUp")) input.z -= 1;
    if (inputState.keys.has("ArrowDown")) input.z += 1;
    if (inputState.keys.has("ArrowLeft")) input.x -= 1;
    if (inputState.keys.has("ArrowRight")) input.x += 1;
  }

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
}

function handleKeyDown(event) {
  const key = normalizeKey(event.key);

  inputState.keys.add(key);

  if (["w", "a", "s", "d", "Space", "Shift", "c", "q"].includes(key)) {
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

  if (key === "Space") {
    event.preventDefault();
  }
}

// =========================
// GAMEPAD / DUALSENSE
// =========================

function handleGamepadConnected(event) {
  inputState.gamepadIndex = event.gamepad.index;
  resetGamepadInput();
}

function handleGamepadDisconnected(event) {
  if (inputState.gamepadIndex === event.gamepad.index) {
    inputState.gamepadIndex = null;
    resetGamepadInput();
  }
}

function resetGamepadInput() {
  inputState.gamepadMove.set(0, 0, 0);
  inputState.gamepadButtonsDown.clear();
}

function getActiveGamepad() {
  const gamepads = navigator.getGamepads?.() ?? [];

  if (
    inputState.gamepadIndex !== null &&
    gamepads[inputState.gamepadIndex]
  ) {
    return gamepads[inputState.gamepadIndex];
  }

  const firstConnectedGamepad = gamepads.find(Boolean);

  if (firstConnectedGamepad) {
    inputState.gamepadIndex = firstConnectedGamepad.index;
  }

  return firstConnectedGamepad ?? null;
}

function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  if (Math.abs(value) < deadzone) return 0;
  return value;
}

function isGamepadButtonPressed(gamepad, buttonIndex) {
  const button = gamepad?.buttons?.[buttonIndex];
  return Boolean(button?.pressed || button?.value > 0.55);
}

function handleGamepadButton(gamepad, buttonIndex, action) {
  const pressed = isGamepadButtonPressed(gamepad, buttonIndex);
  const wasPressed = inputState.gamepadButtonsDown.has(buttonIndex);

  if (pressed && !wasPressed) {
    inputState.gamepadButtonsDown.add(buttonIndex);
    action?.();
    return;
  }

  if (!pressed && wasPressed) {
    inputState.gamepadButtonsDown.delete(buttonIndex);
  }
}

export function updateGamepadInput() {
  const gamepad = getActiveGamepad();

  if (!gamepad) {
    resetGamepadInput();
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

  inputState.gamepadMove.set(moveX, 0, moveZ);

  if (inputState.gamepadMove.lengthSq() > 1) {
    inputState.gamepadMove.normalize();
  }

  // DualSense / PlayStation layout:
  // Cross: shoot, Circle: dash, Square: pass, Triangle: switch defense, Options: restart.
  handleGamepadButton(gamepad, GAMEPAD_BUTTONS.CROSS, callbacks.onShoot);
  handleGamepadButton(gamepad, GAMEPAD_BUTTONS.CIRCLE, callbacks.onDash);
  handleGamepadButton(gamepad, GAMEPAD_BUTTONS.SQUARE, callbacks.onPass);
  handleGamepadButton(gamepad, GAMEPAD_BUTTONS.TRIANGLE, callbacks.onSwitchDefense);
  handleGamepadButton(gamepad, GAMEPAD_BUTTONS.OPTIONS, callbacks.onRestart);
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

export function getGamepadMoveInput() {
  return inputState.gamepadMove.clone();
}

export function hasGamepadConnected() {
  return Boolean(getActiveGamepad());
}