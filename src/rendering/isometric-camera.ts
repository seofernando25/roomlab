import * as THREE from 'three';

// Classic 2:1 pixel-isometric projection: a tile projects to roughly 2 pixels wide per 1 high.
const ISO_ELEVATION = THREE.MathUtils.degToRad(30);
const SNAP_ANCHOR = Math.PI / 4;
const SNAP_45 = Math.PI / 4;
const SNAP_90 = Math.PI / 2;
const FREE_TURN_SPEED = THREE.MathUtils.degToRad(60);
const FREE_TURN_RESPONSE = 12;
const YAW_SNAP_EPSILON = THREE.MathUtils.degToRad(0.08);

export const CAMERA_TURN_MODES = ['free', 'snap-45', 'snap-90'] as const;
export type CameraTurnMode = (typeof CAMERA_TURN_MODES)[number];

export function isCameraTurnMode(value: string): value is CameraTurnMode {
  return (CAMERA_TURN_MODES as readonly string[]).includes(value);
}

export function nextCameraSnapYaw(yaw: number, direction: -1 | 1, mode: Exclude<CameraTurnMode, 'free'>): number {
  const step = mode === 'snap-45' ? SNAP_45 : SNAP_90;
  const normalized = (yaw - SNAP_ANCHOR) / step;
  const epsilon = 1e-6;
  const index = direction > 0
    ? Math.floor(normalized + epsilon) + 1
    : Math.ceil(normalized - epsilon) - 1;
  return SNAP_ANCHOR + index * step;
}

export class IsometricCameraController {
  readonly camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  readonly target = new THREE.Vector3();
  #minX = 0;
  #maxX: number;
  #minZ = 0;
  #maxZ: number;
  #yaw = Math.PI / 4;
  #targetYaw = Math.PI / 4;
  #turnMode: CameraTurnMode = 'snap-90';
  #turnInput: -1 | 0 | 1 = 0;
  #turnVelocity = 0;
  #distance = 14;
  #viewHeight = 9.5;
  #targetViewHeight = 9.5;
  #aspect = 1;

  constructor(width: number, depth: number) {
    this.#maxX = width;
    this.#maxZ = depth;
    this.target.set(width / 2, 0.55, depth / 2);
    this.#distance = Math.max(width, depth) * 1.7;
    this.#viewHeight = Math.max(7, depth + 1.8);
    this.#targetViewHeight = this.#viewHeight;
    this.snap();
  }

  get yaw(): number {
    return this.#yaw;
  }

  get turnMode(): CameraTurnMode {
    return this.#turnMode;
  }

  get viewHeight(): number {
    return this.#viewHeight;
  }

  setTurnMode(mode: CameraTurnMode): void {
    this.#turnMode = mode;
    this.#turnInput = 0;
    this.#turnVelocity = 0;
    this.#targetYaw = this.#yaw;
  }

  setRoomBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.#minX = minX;
    this.#maxX = maxX + 1;
    this.#minZ = minZ;
    this.#maxZ = maxZ + 1;
    const width = this.#maxX - this.#minX;
    const depth = this.#maxZ - this.#minZ;
    this.#distance = Math.max(this.#distance, Math.max(width, depth) * 1.55);
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.#minX - 2, this.#maxX + 2);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.#minZ - 2, this.#maxZ + 2);
  }

  frameRoomBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.setRoomBounds(minX, maxX, minZ, maxZ);
    this.target.x = (minX + maxX + 1) / 2;
    this.target.z = (minZ + maxZ + 1) / 2;
  }

  setTargetHeight(y: number): void { this.target.y = y; }

  beginTurn(direction: -1 | 1): void {
    if (this.#turnMode === 'free') {
      this.#turnInput = direction;
      this.#targetYaw = this.#yaw;
      return;
    }
    this.#targetYaw = nextCameraSnapYaw(this.#targetYaw, direction, this.#turnMode);
  }

  endTurn(direction?: -1 | 1): void {
    if (direction === undefined || this.#turnInput === direction) this.#turnInput = 0;
  }

  panScreen(deltaX: number, deltaY: number, viewportHeight: number): void {
    const unitsPerPixel = this.#viewHeight / Math.max(1, viewportHeight);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const screenUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0).normalize();
    this.target.addScaledVector(right, -deltaX * unitsPerPixel);
    this.target.addScaledVector(screenUp, deltaY * unitsPerPixel);
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.#minX - 2, this.#maxX + 2);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.#minZ - 2, this.#maxZ + 2);
  }

  zoom(deltaY: number): void {
    this.zoomByFactor(Math.exp(deltaY * 0.0012));
  }

  zoomByFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.#targetViewHeight = THREE.MathUtils.clamp(this.#targetViewHeight * factor, 4.2, 13.5);
  }

  resize(width: number, height: number): void {
    this.#aspect = width / Math.max(1, height);
    this.applyProjection();
  }

  update(deltaSeconds: number): void {
    const blend = 1 - Math.exp(-deltaSeconds * 10);
    if (this.#turnMode === 'free') {
      const turnBlend = 1 - Math.exp(-deltaSeconds * FREE_TURN_RESPONSE);
      const targetVelocity = this.#turnInput * FREE_TURN_SPEED;
      this.#turnVelocity = THREE.MathUtils.lerp(this.#turnVelocity, targetVelocity, turnBlend);
      if (this.#turnInput === 0 && Math.abs(this.#turnVelocity) < THREE.MathUtils.degToRad(0.05)) this.#turnVelocity = 0;
      this.#yaw += this.#turnVelocity * deltaSeconds;
      this.#targetYaw = this.#yaw;
    } else {
      const yawDelta = this.#targetYaw - this.#yaw;
      this.#yaw = Math.abs(yawDelta) <= YAW_SNAP_EPSILON
        ? this.#targetYaw
        : THREE.MathUtils.lerp(this.#yaw, this.#targetYaw, blend);
    }
    const nextViewHeight = THREE.MathUtils.lerp(this.#viewHeight, this.#targetViewHeight, blend);
    if (Math.abs(nextViewHeight - this.#viewHeight) > 0.0001) {
      this.#viewHeight = nextViewHeight;
      this.applyProjection();
    }
    this.placeCamera();
  }

  private snap(): void {
    this.#yaw = this.#targetYaw;
    this.placeCamera();
  }

  private placeCamera(): void {
    const horizontal = Math.cos(ISO_ELEVATION) * this.#distance;
    this.camera.position.set(
      this.target.x + Math.cos(this.#yaw) * horizontal,
      this.target.y + Math.sin(ISO_ELEVATION) * this.#distance,
      this.target.z + Math.sin(this.#yaw) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private applyProjection(): void {
    const halfH = this.#viewHeight / 2;
    this.camera.left = -halfH * this.#aspect;
    this.camera.right = halfH * this.#aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }
}
