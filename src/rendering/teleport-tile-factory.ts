import * as THREE from 'three';
import { toon } from './materials';

export function createTeleportTileVisual(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.47, 0.08, 8), toon(0x314b57, 'metal'));
  base.position.y = 0.04;
  group.add(base);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.035, 12),
    new THREE.MeshBasicMaterial({ color: 0x72e4db, toneMapped: false }),
  );
  core.position.y = 0.095;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.045, 4, 12),
    new THREE.MeshBasicMaterial({ color: 0xc88cff, toneMapped: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.115;
  group.add(ring);

  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.10), toon(0xd0a247, 'metal'));
    marker.position.set(Math.cos(angle) * 0.36, 0.13, Math.sin(angle) * 0.36);
    group.add(marker);
  }
  return group;
}
