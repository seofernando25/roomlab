import { describe, expect, test } from 'bun:test';
import {
  CATALOGUE_OBJECT_CATEGORIES,
  CATALOGUE_OBJECT_ORDER,
  CATALOGUE_OBJECTS,
  capabilitySummary,
  footprintFor,
  getCatalogueObject,
} from '../src/domain/catalogue-registry';
import { furniEntities, LOCAL_PLAYER_ID, localPlayerEntity } from '../src/domain/entity-queries';
import { GameStore } from '../src/domain/game-store';
import { ENTITY_PROTOTYPES } from '../src/domain/prototype-registry';
import { DEFAULT_LEVEL_ID, roomCellAt } from '../src/domain/room-topology';
import { SpatialIndex } from '../src/domain/spatial-index';
import type { WorldEntity } from '../src/domain/types';
import {
  centeredCellForPoint,
  createFurniEntity,
  createInitialWorld,
  findOpenCellForObject,
  isValidEntityPlacement,
  nextRotation,
  reduceWorld,
  resolveSupportedPlacement,
} from '../src/domain/world-state';
import { addr, furni, GROUND, testWorld } from './helpers';

if (!ENTITY_PROTOTYPES.has('test.rug')) {
  ENTITY_PROTOTYPES.register({
    id: 'test.rug', kind: 'furni', label: 'Test rug',
    spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: true, occupancyLayer: 'floor-overlay', conflictsWith: [] },
    collision: { mode: 'none' }, renderable: { renderer: 'none' },
  });
}

describe('world placement and occupancy', () => {
  test('shipped demo world is serializable and every placeable entity has valid floor support', () => {
    const state = createInitialWorld();
    expect(state.topology.levels).toHaveLength(1);
    expect(state.topology.levels[0]?.cells).toHaveLength(80);
    expect(localPlayerEntity(state).id).toBe(LOCAL_PLAYER_ID);
    for (const entity of furniEntities(state)) expect(isValidEntityPlacement(state, entity)).toBeTrue();
    expect(() => JSON.stringify(state)).not.toThrow();
  });

  test('rotating a 2x1 catalogue object swaps its occupied dimensions', () => {
    expect(footprintFor('table', 0)).toEqual({ width: 2, depth: 1 });
    expect(footprintFor('table', 1)).toEqual({ width: 1, depth: 2 });
  });

  test('ordinary objects conflict on the same floor height but identical X/Z on another floor height is independent', () => {
    const state = testWorld([furni('sofa', 'sofa', 1, 1)]);
    expect(isValidEntityPlacement(state, furni('chair', 'chair', 1, 1))).toBeFalse();
    const upper = reduceWorld(state, { type: 'topology/level-add', level: { id: 'upper', label: 'Upper', baseElevation: 10, cells: [{ position: { x: 1, z: 1 }, elevation: 0, floorFinish: 'wood' }], walls: [] } });
    expect(isValidEntityPlacement(upper, furni('upper-chair', 'chair', 1, 1, 0, 'upper'))).toBeTrue();
  });

  test('compatible occupancy layers can share the same floor height cell', () => {
    const rug = furni('rug', 'test.rug', 1, 1);
    const chair = furni('chair', 'chair', 1, 1);
    const state = testWorld([rug]);
    expect(isValidEntityPlacement(state, chair)).toBeTrue();
    const combined = { ...state, entities: [...state.entities, chair] };
    expect(SpatialIndex.fromWorld(combined).entityIdsAt(addr(1, 1))).toEqual(expect.arrayContaining(['rug', 'chair']));
  });

  test('objects automatically stack onto the highest implemented support surface', () => {
    const first = furni('step-1', 'stairs-block', 2, 1);
    const state = testWorld([first]);
    const second = resolveSupportedPlacement(state, furni('step-2', 'stairs-block', 2, 1));
    expect(second?.components.transform.elevation).toBe(2);
    const stackedState = { ...state, entities: [...state.entities, second!] };
    expect(isValidEntityPlacement(stackedState, second!)).toBeTrue();
    const third = resolveSupportedPlacement(stackedState, furni('step-3', 'stairs-block', 2, 1));
    expect(third?.components.transform.elevation).toBe(4);
  });

  test('ordinary catalogue objects can stack on implemented table surfaces', () => {
    const table = furni('table', 'table', 1, 1);
    const state = testWorld([table]);
    const lamp = resolveSupportedPlacement(state, furni('lamp', 'lamp', 1, 1));
    expect(lamp?.components.transform.elevation).toBe(3);
    expect(isValidEntityPlacement({ ...state, entities: [...state.entities, lamp!] }, lamp!)).toBeTrue();
  });

  test('support objects cannot be removed while another object depends on them', () => {
    const table = furni('table', 'table', 1, 1);
    const base = testWorld([table]);
    const lamp = resolveSupportedPlacement(base, furni('lamp', 'lamp', 1, 1))!;
    const state = { ...base, entities: [...base.entities, lamp] };
    expect(reduceWorld(state, { type: 'entity/remove', id: table.id })).toBe(state);
  });

  test('multi-cell placement requires every sparse floor cell and one elevation plane', () => {
    const state = testWorld([], 3, 2);
    const missing = reduceWorld(state, { type: 'topology/cells-remove', levelId: GROUND, positions: [{ x: 1, z: 0 }] });
    expect(isValidEntityPlacement(missing, furni('table', 'table', 0, 0))).toBeFalse();
    const raised = reduceWorld(state, { type: 'topology/cells-update', updates: [{ levelId: GROUND, position: { x: 1, z: 0 }, elevation: 1 }] });
    expect(isValidEntityPlacement(raised, furni('table', 'table', 0, 0))).toBeFalse();
  });

  test('accepted generic moves use a CellAddress and bump revision', () => {
    const state = testWorld([furni('chair', 'chair', 0, 0)]);
    const moved = reduceWorld(state, { type: 'transform/move', id: 'chair', address: addr(2, 1) });
    expect(moved.revision).toBe(1);
    expect(moved.entities.find((entity) => entity.id === 'chair')?.components.transform).toMatchObject({ levelId: GROUND, position: { x: 2, z: 1 } });
  });

  test('open-cell discovery is level-aware and sparse-floor aware', () => {
    const occupied = [furni('a', 'sofa', 0, 0), furni('b', 'sofa', 2, 0)];
    expect(findOpenCellForObject(testWorld(occupied), 'table', GROUND)).toEqual(addr(0, 1));
  });

  test('direct placement still centers footprints on the nearest cell', () => {
    expect(centeredCellForPoint({ x: 3.48, z: 2.52 }, { width: 1, depth: 1 })).toEqual({ x: 3, z: 2 });
    expect(centeredCellForPoint({ x: 4.08, z: 2.49 }, { width: 2, depth: 1 })).toEqual({ x: 3, z: 2 });
  });
});

