import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { getEntityPrototype } from '../domain/prototype-registry';
import type { CellAddress, EntityId, WorldEntity, WorldState } from '../domain/types';
import { createFurniEntity } from '../domain/world-state';

export interface TeleporterPair {
  readonly first: WorldEntity;
  readonly second: WorldEntity;
}

export function teleporterPairs(state: WorldState): readonly TeleporterPair[] {
  const seen = new Set<EntityId>();
  const result: TeleporterPair[] = [];
  for (const entity of state.entities) {
    if (seen.has(entity.id) || !isTeleporter(entity)) continue;
    const targetId = entity.components.teleporter?.targetEntityId;
    if (!targetId) continue;
    const target = entityById(state, targetId);
    if (!target || !isTeleporter(target) || target.components.teleporter?.targetEntityId !== entity.id) continue;
    seen.add(entity.id);
    seen.add(target.id);
    result.push({ first: entity, second: target });
  }
  return result;
}

export function createTeleporterPair(store: GameStore, first: CellAddress, second: CellAddress): boolean {
  if (sameAddress(first, second)) return false;
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const firstEntity = withTarget(createFurniEntity('tile.teleporter', first.position, 0, firstId, first.y), secondId);
  const secondEntity = withTarget(createFurniEntity('tile.teleporter', second.position, 0, secondId, second.y), firstId);
  return store.dispatchBatch([
    { type: 'entity/add', entity: firstEntity },
    { type: 'entity/add', entity: secondEntity },
  ]).accepted;
}

export function removeTeleporterPair(store: GameStore, entityId: EntityId): boolean {
  const entity = entityById(store.state, entityId);
  if (!entity || !isTeleporter(entity)) return false;
  const targetId = entity.components.teleporter?.targetEntityId;
  const actions = [{ type: 'entity/remove' as const, id: entity.id }];
  if (targetId && entityById(store.state, targetId)) actions.push({ type: 'entity/remove' as const, id: targetId });
  return actions.length === 1 ? store.dispatch(actions[0]!).accepted : store.dispatchBatch(actions).accepted;
}

export function isTeleporter(entity: WorldEntity): boolean {
  return getEntityPrototype(entity.prototypeId).capabilities?.teleport?.status === 'implemented';
}

function withTarget(entity: WorldEntity, targetEntityId: EntityId): WorldEntity {
  return {
    ...entity,
    components: { ...entity.components, teleporter: { targetEntityId } },
  };
}

function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return Math.abs(a.y-b.y)<0.000001 && a.position.x === b.position.x && a.position.z === b.position.z;
}
