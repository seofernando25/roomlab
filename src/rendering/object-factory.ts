import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getEntityPrototype } from '../domain/prototype-registry';
import { palette, toon } from './materials';
import { addTopEdgeHighlights } from './mesh-highlights';
import { addPixelOutline } from './pixel-outline';
import type { SurfacePattern } from './procedural-textures';
import { createTeleportTileVisual } from './teleport-tile-factory';
import {
  createBlockStepsVisual,
  createGlassStairsVisual,
  createMetalRampVisual,
  createMetalStairsVisual,
} from './stair-piece-factory';

type MeshGroup = THREE.Group;

function block(
  width: number,
  height: number,
  depth: number,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
  pattern?: SurfacePattern,
): THREE.Mesh {
  const radius = Math.min(0.085, width / 4, height / 4, depth / 4);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), toon(color, pattern));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addTopEdgeHighlights(mesh, width, height, depth, color);
  addPixelOutline(mesh);
  return mesh;
}

function cylinder(
  top: number,
  bottom: number,
  height: number,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
  sides = 8,
  pattern?: SurfacePattern,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), toon(color, pattern));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addPixelOutline(mesh, 1.045);
  return mesh;
}

function ellipsoid(
  radius: number,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
  scale: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), toon(color, 'leaf'));
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  addPixelOutline(mesh, 1.025);
  return mesh;
}

function addLegs(group: MeshGroup, width: number, depth: number, height: number, color = palette.woodDark): void {
  const x = width / 2 - 0.12;
  const z = depth / 2 - 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) group.add(block(0.15, height, 0.15, color, sx * x, height / 2, sz * z));
  }
}

function chair(): MeshGroup {
  const group = new THREE.Group();
  addLegs(group, 0.78, 0.72, 0.32);
  group.add(block(0.86, 0.26, 0.78, palette.burgundy, 0, 0.40, 0));
  group.add(block(0.70, 0.16, 0.62, palette.mustard, 0, 0.57, -0.03));
  group.add(block(0.58, 0.025, 0.48, palette.cream, 0, 0.665, -0.03));
  group.add(block(0.86, 0.64, 0.18, palette.burgundy, 0, 0.82, 0.31));
  group.add(block(0.66, 0.36, 0.10, palette.orange, 0, 0.84, 0.20));
  group.add(block(0.58, 0.035, 0.04, palette.woodDark, 0, 0.60, -0.30));
  group.add(block(0.14, 0.42, 0.74, palette.woodDark, -0.38, 0.58, 0));
  group.add(block(0.14, 0.42, 0.74, palette.woodDark, 0.38, 0.58, 0));
  return group;
}

function stool(): MeshGroup {
  const group = new THREE.Group();
  addLegs(group, 0.56, 0.56, 0.38, palette.woodDark);
  group.add(block(0.68, 0.24, 0.68, palette.blue, 0, 0.49, 0));
  group.add(block(0.54, 0.10, 0.54, palette.cream, 0, 0.66, 0));
  return group;
}

function table(): MeshGroup {
  const group = new THREE.Group();
  addLegs(group, 1.72, 0.72, 0.56);
  group.add(block(1.88, 0.22, 0.86, palette.wood, 0, 0.66, 0));
  group.add(block(1.70, 0.08, 0.68, palette.woodLight, 0, 0.81, 0));
  group.add(block(0.62, 0.045, 0.58, palette.burgundy, 0, 0.875, 0));
  group.add(block(1.58, 0.14, 0.08, palette.woodDark, 0, 0.53, 0.39));
  group.add(block(0.42, 0.055, 0.24, palette.blue, -0.42, 0.89, -0.10));
  group.add(block(0.34, 0.045, 0.20, palette.mustard, -0.38, 0.94, -0.08));
  group.add(cylinder(0.075, 0.09, 0.14, palette.cream, 0.48, 0.96, -0.07, 8));
  group.add(cylinder(0.18, 0.18, 0.035, palette.cream, 0.18, 0.91, 0.15, 12));
  group.add(cylinder(0.09, 0.12, 0.18, palette.orange, 0.18, 1.01, 0.15, 8));
  group.add(block(0.30, 0.035, 0.18, palette.cream, 0.68, 0.90, 0.20));
  group.add(block(0.24, 0.025, 0.14, palette.blue, 0.70, 0.94, 0.20));
  return group;
}

function sofa(): MeshGroup {
  const group = new THREE.Group();
  group.add(block(1.92, 0.34, 0.88, palette.blueDark, 0, 0.26, 0));
  group.add(block(0.76, 0.30, 0.70, palette.blue, -0.40, 0.50, -0.02));
  group.add(block(0.76, 0.30, 0.70, palette.blue, 0.40, 0.50, -0.02));
  group.add(block(0.62, 0.025, 0.56, palette.cream, -0.40, 0.665, -0.02));
  group.add(block(0.62, 0.025, 0.56, palette.cream, 0.40, 0.665, -0.02));
  group.add(block(1.82, 0.72, 0.20, palette.blueDark, 0, 0.82, 0.33));
  group.add(block(0.74, 0.44, 0.12, palette.mint, -0.39, 0.82, 0.22));
  group.add(block(0.74, 0.44, 0.12, palette.mustard, 0.39, 0.82, 0.22));
  group.add(block(0.035, 0.22, 0.48, palette.cream, 0, 0.52, -0.15));
  group.add(block(0.18, 0.58, 0.88, palette.woodDark, -0.91, 0.48, 0));
  group.add(block(0.18, 0.58, 0.88, palette.woodDark, 0.91, 0.48, 0));
  group.add(block(1.46, 0.035, 0.045, palette.cream, 0, 1.055, 0.24));
  return group;
}

