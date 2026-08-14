import type { AppearanceComponent } from '../domain/material-design';
import type { CellAddress, EntityId, TopologyAction, TransformComponent } from '../domain/types';
import type { RoomGameNetwork } from './game-network';
import { RoomConnection } from './room-connection';
import type { RoomClientMessage, RoomServerMessage } from './types';

type CommandInput<T = RoomClientMessage> = T extends RoomClientMessage ? Omit<T, 'clientCommandId' | 'clientSequence'> : never;

export class RoomGameNetworkAdapter implements RoomGameNetwork {
  readonly #leases = new Map<EntityId, string>();
  readonly #pendingCommit = new Map<EntityId, TransformComponent>();
  readonly #lastPoseAt = new Map<EntityId, number>();

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
      this.#leases.set(message.pose.entityId, message.manipulationId);
      const pending = this.#pendingCommit.get(message.pose.entityId);
      if (pending) {
        this.#pendingCommit.delete(message.pose.entityId);
        this.fire({ type: 'manipulation-commit', manipulationId: message.manipulationId, transform: pending });
      }
    }
    if (message.type === 'manipulation-end') {
      if (this.#leases.get(message.entityId) === message.manipulationId) {
        this.#leases.delete(message.entityId);
        this.#pendingCommit.delete(message.entityId);
      }
    }
  }

  move(target: CellAddress): void { this.fire({ type: 'move', target }); }
  sit(targetEntityId: EntityId, seatIndex: number): void { this.fire({ type: 'sit', targetEntityId, seatIndex }); }
  teleport(targetEntityId: EntityId): void { this.fire({ type: 'teleport-use', targetEntityId }); }
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
    this.fire({ type: 'manipulation-begin', entityId });
  }

  updateManipulation(entityId: EntityId, transform: TransformComponent, lift: number): void {
    const lease = this.#leases.get(entityId);
    if (!lease) return;
    const now = performance.now();
    if (now - (this.#lastPoseAt.get(entityId) ?? 0) < 75) return;
    this.#lastPoseAt.set(entityId, now);
    this.fire({ type: 'manipulation-pose', manipulationId: lease, transform, lift });
  }

  commitManipulation(entityId: EntityId, transform: TransformComponent): void {
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
    if (lease) { this.#leases.delete(entityId); this.fire({ type: 'manipulation-cancel', manipulationId: lease }); }
  }

  private fire(message: CommandInput): void {
    void this.connection.send(message).catch((error) => this.onError(error instanceof Error ? error.message : 'Room command failed.'));
  }
}
