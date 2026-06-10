import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ─── Renderer ────────────────────────────────────────────────────────────────
const canvas = document.getElementById("game-canvas");
const countdownScreen = document.getElementById("countdown-screen");
const countdownNumber = document.getElementById("countdown-number");
const jugglingIntroScreen = document.getElementById("juggling-intro");
const startJugglingBtn = document.getElementById("start-juggling-btn");
const jugglingMusic = new Audio("audio/Brazil Football Samba.mp3");
jugglingMusic.loop = true;
jugglingMusic.preload = "auto";
jugglingMusic.volume = 0.42;

let jugglingMusicStarted = false;

const juggleHitSound = new Audio("audio/Combo Hit 05.wav");
juggleHitSound.preload = "auto";
juggleHitSound.volume = 0.72;

function playJuggleHitSound() {
  juggleHitSound.currentTime = 0;
  juggleHitSound.play().catch(() => {});
}

function startJugglingMusic() {
  if (jugglingMusicStarted) return;
  jugglingMusicStarted = true;

  jugglingMusic.play().catch(() => {
    jugglingMusicStarted = false;
  });
}
let countdownActive = false;
let countdownTimeouts = [];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3d72ff);
scene.fog = new THREE.Fog(0x72e9ff, 18, 58);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 5, 11);
camera.lookAt(0, 1, 0);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.28,
  0.22,
  0.82
);
composer.addPass(bloomPass);

function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// ─── Lights ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.15));

const sun = new THREE.DirectionalLight(0xffffff, 2.15);
sun.position.set(-5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const cyanFill = new THREE.DirectionalLight(0x65ffe7, 1.15);
cyanFill.position.set(7, 4.5, 5);
scene.add(cyanFill);

const limeRim = new THREE.DirectionalLight(0xb9ff22, 0.55);
limeRim.position.set(-7, 4, -5);
scene.add(limeRim);

// ─── Field ───────────────────────────────────────────────────────────────────
// Plano azul removido temporalmente para probar el look sin suelo base.
// const field = new THREE.Mesh(
//   new THREE.PlaneGeometry(20, 20),
//   new THREE.MeshStandardMaterial({
//     color: 0x4bbcff,
//     roughness: 0.86,
//     metalness: 0.02,
//   })
// );
// field.rotation.x = -Math.PI / 2;
// field.receiveShadow = true;
// scene.add(field);

// Franjas azules removidas: se dejan únicamente las líneas de la cancha.

// Glows/círculos de fondo removidos: se dejan únicamente las líneas de la cancha.

// Lines
function line(x1, z1, x2, z2) {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 0.01, z1),
    new THREE.Vector3(x2, 0.01, z2),
  ]);
  scene.add(
    new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
      })
    )
  );
}
line(-8, -8, 8, -8);
line(-8, 8, 8, 8);
line(-8, -8, -8, 8);
line(8, -8, 8, 8);
line(0, -8, 0, 8);

const circleM = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 2.5, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  })
);
circleM.rotation.x = -Math.PI / 2;
circleM.position.y = 0.01;
scene.add(circleM);

// ─── Ball ─────────────────────────────────────────────────────────────────────
const ball = new THREE.Group();
scene.add(ball);

const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.35,
});
const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.18, 16),
  shadowMat
);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.position.y = 0.005;
scene.add(ballShadow);

// ─── Landing Predictor ────────────────────────────────────────────────────────
const predictRingMat = new THREE.MeshBasicMaterial({
  color: 0xe63946,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
});

const predictRing = new THREE.Mesh(
  new THREE.RingGeometry(0.28, 0.38, 36),
  predictRingMat
);
predictRing.rotation.x = -Math.PI / 2;
predictRing.position.y = 0.012;
scene.add(predictRing);

const predictDotMat = new THREE.MeshBasicMaterial({
  color: 0xe63946,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
});

const predictDot = new THREE.Mesh(
  new THREE.CircleGeometry(0.12, 32),
  predictDotMat
);
predictDot.rotation.x = -Math.PI / 2;
predictDot.position.y = 0.011;
scene.add(predictDot);

const crossMat = new THREE.LineBasicMaterial({
  color: 0xe63946,
  transparent: true,
  opacity: 0,
});

