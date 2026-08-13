import * as THREE from 'three';
import type { HumanDirection } from './human-compositor';

const WIDTH = 64;
const HEIGHT = 96;
const PIXELS = WIDTH * HEIGHT;
const ALPHA_MIN = 12;
const SQRT_2 = Math.SQRT2;

interface SilhouetteFrame {
  readonly pixels: Uint8ClampedArray;
  readonly signedDistance: Float32Array;
}

export class HumanSilhouetteFill {
  readonly #frames = new Map<HumanDirection, SilhouetteFrame>();
  readonly #inside = new Uint8Array(PIXELS);
  readonly #queue = new Int32Array(PIXELS);

  apply(
    output: Uint8ClampedArray,
    fromDirection: HumanDirection,
    toDirection: HumanDirection,
    fromCanvas: HTMLCanvasElement,
    toCanvas: HTMLCanvasElement,
    progress: number,
  ): void {
    const from = this.getFrame(fromDirection, fromCanvas);
    const to = this.getFrame(toDirection, toCanvas);
    const t = smoothstep(progress);
    const inflation = Math.sin(Math.PI * t) * 0.55;

    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      const distance = THREE.MathUtils.lerp(from.signedDistance[pixel]!, to.signedDistance[pixel]!, t);
      const inside = distance <= inflation;
      this.#inside[pixel] = inside ? 1 : 0;
      if (inside) continue;
      output[pixel * 4 + 3] = 0;
    }

    // Seed uncovered body pixels from the authored surfaces where possible.
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      if (this.#inside[pixel] === 0 || output[pixel * 4 + 3]! >= ALPHA_MIN) continue;
      fillReferencePixel(output, pixel, from.pixels, to.pixels, t);
    }

    // Exhaustively flood any remaining gaps from the nearest covered pixels,
    // constrained by the silhouette so transparent negative space stays empty.
    sealInterior(output, this.#inside, this.#queue);
  }

  private getFrame(direction: HumanDirection, canvas: HTMLCanvasElement): SilhouetteFrame {
    const cached = this.#frames.get(direction);
    if (cached) return cached;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is unavailable for avatar silhouette analysis.');
    const pixels = new Uint8ClampedArray(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    const mask = new Uint8Array(PIXELS);
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      mask[pixel] = pixels[pixel * 4 + 3]! >= ALPHA_MIN ? 1 : 0;
    }
    const frame = { pixels, signedDistance: createSignedDistance(mask) };
    this.#frames.set(direction, frame);
    return frame;
  }
}

function createSignedDistance(mask: Uint8Array): Float32Array {
  const toOpaque = chamferDistance(mask, 1);
  const toTransparent = chamferDistance(mask, 0);
  const result = new Float32Array(PIXELS);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    result[pixel] = mask[pixel] === 1 ? -toTransparent[pixel]! : toOpaque[pixel]!;
  }
  return result;
}

function chamferDistance(mask: Uint8Array, target: 0 | 1): Float32Array {
  const distance = new Float32Array(PIXELS);
  distance.fill(1_000);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    if (mask[pixel] === target) distance[pixel] = 0;
  }
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) relax(distance, x, y, -1);
  }
  for (let y = HEIGHT - 1; y >= 0; y -= 1) {
    for (let x = WIDTH - 1; x >= 0; x -= 1) relax(distance, x, y, 1);
  }
  return distance;
}

function relax(distance: Float32Array, x: number, y: number, direction: -1 | 1): void {
  const pixel = y * WIDTH + x;
  let best = distance[pixel]!;
  const previousY = y + direction;
  if (previousY >= 0 && previousY < HEIGHT) {
    best = Math.min(best, distance[previousY * WIDTH + x]! + 1);
    if (x > 0) best = Math.min(best, distance[previousY * WIDTH + x - 1]! + SQRT_2);
    if (x + 1 < WIDTH) best = Math.min(best, distance[previousY * WIDTH + x + 1]! + SQRT_2);
  }
  const previousX = x + direction;
  if (previousX >= 0 && previousX < WIDTH) best = Math.min(best, distance[y * WIDTH + previousX]! + 1);
  distance[pixel] = best;
}

function sealInterior(output: Uint8ClampedArray, inside: Uint8Array, queue: Int32Array): void {
  let head = 0;
  let tail = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    if (inside[pixel] === 1 && output[pixel * 4 + 3]! >= ALPHA_MIN) queue[tail++] = pixel;
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
        const neighbor = ny * WIDTH + nx;
        if (inside[neighbor] === 0 || output[neighbor * 4 + 3]! >= ALPHA_MIN) continue;
        copyPixel(output, pixel, output, neighbor);
        queue[tail++] = neighbor;
      }
    }
  }
}

function copyPixel(source: Uint8ClampedArray, sourcePixel: number, target: Uint8ClampedArray, targetPixel: number): void {
  const sourceIndex = sourcePixel * 4;
  const targetIndex = targetPixel * 4;
  target[targetIndex] = source[sourceIndex]!;
  target[targetIndex + 1] = source[sourceIndex + 1]!;
  target[targetIndex + 2] = source[sourceIndex + 2]!;
  target[targetIndex + 3] = source[sourceIndex + 3]!;
}

function fillReferencePixel(
  output: Uint8ClampedArray,
  pixel: number,
  from: Uint8ClampedArray,
  to: Uint8ClampedArray,
  t: number,
): void {
  const index = pixel * 4;
  const fromAlpha = from[index + 3]!;
  const toAlpha = to[index + 3]!;
  if (fromAlpha < ALPHA_MIN && toAlpha < ALPHA_MIN) return;
  if (fromAlpha < ALPHA_MIN) {
    copyPixel(to, pixel, output, pixel);
    return;
  }
  if (toAlpha < ALPHA_MIN) {
    copyPixel(from, pixel, output, pixel);
    return;
  }
  output[index] = Math.round(THREE.MathUtils.lerp(from[index]!, to[index]!, t));
  output[index + 1] = Math.round(THREE.MathUtils.lerp(from[index + 1]!, to[index + 1]!, t));
  output[index + 2] = Math.round(THREE.MathUtils.lerp(from[index + 2]!, to[index + 2]!, t));
  output[index + 3] = Math.round(THREE.MathUtils.lerp(fromAlpha, toAlpha, t));
}

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
