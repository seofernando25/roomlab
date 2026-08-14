import type { AppearanceComponent } from '../domain/material-design';
import type { CellAddress, EntityId, TopologyAction, TransformComponent } from '../domain/types';
import type { RoomGameNetwork } from './game-network';

/** Stable facade for long-lived renderer/controllers while the page may replace its room adapter. */
export class DelegatingRoomGameNetwork implements RoomGameNetwork {
  constructor(private readonly current: () => RoomGameNetwork | null) {}

  get actorId(): EntityId { return this.current()?.actorId ?? 'actor:local-player'; }
  get userId(): string { return this.current()?.userId ?? 'local'; }
  get canEdit(): boolean { return this.current()?.canEdit ?? true; }
  get roomRight(): 'guest' | 'rights' | 'owner' { return this.current()?.roomRight ?? 'owner'; }

  move(target: CellAddress): void { this.current()?.move(target); }
  sit(targetEntityId: EntityId, seatIndex: number): void { this.current()?.sit(targetEntityId, seatIndex); }
  teleport(targetEntityId: EntityId): void { this.current()?.teleport(targetEntityId); }
  chat(chatId: string, text: string): void { this.current()?.chat(chatId, text); }
  beginManipulation(entityId: EntityId): void { this.current()?.beginManipulation(entityId); }
  updateManipulation(entityId: EntityId, transform: TransformComponent, lift: number): void { this.current()?.updateManipulation(entityId, transform, lift); }
  commitManipulation(entityId: EntityId, transform: TransformComponent): void { this.current()?.commitManipulation(entityId, transform); }
  cancelManipulation(entityId: EntityId): void { this.current()?.cancelManipulation(entityId); }
  topology(action: TopologyAction): void { this.current()?.topology(action); }
  rotate(entityId: EntityId, rotation: 0 | 1 | 2 | 3): void { this.current()?.rotate(entityId, rotation); }
  pickup(entityId: EntityId): void { this.current()?.pickup(entityId); }
  place(itemInstanceId: string, prototypeId: string, transform: TransformComponent, appearance: AppearanceComponent | null): void {
    this.current()?.place(itemInstanceId, prototypeId, transform, appearance);
  }
  setAppearance(entityId: EntityId, appearance: AppearanceComponent | null): void { this.current()?.setAppearance(entityId, appearance); }
  createTeleporter(first: CellAddress, second: CellAddress): void { this.current()?.createTeleporter(first, second); }
  removeTeleporter(entityId: EntityId): void { this.current()?.removeTeleporter(entityId); }
}