function makeCrossLine(x1, z1, x2, z2) {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 0.013, z1),
    new THREE.Vector3(x2, 0.013, z2),
  ]);
  return new THREE.Line(g, crossMat);
}

const cross1 = makeCrossLine(-0.55, 0, 0.55, 0);
const cross2 = makeCrossLine(0, -0.55, 0, 0.55);
scene.add(cross1);
scene.add(cross2);

let predictPulse = 0;

function hideLandingPredictor() {
  predictRingMat.opacity = 0;
  predictDotMat.opacity = 0;
  crossMat.opacity = 0;
}

function predictLanding(px, py, pz, vx, vy, vz) {
  let x = px;
  let y = py;
  let z = pz;
  let dx = vx;
  let dy = vy;
  let dz = vz;

  const step = 0.016;
  const maxSteps = 400;

  for (let i = 0; i < maxSteps; i++) {
    dy += GRAVITY * step;
    x += dx * step;
    z += dz * step;
    y += dy * step;

    if (Math.abs(x) > FIELD_H) {
      dx *= -0.7;
      x = Math.sign(x) * FIELD_H;
    }

    if (Math.abs(z) > FIELD_H) {
      dz *= -0.7;
      z = Math.sign(z) * FIELD_H;
    }

    if (y <= BALL_R) {
      return { x, z, t: i * step };
    }
  }

  return { x, z, t: maxSteps * step };
}

function updateLandingPredictor(dt) {
  predictPulse += dt * 3.5;

  if (
    !isPlaying ||
    countdownActive ||
    !ballReady ||
    !ball.visible ||
    bPos.y <= 0.5
  ) {
    hideLandingPredictor();
    return;
  }

  const land = predictLanding(
    bPos.x,
    bPos.y,
    bPos.z,
    bVel.x,
    bVel.y,
    bVel.z
  );

  const urgency = Math.max(0, Math.min(1, 1 - land.t / 1.8));
  const alpha = 0.25 + urgency * 0.7;
  const pulse = 1 + Math.sin(predictPulse) * 0.12 * urgency;

  predictRing.position.x = land.x;
  predictRing.position.z = land.z;
  predictRing.scale.setScalar(pulse);
  predictRingMat.opacity = alpha;
  predictRingMat.color.setRGB(
    0.9,
    0.22 + urgency * 0.55,
    0.08 + urgency * 0.1
  );

  predictDot.position.x = land.x;
  predictDot.position.z = land.z;
  predictDotMat.opacity = alpha * 0.35;

  cross1.position.x = land.x;
  cross1.position.z = land.z;
  cross2.position.x = land.x;
  cross2.position.z = land.z;
  crossMat.opacity = alpha * 0.6;
}

// ─── Ball State ───────────────────────────────────────────────────────────────
const bPos = new THREE.Vector3(0, 2, 0);
const bVel = new THREE.Vector3(0.02, 0, 0.01);
const BALL_SPAWN_DELAY = 650;
const GRAVITY = -9.8;
const BALL_R = 0.18;
const FIELD_H = 8.5;

// ─── Character ────────────────────────────────────────────────────────────────
const charPos = new THREE.Vector3(0, 0, 1);
const charTgt = new THREE.Vector3(0, 0, 1);
const SPEED = 5.5;
const KICK_R = 0.85;
const BALL_DRIFT_BASE = 0.75;
const BALL_DRIFT_MAX = 2.45;
const BALL_DIFFICULTY_TOUCHES = 26;

let character = null;
let mixer = null;
const charModels = {};
const charMixers = {};
let activeAnimKey = null;
const anims = {}; // { move, leftJug, rightJug }
let curAction = null;
let kickCooldown = 0;
let isKicking = false;
let kickTimer = 0;
let lastLeg = "right";

// Build placeholder body
function buildBody() {
  const g = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.85, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a3a8f, roughness: 0.55 })
  );
  torso.position.y = 0.85;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xd4956a, roughness: 0.55 })
  );
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);

  const legMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.5,
  });
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 6, 12);

  const lLeg = new THREE.Mesh(legGeo, legMat);
  lLeg.position.set(-0.18, 0.26, 0);
  lLeg.castShadow = true;
  lLeg.name = "leftLeg";
  g.add(lLeg);

  const rLeg = new THREE.Mesh(legGeo, legMat);
  rLeg.position.set(0.18, 0.26, 0);
  rLeg.castShadow = true;
  rLeg.name = "rightLeg";
  g.add(rLeg);

  // Shoes
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
  });
  [-0.18, 0.18].forEach((x) => {
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.28),
      shoeMat
    );
    shoe.position.set(x, 0.03, 0.05);
    shoe.castShadow = true;
    g.add(shoe);
  });

  return g;
}

