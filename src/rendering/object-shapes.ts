import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { palette, toon } from './materials';
import { addTopEdgeHighlights } from './mesh-highlights';
import { tagMaterialSlot } from './object-material-appearance';
import { addPixelOutline } from './pixel-outline';
import type { SurfacePattern } from './procedural-textures';

export type MeshGroup = THREE.Group;

export function block(
  width: number, height: number, depth: number, color: THREE.ColorRepresentation,
  x: number, y: number, z: number, pattern?: SurfacePattern, slotId?: string,
): THREE.Mesh {
  const radius = Math.min(0.085, width / 4, height / 4, depth / 4);
  const mesh = tagMaterialSlot(new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), toon(color, pattern)), slotId);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  addTopEdgeHighlights(mesh, width, height, depth, color);
  if (slotId) for (const child of mesh.children) tagMaterialSlot(child, slotId);
  addPixelOutline(mesh);
  return mesh;
}

export function cylinder(
  top: number, bottom: number, height: number, color: THREE.ColorRepresentation,
  x: number, y: number, z: number, sides = 8, pattern?: SurfacePattern, slotId?: string,
): THREE.Mesh {
  const mesh = tagMaterialSlot(new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), toon(color, pattern)), slotId);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  addPixelOutline(mesh, 1.045);
  return mesh;
}

export function ellipsoid(
  radius: number, color: THREE.ColorRepresentation, x: number, y: number, z: number,
  scale: readonly [number, number, number], slotId?: string,
): THREE.Mesh {
  const mesh = tagMaterialSlot(new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), toon(color, 'leaf')), slotId);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  addPixelOutline(mesh, 1.025);
  return mesh;
}

export function addLegs(
  group: MeshGroup, width: number, depth: number, height: number,
  color: THREE.ColorRepresentation = palette.woodDark, slotId?: string,
): void {
  const x = width / 2 - 0.12; const z = depth / 2 - 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    group.add(block(0.15, height, 0.15, color, sx * x, height / 2, sz * z, undefined, slotId));
  }
}
