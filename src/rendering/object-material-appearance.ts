import * as THREE from 'three';
import { materialAppearanceKey, type AppearanceComponent } from '../domain/material-design';
import { materialProgramTexture } from './material-program-texture';

export function tagMaterialSlot<T extends THREE.Object3D>(object: T, slotId?: string): T {
  if (slotId) object.userData.materialSlot = slotId;
  return object;
}

export function applyObjectAppearance(root: THREE.Object3D, appearance?: AppearanceComponent, cacheTextures = true): void {
  root.userData.appearanceKey = materialAppearanceKey(appearance);
  if (!appearance) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const slotId = typeof object.userData.materialSlot === 'string' ? object.userData.materialSlot : '';
    const style = appearance.materials[slotId];
    if (!style) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = source.map((material) => customizedMaterial(material, style, cacheTextures));
    for (const material of source) material.dispose();
    object.material = Array.isArray(object.material) ? replacements : replacements[0]!;
  });
}

export function materialSlotsInVisual(root: THREE.Object3D): readonly string[] {
  const ids = new Set<string>();
  root.traverse((object) => {
    if (typeof object.userData.materialSlot === 'string') ids.add(object.userData.materialSlot);
  });
  return [...ids].sort();
}

function customizedMaterial(material: THREE.Material, style: AppearanceComponent['materials'][string], cacheTextures: boolean): THREE.Material {
  const copy = material.clone();
  const texture = materialProgramTexture(style, cacheTextures);
  if (copy instanceof THREE.MeshToonMaterial || copy instanceof THREE.MeshBasicMaterial
    || copy instanceof THREE.MeshLambertMaterial || copy instanceof THREE.MeshPhongMaterial
    || copy instanceof THREE.MeshStandardMaterial) {
    copy.color.set(0xffffff);
    copy.map = texture;
    copy.needsUpdate = true;
  }
  return copy;
}
