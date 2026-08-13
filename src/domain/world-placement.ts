import { getEntityPrototype } from './prototype-registry';
import { FLOOR_STEP_HEIGHT, roomCellAt, roomLevel, wallBetween } from './room-topology';
import { SpatialIndex, entityElevationSteps, occupiedCells, spatialProfileForEntity } from './spatial-index';
import type { CellAddress, EntityId, GridPoint, RoomLevelId, RotationQuarter, WorldEntity, WorldState } from './types';

export function centeredCellForPoint(point: GridPoint, footprint: { width: number; depth: number }): GridPoint {
  return { x: Math.round(point.x - footprint.width / 2), z: Math.round(point.z - footprint.depth / 2) };
}

export function isValidEntityPlacement(state: WorldState, candidate: WorldEntity): boolean {
  const profile = spatialProfileForEntity(candidate);
  if (!profile) return true;
  const transform = candidate.components.transform;
  if (!roomLevel(state.topology, transform.levelId)) return false;
  const stackElevation = entityElevationSteps(candidate);
  if (!Number.isFinite(stackElevation) || stackElevation < 0) return false;
  if (stackElevation > 0 && !profile.canStack) return false;
  const cells = occupiedCells(transform.position, profile.footprint);
  const roomCells = cells.map((position) => roomCellAt(state.topology, { levelId: transform.levelId, position }));
  if (roomCells.some((cell) => !cell)) return false;
  const floorElevation = roomCells[0]!.elevation;
  if (roomCells.some((cell) => cell!.elevation !== floorElevation)) return false;
  if (footprintCrossesWall(state, transform.levelId, cells)) return false;

  const index = SpatialIndex.fromWorld(state);
  const byId = new Map(state.entities.map((entity) => [entity.id, entity]));
  if (stackElevation > 0 && !cells.every((position) => hasSupportAt(index, byId, candidate, position, stackElevation))) return false;

  for (const occupant of index.occupantsForCells(transform.levelId, cells)) {
    if (occupant.entityId === candidate.id || Math.abs(occupant.elevation - stackElevation) > 0.000001) continue;
    const other = byId.get(occupant.entityId);
    if (!other) continue;
    const otherProfile = spatialProfileForEntity(other);
    if (!otherProfile) continue;
    if (profile.conflictsWith.includes(otherProfile.layer) || otherProfile.conflictsWith.includes(profile.layer)) return false;
  }
  return true;
}

/** Resolves a click/drag placement onto the highest common valid support plane. */
export function resolveSupportedPlacement(state: WorldState, candidate: WorldEntity): WorldEntity | null {
  const profile = spatialProfileForEntity(candidate);
  if (!profile) return candidate;
  const transform = candidate.components.transform;
  const cells = occupiedCells(transform.position, profile.footprint);
  const elevations = new Set<number>([0]);
  if (profile.canStack && cells.length) {
    const index = SpatialIndex.fromWorld(state);
    const byId = new Map(state.entities.map((entity) => [entity.id, entity]));
    let common: Set<number> | null = null;
    for (const position of cells) {
      const tops = new Set<number>();
      for (const occupant of index.entitiesAt({ levelId: transform.levelId, position })) {
        if (occupant.entityId === candidate.id) continue;
        const support = byId.get(occupant.entityId);
        if (!support) continue;
        const top = supportTopElevationSteps(support);
        if (top !== null) tops.add(top);
      }
      common = common === null ? tops : new Set<number>([...common].filter((value: number) => tops.has(value)));
    }
    for (const value of common ?? []) elevations.add(value);
  }
  for (const elevation of [...elevations].sort((a, b) => b - a)) {
    const { elevation: _previousElevation, ...baseTransform } = transform;
    const resolved: WorldEntity = {
      ...candidate,
      components: { ...candidate.components, transform: elevation === 0 ? baseTransform : { ...baseTransform, elevation } },
    };
    if (isValidEntityPlacement(state, resolved)) return resolved;
  }
  return null;
}

export function findOpenCell(state: WorldState, entity: WorldEntity): CellAddress | null {
  const transform = entity.components.transform;
  const level = roomLevel(state.topology, transform.levelId);
  if (!level) return null;
  const cells = [...level.cells].sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x);
  const { elevation: _oldElevation, ...baseTransform } = transform;
  for (const cell of cells) {
    const candidate: WorldEntity = { ...entity, components: { ...entity.components, transform: { ...baseTransform, position: cell.position } } };
    if (isValidEntityPlacement(state, candidate)) return { levelId: transform.levelId, position: cell.position };
  }
  for (const cell of cells) {
    const candidate: WorldEntity = { ...entity, components: { ...entity.components, transform: { ...baseTransform, position: cell.position } } };
    if (resolveSupportedPlacement(state, candidate)) return { levelId: transform.levelId, position: cell.position };
  }
  return null;
}

export function findOpenCellForObject(state: WorldState, prototypeId: string, levelId: RoomLevelId, rotation: RotationQuarter = 0): CellAddress | null {
  const probe: WorldEntity = { id: `placement-probe:${prototypeId}`, prototypeId, components: { transform: { levelId, position: { x: 0, z: 0 }, rotation } } };
  return findOpenCell(state, probe);
}

function supportTopElevationSteps(entity: WorldEntity): number | null {
  const surface = getEntityPrototype(entity.prototypeId).capabilities?.surface;
  if (!surface || surface.status !== 'implemented' || !surface.acceptsFurni) return null;
  return normalizeElevation(entityElevationSteps(entity) + Math.max(FLOOR_STEP_HEIGHT, surface.height) / FLOOR_STEP_HEIGHT);
}

function hasSupportAt(index: SpatialIndex, byId: ReadonlyMap<EntityId, WorldEntity>, candidate: WorldEntity, position: GridPoint, elevation: number): boolean {
  return index.entitiesAt({ levelId: candidate.components.transform.levelId, position }).some((occupant) => {
    if (occupant.entityId === candidate.id) return false;
    const support = byId.get(occupant.entityId);
    return Boolean(support && Math.abs((supportTopElevationSteps(support) ?? Number.POSITIVE_INFINITY) - elevation) <= 0.000001);
  });
}

function footprintCrossesWall(state: WorldState, levelId: RoomLevelId, cells: readonly GridPoint[]): boolean {
  const keys = new Set(cells.map((cell) => `${cell.x},${cell.z}`));
  for (const position of cells) {
    for (const neighbor of [{ x: position.x + 1, z: position.z }, { x: position.x, z: position.z + 1 }]) {
      if (keys.has(`${neighbor.x},${neighbor.z}`) && wallBetween(state.topology, { levelId, position }, { levelId, position: neighbor })) return true;
    }
  }
  return false;
}

function normalizeElevation(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