function bookcase(): MeshGroup {
  const group = new THREE.Group();
  group.add(block(1.88, 1.62, 0.22, palette.woodDark, 0, 0.81, 0.29));
  group.add(block(0.16, 1.68, 0.52, palette.wood, -0.86, 0.84, 0.05));
  group.add(block(0.16, 1.68, 0.52, palette.wood, 0.86, 0.84, 0.05));
  for (const y of [0.18, 0.62, 1.06, 1.50]) group.add(block(1.76, 0.14, 0.52, palette.woodLight, 0, y, 0.05));
  const colors = [palette.burgundy, palette.mustard, palette.blue, palette.mint, palette.orange] as const;
  for (let shelf = 0; shelf < 3; shelf += 1) {
    for (let i = 0; i < 6; i += 1) {
      const height = 0.23 + ((i + shelf) % 3) * 0.035;
      group.add(block(0.17, height, 0.30, colors[(i + shelf) % colors.length]!, -0.62 + i * 0.25, 0.33 + shelf * 0.44, -0.03, 'paint'));
    }
  }
  group.add(block(1.62, 0.035, 0.045, palette.cream, 0, 1.64, -0.18));
  group.add(cylinder(0.13, 0.16, 0.20, palette.orange, 0.58, 1.78, 0.02, 8, 'ceramic'));
  group.add(ellipsoid(0.19, palette.leaf, 0.51, 2.02, 0.02, [0.55, 1.0, 0.35]));
  group.add(ellipsoid(0.17, 0x74b05c, 0.70, 1.98, 0.02, [0.55, 1.0, 0.35]));
  group.add(block(0.34, 0.34, 0.08, palette.cream, -0.55, 1.86, -0.05));
  group.add(block(0.08, 0.22, 0.10, palette.burgundy, -0.55, 1.86, -0.10));
  return group;
}

function lamp(): MeshGroup {
  const group = new THREE.Group();
  group.add(cylinder(0.28, 0.34, 0.14, palette.woodDark, 0, 0.07, 0, 8));
  group.add(block(0.12, 1.18, 0.12, palette.wood, 0, 0.66, 0));
  group.add(cylinder(0.24, 0.38, 0.48, palette.mustard, 0, 1.34, 0, 4));
  group.add(block(0.18, 0.10, 0.18, palette.cream, 0, 1.12, 0));
  return group;
}

function kitchen(): MeshGroup {
  const group = new THREE.Group();
  group.add(block(1.92, 0.82, 0.86, palette.cream, 0, 0.41, 0, 'paint'));
  group.add(block(1.98, 0.14, 0.92, palette.woodDark, 0, 0.89, 0));
  group.add(block(1.78, 0.035, 0.055, palette.cream, 0, 0.98, -0.405));
  for (const x of [-0.49, 0.49]) {
    const doorColor = x < 0 ? palette.mint : palette.orange;
    const insetColor = x < 0 ? 0x8bc8b3 : 0xdf9a75;
    group.add(block(0.82, 0.64, 0.07, doorColor, x, 0.42, 0.465, 'paint'));
    group.add(block(0.62, 0.44, 0.025, insetColor, x, 0.42, 0.515, 'paint'));
    group.add(block(0.10, 0.08, 0.05, palette.metal, x, 0.47, 0.51, 'metal'));
  }
  group.add(block(0.80, 0.05, 0.60, 0x263239, 0.47, 0.99, -0.02, 'metal'));
  for (const x of [0.25, 0.68]) for (const z of [-0.18, 0.18]) group.add(cylinder(0.09, 0.09, 0.04, 0x12191d, x, 1.03, z, 8, 'metal'));
  for (const x of [-0.72, -0.52, -0.32]) group.add(cylinder(0.035, 0.035, 0.06, palette.metal, x, 0.91, 0.47, 8, 'metal'));
  group.add(block(0.34, 0.20, 0.04, 0x293b43, -0.48, 0.48, 0.505, 'metal'));
  group.add(cylinder(0.12, 0.16, 0.28, palette.metal, -0.70, 1.08, -0.08, 10, 'metal'));
  group.add(block(0.20, 0.05, 0.18, palette.woodLight, -0.15, 1.03, -0.16));
  group.add(cylinder(0.055, 0.07, 0.22, palette.red, -0.08, 1.16, 0.18, 8, 'paint'));
  group.add(block(0.25, 0.10, 0.18, palette.mustard, -0.42, 1.04, -0.18, 'paint'));
  group.add(block(0.18, 0.05, 0.13, palette.cream, -0.42, 1.12, -0.18));
  return group;
}

