import * as THREE from 'three';
import { floorWorldY } from '../domain/room-topology';
import type { EditorState, EntityId, WorldState } from '../domain/types';
import { teleporterPairs } from '../gameplay/teleporter-editor';

export class TeleportLinkRenderer {
  readonly group = new THREE.Group();
  #world: WorldState | null = null;
  #editor: EditorState | null = null;
  #editMode = false;
  #focusedEntityId: EntityId | null = null;

  constructor() {
    this.group.name = 'teleport-link-overlay';
    this.group.visible = false;
  }

  setEditMode(enabled: boolean): void {
    this.#editMode = enabled;
    this.updateVisibility();
  }

  setFocusedEntity(entityId: EntityId | null): void {
    this.#focusedEntityId = entityId;
    this.applyFocus();
  }

  sync(world: WorldState, editor: EditorState): void {
    if (this.#world === world && this.#editor === editor) {
      this.updateVisibility();
      return;
    }
    this.#world = world;
    this.#editor = editor;
    this.disposeChildren();
    this.updateVisibility();
    if (!this.group.visible) return;

    for (const [index, pair] of teleporterPairs(world).entries()) {
      const ta = pair.first.components.transform;
      const tb = pair.second.components.transform;
      const a = { y: ta.y, position: ta.position };
      const b = { y: tb.y, position: tb.position };
      const ay = floorWorldY(world.topology, a) + 0.22;
      const by = floorWorldY(world.topology, b) + 0.22;
      const middleY = Math.max(ay, by) + 0.34 + Math.min(0.45, Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) * 0.035);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.position.x + 0.5, ay, a.position.z + 0.5),
        new THREE.Vector3((a.position.x + b.position.x + 1) / 2, middleY, (a.position.z + b.position.z + 1) / 2),
        new THREE.Vector3(b.position.x + 0.5, by, b.position.z + 0.5),
      ]);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      const color = new THREE.Color(index % 2 === 0 ? 0xc78cff : 0x79e2df);
      const material = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.16,
        gapSize: 0.10,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      const pairGroup = new THREE.Group();
      pairGroup.userData.teleportPairIds = [pair.first.id, pair.second.id];
      pairGroup.add(line, endpoint(a.position.x + 0.5, ay, a.position.z + 0.5, color), endpoint(b.position.x + 0.5, by, b.position.z + 0.5, color));
      this.group.add(pairGroup);
    }
    this.applyFocus();
  }

  dispose(): void { this.disposeChildren(); }

  private updateVisibility(): void {
    this.group.visible = this.#editMode && this.#editor?.tool === 'teleport-pair';
  }

  private applyFocus(): void {
    for (const pairGroup of this.group.children) {
      const ids = pairGroup.userData.teleportPairIds as readonly string[] | undefined;
      const focused = !this.#focusedEntityId || Boolean(ids?.includes(this.#focusedEntityId));
      pairGroup.scale.setScalar(focused && this.#focusedEntityId ? 1.06 : 1);
      pairGroup.traverse((object) => {
        if (object instanceof THREE.Line && object.material instanceof THREE.LineDashedMaterial) {
          object.material.opacity = focused ? 0.92 : 0.18;
        } else if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) {
          object.material.opacity = focused ? 0.78 : 0.14;
        }
      });
    }
  }

  private disposeChildren(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Line || object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.group.clear();
  }
}

function endpoint(x: number, y: number, z: number, color: THREE.Color): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.42, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}
