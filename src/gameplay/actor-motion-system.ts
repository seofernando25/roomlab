import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import type { InteractionAccessProvider } from '../domain/interaction-types';
import { floorWorldY } from '../domain/room-topology';
import type { ActorComponent, ActorPose, CellAddress, EntityId, WorldState } from '../domain/types';
import { directionForStep, findActorPath } from './navigation-system';
import { seatTargetsFor, type SeatTarget, type SeatVisualPose } from './seating-system';
import { teleportDestination } from './teleport-system';

const WALK_SPEED = 2.7;

export interface ActorVisualPose {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly direction: number;
  readonly pose: ActorPose;
}

export class ActorMotionSystem {
  readonly #store: GameStore;
  readonly #actorId: EntityId;
  readonly #accessProvider: InteractionAccessProvider;
  #cell: CellAddress;
  #path: CellAddress[] = [];
  #seatTarget: SeatTarget | null = null;
  #teleportSourceId: EntityId | null = null;
  #seatedTarget: SeatTarget | null = null;
  #seatedOn: EntityId | null = null;
  #x: number;
  #z: number;
  #elevation = 0;
  #direction: number;
  #pose: ActorPose;

  constructor(store: GameStore, actorId: EntityId, accessProvider: InteractionAccessProvider) {
    this.#store = store;
    this.#actorId = actorId;
    this.#accessProvider = accessProvider;
    const entity = entityById(store.state, actorId);
    const actor = entity?.components.actor;
    if (!entity || !actor) throw new Error(`Actor ${actorId} is missing from world state.`);
    const transform = entity.components.transform;
    this.#cell = { y: transform.y, position: { ...transform.position } };
    this.#x = this.#cell.position.x + 0.5;
    this.#z = this.#cell.position.z + 0.5;
    this.#direction = actor.direction;
    this.#pose = actor.pose;
    this.#seatedOn = actor.seatedOn ?? null;
    this.#elevation = floorWorldY(store.state.topology, this.#cell);
  }