function sink(): MeshGroup {
  const group = new THREE.Group();
  group.add(block(0.84, 0.70, 0.68, palette.blueDark, 0, 0.36, 0.07, 'paint'));
  group.add(block(0.78, 0.18, 0.64, palette.porcelain, 0, 0.80, 0.02, 'ceramic'));
  group.add(block(0.48, 0.05, 0.38, 0x75999b, 0, 0.91, 0.00, 'metal'));
  group.add(block(0.08, 0.34, 0.08, palette.metal, 0, 1.04, 0.22, 'metal'));
  group.add(block(0.30, 0.08, 0.08, palette.metal, 0, 1.17, 0.11, 'metal'));
  return group;
}

function toilet(): MeshGroup {
  const group = new THREE.Group();
  group.add(block(0.62, 0.58, 0.30, palette.porcelain, 0, 0.64, 0.27));
  group.add(block(0.68, 0.28, 0.74, palette.porcelain, 0, 0.29, -0.04));
  group.add(block(0.58, 0.10, 0.58, 0xc7ddd5, 0, 0.49, -0.08));
  group.add(block(0.36, 0.055, 0.34, palette.blueDark, 0, 0.56, -0.08));
  return group;
}

function plant(): MeshGroup {
  const group = new THREE.Group();
  group.add(cylinder(0.27, 0.34, 0.42, palette.orange, 0, 0.21, 0, 8, 'ceramic'));
  group.add(block(0.46, 0.07, 0.46, palette.soil, 0, 0.45, 0, 'paint'));
  for (const stemX of [-0.11, 0.08]) group.add(cylinder(0.045, 0.055, 0.82, 0x416e43, stemX, 0.86, 0, 7, 'leaf'));
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const leaf = ellipsoid(
      0.25,
      i % 2 ? palette.leaf : 0x74b05c,
      Math.cos(angle) * 0.26,
      1.03 + (i % 4) * 0.12,
      Math.sin(angle) * 0.26,
      [0.52, 1.18, 0.34],
    );
    leaf.rotation.z = angle * 0.28 - 0.4;
    leaf.rotation.y = -angle;
    group.add(leaf);
  }
  return group;
}

function vase(): MeshGroup {
  const group = new THREE.Group();
  group.add(cylinder(0.17, 0.23, 0.34, palette.orange, 0, 0.17, 0, 10, 'ceramic'));
  group.add(cylinder(0.12, 0.15, 0.20, palette.cream, 0, 0.43, 0, 10, 'ceramic'));
  group.add(cylinder(0.17, 0.12, 0.08, palette.blue, 0, 0.57, 0, 10, 'ceramic'));
  group.add(ellipsoid(0.13, palette.leaf, -0.07, 0.76, 0, [0.45, 1.25, 0.32]));
  group.add(ellipsoid(0.12, 0x74b05c, 0.09, 0.82, 0.01, [0.42, 1.18, 0.30]));
  return group;
}

const builders = {
  chair, stool, table, sofa, bookcase, lamp, kitchen, sink, toilet, plant, vase,
  'teleport-tile': createTeleportTileVisual,
  'stairs-block': createBlockStepsVisual,
  'stairs-glass': createGlassStairsVisual,
  'stairs-metal': createMetalStairsVisual,
  'ramp-metal': createMetalRampVisual,
} as const satisfies Readonly<Record<string, () => MeshGroup>>;

export function createObjectVisual(prototypeId: string): MeshGroup {
  const definition = getEntityPrototype(prototypeId);
  const asset = definition.renderable.asset as keyof typeof builders;
  const builder = builders[asset];
  if (!builder) throw new Error(`No procedural furniture builder registered for asset: ${definition.renderable.asset}`);
  const visual = builder();
  visual.name = 'object-visual';
  const footprint = definition.spatial?.footprint ?? { width: 1, depth: 1 };
  if (definition.capabilities?.traversal?.status === 'implemented') visual.scale.set(1, 1, 1);
  else visual.scale.set(1.025, 0.82, 1.025);
  const root = new THREE.Group();
  root.add(visual);
  if (definition.capabilities?.traversal?.status !== 'implemented') addDropShadow(root, footprint.width, footprint.depth);
  root.name = `object:${prototypeId}`;
  return root;
}

const contactShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x15191a,
  transparent: true,
  opacity: 0.46,
  depthWrite: false,
  toneMapped: false,
});
contactShadowMaterial.userData.sharedCatalogueResource = true;

const castShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x1d2020,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  toneMapped: false,
});
castShadowMaterial.userData.sharedCatalogueResource = true;

function addDropShadow(group: THREE.Group, width: number, depth: number): void {
  const cast = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.82, depth * 0.72),
    castShadowMaterial,
  );
  cast.rotation.x = -Math.PI / 2;
  cast.position.set(0, -0.006, 0);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.54, depth * 0.42),
    contactShadowMaterial,
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, -0.004, 0);
  group.add(cast, contact);
}
