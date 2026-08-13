import { entityById } from '../domain/entity-queries';
import { requirementsMet, type InteractionAccessContext } from '../domain/interaction-types';
import { getEntityPrototype } from '../domain/prototype-registry';
import type { EntityId, WorldState } from '../domain/types';
import { seatTargetFor, type SeatTarget } from './seating-system';

export type InteractionKind = 'sit' | 'use' | 'toggle' | 'teleport';

export type InteractionIntent =
  | { readonly kind: 'sit'; readonly actorId: EntityId; readonly targetId: EntityId; readonly priority: number; readonly seat: SeatTarget }
  | { readonly kind: 'use'; readonly actorId: EntityId; readonly targetId: EntityId; readonly priority: number; readonly actionId: string; readonly label: string }
  | { readonly kind: 'toggle'; readonly actorId: EntityId; readonly targetId: EntityId; readonly priority: number }
  | { readonly kind: 'teleport'; readonly actorId: EntityId; readonly targetId: EntityId; readonly priority: number };

export interface InteractionQuery {
  readonly state: WorldState;
  readonly actorId: EntityId;
  readonly targetId: EntityId;
  readonly point?: { readonly x: number; readonly z: number };
  readonly access: InteractionAccessContext;
}

export function resolveInteractions(query: InteractionQuery): readonly InteractionIntent[] {
  const target = entityById(query.state, query.targetId);
  if (!target) return [];
  const capabilities = getEntityPrototype(target.prototypeId).capabilities;
  if (!capabilities) return [];
  const intents: InteractionIntent[] = [];

  const sit = capabilities.sit;
  if (sit?.status === 'implemented' && requirementsMet(sit.requirements, query.access)) {
    const seat = seatTargetFor(target, query.point);
    if (seat) intents.push({ kind: 'sit', actorId: query.actorId, targetId: target.id, priority: 100, seat });
  }

  const teleport = capabilities.teleport;
  if (teleport?.status === 'implemented' && requirementsMet(teleport.requirements, query.access)) {
    intents.push({ kind: 'teleport', actorId: query.actorId, targetId: target.id, priority: 90 });
  }

  const toggle = capabilities.toggle;
  if (toggle?.status === 'implemented' && requirementsMet(toggle.requirements, query.access)) {
    intents.push({ kind: 'toggle', actorId: query.actorId, targetId: target.id, priority: 70 });
  }

  const use = capabilities.use;
  if (use?.status === 'implemented' && requirementsMet(use.requirements, query.access)) {
    intents.push({ kind: 'use', actorId: query.actorId, targetId: target.id, priority: 50, actionId: use.actionId, label: use.actionLabel });
  }

  return intents.sort((a, b) => b.priority - a.priority);
}

export function defaultInteraction(query: InteractionQuery): InteractionIntent | null {
  return resolveInteractions(query)[0] ?? null;
}
