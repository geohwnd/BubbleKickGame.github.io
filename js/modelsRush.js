
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

import {
  FIELD_W,
  FIELD_H,
  GOAL_W,
  PLAYER_VISUAL_SCALE,
} from "./physicsRush.js";


// =========================
// STADIUM / FIELD
// =========================

const STADIUM_MODEL_PATH = "models/Stadium_Football.glb";

function normalizeHexColor(color, fallback = "#ffffff") {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : fallback;
}

function cloneAndTintMaterial(material, color) {
  const tintedMaterial = material
    ? material.clone()
    : new THREE.MeshStandardMaterial();

  tintedMaterial.color = new THREE.Color(color);
  tintedMaterial.needsUpdate = true;

  return tintedMaterial;
}

function applyStadiumTeamMaterial(child, team1Colors, team2Colors) {
  if (!child.isMesh || !child.material) return;

  const materials = Array.isArray(child.material)
    ? child.material
    : [child.material];

  const updatedMaterials = materials.map((material) => {
    const materialName = material?.name || "";

    if (materialName.includes("M_1Team_1")) {
      return cloneAndTintMaterial(material, team1Colors[0]);
    }

    if (materialName.includes("M_1Team_2")) {
      return cloneAndTintMaterial(material, team1Colors[1]);
    }

    if (materialName.includes("M_1Team_3")) {
      return cloneAndTintMaterial(material, team1Colors[2]);
    }

    if (materialName.includes("M_2Team_1")) {
      return cloneAndTintMaterial(material, team2Colors[0]);
    }

    if (materialName.includes("M_2Team_2")) {
      return cloneAndTintMaterial(material, team2Colors[1]);
    }

    if (materialName.includes("M_2Team_3")) {
      return cloneAndTintMaterial(material, team2Colors[2]);
    }

    return material;
  });

  child.material = Array.isArray(child.material)
    ? updatedMaterials
    : updatedMaterials[0];
}

export function createFootballStadiumGroup(team1Colors, team2Colors, options = {}) {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  const crowdAnimatedObjects = [];
  const crowdAnimatedSet = new Set();
  let crowdAnimationFrameId = null;
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(dracoLoader);

  const safeTeam1Colors = sanitizeTeamPalette(team1Colors, [
    "#ff4444",
    "#ffffff",
    "#ffcc00",
  ]).map((color, index) =>
    normalizeHexColor(color, ["#ff4444", "#ffffff", "#ffcc00"][index])
  );

  const safeTeam2Colors = sanitizeTeamPalette(team2Colors, [
    "#3388ff",
    "#ffffff",
    "#00eebb",
  ]).map((color, index) =>
    normalizeHexColor(color, ["#3388ff", "#ffffff", "#00eebb"][index])
  );

  const {
    scale = 1.8,
    position = new THREE.Vector3(0, 0, 0),
    rotationY = 0.0,
    autoFit = true,
    targetSize = Math.max(FIELD_W, FIELD_H) + 12,
    verticalOffset = 0,
    onLoad = null,
    onError = null,
  } = options;

  loader.load(
    STADIUM_MODEL_PATH,
    (gltf) => {
      const stadium = gltf.scene;

      stadium.traverse((child) => {
        if (!child.isMesh) return;

        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        applyStadiumTeamMaterial(child, safeTeam1Colors, safeTeam2Colors);

        // --- Begin new crowd animation root logic ---
        let crowdRoot = child;

        while (
          crowdRoot.parent &&
          crowdRoot.parent !== stadium &&
          !crowdRoot.name?.toLowerCase().includes("character_gradas")
        ) {
          crowdRoot = crowdRoot.parent;
        }

        const crowdRootName = crowdRoot.name?.toLowerCase() || "";

        if (
          crowdRootName.includes("character_gradas") &&
          !crowdAnimatedSet.has(crowdRoot.uuid)
        ) {
          crowdAnimatedSet.add(crowdRoot.uuid);

          crowdAnimatedObjects.push({
            object: crowdRoot,
            baseY: crowdRoot.position.y,
            phase: Math.random() * Math.PI * 2,
            speed: 5.4 + Math.random() * 2.2,
            amplitude: 0.018 + Math.random() * 0.018,
            baseRotationZ: crowdRoot.rotation.z,
            rotationAmount: 0.006 + Math.random() * 0.008,
          });
        }
        // --- End new crowd animation root logic ---
      });

      const box = new THREE.Box3().setFromObject(stadium);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();

      box.getSize(size);
      box.getCenter(center);

      const maxXZ = Math.max(size.x, size.z);
      const fitScale = autoFit && maxXZ > 0 ? targetSize / maxXZ : 1;
      const finalScale = scale * fitScale;

      // Centra el estadio en X/Z y deja la base apoyada en Y = 0.
      // Esto evita que el GLB aparezca perdido fuera de cámara o debajo del piso.
      stadium.position.set(
        -center.x,
        -box.min.y + verticalOffset,
        -center.z
      );

      stadium.scale.setScalar(finalScale);
      stadium.rotation.y = rotationY;

      group.position.copy(position);
      group.add(stadium);

      console.log("Stadium loaded", {
        path: STADIUM_MODEL_PATH,
        originalSize: {
          x: Number(size.x.toFixed(2)),
          y: Number(size.y.toFixed(2)),
          z: Number(size.z.toFixed(2)),
        },
        finalScale: Number(finalScale.toFixed(4)),
        targetSize,
      });

      if (crowdAnimatedObjects.length > 0) {
        const animateCrowd = () => {
          const elapsed = performance.now() * 0.001;

          crowdAnimatedObjects.forEach((item) => {
            const bounce = Math.max(
              0,
              Math.sin(elapsed * item.speed + item.phase)
            );

            item.object.position.y = item.baseY + bounce * item.amplitude;

            // Se anima solo el grupo completo del personaje de gradas.
            // Así no se separan cabeza, brazos, torso, etc.
            item.object.rotation.z =
              item.baseRotationZ +
              Math.sin(elapsed * item.speed + item.phase) * item.rotationAmount;
          });

          crowdAnimationFrameId = requestAnimationFrame(animateCrowd);
        };

        animateCrowd();

        group.userData.stopCrowdAnimation = () => {
          if (crowdAnimationFrameId !== null) {
            cancelAnimationFrame(crowdAnimationFrameId);
            crowdAnimationFrameId = null;
          }
        };
      }

      if (typeof onLoad === "function") {
        onLoad(stadium, gltf);
      }
    },
    undefined,
    (error) => {
      console.warn(
        `No se pudo cargar ${STADIUM_MODEL_PATH}. Se usará el estadio procedural si está disponible.`,
        error
      );

      if (typeof onError === "function") {
        onError(error);
      }
    }
  );

  return group;
}

