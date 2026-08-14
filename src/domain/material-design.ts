export const MATERIAL_PROGRAM_VERSION = 1 as const;
export const MATERIAL_RESOLUTIONS = [16, 32, 64] as const;
export const MATERIAL_LAYER_KINDS = ['stripes', 'checker', 'grid', 'dots', 'speckles', 'grain'] as const;
export type MaterialResolution = (typeof MATERIAL_RESOLUTIONS)[number];
export type MaterialLayerKind = (typeof MATERIAL_LAYER_KINDS)[number];
export type MaterialAngle = 0 | 45 | 90 | 135;

interface MaterialLayerBase {
  readonly kind: MaterialLayerKind;
  readonly color: string;
  readonly opacity: number;
}
export interface StripesMaterialLayer extends MaterialLayerBase {
  readonly kind: 'stripes';
  readonly spacing: number;
  readonly thickness: number;
  readonly angle: MaterialAngle;
}
export interface CheckerMaterialLayer extends MaterialLayerBase {
  readonly kind: 'checker';
  readonly size: number;
}
export interface GridMaterialLayer extends MaterialLayerBase {
  readonly kind: 'grid';
  readonly spacing: number;
  readonly thickness: number;
}
export interface DotsMaterialLayer extends MaterialLayerBase {
  readonly kind: 'dots';
  readonly spacing: number;
  readonly radius: number;
  readonly stagger: boolean;
}
export interface SpecklesMaterialLayer extends MaterialLayerBase {
  readonly kind: 'speckles';
  readonly density: number;
  readonly size: number;
  readonly seed: number;
}
export interface GrainMaterialLayer extends MaterialLayerBase {
  readonly kind: 'grain';
  readonly spacing: number;
  readonly thickness: number;
  readonly seed: number;
}
export type MaterialLayer =
  | StripesMaterialLayer
  | CheckerMaterialLayer
  | GridMaterialLayer
  | DotsMaterialLayer
  | SpecklesMaterialLayer
  | GrainMaterialLayer;

export interface MaterialProgram {
  readonly version: typeof MATERIAL_PROGRAM_VERSION;
  readonly resolution: MaterialResolution;
  readonly baseColor: string;
  readonly layers: readonly MaterialLayer[];
}

export interface MaterialStyle {
  readonly program: MaterialProgram;
  readonly repeatX: number;
  readonly repeatY: number;
}

/** Authoritative, serializable visual customization for one placed entity. */
export interface AppearanceComponent {
  readonly materials: Readonly<Record<string, MaterialStyle>>;
}

export const MAX_MATERIAL_SLOTS_PER_ENTITY = 8;
export const MAX_MATERIAL_LAYERS = 6;
export const MAX_MATERIAL_APPEARANCE_BYTES = 12_000;
const SLOT_ID = /^[a-z][a-z0-9-]{0,31}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseAppearanceComponent(value: unknown): AppearanceComponent | null {
  if (!isRecord(value) || !isRecord(value.materials)) return null;
  const entries = Object.entries(value.materials);
  if (entries.length > MAX_MATERIAL_SLOTS_PER_ENTITY) return null;
  const materials: Record<string, MaterialStyle> = {};
  for (const [slotId, rawStyle] of entries) {
    if (!SLOT_ID.test(slotId)) return null;
    const style = parseMaterialStyle(rawStyle);
    if (!style) return null;
    materials[slotId] = style;
  }
  const appearance = { materials } as const;
  return JSON.stringify(appearance).length <= MAX_MATERIAL_APPEARANCE_BYTES ? appearance : null;
}

export function parseMaterialStyle(value: unknown): MaterialStyle | null {
  if (!isRecord(value) || !finiteBetween(value.repeatX, 0.25, 8) || !finiteBetween(value.repeatY, 0.25, 8)) return null;
  const program = parseMaterialProgram(value.program);
  if (!program) return null;
  return { program, repeatX: round2(value.repeatX as number), repeatY: round2(value.repeatY as number) };
}

export function parseMaterialProgram(value: unknown): MaterialProgram | null {
  if (!isRecord(value) || value.version !== MATERIAL_PROGRAM_VERSION || !isResolution(value.resolution) || !isColor(value.baseColor) || !Array.isArray(value.layers)) return null;
  if (value.layers.length > MAX_MATERIAL_LAYERS) return null;
  const layers: MaterialLayer[] = [];
  for (const rawLayer of value.layers) {
    const layer = parseLayer(rawLayer);
    if (!layer) return null;
    layers.push(layer);
  }
  return { version: MATERIAL_PROGRAM_VERSION, resolution: value.resolution, baseColor: canonicalColor(value.baseColor), layers };
}

