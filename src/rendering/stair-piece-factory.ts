import * as THREE from 'three';
import { glassMaterial, palette, toon } from './materials';
import { tagMaterialSlot } from './object-material-appearance';

const RISE = 0.56;
const WIDTH = 0.78;
const RUN = 0.88;

export function createBlockStepsVisual(): THREE.Group {
  const group = new THREE.Group();
  const material = toon(palette.woodLight, 'wood');
  for (let i = 0; i < 4; i += 1) {
    const depth = RUN / 4;
    const height = RISE * ((i + 1) / 4);
    const tread = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(WIDTH, height, depth + 0.025), material.clone()), 'structure');
    tread.position.set(0, height / 2, -RUN / 2 + depth * (i + 0.5));
    group.add(tread);
  }
  return group;
}

export function createGlassStairsVisual(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const tread = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.055, 0.20), glassMaterial()), 'treads');
    tread.position.set(0, 0.06 + t * RISE, -RUN / 2 + t * RUN);
    group.add(tread);
  }
  const postMaterial = toon(0x8ea5a9, 'metal');
  for (const x of [-0.34, 0.34]) {
    const post = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(0.045, RISE + 0.30, 0.045), postMaterial.clone()), 'frame');
    post.position.set(x, (RISE + 0.30) / 2, 0.32);
    group.add(post);
  }
  return group;
}

export function createMetalStairsVisual(): THREE.Group {
  const group = new THREE.Group();
  const treadMaterial = toon(palette.metal, 'metal');
  const frameMaterial = toon(0x485d63, 'metal');
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const tread = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.07, 0.18), treadMaterial.clone()), 'treads');
    tread.position.set(0, 0.055 + t * RISE, -RUN / 2 + t * RUN);
    group.add(tread);
  }
  for (const x of [-0.34, 0.34]) {
    const stringer = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 1.03), frameMaterial.clone()), 'frame');
    stringer.position.set(x, RISE / 2, 0);
    stringer.rotation.x = -Math.atan2(RISE, RUN);
    group.add(stringer);
  }
  return group;
}

export function createMetalRampVisual(): THREE.Group {
  const group = new THREE.Group();
  const angle = -Math.atan2(RISE, RUN);
  const length = Math.hypot(RISE, RUN);
  const ramp = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.085, length), toon(palette.metal, 'metal')), 'deck');
  ramp.position.set(0, RISE / 2 + 0.035, 0);
  ramp.rotation.x = angle;
  group.add(ramp);
  for (const x of [-0.36, 0.36]) {
    const rail = tagMaterialSlot(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, length), toon(0x455c63, 'metal')), 'frame');
    rail.position.set(x, RISE / 2 + 0.27, 0);
    rail.rotation.x = angle;
    group.add(rail);
  }
  return group;
}
