import { getEntityPrototype } from '../domain/prototype-registry';
import { roomCellAt, suggestedNewCell, wallAt } from '../domain/room-topology';
import type { CellAddress, EditorState, RoomCellUpdate, WallSegment, WorldEntity, WorldState } from '../domain/types';
import { isValidEntityPlacement, resolveSupportedPlacement } from '../domain/world-placement';
import { createFurniEntity, reduceWorld } from '../domain/world-state';

export function resolvedObjectPlacement(state: WorldState, editor: EditorState, address: CellAddress): WorldEntity | null {
  const prototypeId = editor.placementPrototypeId;
  if (!prototypeId || getEntityPrototype(prototypeId).kind !== 'furni') return null;
  return resolveSupportedPlacement(
    state,
    createFurniEntity(
      prototypeId, address.position, editor.placementRotation, 'placement-hover-probe', address.levelId, 0,
      editor.placementAppearance ?? undefined,
    ),
  );
}

export function cellBuildTargetValid(state: WorldState, editor: EditorState, address: CellAddress): boolean {
  const tool = editor.tool;
  const current = roomCellAt(state.topology, address);
  if (tool === 'floor-shape') {
    if (current) return reduceWorld(state, {
      type: 'topology/cells-remove', levelId: address.levelId, positions: [address.position],
    }) !== state;
    const cell = suggestedNewCell(state.topology, address, editor.floorFinish);
    return Boolean(cell && reduceWorld(state, { type: 'topology/cells-add', levelId: address.levelId, cells: [cell] }) !== state);
  }
  if (tool === 'floor-paint' || tool === 'floor-raise' || tool === 'floor-lower') {
    if (!current) return false;
    const update = floorPreviewUpdate(tool, address, current.elevation, editor);
    return reduceWorld(state, { type: 'topology/cells-update', updates: [update] }) !== state || tool === 'floor-paint';
  }
  if (tool === 'place-prototype') return Boolean(resolvedObjectPlacement(state, editor, address));
  if (tool === 'teleport-pair') {
    if (!current || sameAddress(editor.pendingAnchor, address)) return false;
    return isValidEntityPlacement(state, createFurniEntity('tile.teleporter', address.position, 0, 'teleport-hover-probe', address.levelId));
  }
  return false;
}

export function wallBuildTargetValid(
  state: WorldState,
  editor: EditorState,
  edge: Pick<WallSegment, 'axis' | 'x' | 'z'>,
): boolean {
  const existing = wallAt(state.topology, editor.activeLevelId, edge.axis, edge.x, edge.z);
  if (editor.tool === 'wall-paint') return Boolean(existing);
  if (editor.tool !== 'wall-shape') return false;
  const action = existing
    ? { type: 'topology/wall-remove' as const, levelId: editor.activeLevelId, ...edge }
    : { type: 'topology/wall-set' as const, levelId: editor.activeLevelId, wall: { ...edge, finish: editor.wallFinish } };
  return reduceWorld(state, action) !== state;
}

function floorPreviewUpdate(
  tool: Extract<EditorState['tool'], 'floor-paint' | 'floor-raise' | 'floor-lower'>,
  address: CellAddress,
  elevation: number,
  editor: EditorState,
): RoomCellUpdate {
  if (tool === 'floor-paint') return { levelId: address.levelId, position: address.position, floorFinish: editor.floorFinish };
  return { levelId: address.levelId, position: address.position, elevation: elevation + (tool === 'floor-raise' ? 1 : -1) };
}

function sameAddress(a: CellAddress | null, b: CellAddress): boolean {
  return Boolean(a && a.levelId === b.levelId && a.position.x === b.position.x && a.position.z === b.position.z);
}
