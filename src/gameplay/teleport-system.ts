import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { getEntityPrototype } from '../domain/prototype-registry';
import type { CellAddress, EntityId, WorldState } from '../domain/types';

export function teleportDestination(state: WorldState, sourceId: EntityId): CellAddress | null {
  const source = entityById(state, sourceId);
  if (!source) return null;
  const capability = getEntityPrototype(source.prototypeId).capabilities?.teleport;
  if (!capability || capability.status !== 'implemented') return null;
  const targetId = source.components.teleporter?.targetEntityId;
  if (!targetId) return null;
  const target = entityById(state, targetId);
  if (!target) return null;
  const transform = target.components.transform;
  return { levelId: transform.levelId, position: transform.position };
}

/** Headless actor teleport for NPCs/server simulation. Presentation controllers can use the same destination query. */
export function teleportActor(store: GameStore, actorId: EntityId, sourceId: EntityId): boolean {
  const destination = teleportDestination(store.state, sourceId);
  const actorEntity = entityById(store.state, actorId);
  const actor = actorEntity?.components.actor;
  if (!destination || !actor) return false;
  return store.dispatchBatch([
    { type: 'transform/move', id: actorId, address: destination, validatePlacement: false },
    { type: 'component/set', id: actorId, component: 'actor', value: { pose: 'stand', direction: actor.direction } },
  ]).accepted;
}
