import * as THREE from 'three';
import type { CellAddress, WorldState } from '../domain/types';

export function createSelectionMarker(width: number, depth: number): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x62e6a7, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 13;
  marker.raycast = () => {};
  return marker;
}

export function updateSelectionMarker(marker: THREE.Mesh, _state: WorldState, address: CellAddress, width: number, depth: number, y: number, valid: boolean): void {
  marker.position.set(
    address.position.x + width / 2,
    y + 0.014,
    address.position.z + depth / 2,
  );
  const material = marker.material as THREE.MeshBasicMaterial;
  material.color.set(valid ? 0x62e6a7 : 0xe35d61);
  material.opacity = valid ? 0.30 : 0.42;
}

export function disposeSelectionMarker(marker: THREE.Mesh | null): void {
  if (!marker) return;
  marker.geometry.dispose();
  (marker.material as THREE.Material).dispose();
}
