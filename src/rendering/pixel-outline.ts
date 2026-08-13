import * as THREE from 'three';

/** Silhouette-only backface contour; never exposes mesh triangulation or bevel topology. */
export function addPixelOutline(mesh: THREE.Mesh, scale = 1.050): void {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (bounds) {
    const size = new THREE.Vector3();
    bounds.getSize(size);
    if (Math.max(size.x, size.y, size.z) < 0.18 || Math.min(size.x, size.y, size.z) < 0.028) return;
  }

  const material = new THREE.MeshBasicMaterial({
    color: 0x111719,
    side: THREE.BackSide,
    toneMapped: false,
    depthWrite: false,
  });
  const silhouette = new THREE.Mesh(mesh.geometry, material);
  silhouette.name = 'pixel-outline';
  silhouette.scale.setScalar(scale);
  silhouette.renderOrder = -1;
  mesh.add(silhouette);
}
