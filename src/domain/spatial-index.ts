import type { OccupancyLayer } from './prototype-components';
import { getEntityPrototype } from './prototype-registry';
import type { CellAddress, EntityId, Footprint, GridPoint, WorldEntity, WorldState } from './types';

export interface SpatialOccupant {
  readonly entityId: EntityId;
  readonly layer: OccupancyLayer;
  readonly elevation: number;
}

export class SpatialIndex {
  readonly #cells = new Map<string, SpatialOccupant[]>();

  static fromWorld(state: WorldState): SpatialIndex {
    const index = new SpatialIndex();
    for (const entity of state.entities) index.add(entity);
    return index;
  }

  entitiesAt(address: CellAddress): readonly SpatialOccupant[] {
    return this.#cells.get(addressKey(address)) ?? [];
  }

  entityIdsAt(address: CellAddress): readonly EntityId[] {
    return this.entitiesAt(address).map((entry) => entry.entityId);
  }

  occupantsForCells(levelId: string, cells: readonly GridPoint[]): readonly SpatialOccupant[] {
    const unique = new Map<EntityId, SpatialOccupant>();
    for (const position of cells) {
      for (const occupant of this.entitiesAt({ levelId, position })) unique.set(occupant.entityId, occupant);
    }
    return [...unique.values()];
  }

  private add(entity: WorldEntity): void {
    const spatial = spatialProfileForEntity(entity);
    if (!spatial) return;
    const transform = entity.components.transform;
    for (const position of occupiedCells(transform.position, spatial.footprint)) {
      const key = addressKey({ levelId: transform.levelId, position });
      const entries = this.#cells.get(key) ?? [];
      entries.push({ entityId: entity.id, layer: spatial.layer, elevation: entityElevationSteps(entity) });
      this.#cells.set(key, entries);
    }
  }
}

export interface EntitySpatialProfile {
  readonly footprint: Footprint;
  readonly layer: OccupancyLayer;
  readonly conflictsWith: readonly OccupancyLayer[];
  readonly canStack: boolean;
}

export function spatialProfileForEntity(entity: WorldEntity): EntitySpatialProfile | null {
  const prototype = getEntityPrototype(entity.prototypeId);
  const spatial = prototype.spatial;
  if (!spatial) return null;
  const rotation = entity.components.transform.rotation;
  const footprint = spatial.rotatesWithEntity && rotation % 2 === 1
    ? { width: spatial.footprint.depth, depth: spatial.footprint.width }
    : spatial.footprint;
  return { footprint, layer: spatial.occupancyLayer, conflictsWith: spatial.conflictsWith, canStack: spatial.canStack ?? false };
}

export function occupiedCells(origin: GridPoint, footprint: Footprint): readonly GridPoint[] {
  const cells: GridPoint[] = [];
  for (let z = 0; z < footprint.depth; z += 1) {
    for (let x = 0; x < footprint.width; x += 1) cells.push({ x: origin.x + x, z: origin.z + z });
  }
  return cells;
}

export function addressKey(address: CellAddress): string {
  return `${address.levelId}:${address.position.x},${address.position.z}`;
}

export function cellKey(cell: GridPoint): string { return `${cell.x},${cell.z}`; }

export function entityElevationSteps(entity: WorldEntity): number { return entity.components.transform.elevation ?? 0; }
