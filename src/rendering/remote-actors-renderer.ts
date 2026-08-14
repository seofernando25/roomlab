import * as THREE from 'three';
import { actorEntities, entityById } from '../domain/entity-queries';
import { floorWorldY } from '../domain/room-topology';
import type { EntityId, WorldEntity, WorldState } from '../domain/types';
import { seatPoseForVisualTransform, seatTargetsFor } from '../gameplay/seating-system';
import { HumanAvatar } from './human-avatar';

interface RemoteVisual {
  readonly avatar: HumanAvatar;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export class RemoteActorsRenderer {
  readonly group = new THREE.Group();
  readonly #visuals = new Map<EntityId, RemoteVisual>();
  #state: WorldState;

  constructor(
    state: WorldState,
    readonly localActorId: EntityId,
    private readonly objects: ReadonlyMap<EntityId, THREE.Group>,
  ) {
    this.#state = state;
    this.group.name = 'remote-actors';
  }

  sync(state: WorldState): void {
    this.#state = state;
    const actors = actorEntities(state).filter((entity) => entity.id !== this.localActorId);
    const live = new Set(actors.map((entity) => entity.id));
    for (const [id, visual] of this.#visuals) {
      if (live.has(id)) continue;
      this.group.remove(visual.avatar);
      visual.avatar.dispose();
      this.#visuals.delete(id);
    }
    for (const entity of actors) this.syncActor(entity);
  }

  update(cameraYaw: number, camera: THREE.Camera, deltaSeconds: number): void {
    const response = 12;
    const alpha = 1 - Math.exp(-response * deltaSeconds);
    for (const [id, visual] of this.#visuals) {
      const entity = entityById(this.#state, id);
      if (!entity?.components.actor) continue;
      const seated = this.seatedPose(entity);
      if (seated) {
        visual.targetX = seated.x; visual.targetY = seated.groundY; visual.targetZ = seated.z;
        visual.avatar.setElevation(seated.lift);
        visual.avatar.setWorldDirectionContinuous(seated.direction);
      } else {
        visual.avatar.setElevation(0);
        visual.avatar.setWorldDirectionContinuous(entity.components.actor.direction);
      }
      visual.x = THREE.MathUtils.lerp(visual.x, visual.targetX, alpha);
      visual.y = THREE.MathUtils.lerp(visual.y, visual.targetY, alpha);
      visual.z = THREE.MathUtils.lerp(visual.z, visual.targetZ, alpha);
      visual.avatar.position.set(visual.x, visual.y, visual.z);
      visual.avatar.setPose(entity.components.actor.pose);
      visual.avatar.update(cameraYaw, camera, deltaSeconds);
    }
  }

  setVisualTarget(actorId: EntityId, x: number, y: number, z: number): void {
    const visual = this.#visuals.get(actorId);
    if (!visual) return;
    visual.targetX = x;
    visual.targetY = y;
    visual.targetZ = z;
  }

  say(actorId: EntityId, chatId: string, text: string): void { this.#visuals.get(actorId)?.avatar.say(chatId, text); }
  get chatCount(): number { return [...this.#visuals.values()].filter((visual) => visual.avatar.hasChat).length; }

  dispose(): void {
    for (const visual of this.#visuals.values()) visual.avatar.dispose();
    this.#visuals.clear();
    this.group.clear();
  }

  private syncActor(entity: WorldEntity): void {
    const actor = entity.components.actor;
    if (!actor) return;
    const base = basePosition(this.#state, entity);
    let visual = this.#visuals.get(entity.id);
    if (!visual) {
      const avatar = new HumanAvatar(Math.round(actor.direction) as 0|1|2|3|4|5|6|7);
      visual = { avatar, x: base.x, y: base.y, z: base.z, targetX: base.x, targetY: base.y, targetZ: base.z };
      this.#visuals.set(entity.id, visual);
      this.group.add(avatar);
      void avatar.load().catch(() => { avatar.visible = false; });
    }
    visual.targetX = base.x; visual.targetY = base.y; visual.targetZ = base.z;
    visual.avatar.setPose(actor.pose);
    visual.avatar.setWorldDirectionContinuous(actor.direction);
  }

  private seatedPose(entity: WorldEntity): { x:number; z:number; groundY:number; lift:number; direction:number } | null {
    const actor = entity.components.actor;
    if (!actor?.seatedOn || actor.seatIndex === undefined) return null;
    const seatEntity = entityById(this.#state, actor.seatedOn);
    const target = seatEntity ? seatTargetsFor(seatEntity)[actor.seatIndex] : undefined;
    const root = this.objects.get(actor.seatedOn);
    const visual = root?.getObjectByName('object-visual');
    if (!target || !root || !(visual instanceof THREE.Group)) return null;
    const pose = seatPoseForVisualTransform(target, root.position.x, root.position.y - 0.012, root.position.z, root.rotation.y, visual.position.y);
    const groundY = floorWorldY(this.#state.topology, pose.cell);
    return { x: pose.x, z: pose.z, groundY, lift: Math.max(0, pose.height - groundY), direction: pose.direction };
  }
}

function basePosition(state: WorldState, entity: WorldEntity): { x:number; y:number; z:number } {
  const transform = entity.components.transform;
  return { x: transform.position.x + 0.5, y: transform.y, z: transform.position.z + 0.5 };
}
