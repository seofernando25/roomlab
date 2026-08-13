import * as THREE from 'three';
import { getFloorFinish } from '../domain/room-finishes';
import { levelBaseWorldY, roomCellAt, roomLevel } from '../domain/room-topology';
import type { EditorState, GridPoint, RoomCell, WorldState } from '../domain/types';

/** Persistent non-interactive build hints. Pointer hover/validity remains in RoomBuildController. */
export class BuildContextOverlay {
  readonly group = new THREE.Group();
  readonly #shapeGhosts = new THREE.Group();
  readonly #elevationLabels = new THREE.Group();
  #world: WorldState | null = null;
  #editor: EditorState | null = null;

  constructor() {
    this.group.name = 'build-context-overlay';
    this.group.add(this.#shapeGhosts, this.#elevationLabels);
  }

  sync(world: WorldState, editor: EditorState): void {
    if (this.#world === world && this.#editor === editor) return;
    this.#world = world;
    this.#editor = editor;
    this.rebuildShapeGhosts(world, editor);
    this.rebuildElevationLabels(world, editor);
  }

  dispose(): void {
    disposeChildren(this.#shapeGhosts);
    disposeChildren(this.#elevationLabels);
  }

  private rebuildShapeGhosts(world: WorldState, editor: EditorState): void {
    disposeChildren(this.#shapeGhosts);
    if (editor.tool !== 'floor-shape') return;
    const level = roomLevel(world.topology, editor.activeLevelId);
    if (!level) return;
    const finish = getFloorFinish(editor.floorFinish);
    const candidates = level.cells.length ? neighboringEmptyCells(level.cells) : seedCellsForEmptyLevel(world, level.baseElevation);
    for (const position of candidates) {
      const y = levelBaseWorldY(world.topology, level.id);
      this.#shapeGhosts.add(floorGhost(position, y, finish.color));
    }
  }

  private rebuildElevationLabels(world: WorldState, editor: EditorState): void {
    disposeChildren(this.#elevationLabels);
    if (editor.tool !== 'floor-raise' && editor.tool !== 'floor-lower') return;
    const level = roomLevel(world.topology, editor.activeLevelId);
    if (!level) return;
    for (const cell of level.cells) {
      if (cell.elevation === 0) continue;
      const label = elevationLabel(cell.elevation);
      label.position.set(
        cell.position.x + 0.5,
        levelBaseWorldY(world.topology, level.id) + cell.elevation * 0.28 + 0.20,
        cell.position.z + 0.5,
      );
      this.#elevationLabels.add(label);
    }
  }
}

function neighboringEmptyCells(cells: readonly RoomCell[]): readonly GridPoint[] {
  const occupied = new Set(cells.map((cell) => key(cell.position)));
  const result = new Map<string, GridPoint>();
  for (const cell of cells) {
    for (const delta of CARDINALS) {
      const position = { x: cell.position.x + delta.x, z: cell.position.z + delta.z };
      if (!occupied.has(key(position))) result.set(key(position), position);
    }
  }
  return [...result.values()];
}

function seedCellsForEmptyLevel(world: WorldState, baseElevation: number): readonly GridPoint[] {
  const lower = [...world.topology.levels]
    .filter((level) => level.baseElevation < baseElevation && level.cells.length)
    .sort((a, b) => b.baseElevation - a.baseElevation)[0];
  return lower?.cells.map((cell) => cell.position) ?? [];
}

function floorGhost(position: GridPoint, y: number, color: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(position.x + 0.5, y + 0.012, position.z + 0.5);
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.86),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  fill.rotation.x = -Math.PI / 2;
  group.add(fill);
  const points = [
    new THREE.Vector3(-0.44, 0.006, -0.44), new THREE.Vector3(0.44, 0.006, -0.44),
    new THREE.Vector3(0.44, 0.006, 0.44), new THREE.Vector3(-0.44, 0.006, 0.44),
    new THREE.Vector3(-0.44, 0.006, -0.44),
  ];
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color: 0xa9eeff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
  ));
  const line = group.children[1] as THREE.Line;
  line.computeLineDistances();
  return group;
}

function elevationLabel(value: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for elevation labels.');
  context.imageSmoothingEnabled = false;
  context.fillStyle = 'rgba(29,45,51,0.82)';
  context.fillRect(6, 4, 52, 24);
  context.strokeStyle = 'rgba(219,244,244,0.95)';
  context.lineWidth = 2;
  context.strokeRect(7, 5, 50, 22);
  context.fillStyle = '#ffffff';
  context.font = 'bold 18px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(value > 0 ? `+${value}` : String(value), 32, 17);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(0.48, 0.24, 1);
  sprite.userData.ownedTexture = texture;
  return sprite;
}

function disposeChildren(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    } else if (object instanceof THREE.Sprite) {
      object.material.dispose();
      (object.userData.ownedTexture as THREE.Texture | undefined)?.dispose();
    }
  });
  group.clear();
}
function key(point: GridPoint): string { return `${point.x},${point.z}`; }
const CARDINALS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }] as const;
