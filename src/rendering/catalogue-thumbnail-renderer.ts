import * as THREE from 'three';
import type { AppearanceComponent } from '../domain/material-design';
import { releaseMaterialProgramTexture } from './material-program-texture';
import { createObjectVisual } from './object-factory';

const THUMBNAIL_SIZE = 112;
/** Rotate authored forward (-Z) toward the viewer's front-right. */
export const CATALOGUE_PREVIEW_OBJECT_YAW = -Math.PI / 2;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;

export function catalogueThumbnail(prototypeId: string, appearance?: AppearanceComponent | null): string {
  const cacheable = !appearance || Object.keys(appearance.materials).length === 0;
  const cached = cacheable ? cache.get(prototypeId) : undefined;
  if (cached) return cached;
  const preview = ensurePreviewScene();
  const object = createObjectVisual(prototypeId, appearance ?? undefined, cacheable);
  object.rotation.y = CATALOGUE_PREVIEW_OBJECT_YAW;
  preview.scene.add(object);
  frameObject(preview.camera, object);
  preview.renderer.render(preview.scene, preview.camera);
  const url = preview.renderer.domElement.toDataURL('image/png');
  preview.scene.remove(object);
  disposePreviewObject(object);
  if (cacheable) cache.set(prototypeId, url);
  return url;
}

function ensurePreviewScene() {
  if (renderer && scene && camera) return { renderer, scene, camera };
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const key = new THREE.DirectionalLight(0xfff4df, 2.15);
  key.position.set(4, 7, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdaf2f6, 0.42);
  fill.position.set(-4, 4, -3);
  scene.add(fill);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  return { renderer, scene, camera };
}

function frameObject(previewCamera: THREE.OrthographicCamera, object: THREE.Object3D): void {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(Math.max(size.x, size.z, 0.7) * 0.72, Math.max(size.y, 0.7) * 0.72, 0.65) * 1.18;
  previewCamera.left = -extent;
  previewCamera.right = extent;
  previewCamera.top = extent;
  previewCamera.bottom = -extent;
  const yaw = Math.PI / 4;
  const elevation = Math.PI / 6;
  const distance = Math.max(7, Math.max(size.x, size.y, size.z) * 5);
  const horizontalDistance = Math.cos(elevation) * distance;
  previewCamera.position.set(
    center.x + Math.cos(yaw) * horizontalDistance,
    center.y + Math.sin(elevation) * distance,
    center.z + Math.sin(yaw) * horizontalDistance,
  );
  previewCamera.lookAt(center.x, center.y + size.y * 0.03, center.z);
  previewCamera.updateProjectionMatrix();
}

function disposePreviewObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if ('map' in material) releaseMaterialProgramTexture((material as THREE.MeshBasicMaterial).map);
      if (!material.userData.sharedCatalogueResource) material.dispose();
    }
  });
}