export function createProceduralFieldGroup() {
  const group = new THREE.Group();

  const fieldGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_H);
  const fieldMat = new THREE.MeshLambertMaterial({ color: 0x2d9e4e });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  group.add(field);

  for (let i = 0; i < 7; i++) {
    const stripeGeo = new THREE.PlaneGeometry(2, FIELD_H);
    const stripeMat = new THREE.MeshLambertMaterial({
      color: i % 2 === 0 ? 0x28923f : 0x2d9e4e,
      transparent: true,
      opacity: 0.6,
    });

    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-6 + i * 2, 0.01, 0);
    group.add(stripe);
  }

  const centerCircleGeo = new THREE.RingGeometry(1.4, 1.6, 32);
  const centerCircleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    opacity: 0.4,
    transparent: true,
  });

  const centerCircle = new THREE.Mesh(centerCircleGeo, centerCircleMat);
  centerCircle.rotation.x = -Math.PI / 2;
  centerCircle.position.y = 0.02;
  group.add(centerCircle);

  const centerDotGeo = new THREE.CircleGeometry(0.12, 16);
  const centerDotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.4,
    transparent: true,
  });

  const centerDot = new THREE.Mesh(centerDotGeo, centerDotMat);
  centerDot.rotation.x = -Math.PI / 2;
  centerDot.position.y = 0.02;
  group.add(centerDot);

  const halfLineGeo = new THREE.PlaneGeometry(0.1, FIELD_H);
  const halfLineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.4,
    transparent: true,
  });

  const halfLine = new THREE.Mesh(halfLineGeo, halfLineMat);
  halfLine.rotation.x = -Math.PI / 2;
  halfLine.position.y = 0.02;
  group.add(halfLine);

  makeBoard(group, 0, 0.5, -FIELD_H / 2, FIELD_W + 0.6, 1, 0.5);
  makeBoard(group, 0, 0.5, FIELD_H / 2, FIELD_W + 0.6, 1, 0.5);

  makeGoal(group, -1);
  makeGoal(group, 1);

  addProceduralStadiumDetails(group);
  addCornerAssistVisuals(group);

  return group;
}

