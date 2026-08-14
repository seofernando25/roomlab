import { entityKindForPrototype } from './prototype-registry';
import type { CellAddress, EntityId, EntityKind, WorldEntity, WorldState } from './types';

export const LOCAL_PLAYER_ID = 'actor:local-player';
export const LOCAL_PLAYER_PROTOTYPE_ID = 'actor.local-player';

export function entityById(state: WorldState, id: EntityId): WorldEntity | undefined {
  return state.entities.find((entity) => entity.id === id);
}

export function entityIsKind(entity: WorldEntity, kind: EntityKind): boolean {
  return entityKindForPrototype(entity.prototypeId) === kind;
}

export function furniEntities(state: WorldState): readonly WorldEntity[] {
  return state.entities.filter((entity) => entityIsKind(entity, 'furni'));
}

export function actorEntities(state: WorldState): readonly WorldEntity[] {
  return state.entities.filter((entity) => entity.components.actor !== undefined);
}

export function localPlayerEntity(state: WorldState): WorldEntity {
  const entity = entityById(state, LOCAL_PLAYER_ID);
  if (!entity?.components.actor) throw new Error('Local player entity is missing from world state.');
  return entity;
}

export function entityCell(entity: WorldEntity): CellAddress {
  const transform = entity.components.transform;
  return { y: transform.y, position: transform.position };
}
