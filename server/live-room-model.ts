import { entityById } from '../src/domain/entity-queries';
import type { GameStore } from '../src/domain/game-store';
import type { InteractionAccessContext, InteractionAccessProvider, RoomRightLevel } from '../src/domain/interaction-types';
import { sortedLevels } from '../src/domain/room-topology';
import type { CellAddress, EntityId, TransformComponent, WorldEntity, WorldState } from '../src/domain/types';
import type { RoomId, RoomRole, RoomServerMessage, UserId } from '../src/online/types';
import type { ActorMotionSystem } from '../src/gameplay/actor-motion-system';
import { canTraverseCell } from '../src/gameplay/traversal-system';

export interface RoomTransport { readonly id: string; send(message: RoomServerMessage): void; }
export interface JoinTicket { readonly id: string; readonly roomId: RoomId; readonly userId: UserId; readonly memberId: string; readonly expiresAt: number; }
export interface Member {
  readonly id: string;
  readonly userId: UserId;
  readonly username: string;
  readonly actorId: EntityId;
  readonly roomSessionId: string;
  role: RoomRole;
  readonly inventory: ReadonlySet<string>;
  readonly motion: ActorMotionSystem;
  transport: RoomTransport | null;
  lastClientSequence: number;
  readonly commands: Map<string, number>;
  lastActorKey: string;
  pendingSeat: { entityId: EntityId; seatIndex: number } | null;
}
export interface ManipulationLease {
  readonly id: string;
  readonly entityId: EntityId;
  readonly userId: UserId;
  readonly original: TransformComponent;
  expiresAt: number;
}
export interface LiveRoom {
  readonly roomId: RoomId;
  readonly store: GameStore;
  readonly members: Map<string, Member>;
  readonly manipulations: Map<string, ManipulationLease>;
  simulation: { update(deltaSeconds: number): void };
  sequence: number;
}

export function actorEntity(id: EntityId, address: CellAddress): WorldEntity {
  return { id, prototypeId: 'actor.local-player', components: { transform: { levelId: address.levelId, position: address.position, rotation: 0 }, actor: { pose: 'stand', direction: 3 } } };
}

export function spawnCell(state: WorldState, actorId: EntityId): CellAddress {
  for (const level of sortedLevels(state.topology)) {
    for (const cell of level.cells) {
      const address = { levelId: level.id, position: cell.position };
      if (canTraverseCell({ actorId, state }, address)) return address;
    }
  }
  throw new Error('This room has no walkable floor.');
}

export function assertEditor(member: Member): void {
  if (member.role === 'visitor') throw new Error('You do not have room editing rights.');
}

export function accessProviderFor(room: LiveRoom, actorId: EntityId): InteractionAccessProvider {
  return (_id, state) => accessForActor(room, actorId, state);
}

export function accessForActor(room: LiveRoom, actorId: EntityId, _state: WorldState): InteractionAccessContext {
  const member = [...room.members.values()].find((candidate) => candidate.actorId === actorId);
  return { actorId, roomRight: rightForRole(member?.role ?? 'visitor'), inventoryPrototypeIds: member?.inventory ?? new Set() };
}

export function actorEventKey(store: GameStore, actorId: EntityId): string {
  const actor = entityById(store.state, actorId);
  return actor?.components.actor ? JSON.stringify([actor.components.transform, actor.components.actor]) : '';
}

function rightForRole(role: RoomRole): RoomRightLevel {
  return role === 'owner' ? 'owner' : role === 'rights' ? 'rights' : 'guest';
}

export function teleporterEntity(id: string, targetEntityId: string, address: CellAddress): WorldEntity {
  return { id, prototypeId: 'tile.teleporter', components: { transform: { levelId: address.levelId, position: address.position, rotation: 0 }, teleporter: { targetEntityId } } };
}

export function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.levelId === b.levelId && a.position.x === b.position.x && a.position.z === b.position.z;
}
