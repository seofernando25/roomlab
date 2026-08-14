import * as THREE from 'three';
import {
  authoredDirection,
  loadHumanTextureLibrary,
  type HumanDirection,
  type HumanPose,
  type HumanTextureLibrary,
} from './human-compositor';
import { HumanPixelTransport } from './human-pixel-transport';
import { AvatarChatBubble } from './avatar-chat-bubble';

export type { HumanDirection } from './human-compositor';

const INITIAL_CAMERA_YAW = Math.PI / 4;
const STEP = Math.PI / 4;
const MORPH_ENDPOINT_EPSILON = 0.005;
const AVATAR_HEIGHT = 1.72;
const WALK_FRAME_RATE = 8;

export class HumanAvatar extends THREE.Group {
  readonly #material = new THREE.MeshBasicMaterial({
    depthTest: true,
    depthWrite: true,
    transparent: false,
    alphaTest: 0.10,
    side: THREE.DoubleSide,
  });
  readonly #plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.#material);
  readonly #pixelTransport = new HumanPixelTransport();
  readonly #sitPixelTransport = new HumanPixelTransport();
  readonly #chatBubble = new AvatarChatBubble(AVATAR_HEIGHT);
  #library: HumanTextureLibrary | null = null;
  #worldDirection: HumanDirection;
  #worldDirectionValue: number;
  #pose: HumanPose = 'stand';
  #elevation = 0;
  #animationTime = 0;
  #lastCameraYaw = INITIAL_CAMERA_YAW;
  #cameraDirection: -1 | 1 = 1;
  #lastSitRelativeValue: number | null = null;
  #sitTransportDirection: -1 | 1 = 1;

  constructor(worldDirection: HumanDirection = 3) {
    super();
    this.name = 'human-avatar';
    this.#worldDirection = worldDirection;
    this.#worldDirectionValue = worldDirection;
    this.#plane.visible = false;
    this.#plane.scale.set(AVATAR_HEIGHT * (64 / 96), AVATAR_HEIGHT, 1);
    this.updatePlaneHeight();
    this.add(this.#plane, createGroundShadow(), this.#chatBubble.group);
  }

  get pose(): HumanPose { return this.#pose; }
  get worldDirection(): HumanDirection { return this.#worldDirection; }
  get hasChat(): boolean { return this.#chatBubble.active; }

  async load(): Promise<void> {
    this.#library = await loadHumanTextureLibrary();
    this.applyView(INITIAL_CAMERA_YAW);
  }

  setWorldDirection(direction: HumanDirection): void {
    this.#worldDirection = direction;
    this.#worldDirectionValue = direction;
  }

  setWorldDirectionContinuous(direction: number): void {
    this.#worldDirectionValue = mod8Float(direction);
    this.#worldDirection = mod8(Math.round(this.#worldDirectionValue)) as HumanDirection;
  }

  setPose(pose: HumanPose): void {
    if (pose === this.#pose) return;
    this.#pose = pose;
    this.#animationTime = 0;
    this.#lastSitRelativeValue = null;
  }

  setElevation(height: number): void {
    this.#elevation = Math.max(0, height);
    this.updatePlaneHeight();
  }

  say(chatId: string, text: string): void {
    this.#chatBubble.say(chatId, text);
  }

  update(cameraYaw: number, camera: THREE.Camera, deltaSeconds = 0): void {
    this.#plane.quaternion.copy(camera.quaternion);
    const yawDelta = cameraYaw - this.#lastCameraYaw;
    if (Math.abs(yawDelta) > 0.00001) this.#cameraDirection = yawDelta < 0 ? -1 : 1;
    this.#lastCameraYaw = cameraYaw;
    if (this.#pose === 'walk') this.#animationTime += deltaSeconds;
    this.applyView(cameraYaw);
    this.#chatBubble.update(this.#elevation, deltaSeconds);
  }

  dispose(): void {
    this.#plane.geometry.dispose();
    this.#material.dispose();
    this.#pixelTransport.dispose();
    this.#sitPixelTransport.dispose();
    this.#chatBubble.dispose();
  }

  private applyView(cameraYaw: number): void {
    const library = this.#library;
    if (!library) return;
    if (this.#pose === 'walk') {
      const frame = Math.floor(this.#animationTime * WALK_FRAME_RATE) % library.walk.length;
      this.applySingle(library.walk[frame]?.get(relativeHumanDirection(this.#worldDirection, cameraYaw)));
      return;
    }
    if (this.#pose === 'sit') {
      this.applySittingView(library.sit, cameraYaw);
      return;
    }
    this.applyStandingView(library.stand, cameraYaw);
  }

  private applySittingView(textures: ReadonlyMap<HumanDirection, THREE.CanvasTexture>, cameraYaw: number): void {
    const blend = relativeSitDirectionBlend(this.#worldDirectionValue, cameraYaw);
    const relativeValue = relativeHumanDirectionValue(this.#worldDirectionValue, cameraYaw);
    if (this.#lastSitRelativeValue !== null) {
      const delta = shortestDirectionDelta(this.#lastSitRelativeValue, relativeValue);
      if (Math.abs(delta) > 0.00001) this.#sitTransportDirection = delta > 0 ? 1 : -1;
    }
    this.#lastSitRelativeValue = relativeValue;

    if (blend.progress <= MORPH_ENDPOINT_EPSILON || blend.progress >= 1 - MORPH_ENDPOINT_EPSILON) {
      const direction = blend.progress >= 1 - MORPH_ENDPOINT_EPSILON ? blend.to : blend.from;
      this.applySingle(textures.get(direction));
      return;
    }

    const forward = this.#sitTransportDirection > 0;
    const sourceDirection = forward ? blend.from : blend.to;
    const targetDirection = forward ? blend.to : blend.from;
    const progress = forward ? blend.progress : 1 - blend.progress;
    const source = textures.get(sourceDirection);
    const target = textures.get(targetDirection);
    if (!source || !target) return;
    this.applySingle(this.#sitPixelTransport.render(
      sourceDirection,
      targetDirection,
      source,
      target,
      progress,
      this.#sitTransportDirection,
    ));
  }

  private applyStandingView(textures: ReadonlyMap<HumanDirection, THREE.CanvasTexture>, cameraYaw: number): void {
    const blend = relativeHumanDirectionBlend(this.#worldDirection, cameraYaw);
    if (blend.progress <= MORPH_ENDPOINT_EPSILON || blend.progress >= 1 - MORPH_ENDPOINT_EPSILON) {
      const direction = blend.progress >= 1 - MORPH_ENDPOINT_EPSILON ? blend.to : blend.from;
      this.applySingle(textures.get(direction));
      return;
    }

    const sourceDirection = this.#cameraDirection > 0 ? blend.to : blend.from;
    const targetDirection = this.#cameraDirection > 0 ? blend.from : blend.to;
    const progress = this.#cameraDirection > 0 ? 1 - blend.progress : blend.progress;
    const source = textures.get(sourceDirection);
    const target = textures.get(targetDirection);
    if (!source || !target) return;
    this.applySingle(this.#pixelTransport.render(
      sourceDirection,
      targetDirection,
      source,
      target,
      progress,
      this.#cameraDirection,
    ));
  }

  private applySingle(texture?: THREE.Texture): void {
    if (!texture) return;
    if (this.#material.map !== texture) {
      const hadMap = this.#material.map !== null;
      this.#material.map = texture;
      if (!hadMap) this.#material.needsUpdate = true;
    }
    this.#plane.visible = true;
  }

  private updatePlaneHeight(): void {
    this.#plane.position.y = AVATAR_HEIGHT / 2 + this.#elevation;
  }

}

export function relativeHumanDirection(worldDirection: HumanDirection, cameraYaw: number): HumanDirection {
  const cameraSteps = Math.round((cameraYaw - INITIAL_CAMERA_YAW) / STEP);
  return mod8(worldDirection - cameraSteps) as HumanDirection;
}

export function relativeHumanDirectionBlend(
  worldDirection: HumanDirection,
  cameraYaw: number,
): { from: HumanDirection; to: HumanDirection; progress: number } {
  const cameraSteps = (cameraYaw - INITIAL_CAMERA_YAW) / STEP;
  const value = mod8Float(worldDirection - cameraSteps);
  const from = Math.floor(value) as HumanDirection;
  const to = mod8(from + 1) as HumanDirection;
  return { from, to, progress: value - Math.floor(value) };
}

export function relativeSitDirectionBlend(
  worldDirection: number,
  cameraYaw: number,
): { from: HumanDirection; to: HumanDirection; progress: number } {
  const value = relativeHumanDirectionValue(worldDirection, cameraYaw);
  const scaled = value / 2;
  const base = Math.floor(scaled);
  return {
    from: mod8(base * 2) as HumanDirection,
    to: mod8((base + 1) * 2) as HumanDirection,
    progress: scaled - base,
  };
}

export { authoredDirection };

function relativeHumanDirectionValue(worldDirection: number, cameraYaw: number): number {
  const cameraSteps = (cameraYaw - INITIAL_CAMERA_YAW) / STEP;
  return mod8Float(worldDirection - cameraSteps);
}

function shortestDirectionDelta(from: number, to: number): number {
  const delta = mod8Float(to - from);
  return delta > 4 ? delta - 8 : delta;
}

function createGroundShadow(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x15191a, transparent: true, opacity: 0.30, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

function mod8(value: number): number { return ((value % 8) + 8) % 8; }
function mod8Float(value: number): number { return ((value % 8) + 8) % 8; }
