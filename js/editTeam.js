const PLAYER_IDLE_MODEL_PATH = "models/Character_FootballIdleAnimation.glb";
const PLAYER_RUN_MODEL_PATH = "models/Character_FootballRunAnimation.glb";
const KEEPER_IDLE_MODEL_PATH = "models/Character_GoalKeeper_Idle.glb";
const KEEPER_WALK_MODEL_PATH = "models/Character_GoalKeeper_Walk.glb";

const EDIT_TEAM_MUSIC_PATH = "audio/Rural Ride Loop_Music.mp3";

const DEFAULT_P1 = ["Captain", "Winger", "Defender", "Goalkeeper"];
const DEFAULT_P2 = ["AI Captain", "AI Striker", "AI Defender", "AI Goalkeeper"];
const ROLES = ["Captain", "Winger", "Defender", "Goalkeeper"];
const DEFAULT_SKIN = "#f0b66a";

const TEAM_KEYS = {
  1: {
    team: "bubbleKickP1Team",
    roster: "bubbleKickP1Roster",
    skin: "bubbleKickP1SkinColor",
    fallbackColors: ["#ff4444", "#ffffff", "#ffcc00"],
    fallbackRoster: DEFAULT_P1,
    label: "HOME",
  },
  2: {
    team: "bubbleKickP2Team",
    roster: "bubbleKickP2Roster",
    skin: "bubbleKickP2SkinColor",
    fallbackColors: ["#3388ff", "#ffffff", "#00eebb"],
    fallbackRoster: DEFAULT_P2,
    label: "AWAY / AI",
  },
};

let activeTeam = 1;
let activePlayerIndex = 0;

const editTeamMusic = new Audio(EDIT_TEAM_MUSIC_PATH);
editTeamMusic.loop = true;
editTeamMusic.volume = 0.38;

let editTeamMusicStarted = false;

function startEditTeamMusic() {
  if (editTeamMusicStarted) return;
  editTeamMusicStarted = true;

  editTeamMusic.play().catch(() => {
    editTeamMusicStarted = false;
  });
}

function setupEditTeamMusicAutoplay() {
  startEditTeamMusic();

  const unlockMusic = () => {
    startEditTeamMusic();
    window.removeEventListener("pointerdown", unlockMusic);
    window.removeEventListener("keydown", unlockMusic);
    window.removeEventListener("touchstart", unlockMusic);
  };

  window.addEventListener("pointerdown", unlockMusic, { once: true });
  window.addEventListener("keydown", unlockMusic, { once: true });
  window.addEventListener("touchstart", unlockMusic, { once: true });
}

const state = {
  1: loadTeamState(1),
  2: loadTeamState(2),
};

const canvas = document.getElementById("teamCanvas");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
let composer = null;
let bloomPass = null;
const previewGroup = new THREE.Group();
const mixers = [];
const clock = new THREE.Clock();

let previewGeneration = 0;

function isMobilePreview() {
  const rect = canvas?.parentElement?.getBoundingClientRect?.();
  const width = rect?.width || window.innerWidth;
  return width < 620 || window.innerWidth < 700;
}

function updatePreviewCamera() {
  const mobile = isMobilePreview();

  if (mobile) {
    camera.position.set(0, 5.8, 13.4);
    camera.fov = 46;
  } else {
    camera.position.set(0, 4.55, 9.4);
    camera.fov = 38;
  }

  camera.lookAt(0, 1.15, 0);
  camera.updateProjectionMatrix();
}

const playersList = document.getElementById("playersList");
const skinColorInput = document.getElementById("skinColorInput");
const skinSwatch = document.getElementById("skinSwatch");

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function sanitizeColor(color, fallback = DEFAULT_SKIN) {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : fallback;
}

function sanitizeColors(colors, fallback) {
  const list = Array.isArray(colors) ? colors : [];
  return [0, 1, 2].map((index) => sanitizeColor(list[index], fallback[index]));
}

