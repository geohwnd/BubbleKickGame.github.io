import * as THREE from "three";

// =========================
// FIELD CONSTANTS
// =========================


export const FIELD_W = 14;
export const FIELD_H = 13.5;
export const GOAL_W = 3.5;

export const CORNER_PUSH_RADIUS = 1.45;
export const CORNER_PUSH_FORCE = 5.8;

export const PLAYER_BODY_RADIUS = 0.42;
export const PLAYER_VISUAL_SCALE = 0.215;
export const BALL_RADIUS = 0.3;

export const SHOW_FIELD_DEBUG = true;

// =========================
// PHYSICS BODY
// =========================  

export class Body {
  constructor(x, y, z, r, mass) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.r = r;
    this.mass = mass;
    this.restitution = 0.65;
    this.friction = 0.985;
  }

  update(dt) {
    this.vel.multiplyScalar(this.friction);
    this.pos.addScaledVector(this.vel, dt);

    if (this.pos.y - this.r < 0) {
      this.pos.y = this.r;
      this.vel.y *= -0.4;
    }

    if (this.pos.y + this.r > 3) {
      this.pos.y = 3 - this.r;
      this.vel.y *= -0.4;
    }

    this.vel.y -= 12 * dt;

    if (this.pos.y <= this.r + 0.01) {
      this.vel.y = Math.max(0, this.vel.y);
    }
  }

  get speed() {
    return this.vel.length();
  }
}

// =========================
// COLLISIONS
// =========================

export function collideBodies(a, b) {
  const diff = new THREE.Vector3().subVectors(b.pos, a.pos);
  const dist = diff.length();
  const minDist = a.r + b.r;

  if (dist < minDist && dist > 0.001) {
    const normal = diff.clone().divideScalar(dist);
    const overlap = minDist - dist;
    const totalMass = a.mass + b.mass;

    a.pos.addScaledVector(normal, (-overlap * b.mass) / totalMass);
    b.pos.addScaledVector(normal, (overlap * a.mass) / totalMass);

    const relVel = new THREE.Vector3().subVectors(a.vel, b.vel);
    const speed = relVel.dot(normal);

    if (speed > 0) {
      const restitution = (a.restitution + b.restitution) / 2;
      const impulse =
        (-(1 + restitution) * speed) / (1 / a.mass + 1 / b.mass);

      a.vel.addScaledVector(normal, impulse / a.mass);
      b.vel.addScaledVector(normal, -impulse / b.mass);
    }
  }
}

// =========================
// WALLS / CORNERS
// =========================

export function applyCornerAssist(body) {
  const halfW = FIELD_W / 2;
  const halfH = FIELD_H / 2;
  const cornerLimitX = halfW - CORNER_PUSH_RADIUS;
  const cornerLimitZ = halfH - CORNER_PUSH_RADIUS;

  const nearLeftOrRight = Math.abs(body.pos.x) > cornerLimitX;
  const nearTopOrBottom = Math.abs(body.pos.z) > cornerLimitZ;

  if (!nearLeftOrRight || !nearTopOrBottom) return;

  const sx = Math.sign(body.pos.x) || 1;
  const sz = Math.sign(body.pos.z) || 1;

  const pushDir = new THREE.Vector3(-sx, 0, -sz).normalize();
  const cornerPoint = new THREE.Vector3(sx * halfW, body.pos.y, sz * halfH);
  const distanceToCorner = body.pos.distanceTo(cornerPoint);

  const strength = THREE.MathUtils.clamp(
    1 - distanceToCorner / CORNER_PUSH_RADIUS,
    0.18,
    1
  );

  body.vel.addScaledVector(
    pushDir,
    CORNER_PUSH_FORCE * strength * (body.mass < 1 ? 1.25 : 1)
  );

  body.pos.x = THREE.MathUtils.clamp(
    body.pos.x,
    -halfW + body.r + 0.05,
    halfW - body.r - 0.05
  );

  body.pos.z = THREE.MathUtils.clamp(
    body.pos.z,
    -halfH + body.r + 0.05,
    halfH - body.r - 0.05
  );
}

