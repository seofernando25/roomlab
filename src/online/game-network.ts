import type { AppearanceComponent } from '../domain/material-design';
import type { CellAddress, EntityId, TopologyAction, TransformComponent } from '../domain/types';

export interface RoomGameNetwork {
  readonly actorId: EntityId;
  readonly userId: string;
  readonly canEdit: boolean;
  readonly roomRight: 'guest' | 'rights' | 'owner';
  move(target: CellAddress): void;
  sit(targetEntityId: EntityId, seatIndex: number): void;
  teleport(targetEntityId: EntityId): void;
  chat(chatId: string, text: string): void;
  beginManipulation(entityId: EntityId): void;
  updateManipulation(entityId: EntityId, transform: TransformComponent, lift: number): void;
  commitManipulation(entityId: EntityId, transform: TransformComponent): void;
  cancelManipulation(entityId: EntityId): void;
  topology(action: TopologyAction): void;
  rotate(entityId: EntityId, rotation: 0 | 1 | 2 | 3): void;
  pickup(entityId: EntityId): void;
  place(itemInstanceId: string, prototypeId: string, transform: TransformComponent, appearance: AppearanceComponent | null): void;
  setAppearance(entityId: EntityId, appearance: AppearanceComponent | null): void;
  createTeleporter(first: CellAddress, second: CellAddress): void;
  removeTeleporter(entityId: EntityId): void;
}
