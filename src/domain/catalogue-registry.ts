import type { Footprint, PrototypeId } from './types';
import type {
  CatalogueObjectCategoryDefinition,
  CatalogueObjectCategoryId,
  CatalogueObjectDefinition,
} from './catalogue-ontology';
import type { CapabilityStatus, PrototypeCapabilityKey } from './prototype-components';
import { catalogueMaterialSlots } from './catalogue-material-slots';

export const CATALOGUE_OBJECT_CATEGORIES: readonly CatalogueObjectCategoryDefinition[] = [
  { id: 'seating', label: 'Seating', shortLabel: 'Seats', description: 'Chairs, stools, sofas, and other avatar seating.' },
  { id: 'surfaces', label: 'Tables & Surfaces', shortLabel: 'Tables', description: 'Tables, counters, and stackable furnishing surfaces.' },
  { id: 'storage', label: 'Storage & Display', shortLabel: 'Storage', description: 'Shelves, bookcases, cabinets, and display furniture.' },
  { id: 'lighting', label: 'Lighting', shortLabel: 'Lights', description: 'Lamps and other room light sources.' },
  { id: 'kitchen', label: 'Kitchen', shortLabel: 'Kitchen', description: 'Cooking, counters, food, and kitchen fixtures.' },
  { id: 'bathroom', label: 'Bathroom', shortLabel: 'Bath', description: 'Bathroom fixtures and sanitary furniture.' },
  { id: 'decor', label: 'Decor', shortLabel: 'Decor', description: 'Plants, ornaments, and visual room dressing.' },
  { id: 'architecture', label: 'Architecture', shortLabel: 'Build', description: 'Placeable stairs, ramps, catwalks, and structural room pieces.' },
] as const;

const floorObject = (width: number, depth: number) => ({
  surface: 'floor' as const,
  footprint: { width, depth },
  rotatesWithEntity: true,
  occupancyLayer: 'furni' as const,
  conflictsWith: ['furni'] as const,
  canStack: true,
});

const traversalObject = () => ({
  surface: 'floor' as const,
  footprint: { width: 1, depth: 1 },
  rotatesWithEntity: true,
  occupancyLayer: 'floor-overlay' as const,
  conflictsWith: ['furni', 'floor-overlay'] as const,
  canStack: true,
});