// ─── GLB Loader ───────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
loader.load(
  "models/Ball_Model.glb",
  (gltf) => {
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 0.36 / maxDim;
    model.scale.setScalar(scale);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    ball.add(model);
  },
  undefined,
  (err) => console.warn("Ball_Model.glb no pudo cargarse", err)
);
const loadBar = document.getElementById("loading-bar-fill");
const loadWrap = document.getElementById("loading-bar-wrap");

let loadedCount = 0;
const ANIM_MAP = [
  { file: "models/Character_FootballIdleAnimation.glb", key: "idle" },
  { file: "models/Character_JoggingRunAnimation.glb", key: "move" },
  { file: "models/Character_LeftJugAnimation.glb", key: "leftJug" },
  { file: "models/Character_RightJugAnimation.glb", key: "rightJug" },
];

function onOneLoaded() {
  loadedCount++;
  loadBar.style.width = (loadedCount / ANIM_MAP.length) * 100 + "%";
  if (loadedCount >= ANIM_MAP.length) {
    setTimeout(() => {
      loadWrap.classList.remove("show");
    }, 400);
    buildCharacter();
  }
}

async function tryLoadGLB(filename, key) {
  try {
    const gltf = await loader.loadAsync(filename);
    const model = gltf.scene;

    model.visible = false;
    model.scale.setScalar(1.15);

    charModels[key] = model;

    if (gltf.animations?.length) {
      const modelMixer = new THREE.AnimationMixer(model);
      const action = modelMixer.clipAction(gltf.animations[0]);

      if (key === "leftJug" || key === "rightJug") {
        action.timeScale = 1.85;
      }

      action.setLoop(
        key === "idle" || key === "move" ? THREE.LoopRepeat : THREE.LoopOnce
      );
      action.clampWhenFinished = key !== "idle" && key !== "move";
      action.play();

      charMixers[key] = modelMixer;
      anims[key] = action;
    }

    onOneLoaded();
  } catch (error) {
    console.warn(`No se pudo cargar ${filename}`, error);
    onOneLoaded();
  }
}

function buildCharacter() {
  character = new THREE.Group();
  scene.add(character);
  character.position.copy(charPos);

  const keys = Object.keys(charModels);

  if (keys.length === 0) {
    character.add(buildBody());
    return;
  }

  keys.forEach((key) => {
    const model = charModels[key];
    model.visible = false;
    model.position.set(0, 0, 0);
    character.add(model);
  });

  playAnim(charModels.idle ? "idle" : "move");
}

function playAnim(name, onFinish) {
  if (!charModels[name]) return;
  if (activeAnimKey === name && !onFinish) return;

  activeAnimKey = name;

  Object.entries(charModels).forEach(([key, model]) => {
    model.visible = key === name;
  });

  const next = anims[name];
  if (!next) return;

  next.reset().play();
  curAction = next;

  if (onFinish && charMixers[name]) {
    const cb = (e) => {
      if (e.action === next) {
        charMixers[name].removeEventListener("finished", cb);
        onFinish();
      }
    };
    charMixers[name].addEventListener("finished", cb);
  }
}

function kickLegVisual(side) {
  if (!character) return;
  const leg = character.getObjectByName(
    side === "left" ? "leftLeg" : "rightLeg"
  );
  if (!leg) return;
  leg.rotation.x = -1.0;
  setTimeout(() => {
    leg.rotation.x = 0;
  }, 280);
}

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

let mouseGround = null;
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const pt = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, pt)) mouseGround = pt.clone();
});

const cursorEl = document.getElementById("cursor");
window.addEventListener("mousemove", (e) => {
  cursorEl.style.left = e.clientX + "px";
  cursorEl.style.top = e.clientY + "px";
});

// ─── Score ───────────────────────────────────────────────────────────────────
let touches = 0,
  bestScore = 0,
  isPlaying = false,
  ballReady = false,
  ballSpawnTimeout = null;