export function wallBounce(body) {
  const halfW = FIELD_W / 2;
  const halfH = FIELD_H / 2;
  const inGoalZone = Math.abs(body.pos.z) < GOAL_W / 2;

  if (!inGoalZone) {
    if (body.pos.x - body.r < -halfW) {
      body.pos.x = -halfW + body.r;
      body.vel.x *= -body.restitution;
    }

    if (body.pos.x + body.r > halfW) {
      body.pos.x = halfW - body.r;
      body.vel.x *= -body.restitution;
    }
  }

  if (body.pos.z - body.r < -halfH) {
    body.pos.z = -halfH + body.r;
    body.vel.z *= -body.restitution;
  }

  if (body.pos.z + body.r > halfH) {
    body.pos.z = halfH - body.r;
    body.vel.z *= -body.restitution;
  }

  applyCornerAssist(body);
}

// =========================
// SMALL HELPERS
// =========================

export function clampFieldTarget(target, margin = 0.72) {
  target.x = THREE.MathUtils.clamp(
    target.x,
    -FIELD_W / 2 + margin,
    FIELD_W / 2 - margin
  );

  target.z = THREE.MathUtils.clamp(
    target.z,
    -FIELD_H / 2 + margin,
    FIELD_H / 2 - margin
  );

  target.y = PLAYER_BODY_RADIUS;

  return target;
}

export function distance2D(a, b) {
  const ax = a.x ?? 0;
  const az = a.z ?? 0;

  const bx = b.x ?? 0;
  const bz = b.z ?? 0;

  return Math.hypot(ax - bx, az - bz);
}

export function limitBodySpeed(body, maxSpeed) {
  if (!body?.vel) return;

  const flatSpeed = Math.hypot(
    body.vel.x,
    body.vel.z
  );

  if (flatSpeed <= maxSpeed) return;

  const scale = maxSpeed / flatSpeed;

  body.vel.x *= scale;
  body.vel.z *= scale;
}

export function createFieldDebugGroup() {
  const group = new THREE.Group();
  group.name = "FieldDebugGroup";
  group.renderOrder = 9999;
  group.visible = SHOW_FIELD_DEBUG;

  const halfW = FIELD_W / 2;
  const halfH = FIELD_H / 2;
  const goalHalf = GOAL_W / 2;

  const boundaryMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const goalMaterial = new THREE.LineBasicMaterial({
    color: 0xffee00,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const cornerMaterial = new THREE.LineBasicMaterial({
    color: 0xff3355,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const wallPoints = [
    new THREE.Vector3(-halfW, 0.28, -halfH),
    new THREE.Vector3(halfW, 0.28, -halfH),
    new THREE.Vector3(halfW, 0.28, halfH),
    new THREE.Vector3(-halfW, 0.28, halfH),
    new THREE.Vector3(-halfW, 0.28, -halfH),
  ];

  const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
  const boundaryLine = new THREE.Line(boundaryGeometry, boundaryMaterial);
  boundaryLine.name = "FieldLimit";
  boundaryLine.renderOrder = 9999;
  group.add(boundaryLine);

  const goalSegments = [
    [new THREE.Vector3(-halfW, 0.28, -goalHalf), new THREE.Vector3(-halfW, 0.28, goalHalf)],
    [new THREE.Vector3(halfW, 0.28, -goalHalf), new THREE.Vector3(halfW, 0.28, goalHalf)],
    [new THREE.Vector3(-halfW - 0.55, 0.28, -goalHalf), new THREE.Vector3(-halfW - 0.55, 0.28, goalHalf)],
    [new THREE.Vector3(halfW + 0.55, 0.28, -goalHalf), new THREE.Vector3(halfW + 0.55, 0.28, goalHalf)],
  ];

  goalSegments.forEach((points, index) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, goalMaterial);
    line.name = `GoalZoneDebug_${index}`;
    line.renderOrder = 9999;
    group.add(line);
  });

  const cornerCenters = [
    new THREE.Vector3(-halfW, 0.28, -halfH),
    new THREE.Vector3(halfW, 0.28, -halfH),
    new THREE.Vector3(-halfW, 0.28, halfH),
    new THREE.Vector3(halfW, 0.28, halfH),
  ];

  cornerCenters.forEach((center, index) => {
    const points = [];
    const segments = 48;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          center.x + Math.cos(angle) * CORNER_PUSH_RADIUS,
          center.y,
          center.z + Math.sin(angle) * CORNER_PUSH_RADIUS
        )
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const circle = new THREE.Line(geometry, cornerMaterial);
    circle.name = `CornerAssistDebug_${index}`;
    circle.renderOrder = 9999;
    group.add(circle);
  });

  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const centerMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.28, 32),
    markerMaterial
  );
  centerMarker.rotation.x = -Math.PI / 2;
  centerMarker.position.y = 0.28;
  centerMarker.name = "FieldCenterDebug";
  group.add(centerMarker);

  return group;
}