import * as THREE from 'three';

/** Adds restrained baked top/left edge accents instead of relying on real-time cast shadows. */
export function addTopEdgeHighlights(
  mesh: THREE.Mesh,
  width: number,
  height: number,
  depth: number,
  color: THREE.ColorRepresentation,
): void {
  if (width < 0.28 || depth < 0.22 || height < 0.10) return;

  const highlight = new THREE.Color(color).offsetHSL(0, -0.04, 0.15);
  const material = new THREE.MeshBasicMaterial({ color: highlight, toneMapped: false });
  const thickness = Math.min(0.026, height * 0.12);
  const inset = Math.min(0.055, Math.min(width, depth) * 0.12);
  const y = height / 2 + thickness * 0.54;

  const front = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.08, width - inset * 2), thickness, 0.025),
    material,
  );
  front.position.set(0, y, -depth / 2 + inset);

  const left = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, thickness, Math.max(0.08, depth - inset * 2)),
    material,
  );
  left.position.set(-width / 2 + inset, y, 0);
  mesh.add(front, left);
}
