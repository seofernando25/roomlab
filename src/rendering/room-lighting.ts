import * as THREE from 'three';

export function addRoomLighting(scene: THREE.Scene, width: number, depth: number): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.90));
  const key = new THREE.DirectionalLight(0xfff4df, 2.22);
  key.position.set(-width * 0.18, 11, depth * 0.42);
  key.target.position.set(width * 0.5, 0, depth * 0.5);
  key.castShadow = false;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdaf2f6, 0.46);
  fill.position.set(width + 5, 7, -depth * 0.25);
  fill.target.position.set(width * 0.45, 0.3, depth * 0.45);
  fill.castShadow = false;
  scene.add(fill, fill.target);
}