const counterEl = document.getElementById("counter");
const bestEl = document.getElementById("best-score");
const comboBox = document.getElementById("combo-box");
const comboText = document.getElementById("combo-text");
const gameOverScreen = document.getElementById("game-over-screen");
const finalScoreEl = document.getElementById("final-score");
const playAgainBtn = document.getElementById("play-again-btn");

function startCountdown() {
  countdownActive = true;
  document.body.classList.add("is-counting-down");
  countdownScreen?.classList.remove("hidden");

  countdownTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  countdownTimeouts = [];

  const values = ["3", "2", "1", "GO!"];

  values.forEach((value, index) => {
    const timeoutId = setTimeout(() => {
      if (!countdownNumber) return;

      countdownNumber.classList.add("is-changing");
      countdownNumber.textContent = value;
      void countdownNumber.offsetWidth;
      countdownNumber.classList.remove("is-changing");
    }, index * 850);

    countdownTimeouts.push(timeoutId);
  });

  const endTimeout = setTimeout(() => {
    countdownActive = false;
    document.body.classList.remove("is-counting-down");
    countdownScreen?.classList.add("hidden");
  }, values.length * 850);

  countdownTimeouts.push(endTimeout);
}

function prepareBallSpawn() {
  ballReady = false;
  clearTimeout(ballSpawnTimeout);

  bPos.set(0, 2.5, 0);
  bVel.set(0, 0, 0);
  ball.visible = false;
  ballShadow.visible = false;

  ballSpawnTimeout = setTimeout(() => {
    ballReady = true;
    ball.visible = true;
    ballShadow.visible = true;
    bVel.set(0.1, 0, 0.05);
  }, BALL_SPAWN_DELAY);
}

function addTouch() {
  touches++;
  playJuggleHitSound();
  counterEl.textContent = touches;
  counterEl.classList.remove("pulse");
  void counterEl.offsetWidth;
  counterEl.classList.add("pulse");
  if (touches > bestScore) {
    bestScore = touches;
    bestEl.textContent = bestScore;
  }
  if (touches > 0 && touches % 10 === 0) {
    const msgs = [
      "¡COMBO!",
      "¡INCREÍBLE!",
      "¡BESTIAL!",
      "¡IMPARABLE!",
      "¡LEYENDA!",
    ];
    comboText.textContent =
      msgs[Math.min(Math.floor(touches / 10) - 1, msgs.length - 1)];
    comboBox.classList.add("show");
    setTimeout(() => comboBox.classList.remove("show"), 1500);
  }
}

function resetBall() {
  if (finalScoreEl) {
    finalScoreEl.textContent = touches;
  }

  gameOverScreen?.classList.remove("hidden");
  isPlaying = false;
}

// ─── Kick ────────────────────────────────────────────────────────────────────
function doKick() {
  if (kickCooldown > 0) return;
  kickCooldown = 0.38;
  isKicking = true;
  kickTimer = 0.4;
  lastLeg = lastLeg === "right" ? "left" : "right";

  const dir = new THREE.Vector3().subVectors(bPos, charPos);
  dir.y = 0;
  dir.normalize();

  const power = 4.6 + Math.random() * 0.9;

  const difficulty = Math.min(touches / BALL_DIFFICULTY_TOUCHES, 1);
  const driftStrength = THREE.MathUtils.lerp(
    BALL_DRIFT_BASE,
    BALL_DRIFT_MAX,
    difficulty
  );

  const driftAngle = Math.random() * Math.PI * 2;
  const drift = new THREE.Vector3(
    Math.cos(driftAngle),
    0,
    Math.sin(driftAngle)
  );

  const returnBias = new THREE.Vector3()
    .subVectors(new THREE.Vector3(0, 0, 0), bPos)
    .setY(0);

  if (returnBias.lengthSq() > 0.001) {
    returnBias.normalize();
    drift.addScaledVector(returnBias, 0.28 + difficulty * 0.28).normalize();
  }

  bVel.set(
    dir.x * 0.35 + drift.x * driftStrength,
    power,
    dir.z * 0.35 + drift.z * driftStrength
  );

  addTouch();
  kickLegVisual(lastLeg);
  const key = lastLeg === "left" ? "leftJug" : "rightJug";
  playAnim(key, () => playAnim("move"));
}

// ─── Walk animation on body (no GLB) ─────────────────────────────────────────
let walkPhase = 0;

