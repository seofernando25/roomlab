import { randomUUID } from 'node:crypto';
import { entityById } from '../src/domain/entity-queries';
import { GameStore } from '../src/domain/game-store';
import { ActorMotionSystem } from '../src/gameplay/actor-motion-system';
import { createRoomSimulation } from '../src/gameplay/simulation-pipeline';
import type { AccountDto, JoinRoomDto, RoomClientMessage, RoomId, RoomServerMessage, UserId } from '../src/online/types';
import { inventoryPrototypeSet } from './economy-service';
import { LiveRoomCommands, type CommandPublisher } from './live-room-commands';
import type { JoinTicket, LiveRoom, ManipulationLease, Member, RoomTransport } from './live-room-model';
import { accessForActor, accessProviderFor, actorEntity, actorEventKey, spawnCell } from './live-room-model';
import { canJoinRoom, loadRoomWorld, recordRoomJoin, roomDetail, roomNameById, roomRole } from './room-repository';

export class LiveRoomManager implements CommandPublisher {
  readonly #rooms = new Map<RoomId, LiveRoom>();
  readonly #tickets = new Map<string, JoinTicket>();
  readonly #commands = new LiveRoomCommands(this);
  readonly #tickHandle: ReturnType<typeof setInterval>;

  constructor() { this.#tickHandle = setInterval(() => this.tick(), 50); }
  dispose(): void { clearInterval(this.#tickHandle); this.#rooms.clear(); this.#tickets.clear(); }

  prepareJoin(account: AccountDto, roomId: RoomId): JoinRoomDto {
    if (!canJoinRoom(roomId, account.id)) throw new Error('You cannot join that room.');
    const room = this.room(roomId);
    const detail = roomDetail(roomId, account.id, (id) => this.userCount(id));
    if (!detail) throw new Error('Room not found.');
    if (room.members.size >= detail.maxUsers) throw new Error('That room is full.');

    const memberId = randomUUID();
    const roomSessionId = randomUUID();
    const actorId = `actor:${account.id}:${roomSessionId.slice(0, 8)}`;
    const spawn = spawnCell(room.store.state, actorId);
    if (!room.store.dispatch({ type: 'entity/add', entity: actorEntity(actorId, spawn) }).accepted) throw new Error('Could not enter the room.');
    const motion = new ActorMotionSystem(room.store, actorId, accessProviderFor(room, actorId));
    const member: Member = {
      id: memberId,
      userId: account.id,
      username: account.username,
      actorId,
      roomSessionId,
      role: roomRole(roomId, account.id),
      inventory: inventoryPrototypeSet(account.id),
      motion,
      transport: null,
      lastClientSequence: -1,
      commands: new Map(),
      lastActorKey: '',
      pendingSeat: null,
    };
    room.members.set(memberId, member);

    const ticketId = randomUUID();
    this.#tickets.set(ticketId, { id: ticketId, roomId, userId: account.id, memberId, expiresAt: Date.now() + 30_000 });
    recordRoomJoin(account.id, roomId);
    return {
      room: detail,
      roomSessionId,
      actorId,
      snapshot: room.store.state,
      serverSequence: room.sequence,
      websocketPath: `/ws/rooms/${roomId}?ticket=${encodeURIComponent(ticketId)}`,
    };
  }

  attach(ticketId: string, userId: UserId, transport: RoomTransport): boolean {
    const ticket = this.#tickets.get(ticketId);
    if (!ticket || ticket.userId !== userId || ticket.expiresAt < Date.now()) return false;
    this.#tickets.delete(ticketId);
    const room = this.#rooms.get(ticket.roomId);
    const member = room?.members.get(ticket.memberId);
    if (!room || !member) return false;
    member.transport = transport;
    transport.send({ type: 'hello', roomSessionId: member.roomSessionId, serverSequence: room.sequence, actorId: member.actorId, snapshot: room.store.state });
    this.broadcastWorld(room);
    this.broadcastPresence(room);
    return true;
  }

  detach(transportId: string): void {
    const found = this.memberForTransport(transportId);
    if (!found) return;
    const { room, member } = found;
    for (const lease of [...room.manipulations.values()]) if (lease.userId === member.userId) this.#commands.cancelLease(room, lease);
    room.members.delete(member.id);
    room.store.dispatch({ type: 'entity/remove', id: member.actorId });
    this.broadcastWorld(room);
    this.broadcastPresence(room);
    if (room.members.size === 0) this.#rooms.delete(room.roomId);
  }

  handle(transportId: string, message: RoomClientMessage): void {
    const found = this.memberForTransport(transportId);
    if (!found) return;
    const { room, member } = found;
    const prior = member.commands.get(message.clientCommandId);
    if (prior !== undefined) { this.ack(room, member, message.clientCommandId, prior); return; }
    if (message.clientSequence <= member.lastClientSequence) { this.reject(room, member, message.clientCommandId, 'Out-of-order command.'); return; }
    member.lastClientSequence = message.clientSequence;
    try {
      this.#commands.execute(room, member, message);
      member.commands.set(message.clientCommandId, room.sequence);
      while (member.commands.size > 200) member.commands.delete(member.commands.keys().next().value!);
      this.ack(room, member, message.clientCommandId, room.sequence);
    } catch (error) {
      this.reject(room, member, message.clientCommandId, error instanceof Error ? error.message : 'Command rejected.');
    }
  }

  userCount(roomId: RoomId): number {
    return [...(this.#rooms.get(roomId)?.members.values() ?? [])].filter((member) => member.transport).length;
  }

  presence(userId: UserId): { online: boolean; roomId: RoomId | null; roomName: string | null } {
    for (const room of this.#rooms.values()) {
      if ([...room.members.values()].some((member) => member.userId === userId && member.transport)) {
        return { online: true, roomId: room.roomId, roomName: roomNameById(room.roomId) };
      }
    }
    return { online: false, roomId: null, roomName: null };
  }

  refreshUserRole(roomId: RoomId, userId: UserId): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    const role = roomRole(roomId, userId);
    for (const member of room.members.values()) {
      if (member.userId !== userId) continue;
      member.role = role;
      member.transport?.send({ type: 'role', roomSessionId: member.roomSessionId, serverSequence: room.sequence, role });
    }
  }

  broadcastWorld(room: LiveRoom): void {
    this.broadcast(room, (sessionId, sequence) => ({ type: 'world', roomSessionId: sessionId, serverSequence: sequence, snapshot: room.store.state }));
  }

  broadcastManipulation(room: LiveRoom, member: Member, lease: ManipulationLease, transform: ManipulationLease['original'], lift: number): void {
    this.broadcast(room, (sessionId, sequence) => ({
      type: 'manipulation', roomSessionId: sessionId, serverSequence: sequence, manipulationId: lease.id, userId: member.userId,
      pose: { entityId: lease.entityId, transform, lift },
    }));
  }

  broadcastManipulationEnd(room: LiveRoom, lease: ManipulationLease): void {
    this.broadcast(room, (sessionId, sequence) => ({ type: 'manipulation-end', roomSessionId: sessionId, serverSequence: sequence, manipulationId: lease.id, entityId: lease.entityId }));
  }

  private room(roomId: RoomId): LiveRoom {
    const existing = this.#rooms.get(roomId);
    if (existing) return existing;
    const store = new GameStore(loadRoomWorld(roomId));
    const room: LiveRoom = { roomId, store, members: new Map(), manipulations: new Map(), sequence: 0, simulation: null as never };
    room.simulation = createRoomSimulation(store, (actorId, state) => accessForActor(room, actorId, state));
    this.#rooms.set(roomId, room);
    return room;
  }

  private broadcastPresence(room: LiveRoom): void {
    const users = [...room.members.values()].filter((member) => member.transport).map((member) => ({ userId: member.userId, username: member.username, actorId: member.actorId }));
    this.broadcast(room, (sessionId, sequence) => ({ type: 'presence', roomSessionId: sessionId, serverSequence: sequence, users }));
  }

  private broadcast(room: LiveRoom, create: (sessionId: string, sequence: number) => RoomServerMessage): void {
    room.sequence += 1;
    for (const member of room.members.values()) if (member.transport) member.transport.send(create(member.roomSessionId, room.sequence));
  }

  private ack(room: LiveRoom, member: Member, commandId: string, sequence: number): void {
    member.transport?.send({ type: 'ack', roomSessionId: member.roomSessionId, serverSequence: sequence, clientCommandId: commandId });
  }

  private reject(room: LiveRoom, member: Member, commandId: string, reason: string): void {
    member.transport?.send({ type: 'rejected', roomSessionId: member.roomSessionId, serverSequence: room.sequence, clientCommandId: commandId, reason, snapshot: room.store.state });
  }

  private memberForTransport(transportId: string): { room: LiveRoom; member: Member } | null {
    for (const room of this.#rooms.values()) for (const member of room.members.values()) if (member.transport?.id === transportId) return { room, member };
    return null;
  }

  private tick(): void {
    const now = Date.now();
    for (const [id, ticket] of this.#tickets) if (ticket.expiresAt < now) { this.#tickets.delete(id); this.removePending(ticket); }
    for (const room of this.#rooms.values()) {
      room.simulation.update(0.05);
      for (const member of room.members.values()) {
        member.motion.update(0.05);
        if (!member.transport) continue;
        const key = actorEventKey(room.store, member.actorId);
        if (!key || key === member.lastActorKey) continue;
        member.lastActorKey = key;
        const entity = entityById(room.store.state, member.actorId)!;
        const actor = entity.components.actor!;
        this.broadcast(room, (sessionId, sequence) => ({
          type: 'actor', roomSessionId: sessionId, serverSequence: sequence, actorId: entity.id, transform: entity.components.transform,
          pose: actor.pose, direction: actor.direction,
          ...(actor.seatedOn ? { seatedOn: actor.seatedOn } : {}), ...(actor.seatIndex === undefined ? {} : { seatIndex: actor.seatIndex }),
        }));
      }
      for (const lease of [...room.manipulations.values()]) if (lease.expiresAt < now) this.#commands.cancelLease(room, lease);
    }
  }

  private removePending(ticket: JoinTicket): void {
    const room = this.#rooms.get(ticket.roomId);
    const member = room?.members.get(ticket.memberId);
    if (!room || !member || member.transport) return;
    room.members.delete(member.id);
    room.store.dispatch({ type: 'entity/remove', id: member.actorId });
    if (room.members.size === 0) this.#rooms.delete(room.roomId);
  }
}
