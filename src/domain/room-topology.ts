import type {
  CellAddress,
  GridPoint,
  RoomCell,
  RoomCellUpdate,
  RoomLevel,
  RoomLevelId,
  RoomTopology,
  TopologyAction,
  WallAxis,
  WallSegment,
} from './types';

export const DEFAULT_LEVEL_ID = 'ground';
export const FLOOR_STEP_HEIGHT = 0.28;
export const DEFAULT_FLOOR_HEIGHT_STEPS = 10;
export const MIN_FLOOR_ELEVATION = -2;
export const MAX_FLOOR_ELEVATION = 8;
export const MIN_FLOOR_BASE = -40;
export const MAX_FLOOR_BASE = 120;
export const AUTO_STEP_DELTA = 1;

export interface TopologyBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly width: number;
  readonly depth: number;
}

export function createRectangularTopology(width: number, depth: number): RoomTopology {
  const cells: RoomCell[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({
        position: { x, z },
        elevation: 0,
        floorFinish: x >= width - 4 && z < 3 ? 'cream-tile' : 'wood',
      });
    }
  }
  return {
    levels: [{
      id: DEFAULT_LEVEL_ID,
      label: 'Ground',
      baseElevation: 0,
      cells,
      walls: perimeterWalls(width, depth),
    }],
  };
}

export function roomLevel(topology: RoomTopology, levelId: RoomLevelId): RoomLevel | undefined {
  return topology.levels.find((level) => level.id === levelId);
}

export function sortedLevels(topology: RoomTopology): readonly RoomLevel[] {
  return [...topology.levels].sort((a, b) => a.baseElevation - b.baseElevation || a.label.localeCompare(b.label));
}

export function roomCellAt(topology: RoomTopology, address: CellAddress): RoomCell | undefined {
  return roomLevel(topology, address.levelId)?.cells.find((entry) => sameCell(entry.position, address.position));
}

export function floorWorldY(topology: RoomTopology, address: CellAddress): number {
  const level = roomLevel(topology, address.levelId);
  if (!level) return 0;
  return (level.baseElevation + (roomCellAt(topology, address)?.elevation ?? 0)) * FLOOR_STEP_HEIGHT;
}

export function levelBaseWorldY(topology: RoomTopology, levelId: RoomLevelId): number {
  return (roomLevel(topology, levelId)?.baseElevation ?? 0) * FLOOR_STEP_HEIGHT;
}

export function absoluteElevation(topology: RoomTopology, address: CellAddress): number | null {
  const level = roomLevel(topology, address.levelId);
  const cell = roomCellAt(topology, address);
  return level && cell ? level.baseElevation + cell.elevation : null;
}

export function topologyBounds(topology: RoomTopology, levelId?: RoomLevelId): TopologyBounds {
  const cells = levelId ? (roomLevel(topology, levelId)?.cells ?? []) : topology.levels.flatMap((level) => level.cells);
  if (!cells.length) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 1, depth: 1 };
  const xs = cells.map((cell) => cell.position.x);
  const zs = cells.map((cell) => cell.position.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX + 1, depth: maxZ - minZ + 1 };
}

export function adjacentFloorExists(topology: RoomTopology, address: CellAddress): boolean {
  return CARDINALS.some((delta) => roomCellAt(topology, {
    levelId: address.levelId,
    position: { x: address.position.x + delta.x, z: address.position.z + delta.z },
  }));
}

export function canSeedEmptyLevel(topology: RoomTopology, address: CellAddress): boolean {
  const level = roomLevel(topology, address.levelId);
  if (!level || level.cells.length > 0) return false;
  return topology.levels.some((candidate) => candidate.id !== address.levelId
    && candidate.baseElevation < level.baseElevation
    && candidate.cells.some((cell) => sameCell(cell.position, address.position)));
}

export function suggestedNewCell(topology: RoomTopology, address: CellAddress, finish: RoomCell['floorFinish']): RoomCell | null {
  const level = roomLevel(topology, address.levelId);
  if (!level || roomCellAt(topology, address)) return null;
  const neighbor = CARDINALS
    .map((delta) => level.cells.find((cell) => cell.position.x === address.position.x + delta.x && cell.position.z === address.position.z + delta.z))
    .find(Boolean);
  if (!neighbor && !canSeedEmptyLevel(topology, address)) return null;
  return { position: address.position, elevation: neighbor?.elevation ?? 0, floorFinish: finish };
}

