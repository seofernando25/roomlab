import { describe, expect, test } from 'bun:test';
import { GameStore } from '../src/domain/game-store';
import { requirementsMet, staticInteractionAccessProvider } from '../src/domain/interaction-types';
import { ENTITY_PROTOTYPES } from '../src/domain/prototype-registry';
import type { WorldEntity } from '../src/domain/types';
import { reduceWorld } from '../src/domain/world-state';
import { ActorMotionSystem } from '../src/gameplay/actor-motion-system';
import { updateAutomaticGates } from '../src/gameplay/automatic-gate-system';
import { InteractionDispatcher } from '../src/gameplay/interaction-dispatcher';
import { defaultInteraction, resolveInteractions } from '../src/gameplay/interaction-system';
import { directionForStep, findActorPath } from '../src/gameplay/navigation-system';
import { seatPoseForVisualTransform, seatTargetFor } from '../src/gameplay/seating-system';
import { SimulationPipeline } from '../src/gameplay/simulation-pipeline';
import { resolveTargetAction } from '../src/gameplay/targeting-system';
import { teleportActor, teleportDestination } from '../src/gameplay/teleport-system';
import { toggleEntity } from '../src/gameplay/toggle-system';
import { canTraverseCell, collisionBlocksActor } from '../src/gameplay/traversal-system';
import { addr, actor, furni, GROUND, TEST_ACTOR_ID, testWorld } from './helpers';

const OWNER_ACCESS = { actorId: TEST_ACTOR_ID, roomRight: 'owner' as const, inventoryPrototypeIds: new Set<string>() };
const OWNER_PROVIDER = staticInteractionAccessProvider('owner');

registerTestPrototype('test.auto-gate', {
  collision: { mode: 'gate' },
  capabilities: {
    toggle: { status: 'implemented', states: 2, initialState: 0, requirements: [{ type: 'room-right', level: 'rights' }] },
    gate: { status: 'implemented', passableState: 1, autoOpen: true, requirements: [{ type: 'room-right', level: 'rights' }] },
  },
});
registerTestPrototype('test.teleporter', { collision: { mode: 'none' }, capabilities: { teleport: { status: 'implemented', paired: true } } });
registerTestPrototype('test.arcade', {
  collision: { mode: 'solid' },
  capabilities: { use: { status: 'implemented', actionId: 'arcade.play', actionLabel: 'Play', requirements: [{ type: 'room-right', level: 'rights' }] } },
});
registerTestPrototype('test.walkthrough', { collision: { mode: 'none' }, capabilities: {} });

describe('actor navigation and traversal', () => {
  test('maps eight planar movement vectors onto the Habbo direction convention', () => {
    const center = { x: 2, z: 2 };
    expect(directionForStep(center, { x: 2, z: 1 })).toBe(0);
    expect(directionForStep(center, { x: 3, z: 1 })).toBe(1);
    expect(directionForStep(center, { x: 3, z: 2 })).toBe(2);
    expect(directionForStep(center, { x: 3, z: 3 })).toBe(3);
    expect(directionForStep(center, { x: 2, z: 3 })).toBe(4);
    expect(directionForStep(center, { x: 1, z: 3 })).toBe(5);
    expect(directionForStep(center, { x: 1, z: 2 })).toBe(6);
    expect(directionForStep(center, { x: 1, z: 1 })).toBe(7);
  });

  test('pathfinding avoids solid objects on the same floor height', () => {
    const state = testWorld([furni('table', 'table', 1, 1)], 4, 3, { x: 0, z: 1 });
    const path = findActorPath(state, TEST_ACTOR_ID, addr(0, 1), addr(3, 1));
    expect(path).not.toBeNull();
    expect(path?.some((cell) => cell.levelId === GROUND && cell.position.z === 1 && (cell.position.x === 1 || cell.position.x === 2))).toBeFalse();
  });

  test('runtime gate state determines collision, not prototype identity', () => {
    const gate = { status: 'implemented' as const, passableState: 1 };
    expect(collisionBlocksActor({ mode: 'gate' }, gate, 0)).toBeTrue();
    expect(collisionBlocksActor({ mode: 'gate' }, gate, 1)).toBeFalse();
    expect(collisionBlocksActor({ mode: 'none' }, undefined, undefined)).toBeFalse();
  });

  test('stateful gate interaction changes traversal immediately', () => {
    const gate = furni('gate', 'test.auto-gate', 1, 1);
    const store = new GameStore(testWorld([gate], 4, 3, { x: 0, z: 1 }));
    expect(canTraverseCell({ actorId: TEST_ACTOR_ID, state: store.state }, addr(1, 1))).toBeFalse();
    expect(defaultInteraction({ state: store.state, actorId: TEST_ACTOR_ID, targetId: gate.id, access: OWNER_ACCESS })?.kind).toBe('toggle');
    expect(toggleEntity(store, gate.id)).toBeTrue();
    expect(canTraverseCell({ actorId: TEST_ACTOR_ID, state: store.state }, addr(1, 1))).toBeTrue();
  });

  test('automatic gates only react to actors on the same floor height', () => {
    const gate = furni('gate', 'test.auto-gate', 1, 1);
    const store = new GameStore(testWorld([gate], 6, 4, { x: 0, z: 1 }));
    expect(updateAutomaticGates(store, OWNER_PROVIDER)).toBe(1);
    store.dispatch({ type: 'transform/move', id: TEST_ACTOR_ID, address: addr(5, 3), validatePlacement: false });
    expect(updateAutomaticGates(store, OWNER_PROVIDER)).toBe(1);
    expect(store.state.entities.find((entity) => entity.id === gate.id)?.components.toggle?.state).toBe(0);
  });

  test('permission-aware pathfinding plans through auto gates only for allowed actors', () => {
    const state = testWorld([furni('gate', 'test.auto-gate', 1, 0)], 3, 1, { x: 0, z: 0 });
    const guest = staticInteractionAccessProvider('guest')(TEST_ACTOR_ID, state);
    const rights = staticInteractionAccessProvider('rights')(TEST_ACTOR_ID, state);
    expect(findActorPath(state, TEST_ACTOR_ID, addr(0, 0), addr(2, 0), false, guest)).toBeNull();
    expect(findActorPath(state, TEST_ACTOR_ID, addr(0, 0), addr(2, 0), false, rights)).not.toBeNull();
  });

  test('NPCs use the same level-aware actor motion system', () => {
    const npc: WorldEntity = { ...actor('npc:1', { x: 0, z: 2 }), prototypeId: 'npc.generic' };
    const store = new GameStore(testWorld([npc], 5, 4));
    const motion = new ActorMotionSystem(store, npc.id, OWNER_PROVIDER);
    expect(motion.moveTo(addr(4, 2), store.state)).toBeTrue();
    for (let i = 0; i < 30 && motion.cell.position.x !== 4; i += 1) motion.update(0.1);
    expect(motion.cell).toEqual(addr(4, 2));
    expect(motion.pose).toBe('stand');
  });
});