function makeBoard(parent, x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color: 0xff6b35 });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);
  return mesh;
}

function makeGoal(parent, side) {
  const goal = new THREE.Group();
  const postColor = side < 0 ? 0xff4444 : 0x4488ff;
  const postMat = new THREE.MeshLambertMaterial({ color: postColor });

  const goalHeight = 1.4;
  const goalDepth = 1.6;

  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, goalHeight, 12);

  const postA = new THREE.Mesh(postGeo, postMat);
  postA.position.set(0, goalHeight / 2, -GOAL_W / 2);
  postA.castShadow = true;

  const postB = new THREE.Mesh(postGeo, postMat);
  postB.position.set(0, goalHeight / 2, GOAL_W / 2);
  postB.castShadow = true;

  const crossbarGeo = new THREE.CylinderGeometry(0.09, 0.09, GOAL_W, 12);
  const crossbar = new THREE.Mesh(crossbarGeo, postMat);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(0, goalHeight, 0);
  crossbar.castShadow = true;

  const backPostA = new THREE.Mesh(postGeo, postMat);
  backPostA.position.set(side * goalDepth, goalHeight / 2, -GOAL_W / 2);
  backPostA.castShadow = true;

  const backPostB = new THREE.Mesh(postGeo, postMat);
  backPostB.position.set(side * goalDepth, goalHeight / 2, GOAL_W / 2);
  backPostB.castShadow = true;

  const sideBarGeo = new THREE.CylinderGeometry(0.06, 0.06, goalDepth, 8);

  const sideBarA = new THREE.Mesh(sideBarGeo, postMat);
  sideBarA.rotation.z = Math.PI / 2;
  sideBarA.position.set((side * goalDepth) / 2, goalHeight, -GOAL_W / 2);

  const sideBarB = new THREE.Mesh(sideBarGeo, postMat);
  sideBarB.rotation.z = Math.PI / 2;
  sideBarB.position.set((side * goalDepth) / 2, goalHeight, GOAL_W / 2);

  const backCrossbarGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_W, 8);
  const backCrossbar = new THREE.Mesh(backCrossbarGeo, postMat);
  backCrossbar.rotation.x = Math.PI / 2;
  backCrossbar.position.set(side * goalDepth, goalHeight, 0);

  const netMat = new THREE.MeshBasicMaterial({
    color: postColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.18,
  });

  const backNet = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_W, goalHeight),
    netMat
  );
  backNet.position.set(side * goalDepth, goalHeight / 2, 0);
  backNet.rotation.y = Math.PI / 2;

  const sideNetA = new THREE.Mesh(
    new THREE.PlaneGeometry(goalDepth, goalHeight),
    netMat
  );
  sideNetA.position.set((side * goalDepth) / 2, goalHeight / 2, -GOAL_W / 2);

  const sideNetB = new THREE.Mesh(
    new THREE.PlaneGeometry(goalDepth, goalHeight),
    netMat
  );
  sideNetB.position.set((side * goalDepth) / 2, goalHeight / 2, GOAL_W / 2);

  const topNet = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_W, goalDepth),
    netMat
  );
  topNet.rotation.x = -Math.PI / 2;
  topNet.position.set((side * goalDepth) / 2, goalHeight, 0);

  goal.add(
    postA,
    postB,
    crossbar,
    backPostA,
    backPostB,
    sideBarA,
    sideBarB,
    backCrossbar,
    backNet,
    sideNetA,
    sideNetB,
    topNet
  );

  goal.position.set(side * (FIELD_W / 2), 0, 0);
  parent.add(goal);

  return goal;
}

function createNetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(235, 242, 255, 0.78)";
  ctx.lineWidth = 4;

  for (let i = -128; i <= 256; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1.2);

  return texture;
}

function addBench(parent, x, z, rotation = 0) {
  const bench = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9b5b38 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0xd8d1bc });

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.12, 0.34),
    woodMat
  );
  seat.position.y = 0.34;
  seat.castShadow = true;
  seat.receiveShadow = true;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.12, 0.28),
    woodMat
  );
  back.position.set(0, 0.72, -0.22);
  back.rotation.x = -0.25;
  back.castShadow = true;

  for (const sx of [-0.85, 0.85]) {
    const legA = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.36, 0.08),
      metalMat
    );
    legA.position.set(sx, 0.16, -0.12);

    const legB = legA.clone();
    legB.position.z = 0.16;

    bench.add(legA, legB);
  }

  bench.add(seat, back);
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;

  parent.add(bench);

  return bench;
}