export const CATALOGUE_OBJECTS = {
  chair: {
    id: 'chair',
    label: 'Club Chair',
    description: 'A deep one-tile armchair with one seated avatar slot.',
    category: 'seating',
    tags: ['seat', 'living', 'armchair'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'chair', materialSlots: catalogueMaterialSlots('chair') },
    capabilities: { sit: { status: 'implemented', seats: [{ x: 0.50, z: 0.48, height: 0.50 }] } },
  },
  stool: {
    id: 'stool',
    label: 'Pixel Stool',
    description: 'A compact one-tile seat with a slightly taller sitting height.',
    category: 'seating',
    tags: ['seat', 'compact', 'bar'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'stool', materialSlots: catalogueMaterialSlots('stool') },
    capabilities: { sit: { status: 'implemented', seats: [{ x: 0.50, z: 0.50, height: 0.57 }] } },
  },
  table: {
    id: 'table',
    label: 'Dining Table',
    description: 'A two-cell dining surface that can support other Catalogue objects on top.',
    category: 'surfaces',
    tags: ['table', 'dining', 'surface'],
    placement: floorObject(2, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'table', materialSlots: catalogueMaterialSlots('table') },
    capabilities: { surface: { status: 'implemented', height: 0.84, acceptsFurni: true } },
  },
  sofa: {
    id: 'sofa',
    label: 'Mint Sofa',
    description: 'A two-cell sofa with two independently targetable seat slots.',
    category: 'seating',
    tags: ['seat', 'living', 'sofa', 'two-seater'],
    placement: floorObject(2, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'sofa', materialSlots: catalogueMaterialSlots('sofa') },
    capabilities: {
      surface: { status: 'implemented', height: 0.68, acceptsFurni: true },
      sit: {
        status: 'implemented',
        seats: [
          { x: 0.50, z: 0.48, height: 0.49 },
          { x: 1.50, z: 0.48, height: 0.49 },
        ],
      },
    },
  },
  vase: {
    id: 'vase',
    label: 'Ceramic Vase',
    description: 'A small decorative vase that can sit on floors, tables, counters, sofas, and other support surfaces.',
    category: 'decor',
    tags: ['vase', 'decor', 'tabletop', 'ceramic'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'vase', materialSlots: catalogueMaterialSlots('vase') },
    capabilities: {},
  },
  bookcase: {
    id: 'bookcase',
    label: 'Bookcase',
    description: 'A tall display and storage piece for books, props, and collectibles.',
    category: 'storage',
    tags: ['books', 'shelf', 'display', 'storage'],
    placement: floorObject(2, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'bookcase', materialSlots: catalogueMaterialSlots('bookcase') },
    capabilities: { storage: { status: 'planned' } },
  },
  lamp: {
    id: 'lamp',
    label: 'Standing Lamp',
    description: 'A floor lamp whose on/off lighting behavior can be driven by entity state later.',
    category: 'lighting',
    tags: ['light', 'lamp', 'decor'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'lamp', materialSlots: catalogueMaterialSlots('lamp') },
    capabilities: {
      light: { status: 'planned', toggleable: true },
      toggle: { status: 'planned', states: 2, initialState: 1 },
    },
  },
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen Block',
    description: 'A two-cell kitchen counter that supports objects on its work surface.',
    category: 'kitchen',
    tags: ['counter', 'cooking', 'surface', 'appliance'],
    placement: floorObject(2, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'kitchen', materialSlots: catalogueMaterialSlots('kitchen') },
    capabilities: {
      surface: { status: 'implemented', height: 1.12, acceptsFurni: true },
      use: { status: 'planned', actionId: 'kitchen.cook', actionLabel: 'Cook' },
    },
  },
  sink: {
    id: 'sink',
    label: 'Bathroom Sink',
    description: 'A compact sanitary fixture reserved for future close-range use interactions.',
    category: 'bathroom',
    tags: ['sink', 'water', 'fixture'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'sink', materialSlots: catalogueMaterialSlots('sink') },
    capabilities: { use: { status: 'planned', actionId: 'bathroom.wash', actionLabel: 'Wash' } },
  },
  toilet: {
    id: 'toilet',
    label: 'Toilet',
    description: 'A bathroom fixture with future stateful/use behavior.',
    category: 'bathroom',
    tags: ['toilet', 'fixture', 'sanitary'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'toilet', materialSlots: catalogueMaterialSlots('toilet') },
    capabilities: {
      use: { status: 'planned', actionId: 'bathroom.flush', actionLabel: 'Flush' },
      toggle: { status: 'planned', states: 2, initialState: 0 },
    },
  },
  plant: {
    id: 'plant',
    label: 'Room Plant',
    description: 'A decorative floor plant for adding height and organic detail to a room.',
    category: 'decor',
    tags: ['plant', 'greenery', 'decor'],
    placement: floorObject(1, 1),
    collision: { mode: 'solid' },
    renderable: { renderer: 'procedural-furni', asset: 'plant', materialSlots: catalogueMaterialSlots('plant') },
    capabilities: {},
  },
  'stairs-block': {
    id: 'stairs-block',
    label: 'Block Steps',
    description: 'Chunky modular steps that can be stacked into taller block-built structures.',
    category: 'architecture',
    tags: ['stairs', 'steps', 'block', 'platform'],
    placement: traversalObject(),
    collision: { mode: 'none' },
    renderable: { renderer: 'procedural-furni', asset: 'stairs-block', materialSlots: catalogueMaterialSlots('stairs-block') },
    capabilities: {
      surface: { status: 'implemented', height: 0.56, acceptsFurni: true },
      traversal: { status: 'implemented', mode: 'steps', maxRiseSteps: 2 },
    },
  },
  'stairs-glass': {
    id: 'stairs-glass',
    label: 'Glass Stairs',
    description: 'Floating glass treads for clean modern rooms and wall-side stair runs.',
    category: 'architecture',
    tags: ['stairs', 'glass', 'modern', 'floating'],
    placement: traversalObject(),
    collision: { mode: 'none' },
    renderable: { renderer: 'procedural-furni', asset: 'stairs-glass', materialSlots: catalogueMaterialSlots('stairs-glass') },
    capabilities: { traversal: { status: 'implemented', mode: 'steps', maxRiseSteps: 2 } },
  },
  'stairs-metal': {
    id: 'stairs-metal',
    label: 'Metal Catwalk Stairs',
    description: 'Industrial grated stairs for lofts, catwalks, and service spaces.',
    category: 'architecture',
    tags: ['stairs', 'metal', 'industrial', 'catwalk'],
    placement: traversalObject(),
    collision: { mode: 'none' },
    renderable: { renderer: 'procedural-furni', asset: 'stairs-metal', materialSlots: catalogueMaterialSlots('stairs-metal') },
    capabilities: { traversal: { status: 'implemented', mode: 'steps', maxRiseSteps: 2 } },
  },
  'ramp-metal': {
    id: 'ramp-metal',
    label: 'Industrial Ramp',
    description: 'A broad metal ramp that bridges the same two-level platform rise without visible steps.',
    category: 'architecture',
    tags: ['ramp', 'metal', 'accessible', 'industrial'],
    placement: traversalObject(),
    collision: { mode: 'none' },
    renderable: { renderer: 'procedural-furni', asset: 'ramp-metal', materialSlots: catalogueMaterialSlots('ramp-metal') },
    capabilities: { traversal: { status: 'implemented', mode: 'ramp', maxRiseSteps: 2 } },
  },
} as const satisfies Readonly<Record<string, CatalogueObjectDefinition>>;