describe('seating system', () => {
  test('seat metadata rotates facing and retains the object floor height', () => {
    const chair = furni('chair', 'chair', 1, 1, 0);
    const eastChair = furni('chair-east', 'chair', 1, 1, 1, 'upper');
    expect(seatTargetFor(chair)?.direction).toBe(0);
    expect(seatTargetFor(eastChair)?.direction).toBe(2);
    expect(seatTargetFor(eastChair)?.cell.levelId).toBe('upper');
  });

  test('seat attachment follows live object transform, pickup lift and floor-layer identity', () => {
    const seat = seatTargetFor(furni('chair', 'chair', 1, 1, 0, 'upper'))!;
    const moved = seatPoseForVisualTransform(seat, 3.5, 2.8, 4.5, -Math.PI / 2, 0.28);
    expect(moved.x).toBeCloseTo(3.52, 2);
    expect(moved.height).toBeCloseTo(3.58, 2);
    expect(moved.direction).toBeCloseTo(2, 6);
    expect(moved.cell.levelId).toBe('upper');
  });

  test('restored seated actors follow a moved seat without relying on a private cached seat target', () => {
    const chair = furni('chair', 'chair', 1, 1);
    const world = testWorld([chair], 4, 3, { x: 1, z: 1 });
    const restored = {
      ...world,
      entities: world.entities.map((entity) => entity.id === TEST_ACTOR_ID
        ? { ...entity, components: { ...entity.components, actor: { pose: 'sit' as const, direction: 0, seatedOn: chair.id, seatIndex: 0 } } }
        : entity),
    };
    const store = new GameStore(restored);
    const motion = new ActorMotionSystem(store, TEST_ACTOR_ID, OWNER_PROVIDER);
    motion.followSeatedVisual({ x: 2.5, z: 1.48, height: 0.5, direction: 0, cell: addr(2, 1) });
    expect(motion.cell).toEqual(addr(2, 1));
    expect(store.state.entities.find((entity) => entity.id === TEST_ACTOR_ID)?.components.transform.position).toEqual({ x: 2, z: 1 });
  });

  test('sofa exposes two independently targetable seat cells', () => {
    const sofa = furni('sofa', 'sofa', 1, 1);
    expect(seatTargetFor(sofa, { x: 1.2, z: 1.5 })?.cell).toEqual(addr(1, 1));
    expect(seatTargetFor(sofa, { x: 2.8, z: 1.5 })?.cell).toEqual(addr(2, 1));
  });
});

