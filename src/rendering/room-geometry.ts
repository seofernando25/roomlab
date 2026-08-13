import * as THREE from 'three';
import { getFloorFinish, getWallFinish } from '../domain/room-finishes';
import {
  adjacentCellsForWall,
  floorWorldY,
  roomCellAt,
  roomLevel,
} from '../domain/room-topology';
import type { CellAddress, GridPoint, RoomCell, RoomLevel, RoomLevelId, RoomTopology, WallSegment } from '../domain/types';
import { palette, toon, unlitSurface, wallMaterial } from './materials';
import type { FadingWall } from './wall-visibility';

const FLOOR_THICKNESS = 0.07;
export const ROOM_WALL_HEIGHT = 2.65;

/** Rebuildable sparse multi-storey room architecture. */
export class RoomArchitectureRenderer {
  readonly group = new THREE.Group();
  #walls: FadingWall[] = [];
  readonly #levelGroups = new Map<RoomLevelId, THREE.Group>();

  constructor(topology: RoomTopology) {
    this.group.name = 'room-architecture';
    this.sync(topology);
  }

  get walls(): readonly FadingWall[] { return this.#walls; }

  sync(topology: RoomTopology): void {
    this.disposeChildren();
    this.#walls = [];
    this.#levelGroups.clear();
    for (const level of topology.levels) {
      const group = new THREE.Group();
      group.name = `room-level:${level.id}`;
      group.userData.levelId = level.id;
      this.#levelGroups.set(level.id, group);
      this.group.add(group);
      for (const cell of level.cells) this.addFloorCell(topology, level, cell, group);
      for (const wall of level.walls) this.addWall(topology, level, wall, group);
    }
  }

  setEditLevel(topology: RoomTopology, activeLevelId: RoomLevelId | null): void {
    const active = activeLevelId ? roomLevel(topology, activeLevelId) : undefined;
    for (const level of topology.levels) {
      const group = this.#levelGroups.get(level.id);
      if (group) group.visible = !active || level.baseElevation <= active.baseElevation;
    }
  }

  dispose(): void { this.disposeChildren(); }

  private addFloorCell(topology: RoomTopology, level: RoomLevel, cell: RoomCell, parent: THREE.Group): void {
    const finish = getFloorFinish(cell.floorFinish);
    const address = { levelId: level.id, position: cell.position };
    const y = floorWorldY(topology, address);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, FLOOR_THICKNESS, 0.96),
      unlitSurface(finish.color, finish.pattern, 1, 1),
    );
    top.name = `floor:${level.id}:${cell.position.x},${cell.position.z}`;
    top.position.set(cell.position.x + 0.5, y - FLOOR_THICKNESS / 2, cell.position.z + 0.5);
    tagSurface(top, level.id, cell.position, 'floor');
    parent.add(top);
    for (const delta of CARDINALS) this.addFloorRiser(topology, address, delta, y, parent);
  }

  private addFloorRiser(topology: RoomTopology, address: CellAddress, delta: GridPoint, topY: number, parent: THREE.Group): void {
    const neighbor: CellAddress = {
      levelId: address.levelId,
      position: { x: address.position.x + delta.x, z: address.position.z + delta.z },
    };
    const other = roomCellAt(topology, neighbor);
    const bottomY = other ? floorWorldY(topology, neighbor) : topY - 0.22;
    if (bottomY >= topY - 0.01) return;
    const height = topY - bottomY;
    const alongX = delta.z !== 0;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? 0.96 : 0.055, height, alongX ? 0.055 : 0.96),
      toon(palette.woodDark, 'wood'),
    );
    mesh.position.set(
      address.position.x + 0.5 + delta.x * 0.48,
      bottomY + height / 2,
      address.position.z + 0.5 + delta.z * 0.48,
    );
    tagSurface(mesh, address.levelId, address.position, 'riser');
    parent.add(mesh);
  }

  private addWall(topology: RoomTopology, level: RoomLevel, wall: WallSegment, parent: THREE.Group): void {
    const adjacent = adjacentCellsForWall(topology, level.id, wall);
    if (!adjacent.length) return;
    const baseY = Math.max(...adjacent.map((position) => floorWorldY(topology, { levelId: level.id, position })));
    const finish = getWallFinish(wall.finish);
    const root = new THREE.Group();
    root.name = `wall:${level.id}:${wall.axis}:${wall.x}:${wall.z}`;
    tagWall(root, level.id, wall);

    const main = new THREE.Mesh(
      wall.axis === 'x' ? new THREE.BoxGeometry(1.02, ROOM_WALL_HEIGHT, 0.06) : new THREE.BoxGeometry(0.06, ROOM_WALL_HEIGHT, 1.02),
      wallMaterial(finish.color, finish.pattern, 1.2, 3),
    );
    main.position.y = baseY + ROOM_WALL_HEIGHT / 2;
    root.add(main);
    addWallTrim(root, wall.axis, baseY + 0.07, palette.woodDark);
    addWallTrim(root, wall.axis, baseY + 0.76, palette.wallTrim);
    addWallTrim(root, wall.axis, baseY + ROOM_WALL_HEIGHT - 0.07, palette.woodDark);
    if (wall.axis === 'x') root.position.set(wall.x + 0.5, 0, wall.z);
    else root.position.set(wall.x, 0, wall.z + 0.5);
    root.traverse((object) => tagWall(object, level.id, wall));
    parent.add(root);

    const exteriorNormal = exteriorNormalFor(topology, level.id, wall);
    this.#walls.push({
      root,
      levelId: level.id,
      axis: wall.axis,
      x: wall.x,
      z: wall.z,
      center: new THREE.Vector3(root.position.x, baseY + ROOM_WALL_HEIGHT / 2, root.position.z),
      exteriorNormal,
    });
  }

  private disposeChildren(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.group.clear();
  }
}

function exteriorNormalFor(topology: RoomTopology, levelId: RoomLevelId, wall: WallSegment): THREE.Vector3 | null {
  const adjacent = adjacentCellsForWall(topology, levelId, wall);
  if (adjacent.length !== 1) return null;
  const cell = adjacent[0]!;
  if (wall.axis === 'x') return new THREE.Vector3(0, 0, cell.z < wall.z ? 1 : -1);
  return new THREE.Vector3(cell.x < wall.x ? 1 : -1, 0, 0);
}

function addWallTrim(root: THREE.Group, axis: WallSegment['axis'], y: number, color: number): void {
  const mesh = new THREE.Mesh(
    axis === 'x' ? new THREE.BoxGeometry(1.04, 0.12, 0.10) : new THREE.BoxGeometry(0.10, 0.12, 1.04),
    toon(color, 'wood'),
  );
  mesh.position.y = y;
  root.add(mesh);
}
function tagSurface(object: THREE.Object3D, levelId: RoomLevelId, position: GridPoint, kind: string): void {
  object.userData.roomLevelId = levelId;
  object.userData.roomCell = `${position.x},${position.z}`;
  object.userData.roomSurface = kind;
}
function tagWall(object: THREE.Object3D, levelId: RoomLevelId, wall: WallSegment): void {
  object.userData.wallLevelId = levelId;
  object.userData.wallAxis = wall.axis;
  object.userData.wallX = wall.x;
  object.userData.wallZ = wall.z;
}
const CARDINALS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }] as const;
