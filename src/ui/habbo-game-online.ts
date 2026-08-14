import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import type { WorldChange, WorldState } from '../domain/types';
import type { RoomGameNetwork } from '../online/game-network';
import type { RoomServerMessage } from '../online/types';
import type { RoomScene } from '../rendering/room-scene';

export interface OnlineMessageContext {
  readonly store: GameStore;
  readonly scene: RoomScene | null;
  readonly network: RoomGameNetwork | null;
  readonly showMessage: (message: string) => void;
  readonly setPresenceCount: (count: number) => void;
  readonly requestInventoryRefresh: () => void;
}

export function applyOnlineServerMessage(message: RoomServerMessage, context: OnlineMessageContext): void {
  const { store, scene, network } = context;
  if (message.type === 'world' || message.type === 'hello') {
    const snapshot = network ? preserveActor(message.snapshot, store.state, network.actorId) : message.snapshot;
    const result = store.replaceFromServer(snapshot);
    if (!result.accepted) console.warn(`Rejected authoritative room snapshot r${snapshot.revision}: ${result.reason ?? 'unknown reason'}`);
    return;
  }
  if (message.type === 'rejected' && message.snapshot) {
    store.replaceFromServer(message.snapshot);
    context.requestInventoryRefresh();
    context.showMessage(message.reason);
    return;
  }
  if (message.type === 'actor') {
    applyAuthoritativeActor(message, context);
    return;
  }
  if (message.type === 'presence') {
    context.setPresenceCount(message.users.length);
    return;
  }
  if (message.type === 'chat') {
    scene?.showChat(message.actorId, message.chatId, message.text);
    return;
  }
  if (message.type === 'manipulation') {
    scene?.applyRemoteManipulation(message.pose.entityId, message.pose.transform, message.pose.lift);
    return;
  }
  if (message.type === 'manipulation-end') {
    scene?.clearRemoteManipulation(message.entityId);
    return;
  }
  if (message.type === 'toast') context.showMessage(message.message);
}

export function forwardPredictedInventoryPlacement(
  change: WorldChange,
  network: RoomGameNetwork | null,
  pendingItemId: string | null,
): { consumed: boolean } {
  if (!network || !pendingItemId || change.type !== 'entity/add' || change.entity.prototypeId === 'tile.teleporter') return { consumed: false };
  network.place(pendingItemId, change.entity.prototypeId, change.entity.components.transform, change.entity.components.appearance ?? null);
  return { consumed: true };
}

function applyAuthoritativeActor(message: Extract<RoomServerMessage, { type: 'actor' }>, context: OnlineMessageContext): void {
  const entity = entityById(context.store.state, message.actorId);
  if (!entity) return;
  if (message.actorId === context.network?.actorId && message.pose === 'walk') return;
  const actor = {
    pose: message.pose,
    direction: message.direction,
    ...(message.seatedOn ? { seatedOn: message.seatedOn } : {}),
    ...(message.seatIndex === undefined ? {} : { seatIndex: message.seatIndex }),
  };
  const transformChanged = JSON.stringify(entity.components.transform) !== JSON.stringify(message.transform);
  const actorChanged = JSON.stringify(entity.components.actor) !== JSON.stringify(actor);
  if (transformChanged || actorChanged) context.store.dispatchBatch([
    { type: 'transform/set', id: message.actorId, transform: message.transform, validatePlacement: false },
    { type: 'component/set', id: message.actorId, component: 'actor', value: actor },
  ]);
  if (message.actorId === context.network?.actorId) context.scene?.syncPlayerFromWorld();
  else context.scene?.applyRemoteActorVisual(message.actorId, message.visual.x, message.visual.y, message.visual.z);
}

function preserveActor(snapshot: WorldState, current: WorldState, actorId: string): WorldState {
  const local = entityById(current, actorId);
  if (!local) return snapshot;
  return { ...snapshot, entities: snapshot.entities.map((entity) => entity.id === actorId ? local : entity) };
}
