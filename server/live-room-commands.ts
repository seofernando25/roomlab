import { randomUUID } from 'node:crypto';
import { entityById } from '../src/domain/entity-queries';
import { materialAppearanceError } from '../src/domain/material-appearance-rules';
import type { AppearanceComponent } from '../src/domain/material-design';
import { getEntityPrototype } from '../src/domain/prototype-registry';
import { roomCellAt } from '../src/domain/room-topology';
import { stackGroupIds, translatedStackTransforms } from '../src/domain/stack-support';
import type { CellAddress, EntityId, TransformComponent, WorldAction } from '../src/domain/types';
import { validateWorldState } from '../src/domain/world-validation';
import { createFurniEntity, reduceWorld } from '../src/domain/world-state';
import { automaticSeatAssignments, seatTargetsFor } from '../src/gameplay/seating-system';
import type { RoomClientMessage } from '../src/online/types';
import { inventoryItem, placedItemOwner, reserveInventoryItemForRoom, returnPlacedItem, updatePlacedItemAppearance } from './economy-service';
import { transaction } from './database';
import type { LiveRoom, ManipulationLease, Member } from './live-room-model';
import { assertEditor, sameAddress, teleporterEntity } from './live-room-model';
import { saveRoomWorldInTransaction } from './room-repository';

export interface CommandPublisher {
  broadcastWorld(room: LiveRoom): void;
  sendInventory(room: LiveRoom, userId: string): void;
  broadcastChat(room: LiveRoom, member: Member, chatId: string, text: string): void;
  broadcastManipulation(room: LiveRoom, member: Member, lease: ManipulationLease, transform: TransformComponent, lift: number): void;
  broadcastManipulationEnd(room: LiveRoom, lease: ManipulationLease): void;
}

export class LiveRoomCommands {
  constructor(private readonly publisher: CommandPublisher) {}

  execute(room: LiveRoom, member: Member, message: RoomClientMessage): void {
    if (message.type === 'ping') return;
    if (message.type === 'move') {
      if (!member.motion.moveTo(message.target, room.store.state)) throw new Error('You cannot walk there.');
      member.pendingSeat = null;
      return;
    }
    if (message.type === 'stand') { member.pendingSeat = null; member.motion.stand(); return; }
    if (message.type === 'chat') { this.chat(room, member, message.chatId, message.text); return; }
    if (message.type === 'teleport-use') { if (!member.motion.useTeleporter(message.targetEntityId, room.store.state)) throw new Error('That teleporter cannot be used.'); member.pendingSeat = null; return; }
    if (message.type === 'sit') { this.sit(room, member, message.targetEntityId, message.seatIndex); return; }
    if (message.type === 'manipulation-begin') { this.beginManipulation(room, member, message.entityId); return; }
    if (message.type === 'manipulation-pose') { this.updateManipulation(room, member, message.manipulationId, message.transform, message.lift ?? 0.18); return; }
    if (message.type === 'manipulation-commit') { this.commitManipulation(room, member, message.manipulationId, message.transform); return; }
    if (message.type === 'manipulation-cancel') { this.cancelManipulation(room, member, message.manipulationId); return; }
    if (message.type === 'entity-place') { this.placeEntity(room, member, message.itemInstanceId, message.prototypeId, message.transform, message.appearance); return; }
    if (message.type === 'entity-rotate') { this.persistAction(room, member, { type: 'transform/rotate', id: message.entityId, rotation: message.rotation }); return; }
    if (message.type === 'entity-pickup') { this.pickupEntity(room, member, message.entityId); return; }
    if (message.type === 'entity-appearance') { this.setAppearance(room, member, message.entityId, message.appearance); return; }
    if (message.type === 'topology') { this.persistAction(room, member, message.action); return; }
    if (message.type === 'teleporter-pair') { this.createTeleportPair(room, member, message.first, message.second); return; }
    if (message.type === 'teleporter-remove') this.removeTeleportPair(room, member, message.entityId);
  }