function animateWalk(dt, moving) {
  if (!character) return;
  walkPhase += dt * (moving ? 8 : 2);
  const lLeg = character.getObjectByName("leftLeg");
  const rLeg = character.getObjectByName("rightLeg");
  if (lLeg && rLeg && !isKicking) {
    const swing = moving ? 0.45 : 0.05;
    lLeg.rotation.x = Math.sin(walkPhase) * swing;
    rLeg.rotation.x = -Math.sin(walkPhase) * swing;
  }
}

function updateCharacterMovement(dt) {
  const moveDir = new THREE.Vector3();
  if (keys["w"] || keys["arrowup"]) moveDir.z -= 1;
  if (keys["s"] || keys["arrowdown"]) moveDir.z += 1;
  if (keys["a"] || keys["arrowleft"]) moveDir.x -= 1;
  if (keys["d"] || keys["arrowright"]) moveDir.x += 1;
  const usingKeys = moveDir.lengthSq() > 0;

  if (usingKeys) {
    moveDir.normalize();
    charTgt.addScaledVector(moveDir, SPEED * dt);
  } else if (mouseGround) {
    const diff = new THREE.Vector3().subVectors(mouseGround, charPos).setY(0);
    const dist = diff.length();
    if (dist > 0.12) {
      diff.normalize();
      charTgt.addScaledVector(diff, Math.min(SPEED * dt, dist));
    }
  }

  charTgt.x = Math.max(-FIELD_H + 0.5, Math.min(FIELD_H - 0.5, charTgt.x));
  charTgt.z = Math.max(-FIELD_H + 0.5, Math.min(FIELD_H - 0.5, charTgt.z));
  charPos.lerp(charTgt, 0.2);
  charPos.y = 0;

  if (character) {
    const delta = new THREE.Vector3()
      .subVectors(charTgt, character.position)
      .setY(0);
    if (delta.lengthSq() > 0.0001)
      character.rotation.y = THREE.MathUtils.lerp(
        character.rotation.y,
        Math.atan2(delta.x, delta.z),
        0.15
      );
    character.position.copy(charPos);
  }

  const isMoving = charPos.distanceTo(charTgt) > 0.04 || usingKeys;
  animateWalk(dt, isMoving);
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!isPlaying) {
    composer.render();
    return;
  }

  if (countdownActive) {
    updateCharacterMovement(dt);
    ball.visible = false;
    ballShadow.visible = false;

    if (Object.keys(charMixers).length > 0) {
      Object.values(charMixers).forEach((modelMixer) => modelMixer.update(dt));
    } else if (mixer) {
      mixer.update(dt);
    }

    composer.render();
    return;
  }

  if (!ballReady) {
    updateCharacterMovement(dt);
    ball.visible = false;
    ballShadow.visible = false;

    if (Object.keys(charMixers).length > 0) {
      Object.values(charMixers).forEach((modelMixer) => modelMixer.update(dt));
    } else if (mixer) {
      mixer.update(dt);
    }

    composer.render();
    return;
  }

  // ── Move character ──
  const moveDir = new THREE.Vector3();
  if (keys["w"] || keys["arrowup"]) moveDir.z -= 1;
  if (keys["s"] || keys["arrowdown"]) moveDir.z += 1;
  if (keys["a"] || keys["arrowleft"]) moveDir.x -= 1;
  if (keys["d"] || keys["arrowright"]) moveDir.x += 1;
  const usingKeys = moveDir.lengthSq() > 0;

  if (usingKeys) {
    moveDir.normalize();
    charTgt.addScaledVector(moveDir, SPEED * dt);
  } else if (mouseGround) {
    const diff = new THREE.Vector3().subVectors(mouseGround, charPos).setY(0);
    const dist = diff.length();
    if (dist > 0.12) {
      diff.normalize();
      charTgt.addScaledVector(diff, Math.min(SPEED * dt, dist));
    }
  }

  // Clamp to field
  charTgt.x = Math.max(-FIELD_H + 0.5, Math.min(FIELD_H - 0.5, charTgt.x));
  charTgt.z = Math.max(-FIELD_H + 0.5, Math.min(FIELD_H - 0.5, charTgt.z));
  charPos.lerp(charTgt, 0.2);
  charPos.y = 0;

  if (character) {
    const delta = new THREE.Vector3()
      .subVectors(charTgt, character.position)
      .setY(0);
    if (delta.lengthSq() > 0.0001)
      character.rotation.y = THREE.MathUtils.lerp(
        character.rotation.y,
        Math.atan2(delta.x, delta.z),
        0.15
      );
    character.position.copy(charPos);
  }

  const isMoving = charPos.distanceTo(charTgt) > 0.04 || usingKeys;
  animateWalk(dt, isMoving);

  // Cooldowns
  if (kickCooldown > 0) kickCooldown -= dt;
  if (kickTimer > 0) {
    kickTimer -= dt;
    if (kickTimer <= 0) isKicking = false;
  }

  // ── Ball physics ──
  bVel.y += GRAVITY * dt;
  bPos.addScaledVector(bVel, dt);

  if (Math.abs(bPos.x) > FIELD_H) {
    bVel.x *= -0.7;
    bPos.x = Math.sign(bPos.x) * FIELD_H;
  }
  if (Math.abs(bPos.z) > FIELD_H) {
    bVel.z *= -0.7;
    bPos.z = Math.sign(bPos.z) * FIELD_H;
  }

  if (bPos.y <= BALL_R) {
    bPos.y = BALL_R;
    if (bVel.y < -1.5) {
      resetBall();
    } else {
      bVel.y *= -0.45;
      bVel.x *= 0.82;
      bVel.z *= 0.82;
    }
  }

  // ── Auto-kick ──
  const hDist = new THREE.Vector2(
    bPos.x - charPos.x,
    bPos.z - charPos.z
  ).length();
  if (hDist < KICK_R && bPos.y < 1.3 && bPos.y > 0.1 && kickCooldown <= 0)
    doKick();

  // ── Sync 3D ──
  ball.position.copy(bPos);
  ball.rotation.x += bVel.z * dt * 3.5;
  ball.rotation.z -= bVel.x * dt * 3.5;

  const ss = Math.max(0.1, 1 - bPos.y * 0.14);
  ballShadow.position.x = bPos.x;
  ballShadow.position.z = bPos.z;
  ballShadow.scale.setScalar(ss);
  shadowMat.opacity = 0.35 * ss;

  updateLandingPredictor(dt);

  if (Object.keys(charMixers).length > 0) {
    Object.values(charMixers).forEach((modelMixer) => modelMixer.update(dt));
  } else if (mixer) {
    mixer.update(dt);
  }
  composer.render();
}