describe('interaction resolution', () => {
  test('chair click resolves to sit without pointer-layer prototype branches', () => {
    const chair = furni('chair', 'chair', 1, 1);
    const intent = defaultInteraction({ state: testWorld([chair]), actorId: TEST_ACTOR_ID, targetId: chair.id, point: { x: 1.5, z: 1.5 }, access: OWNER_ACCESS });
    expect(intent?.kind).toBe('sit');
  });

  test('planned prototype capabilities stay descriptive, not executable', () => {
    const lamp = furni('lamp', 'lamp', 1, 1);
    expect(resolveInteractions({ state: testWorld([lamp]), actorId: TEST_ACTOR_ID, targetId: lamp.id, access: OWNER_ACCESS })).toEqual([]);
  });

  test('requirements independently enforce room rights and inventory items', () => {
    expect(requirementsMet([{ type: 'room-right', level: 'rights' }], { actorId: TEST_ACTOR_ID, roomRight: 'guest', inventoryPrototypeIds: new Set() })).toBeFalse();
    expect(requirementsMet([{ type: 'inventory-item', prototypeId: 'gold-key' }], { actorId: TEST_ACTOR_ID, roomRight: 'owner', inventoryPrototypeIds: new Set(['gold-key']) })).toBeTrue();
  });

  test('custom use actions dispatch by stable action id', () => {
    const arcade = furni('arcade', 'test.arcade', 1, 1);
    const state = testWorld([arcade]);
    const intent = defaultInteraction({ state, actorId: TEST_ACTOR_ID, targetId: arcade.id, access: { actorId: TEST_ACTOR_ID, roomRight: 'rights', inventoryPrototypeIds: new Set() } });
    expect(intent?.kind).toBe('use');
    const dispatcher = new InteractionDispatcher();
    let played = false;
    dispatcher.registerUse('arcade.play', () => { played = true; return true; });
    expect(dispatcher.execute(intent)).toBeTrue();
    expect(played).toBeTrue();
  });

  test('targeting falls through non-interactive walk-through objects but blocks solid objects', () => {
    const walkthrough = furni('ghost', 'test.walkthrough', 1, 1);
    expect(resolveTargetAction({ state: testWorld([walkthrough], 4, 3, { x: 0, z: 1 }), actorId: TEST_ACTOR_ID, targetId: walkthrough.id, cell: addr(1, 1), access: OWNER_ACCESS }))
      .toEqual({ type: 'walk', cell: addr(1, 1) });
    const lamp = furni('lamp', 'lamp', 1, 1);
    expect(resolveTargetAction({ state: testWorld([lamp], 4, 3, { x: 0, z: 1 }), actorId: TEST_ACTOR_ID, targetId: lamp.id, cell: addr(1, 1), access: OWNER_ACCESS }))
      .toEqual({ type: 'blocked', cell: addr(1, 1) });
  });

  test('teleport destination includes floor height and headless teleport can cross floor heights', () => {
    let state = reduceWorld(testWorld([], 4, 3, { x: 0, z: 1 }), {
      type: 'topology/level-add',
      level: { id: 'upper', label: 'Upper', baseElevation: 10, cells: [{ position: { x: 2, z: 1 }, elevation: 0, floorFinish: 'wood' }], walls: [] },
    });
    const sourceBase = furni('teleport:a', 'test.teleporter', 1, 1);
    const destBase = furni('teleport:b', 'test.teleporter', 2, 1, 0, 'upper');
    const source = { ...sourceBase, components: { ...sourceBase.components, teleporter: { targetEntityId: destBase.id } } };
    const destination = { ...destBase, components: { ...destBase.components, teleporter: { targetEntityId: source.id } } };
    state = { ...state, entities: [...state.entities, source, destination] };
    const store = new GameStore(state);
    expect(teleportDestination(store.state, source.id)).toEqual(addr(2, 1, 'upper'));
    expect(teleportActor(store, TEST_ACTOR_ID, source.id)).toBeTrue();
    expect(store.state.entities.find((entity) => entity.id === TEST_ACTOR_ID)?.components.transform.levelId).toBe('upper');
  });

  test('interaction handlers and simulation systems register independently', () => {
    const dispatcher = new InteractionDispatcher();
    let executed = '';
    dispatcher.register('sit', (intent) => { executed = intent.kind; return true; });
    const chair = furni('chair', 'chair', 1, 1);
    expect(dispatcher.execute(defaultInteraction({ state: testWorld([chair]), actorId: TEST_ACTOR_ID, targetId: chair.id, access: OWNER_ACCESS }))).toBeTrue();
    expect(executed).toBe('sit');

    const pipeline = new SimulationPipeline(new GameStore(testWorld()));
    let ticks = 0;
    pipeline.register({ id: 'test-system', update: () => { ticks += 1; } });
    expect(() => pipeline.register({ id: 'test-system', update: () => {} })).toThrow();
    pipeline.update(0.016);
    expect(ticks).toBe(1);
  });
});

function registerTestPrototype(
  id: string,
  options: { collision: { mode: 'none' | 'solid' | 'gate' }; capabilities: Record<string, unknown> },
): void {
  if (ENTITY_PROTOTYPES.has(id)) return;
  ENTITY_PROTOTYPES.register({
    id, kind: 'furni', label: id,
    spatial: { footprint: { width: 1, depth: 1 }, rotatesWithEntity: true, occupancyLayer: 'furni', conflictsWith: ['furni'] },
    collision: options.collision,
    renderable: { renderer: 'none' },
    capabilities: options.capabilities,
  });
}
