import { getEntityPrototype } from '../domain/prototype-registry';
import { spatialProfileForEntity } from '../domain/spatial-index';
import type { CellAddress, EntityId, WorldEntity } from '../domain/types';

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
      cell: { levelId: transform.levelId, position: { x: Math.floor(x), z: Math.floor(z) } },
      x,
      z,
      height: seat.height,
      direction: (transform.rotation * 2) % 8,
      localX,
      localZ,
    } satisfies SeatTarget;
  });
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
    cell: { levelId: target.cell.levelId, position: { x: Math.floor(x), z: Math.floor(z) } },
  };
}

function mod8Float(value: number): number { return ((value % 8) + 8) % 8; }
function distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}
