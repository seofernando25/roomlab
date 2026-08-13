import type { GameStore } from '../domain/game-store';
import type { EntityId } from '../domain/types';
import { ActorMotionSystem } from './actor-motion-system';
import { InteractionDispatcher } from './interaction-dispatcher';
import { toggleEntity } from './toggle-system';

export interface PlayerInteractionHooks {
  readonly onSit?: (targetEntityId: EntityId, seatIndex: number) => void;
  readonly onTeleport?: (targetEntityId: EntityId) => void;
}

export function createPlayerInteractionDispatcher(store: GameStore, actor: ActorMotionSystem, hooks: PlayerInteractionHooks = {}): InteractionDispatcher {
  const dispatcher = new InteractionDispatcher();
  dispatcher.register('sit', (intent) => {
    if (intent.kind !== 'sit' || !actor.sitAt(intent.seat, store.state)) return false;
    hooks.onSit?.(intent.targetId, intent.seat.seatIndex);
    return true;
  });
  dispatcher.register('toggle', (intent) => intent.kind === 'toggle' && toggleEntity(store, intent.targetId));
  dispatcher.register('teleport', (intent) => {
    if (intent.kind !== 'teleport' || !actor.useTeleporter(intent.targetId, store.state)) return false;
    hooks.onTeleport?.(intent.targetId);
    return true;
  });
  return dispatcher;
}
