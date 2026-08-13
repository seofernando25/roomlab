import { describe, expect, test } from 'bun:test';
import { getCatalogueObject } from '../src/domain/catalogue-registry';
import { FLOOR_STEP_HEIGHT } from '../src/domain/room-topology';
import { isValidEntityPlacement, resolveSupportedPlacement } from '../src/domain/world-placement';
import { createFurniEntity, reduceWorld } from '../src/domain/world-state';
import { addr, testWorld } from './helpers';

describe('decor stacking on support surfaces', () => {
  test('sofas expose a support surface for small decor', () => {
    const surface = getCatalogueObject('sofa').capabilities.surface;
    expect(surface).toMatchObject({ status: 'implemented', acceptsFurni: true });
    expect(surface?.height).toBeGreaterThan(0.5);
  });

  test('a vase automatically resolves onto the sofa instead of colliding with it', () => {
    const sofa = createFurniEntity('sofa', { x: 1, z: 1 }, 0, 'sofa');
    const state = testWorld([sofa], 5, 4);
    const probe = createFurniEntity('vase', { x: 1, z: 1 }, 0, 'vase');
    const resolved = resolveSupportedPlacement(state, probe);
    expect(resolved).not.toBeNull();
    expect(resolved?.components.transform.elevation).toBeCloseTo(0.68 / FLOOR_STEP_HEIGHT, 6);
    expect(isValidEntityPlacement(state, resolved!)).toBeTrue();
  });

  test('removing the vase leaves the sofa independently movable again', () => {
    const sofa = createFurniEntity('sofa', { x: 1, z: 1 }, 0, 'sofa');
    let state = testWorld([sofa], 5, 4);
    const vase = resolveSupportedPlacement(state, createFurniEntity('vase', { x: 1, z: 1 }, 0, 'vase'))!;
    state = reduceWorld(state, { type: 'entity/add', entity: vase });

    const blocked = reduceWorld(state, { type: 'transform/move', id: 'sofa', address: addr(2, 1) });
    expect(blocked).toBe(state);

    const withoutVase = reduceWorld(state, { type: 'entity/remove', id: 'vase' });
    const moved = reduceWorld(withoutVase, { type: 'transform/move', id: 'sofa', address: addr(2, 1) });
    expect(moved.entities.find((entity) => entity.id === 'sofa')?.components.transform.position).toEqual({ x: 2, z: 1 });
  });
});
