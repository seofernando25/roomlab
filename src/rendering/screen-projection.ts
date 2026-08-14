import * as THREE from 'three';

export function projectWorldPointToCanvas(
  point: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  point.project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (point.x + 1) * rect.width / 2,
    y: rect.top + (1 - point.y) * rect.height / 2,
  };
}