  cancelLease(room: LiveRoom, lease: ManipulationLease): void {
    room.manipulations.delete(lease.id);
    this.publisher.broadcastManipulationEnd(room, lease);
  }

  private chat(room: LiveRoom, member: Member, chatId: string, raw: string): void {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (!text) throw new Error('Say something first.');
    if (text.length > 160) throw new Error('Chat messages can use up to 160 characters.');
    const now = Date.now();
    if (now - member.lastChatAt < 350) throw new Error('You are sending messages too quickly.');
    member.lastChatAt = now;
    this.publisher.broadcastChat(room, member, chatId, text);
  }

  private sit(room: LiveRoom, member: Member, targetEntityId: string, seatIndex?: number): void {
    const target = entityById(room.store.state, targetEntityId);
    const seats = target ? seatTargetsFor(target) : [];
    const seat = seatIndex === undefined ? seats[0] : seats[seatIndex];
    const currentSeat = member.motion.seatedTarget;
    if (seat && member.motion.seatedOn === targetEntityId && currentSeat?.seatIndex === seat.seatIndex) return;
    if (!seat || !member.motion.sitAt(seat, room.store.state)) throw new Error('That seat is not available.');
    member.pendingSeat = { entityId: targetEntityId, seatIndex: seat.seatIndex };
  }

  private beginManipulation(room: LiveRoom, member: Member, entityId: EntityId): void {
    assertEditor(member);
    const entity = entityById(room.store.state, entityId);
    if (!entity || getEntityPrototype(entity.prototypeId).kind !== 'furni') throw new Error('That object cannot be moved.');
    const group = new Set(stackGroupIds(room.store.state, entityId));
    const overlapsLease = [...room.manipulations.values()].some((lease) => stackGroupIds(room.store.state, lease.entityId).some((id) => group.has(id)));
    if (overlapsLease) throw new Error('Someone else is moving part of that stack.');
    const lease: ManipulationLease = { id: randomUUID(), entityId, userId: member.userId, original: entity.components.transform, expiresAt: Date.now() + 10_000 };
    room.manipulations.set(lease.id, lease);
    this.publisher.broadcastManipulation(room, member, lease, lease.original, 0.18);
  }

  private updateManipulation(room: LiveRoom, member: Member, leaseId: string, transform: TransformComponent, lift: number): void {
    const lease = this.requireLease(room, member, leaseId);
    const transforms = translatedStackTransforms(room.store.state, lease.entityId, transform);
    if (!transforms.length || reduceWorld(room.store.state, { type: 'entity-group/transform', transforms }) === room.store.state) return;
    lease.expiresAt = Date.now() + 10_000;
    this.publisher.broadcastManipulation(room, member, lease, transform, lift);
  }

  private commitManipulation(room: LiveRoom, member: Member, leaseId: string, transform: TransformComponent): void {
    const lease = this.requireLease(room, member, leaseId);
    assertEditor(member);
    const before = room.store.state;
    const transforms = translatedStackTransforms(room.store.state, lease.entityId, transform);
    const action: WorldAction = { type: 'entity-group/transform', transforms };
    if (!room.store.dispatch(action).accepted) throw new Error('That furniture move is not valid.');
    for (const entry of transforms) this.syncSeatedActors(room, entry.id);
    const validation = validateWorldState(room.store.state);
    if (!validation.valid) {
      room.store.replaceFromServer(before);
      for (const attached of room.members.values()) attached.motion.syncFromWorld();
      throw new Error(`Furniture move produced invalid room state: ${validation.errors.join(' ')}`);
    }
    try { transaction(() => saveRoomWorldInTransaction(room.roomId, room.store.state)); }
    catch (error) {
      room.store.replaceFromServer(before);
      for (const attached of room.members.values()) attached.motion.syncFromWorld();
      throw error;
    }
    this.publisher.broadcastWorld(room);
    room.manipulations.delete(lease.id);
    this.publisher.broadcastManipulationEnd(room, lease);
  }

  private cancelManipulation(room: LiveRoom, member: Member, leaseId: string): void {
    this.cancelLease(room, this.requireLease(room, member, leaseId));
  }