function loadTeamState(playerNumber) {
  const config = TEAM_KEYS[playerNumber];
  const storedTeam = safeJsonParse(localStorage.getItem(config.team), null);
  const storedRoster = safeJsonParse(localStorage.getItem(config.roster), null);
  const storedSkin = safeJsonParse(localStorage.getItem(config.skin), null);

  return {
    team: storedTeam || {},
    colors: sanitizeColors(storedTeam?.colors, config.fallbackColors),
    skinColors: config.fallbackRoster.map((_, index) => {
      if (Array.isArray(storedSkin)) {
        return sanitizeColor(storedSkin[index], DEFAULT_SKIN);
      }
      return sanitizeColor(storedSkin, DEFAULT_SKIN);
    }),
    roster: config.fallbackRoster.map((fallback, index) => {
      const value = Array.isArray(storedRoster) ? storedRoster[index] : null;
      return typeof value === "string" && value.trim()
        ? value.trim().slice(0, 18)
        : fallback;
    }),
  };
}

function saveTeamState(playerNumber) {
  const config = TEAM_KEYS[playerNumber];
  const data = state[playerNumber];

  const team = {
    ...(data.team || {}),
    colors: [...data.colors],
    color: data.colors[0],
  };

  localStorage.setItem(config.team, JSON.stringify(team));
  localStorage.setItem(config.roster, JSON.stringify(data.roster));
  localStorage.setItem(config.skin, JSON.stringify(data.skinColors));
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      if (existingScript.dataset.loaded === "true") resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadPostProcessingScripts() {
  const baseUrl = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js";

  await loadExternalScript(`${baseUrl}/postprocessing/EffectComposer.js`);
  await loadExternalScript(`${baseUrl}/postprocessing/RenderPass.js`);
  await loadExternalScript(`${baseUrl}/postprocessing/ShaderPass.js`);
  await loadExternalScript(`${baseUrl}/shaders/CopyShader.js`);
  await loadExternalScript(`${baseUrl}/shaders/LuminosityHighPassShader.js`);
  await loadExternalScript(`${baseUrl}/postprocessing/UnrealBloomPass.js`);
}

function initPostProcessing() {
  const canUseComposer =
    typeof THREE.EffectComposer === "function" &&
    typeof THREE.RenderPass === "function" &&
    typeof THREE.UnrealBloomPass === "function";

  if (!canUseComposer) {
    composer = null;
    bloomPass = null;
    return;
  }

  const rect = canvas.parentElement.getBoundingClientRect();

  composer = new THREE.EffectComposer(renderer);
  composer.setSize(rect.width, rect.height);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(rect.width, rect.height),
    0.28,
    0.24,
    0.82
  );
  bloomPass.renderToScreen = true;
  composer.addPass(bloomPass);
}

function initScene() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Con EffectComposer el fondo transparente puede verse negro.
  // Usamos un azul claro para mantener el look del panel sin oscurecer la escena.
  scene.background = new THREE.Color(0x4f8dff);
  scene.fog = null;

  updatePreviewCamera();

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(-5, 8, 7);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const cyanFill = new THREE.DirectionalLight(0x65ffe7, 0.3);
  cyanFill.position.set(6, 4, 5);
  scene.add(cyanFill);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xbee8ff,
      transparent: true,
      opacity: 0.34,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  scene.add(floor);

  scene.add(previewGroup);

  loadPostProcessingScripts()
    .then(() => {
      initPostProcessing();
      resizeScene();
    })
    .catch(() => {
      composer = null;
      bloomPass = null;
    });

  window.addEventListener("resize", resizeScene);
  resizeScene();
  animate();
}

function resizeScene() {
  const rect = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);

  if (composer) {
    composer.setSize(rect.width, rect.height);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  if (bloomPass) {
    bloomPass.resolution.set(rect.width, rect.height);
  }

  camera.aspect = rect.width / rect.height;
  updatePreviewCamera();
}

function clearPreviewGroup() {
  mixers.length = 0;

  while (previewGroup.children.length) {
    previewGroup.remove(previewGroup.children[0]);
  }
}

function createFallbackCharacter(isKeeper, colors, skinColor) {
  const group = new THREE.Group();

  const bodyColor = isKeeper ? colors[2] : colors[0];
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.55,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.65,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: colors[1],
    roughness: 0.58,
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.62, 8, 16),
    bodyMat
  );
  body.position.y = 1.05;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), headMat);
  head.position.y = 1.58;

  const shorts = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.24, 0.28),
    shortsMat
  );
  shorts.position.y = 0.66;

  group.add(body, head, shorts);
  return group;
}

