import type { GameStore } from '../domain/game-store';
import { DEFAULT_STOREY_HEIGHT_STEPS, roomCellAt, roomLevel, sortedLevels, suggestedNewCell, wallAt } from '../domain/room-topology';
import type { CellAddress, GridPoint, RoomCellUpdate, RoomLevel, WallSegment, WorldAction, WorldState } from '../domain/types';
import { isValidEntityPlacement, resolveSupportedPlacement } from '../domain/world-placement';
import { createFurniEntity, reduceWorld } from '../domain/world-state';
import { createTeleporterPair } from './teleporter-editor';

export type ShapeIntent = 'add' | 'remove';
export interface BuildOperationResult { readonly accepted: boolean; readonly message?: string; }

export function floorShapeIntent(state: WorldState, address: CellAddress): ShapeIntent | null {
  if (roomCellAt(state.topology, address)) return 'remove';
  return suggestedNewCell(state.topology, address, 'wood') ? 'add' : null;
}

export function commitFloorShape(
  store: GameStore,
  intent: ShapeIntent,
  addresses: readonly CellAddress[],
): BuildOperationResult {
  if (!addresses.length) return { accepted: true };
  const actions: WorldAction[] = [];
  let preview = store.state;
  for (const address of uniqueAddresses(addresses)) {
    if (intent === 'remove') {
      const action = { type: 'topology/cells-remove' as const, levelId: address.levelId, positions: [address.position] };
      const next = reduceWorld(preview, action);
      if (next === preview) return { accepted: false, message: 'That floor tile is supporting an object or actor and cannot be removed.' };
      actions.push(action);
      preview = next;
      continue;
    }
    const cell = suggestedNewCell(preview.topology, address, store.editorState.floorFinish);
    if (!cell) continue;
    const action = { type: 'topology/cells-add' as const, levelId: address.levelId, cells: [cell] };
    const next = reduceWorld(preview, action);
    if (next === preview) continue;
    actions.push(action);
    preview = next;
  }
  if (!actions.length) return { accepted: false, message: 'Add floor next to an existing tile. On an empty storey, start above a lower floor.' };
  return store.dispatchBatch(actions).accepted ? { accepted: true } : { accepted: false, message: 'That floor shape edit is not valid.' };
}

export function commitFloorPropertyBrush(
  store: GameStore,
  tool: 'floor-paint' | 'floor-raise' | 'floor-lower',
  addresses: readonly CellAddress[],
): BuildOperationResult {
  const updates: RoomCellUpdate[] = [];
  for (const address of uniqueAddresses(addresses)) {
    const cell = roomCellAt(store.state.topology, address);
    if (!cell) continue;
    updates.push(tool === 'floor-paint'
      ? { levelId: address.levelId, position: address.position, floorFinish: store.editorState.floorFinish }
      : { levelId: address.levelId, position: address.position, elevation: cell.elevation + (tool === 'floor-raise' ? 1 : -1) });
  }
  if (!updates.length) return { accepted: false, message: 'That brush needs existing floor.' };
  const result = store.dispatch({ type: 'topology/cells-update', updates });
  return result.accepted ? { accepted: true } : { accepted: false, message: 'That height edit would leave an object spanning uneven floor.' };
}

export function wallShapeIntent(state: WorldState, levelId: string, edge: Pick<WallSegment, 'axis' | 'x' | 'z'>): ShapeIntent {
  return wallAt(state.topology, levelId, edge.axis, edge.x, edge.z) ? 'remove' : 'add';
}

export function commitWallShape(
  store: GameStore,
  intent: ShapeIntent,
  edges: readonly Pick<WallSegment, 'axis' | 'x' | 'z'>[],
): BuildOperationResult {
  const levelId = store.editorState.activeLevelId;
  const actions: WorldAction[] = [];
  for (const edge of uniqueEdges(edges)) {
    const existing = wallAt(store.state.topology, levelId, edge.axis, edge.x, edge.z);
    if (intent === 'remove') {
      if (existing) actions.push({ type: 'topology/wall-remove', levelId, ...edge });
    } else if (!existing) actions.push({ type: 'topology/wall-set', levelId, wall: { ...edge, finish: store.editorState.wallFinish } });
  }
  if (!actions.length) return { accepted: false, message: 'No wall edges changed.' };
  return store.dispatchBatch(actions).accepted
    ? { accepted: true }
    : { accepted: false, message: 'That wall would cut through a multi-cell object or has no floor beside it.' };
}