// ─── Start ────────────────────────────────────────────────────────────────────
function beginJugglingRun() {
  touches = 0;
  counterEl.textContent = "0";

  bPos.set(0, 2.5, 0);
  bVel.set(0, 0, 0);
  ballReady = false;
  ball.visible = false;
  ballShadow.visible = false;
  hideLandingPredictor();
  clearTimeout(ballSpawnTimeout);

  charPos.set(0, 0, 1);
  charTgt.set(0, 0, 1);

  if (character) {
    character.position.copy(charPos);
  }

  kickCooldown = 0;
  isKicking = false;
  kickTimer = 0;

  countdownTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  countdownTimeouts = [];

  gameOverScreen?.classList.add("hidden");
  jugglingIntroScreen?.classList.add("hidden");
  isPlaying = true;

  startCountdown();
  setTimeout(prepareBallSpawn, 3400);
}

function startGame() {
  loadWrap.classList.add("show");
  isPlaying = false;
  ballReady = false;
  ball.visible = false;
  ballShadow.visible = false;
  countdownActive = false;
  countdownScreen?.classList.add("hidden");
  document.body.classList.remove("is-counting-down");

  bPos.set(0, 2.5, 0);
  bVel.set(0, 0, 0);
  charPos.set(0, 0, 1);
  charTgt.set(0, 0, 1);

  ANIM_MAP.forEach(({ file, key }) => tryLoadGLB(file, key));

  if (jugglingIntroScreen && startJugglingBtn) {
    jugglingIntroScreen.classList.remove("hidden");
  } else {
    beginJugglingRun();
  }
}

startGame();

startJugglingBtn?.addEventListener("click", () => {
  startJugglingMusic();
  beginJugglingRun();
});

playAgainBtn?.addEventListener("click", () => {
  startJugglingMusic();
  beginJugglingRun();
});

loop();