function addWall(parent, x, z, w, d, h = 0.72) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: 0x8f9399 })
  );

  wall.position.set(x, h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;

  parent.add(wall);

  return wall;
}

function addFence(parent, x, z, w, h, rotationY = 0) {
  const netTexture = createNetTexture();

  const netMat = new THREE.MeshBasicMaterial({
    map: netTexture,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });

  const fence = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat);
  fence.position.set(x, 1.65, z);
  fence.rotation.y = rotationY;
  parent.add(fence);

  const postMat = new THREE.MeshLambertMaterial({ color: 0xbfc5cc });
  const postCount = Math.max(2, Math.floor(w / 2.1));

  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount - 0.5;

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, h + 0.35, 0.09),
      postMat
    );

    if (rotationY === 0) {
      post.position.set(x + t * w, 1.55, z);
    } else {
      post.position.set(x, 1.55, z + t * w);
    }

    post.castShadow = true;
    parent.add(post);
  }

  return fence;
}

function addProceduralStadiumDetails(parent) {
  const terrace = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W + 5.2, FIELD_H + 4.4),
    new THREE.MeshLambertMaterial({ color: 0xb77a4a })
  );
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.y = -0.035;
  terrace.receiveShadow = true;
  terrace.renderOrder = -2;
  parent.add(terrace);

  const tileMat = new THREE.LineBasicMaterial({
    color: 0x7c573f,
    transparent: true,
    opacity: 0.28,
  });

  const tileLines = [];
  const terraceW = FIELD_W + 5.2;
  const terraceH = FIELD_H + 4.4;

  for (let x = -terraceW / 2; x <= terraceW / 2; x += 0.75) {
    tileLines.push(
      new THREE.Vector3(x, 0.002, -terraceH / 2),
      new THREE.Vector3(x, 0.002, terraceH / 2)
    );
  }

  for (let z = -terraceH / 2; z <= terraceH / 2; z += 0.75) {
    tileLines.push(
      new THREE.Vector3(-terraceW / 2, 0.002, z),
      new THREE.Vector3(terraceW / 2, 0.002, z)
    );
  }

  const tileGeo = new THREE.BufferGeometry().setFromPoints(tileLines);
  const tileGrid = new THREE.LineSegments(tileGeo, tileMat);
  tileGrid.position.y = -0.02;
  parent.add(tileGrid);

  addWall(parent, 0, -FIELD_H / 2 - 1.55, FIELD_W + 4.5, 0.34, 0.72);
  addWall(parent, 0, FIELD_H / 2 + 1.55, FIELD_W + 4.5, 0.34, 0.72);
  addWall(parent, -FIELD_W / 2 - 1.9, 0, 0.34, FIELD_H + 3.1, 0.72);
  addWall(parent, FIELD_W / 2 + 1.9, 0, 0.34, FIELD_H + 3.1, 0.72);

  addFence(parent, 0, -FIELD_H / 2 - 1.72, FIELD_W + 4.1, 1.55, 0);
  addFence(parent, 0, FIELD_H / 2 + 1.72, FIELD_W + 4.1, 1.55, 0);
  addFence(parent, -FIELD_W / 2 - 2.07, 0, FIELD_H + 2.7, 1.55, Math.PI / 2);
  addFence(parent, FIELD_W / 2 + 2.07, 0, FIELD_H + 2.7, 1.55, Math.PI / 2);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.45, 0.16),
    new THREE.MeshLambertMaterial({ color: 0x4b4f57 })
  );
  board.position.set(0, 1.35, -FIELD_H / 2 - 1.9);
  board.castShadow = true;
  parent.add(board);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.65, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x2d3139 })
  );
  door.position.set(2.05, 0.88, -FIELD_H / 2 - 1.93);
  door.castShadow = true;
  parent.add(door);

  addBench(parent, -3.8, -FIELD_H / 2 - 1.05, 0);
  addBench(parent, 3.8, -FIELD_H / 2 - 1.05, 0);
  addBench(parent, -3.8, FIELD_H / 2 + 1.05, Math.PI);
  addBench(parent, 3.8, FIELD_H / 2 + 1.05, Math.PI);
}

