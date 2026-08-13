import type { InteractionAccessContext } from '../domain/interaction-types';
import { absoluteElevation, canTraverseTopologyEdge, roomCellAt } from '../domain/room-topology';
import { SpatialIndex, addressKey } from '../domain/spatial-index';
import { traversalNeighbors } from '../domain/traversal-links';
import type { CellAddress, EntityId, GridPoint, WorldState } from '../domain/types';
import { canTraverseBetween, canTraverseCell } from './traversal-system';

const NEIGHBORS = [
  { x: 0, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 0 }, { x: 1, z: 1 },
  { x: 0, z: 1 }, { x: -1, z: 1 }, { x: -1, z: 0 }, { x: -1, z: -1 },
] as const;

export function directionForStep(from: GridPoint, to: GridPoint): number {
  const dx = Math.sign(to.x - from.x);
  const dz = Math.sign(to.z - from.z);
  if (dx === 0 && dz < 0) return 0;
  if (dx > 0 && dz < 0) return 1;
  if (dx > 0 && dz === 0) return 2;
  if (dx > 0 && dz > 0) return 3;
  if (dx === 0 && dz > 0) return 4;
  if (dx < 0 && dz > 0) return 5;
  if (dx < 0 && dz === 0) return 6;
  return 7;
}

export function findActorPath(
  state: WorldState,
  actorId: EntityId,
  start: CellAddress,
  target: CellAddress,
  allowBlockedTarget = false,
  access?: InteractionAccessContext,
): readonly CellAddress[] | null {
  const index = SpatialIndex.fromWorld(state);
  if (!roomCellAt(state.topology, target)) return null;
  const context = { actorId, state, index, ...(access ? { access } : {}) };
  if (!allowBlockedTarget && !canTraverseCell(context, target)) return null;
  if (sameAddress(start, target)) return [];

  const open = new Set<string>([addressKey(start)]);
  const cameFrom = new Map<string, CellAddress>();
  const g = new Map<string, number>([[addressKey(start), 0]]);
  const cells = new Map<string, CellAddress>([[addressKey(start), start]]);

  while (open.size > 0) {
    const currentKey = lowest(open, g, cells, target, state);
    const current = cells.get(currentKey)!;
    if (sameAddress(current, target)) return reconstruct(cameFrom, current, start);
    open.delete(currentKey);

    for (const next of neighborsFor(state, current)) {
      const isTarget = sameAddress(next, target);
      if (isTarget && allowBlockedTarget) {
        if (!canTraverseTopologyEdge(state.topology, current, next)
          && !traversalNeighbors(state, current).some((candidate) => sameAddress(candidate, next))) continue;
      } else if (!canTraverseBetween(context, current, next)) continue;
      if (isDiagonalSameLevel(current, next) && !canCutCorner(current, next, context, target, allowBlockedTarget)) continue;
      const nextKey = addressKey(next);
      const cost = (g.get(currentKey) ?? Infinity) + movementCost(current, next, state);
      if (cost >= (g.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, current);
      g.set(nextKey, cost);
      cells.set(nextKey, next);
      open.add(nextKey);
    }
  }
  return null;
}

function neighborsFor(state: WorldState, current: CellAddress): readonly CellAddress[] {
  const planar = NEIGHBORS.flatMap((delta) => {
    const next = {
      levelId: current.levelId,
      position: { x: current.position.x + delta.x, z: current.position.z + delta.z },
    };
    return roomCellAt(state.topology, next) ? [next] : [];
  });
  const unique = new Map<string, CellAddress>();
  for (const address of [...planar, ...traversalNeighbors(state, current)]) unique.set(addressKey(address), address);
  return [...unique.values()];
}

function canCutCorner(
  current: CellAddress,
  next: CellAddress,
  context: Parameters<typeof canTraverseBetween>[0],
  target: CellAddress,
  allowBlockedTarget: boolean,
): boolean {
  const dx = Math.sign(next.position.x - current.position.x);
  const dz = Math.sign(next.position.z - current.position.z);
  const sides = [
    { levelId: current.levelId, position: { x: current.position.x + dx, z: current.position.z } },
    { levelId: current.levelId, position: { x: current.position.x, z: current.position.z + dz } },
  ];
  return sides.every((side) => (allowBlockedTarget && sameAddress(side, target)) || canTraverseBetween(context, current, side));
}

function reconstruct(cameFrom: ReadonlyMap<string, CellAddress>, end: CellAddress, start: CellAddress): CellAddress[] {
  const result: CellAddress[] = [];
  let current = end;
  while (!sameAddress(current, start)) {
    result.push(current);
    const previous = cameFrom.get(addressKey(current));
    if (!previous) return [];
    current = previous;
  }
  return result.reverse();
}

function lowest(
  open: ReadonlySet<string>,
  g: ReadonlyMap<string, number>,
  cells: ReadonlyMap<string, CellAddress>,
  target: CellAddress,
  state: WorldState,
): string {
  let best = '';
  let bestScore = Infinity;
  for (const candidate of open) {
    const address = cells.get(candidate)!;
    const planar = Math.max(Math.abs(target.position.x - address.position.x), Math.abs(target.position.z - address.position.z));
    const fromElevation = absoluteElevation(state.topology, address) ?? 0;
    const targetElevation = absoluteElevation(state.topology, target) ?? fromElevation;
    const score = (g.get(candidate) ?? Infinity) + planar + Math.abs(targetElevation - fromElevation) * 0.25;
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

function movementCost(from: CellAddress, to: CellAddress, state: WorldState): number {
  if (from.levelId !== to.levelId) return 1.35;
  const diagonal = from.position.x !== to.position.x && from.position.z !== to.position.z;
  const a = absoluteElevation(state.topology, from) ?? 0;
  const b = absoluteElevation(state.topology, to) ?? a;
  return (diagonal ? Math.SQRT2 : 1) + Math.abs(a - b) * 0.08;
}
function isDiagonalSameLevel(a: CellAddress, b: CellAddress): boolean {
  return a.levelId === b.levelId && a.position.x !== b.position.x && a.position.z !== b.position.z;
}
function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.levelId === b.levelId && a.position.x === b.position.x && a.position.z === b.position.z;
}