  private placeEntity(room: LiveRoom, member: Member, itemId: string, prototypeId: string, transform: TransformComponent, appearance: AppearanceComponent | null): void {
    assertEditor(member);
    const item = inventoryItem(member.userId, itemId);
    if (!item || item.state !== 'inventory' || item.prototypeId !== prototypeId) throw new Error('That inventory item is no longer available.');
    if (appearance) {
      const appearanceError = materialAppearanceError(prototypeId, appearance);
      if (appearanceError) throw new Error(appearanceError);
    }
    const entity = createFurniEntity(prototypeId, transform.position, transform.rotation, randomUUID(), transform.y, appearance ?? undefined);
    const action: WorldAction = { type: 'entity/add', entity };
    const preview = reduceWorld(room.store.state, action);
    if (preview === room.store.state) throw new Error('That item does not fit there.');
    transaction(() => {
      reserveInventoryItemForRoom(member.userId, itemId, room.roomId, entity.id, appearance);
      saveRoomWorldInTransaction(room.roomId, preview);
    });
    room.store.dispatch(action);
    this.syncSeatedActors(room, entity.id);
    this.publisher.broadcastWorld(room);
    this.publisher.sendInventory(room, member.userId);
  }

  private setAppearance(room: LiveRoom, member: Member, entityId: EntityId, appearance: AppearanceComponent | null): void {
    assertEditor(member);
    const entity = entityById(room.store.state, entityId);
    if (!entity || getEntityPrototype(entity.prototypeId).kind !== 'furni') throw new Error('That object cannot be customized.');
    const itemOwnerId = placedItemOwner(room.roomId, entityId);
    if (itemOwnerId && itemOwnerId !== member.userId) throw new Error('Only the item owner can permanently restyle that item.');
    if (appearance) {
      const appearanceError = materialAppearanceError(entity.prototypeId, appearance);
      if (appearanceError) throw new Error(appearanceError);
    }
    const action: WorldAction = { type: 'component/set', id: entityId, component: 'appearance', value: appearance };
    const preview = reduceWorld(room.store.state, action);
    if (preview === room.store.state) throw new Error('That material change is not valid.');
    transaction(() => {
      updatePlacedItemAppearance(room.roomId, entityId, appearance);
      saveRoomWorldInTransaction(room.roomId, preview);
    });
    room.store.dispatch(action);
    this.publisher.broadcastWorld(room);
    if (itemOwnerId) this.publisher.sendInventory(room, itemOwnerId);
  }

  private pickupEntity(room: LiveRoom, member: Member, entityId: EntityId): void {
    assertEditor(member);
    if (room.store.state.entities.some((entity) => entity.components.actor?.seatedOn === entityId)) throw new Error('Someone is currently sitting on that object.');
    const ownerId = placedItemOwner(room.roomId, entityId);
    if (!ownerId) throw new Error('That object is part of the room and cannot be picked up into inventory.');
    if (ownerId !== member.userId && member.role !== 'owner') throw new Error('Only the item owner or room owner can pick that up.');
    const action: WorldAction = { type: 'entity/remove', id: entityId };
    const preview = reduceWorld(room.store.state, action);
    if (preview === room.store.state) throw new Error('Pick up the items resting on this object first.');
    transaction(() => {
      returnPlacedItem(ownerId, room.roomId, entityId);
      saveRoomWorldInTransaction(room.roomId, preview);
    });
    room.store.dispatch(action);
    this.publisher.broadcastWorld(room);
    this.publisher.sendInventory(room, ownerId);
  }

  private persistAction(room: LiveRoom, member: Member, action: WorldAction): void {
    assertEditor(member);
    const preview = reduceWorld(room.store.state, action);
    if (preview === room.store.state) throw new Error('That room edit is not valid.');
    transaction(() => saveRoomWorldInTransaction(room.roomId, preview));
    room.store.dispatch(action);
    if (action.type === 'transform/rotate') this.syncSeatedActors(room, action.id);
    this.publisher.broadcastWorld(room);
  }

