import { DEFAULT_LEVEL_ID, createRectangularTopology } from '../src/domain/room-topology';
import type { GridPoint, RoomLevelId, RotationQuarter, WorldEntity, WorldState } from '../src/domain/types';

export const TEST_ACTOR_ID = 'actor:test';
export const GROUND = DEFAULT_LEVEL_ID;
export const addr = (x: number, z: number, levelId: RoomLevelId = GROUND) => ({ levelId, position: { x, z } });

export function testWorld(
  entities: readonly WorldEntity[] = [],
  width = 4,
  depth = 3,
  actorPosition: GridPoint = { x: 0, z: 0 },
  actorLevelId: RoomLevelId = GROUND,
): WorldState {
  return {
    id: 'test-room',
    revision: 0,
    topology: createRectangularTopology(width, depth),
    entities: [actor(TEST_ACTOR_ID, actorPosition, 0, actorLevelId), ...entities],
  };
}

export function furni(
  id: string,
  prototypeId: string,
  x: number,
  z: number,
  rotation: RotationQuarter = 0,
  levelId: RoomLevelId = GROUND,
  elevation = 0,
): WorldEntity {
  return { id, prototypeId, components: { transform: { levelId, position: { x, z }, rotation, ...(elevation === 0 ? {} : { elevation }) } } };
}

export function actor(
  id: string,
  position: GridPoint,
  direction = 0,
  levelId: RoomLevelId = GROUND,
): WorldEntity {
  return {
    id,
    prototypeId: 'actor.local-player',
    components: {
      transform: { levelId, position, rotation: 0 },
      actor: { pose: 'stand', direction },
    },
  };
}
