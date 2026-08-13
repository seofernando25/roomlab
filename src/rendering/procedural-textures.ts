import * as THREE from 'three';

export type SurfacePattern =
  | 'brick'
  | 'woodFloor'
  | 'tile'
  | 'wallpaper'
  | 'wood'
  | 'fabric'
  | 'paint'
  | 'metal'
  | 'ceramic'
  | 'leaf'
  | 'rug'
  | 'glass';

const textureCache = new Map<string, THREE.DataTexture>();

export function proceduralTexture(
  pattern: SurfacePattern,
  repeatX = 1,
  repeatY = 1,
): THREE.DataTexture {
  const key = `${pattern}:${repeatX.toFixed(2)}:${repeatY.toFixed(2)}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = pattern === 'brick' || pattern === 'woodFloor' ? 128
    : pattern === 'tile' || pattern === 'wallpaper' ? 64
      : 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = samplePattern(pattern, x, y, size);
      const offset = (y * size + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

export function contactShadowTexture(): THREE.DataTexture {
  const cached = textureCache.get('contact-shadow');
  if (cached) return cached;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - size / 2) / (size / 2);
      const dy = (y + 0.5 - size / 2) / (size / 2);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.max(0, 1 - distance);
      const offset = (y * size + x) * 4;
      data[offset] = 28;
      data[offset + 1] = 34;
      data[offset + 2] = 36;
      data[offset + 3] = Math.round(alpha * alpha * 120);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  textureCache.set('contact-shadow', texture);
  return texture;
}

function samplePattern(pattern: SurfacePattern, x: number, y: number, size: number): readonly [number, number, number] {
  switch (pattern) {
    case 'brick': return brick(x, y);
    case 'woodFloor': return woodFloor(x, y);
    case 'tile': return tile(x, y);
    case 'wallpaper': return wallpaper(x, y);
    case 'wood': return wood(x, y);
    case 'fabric': return fabric(x, y, size);
    case 'paint': return paint(x, y);
    case 'metal': return metal(x, y);
    case 'ceramic': return ceramic(x, y);
    case 'leaf': return leaf(x, y);
    case 'rug': return rug(x, y);
    case 'glass': return glass(x, y);
  }
}

function brick(x: number, y: number): readonly [number, number, number] {
  const brickHeight = 16;
  const brickWidth = 32;
  const row = Math.floor(y / brickHeight);
  const localY = y % brickHeight;
  const shiftedX = (x + (row % 2) * (brickWidth / 2)) % brickWidth;
  const mortarY = localY < 2 || localY >= brickHeight - 2;
  const mortarX = shiftedX < 2 || shiftedX >= brickWidth - 2;
  if (mortarY || mortarX) return [104, 90, 76];
  const brickColumn = Math.floor((x + (row % 2) * (brickWidth / 2)) / brickWidth);
  const tone = (hash(brickColumn, row) % 19) - 9;
  const bevel = localY === 2 || shiftedX === 2 ? 18
    : localY === brickHeight - 3 || shiftedX === brickWidth - 3 ? -10
      : 0;
  return [181 + tone + bevel, 106 + Math.floor(tone / 3) + bevel, 70 + Math.floor(tone / 4) + bevel];
}

function woodFloor(x: number, y: number): readonly [number, number, number] {
  const plankHeight = 16;
  const boardLength = 64;
  const plank = Math.floor(y / plankHeight);
  const localY = y % plankHeight;
  if (localY < 2 || localY >= plankHeight - 2) return [66, 51, 40];
  const shiftedX = x + (plank % 2) * (boardLength / 2);
  const joint = shiftedX % boardLength;
  if (joint < 2 || joint >= boardLength - 2) return [72, 55, 42];
  const board = Math.floor(shiftedX / boardLength);
  const tone = (hash(board, plank) % 17) - 8;
  const grain = hash(Math.floor(x / 3), plank) % 13 === 0 ? -7 : hash(x, plank) % 4;
  const bevel = localY === 2 ? 10 : localY === plankHeight - 3 ? -6 : 0;
  return [132 + tone + grain + bevel, 102 + Math.floor(tone / 2) + grain + bevel, 77 + Math.floor(tone / 3) + grain + bevel];
}

function tile(x: number, y: number): readonly [number, number, number] {
  const tileX = Math.floor(x / 16);
  const tileY = Math.floor(y / 16);
  if (x % 16 < 2 || y % 16 < 2) return [211, 196, 180];
  const checker = (tileX + tileY) % 2;
  const tone = (hash(tileX, tileY) % 17) - 8;
  const fleck = hash(x * 5, y * 7) % 67 === 0 ? -18 : 0;
  const bevel = x % 16 === 2 || y % 16 === 2 ? 13 : x % 16 === 15 || y % 16 === 15 ? -8 : 0;
  return checker === 0
    ? [180 + tone + fleck + bevel, 111 + Math.floor(tone / 2) + fleck + bevel, 86 + Math.floor(tone / 3) + fleck + bevel]
    : [199 + tone + fleck + bevel, 135 + Math.floor(tone / 2) + fleck + bevel, 107 + Math.floor(tone / 3) + fleck + bevel];
}

function wallpaper(x: number, y: number): readonly [number, number, number] {
  const localX = x % 16;
  const localY = y % 16;
  const diamond = Math.abs(localX - 8) + Math.abs(localY - 8);
  if (diamond === 4 || diamond === 5) return [111, 166, 145];
  if ((localX === 8 && localY === 8) || (localX === 0 && localY === 0)) return [74, 127, 108];
  return x % 8 < 4 ? [207, 226, 205] : [190, 216, 196];
}

function wood(x: number, y: number): readonly [number, number, number] {
  const grain = (hash(x, y * 5) % 17) - 8;
  const band = y % 8 === 1 ? -18 : 0;
  const highlight = y % 8 === 5 ? 9 : 0;
  const value = Math.max(188, Math.min(255, 232 + grain + band + highlight));
  return [value, value, value];
}

function fabric(x: number, y: number, size: number): readonly [number, number, number] {
  const localX = x % 16;
  const localY = y % 16;
  if (localX === 1 || localY === 1) return [255, 255, 250];
  if (localX === 14 || localY === 14) return [211, 211, 205];
  const weave = (x + y) % 4 === 0 || (x - y + size) % 7 === 0;
  return weave ? [229, 229, 222] : [248, 248, 242];
}

function paint(x: number, y: number): readonly [number, number, number] {
  const localX = x % 16;
  const localY = y % 16;
  if (localX === 1 || localY === 1) return [255, 255, 255];
  if (localX === 14 || localY === 14) return [202, 207, 203];
  return [247, 247, 242];
}

function metal(x: number, y: number): readonly [number, number, number] {
  const band = y % 8;
  if (band === 1) return [250, 254, 255];
  if (band === 2) return [232, 244, 246];
  if (band === 6) return [148, 170, 177];
  return [207, 225, 229];
}

function ceramic(x: number, y: number): readonly [number, number, number] {
  if (x < 4 || y < 4) return [255, 255, 255];
  if (x > 26 || y > 26) return [198, 220, 216];
  return [244, 249, 246];
}

function leaf(x: number, y: number): readonly [number, number, number] {
  const vein = x === 7 || x === 8 || (y % 6 === 0 && Math.abs(x - 8) < 5);
  return vein ? [181, 217, 177] : [238, 250, 231];
}

function rug(x: number, y: number): readonly [number, number, number] {
  const localX = x % 16;
  const localY = y % 16;
  if (localX < 2 || localY < 2 || localX > 13 || localY > 13) return [116, 47, 58];
  const diamond = Math.abs(localX - 8) + Math.abs(localY - 8);
  if (diamond <= 2) return [218, 166, 55];
  if (diamond === 5 || diamond === 6) return [63, 137, 137];
  const weave = (x + y) % 5 === 0;
  return weave ? [222, 205, 168] : [240, 225, 190];
}

function glass(x: number, y: number): readonly [number, number, number] {
  const diagonal = (x + y) % 17;
  const highlight = diagonal === 2 || diagonal === 3 || (x % 23 === 4 && y % 19 < 8);
  if (highlight) return [236, 253, 255];
  const shade = (x + Math.floor(y / 4)) % 9 === 0 ? -10 : 0;
  return [158 + shade, 218 + shade, 232 + shade];
}

function hash(x: number, y: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 29, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}
