import * as THREE from 'three';

export function createTileHoverIndicator(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tile-hover-indicator';
  group.visible = false;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.82),
    new THREE.MeshBasicMaterial({ color: 0xb9e7ff, transparent: true, opacity: 0.13, depthWrite: false, toneMapped: false }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.018;
  fill.userData.hoverBaseColor = 0xb9e7ff;
  group.add(fill);

  addFrame(group, 0.98, 0.10, 0xffffff, 0.021);
  addFrame(group, 0.82, 0.035, 0x9fdcff, 0.024);
  return group;
}

function addFrame(group: THREE.Group, size: number, thickness: number, color: number, y: number): void {
  const material = new THREE.MeshBasicMaterial({ color, depthWrite: false, toneMapped: false });
  for (const z of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(size, thickness), material);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, y, z * (size - thickness) / 2);
    strip.userData.hoverBaseColor = color;
    group.add(strip);
  }
  for (const x of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(thickness, size - thickness * 2), material);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x * (size - thickness) / 2, y, 0);
    strip.userData.hoverBaseColor = color;
    group.add(strip);
  }
}

export function setTileHoverValidity(group: THREE.Group, valid: boolean): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return;
    const base = object.userData.hoverBaseColor;
    if (typeof base === 'number') object.material.color.set(valid ? base : 0xef6262);
  });
}
