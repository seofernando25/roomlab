import { describe, expect, test } from 'bun:test';
import { listCatalogueObjects } from '../src/domain/catalogue-registry';
import { materialAppearanceError } from '../src/domain/material-appearance-rules';
import {
  MAX_MATERIAL_LAYERS,
  parseAppearanceComponent,
  parseMaterialProgram,
  type AppearanceComponent,
  type MaterialStyle,
} from '../src/domain/material-design';
import { materialPreset } from '../src/domain/material-presets';
import { validateWorldState } from '../src/domain/world-validation';
import { createFurniEntity } from '../src/domain/world-state';
import { disposeRenderTree } from '../src/rendering/dispose-render-tree';
import { materialProgramTexture, releaseMaterialProgramTexture } from '../src/rendering/material-program-texture';
import { materialSlotsInVisual } from '../src/rendering/object-material-appearance';
import { createObjectVisual } from '../src/rendering/object-factory';
import { parseRoomClientMessage } from '../server/protocol';
import { testWorld } from './helpers';

const linen = materialPreset('fine-linen')!.style;
const chairAppearance: AppearanceComponent = { materials: { upholstery: linen } };

describe('safe programmable material recipes', () => {
  test('valid recipes round-trip while malformed and over-complex recipes are rejected', () => {
    expect(parseAppearanceComponent(chairAppearance)).toEqual(chairAppearance);
    expect(parseMaterialProgram({ ...linen.program, baseColor: 'red' })).toBeNull();
    expect(parseMaterialProgram({ ...linen.program, layers: Array.from({ length: MAX_MATERIAL_LAYERS + 1 }, () => linen.program.layers[0]) })).toBeNull();
    expect(parseAppearanceComponent({ materials: { 'INVALID SLOT': linen } })).toBeNull();
    expect(parseAppearanceComponent({ materials: { upholstery: { ...linen, repeatX: 999 } } })).toBeNull();
  });

  test('prototype material slots are authoritative', () => {
    expect(materialAppearanceError('chair', chairAppearance)).toBeNull();
    expect(materialAppearanceError('chair', { materials: { countertop: linen } })).toContain('not supported');
    const invalid = createFurniEntity('chair', { x: 1, z: 1 }, 0, 'styled', 0, { materials: { countertop: linen } });
    expect(validateWorldState(testWorld([invalid])).valid).toBeFalse();
  });

  test('seeded procedural output is deterministic and seed changes affect it', () => {
    const speckles: MaterialStyle = {
      program: { version: 1, resolution: 16, baseColor: '#c97d5d', layers: [{ kind: 'speckles', color: '#402020', opacity: 1, density: 0.3, size: 1, seed: 10 }] },
      repeatX: 1, repeatY: 1,
    };
    const first = materialProgramTexture(speckles, false);
    const second = materialProgramTexture(speckles, false);
    const changed = materialProgramTexture({ ...speckles, program: { ...speckles.program, layers: [{ kind: 'speckles', color: '#402020', opacity: 1, density: 0.3, size: 1, seed: 11 }] } }, false);
    expect(Array.from(first.image.data as Uint8Array)).toEqual(Array.from(second.image.data as Uint8Array));
    expect(Array.from(first.image.data as Uint8Array)).not.toEqual(Array.from(changed.image.data as Uint8Array));
    first.dispose(); second.dispose(); changed.dispose();
  });

  test('shared recipe textures are released after the final live reference', () => {
    const first = materialProgramTexture(linen, true);
    const second = materialProgramTexture(linen, true);
    let disposals = 0;
    first.addEventListener('dispose', () => { disposals += 1; });
    expect(second).toBe(first);
    releaseMaterialProgramTexture(first);
    expect(disposals).toBe(0);
    releaseMaterialProgramTexture(second);
    expect(disposals).toBe(1);
    const replacement = materialProgramTexture(linen, true);
    expect(replacement).not.toBe(first);
    releaseMaterialProgramTexture(replacement);
  });
});

describe('material slots and furniture rendering', () => {
  test('every declared slot is actually tagged by its visual factory', () => {
    for (const definition of listCatalogueObjects()) {
      const declared = [...(definition.renderable.materialSlots ?? []).map((slot) => slot.id)].sort();
      const visual = createObjectVisual(definition.id);
      expect(materialSlotsInVisual(visual)).toEqual(declared);
      disposeRenderTree(visual);
    }
  });

  test('appearance applies only to a tagged slot and keeps the recipe texture', () => {
    const visual = createObjectVisual('chair', chairAppearance, false);
    let styled = 0; let unstyledFrame = 0;
    visual.traverse((object: any) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object.userData.materialSlot === 'upholstery') {
        styled += 1;
        expect(materials.some((material: any) => material.map?.userData.materialRecipeTexture)).toBeTrue();
      }
      if (object.userData.materialSlot === 'frame') {
        unstyledFrame += 1;
        expect(materials.some((material: any) => material.map?.userData.materialRecipeTexture)).toBeFalse();
      }
    });
    expect(styled).toBeGreaterThan(0);
    expect(unstyledFrame).toBeGreaterThan(0);
    disposeRenderTree(visual);
  });
});

describe('material network boundary', () => {
  const base = { clientCommandId: 'material-test', clientSequence: 1 };
  test('valid placement and appearance commands parse while executable or invalid data cannot enter the protocol', () => {
    const transform = { y: 0, position: { x: 1, z: 1 }, rotation: 0 };
    expect(parseRoomClientMessage({ ...base, type: 'entity-place', itemInstanceId: 'item', prototypeId: 'chair', transform, appearance: chairAppearance })?.type).toBe('entity-place');
    expect(parseRoomClientMessage({ ...base, type: 'entity-appearance', entityId: 'chair', appearance: chairAppearance })?.type).toBe('entity-appearance');
    expect(parseRoomClientMessage({ ...base, type: 'entity-appearance', entityId: 'chair', appearance: null })?.type).toBe('entity-appearance');
    const ignoredExecutableField = parseRoomClientMessage({ ...base, type: 'entity-appearance', entityId: 'chair', appearance: { materials: { upholstery: { ...linen, program: { ...linen.program, javascript: 'alert(1)' } } } } });
    expect(ignoredExecutableField).not.toBeNull();
    expect(JSON.stringify(ignoredExecutableField)).not.toContain('javascript');
    expect(parseRoomClientMessage({ ...base, type: 'entity-appearance', entityId: 'chair', appearance: { materials: { upholstery: { ...linen, repeatY: -10 } } } })).toBeNull();
  });
});