function addCornerAssistVisual(parent, x, z) {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshLambertMaterial({
    color: 0x080808,
    transparent: true,
    opacity: 0.82,
  });

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  });

  const bumper = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 16),
    baseMat
  );
  bumper.position.y = 0.28;
  bumper.scale.set(1.15, 0.62, 1.15);
  bumper.castShadow = true;
  bumper.receiveShadow = true;

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32), glowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;

  const arrowDir = new THREE.Vector3(-Math.sign(x), 0, -Math.sign(z)).normalize();

  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0x0b0b0b,
    transparent: true,
    opacity: 0.65,
  });

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 18), arrowMat);
  arrow.position.set(arrowDir.x * 0.35, 0.12, arrowDir.z * 0.35);
  arrow.rotation.x = Math.PI / 2;
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowDir);

  group.add(bumper, ring, arrow);
  group.position.set(x, 0, z);

  parent.add(group);

  return group;
}

function addCornerAssistVisuals(parent) {
  const inset = 0.72;
  const x = FIELD_W / 2 - inset;
  const z = FIELD_H / 2 - inset;

  addCornerAssistVisual(parent, -x, -z);
  addCornerAssistVisual(parent, x, -z);
  addCornerAssistVisual(parent, -x, z);
  addCornerAssistVisual(parent, x, z);
}

// =========================
// TEAM / ROSTER HELPERS
// =========================

export function readStoredTeam(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (error) {
    return null;
  }
}

export function sanitizeTeamColor(color, fallback) {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : fallback;
}

export function sanitizeTeamPalette(colors, fallbackPalette) {
  if (!Array.isArray(colors)) return fallbackPalette;

  const sanitized = colors
    .slice(0, 3)
    .map((color, index) =>
      sanitizeTeamColor(color, fallbackPalette[index] || "#ffffff")
    );

  while (sanitized.length < 3) {
    sanitized.push(fallbackPalette[sanitized.length] || "#ffffff");
  }

  return sanitized;
}

export function readStoredRoster(key, fallbackRoster) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");

    if (Array.isArray(parsed)) {
      return fallbackRoster.map((fallback, index) => {
        const value = parsed[index];

        return typeof value === "string" && value.trim()
          ? value.trim().slice(0, 18)
          : fallback;
      });
    }
  } catch (error) {
    console.warn(`No se pudo leer ${key}`, error);
  }

  return [...fallbackRoster];
}

// =========================
// PLAYERS
// =========================