function normalizeModel(model, targetHeight = 2.25) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  model.position.sub(center);
  model.position.y += size.y / 2;

  if (size.y > 0) {
    model.scale.setScalar(targetHeight / size.y);
  }
}

function tintModel(model, colors, isKeeper, skinColor) {
  model.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;

    const originalMaterial = child.material;
    const material = originalMaterial
      ? originalMaterial.clone()
      : new THREE.MeshStandardMaterial();

    const key = `${originalMaterial?.name || ""} ${
      child.name || ""
    }`.toLowerCase();

    if (key.includes("m_skin") || key.includes("skin")) {
      material.color = new THREE.Color(skinColor);
    } else if (
      key.includes("m_firstcolor") ||
      key.includes("firstcolor") ||
      key.includes("first_color")
    ) {
      material.color = new THREE.Color(isKeeper ? colors[2] : colors[0]);
    } else if (
      key.includes("m_secondcolor") ||
      key.includes("secondcolor") ||
      key.includes("second_color")
    ) {
      material.color = new THREE.Color(colors[1]);
    } else if (
      key.includes("m_thirdcolor") ||
      key.includes("thirdcolor") ||
      key.includes("third_color")
    ) {
      material.color = new THREE.Color(isKeeper ? colors[0] : colors[2]);
    }

    material.skinning = true;
    material.needsUpdate = true;
    child.material = material;
  });
}

function addNameLabel(parent, text, borderColor) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 128;

  const ctx = labelCanvas.getContext("2d");
  const safeText = (text || "Player").slice(0, 18);

  ctx.font = "900 42px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(safeText);
  const boxW = Math.min(labelCanvas.width - 24, metrics.width + 70);
  const boxH = 66;
  const x = (labelCanvas.width - boxW) / 2;
  const y = 31;
  const r = 28;

  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + boxW - r, y);
  ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
  ctx.lineTo(x + boxW, y + boxH - r);
  ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
  ctx.lineTo(x + r, y + boxH);
  ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 6;
  ctx.fillText(safeText, labelCanvas.width / 2, labelCanvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(labelCanvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );

  sprite.scale.set(1.55, 0.4, 1);
  sprite.position.y = 2.62;
  parent.add(sprite);
}

function loadPreviewTeam(playerNumber) {
  const currentGeneration = ++previewGeneration;
  clearPreviewGroup();

  const colors = state[playerNumber].colors;
  const roster = state[playerNumber].roster;
  const skinColors = state[playerNumber].skinColors;

  const positions = isMobilePreview()
    ? [
        [-1.55, 0, 0.72],
        [-0.45, 0, -0.38],
        [0.58, 0, 0.46],
        [1.58, 0, -0.12],
      ]
    : [
        [-2.55, 0, 0.75],
        [-0.85, 0, -0.45],
        [0.85, 0, 0.55],
        [2.5, 0, -0.15],
      ];

  positions.forEach((position, index) => {
    const isKeeper = index === 3;
    const isSelected = index === activePlayerIndex;
    const skinColor = sanitizeColor(skinColors[index], DEFAULT_SKIN);

    const holder = new THREE.Group();
    holder.position.set(...position);
    holder.rotation.y = isSelected ? 0 : index < 2 ? 0.22 : -0.22;
    previewGroup.add(holder);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.2,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    holder.add(shadow);

    addNameLabel(holder, roster[index], isSelected ? "#b9ff22" : colors[0]);

    const modelPath = isKeeper
      ? isSelected
        ? KEEPER_WALK_MODEL_PATH
        : KEEPER_IDLE_MODEL_PATH
      : isSelected
      ? PLAYER_RUN_MODEL_PATH
      : PLAYER_IDLE_MODEL_PATH;
    const loader = new THREE.GLTFLoader();

    loader.load(
      modelPath,
      (gltf) => {
        if (currentGeneration !== previewGeneration) return;

        const model = gltf.scene;
        tintModel(model, colors, isKeeper, skinColor);
        normalizeModel(model, isSelected ? 2.36 : isKeeper ? 2.15 : 2.25);
        holder.add(model);

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const clip =
            gltf.animations.find((animation) =>
              animation.name.toLowerCase().includes("idle")
            ) || gltf.animations[0];

          const action = mixer.clipAction(clip);
          action.reset();
          action.play();
          mixers.push(mixer);
        }
      },
      undefined,
      () => {
        if (currentGeneration !== previewGeneration) return;

        const fallback = createFallbackCharacter(isKeeper, colors, skinColor);
        holder.add(fallback);
      }
    );
  });
}

