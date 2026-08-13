import * as THREE from 'three';
import { proceduralTexture, type SurfacePattern } from './procedural-textures';

const toonGradient = new THREE.DataTexture(
  new Uint8Array([
    120, 120, 120, 255,
    188, 188, 188, 255,
    232, 232, 232, 255,
    255, 255, 255, 255,
  ]),
  4,
  1,
  THREE.RGBAFormat,
);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

export const palette = {
  floorA: 0xc49b6d,
  floorB: 0xb48660,
  grout: 0x674f3d,
  wall: 0xb6c9b8,
  wallAlt: 0xa6bcae,
  wallTrim: 0x557d72,
  wood: 0x8a573a,
  woodDark: 0x5b392a,
  woodLight: 0xd18a4f,
  mint: 0x64bea0,
  mintDark: 0x347b69,
  blue: 0x5ba3bd,
  blueDark: 0x376d83,
  mustard: 0xd0a247,
  orange: 0xce7850,
  burgundy: 0xa34f5d,
  cream: 0xf3dfb0,
  porcelain: 0xe8f2eb,
  metal: 0x7e9296,
  leaf: 0x4d9656,
  soil: 0x5d4432,
  red: 0xb94c45,
} as const;

export function toon(
  color: THREE.ColorRepresentation,
  pattern?: SurfacePattern,
  repeatX = 1,
  repeatY = 1,
): THREE.MeshToonMaterial {
  const resolvedPattern = pattern ?? inferPattern(color);
  return new THREE.MeshToonMaterial({
    color,
    map: proceduralTexture(resolvedPattern, repeatX, repeatY),
    gradientMap: toonGradient,
  });
}

export function unlitSurface(
  color: THREE.ColorRepresentation,
  pattern: SurfacePattern,
  repeatX = 1,
  repeatY = 1,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: proceduralTexture(pattern, repeatX, repeatY),
    toneMapped: false,
  });
}

export function wallMaterial(
  color: THREE.ColorRepresentation,
  pattern: Extract<SurfacePattern, 'brick' | 'wallpaper'>,
  repeatX: number,
  repeatY: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: proceduralTexture(pattern, repeatX, repeatY),
    toneMapped: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });
}

export function glassMaterial(repeatX = 1, repeatY = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: proceduralTexture('glass', repeatX, repeatY),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function inferPattern(color: THREE.ColorRepresentation): SurfacePattern {
  if (color === palette.wood || color === palette.woodDark || color === palette.woodLight) return 'wood';
  if (color === palette.metal) return 'metal';
  if (color === palette.porcelain) return 'ceramic';
  if (color === palette.leaf) return 'leaf';
  if (color === palette.cream) return 'paint';
  return 'fabric';
}

