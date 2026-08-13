import type { InteractionAccessContext } from '../domain/interaction-types';
import type { CellAddress, EntityId, WorldState } from '../domain/types';
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
  }

  if (!query.cell) return { type: 'none' };
  if (canTraverseCell({ actorId: query.actorId, state: query.state, access: query.access }, query.cell)) {
    return { type: 'walk', cell: query.cell };
  }
  return { type: 'blocked', cell: query.cell };
}
