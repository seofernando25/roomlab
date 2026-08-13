import { entityById } from '../domain/entity-queries';
import { requirementsMet, type InteractionAccessContext } from '../domain/interaction-types';
import type { CollisionComponentDefinition, GateCapability } from '../domain/prototype-components';
import { getEntityPrototype } from '../domain/prototype-registry';
import { canTraverseTopologyEdge, roomCellAt } from '../domain/room-topology';
import { SpatialIndex } from '../domain/spatial-index';
import { traversalConnectsCells } from '../domain/traversal-links';
import type { CellAddress, EntityId, WorldEntity, WorldState } from '../domain/types';

export interface TraversalContext {
  readonly actorId: EntityId;
  readonly state: WorldState;
  readonly access?: InteractionAccessContext;
  readonly index?: SpatialIndex;
}

export function canTraverseCell(context: TraversalContext, address: CellAddress): boolean {
  if (!roomCellAt(context.state.topology, address)) return false;
  const index = context.index ?? SpatialIndex.fromWorld(context.state);
  for (const occupant of index.entitiesAt(address)) {
    if (occupant.entityId === context.actorId) continue;
    const entity = entityById(context.state, occupant.entityId);
    if (entity && blocksActorTraversal(entity, context.access)) return false;
  }
  return true;
}

export function canTraverseBetween(context: TraversalContext, from: CellAddress, to: CellAddress): boolean {
  if (!canTraverseCell(context, to)) return false;
  return canTraverseTopologyEdge(context.state.topology, from, to)
    || traversalConnectsCells(context.state, from, to);
}

export function blocksActorTraversal(entity: WorldEntity, access?: InteractionAccessContext): boolean {
  const prototype = getEntityPrototype(entity.prototypeId);
  const gate = prototype.capabilities?.gate;
  if (gate?.status === 'implemented' && gate.autoOpen && gateAccessAllowed(gate, access)) return false;
  return collisionBlocksActor(prototype.collision, gate, entity.components.toggle?.state);
}

export function collisionBlocksActor(
  collision: CollisionComponentDefinition,
  gate: GateCapability | undefined,
  toggleState: number | undefined,
): boolean {
  if (collision.mode === 'none') return false;
  if (collision.mode === 'solid') return true;
  if (!gate || gate.status !== 'implemented') return true;
  return (toggleState ?? 0) !== gate.passableState;
}

function gateAccessAllowed(gate: GateCapability, access?: InteractionAccessContext): boolean {
  if (!gate.requirements?.length) return true;
  return access ? requirementsMet(gate.requirements, access) : false;
}
