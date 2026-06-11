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
};

const JOYSTICK_DEADZONE = 5;
const JOYSTICK_MAX_RADIUS = 62;
const JOYSTICK_FULL_INPUT_MODE = true;

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