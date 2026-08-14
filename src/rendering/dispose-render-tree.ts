import * as THREE from 'three';
import { releaseMaterialProgramTexture } from './material-program-texture';

export function disposeRenderTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.geometry.userData.sharedCatalogueResource) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const map = materialMap(material);
      if (map) releaseMaterialProgramTexture(map);
      if (!material.userData.sharedCatalogueResource) material.dispose();
    }
  });
}

function materialMap(material: THREE.Material): THREE.Texture | null {
  if (!('map' in material)) return null;
  const map = (material as THREE.Material & { map?: unknown }).map;
  return map instanceof THREE.Texture ? map : null;
}