export function wallKey(wall: Pick<WallSegment, 'axis' | 'x' | 'z'>): string {
  return `${wall.axis}:${wall.x}:${wall.z}`;
}

export function wallAt(topology: RoomTopology, levelId: RoomLevelId, axis: WallAxis, x: number, z: number): WallSegment | undefined {
  return roomLevel(topology, levelId)?.walls.find((wall) => wall.axis === axis && wall.x === x && wall.z === z);
}

export function edgeForAdjacentCells(a: GridPoint, b: GridPoint): Pick<WallSegment, 'axis' | 'x' | 'z'> | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
  if (dx !== 0) return { axis: 'z', x: Math.max(a.x, b.x), z: Math.min(a.z, b.z) };
  return { axis: 'x', x: Math.min(a.x, b.x), z: Math.max(a.z, b.z) };
}

export function wallBetween(topology: RoomTopology, a: CellAddress, b: CellAddress): WallSegment | undefined {
  if (a.levelId !== b.levelId) return undefined;
  const edge = edgeForAdjacentCells(a.position, b.position);
  return edge ? wallAt(topology, a.levelId, edge.axis, edge.x, edge.z) : undefined;
}

export function canTraverseTopologyEdge(topology: RoomTopology, from: CellAddress, to: CellAddress): boolean {
  if (from.levelId !== to.levelId) return false;
  const a = roomCellAt(topology, from);
  const b = roomCellAt(topology, to);
  if (!a || !b) return false;
  const dx = Math.abs(to.position.x - from.position.x);
  const dz = Math.abs(to.position.z - from.position.z);
  if (dx > 1 || dz > 1 || (dx === 0 && dz === 0)) return false;
  if (dx === 1 && dz === 1) return Math.abs(a.elevation - b.elevation) <= AUTO_STEP_DELTA;
  if (wallBetween(topology, from, to)) return false;
  return Math.abs(a.elevation - b.elevation) <= AUTO_STEP_DELTA;
}

export function nearestWallEdge(cell: GridPoint, point: { x: number; z: number }): Pick<WallSegment, 'axis' | 'x' | 'z'> {
  const localX = point.x - cell.x;
  const localZ = point.z - cell.z;
  const distances = [
    { distance: localZ, edge: { axis: 'x' as const, x: cell.x, z: cell.z } },
    { distance: 1 - localZ, edge: { axis: 'x' as const, x: cell.x, z: cell.z + 1 } },
    { distance: localX, edge: { axis: 'z' as const, x: cell.x, z: cell.z } },
    { distance: 1 - localX, edge: { axis: 'z' as const, x: cell.x + 1, z: cell.z } },
  ];
  return distances.reduce((best, entry) => entry.distance < best.distance ? entry : best).edge;
}

export function adjacentCellsForWall(
  topology: RoomTopology,
  levelId: RoomLevelId,
  edge: Pick<WallSegment, 'axis' | 'x' | 'z'>,
): readonly GridPoint[] {
  const level = roomLevel(topology, levelId);
  if (!level) return [];
  const candidates = edge.axis === 'x'
    ? [{ x: edge.x, z: edge.z - 1 }, { x: edge.x, z: edge.z }]
    : [{ x: edge.x - 1, z: edge.z }, { x: edge.x, z: edge.z }];
  return candidates.filter((candidate) => level.cells.some((cell) => sameCell(cell.position, candidate)));
}

export function wallIsExterior(topology: RoomTopology, levelId: RoomLevelId, wall: WallSegment): boolean {
  return adjacentCellsForWall(topology, levelId, wall).length === 1;
}

