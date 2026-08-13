import type {
  CollisionComponentDefinition,
  PrototypeCapabilities,
  PrototypeSpatialDefinition,
  RenderableComponentDefinition,
} from './prototype-components';
import type { PrototypeId } from './types';

export type CatalogueObjectCategoryId =
  | 'seating'
  | 'surfaces'
  | 'storage'
  | 'lighting'
  | 'kitchen'
  | 'bathroom'
  | 'decor'
  | 'architecture';

export type CataloguePlacementSurface = 'floor' | 'wall';

export interface CatalogueObjectCategoryDefinition {
  readonly id: CatalogueObjectCategoryId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export interface CataloguePlacementDefinition extends PrototypeSpatialDefinition {
  readonly surface: CataloguePlacementSurface;
}

/** Catalogue metadata layered over generic entity prototype components. */
export interface CatalogueObjectDefinition {
  readonly id: PrototypeId;
  readonly label: string;
  readonly description: string;
  readonly category: CatalogueObjectCategoryId;
  readonly tags: readonly string[];
  readonly placement: CataloguePlacementDefinition;
  readonly collision: CollisionComponentDefinition;
  readonly renderable: RenderableComponentDefinition & { readonly renderer: 'procedural-furni'; readonly asset: string };
  readonly capabilities: PrototypeCapabilities;
}