function renderForm() {
  const data = state[activeTeam];
  const config = TEAM_KEYS[activeTeam];

  document.getElementById("previewTitle").textContent = `Plantilla ${
    `${activeTeam === 1 ? "Player 1" : "Player 2 / AI"} Roster`
  }`;

  document.getElementById("teamPill").textContent = config.label;
  document.getElementById("editingPill").textContent = config.label;

  const selectedName =
    data.roster[activePlayerIndex] || config.fallbackRoster[activePlayerIndex];

  playersList.innerHTML = `
    <div class="player-selector-grid">
      ${data.roster
        .map(
          (name, index) => `
            <button
              class="player-select-card ${
                index === activePlayerIndex ? "active" : ""
              }"
              type="button"
              data-index="${index}"
            >
              <span class="player-select-role">${ROLES[index]}</span>
              <span class="player-select-name">${escapeHtml(name)}</span>
            </button>
          `
        )
        .join("")}
    </div>

    <div class="selected-player-editor">
      <div class="role-chip selected-role-chip">${
        ROLES[activePlayerIndex]
      }</div>
      <div class="input-wrap">
        <label>Editing player</label>
        <input
          class="name-input"
          data-index="${activePlayerIndex}"
          value="${escapeHtml(selectedName)}"
          maxlength="18"
        />
      </div>
    </div>
  `;

  playersList.querySelectorAll(".player-select-card").forEach((element) => {
    element.addEventListener("click", () => {
      const index = Number(element.dataset.index);
      if (Number.isNaN(index) || index === activePlayerIndex) return;

      activePlayerIndex = index;
      renderForm();
    });
  });

  playersList.querySelectorAll(".name-input").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.index);
      const fallback = TEAM_KEYS[activeTeam].fallbackRoster[index];

      state[activeTeam].roster[index] = (input.value.trim() || fallback).slice(
        0,
        18
      );

      loadPreviewTeam(activeTeam);
    });
  });

  const activeSkinColor = sanitizeColor(
    data.skinColors[activePlayerIndex],
    DEFAULT_SKIN
  );
  skinColorInput.value = activeSkinColor;
  skinSwatch.style.setProperty("--skin-color", activeSkinColor);

  skinColorInput.oninput = () => {
    state[activeTeam].skinColors[activePlayerIndex] = sanitizeColor(
      skinColorInput.value,
      DEFAULT_SKIN
    );
    skinSwatch.style.setProperty(
      "--skin-color",
      state[activeTeam].skinColors[activePlayerIndex]
    );
    loadPreviewTeam(activeTeam);
  };

  loadPreviewTeam(activeTeam);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1700);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  mixers.forEach((mixer) => mixer.update(dt));

  previewGroup.rotation.y = Math.sin(performance.now() * 0.0004) * 0.05;

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

document.querySelectorAll(".team-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTeam = Number(tab.dataset.team);
    activePlayerIndex = 0;

    document.querySelectorAll(".team-tab").forEach((button) => {
      button.classList.remove("active");
    });

    tab.classList.add("active");
    renderForm();
  });
});

document.getElementById("saveBtn").addEventListener("click", () => {
  saveTeamState(1);
  saveTeamState(2);
  showToast("Changes saved");
});

document.getElementById("resetNamesBtn").addEventListener("click", () => {
  state[activeTeam].roster = [...TEAM_KEYS[activeTeam].fallbackRoster];
  renderForm();
});

document.getElementById("resetSkinBtn").addEventListener("click", () => {
  state[activeTeam].skinColors[activePlayerIndex] = DEFAULT_SKIN;
  renderForm();
});

setupEditTeamMusicAutoplay();
initScene();
renderForm();
