import { describe, expect, test } from 'bun:test';
import { reduceEditor } from '../src/domain/editor-state';
import { GameStore } from '../src/domain/game-store';
import { staticInteractionAccessProvider } from '../src/domain/interaction-types';
import {
  FLOOR_STEP_HEIGHT,
  roomCellAt,
  roomLevel,
  suggestedNewCell,
  wallAt,
  wallIsExterior,
} from '../src/domain/room-topology';
import type { EditorState, WorldEntity, WorldState } from '../src/domain/types';
import { traversalConnectionForEntity } from '../src/domain/traversal-links';
import { reduceWorld } from '../src/domain/world-state';
import { ActorMotionSystem } from '../src/gameplay/actor-motion-system';
import { cellBuildTargetValid, wallBuildTargetValid } from '../src/gameplay/build-preview';
import { findActorPath } from '../src/gameplay/navigation-system';
import {
  addStorey,
  commitFloorPropertyBrush,
  commitFloorShape,
  commitWallShape,
  floorShapeIntent,
  nudgeActiveStoreyBase,
} from '../src/gameplay/room-build-operations';
import { createTeleporterPair, removeTeleporterPair, teleporterPairs } from '../src/gameplay/teleporter-editor';
import { addr, furni, GROUND, TEST_ACTOR_ID, testWorld } from './helpers';

const OWNER_PROVIDER = staticInteractionAccessProvider('owner');

function editor(tool: EditorState['tool'] = 'floor-shape', levelId = GROUND): EditorState {
  return {
    selectedEntityId: null, tool, activeLevelId: levelId, floorFinish: 'wood', wallFinish: 'cream-brick',
    pendingAnchor: null, placementPrototypeId: null, placementRotation: 0,
  };
}

