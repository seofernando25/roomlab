import * as THREE from 'three';
import type { HumanDirection } from './human-compositor';
import { HumanSilhouetteFill } from './human-silhouette-fill';

const WIDTH = 64;
const HEIGHT = 96;
const CLUSTER = 2;

interface PixelCluster {
  readonly x: number;
  readonly y: number;
  readonly pixels: Uint8ClampedArray;
  readonly meanR: number;
  readonly meanG: number;
  readonly meanB: number;
  readonly meanA: number;
}

interface TransportPair {
  readonly from: PixelCluster;
  readonly to: PixelCluster;
  readonly arcX: number;
  readonly arcY: number;
}

export class HumanPixelTransport {
  readonly #canvas = document.createElement('canvas');
  readonly #context: CanvasRenderingContext2D;
  readonly #frame: ImageData;
  readonly #texture: THREE.CanvasTexture;
  readonly #pairs = new Map<string, readonly TransportPair[]>();
  readonly #silhouette = new HumanSilhouetteFill();

  constructor() {
    this.#canvas.width = WIDTH;
    this.#canvas.height = HEIGHT;
    const context = this.#canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is unavailable for avatar pixel transport.');
    context.imageSmoothingEnabled = false;
    this.#context = context;
    this.#frame = context.createImageData(WIDTH, HEIGHT);
    this.#texture = new THREE.CanvasTexture(this.#canvas);
    this.#texture.colorSpace = THREE.SRGBColorSpace;
    this.#texture.minFilter = THREE.NearestFilter;
    this.#texture.magFilter = THREE.NearestFilter;
    this.#texture.generateMipmaps = false;
  }

  render(
    fromDirection: HumanDirection,
    toDirection: HumanDirection,
    fromTexture: THREE.CanvasTexture,
    toTexture: THREE.CanvasTexture,
    progress: number,
    direction: -1 | 1,
  ): THREE.CanvasTexture {
    const pairs = this.getPairs(fromDirection, toDirection, fromTexture, toTexture);
    const t = smoothstep(progress);
    const phase = Math.sin(Math.PI * t);
    const pixels = this.#frame.data;
    pixels.fill(0);

    for (const pair of pairs) {
      const x = Math.round(THREE.MathUtils.lerp(pair.from.x, pair.to.x, t) + pair.arcX * phase * direction);
      const y = Math.round(THREE.MathUtils.lerp(pair.from.y, pair.to.y, t) + pair.arcY * phase);
      this.drawCluster(pixels, pair, x, y, t);
    }

    this.#silhouette.apply(
      pixels,
      fromDirection,
      toDirection,
      fromTexture.image as HTMLCanvasElement,
      toTexture.image as HTMLCanvasElement,
      t,
    );

    this.#context.putImageData(this.#frame, 0, 0);
    this.#texture.needsUpdate = true;
    return this.#texture;
  }

  dispose(): void {
    this.#texture.dispose();
  }

  private getPairs(
    fromDirection: HumanDirection,
    toDirection: HumanDirection,
    fromTexture: THREE.CanvasTexture,
    toTexture: THREE.CanvasTexture,
  ): readonly TransportPair[] {
    const key = `${fromDirection}->${toDirection}`;
    const cached = this.#pairs.get(key);
    if (cached) return cached;
    const from = collectClusters(fromTexture.image as HTMLCanvasElement);
    const to = collectClusters(toTexture.image as HTMLCanvasElement);
    const pairs = pairClusters(from, to);
    this.#pairs.set(key, pairs);
    return pairs;
  }

  private drawCluster(output: Uint8ClampedArray, pair: TransportPair, x: number, y: number, t: number): void {
    for (let localY = 0; localY < CLUSTER; localY += 1) {
      for (let localX = 0; localX < CLUSTER; localX += 1) {
        const sourceIndex = (localY * CLUSTER + localX) * 4;
        const alpha = Math.round(THREE.MathUtils.lerp(pair.from.pixels[sourceIndex + 3] ?? 0, pair.to.pixels[sourceIndex + 3] ?? 0, t));
        if (alpha < 12) continue;
        const drawX = x + localX;
        const drawY = y + localY;
        if (drawX < 0 || drawX >= WIDTH || drawY < 0 || drawY >= HEIGHT) continue;
        const targetIndex = (drawY * WIDTH + drawX) * 4;
        if ((output[targetIndex + 3] ?? 0) > alpha) continue;
        output[targetIndex] = Math.round(THREE.MathUtils.lerp(pair.from.pixels[sourceIndex] ?? 0, pair.to.pixels[sourceIndex] ?? 0, t));
        output[targetIndex + 1] = Math.round(THREE.MathUtils.lerp(pair.from.pixels[sourceIndex + 1] ?? 0, pair.to.pixels[sourceIndex + 1] ?? 0, t));
        output[targetIndex + 2] = Math.round(THREE.MathUtils.lerp(pair.from.pixels[sourceIndex + 2] ?? 0, pair.to.pixels[sourceIndex + 2] ?? 0, t));
        output[targetIndex + 3] = alpha;
      }
    }
  }
}