export function makeBobble(teamColors, options = {}) {
  const colors = sanitizeTeamPalette(teamColors, [
    "#ff4444",
    "#ffffff",
    "#ffcc00",
  ]);

  const group = new THREE.Group();

  const isKeeper = options?.isKeeper === true;
  const customSkinColor =
    typeof options?.skinColor === "string" && /^#[0-9a-fA-F]{6}$/.test(options.skinColor)
      ? options.skinColor
      : null;
  group.isKeeper = isKeeper;

  const animationModels = isKeeper
    ? {
        idle: "models/Character_GoalKeeper_Idle.glb",
        walk: "models/Character_GoalKeeper_Walk.glb",
        catch: "models/Character_CatchKeeper.glb",
      }
    : {
        run: "models/Character_FootballRunAnimation.glb",
        jog: "models/Character_JoggingRunAnimation.glb",
        idle: "models/Character_FootballIdleAnimation.glb",
        strike: "models/Character_StrikeAnimation.glb",
      };

  const fallbackMat = new THREE.MeshLambertMaterial({ color: colors[0] });
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 14),
    fallbackMat
  );

  fallback.position.set(0, 0.42, 0);
  fallback.castShadow = true;
  fallback.receiveShadow = true;
  group.add(fallback);

  const loader = new GLTFLoader();
  const modelCache = new Map();

  let activeModel = null;
  let activeMixer = null;
  let activeVariant = null;
  let activeActionDuration = 0;
  let animationLockUntil = 0;
  let queuedVariantAfterLock = "idle";
  let lastAnimationTime = performance.now();

  function tintOriginalMaterial(originalMaterial, color) {
    const material = originalMaterial
      ? originalMaterial.clone()
      : new THREE.MeshStandardMaterial();

    material.color = new THREE.Color(color);

    if ("skinning" in material) {
      material.skinning = true;
    }

    material.needsUpdate = true;

    return material;
  }

  function tintCharacterMaterial(originalMaterial, meshName = "") {
    const material = originalMaterial
      ? originalMaterial.clone()
      : new THREE.MeshStandardMaterial();

    const key = `${material.name || ""} ${meshName || ""}`.toLowerCase();

    if (customSkinColor && (key.includes("m_skin") || key.includes("skin"))) {
      material.color = new THREE.Color(customSkinColor);
      material.map = null;
      material.metalness = 0;
      material.roughness = Math.max(material.roughness ?? 0.5, 0.78);

      if (material.emissive) {
        material.emissive.set(0x000000);
        material.emissiveIntensity = 0;
      }
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

    if ("skinning" in material) {
      material.skinning = true;
    }

    material.needsUpdate = true;
    return material;
  }

  function prepareModel(model) {
    model.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) =>
          tintCharacterMaterial(material, child.name)
        );
      } else {
        child.material = tintCharacterMaterial(child.material, child.name);
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    model.position.sub(center);
    model.position.y += size.y / 2;

    const targetHeight = 1.35;

    if (size.y > 0) {
      model.scale.setScalar(targetHeight / size.y);
    }
  }

  function playFirstAnimation(model, animations, variant = "run") {
    if (!animations || animations.length === 0) {
      activeActionDuration = 0;
      return null;
    }

    const mixer = new THREE.AnimationMixer(model);

    const variantName = variant.toLowerCase();

    const clip =
      animations.find((animation) =>
        animation.name.toLowerCase().includes(variantName)
      ) ||
      animations.find(
        (animation) =>
          animation.name.toLowerCase().includes("goalkeeper") ||
          animation.name.toLowerCase().includes("keeper") ||
          animation.name.toLowerCase().includes("strike") ||
          animation.name.toLowerCase().includes("kick") ||
          animation.name.toLowerCase().includes("shoot") ||
          animation.name.toLowerCase().includes("run") ||
          animation.name.toLowerCase().includes("jog") ||
          animation.name.toLowerCase().includes("idle") ||
          animation.name.toLowerCase().includes("walk") ||
          animation.name.toLowerCase().includes("animation")
      ) ||
      animations[0];

    const action = mixer.clipAction(clip);
    action.reset();

    if (variant === "strike") {
      action.timeScale = 2.5; // mayor frame rate en la animación de patada
    } else if (variant === "catch") {
      action.timeScale = 3.5; // atajada rápida del portero
    } else {
      action.timeScale = 1;
    }

    action.play();

    activeActionDuration = clip?.duration || 0;

    return mixer;
  }

  function setActiveModel(variant, model, animations) {
    if (activeModel === model && activeVariant === variant) return;

    if (activeModel) {
      group.remove(activeModel);
    }

    group.remove(fallback);
    group.add(model);

    activeModel = model;
    activeVariant = variant;
    activeMixer = playFirstAnimation(model, animations, variant);
    lastAnimationTime = performance.now();
  }

  function loadAnimationVariant(variant = "run") {
    const safeVariant = animationModels[variant] ? variant : "run";

    if (activeVariant === safeVariant) return;

    if (modelCache.has(safeVariant)) {
      const cached = modelCache.get(safeVariant);
      setActiveModel(safeVariant, cached.model, cached.animations);
      return;
    }

    loader.load(
      animationModels[safeVariant],
      (gltf) => {
        const model = gltf.scene;
        prepareModel(model);

        modelCache.set(safeVariant, {
          model,
          animations: gltf.animations || [],
        });

        setActiveModel(safeVariant, model, gltf.animations || []);
      },
      undefined,
      (error) => {
        console.warn(
          `No se pudo cargar ${animationModels[safeVariant]}. Se usará el fallback.`,
          error
        );
      }
    );
  }

  function playStrikeAnimation(returnVariant = "run") {
    const safeReturnVariant = animationModels[returnVariant] ? returnVariant : "run";
    queuedVariantAfterLock = safeReturnVariant;

    loadAnimationVariant("strike");

    const fallbackDurationMs = 620;
    const clipDurationMs = activeActionDuration > 0 ? activeActionDuration * 1000 : fallbackDurationMs;
    animationLockUntil = performance.now() + Math.min(Math.max(clipDurationMs, 420), 950);
  }

  function playCatchAnimation(returnVariant = "idle") {
    if (!isKeeper) return;

    const safeReturnVariant = animationModels[returnVariant] ? returnVariant : "idle";
    queuedVariantAfterLock = safeReturnVariant;

    loadAnimationVariant("catch");

    const fallbackDurationMs = 520;
    const clipDurationMs = activeActionDuration > 0 ? activeActionDuration * 1000 : fallbackDurationMs;
    animationLockUntil = performance.now() + Math.min(Math.max(clipDurationMs, 360), 780);
  }

  function updateModelAnimation() {
    const now = performance.now();
    const delta = Math.min((now - lastAnimationTime) / 1000, 0.05);

    lastAnimationTime = now;

    if (activeMixer) {
      activeMixer.update(delta);
    }

    if (activeVariant === "strike" && animationLockUntil > 0 && performance.now() >= animationLockUntil) {
      animationLockUntil = 0;
      loadAnimationVariant(queuedVariantAfterLock);
    }

    requestAnimationFrame(updateModelAnimation);
  }

  group.setAnimationVariant = loadAnimationVariant;
  group.getAnimationVariant = () => activeVariant;
  group.playStrikeAnimation = playStrikeAnimation;
  group.playCatchAnimation = playCatchAnimation;
  group.isAnimationLocked = () => animationLockUntil > performance.now();

  loadAnimationVariant("idle");
  updateModelAnimation();

  return group;
}

