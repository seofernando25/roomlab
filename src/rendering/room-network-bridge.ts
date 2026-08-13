import { actorEntities, entityById, furniEntities } from '../domain/entity-queries';
import type { InteractionAccessProvider } from '../domain/interaction-types';
import { isCatalogueObjectId } from '../domain/catalogue-registry';
import type { TopologyAction, WorldChange, WorldState } from '../domain/types';
import type { GameStore } from '../domain/game-store';
import type { RoomGameNetwork } from '../online/game-network';

export function roomAccessProvider(network: RoomGameNetwork | null): InteractionAccessProvider {
  const roomRight = network?.roomRight ?? 'owner';
  return (actorId) => ({ actorId, roomRight, inventoryPrototypeIds: new Set() });
}

export function forwardRoomNetworkChange(store: GameStore, change: WorldChange, network: RoomGameNetwork | null): void {
  if (!network) return;
  if (change.type === 'world/batch') {
    const teleports = change.actions.flatMap((action) => action.type === 'entity/add' && action.entity.prototypeId === 'tile.teleporter' ? [action.entity] : []);
    if (teleports.length === 2) {
      const first = teleports[0]!.components.transform;
      const second = teleports[1]!.components.transform;
      network.createTeleporter({ levelId: first.levelId, position: first.position }, { levelId: second.levelId, position: second.position });
      return;
    }
    for (const action of change.actions) if (action.type.startsWith('topology/')) network.topology(action as TopologyAction);
    return;
  }
  if (change.type.startsWith('topology/')) { network.topology(change as TopologyAction); return; }
  if (change.type === 'transform/rotate') {
    const entity = entityById(store.state, change.id);
    if (entity && isCatalogueObjectId(entity.prototypeId)) network.rotate(change.id, change.rotation);
  }
}

export function syncRoomDiagnostics(canvas: HTMLCanvasElement, state: WorldState, localActorId: string): void {
  const remoteActors = actorEntities(state).filter((entity) => entity.id !== localActorId);
  canvas.dataset.worldRevision = String(state.revision);
  canvas.dataset.remoteActors = String(remoteActors.length);
  canvas.dataset.remoteActorCells = remoteActors.map((entity) => {
    const transform = entity.components.transform;
    return `${entity.id}@${transform.levelId}:${transform.position.x},${transform.position.z}`;
  }).sort().join(';');
  canvas.dataset.topologySignature = topologySignature(state);
  const furni = furniEntities(state);
  canvas.dataset.furniCount = String(furni.length);
  canvas.dataset.objectPrototypes = furni.map((entity) => entity.prototypeId).sort().join(',');
}

function topologySignature(state: WorldState): string {
  return state.topology.levels.map((level) => {
    const cells = level.cells.map((cell) => `${cell.position.x},${cell.position.z},${cell.elevation},${cell.floorFinish}`).sort().join('|');
    const walls = level.walls.map((wall) => `${wall.axis},${wall.x},${wall.z},${wall.finish}`).sort().join('|');
    return `${level.id}:${level.baseElevation}:${cells}:${walls}`;
  }).join('||');
}
