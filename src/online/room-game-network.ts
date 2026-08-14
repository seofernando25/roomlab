import type { AppearanceComponent } from '../domain/material-design';
import type { CellAddress, EntityId, TopologyAction, TransformComponent } from '../domain/types';
import type { RoomGameNetwork } from './game-network';
import { RoomConnection } from './room-connection';
import type { RoomClientMessage, RoomServerMessage } from './types';

type CommandInput<T = RoomClientMessage> = T extends RoomClientMessage ? Omit<T, 'clientCommandId' | 'clientSequence'> : never;

export class RoomGameNetworkAdapter implements RoomGameNetwork {
  readonly #leases = new Map<EntityId, string>();
  readonly #pendingCommit = new Map<EntityId, TransformComponent>();
  readonly #pendingPose = new Map<EntityId, { readonly transform: TransformComponent; readonly lift: number; readonly key: string }>();
  readonly #pendingCancel = new Set<EntityId>();
  readonly #lastPoseAt = new Map<EntityId, number>();
  readonly #lastPoseKey = new Map<EntityId, string>();
  readonly #poseTimers = new Map<EntityId, ReturnType<typeof setTimeout>>();

  #role: 'visitor' | 'rights' | 'owner';

  constructor(
    readonly actorId: EntityId,
    readonly userId: string,
    role: 'visitor' | 'rights' | 'owner',
    private readonly connection: RoomConnection,
    private readonly onError: (message: string) => void,
  ) { this.#role = role; }

  get canEdit(): boolean { return this.#role !== 'visitor'; }
  get roomRight(): 'guest' | 'rights' | 'owner' { return this.#role === 'owner' ? 'owner' : this.#role === 'rights' ? 'rights' : 'guest'; }
  updateRole(role: 'visitor' | 'rights' | 'owner'): void { this.#role = role; }

  observe(message: RoomServerMessage): void {
    if (message.type === 'manipulation' && message.userId === this.userId) {
      if (this.#pendingCancel.delete(message.pose.entityId)) {
        this.fire({ type: 'manipulation-cancel', manipulationId: message.manipulationId });
        this.clearPoseState(message.pose.entityId);
        return;
      }
      this.#leases.set(message.pose.entityId, message.manipulationId);
      const pending = this.#pendingCommit.get(message.pose.entityId);
      if (pending) {
        this.#pendingCommit.delete(message.pose.entityId);
        this.clearPoseState(message.pose.entityId);
        this.fire({ type: 'manipulation-commit', manipulationId: message.manipulationId, transform: pending });
      } else this.flushPose(message.pose.entityId);
    }
    if (message.type === 'manipulation-end') {
      if (this.#leases.get(message.entityId) === message.manipulationId) {
        this.#leases.delete(message.entityId);
        this.#pendingCommit.delete(message.entityId);
        this.clearPoseState(message.entityId);
      }
    }
  }

  move(target: CellAddress): void { this.fire({ type: 'move', target }); }
  sit(targetEntityId: EntityId, seatIndex: number): void { this.fire({ type: 'sit', targetEntityId, seatIndex }); }
  teleport(targetEntityId: EntityId): void { this.fire({ type: 'teleport-use', targetEntityId }); }
  chat(chatId: string, text: string): void { this.fire({ type: 'chat', chatId, text }); }
  topology(action: TopologyAction): void { if (this.canEdit) this.fire({ type: 'topology', action }); }
  rotate(entityId: EntityId, rotation: 0|1|2|3): void { if (this.canEdit) this.fire({ type: 'entity-rotate', entityId, rotation }); }
  pickup(entityId: EntityId): void { if (this.canEdit) this.fire({ type: 'entity-pickup', entityId }); }
  place(itemInstanceId: string, prototypeId: string, transform: TransformComponent, appearance: AppearanceComponent | null): void { if (this.canEdit) this.fire({ type: 'entity-place', itemInstanceId, prototypeId, transform, appearance }); }
  setAppearance(entityId: EntityId, appearance: AppearanceComponent | null): void { if (this.canEdit) this.fire({ type: 'entity-appearance', entityId, appearance }); }
  createTeleporter(first: CellAddress, second: CellAddress): void { if (this.canEdit) this.fire({ type: 'teleporter-pair', first, second }); }
  removeTeleporter(entityId: EntityId): void { if (this.canEdit) this.fire({ type: 'teleporter-remove', entityId }); }

  beginManipulation(entityId: EntityId): void {
    if (!this.canEdit) return;
    this.#leases.delete(entityId);
    this.#pendingCancel.delete(entityId);
    this.#pendingCommit.delete(entityId);
    this.clearPoseState(entityId);
    this.fire({ type: 'manipulation-begin', entityId });
  }

  updateManipulation(entityId: EntityId, transform: TransformComponent, lift: number): void {
    if (!this.canEdit) return;
    const key = poseKey(transform, lift);
    if (key === this.#lastPoseKey.get(entityId) || key === this.#pendingPose.get(entityId)?.key) return;
    this.#pendingPose.set(entityId, { transform, lift, key });
    const lease = this.#leases.get(entityId);
    if (!lease) return;
    this.schedulePose(entityId);
  }

  commitManipulation(entityId: EntityId, transform: TransformComponent): void {
    this.clearPoseState(entityId);
    const lease = this.#leases.get(entityId);
    if (!lease) {
      this.#pendingCommit.set(entityId, transform);
      window.setTimeout(() => this.#pendingCommit.delete(entityId), 2500);
      return;
    }
    this.#leases.delete(entityId);
    this.fire({ type: 'manipulation-commit', manipulationId: lease, transform });
  }

  cancelManipulation(entityId: EntityId): void {
    const lease = this.#leases.get(entityId);
    this.#pendingCommit.delete(entityId);
    this.clearPoseState(entityId);
    if (lease) { this.#leases.delete(entityId); this.fire({ type: 'manipulation-cancel', manipulationId: lease }); }
    else this.#pendingCancel.add(entityId);
  }

  private schedulePose(entityId: EntityId): void {
    if (this.#poseTimers.has(entityId)) return;
    const wait = Math.max(0, 75 - (performance.now() - (this.#lastPoseAt.get(entityId) ?? 0)));
    if (wait <= 1) return this.flushPose(entityId);
    this.#poseTimers.set(entityId, setTimeout(() => {
      this.#poseTimers.delete(entityId);
      this.flushPose(entityId);
    }, wait));
  }

  private flushPose(entityId: EntityId): void {
    const lease = this.#leases.get(entityId), pending = this.#pendingPose.get(entityId);
    if (!lease || !pending) return;
    const wait = 75 - (performance.now() - (this.#lastPoseAt.get(entityId) ?? 0));
    if (wait > 1) return this.schedulePose(entityId);
    this.#pendingPose.delete(entityId);
    this.#lastPoseAt.set(entityId, performance.now());
    this.#lastPoseKey.set(entityId, pending.key);
    this.fire({ type: 'manipulation-pose', manipulationId: lease, transform: pending.transform, lift: pending.lift });
  }

  private clearPoseState(entityId: EntityId): void {
    this.#pendingPose.delete(entityId);
    const timer = this.#poseTimers.get(entityId);
    if (timer) clearTimeout(timer);
    this.#poseTimers.delete(entityId);
    this.#lastPoseKey.delete(entityId);
    this.#lastPoseAt.delete(entityId);
  }

  private fire(message: CommandInput): void {
    void this.connection.send(message).catch((error) => this.onError(error instanceof Error ? error.message : 'Room command failed.'));
  }
}

function poseKey(transform: TransformComponent, lift: number): string {
  return `${transform.position.x},${transform.position.z}@${Math.round(transform.y * 1000) / 1000}:${transform.rotation}:${Math.round(lift * 1000) / 1000}`;
}