  private createTeleportPair(room: LiveRoom, member: Member, first: CellAddress, second: CellAddress): void {
    assertEditor(member);
    if (sameAddress(first, second) || !roomCellAt(room.store.state.topology, first) || !roomCellAt(room.store.state.topology, second)) throw new Error('Choose two different floor tiles.');
    const aId = randomUUID(); const bId = randomUUID();
    const actions: WorldAction[] = [
      { type: 'entity/add', entity: teleporterEntity(aId, bId, first) },
      { type: 'entity/add', entity: teleporterEntity(bId, aId, second) },
    ];
    let preview = room.store.state;
    for (const action of actions) {
      const next = reduceWorld(preview, action);
      if (next === preview) throw new Error('A teleporter does not fit on one of those tiles.');
      preview = next;
    }
    transaction(() => saveRoomWorldInTransaction(room.roomId, preview));
    room.store.dispatchBatch(actions);
    this.publisher.broadcastWorld(room);
  }

  private removeTeleportPair(room: LiveRoom, member: Member, entityId: string): void {
    assertEditor(member);
    const entity = entityById(room.store.state, entityId);
    const targetId = entity?.components.teleporter?.targetEntityId;
    if (!entity || !targetId) throw new Error('Teleport pair not found.');
    const actions: WorldAction[] = [{ type: 'entity/remove', id: entityId }, { type: 'entity/remove', id: targetId }];
    let preview = room.store.state;
    for (const action of actions) preview = reduceWorld(preview, action);
    transaction(() => saveRoomWorldInTransaction(room.roomId, preview));
    room.store.dispatchBatch(actions);
    this.publisher.broadcastWorld(room);
  }

  private syncSeatedActors(room: LiveRoom, seatEntityId: EntityId): void {
    const seatEntity = entityById(room.store.state, seatEntityId);
    if (!seatEntity) return;
    const targets = seatTargetsFor(seatEntity);
    for (const attached of room.members.values()) {
      const actorEntity = entityById(room.store.state, attached.actorId);
      const actor = actorEntity?.components.actor;
      const seatIndex = actor?.seatedOn === seatEntityId && actor.seatIndex !== undefined
        ? actor.seatIndex
        : attached.pendingSeat?.entityId === seatEntityId ? attached.pendingSeat.seatIndex : undefined;
      if (seatIndex === undefined) continue;
      const target = targets[seatIndex];
      if (!target) continue;
      if (actorEntity && actor?.seatedOn === seatEntityId) {
        const actions: WorldAction[] = [];
        const currentCell = { y: actorEntity.components.transform.y, position: actorEntity.components.transform.position };
        if (!sameAddress(currentCell, target.cell)) actions.push({ type: 'transform/move', id: attached.actorId, address: target.cell, validatePlacement: false });
        if (actor.pose !== 'sit' || actor.direction !== target.direction || actor.seatedOn !== seatEntityId || actor.seatIndex !== seatIndex) {
          actions.push({ type: 'component/set', id: attached.actorId, component: 'actor', value: { ...actor, pose: 'sit', direction: target.direction, seatedOn: seatEntityId, seatIndex } });
        }
        if (actions.length) room.store.dispatchBatch(actions);
        attached.motion.syncFromWorld();
      } else attached.motion.sitAt(target, room.store.state);
    }

    for (const assignment of automaticSeatAssignments(room.store.state, seatEntityId)) {
      const attached = [...room.members.values()].find((candidate) => candidate.actorId === assignment.actorId);
      if (!attached || attached.motion.pose !== 'stand') continue;
      if (attached.motion.sitAt(assignment.target, room.store.state)) attached.pendingSeat = null;
    }
  }

  private requireLease(room: LiveRoom, member: Member, leaseId: string): ManipulationLease {
    const lease = room.manipulations.get(leaseId);
    if (!lease || lease.userId !== member.userId) throw new Error('That manipulation lease is no longer active.');
    return lease;
  }
}