export function makePlayerNameLabel(scene, text, teamColor = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  const safeText = (text || "").toString().trim().slice(0, 18) || "Jugador";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "900 42px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(safeText);
  const paddingX = 34;
  const boxW = Math.min(canvas.width - 24, metrics.width + paddingX * 2);
  const boxH = 66;
  const x = (canvas.width - boxW) / 2;
  const y = (canvas.height - boxH) / 2;
  const r = 28;

  ctx.fillStyle = "rgba(0,0,0,0.72)";
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
  ctx.strokeStyle = teamColor;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 6;
  ctx.fillText(safeText, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.85, 0.46, 1);
  sprite.renderOrder = 1200;

  scene.add(sprite);

  return sprite;
}

export function makeShadow(scene) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
    })
  );

  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;

  scene.add(shadow);

  return shadow;
}

// =========================
// CONTROLLED PLAYER INDICATOR
// =========================

export function createControlledPlayerIndicator(scene) {
  const controlledIndicatorGroup = new THREE.Group();

  const controlledArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.42, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffee00,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
    })
  );

  controlledArrow.rotation.x = Math.PI;
  controlledArrow.position.y = 1.08;

  const controlledRing = new THREE.Group();

  const indicatorLoader = new GLTFLoader();

  indicatorLoader.load("models/Indicator1.glb", (gltf) => {
    const indicatorModel = gltf.scene;

    const yellowMat = new THREE.MeshBasicMaterial({
      color: 0xffee00,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    indicatorModel.traverse((child) => {
      if (!child.isMesh) return;

      child.material = yellowMat;
      child.renderOrder = 1;
      child.frustumCulled = false;
    });

    const indicatorBox = new THREE.Box3().setFromObject(indicatorModel);
    const indicatorSize = new THREE.Vector3();
    const indicatorCenter = new THREE.Vector3();

    indicatorBox.getSize(indicatorSize);
    indicatorBox.getCenter(indicatorCenter);

    indicatorModel.position.sub(indicatorCenter);

    const indicatorMaxAxis = Math.max(indicatorSize.x, indicatorSize.z);
    const indicatorTargetSize = 1.35;

    if (indicatorMaxAxis > 0) {
      indicatorModel.scale.setScalar(indicatorTargetSize / indicatorMaxAxis);
    }

    controlledRing.add(indicatorModel);
  });

  controlledRing.position.y = 0.012;

  controlledIndicatorGroup.add(controlledRing, controlledArrow);
  controlledIndicatorGroup.renderOrder = 1000;
  controlledIndicatorGroup.visible = true;

  scene.add(controlledIndicatorGroup);

  return {
    controlledIndicatorGroup,
    controlledRing,
    controlledArrow,
  };
}

// =========================
// BALL
// =========================

export function createBallMesh(scene, ballBody) {
  const ballMesh = new THREE.Group();

  const fallbackBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );

  fallbackBall.castShadow = true;
  ballMesh.add(fallbackBall);
  scene.add(ballMesh);

  const loader = new GLTFLoader();

  loader.load(
    "models/Ball_Model.glb",
    (gltf) => {
      ballMesh.remove(fallbackBall);

      const soccerBallModel = gltf.scene;

      soccerBallModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const box = new THREE.Box3().setFromObject(soccerBallModel);
      const size = new THREE.Vector3();

      box.getSize(size);

      const maxAxis = Math.max(size.x, size.y, size.z);
      const visualBallScale = 0.7;
      const targetDiameter = ballBody.r * 2 * visualBallScale;

      if (maxAxis > 0) {
        soccerBallModel.scale.setScalar(targetDiameter / maxAxis);
      }

      const centeredBox = new THREE.Box3().setFromObject(soccerBallModel);
      const center = new THREE.Vector3();

      centeredBox.getCenter(center);
      soccerBallModel.position.sub(center);

      ballMesh.add(soccerBallModel);
    },
    undefined,
    (error) => {
      console.warn(
        "No se pudo cargar models/Ball_Model.glb. Se usará la pelota fallback.",
        error
      );
    }
  );

  return ballMesh;
}