  get actorId(): EntityId { return this.#actorId; }
  get cell(): CellAddress { return this.#cell; }
  get pose(): ActorPose { return this.#pose; }
  get direction(): number { return this.#direction; }
  get seatedOn(): EntityId | null { return this.#seatedOn; }
  get seatedTarget(): SeatTarget | null { return this.#seatedTarget; }
  get moving(): boolean { return this.#path.length > 0 || this.#pose === 'walk'; }
  get visualPose(): ActorVisualPose {
    return { x: this.#x, z: this.#z, y: this.#elevation, direction: this.#direction, pose: this.#pose };
  }

  moveTo(target: CellAddress, state: WorldState): boolean {
    const path = findActorPath(state, this.#actorId, this.#cell, target, false, this.#accessProvider(this.#actorId, state));
    if (!path) return false;
    this.beginPath(path, null);
    return true;
  }

  sitAt(target: SeatTarget, state: WorldState): boolean {
    const current = this.actorState();
    if (current?.pose === 'sit' && current.seatedOn === target.entityId && current.seatIndex === target.seatIndex) return false;
    const path = findActorPath(state, this.#actorId, this.#cell, target.cell, true, this.#accessProvider(this.#actorId, state));
    if (!path) return false;
    if (path.length === 0) { this.finishSeat(target); return true; }
    this.beginPath(path, target);
    return true;
  }

  useTeleporter(sourceId: EntityId, state: WorldState): boolean {
    const source = entityById(state, sourceId);
    if (!source || !teleportDestination(state, sourceId)) return false;
    const sourceTransform = source.components.transform;
    const sourceAddress = { y: sourceTransform.y, position: sourceTransform.position };
    const path = findActorPath(state, this.#actorId, this.#cell, sourceAddress, false, this.#accessProvider(this.#actorId, state));
    if (!path) return false;
    if (path.length === 0) return this.finishTeleport(sourceId);
    this.beginPath(path, null);
    this.#teleportSourceId = sourceId;
    return true;
  }

  cancelMovement(): void {
    this.#path = [];
    this.#seatTarget = null;
    this.#teleportSourceId = null;
    if (this.#pose === 'walk') this.setPose('stand');
  }

  stand(): void {
    this.cancelMovement();
    this.#seatedTarget = null;
    this.#seatedOn = null;
    this.#x = this.#cell.position.x + 0.5;
    this.#z = this.#cell.position.z + 0.5;
    this.#elevation = floorWorldY(this.#store.state.topology, this.#cell);
    this.#pose = 'stand';
    this.updateActor({ pose: 'stand' }, null);
  }

  teleportTo(destination: CellAddress, direction = this.#direction): boolean {
    if (!this.actorState()) return false;
    const result = this.#store.dispatchBatch([
      { type: 'transform/move', id: this.#actorId, address: destination, validatePlacement: false },
      { type: 'component/set', id: this.#actorId, component: 'actor', value: { pose: 'stand', direction } },
    ]);
    if (!result.accepted) return false;
    this.#path = [];
    this.#seatTarget = null;
    this.#teleportSourceId = null;
    this.#seatedTarget = null;
    this.#seatedOn = null;
    this.#cell = cloneAddress(destination);
    this.#x = destination.position.x + 0.5;
    this.#z = destination.position.z + 0.5;
    this.#elevation = floorWorldY(this.#store.state.topology, destination);
    this.#direction = direction;
    this.#pose = 'stand';
    return true;
  }

  /** Reconcile visual motion after an authoritative snapshot replaces local prediction. */
  syncFromWorld(): void {
    const entity = entityById(this.#store.state, this.#actorId);
    const actor = entity?.components.actor;
    if (!entity || !actor) return;
    this.#path = [];
    this.#seatTarget = null;
    this.#teleportSourceId = null;
    const transform = entity.components.transform;
    this.#cell = { y: transform.y, position: { ...transform.position } };
    this.#direction = actor.direction;
    this.#pose = actor.pose;
    this.#seatedOn = actor.seatedOn ?? null;
    this.#seatedTarget = null;
    this.#elevation = floorWorldY(this.#store.state.topology, this.#cell);
    if (actor.seatedOn && actor.seatIndex !== undefined) {
      const seatEntity = entityById(this.#store.state, actor.seatedOn);
      const seat = seatEntity ? seatTargetsFor(seatEntity)[actor.seatIndex] : undefined;
      if (seat) {
        this.#seatedTarget = seat;
        this.#x = seat.x;
        this.#z = seat.z;
        this.#elevation = floorWorldY(this.#store.state.topology, seat.cell) + seat.height;
        return;
      }
    }
    this.#x = this.#cell.position.x + 0.5;
    this.#z = this.#cell.position.z + 0.5;
  }

  syncFloorElevation(): void {
    if (this.#pose === 'stand' && !this.#seatedOn && this.#path.length === 0) {
      this.#elevation = floorWorldY(this.#store.state.topology, this.#cell);
    }
  }

  update(deltaSeconds: number): void {
    let remaining = WALK_SPEED * deltaSeconds;
    while (remaining > 0 && this.#path.length > 0) {
      const next = this.#path[0]!;
      const targetX = next.position.x + 0.5;
      const targetZ = next.position.z + 0.5;
      const targetY = floorWorldY(this.#store.state.topology, next);
      const dx = targetX - this.#x;
      const dz = targetZ - this.#z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.0001) this.setDirection(directionForStep(this.#cell.position, next.position));
      if (distance > remaining) {
        const ratio = remaining / Math.max(distance, 0.0001);
        this.#x += (dx / Math.max(distance, 0.0001)) * remaining;
        this.#z += (dz / Math.max(distance, 0.0001)) * remaining;
        this.#elevation += (targetY - this.#elevation) * ratio;
        break;
      }
      this.#x = targetX;
      this.#z = targetZ;
      this.#elevation = targetY;
      this.#cell = next;
      this.#path.shift();
      this.#store.dispatch({ type: 'transform/move', id: this.#actorId, address: next, validatePlacement: false });
      remaining -= distance;
    }
    if (this.#path.length === 0 && this.#pose === 'walk') {
      if (this.#seatTarget) this.finishSeat(this.#seatTarget);
      else if (this.#teleportSourceId) this.finishTeleport(this.#teleportSourceId);
      else this.setPose('stand');
    }
  }

  followSeatedVisual(pose: SeatVisualPose): void {
    if (!this.#seatedOn || this.#pose !== 'sit') return;
    const cellChanged = !sameAddress(pose.cell, this.#cell);
    this.#cell = pose.cell;
    this.#x = pose.x;
    this.#z = pose.z;
    this.#direction = pose.direction;
    this.#elevation = pose.height;
    if (cellChanged) this.#store.dispatch({ type: 'transform/move', id: this.#actorId, address: pose.cell, validatePlacement: false });
    const roundedDirection = mod8(Math.round(pose.direction));
    const actor = this.actorState();
    if (actor && mod8(Math.round(actor.direction)) !== roundedDirection) this.updateActor({ direction: roundedDirection });
  }

  private beginPath(path: readonly CellAddress[], seatTarget: SeatTarget | null): void {
    this.#path = [...path];
    this.#seatTarget = seatTarget;
    this.#teleportSourceId = null;
    this.#seatedTarget = null;
    this.#seatedOn = null;
    this.#elevation = floorWorldY(this.#store.state.topology, this.#cell);
    this.#pose = path.length > 0 ? 'walk' : 'stand';
    this.updateActor({ pose: this.#pose }, null);
  }

  private finishSeat(target: SeatTarget): void {
    const result = this.#store.dispatchBatch([
      { type: 'transform/move', id: this.#actorId, address: target.cell, validatePlacement: false },
      {
        type: 'component/set', id: this.#actorId, component: 'actor',
        value: { pose: 'sit', direction: target.direction, seatedOn: target.entityId, seatIndex: target.seatIndex },
      },
    ]);
    if (!result.accepted) return;
    this.#path = [];
    this.#seatTarget = null;
    this.#seatedTarget = target;
    this.#seatedOn = target.entityId;
    this.#cell = cloneAddress(target.cell);
    this.#x = target.x;
    this.#z = target.z;
    this.#direction = target.direction;
    this.#elevation = floorWorldY(this.#store.state.topology, target.cell) + target.height;
    this.#pose = 'sit';
  }

  private finishTeleport(sourceId: EntityId): boolean {
    const destination = teleportDestination(this.#store.state, sourceId);
    if (!destination) { this.#teleportSourceId = null; this.setPose('stand'); return false; }
    return this.teleportTo(destination);
  }

  private setDirection(direction: number): void {
    this.#direction = direction;
    const actor = this.actorState();
    if (actor && actor.direction !== direction) this.updateActor({ direction });
  }
  private setPose(pose: ActorPose): void {
    this.#pose = pose;
    const actor = this.actorState();
    if (actor && actor.pose !== pose) this.updateActor({ pose });
  }
  private actorState(): ActorComponent | null {
    return entityById(this.#store.state, this.#actorId)?.components.actor ?? null;
  }
  private updateActor(
    patch: Partial<Pick<ActorComponent, 'pose' | 'direction'>>,
    seat: { readonly entityId: EntityId; readonly seatIndex: number } | null | undefined = undefined,
  ): void {
    const current = this.actorState();
    if (!current) return;
    const next: ActorComponent = {
      pose: patch.pose ?? current.pose,
      direction: patch.direction ?? current.direction,
      ...(seat === null ? {} : seat ? { seatedOn: seat.entityId, seatIndex: seat.seatIndex }
        : current.seatedOn && current.seatIndex !== undefined ? { seatedOn: current.seatedOn, seatIndex: current.seatIndex } : {}),
    };
    this.#store.dispatch({ type: 'component/set', id: this.#actorId, component: 'actor', value: next });
  }
}

function cloneAddress(address: CellAddress): CellAddress {
  return { y: address.y, position: { ...address.position } };
}
function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.y === b.y && a.position.x === b.position.x && a.position.z === b.position.z;
}
function mod8(value: number): number { return ((value % 8) + 8) % 8; }
