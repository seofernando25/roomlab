import { getEntityPrototype } from '../domain/prototype-registry';
import { spatialProfileForEntity } from '../domain/spatial-index';
import type { CellAddress, EntityId, WorldEntity, WorldState } from '../domain/types';

export interface SeatTarget {
  readonly entityId: EntityId;
  readonly seatIndex: number;
  readonly cell: CellAddress;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly direction: number;
  readonly localX: number;
  readonly localZ: number;
}

export interface SeatVisualPose {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly direction: number;
  readonly cell: CellAddress;
}

export interface AutomaticSeatAssignment {
  readonly actorId: EntityId;
  readonly target: SeatTarget;
}

export function seatTargetFor(entity: WorldEntity, point?: { x: number; z: number }): SeatTarget | null {
  const targets = seatTargetsFor(entity);
  if (!targets.length) return null;
  if (!point) return targets[0] ?? null;
  return targets.reduce((best, target) => distanceSq(target, point) < distanceSq(best, point) ? target : best);
}

export function seatTargetsFor(entity: WorldEntity): readonly SeatTarget[] {
  const prototype = getEntityPrototype(entity.prototypeId);
  const sit = prototype.capabilities?.sit;
  const base = prototype.spatial?.footprint;
  const rotated = spatialProfileForEntity(entity)?.footprint;
  if (!sit || sit.status !== 'implemented' || !base || !rotated || sit.seats.length === 0) return [];
  const transform = entity.components.transform;
  const centerX = transform.position.x + rotated.width / 2;
  const centerZ = transform.position.z + rotated.depth / 2;
  const angle = -transform.rotation * Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return sit.seats.map((seat, seatIndex) => {
    const localX = seat.x - base.width / 2;
    const localZ = seat.z - base.depth / 2;
    const x = centerX + localX * cos + localZ * sin;
    const z = centerZ - localX * sin + localZ * cos;
    return {
      entityId: entity.id,
      seatIndex,
      cell: { y: transform.y, position: { x: Math.floor(x), z: Math.floor(z) } },
      x,
      z,
      height: seat.height,
      direction: (transform.rotation * 2) % 8,
      localX,
      localZ,
    } satisfies SeatTarget;
  });
}

/**
 * Capability-driven rule for furniture settling underneath a standing actor.
 * It does not know about "chairs" by prototype id; any implemented seat can
 * participate, which keeps future benches/vehicles/etc. on the same path.
 */
export function automaticSeatAssignments(state: WorldState, seatEntityId: EntityId): readonly AutomaticSeatAssignment[] {
  const seatEntity = state.entities.find((entity) => entity.id === seatEntityId);
  if (!seatEntity) return [];
  const targets = seatTargetsFor(seatEntity);
  if (!targets.length) return [];

  const occupied = new Set<number>();
  for (const entity of state.entities) {
    const actor = entity.components.actor;
    if (actor?.seatedOn === seatEntityId && actor.seatIndex !== undefined) occupied.add(actor.seatIndex);
  }

  const standing = state.entities
    .filter((entity) => entity.components.actor?.pose === 'stand')
    .sort((a, b) => a.id.localeCompare(b.id));
  const assignedActors = new Set<EntityId>();
  const assignments: AutomaticSeatAssignment[] = [];

  for (const target of targets) {
    if (occupied.has(target.seatIndex)) continue;
    const actor = standing.find((candidate) => {
      if (assignedActors.has(candidate.id)) return false;
      const transform = candidate.components.transform;
      return sameAddress({ y: transform.y, position: transform.position }, target.cell);
    });
    if (!actor) continue;
    assignedActors.add(actor.id);
    assignments.push({ actorId: actor.id, target });
  }
  return assignments;
}

export function seatPoseForVisualTransform(
  target: SeatTarget,
  rootX: number,
  rootY: number,
  rootZ: number,
  rootYaw: number,
  visualLift: number,
): SeatVisualPose {
  const cos = Math.cos(rootYaw);
  const sin = Math.sin(rootYaw);
  const x = rootX + target.localX * cos + target.localZ * sin;
  const z = rootZ - target.localX * sin + target.localZ * cos;
  return {
    x,
    z,
    height: rootY + target.height + visualLift,
    direction: mod8Float(-rootYaw / (Math.PI / 4)),
    cell: { y: target.cell.y, position: { x: Math.floor(x), z: Math.floor(z) } },
  };
}

function mod8Float(value: number): number { return ((value % 8) + 8) % 8; }
function distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}
function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return Math.abs(a.y - b.y) < 0.000001 && a.position.x === b.position.x && a.position.z === b.position.z;
}
