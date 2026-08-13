import * as THREE from 'three';

const HOVER_HEIGHT = 0.28;
const ROTATE_LIFT = 0.16;
const ROTATE_DURATION = 0.28;

interface MotionEntry {
  readonly root: THREE.Group;
  readonly visual: THREE.Group;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  held: boolean;
  externalLift: number | null;
  rotation: RotationMotion | null;
}

interface RotationMotion {
  readonly from: number;
  readonly to: number;
  elapsed: number;
}

export class ObjectMotion {
  readonly #entries = new Map<string, MotionEntry>();

  register(id: string, root: THREE.Group, visual: THREE.Group, x: number, y: number, z: number, yaw: number): void {
    root.position.set(x, y + 0.012, z);
    root.rotation.set(0, yaw, 0);
    visual.position.y = 0;
    this.#entries.set(id, {
      root,
      visual,
      targetX: x,
      targetY: y + 0.012,
      targetZ: z,
      targetYaw: yaw,
      held: false,
      externalLift: null,
      rotation: null,
    });
  }

  remove(id: string): void {
    this.#entries.delete(id);
  }

  setPose(id: string, x: number, y: number, z: number, yaw: number): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.targetX = x;
    entry.targetY = y + 0.012;
    entry.targetZ = z;
    const delta = shortestAngleDelta(entry.targetYaw, yaw);
    if (Math.abs(delta) < 0.001) return;
    entry.targetYaw += delta;
    entry.rotation = {
      from: entry.root.rotation.y,
      to: entry.targetYaw,
      elapsed: 0,
    };
  }

  setHeld(id: string, held: boolean): void {
    const entry = this.#entries.get(id);
    if (entry) entry.held = held;
  }

  setPlacementTarget(id: string, x: number, y: number, z: number): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.targetX = x;
    entry.targetY = y + 0.012;
    entry.targetZ = z;
  }

  setRemotePose(id: string, x: number, y: number, z: number, yaw: number, lift: number): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.targetX = x; entry.targetY = y + 0.012; entry.targetZ = z; entry.externalLift = Math.max(0, lift);
    entry.targetYaw += shortestAngleDelta(entry.targetYaw, yaw);
    entry.root.rotation.y += shortestAngleDelta(entry.root.rotation.y, yaw) * 0.45;
  }

  clearRemotePose(id: string): void {
    const entry = this.#entries.get(id);
    if (entry) entry.externalLift = null;
  }

  update(deltaSeconds: number): void {
    const moveBlend = 1 - Math.exp(-deltaSeconds * 22);
    const liftBlend = 1 - Math.exp(-deltaSeconds * 18);
    for (const entry of this.#entries.values()) {
      entry.root.position.x = THREE.MathUtils.lerp(entry.root.position.x, entry.targetX, moveBlend);
      entry.root.position.y = THREE.MathUtils.lerp(entry.root.position.y, entry.targetY, moveBlend);
      entry.root.position.z = THREE.MathUtils.lerp(entry.root.position.z, entry.targetZ, moveBlend);

      const rotationLift = this.updateRotation(entry, deltaSeconds);
      const targetLift = entry.externalLift ?? ((entry.held ? HOVER_HEIGHT : 0) + rotationLift);
      entry.visual.position.y = THREE.MathUtils.lerp(entry.visual.position.y, targetLift, liftBlend);
    }
  }

  private updateRotation(entry: MotionEntry, deltaSeconds: number): number {
    const motion = entry.rotation;
    if (!motion) return 0;
    motion.elapsed = Math.min(ROTATE_DURATION, motion.elapsed + deltaSeconds);
    const t = motion.elapsed / ROTATE_DURATION;
    const eased = t * t * (3 - 2 * t);
    entry.root.rotation.y = THREE.MathUtils.lerp(motion.from, motion.to, eased);
    if (t >= 1) {
      entry.root.rotation.y = motion.to;
      entry.rotation = null;
      return 0;
    }
    return Math.sin(Math.PI * t) * ROTATE_LIFT;
  }
}

export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