export type CatalogueObjectId = keyof typeof CATALOGUE_OBJECTS;

export const CATALOGUE_OBJECT_ORDER: readonly CatalogueObjectId[] = [
  'chair', 'stool', 'sofa', 'table', 'bookcase', 'lamp', 'kitchen', 'sink', 'toilet', 'plant', 'vase',
  'stairs-block', 'stairs-glass', 'stairs-metal', 'ramp-metal',
] as const;

const CAPABILITY_LABELS: Readonly<Record<PrototypeCapabilityKey, string>> = {
  sit: 'Sit',
  lay: 'Lay',
  surface: 'Surface',
  light: 'Light',
  storage: 'Storage',
  use: 'Use',
  toggle: 'States',
  gate: 'Gate',
  teleport: 'Teleport',
  traversal: 'Traversal',
  roller: 'Roller',
  dispenser: 'Dispenser',
  wired: 'WIRED',
};

export function isCatalogueObjectId(id: PrototypeId): id is CatalogueObjectId {
  return Object.prototype.hasOwnProperty.call(CATALOGUE_OBJECTS, id);
}

export function getCatalogueObject(id: PrototypeId): CatalogueObjectDefinition {
  if (!isCatalogueObjectId(id)) throw new Error(`Unknown catalogue object: ${id}`);
  return CATALOGUE_OBJECTS[id];
}

export function getCatalogueObjectCategory(id: CatalogueObjectCategoryId): CatalogueObjectCategoryDefinition {
  const category = CATALOGUE_OBJECT_CATEGORIES.find((entry) => entry.id === id);
  if (!category) throw new Error(`Unknown catalogue object category: ${id}`);
  return category;
}

export function listCatalogueObjects(): readonly CatalogueObjectDefinition[] {
  return CATALOGUE_OBJECT_ORDER.map((id) => CATALOGUE_OBJECTS[id]);
}

export function footprintFor(prototypeId: PrototypeId, rotation: number): Footprint {
  const base = getCatalogueObject(prototypeId).placement.footprint;
  return rotation % 2 === 0 ? base : { width: base.depth, depth: base.width };
}

export function capabilitySummary(definition: CatalogueObjectDefinition): readonly {
  key: PrototypeCapabilityKey;
  label: string;
  status: CapabilityStatus;
}[] {
  const result: { key: PrototypeCapabilityKey; label: string; status: CapabilityStatus }[] = [];
  for (const key of Object.keys(CAPABILITY_LABELS) as PrototypeCapabilityKey[]) {
    const capability = definition.capabilities[key];
    if (!capability) continue;
    result.push({ key, label: CAPABILITY_LABELS[key], status: capability.status });
  }
  return result;
}

export function footprintLabel(prototypeId: PrototypeId): string {
  const footprint = getCatalogueObject(prototypeId).placement.footprint;
  return `${footprint.width}×${footprint.depth}`;
}