export function commitWallPaint(
  store: GameStore,
  edges: readonly Pick<WallSegment, 'axis' | 'x' | 'z'>[],
): BuildOperationResult {
  const levelId = store.editorState.activeLevelId;
  const actions = uniqueEdges(edges).flatMap((edge) => {
    const existing = wallAt(store.state.topology, levelId, edge.axis, edge.x, edge.z);
    return existing && existing.finish !== store.editorState.wallFinish
      ? [{ type: 'topology/wall-set' as const, levelId, wall: { ...edge, finish: store.editorState.wallFinish } }]
      : [];
  });
  if (!actions.length) return { accepted: false, message: 'Paint an existing wall edge.' };
  return store.dispatchBatch(actions).accepted ? { accepted: true } : { accepted: false, message: 'Wall paint failed.' };
}

export function placePrototypeAt(store: GameStore, address: CellAddress): BuildOperationResult {
  const prototypeId = store.editorState.placementPrototypeId;
  if (!prototypeId) return { accepted: false, message: 'Choose an object from the Catalogue first.' };
  const probe = createFurniEntity(prototypeId, address.position, store.editorState.placementRotation, crypto.randomUUID(), address.levelId);
  const entity = resolveSupportedPlacement(store.state, probe);
  if (!entity) return { accepted: false, message: 'That object does not fit here.' };
  return store.dispatch({ type: 'entity/add', entity }).accepted ? { accepted: true } : { accepted: false, message: 'Could not place that object.' };
}

export function stepTeleportPair(store: GameStore, address: CellAddress): BuildOperationResult {
  const probe = createFurniEntity('tile.teleporter', address.position, 0, 'teleport-placement-probe', address.levelId);
  if (!isValidEntityPlacement(store.state, probe)) return { accepted: false, message: 'Teleport tiles need a clear floor tile.' };
  const anchor = store.editorState.pendingAnchor;
  if (!anchor) {
    store.dispatchEditor({ type: 'pending-anchor/set', cell: address });
    return { accepted: true, message: 'Teleport A selected. Choose B on this or another storey.' };
  }
  if (sameAddress(anchor, address)) {
    store.dispatchEditor({ type: 'pending-anchor/set', cell: null });
    return { accepted: true, message: 'Teleport pairing cancelled.' };
  }
  if (!createTeleporterPair(store, anchor, address)) return { accepted: false, message: 'Could not create that teleport pair.' };
  store.dispatchEditor({ type: 'pending-anchor/set', cell: null });
  return { accepted: true, message: 'Teleport pair linked in both directions.' };
}

export function addStorey(store: GameStore): RoomLevel | null {
  const levels = sortedLevels(store.state.topology);
  const highest = levels.at(-1);
  const number = levels.length + 1;
  const level: RoomLevel = {
    id: `level:${crypto.randomUUID()}`,
    label: `Storey ${number}`,
    baseElevation: (highest?.baseElevation ?? 0) + DEFAULT_STOREY_HEIGHT_STEPS,
    cells: [],
    walls: [],
  };
  if (!store.dispatch({ type: 'topology/level-add', level }).accepted) return null;
  store.dispatchEditor({ type: 'active-level/set', levelId: level.id });
  store.dispatchEditor({ type: 'tool/set', tool: 'floor-shape' });
  return level;
}

export function nudgeActiveStoreyBase(store: GameStore, deltaSteps: number): BuildOperationResult {
  const level = roomLevel(store.state.topology, store.editorState.activeLevelId);
  if (!level) return { accepted: false, message: 'Active storey no longer exists.' };
  const baseElevation = level.baseElevation + deltaSteps;
  const result = store.dispatch({ type: 'topology/level-base-set', levelId: level.id, baseElevation });
  return result.accepted ? { accepted: true } : { accepted: false, message: 'That storey base height is unchanged.' };
}

function uniqueAddresses(addresses: readonly CellAddress[]): readonly CellAddress[] {
  const map = new Map<string, CellAddress>();
  for (const address of addresses) map.set(`${address.levelId}:${address.position.x},${address.position.z}`, address);
  return [...map.values()];
}
function uniqueEdges(edges: readonly Pick<WallSegment, 'axis' | 'x' | 'z'>[]): readonly Pick<WallSegment, 'axis' | 'x' | 'z'>[] {
  const map = new Map<string, Pick<WallSegment, 'axis' | 'x' | 'z'>>();
  for (const edge of edges) map.set(`${edge.axis}:${edge.x}:${edge.z}`, edge);
  return [...map.values()];
}
function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.levelId === b.levelId && a.position.x === b.position.x && a.position.z === b.position.z;
}
