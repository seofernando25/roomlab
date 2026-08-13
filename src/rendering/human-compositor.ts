import * as THREE from 'three';

export type HumanDirection = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type HumanPose = 'stand' | 'walk' | 'sit';

export interface HumanTextureLibrary {
  readonly stand: ReadonlyMap<HumanDirection, THREE.CanvasTexture>;
  readonly walk: readonly ReadonlyMap<HumanDirection, THREE.CanvasTexture>[];
  readonly sit: ReadonlyMap<HumanDirection, THREE.CanvasTexture>;
}

interface AvatarPartRow {
  readonly bundle: string;
  readonly name: string;
  readonly prefix: string;
  readonly action: string;
  readonly part: string;
  readonly setId: string;
  readonly direction: number;
  readonly frame: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly hasEmbeddedTexture: boolean;
}

interface LayerSpec {
  readonly bundle: string;
  readonly part: string;
  readonly setId: string;
  readonly tint: string | null;
  readonly optional?: boolean;
}

const BASE = '/assets/human';
const CANVAS_WIDTH = 64;
const CANVAS_HEIGHT = 96;
const AUTHORED_DIRECTIONS = [0, 1, 2, 3, 7] as const;
const SIT_AUTHORED_DIRECTIONS = [0, 2] as const;
const WALK_FRAMES = 4;
const layers: readonly LayerSpec[] = [
  { bundle: 'hh_human_body', part: 'bd', setId: '1', tint: '#eab16f' },
  { bundle: 'hh_human_leg', part: 'lg', setId: '1', tint: '#ddb07a' },
  { bundle: 'hh_human_body', part: 'hd', setId: '1', tint: '#f0b879' },
  { bundle: 'hh_human_face', part: 'fc', setId: '1', tint: '#f0b879', optional: true },
  { bundle: 'hh_human_face', part: 'ey', setId: '1', tint: null, optional: true },
  { bundle: 'trousers_u_baggy', part: 'lg', setId: '2129', tint: '#555963' },
  { bundle: 'shirt_m_checks', part: 'ch', setId: '2100', tint: '#67a75f' },
  { bundle: 'shirt_m_checks', part: 'ls', setId: '2100', tint: '#67a75f' },
  { bundle: 'shirt_m_checks', part: 'rs', setId: '2100', tint: '#67a75f' },
  { bundle: 'hh_human_body', part: 'lh', setId: '1', tint: '#f0b879' },
  { bundle: 'hh_human_body', part: 'rh', setId: '1', tint: '#f0b879' },
  { bundle: 'shoes_u_skater', part: 'sh', setId: '2111', tint: '#3d4148' },
] as const;

let libraryPromise: Promise<HumanTextureLibrary> | null = null;

export function loadHumanTextureLibrary(): Promise<HumanTextureLibrary> {
  libraryPromise ??= buildHumanTextureLibrary();
  return libraryPromise;
}

export async function loadHumanTextures(): Promise<ReadonlyMap<HumanDirection, THREE.CanvasTexture>> {
  return (await loadHumanTextureLibrary()).stand;
}

export function authoredDirection(direction: HumanDirection): { source: 0 | 1 | 2 | 3 | 7; mirrored: boolean } {
  if (direction === 4) return { source: 2, mirrored: true };
  if (direction === 5) return { source: 1, mirrored: true };
  if (direction === 6) return { source: 0, mirrored: true };
  return { source: direction as 0 | 1 | 2 | 3 | 7, mirrored: false };
}

async function buildHumanTextureLibrary(): Promise<HumanTextureLibrary> {
  const response = await fetch(`${BASE}/metadata/all_parts.csv`);
  if (!response.ok) throw new Error(`Human metadata failed with HTTP ${response.status}.`);
  const rows = parseRows(await response.text());
  const stand = await buildEightDirectionPose(rows, 'std', 0);
  const walk = await Promise.all(
    Array.from({ length: WALK_FRAMES }, (_, frame) => buildEightDirectionPose(rows, 'wlk', frame)),
  );
  const sit = await buildSitPose(rows);
  return { stand, walk, sit };
}

async function buildEightDirectionPose(
  rows: readonly AvatarPartRow[],
  action: string,
  frame: number,
): Promise<ReadonlyMap<HumanDirection, THREE.CanvasTexture>> {
  const pairs = await Promise.all(
    AUTHORED_DIRECTIONS.map(async (direction) => [direction, await composeDirection(rows, direction, action, frame)] as const),
  );
  const authored = new Map<number, HTMLCanvasElement>(pairs);
  const textures = new Map<HumanDirection, THREE.CanvasTexture>();
  for (let value = 0; value < 8; value += 1) {
    const direction = value as HumanDirection;
    const mapping = authoredDirection(direction);
    const source = authored.get(mapping.source);
    if (!source) continue;
    textures.set(direction, textureFromCanvas(mapping.mirrored ? mirrorCanvas(source) : source));
  }
  return textures;
}

async function buildSitPose(rows: readonly AvatarPartRow[]): Promise<ReadonlyMap<HumanDirection, THREE.CanvasTexture>> {
  const pairs = await Promise.all(
    SIT_AUTHORED_DIRECTIONS.map(async (direction) => [direction, await composeDirection(rows, direction, 'sit', 0)] as const),
  );
  const authored = new Map<number, HTMLCanvasElement>(pairs);
  const textures = new Map<HumanDirection, THREE.CanvasTexture>();
  const zero = authored.get(0);
  const two = authored.get(2);
  if (zero) {
    textures.set(0, textureFromCanvas(zero));
    textures.set(6, textureFromCanvas(mirrorCanvas(zero)));
  }
  if (two) {
    textures.set(2, textureFromCanvas(two));
    textures.set(4, textureFromCanvas(mirrorCanvas(two)));
  }
  return textures;
}