export function applyTopologyAction(topology: RoomTopology, action: TopologyAction): RoomTopology {
  if (action.type === 'topology/level-add') {
    if (topology.levels.some((level) => level.id === action.level.id)) return topology;
    return { ...topology, levels: [...topology.levels, action.level] };
  }
  if (action.type === 'topology/level-base-set') {
    const baseElevation = Math.round(action.baseElevation);
    if (baseElevation < MIN_FLOOR_BASE || baseElevation > MAX_FLOOR_BASE) return topology;
    if (topology.levels.some((level) => level.id !== action.levelId && level.baseElevation === baseElevation)) return topology;
    return updateLevel(topology, action.levelId, (level) =>
      baseElevation === level.baseElevation ? level : { ...level, baseElevation, label: floorHeightLabel(baseElevation) });
  }
  if (action.type === 'topology/cells-add') {
    return updateLevel(topology, action.levelId, (level) => {
      const existing = new Set(level.cells.map((cell) => cellKey(cell.position)));
      const additions = action.cells.filter((cell) => !existing.has(cellKey(cell.position)));
      return additions.length ? { ...level, cells: [...level.cells, ...additions] } : level;
    });
  }
  if (action.type === 'topology/cells-remove') {
    return updateLevel(topology, action.levelId, (level) => {
      const remove = new Set(action.positions.map(cellKey));
      const cells = level.cells.filter((cell) => !remove.has(cellKey(cell.position)));
      if (cells.length === level.cells.length) return level;
      const walls = level.walls.filter((wall) => wallStillTouchesFloor(cells, wall));
      return { ...level, cells, walls };
    });
  }
  if (action.type === 'topology/cells-update') {
    const grouped = new Map<RoomLevelId, RoomCellUpdate[]>();
    for (const update of action.updates) grouped.set(update.levelId, [...(grouped.get(update.levelId) ?? []), update]);
    let next = topology;
    for (const [levelId, updates] of grouped) next = updateLevel(next, levelId, (level) => applyCellUpdates(level, updates));
    return next;
  }
  if (action.type === 'topology/wall-set') {
    if (!adjacentCellsForWall(topology, action.levelId, action.wall).length) return topology;
    return updateLevel(topology, action.levelId, (level) => {
      const walls = level.walls.filter((wall) => wallKey(wall) !== wallKey(action.wall));
      return { ...level, walls: [...walls, action.wall] };
    });
  }
  if (action.type === 'topology/wall-remove') {
    return updateLevel(topology, action.levelId, (level) => {
      const key = wallKey(action);
      const walls = level.walls.filter((wall) => wallKey(wall) !== key);
      return walls.length === level.walls.length ? level : { ...level, walls };
    });
  }
  return topology;
}

function applyCellUpdates(level: RoomLevel, updates: readonly RoomCellUpdate[]): RoomLevel {
  const byKey = new Map(updates.map((update) => [cellKey(update.position), update]));
  let changed = false;
  const cells = level.cells.map((cell) => {
    const update = byKey.get(cellKey(cell.position));
    if (!update) return cell;
    const next = {
      ...cell,
      ...(update.floorFinish === undefined ? {} : { floorFinish: update.floorFinish }),
      ...(update.elevation === undefined ? {} : { elevation: clampElevation(update.elevation) }),
    };
    if (next.floorFinish !== cell.floorFinish || next.elevation !== cell.elevation) changed = true;
    return next;
  });
  return changed ? { ...level, cells } : level;
}

function updateLevel(topology: RoomTopology, levelId: RoomLevelId, update: (level: RoomLevel) => RoomLevel): RoomTopology {
  let changed = false;
  const levels = topology.levels.map((level) => {
    if (level.id !== levelId) return level;
    const next = update(level);
    if (next !== level) changed = true;
    return next;
  });
  return changed ? { ...topology, levels } : topology;
}

function wallStillTouchesFloor(cells: readonly RoomCell[], wall: WallSegment): boolean {
  const candidates = wall.axis === 'x'
    ? [{ x: wall.x, z: wall.z - 1 }, { x: wall.x, z: wall.z }]
    : [{ x: wall.x - 1, z: wall.z }, { x: wall.x, z: wall.z }];
  return candidates.some((candidate) => cells.some((cell) => sameCell(cell.position, candidate)));
}

function perimeterWalls(width: number, depth: number): WallSegment[] {
  const walls: WallSegment[] = [];
  for (let x = 0; x < width; x += 1) {
    walls.push({ axis: 'x', x, z: 0, finish: 'cream-brick' });
    walls.push({ axis: 'x', x, z: depth, finish: 'mint-wallpaper' });
  }
  for (let z = 0; z < depth; z += 1) {
    walls.push({ axis: 'z', x: 0, z, finish: 'cream-brick' });
    walls.push({ axis: 'z', x: width, z, finish: 'mint-wallpaper' });
  }
  return walls;
}

function clampElevation(value: number): number {
  return Math.max(MIN_FLOOR_ELEVATION, Math.min(MAX_FLOOR_ELEVATION, Math.round(value)));
}
function floorHeightLabel(value: number): string { return value === 0 ? 'Ground' : `${value > 0 ? '+' : ''}${value} steps`; }
function cellKey(cell: GridPoint): string { return `${cell.x},${cell.z}`; }
function sameCell(a: GridPoint, b: GridPoint): boolean { return a.x === b.x && a.z === b.z; }
const CARDINALS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }] as const;
