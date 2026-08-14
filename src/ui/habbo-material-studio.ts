import { getCatalogueObject, isCatalogueObjectId, type CatalogueObjectId } from '../domain/catalogue-registry';
import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import type { AppearanceComponent } from '../domain/material-design';
import type { EntityId } from '../domain/types';
import type { RoomGameNetwork } from '../online/game-network';

export type MaterialStudioTarget =
  | { readonly kind: 'placement'; readonly prototypeId: CatalogueObjectId; readonly itemInstanceId?: string; readonly appearance: AppearanceComponent | null }
  | { readonly kind: 'entity'; readonly prototypeId: CatalogueObjectId; readonly entityId: EntityId; readonly appearance: AppearanceComponent | null };

export interface MaterialStudioApplyResult {
  readonly pendingItemId?: string | null;
  readonly message?: string;
}

export function selectedMaterialStudioTarget(store: GameStore): MaterialStudioTarget | null {
  const id = store.editorState.selectedEntityId;
  const entity = id ? entityById(store.state, id) : undefined;
  if (!entity || !isCatalogueObjectId(entity.prototypeId) || !getCatalogueObject(entity.prototypeId).renderable.materialSlots?.length) return null;
  return { kind: 'entity', prototypeId: entity.prototypeId, entityId: entity.id, appearance: entity.components.appearance ?? null };
}

export function applyMaterialStudioTarget(
  target: MaterialStudioTarget,
  appearance: AppearanceComponent | null,
  store: GameStore,
  network: RoomGameNetwork | null,
): MaterialStudioApplyResult {
  if (target.kind === 'placement') {
    store.dispatchEditor({ type: 'placement-prototype/set', prototypeId: target.prototypeId });
    store.dispatchEditor({ type: 'placement-appearance/set', appearance });
    store.dispatchEditor({ type: 'tool/set', tool: 'place-prototype' });
    return { pendingItemId: target.itemInstanceId ?? null, message: `Styled ${getCatalogueObject(target.prototypeId).label} ready to place.` };
  }
  const result = store.dispatch({ type: 'component/set', id: target.entityId, component: 'appearance', value: appearance });
  if (result.accepted) network?.setAppearance(target.entityId, appearance);
  return {};
}
