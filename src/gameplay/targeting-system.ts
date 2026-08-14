import type { InteractionAccessContext } from '../domain/interaction-types';
import { entityById } from '../domain/entity-queries';
import type { CellAddress, EntityId, WorldState } from '../domain/types';
import { getEntityPrototype } from '../domain/prototype-registry';
import { traversalConnectionForEntity } from '../domain/traversal-links';
import { defaultInteraction, type InteractionIntent } from './interaction-system';
import { canTraverseCell } from './traversal-system';

export type TargetAction =
  | { readonly type: 'interaction'; readonly intent: InteractionIntent }
  | { readonly type: 'walk'; readonly cell: CellAddress }
  | { readonly type: 'blocked'; readonly cell: CellAddress }
  | { readonly type: 'none' };

export interface TargetingQuery {
  readonly state: WorldState;
  readonly actorId: EntityId;
  readonly targetId?: EntityId;
  readonly cell?: CellAddress;
  readonly point?: { readonly x: number; readonly z: number };
  readonly access: InteractionAccessContext;
}

export function resolveTargetAction(query: TargetingQuery): TargetAction {
  if (query.targetId) {
    const intent = defaultInteraction({
      state: query.state,
      actorId: query.actorId,
      targetId: query.targetId,
      ...(query.point ? { point: query.point } : {}),
      access: query.access,
    });
    if (intent) return { type: 'interaction', intent };
    const target = entityById(query.state, query.targetId);
    const traversal = target ? getEntityPrototype(target.prototypeId).capabilities?.traversal : undefined;
    if (target && traversal?.status === 'implemented') {
      const connection = traversalConnectionForEntity(query.state, target);
      const actor = entityById(query.state, query.actorId);
      if (connection && actor) {
        const actorCell = { y: actor.components.transform.y, position: actor.components.transform.position };
        return { type: 'walk', cell: sameAddress(actorCell, connection.high) ? connection.low : connection.high };
      }
    }
  }

  if (!query.cell) return { type: 'none' };
  if (canTraverseCell({ actorId: query.actorId, state: query.state, access: query.access }, query.cell)) {
    return { type: 'walk', cell: query.cell };
  }
  return { type: 'blocked', cell: query.cell };
}

function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return Math.abs(a.y-b.y)<0.000001 && a.position.x === b.position.x && a.position.z === b.position.z;
}
