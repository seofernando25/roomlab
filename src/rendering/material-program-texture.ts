import * as THREE from 'three';
import type { MaterialLayer, MaterialStyle } from '../domain/material-design';

const liveTextureCache = new Map<string, THREE.DataTexture>();

export function materialProgramTexture(style: MaterialStyle, cache = true): THREE.DataTexture {
  const key = JSON.stringify(style);
  const existing = cache ? liveTextureCache.get(key) : undefined;
  if (existing) return existing;
  const { program } = style;
  const size = program.resolution;
  const data = new Uint8Array(size * size * 4);
  const base = colorRgb(program.baseColor);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let pixel = base;
      for (const layer of program.layers) {
        const coverage = layerCoverage(layer, x, y);
        if (coverage <= 0) continue;
        pixel = blend(pixel, colorRgb(layer.color), layer.opacity * coverage);
      }
      const offset = (y * size + x) * 4;
      data[offset] = pixel[0]; data[offset + 1] = pixel[1]; data[offset + 2] = pixel[2]; data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style.repeatX, style.repeatY);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.materialRecipeTexture = true;
  texture.userData.sharedMaterialRecipe = cache;
  if (cache) liveTextureCache.set(key, texture);
  return texture;
}

export function disposeTransientMaterialTexture(texture: THREE.Texture | null): void {
  if (texture?.userData.materialRecipeTexture && !texture.userData.sharedMaterialRecipe) texture.dispose();
}

function layerCoverage(layer: MaterialLayer, x: number, y: number): number {
  if (layer.kind === 'stripes') {
    const coordinate = layer.angle === 0 ? x : layer.angle === 90 ? y : layer.angle === 45 ? x + y : x - y;
    return mod(coordinate, layer.spacing) < layer.thickness ? 1 : 0;
  }
  if (layer.kind === 'checker') return (Math.floor(x / layer.size) + Math.floor(y / layer.size)) % 2 === 0 ? 1 : 0;
  if (layer.kind === 'grid') return mod(x, layer.spacing) < layer.thickness || mod(y, layer.spacing) < layer.thickness ? 1 : 0;
  if (layer.kind === 'dots') {
    const row = Math.floor(y / layer.spacing);
    const offset = layer.stagger && row % 2 !== 0 ? layer.spacing / 2 : 0;
    const cx = Math.floor((x - offset) / layer.spacing) * layer.spacing + offset + layer.spacing / 2;
    const cy = row * layer.spacing + layer.spacing / 2;
    return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= layer.radius ? 1 : 0;
  }
  if (layer.kind === 'speckles') {
    const cellX = Math.floor(x / layer.size); const cellY = Math.floor(y / layer.size);
    return hash(cellX, cellY, layer.seed) / 0xffffffff < layer.density ? 1 : 0;
  }
  const wobble = (hash(Math.floor(x / 3), 0, layer.seed) % 5) - 2;
  const band = mod(y + wobble, layer.spacing);
  const pore = hash(x, y, layer.seed + 19) % 43 === 0;
  return band < layer.thickness || pore ? 1 : 0;
}

type Rgb = readonly [number, number, number];
function colorRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
function blend(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}
function mod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 17 + seed, 374761393) ^ Math.imul(y + 29 + seed * 3, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}
