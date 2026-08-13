import * as THREE from 'three';
import { getEntityPrototype } from '../domain/prototype-registry';
import { FLOOR_STEP_HEIGHT, floorWorldY } from '../domain/room-topology';
import type { CellAddress, PrototypeId, RotationQuarter, WorldState } from '../domain/types';
import { createObjectVisual } from './object-factory';

export class ObjectPlacementGhost {
  readonly group = new THREE.Group();
  #prototypeId: PrototypeId | null = null;
  #visual: THREE.Group | null = null;

  constructor() {
    this.group.name = 'object-placement-ghost';
    this.group.visible = false;
  }

  show(
    state: WorldState,
    prototypeId: PrototypeId,
    address: CellAddress,
    rotation: RotationQuarter,
    valid: boolean,
    elevationSteps = 0,
  ): void {
    if (this.#prototypeId !== prototypeId || !this.#visual) this.rebuild(prototypeId);
    const base = getEntityPrototype(prototypeId).spatial?.footprint ?? { width: 1, depth: 1 };
    const footprint = rotation % 2 === 1 ? { width: base.depth, depth: base.width } : base;
    this.group.position.set(
      address.position.x + footprint.width / 2,
      floorWorldY(state.topology, address) + elevationSteps * FLOOR_STEP_HEIGHT + 0.014,
      address.position.z + footprint.depth / 2,
    );
    this.group.rotation.y = -rotation * Math.PI / 2;
    this.applyValidity(valid);
    this.group.visible = true;
  }

  hide(): void { this.group.visible = false; }

  dispose(): void {
    if (this.#visual) disposeTree(this.#visual);
    this.group.clear();
    this.#visual = null;
    this.#prototypeId = null;
  }

  private rebuild(prototypeId: PrototypeId): void {
    if (this.#visual) {
      this.group.remove(this.#visual);
      disposeTree(this.#visual);
    }
    const visual = createObjectVisual(prototypeId);
    visual.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const cloned = materials.map((material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.opacity = 0.48;
        copy.depthWrite = false;
        if ('color' in copy && copy.color instanceof THREE.Color) copy.userData.previewBaseColor = copy.color.clone();
        return copy;
      });
      object.material = Array.isArray(object.material) ? cloned : cloned[0]!;
    });
    this.#prototypeId = prototypeId;
    this.#visual = visual;
    this.group.add(visual);
  }

  private applyValidity(valid: boolean): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.opacity = valid ? 0.52 : 0.30;
        if (!('color' in material) || !(material.color instanceof THREE.Color)) continue;
        const base = material.userData.previewBaseColor as THREE.Color | undefined;
        if (!base) continue;
        material.color.copy(base);
        if (!valid) material.color.lerp(new THREE.Color(0xef6262), 0.65);
      }
    });
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
