import { getEntityPrototype } from './prototype-registry';
import { absoluteElevation, roomCellAt } from './room-topology';
import type { CellAddress, GridPoint, RotationQuarter, WorldEntity, WorldState } from './types';

export interface TraversalConnection {
  readonly low: CellAddress;
  readonly high: CellAddress;
  readonly riseSteps: number;
}

export function traversalConnectionForEntity(state: WorldState, entity: WorldEntity): TraversalConnection | null {
  const capability = getEntityPrototype(entity.prototypeId).capabilities?.traversal;
  if (!capability || capability.status !== 'implemented') return null;
  const transform = entity.components.transform;
  const low: CellAddress = { levelId: transform.levelId, position: transform.position };
  const lowElevation = absoluteElevation(state.topology, low);
  if (lowElevation === null) return null;

  const delta = directionDelta(transform.rotation);
  const targetPosition = { x: low.position.x + delta.x, z: low.position.z + delta.z };
  const candidates = state.topology.levels.flatMap((level) => {
    const address = { levelId: level.id, position: targetPosition };
    const cell = roomCellAt(state.topology, address);
    const elevation = cell ? absoluteElevation(state.topology, address) : null;
    return elevation === null ? [] : [{ address, elevation }];
  });
  const eligible = candidates
    .map((candidate) => ({ ...candidate, rise: candidate.elevation - lowElevation }))
    .filter((candidate) => candidate.rise > 1 && candidate.rise <= capability.maxRiseSteps)
    .sort((a, b) => a.rise - b.rise);
  const target = eligible[0];
  return target ? { low, high: target.address, riseSteps: target.rise } : null;
}

export function traversalConnectsCells(state: WorldState, a: CellAddress, b: CellAddress): boolean {
  return state.entities.some((entity) => {
    const connection = traversalConnectionForEntity(state, entity);
    if (!connection) return false;
    return (sameAddress(connection.low, a) && sameAddress(connection.high, b))
      || (sameAddress(connection.low, b) && sameAddress(connection.high, a));
  });
}

export function traversalNeighbors(state: WorldState, address: CellAddress): readonly CellAddress[] {
  const result: CellAddress[] = [];
  for (const entity of state.entities) {
    const connection = traversalConnectionForEntity(state, entity);
    if (!connection) continue;
    if (sameAddress(connection.low, address)) result.push(connection.high);
    else if (sameAddress(connection.high, address)) result.push(connection.low);
  }
  return result;
}

export function directionDelta(rotation: RotationQuarter): GridPoint {
  if (rotation === 0) return { x: 0, z: 1 };
  if (rotation === 1) return { x: -1, z: 0 };
  if (rotation === 2) return { x: 0, z: -1 };
  return { x: 1, z: 0 };
}

function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.levelId === b.levelId && a.position.x === b.position.x && a.position.z === b.position.z;
}