async function composeDirection(
  rows: readonly AvatarPartRow[],
  direction: number,
  action: string,
  frame: number,
): Promise<HTMLCanvasElement> {
  const selected = layers.flatMap((spec) => {
    const row = findPoseRow(rows, spec, direction, action, frame);
    if (!row && !spec.optional) throw new Error(`Missing avatar layer ${spec.bundle}:${spec.part}:${spec.setId}:${direction}.`);
    return row ? [{ row, spec }] : [];
  });
  const loaded = await Promise.all(selected.map(async ({ row, spec }) => ({ row, spec, image: await loadImage(row) })));
  const maxBottom = Math.max(...loaded.map(({ row, image }) => -row.offsetY + image.height));
  const footShiftY = CANVAS_HEIGHT - maxBottom;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for human composition.');
  context.imageSmoothingEnabled = false;
  for (const { row, spec, image } of loaded) {
    const drawX = -row.offsetX;
    const drawY = -row.offsetY + footShiftY;
    drawTinted(context, image, drawX, drawY, spec.tint);
    if (spec.part === 'hd') drawHair(context, image, drawX, drawY, direction);
  }
  return canvas;
}

function findPoseRow(
  rows: readonly AvatarPartRow[],
  spec: LayerSpec,
  direction: number,
  action: string,
  frame: number,
): AvatarPartRow | undefined {
  const matches = (entry: AvatarPartRow, candidateAction: string, candidateFrame: number) => entry.bundle === spec.bundle
    && entry.prefix === 'h'
    && entry.hasEmbeddedTexture
    && entry.action === candidateAction
    && entry.part === spec.part
    && entry.setId === spec.setId
    && entry.direction === direction
    && entry.frame === candidateFrame;
  return rows.find((entry) => matches(entry, action, frame))
    ?? (action !== 'std' ? rows.find((entry) => matches(entry, 'std', 0)) : undefined);
}

function textureFromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function drawTinted(context: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, tint: string | null): void {
  const layer = document.createElement('canvas');
  layer.width = image.width;
  layer.height = image.height;
  const layerContext = layer.getContext('2d', { willReadFrequently: true });
  if (!layerContext) throw new Error('2D canvas is unavailable for human tinting.');
  layerContext.imageSmoothingEnabled = false;
  layerContext.drawImage(image, 0, 0);
  if (tint) tintMask(layerContext, image.width, image.height, tint);
  context.drawImage(layer, x, y);
}

function tintMask(context: CanvasRenderingContext2D, width: number, height: number, tint: string): void {
  const [tr, tg, tb] = parseHex(tint);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 10) continue;
    const luminance = (r + g + b) / (3 * 255);
    if (luminance < 0.08) {
      data[index] = 20; data[index + 1] = 23; data[index + 2] = 24;
      continue;
    }
    const shade = 0.36 + luminance * 0.64;
    data[index] = Math.round(tr * shade);
    data[index + 1] = Math.round(tg * shade);
    data[index + 2] = Math.round(tb * shade);
  }
  context.putImageData(imageData, 0, 0);
}

function drawHair(context: CanvasRenderingContext2D, head: ImageBitmap, x: number, y: number, direction: number): void {
  const capHeight = Math.max(8, Math.round(head.height * 0.40));
  const layer = document.createElement('canvas');
  layer.width = head.width;
  layer.height = capHeight;
  const layerContext = layer.getContext('2d', { willReadFrequently: true });
  if (!layerContext) throw new Error('2D canvas is unavailable for human hair.');
  layerContext.imageSmoothingEnabled = false;
  layerContext.drawImage(head, 0, 0, head.width, capHeight, 0, 0, head.width, capHeight);
  tintMask(layerContext, head.width, capHeight, '#e6c95b');
  context.drawImage(layer, x, y - 1);
  if (direction === 1 || direction === 2 || direction === 3) {
    context.fillStyle = '#d6ae3e';
    context.fillRect(Math.round(x + head.width * 0.56), y + capHeight - 2, 3, 3);
    context.fillRect(Math.round(x + head.width * 0.69), y + capHeight - 4, 2, 4);
  }
}

async function loadImage(row: AvatarPartRow): Promise<ImageBitmap> {
  const response = await fetch(`${BASE}/sprites/${row.bundle}/${row.name}.png`);
  if (!response.ok) throw new Error(`Human sprite ${row.name} failed with HTTP ${response.status}.`);
  try { return await createImageBitmap(await response.blob()); }
  catch (error) { throw new Error(`Human sprite ${row.bundle}/${row.name}.png could not be decoded.`, { cause: error }); }
}

function mirrorCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for mirrored human composition.');
  context.imageSmoothingEnabled = false;
  context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(source, 0, 0);
  return canvas;
}

function parseRows(csv: string): AvatarPartRow[] {
  const [headerLine = '', ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  return lines.map((line) => {
    const values = line.split(',');
    return {
      bundle: values[index.bundle ?? -1] ?? '', name: values[index.name ?? -1] ?? '',
      prefix: values[index.prefix ?? -1] ?? '', action: values[index.action ?? -1] ?? '',
      part: values[index.part ?? -1] ?? '', setId: values[index.set_id ?? -1] ?? '',
      direction: Number(values[index.direction ?? -1] ?? -1), frame: Number(values[index.frame ?? -1] ?? -1),
      offsetX: Number(values[index.offset_x ?? -1] ?? 0), offsetY: Number(values[index.offset_y ?? -1] ?? 0),
      hasEmbeddedTexture: values[index.has_embedded_texture ?? -1] === 'True',
    };
  });
}

function parseHex(value: string): readonly [number, number, number] {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}
