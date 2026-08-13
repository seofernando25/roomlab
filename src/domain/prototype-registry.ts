import { listCatalogueObjects } from './catalogue-registry';
import type {
  CollisionComponentDefinition,
  PrototypeCapabilities,
  PrototypeSpatialDefinition,
  RenderableComponentDefinition,
} from './prototype-components';
import type { EntityKind, PrototypeId } from './types';

export interface EntityPrototypeDefinition {
  readonly id: PrototypeId;
  readonly kind: EntityKind;
  readonly label: string;
  readonly spatial?: PrototypeSpatialDefinition;
  readonly collision: CollisionComponentDefinition;
  readonly renderable: RenderableComponentDefinition;
  readonly capabilities?: PrototypeCapabilities;
}

export class PrototypeRegistry {
  readonly #definitions = new Map<PrototypeId, EntityPrototypeDefinition>();

  register(definition: EntityPrototypeDefinition): void {
    if (this.#definitions.has(definition.id)) throw new Error(`Duplicate entity prototype: ${definition.id}`);
    this.#definitions.set(definition.id, definition);
  }

  get(id: PrototypeId): EntityPrototypeDefinition {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Unknown entity prototype: ${id}`);
    return definition;
  }

  has(id: PrototypeId): boolean { return this.#definitions.has(id); }
  list(): readonly EntityPrototypeDefinition[] { return [...this.#definitions.values()]; }
}

export const ENTITY_PROTOTYPES = new PrototypeRegistry();

for (const object of listCatalogueObjects()) {
  ENTITY_PROTOTYPES.register({
    id: object.id,
    kind: 'furni',
    label: object.label,
    spatial: object.placement,
    collision: object.collision,
    renderable: object.renderable,
    capabilities: object.capabilities,
  });
}

ENTITY_PROTOTYPES.register({
  id: 'actor.local-player',
  kind: 'actor',
  label: 'Local player',
  spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: false, occupancyLayer: 'actor', conflictsWith: [] },
  collision: { mode: 'none' },
  renderable: { renderer: 'human-avatar' },
});
ENTITY_PROTOTYPES.register({
  id: 'npc.generic',
  kind: 'npc',
  label: 'NPC',
  spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: false, occupancyLayer: 'actor', conflictsWith: [] },
  collision: { mode: 'none' },
  renderable: { renderer: 'none' },
});
ENTITY_PROTOTYPES.register({
  id: 'pet.generic',
  kind: 'pet',
  label: 'Pet',
  spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: false, occupancyLayer: 'actor', conflictsWith: [] },
  collision: { mode: 'none' },
  renderable: { renderer: 'none' },
});
ENTITY_PROTOTYPES.register({
  id: 'effect.generic',
  kind: 'effect',
  label: 'Attached visual effect',
  spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: false, occupancyLayer: 'effect', conflictsWith: [] },
  collision: { mode: 'none' },
  renderable: { renderer: 'none' },
});
ENTITY_PROTOTYPES.register({
  id: 'tile.teleporter',
  kind: 'furni',
  label: 'Linked Teleport Tile',
  spatial: {
    footprint: { width: 1, depth: 1 },
    rotatesWithEntity: false,
    occupancyLayer: 'floor-overlay',
    conflictsWith: ['floor-overlay'],
    canStack: false,
  },
  collision: { mode: 'none' },
  renderable: { renderer: 'procedural-furni', asset: 'teleport-tile' },
  capabilities: { teleport: { status: 'implemented', paired: true } },
});

export function getEntityPrototype(id: PrototypeId): EntityPrototypeDefinition {
  return ENTITY_PROTOTYPES.get(id);
}

export function entityKindForPrototype(id: PrototypeId): EntityKind {
  return getEntityPrototype(id).kind;
}