export function materialAppearanceKey(appearance?: AppearanceComponent | null): string {
  if (!appearance || Object.keys(appearance.materials).length === 0) return 'default';
  return Object.keys(appearance.materials).sort().map((slot) => `${slot}:${JSON.stringify(appearance.materials[slot])}`).join('|');
}

export function isMaterialSlotId(value: string): boolean { return SLOT_ID.test(value); }
export function isMaterialColor(value: string): boolean { return isColor(value); }

export function createMaterialLayer(kind: MaterialLayerKind, color = '#ffffff'): MaterialLayer {
  const base = { color: canonicalColor(isColor(color) ? color : '#ffffff'), opacity: 0.72 } as const;
  if (kind === 'stripes') return { ...base, kind, spacing: 8, thickness: 2, angle: 45 };
  if (kind === 'checker') return { ...base, kind, size: 6 };
  if (kind === 'grid') return { ...base, kind, spacing: 8, thickness: 1 };
  if (kind === 'dots') return { ...base, kind, spacing: 8, radius: 2, stagger: true };
  if (kind === 'speckles') return { ...base, kind, density: 0.12, size: 1, seed: 17 };
  return { ...base, kind: 'grain', spacing: 7, thickness: 1, seed: 29 };
}

function parseLayer(value: unknown): MaterialLayer | null {
  if (!isRecord(value) || !isLayerKind(value.kind) || !isColor(value.color) || !finiteBetween(value.opacity, 0, 1)) return null;
  const base = { kind: value.kind, color: canonicalColor(value.color), opacity: round2(value.opacity as number) };
  if (value.kind === 'stripes') {
    if (!intBetween(value.spacing, 2, 32) || !intBetween(value.thickness, 1, 16) || (value.thickness as number) > (value.spacing as number) || !isAngle(value.angle)) return null;
    return { ...base, kind: 'stripes', spacing: value.spacing as number, thickness: value.thickness as number, angle: value.angle };
  }
  if (value.kind === 'checker') {
    if (!intBetween(value.size, 2, 32)) return null;
    return { ...base, kind: 'checker', size: value.size as number };
  }
  if (value.kind === 'grid') {
    if (!intBetween(value.spacing, 3, 32) || !intBetween(value.thickness, 1, 8) || (value.thickness as number) >= (value.spacing as number)) return null;
    return { ...base, kind: 'grid', spacing: value.spacing as number, thickness: value.thickness as number };
  }
  if (value.kind === 'dots') {
    if (!intBetween(value.spacing, 3, 32) || !intBetween(value.radius, 1, 8) || (value.radius as number) * 2 > (value.spacing as number) || typeof value.stagger !== 'boolean') return null;
    return { ...base, kind: 'dots', spacing: value.spacing as number, radius: value.radius as number, stagger: value.stagger };
  }
  if (value.kind === 'speckles') {
    if (!finiteBetween(value.density, 0.01, 0.6) || !intBetween(value.size, 1, 3) || !intBetween(value.seed, 0, 65_535)) return null;
    return { ...base, kind: 'speckles', density: round2(value.density as number), size: value.size as number, seed: value.seed as number };
  }
  if (!intBetween(value.spacing, 3, 32) || !intBetween(value.thickness, 1, 4) || !intBetween(value.seed, 0, 65_535)) return null;
  return { ...base, kind: 'grain', spacing: value.spacing as number, thickness: value.thickness as number, seed: value.seed as number };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isColor(value: unknown): value is string { return typeof value === 'string' && HEX_COLOR.test(value); }
function canonicalColor(value: string): string { return value.toLowerCase(); }
function isResolution(value: unknown): value is MaterialResolution { return value === 16 || value === 32 || value === 64; }
function isLayerKind(value: unknown): value is MaterialLayerKind { return typeof value === 'string' && (MATERIAL_LAYER_KINDS as readonly string[]).includes(value); }
function isAngle(value: unknown): value is MaterialAngle { return value === 0 || value === 45 || value === 90 || value === 135; }
function finiteBetween(value: unknown, min: number, max: number): boolean { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function intBetween(value: unknown, min: number, max: number): boolean { return Number.isInteger(value) && (value as number) >= min && (value as number) <= max; }
function round2(value: number): number { return Math.round(value * 100) / 100; }