describe('sparse floor shape and storeys', () => {
  test('Floor Shape adds from a ghost neighbor and can immediately branch sideways', () => {
    const store = new GameStore(testWorld([], 2, 2));
    const east = addr(2, 1);
    expect(floorShapeIntent(store.state, east)).toBe('add');
    expect(commitFloorShape(store, 'add', [east, addr(2, 2), addr(3, 2)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology, east)).toBeDefined();
    expect(roomCellAt(store.state.topology, addr(2, 2))).toBeDefined();
    expect(roomCellAt(store.state.topology, addr(3, 2))).toBeDefined();
  });

  test('Floor Shape refuses isolated additions but supports negative coordinates naturally', () => {
    const store = new GameStore(testWorld([], 2, 2));
    expect(commitFloorShape(store, 'add', [addr(10, 10)]).accepted).toBeFalse();
    expect(commitFloorShape(store, 'add', [addr(-1, 0), addr(-2, 0), addr(-2, -1)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology, addr(-2, -1))).toBeDefined();
  });

  test('removing occupied floor is rejected while empty sparse floor can be removed', () => {
    const store = new GameStore(testWorld([furni('chair', 'chair', 1, 1)], 3, 2));
    expect(commitFloorShape(store, 'remove', [addr(1, 1)]).accepted).toBeFalse();
    expect(commitFloorShape(store, 'remove', [addr(2, 1)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology, addr(2, 1))).toBeUndefined();
  });

  test('floor finish and local elevation are topology properties, not entities', () => {
    const store = new GameStore(testWorld([], 3, 2));
    const entityCount = store.state.entities.length;
    store.dispatchEditor({ type: 'floor-finish/set', finish: 'terracotta' });
    expect(commitFloorPropertyBrush(store, 'floor-paint', [addr(2, 1)]).accepted).toBeTrue();
    expect(commitFloorPropertyBrush(store, 'floor-raise', [addr(2, 1)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology, addr(2, 1))).toMatchObject({ floorFinish: 'terracotta', elevation: 1 });
    expect(store.state.entities).toHaveLength(entityCount);
  });

  test('multi-cell objects prevent sculpting one support cell onto a different plane', () => {
    const store = new GameStore(testWorld([furni('table', 'table', 0, 0)], 3, 2));
    expect(commitFloorPropertyBrush(store, 'floor-raise', [addr(0, 0)]).accepted).toBeFalse();
  });

  test('a second storey can contain floor directly above the same ground X/Z', () => {
    const store = new GameStore(testWorld([], 3, 2));
    const upper = addStorey(store)!;
    expect(upper.baseElevation).toBe(10);
    expect(roomLevel(store.state.topology, upper.id)?.cells).toHaveLength(0);
    const sameXZ = addr(1, 1, upper.id);
    expect(suggestedNewCell(store.state.topology, sameXZ, 'wood')).toBeDefined();
    expect(commitFloorShape(store, 'add', [sameXZ]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology, addr(1, 1))).toBeDefined();
    expect(roomCellAt(store.state.topology, sameXZ)).toBeDefined();
  });

  test('storey base height is independent from per-tile sculpting and cannot collide with another storey base', () => {
    const store = new GameStore(testWorld());
    const upper = addStorey(store)!;
    expect(nudgeActiveStoreyBase(store, -1).accepted).toBeTrue();
    expect(roomLevel(store.state.topology, upper.id)?.baseElevation).toBe(9);
    for (let i = 0; i < 8; i += 1) expect(nudgeActiveStoreyBase(store, -1).accepted).toBeTrue();
    expect(roomLevel(store.state.topology, upper.id)?.baseElevation).toBe(1);
    expect(nudgeActiveStoreyBase(store, -1).accepted).toBeFalse();
    expect(roomLevel(store.state.topology, upper.id)?.baseElevation).toBe(1);
  });

  test('build preview delegates to the same floor legality rules', () => {
    const state = testWorld([furni('chair', 'chair', 1, 1)], 3, 2);
    expect(cellBuildTargetValid(state, editor(), addr(1, 1))).toBeFalse();
    expect(cellBuildTargetValid(state, editor(), addr(3, 1))).toBeTrue();
  });
});

describe('objects with traversal capability', () => {
  test('a traversal-capable object remains freely placeable on flat floor', () => {
    const state = testWorld([], 3, 2);
    const stairs = furni('stairs', 'stairs-block', 1, 0, 3);
    expect(reduceWorld(state, { type: 'entity/add', entity: stairs })).not.toBe(state);
    expect(traversalConnectionForEntity(state, stairs)).toBeNull();
  });

  test('the same ordinary object activates traversal when oriented toward a two-step ledge', () => {
    let state = reduceWorld(testWorld([], 2, 1, { x: 0, z: 0 }), {
      type: 'topology/cells-update', updates: [{ levelId: GROUND, position: { x: 1, z: 0 }, elevation: 2 }],
    });
    expect(findActorPath(state, TEST_ACTOR_ID, addr(0, 0), addr(1, 0))).toBeNull();
    const stairs = furni('stairs', 'stairs-glass', 0, 0, 3);
    state = reduceWorld(state, { type: 'entity/add', entity: stairs });
    expect(traversalConnectionForEntity(state, stairs)).toMatchObject({ low: addr(0, 0), high: addr(1, 0), riseSteps: 2 });
    expect(findActorPath(state, TEST_ACTOR_ID, addr(0, 0), addr(1, 0))).not.toBeNull();
  });

  test('wrong orientation does not grant traversal but remains a valid placed object', () => {
    let state = reduceWorld(testWorld([], 2, 1, { x: 0, z: 0 }), {
      type: 'topology/cells-update', updates: [{ levelId: GROUND, position: { x: 1, z: 0 }, elevation: 2 }],
    });
    const stairs = furni('stairs', 'stairs-block', 0, 0, 0);
    const withStairs = reduceWorld(state, { type: 'entity/add', entity: stairs });
    expect(withStairs).not.toBe(state);
    expect(traversalConnectionForEntity(withStairs, stairs)).toBeNull();
    expect(findActorPath(withStairs, TEST_ACTOR_ID, addr(0, 0), addr(1, 0))).toBeNull();
  });

  test('multi-piece stair runs can climb toward a high storey using intermediate sculpted landings', () => {
    let state = testWorld([], 4, 1, { x: 0, z: 0 });
    state = reduceWorld(state, { type: 'topology/cells-update', updates: [
      { levelId: GROUND, position: { x: 1, z: 0 }, elevation: 2 },
      { levelId: GROUND, position: { x: 2, z: 0 }, elevation: 4 },
      { levelId: GROUND, position: { x: 3, z: 0 }, elevation: 6 },
    ] });
    for (const x of [0, 1, 2]) state = reduceWorld(state, { type: 'entity/add', entity: furni(`stair:${x}`, 'stairs-metal', x, 0, 3) });
    expect(findActorPath(state, TEST_ACTOR_ID, addr(0, 0), addr(3, 0))).not.toBeNull();
  });

  test('actor visual height follows local raised floor while moving', () => {
    const state = reduceWorld(testWorld([], 2, 1, { x: 0, z: 0 }), {
      type: 'topology/cells-update', updates: [{ levelId: GROUND, position: { x: 1, z: 0 }, elevation: 1 }],
    });
    const store = new GameStore(state);
    const motion = new ActorMotionSystem(store, TEST_ACTOR_ID, OWNER_PROVIDER);
    expect(motion.moveTo(addr(1, 0), store.state)).toBeTrue();
    for (let i = 0; i < 10 && motion.cell.position.x !== 1; i += 1) motion.update(0.1);
    expect(motion.visualPose.elevation).toBeCloseTo(FLOOR_STEP_HEIGHT, 4);
  });
});

describe('wall shape and visibility semantics', () => {
  test('Wall Shape adds an interior partition that blocks pathfinding, then removes it', () => {
    const store = new GameStore(testWorld([], 3, 1, { x: 0, z: 0 }));
    const edge = { axis: 'z' as const, x: 1, z: 0 };
    expect(commitWallShape(store, 'add', [edge]).accepted).toBeTrue();
    expect(findActorPath(store.state, TEST_ACTOR_ID, addr(0, 0), addr(2, 0))).toBeNull();
    expect(commitWallShape(store, 'remove', [edge]).accepted).toBeTrue();
    expect(findActorPath(store.state, TEST_ACTOR_ID, addr(0, 0), addr(2, 0))).not.toBeNull();
  });

  test('interior versus exterior wall classification comes from floor on one/both sides', () => {
    const state = testWorld([], 2, 1);
    const westOuter = wallAt(state.topology, GROUND, 'z', 0, 0)!;
    expect(wallIsExterior(state.topology, GROUND, westOuter)).toBeTrue();
    const interior = reduceWorld(state, { type: 'topology/wall-set', levelId: GROUND, wall: { axis: 'z', x: 1, z: 0, finish: 'blue-panel' } });
    expect(wallIsExterior(interior.topology, GROUND, wallAt(interior.topology, GROUND, 'z', 1, 0)!)).toBeFalse();
  });

  test('wall placement through a multi-cell object footprint is rejected', () => {
    const state = testWorld([furni('table', 'table', 0, 0)], 3, 2, { x: 2, z: 1 });
    const invalid = reduceWorld(state, { type: 'topology/wall-set', levelId: GROUND, wall: { axis: 'z', x: 1, z: 0, finish: 'cream-brick' } });
    expect(invalid).toBe(state);
  });

  test('removing the last adjacent floor automatically prunes orphan wall segments', () => {
    let state: WorldState = { ...testWorld([], 1, 1), entities: [] };
    expect(wallAt(state.topology, GROUND, 'x', 0, 0)).toBeDefined();
    state = reduceWorld(state, { type: 'topology/cells-remove', levelId: GROUND, positions: [{ x: 0, z: 0 }] });
    expect(roomLevel(state.topology, GROUND)?.walls).toHaveLength(0);
  });

  test('wall preview uses same legality rules as commit', () => {
    const state = testWorld([], 2, 1);
    expect(wallBuildTargetValid(state, { ...editor('wall-shape'), wallFinish: 'blue-panel' }, { axis: 'z', x: 1, z: 0 })).toBeTrue();
  });
});

describe('linked teleports across storeys', () => {
  test('pair creation is atomic and reciprocal across different storeys', () => {
    const store = new GameStore(testWorld([], 4, 2));
    const upper = addStorey(store)!;
    expect(commitFloorShape(store, 'add', [addr(3, 1, upper.id)]).accepted).toBeTrue();
    expect(createTeleporterPair(store, addr(1, 1), addr(3, 1, upper.id))).toBeTrue();
    const pair = teleporterPairs(store.state)[0]!;
    expect(pair.first.components.teleporter?.targetEntityId).toBe(pair.second.id);
    expect(pair.second.components.teleporter?.targetEntityId).toBe(pair.first.id);
  });

  test('teleport endpoints may use the same X/Z on different storeys', () => {
    const store = new GameStore(testWorld([], 3, 2));
    const upper = addStorey(store)!;
    expect(commitFloorShape(store, 'add', [addr(1, 1, upper.id)]).accepted).toBeTrue();
    expect(createTeleporterPair(store, addr(1, 1), addr(1, 1, upper.id))).toBeTrue();
    const pair = teleporterPairs(store.state)[0]!;
    expect(pair.first.components.transform.levelId).not.toBe(pair.second.components.transform.levelId);
    expect(pair.first.components.transform.position).toEqual(pair.second.components.transform.position);
  });

  test('teleport tiles may live under ordinary objects instead of reserving the whole cell', () => {
    const store = new GameStore(testWorld([furni('chair', 'chair', 1, 1)], 4, 2));
    expect(createTeleporterPair(store, addr(1, 1), addr(3, 1))).toBeTrue();
  });

  test('switching storeys while choosing endpoint B preserves endpoint A', () => {
    const anchor = addr(1, 1);
    let state = editor('teleport-pair');
    state = reduceEditor(state, { type: 'pending-anchor/set', cell: anchor });
    state = reduceEditor(state, { type: 'active-level/set', levelId: 'upper' });
    expect(state.pendingAnchor).toEqual(anchor);
  });

  test('click-style teleporter motion walks to A then changes storey at B', () => {
    const store = new GameStore(testWorld([], 4, 2, { x: 0, z: 1 }));
    const upper = addStorey(store)!;
    commitFloorShape(store, 'add', [addr(3, 1, upper.id)]);
    createTeleporterPair(store, addr(1, 1), addr(3, 1, upper.id));
    const source = teleporterPairs(store.state)[0]!.first;
    const motion = new ActorMotionSystem(store, TEST_ACTOR_ID, OWNER_PROVIDER);
    expect(motion.useTeleporter(source.id, store.state)).toBeTrue();
    for (let i = 0; i < 40 && motion.cell.levelId !== upper.id; i += 1) motion.update(0.1);
    expect(motion.cell).toEqual(addr(3, 1, upper.id));
  });

  test('managed pair removal removes both endpoints atomically', () => {
    const store = new GameStore(testWorld([], 4, 2));
    createTeleporterPair(store, addr(1, 1), addr(3, 1));
    const first = teleporterPairs(store.state)[0]!.first;
    expect(removeTeleporterPair(store, first.id)).toBeTrue();
    expect(teleporterPairs(store.state)).toEqual([]);
  });

  test('authoritative validation rejects broken reciprocal links', () => {
    const store = new GameStore(testWorld([], 4, 2));
    createTeleporterPair(store, addr(1, 1), addr(3, 1));
    const pair = teleporterPairs(store.state)[0]!;
    const entities: WorldEntity[] = store.state.entities.map((entity) => entity.id === pair.second.id
      ? { ...entity, components: { ...entity.components, teleporter: {} } } : entity);
    const result = store.replaceFromServer({ ...store.state, revision: store.state.revision + 1, entities });
    expect(result.accepted).toBeFalse();
    expect(result.reason).toContain('reciprocal');
  });
});
