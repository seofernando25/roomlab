import type { EntityId, WorldState } from './types';

export type RoomRightLevel = 'guest' | 'rights' | 'owner';

export type InteractionRequirement =
  | { readonly type: 'room-right'; readonly level: RoomRightLevel }
  | { readonly type: 'inventory-item'; readonly prototypeId: string; readonly consume?: boolean };

export interface InteractionAccessContext {
  readonly actorId: EntityId;
  readonly roomRight: RoomRightLevel;
  readonly inventoryPrototypeIds: ReadonlySet<string>;
}

export type InteractionAccessProvider = (actorId: EntityId, state: WorldState) => InteractionAccessContext;

export function staticInteractionAccessProvider(
  roomRight: RoomRightLevel,
  inventoryPrototypeIds: ReadonlySet<string> = new Set(),
): InteractionAccessProvider {
  return (actorId) => ({ actorId, roomRight, inventoryPrototypeIds });
}

export function requirementsMet(requirements: readonly InteractionRequirement[] | undefined, context: InteractionAccessContext): boolean {
  if (!requirements?.length) return true;
  return requirements.every((requirement) => {
    if (requirement.type === 'inventory-item') return context.inventoryPrototypeIds.has(requirement.prototypeId);
    return rightRank(context.roomRight) >= rightRank(requirement.level);
  });
}

function rightRank(level: RoomRightLevel): number {
  if (level === 'owner') return 2;
  if (level === 'rights') return 1;
  return 0;
}