// =========================
// PLAYER FACING / VISUAL HELPERS
// =========================

const PLAYER_MODEL_FACING_OFFSET = 0;

export function lerpAngle(current, target, amount) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * amount;
}

export function updatePlayerMeshFacing(mesh, body) {
  if (!mesh || !body) return;

  const moveDir = new THREE.Vector3(body.vel.x, 0, body.vel.z);

  if (moveDir.lengthSq() > 0.012) {
    moveDir.normalize();
    body.facing.copy(moveDir);
  }

  const facing = body.facing || moveDir;

  if (!facing || facing.lengthSq() < 0.001) return;

  const targetRotationY =
    Math.atan2(facing.x, facing.z) + PLAYER_MODEL_FACING_OFFSET;

  mesh.rotation.y = lerpAngle(mesh.rotation.y, targetRotationY, 0.22);
}

export function updatePlayerAnimationVariant(mesh, body, movingVariant = "run") {
  if (!mesh || !body || typeof mesh.setAnimationVariant !== "function") return;

  if (typeof mesh.isAnimationLocked === "function" && mesh.isAnimationLocked()) {
    return;
  }

  const flatSpeed = Math.hypot(body.vel.x, body.vel.z);

  // Si el jugador o la IA prácticamente no se está desplazando,
  // siempre usa la animación idle aunque tenga posesión del balón.
  const isStandingStill = flatSpeed < 0.18;

  let nextVariant = isStandingStill ? "idle" : movingVariant;

  // Los porteros solo usan idle/walk.
  // Así no intentan cargar run/jog/strike como los jugadores de campo.
  if (mesh.isKeeper) {
    nextVariant = isStandingStill ? "idle" : "walk";
  }

  if (mesh.getAnimationVariant?.() !== nextVariant) {
    mesh.setAnimationVariant(nextVariant);
  }
}

export function applyPlayerVisualScale(mesh, scale = PLAYER_VISUAL_SCALE) {
  mesh.scale.setScalar(scale);
}

// =========================
// ARROW / SLINGSHOT VISUALS
// =========================

export function createRushArrowVisuals(scene) {
  const arrowMat = new THREE.LineBasicMaterial({
    color: 0xffe800,
    transparent: true,
    opacity: 1.0,
  });

  const arrowGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);

  const arrowLine = new THREE.Line(arrowGeo, arrowMat);
  arrowLine.visible = false;
  scene.add(arrowLine);

  const movArrowGroup = new THREE.Group();

  const movArrowMat = new THREE.MeshBasicMaterial({
    color: 0xffee00,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const movArrowShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 1, 18),
    movArrowMat
  );

  const movArrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.7, 24),
    movArrowMat
  );

  movArrowGroup.add(movArrowShaft, movArrowHead);
  movArrowGroup.renderOrder = 999;
  movArrowGroup.visible = false;

  scene.add(movArrowGroup);

  return {
    arrowLine,
    arrowGeo,
    movArrowGroup,
    movArrowShaft,
    movArrowHead,
  };
}

// =========================
// PARTICLES / BACKGROUND
// =========================

export function spawnParticles(scene, particles, x, y, z, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(x, y, z);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 6 + 2,
      (Math.random() - 0.5) * 8
    );

    scene.add(mesh);
    particles.push({ mesh, vel, life: 1.0 });
  }
}

export function updateParticles(scene, particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];

    particle.life -= dt * 1.5;
    particle.vel.y -= 12 * dt;
    particle.mesh.position.addScaledVector(particle.vel, dt);
    particle.mesh.material.opacity = particle.life;
    particle.mesh.material.transparent = true;

    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particles.splice(i, 1);
    }
  }
}

export function addBackgroundStars(scene, count = 200) {
  for (let i = 0; i < count; i++) {
    const starGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4);

    const starMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.5,
    });

    const star = new THREE.Mesh(starGeo, starMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 30;

    star.position.set(
      Math.cos(angle) * dist,
      5 + Math.random() * 15,
      Math.sin(angle) * dist
    );

    scene.add(star);
  }
}