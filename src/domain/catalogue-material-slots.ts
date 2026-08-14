import type { MaterialSlotDefinition } from './prototype-components';

const slots = (...definitions: readonly (readonly [string, string, string])[]): readonly MaterialSlotDefinition[] =>
  definitions.map(([id, label, description]) => ({ id, label, description }));

const MATERIAL_SLOTS: Readonly<Record<string, readonly MaterialSlotDefinition[]>> = {
  chair: slots(
    ['upholstery', 'Upholstery', 'Outer chair body and back upholstery.'],
    ['cushion', 'Cushion', 'Seat cushion and padded inset.'],
    ['frame', 'Frame', 'Wooden legs, arms, and structural trim.'],
  ),
  stool: slots(['seat', 'Seat', 'The upholstered stool top.'], ['frame', 'Frame', 'Legs and lower structure.']),
  table: slots(['wood', 'Wood', 'Table top, apron, and legs.'], ['runner', 'Runner', 'Decorative table runner or inset.']),
  sofa: slots(
    ['upholstery', 'Upholstery', 'Sofa body and back.'],
    ['cushion', 'Cushions', 'Seat and back cushions.'],
    ['frame', 'Frame', 'Wooden arms and structural details.'],
  ),
  vase: slots(['ceramic', 'Ceramic', 'Vase body and decorative bands.'], ['foliage', 'Foliage', 'Leaves arranged above the vase.']),
  bookcase: slots(['wood', 'Wood', 'Bookcase frame and shelves.']),
  lamp: slots(['frame', 'Frame', 'Lamp base and stand.'], ['shade', 'Shade', 'The lamp shade and light housing.']),
  kitchen: slots(
    ['cabinet', 'Cabinet', 'Cabinet fronts and body.'],
    ['counter', 'Counter', 'Worktop and counter trim.'],
    ['hardware', 'Hardware', 'Metal fittings and controls.'],
  ),
  sink: slots(
    ['cabinet', 'Cabinet', 'Sink cabinet body.'],
    ['ceramic', 'Basin', 'Basin and sanitary ceramic.'],
    ['hardware', 'Hardware', 'Tap and metal fittings.'],
  ),
  toilet: slots(['ceramic', 'Ceramic', 'Main sanitary ceramic body.'], ['seat', 'Seat', 'Seat and lid accent.']),
  plant: slots(['pot', 'Pot', 'Plant pot and decorative container.'], ['foliage', 'Foliage', 'Leaves and stems.']),
  'stairs-block': slots(['structure', 'Structure', 'All visible step blocks.']),
  'stairs-glass': slots(['treads', 'Treads', 'Transparent stair treads.'], ['frame', 'Frame', 'Metal support posts.']),
  'stairs-metal': slots(['treads', 'Treads', 'Walking surfaces.'], ['frame', 'Frame', 'Industrial stringers and supports.']),
  'ramp-metal': slots(['deck', 'Deck', 'Ramp walking surface.'], ['frame', 'Frame', 'Side rails and structural metal.']),
};

export function catalogueMaterialSlots(prototypeId: string): readonly MaterialSlotDefinition[] {
  return MATERIAL_SLOTS[prototypeId] ?? [];
}
