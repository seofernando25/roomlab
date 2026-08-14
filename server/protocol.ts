import { parseAppearanceComponent } from '../src/domain/material-design';
import type { CellAddress, TopologyAction, TransformComponent } from '../src/domain/types';
import type { RoomClientMessage } from '../src/online/types';

export function parseRoomClientMessage(value: unknown): RoomClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.clientCommandId !== 'string' || !Number.isInteger(value.clientSequence)) return null;
  const base = { clientCommandId: value.clientCommandId, clientSequence: value.clientSequence as number };
  if (value.type === 'ping') return { type: 'ping', ...base };
  if (value.type === 'move' && isCellAddress(value.target)) return { type: 'move', ...base, target: value.target };
  if (value.type === 'sit' && typeof value.targetEntityId === 'string' && (value.seatIndex === undefined || Number.isInteger(value.seatIndex))) {
    return { type: 'sit', ...base, targetEntityId: value.targetEntityId, ...(value.seatIndex === undefined ? {} : { seatIndex: value.seatIndex as number }) };
  }
  if (value.type === 'teleport-use' && typeof value.targetEntityId === 'string') return { type: 'teleport-use', ...base, targetEntityId: value.targetEntityId };
  if (value.type === 'stand') return { type: 'stand', ...base };
  if (value.type === 'chat' && typeof value.chatId === 'string' && value.chatId.length <= 80 && typeof value.text === 'string' && value.text.length <= 160) {
    return { type: 'chat', ...base, chatId: value.chatId, text: value.text };
  }
  if (value.type === 'manipulation-begin' && typeof value.entityId === 'string') return { type: 'manipulation-begin', ...base, entityId: value.entityId };
  if ((value.type === 'manipulation-pose' || value.type === 'manipulation-commit') && typeof value.manipulationId === 'string' && isTransform(value.transform)) {
    if (value.type === 'manipulation-pose') return { type: value.type, ...base, manipulationId: value.manipulationId, transform: value.transform, ...(typeof value.lift === 'number' ? { lift: clamp(value.lift, 0, 1) } : {}) };
    return { type: value.type, ...base, manipulationId: value.manipulationId, transform: value.transform };
  }
  if (value.type === 'manipulation-cancel' && typeof value.manipulationId === 'string') return { type: value.type, ...base, manipulationId: value.manipulationId };
  if (value.type === 'entity-place' && typeof value.itemInstanceId === 'string' && typeof value.prototypeId === 'string' && isTransform(value.transform)) {
    if (value.appearance === null) return { type: value.type, ...base, itemInstanceId: value.itemInstanceId, prototypeId: value.prototypeId, transform: value.transform, appearance: null };
    const appearance = parseAppearanceComponent(value.appearance);
    return appearance ? { type: value.type, ...base, itemInstanceId: value.itemInstanceId, prototypeId: value.prototypeId, transform: value.transform, appearance } : null;
  }
  if (value.type === 'entity-rotate' && typeof value.entityId === 'string' && isQuarter(value.rotation)) return { type: value.type, ...base, entityId: value.entityId, rotation: value.rotation };
  if (value.type === 'entity-pickup' && typeof value.entityId === 'string') return { type: value.type, ...base, entityId: value.entityId };
  if (value.type === 'entity-appearance' && typeof value.entityId === 'string') {
    if (value.appearance === null) return { type: value.type, ...base, entityId: value.entityId, appearance: null };
    const appearance = parseAppearanceComponent(value.appearance);
    return appearance ? { type: value.type, ...base, entityId: value.entityId, appearance } : null;
  }
  if (value.type === 'topology' && isTopologyAction(value.action)) return { type: value.type, ...base, action: value.action };
  if (value.type === 'teleporter-pair' && isCellAddress(value.first) && isCellAddress(value.second)) return { type: value.type, ...base, first: value.first, second: value.second };
  if (value.type === 'teleporter-remove' && typeof value.entityId === 'string') return { type: value.type, ...base, entityId: value.entityId };
  return null;
}

function isCellAddress(value: unknown): value is CellAddress {
  return isRecord(value) && typeof value.y === 'number' && Number.isFinite(value.y) && isRecord(value.position)
    && Number.isInteger(value.position.x) && Number.isInteger(value.position.z);
}
function isTransform(value: unknown): value is TransformComponent {
  return isRecord(value) && typeof value.y === 'number' && Number.isFinite(value.y) && isRecord(value.position)
    && Number.isInteger(value.position.x) && Number.isInteger(value.position.z)
    && isQuarter(value.rotation);
}
function isQuarter(value: unknown): value is 0 | 1 | 2 | 3 { return value === 0 || value === 1 || value === 2 || value === 3; }
function isTopologyAction(value: unknown): value is TopologyAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'topology/cells-update') return Array.isArray(value.updates) && value.updates.every(isCellUpdate);
  if (value.type === 'topology/cells-add') return Array.isArray(value.cells) && value.cells.every(isRoomCell);
  if (value.type === 'topology/cells-remove') return Array.isArray(value.addresses) && value.addresses.every(isCellAddress);
  if (value.type === 'topology/wall-set') return isWall(value.wall);
  if (value.type === 'topology/wall-remove') return isWallEdge(value.edge);
  return false;
}
function isCellUpdate(value: unknown): boolean {
  return isRecord(value) && isCellAddress(value.address)
    && (value.y === undefined || (typeof value.y === 'number' && Number.isFinite(value.y)))
    && (value.floorFinish === undefined || typeof value.floorFinish === 'string');
}
function isRoomCell(value: unknown): boolean {
  return isRecord(value) && typeof value.y === 'number' && Number.isFinite(value.y)
    && typeof value.floorFinish === 'string' && isRecord(value.position)
    && Number.isInteger(value.position.x) && Number.isInteger(value.position.z);
}
function isWall(value: unknown): boolean {
  return isWallEdge(value) && isRecord(value) && typeof value.finish === 'string';
}
function isWallEdge(value: unknown): boolean {
  return isRecord(value) && (value.axis === 'x' || value.axis === 'z')
    && Number.isInteger(value.x) && Number.isInteger(value.z)
    && typeof value.y === 'number' && Number.isFinite(value.y);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