function collectClusters(canvas: HTMLCanvasElement): PixelCluster[] {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is unavailable for avatar cluster analysis.');
  const data = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const clusters: PixelCluster[] = [];
  for (let y = 0; y < HEIGHT; y += CLUSTER) {
    for (let x = 0; x < WIDTH; x += CLUSTER) {
      const pixels = new Uint8ClampedArray(CLUSTER * CLUSTER * 4);
      let count = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let localY = 0; localY < CLUSTER; localY += 1) {
        for (let localX = 0; localX < CLUSTER; localX += 1) {
          const sourceIndex = ((y + localY) * WIDTH + x + localX) * 4;
          const targetIndex = (localY * CLUSTER + localX) * 4;
          const alpha = data[sourceIndex + 3] ?? 0;
          for (let channel = 0; channel < 4; channel += 1) pixels[targetIndex + channel] = data[sourceIndex + channel] ?? 0;
          if (alpha < 12) continue;
          r += data[sourceIndex] ?? 0;
          g += data[sourceIndex + 1] ?? 0;
          b += data[sourceIndex + 2] ?? 0;
          a += alpha;
          count += 1;
        }
      }
      if (count === 0) continue;
      clusters.push({ x, y, pixels, meanR: r / count, meanG: g / count, meanB: b / count, meanA: a / count });
    }
  }
  return clusters;
}

function pairClusters(from: readonly PixelCluster[], to: readonly PixelCluster[]): readonly TransportPair[] {
  if (from.length === 0 || to.length === 0) return [];
  const pairs: TransportPair[] = [];
  const usedTargets = new Set<PixelCluster>();
  for (const source of from) {
    const target = bestMatch(source, to);
    usedTargets.add(target);
    pairs.push(makePair(source, target));
  }
  for (const target of to) {
    if (usedTargets.has(target)) continue;
    pairs.push(makePair(bestMatch(target, from), target));
  }
  return pairs;
}

function bestMatch(cluster: PixelCluster, candidates: readonly PixelCluster[]): PixelCluster {
  let best = candidates[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - cluster.x;
    const dy = candidate.y - cluster.y;
    const dr = candidate.meanR - cluster.meanR;
    const dg = candidate.meanG - cluster.meanG;
    const db = candidate.meanB - cluster.meanB;
    const da = candidate.meanA - cluster.meanA;
    const cost = dx * dx + dy * dy + (dr * dr + dg * dg + db * db) * 0.0025 + da * da * 0.001;
    if (cost >= bestCost) continue;
    bestCost = cost;
    best = candidate;
  }
  return best;
}

function makePair(from: PixelCluster, to: PixelCluster): TransportPair {
  const seed = hash(from.x * 37 + from.y * 17 + to.x * 13 + to.y * 7);
  return {
    from,
    to,
    arcX: (seed - 0.5) * 1.2,
    arcY: (hash(seed * 997) - 0.5) * 1.0,
  };
}

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash(value: number): number {
  return Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1;
}