describe('catalogue and prototype composition', () => {
  test('Catalogue order covers every visible object exactly once', () => {
    expect(new Set(CATALOGUE_OBJECT_ORDER).size).toBe(CATALOGUE_OBJECT_ORDER.length);
    expect([...CATALOGUE_OBJECT_ORDER].sort()).toEqual((Object.keys(CATALOGUE_OBJECTS) as (keyof typeof CATALOGUE_OBJECTS)[]).sort());
    expect(CATALOGUE_OBJECT_CATEGORIES.some((category) => category.id === 'architecture')).toBeTrue();
  });

  test('seating and traversal are capabilities, not separate entity classes', () => {
    expect(getCatalogueObject('chair').capabilities.sit?.status).toBe('implemented');
    expect(getCatalogueObject('stairs-glass').capabilities.traversal).toMatchObject({ status: 'implemented', mode: 'steps' });
    expect(getCatalogueObject('ramp-metal').capabilities.traversal).toMatchObject({ status: 'implemented', mode: 'ramp' });
    expect(capabilitySummary(getCatalogueObject('stairs-metal'))).toContainEqual({ key: 'traversal', label: 'Traversal', status: 'implemented' });
  });

  test('traversal-capable objects are still placeable on flat floor without a ledge', () => {
    expect(isValidEntityPlacement(testWorld(), furni('stairs', 'stairs-block', 1, 1))).toBeTrue();
    expect(isValidEntityPlacement(testWorld(), furni('ramp', 'ramp-metal', 2, 1))).toBeTrue();
  });
});

describe('authoritative world versus local editor state', () => {
  test('selection and active floor height remain local editor state', () => {
    const store = new GameStore();
    const revision = store.state.revision;
    const objectId = furniEntities(store.state)[0]!.id;
    store.dispatchEditor({ type: 'selection/set', id: objectId });
    store.dispatchEditor({ type: 'active-level/set', levelId: DEFAULT_LEVEL_ID });
    expect(store.editorState.selectedEntityId).toBe(objectId);
    expect(store.state.revision).toBe(revision);
    expect('selectedId' in (store.state as object)).toBeFalse();
  });

  test('world batches are atomic across entity and topology operations', () => {
    const store = new GameStore(testWorld([furni('chair', 'chair', 0, 0), furni('blocker', 'chair', 1, 0)]));
    const before = store.state;
    expect(store.dispatchBatch([
      { type: 'transform/move', id: 'chair', address: addr(2, 0) },
      { type: 'transform/move', id: 'chair', address: addr(1, 0) },
    ]).accepted).toBeFalse();
    expect(store.state).toBe(before);
    expect(store.dispatchBatch([
      { type: 'transform/move', id: 'chair', address: addr(2, 0) },
      { type: 'component/set', id: 'chair', component: 'toggle', value: { state: 1 } },
    ]).accepted).toBeTrue();
  });

  test('malformed server snapshots with unknown prototypes or floor layers are rejected', () => {
    const store = new GameStore();
    const before = store.state;
    const badEntity: WorldEntity = {
      id: 'bad', prototypeId: 'prototype.missing',
      components: { transform: { levelId: 'missing-level', position: { x: 0, z: 0 }, rotation: 0 } },
    };
    const result = store.replaceFromServer({ ...before, revision: before.revision + 1, entities: [...before.entities, badEntity] });
    expect(result.accepted).toBeFalse();
    expect(store.state).toBe(before);
  });

  test('quarter-turn helper remains deterministic', () => {
    expect(nextRotation(0)).toBe(1);
    expect(nextRotation(3)).toBe(0);
  });

  test('sparse floor lookup distinguishes missing floor from another floor height at same X/Z', () => {
    const state = reduceWorld(testWorld(), { type: 'topology/level-add', level: { id: 'upper', label: 'Upper', baseElevation: 10, cells: [{ position: { x: 0, z: 0 }, elevation: 0, floorFinish: 'wood' }], walls: [] } });
    expect(roomCellAt(state.topology, addr(0, 0))).toBeDefined();
    expect(roomCellAt(state.topology, addr(0, 0, 'upper'))).toBeDefined();
    expect(roomCellAt(state.topology, addr(1, 0, 'upper'))).toBeUndefined();
  });
});
