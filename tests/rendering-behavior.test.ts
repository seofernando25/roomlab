import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { AVATAR_MORPH_MODES, isAvatarMorphMode } from '../src/rendering/avatar-morph-material';
import { CATALOGUE_PREVIEW_OBJECT_YAW } from '../src/rendering/catalogue-thumbnail-renderer';
import { ObjectMotion, shortestAngleDelta } from '../src/rendering/object-motion';
import { authoredDirection, relativeHumanDirection, relativeHumanDirectionBlend, relativeSitDirectionBlend } from '../src/rendering/human-avatar';
import { CAMERA_TURN_MODES, IsometricCameraController, isCameraTurnMode, nextCameraSnapYaw } from '../src/rendering/isometric-camera';

describe('catalogue presentation', () => {
  test('object thumbnails rotate authored fronts 90 degrees toward the front-right', () => {
    expect(CATALOGUE_PREVIEW_OBJECT_YAW).toBe(-Math.PI / 2);
  });
});

describe('furniture visual motion', () => {
  test('visual rotation chooses the shortest equivalent quarter turn', () => {
    expect(shortestAngleDelta(-Math.PI * 1.5, 0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(shortestAngleDelta(0, -Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  test('held and rotating objects lift while placement remains smooth', () => {
    const motion = new ObjectMotion();
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.add(visual);
    motion.register('chair', root, visual, 1.5, 0, 2.5, 0);
    motion.setHeld('chair', true);
    motion.setPlacementTarget('chair', 3.5, 0, 4.5);
    motion.update(0.1);
    expect(visual.position.y).toBeGreaterThan(0);
    expect(root.position.x).toBeGreaterThan(1.5);

    motion.setHeld('chair', false);
    motion.setPose('chair', 3.5, 0, 4.5, -Math.PI / 2);
    motion.update(0.1);
    expect(visual.position.y).toBeGreaterThan(0);
    expect(root.rotation.y).toBeLessThan(0);
  });
});

describe('eight-direction human rendering', () => {
  test('maps mirrored-only directions onto the five authored standing views', () => {
    expect(authoredDirection(4)).toEqual({ source: 2, mirrored: true });
    expect(authoredDirection(5)).toEqual({ source: 1, mirrored: true });
    expect(authoredDirection(6)).toEqual({ source: 0, mirrored: true });
    expect(authoredDirection(7)).toEqual({ source: 7, mirrored: false });
  });

  test('camera quarter turns rotate the visible human direction without changing world facing', () => {
    expect(relativeHumanDirection(3, Math.PI / 4)).toBe(3);
    expect(relativeHumanDirection(3, Math.PI / 2)).toBe(2);
    expect(relativeHumanDirection(3, 0)).toBe(4);
  });

  test('morph modes stay stable and blend through directional sectors', () => {
    expect(AVATAR_MORPH_MODES).toEqual(['off', 'dither', 'grid-warp', 'pixel-transport']);
    expect(isAvatarMorphMode('grid-warp')).toBe(true);
    expect(isAvatarMorphMode('smeary-bilinear')).toBe(false);
    expect(relativeHumanDirectionBlend(3, Math.PI / 4)).toEqual({ from: 3, to: 4, progress: 0 });
    expect(relativeHumanDirectionBlend(3, Math.PI / 2)).toEqual({ from: 2, to: 3, progress: 0 });
    expect(relativeHumanDirectionBlend(3, 3 * Math.PI / 4)).toEqual({ from: 1, to: 2, progress: 0 });
  });

  test('near-cardinal yaw resolves to an endpoint instead of leaving a long fractional tail', () => {
    const almostEnd = relativeHumanDirectionBlend(3, 3 * Math.PI / 4 - 0.0001);
    expect(almostEnd.progress > 0.99 || almostEnd.progress < 0.01).toBe(true);
  });

  test('sitting pose blends continuously across a live 90-degree chair rotation', () => {
    expect(relativeSitDirectionBlend(0, Math.PI / 4)).toEqual({ from: 0, to: 2, progress: 0 });
    expect(relativeSitDirectionBlend(1, Math.PI / 4)).toEqual({ from: 0, to: 2, progress: 0.5 });
    expect(relativeSitDirectionBlend(2, Math.PI / 4)).toEqual({ from: 2, to: 4, progress: 0 });
  });
});

describe('camera turn modes', () => {
  test('exposes free, 45-degree snap, and 90-degree snap modes', () => {
    expect(CAMERA_TURN_MODES).toEqual(['free', 'snap-45', 'snap-90']);
    expect(isCameraTurnMode('free')).toBe(true);
    expect(isCameraTurnMode('snap-30')).toBe(false);
  });

  test('snap modes advance from the isometric diagonal anchor', () => {
    expect(nextCameraSnapYaw(Math.PI / 4, 1, 'snap-45')).toBeCloseTo(Math.PI / 2, 6);
    expect(nextCameraSnapYaw(Math.PI / 4, 1, 'snap-90')).toBeCloseTo(3 * Math.PI / 4, 6);
    expect(nextCameraSnapYaw(1.0, -1, 'snap-45')).toBeCloseTo(Math.PI / 4, 6);
  });

  test('free mode rotates continuously while held and eases to a stop on release', () => {
    const camera = new IsometricCameraController(10, 8);
    const initialYaw = camera.yaw;
    camera.setTurnMode('free');
    camera.beginTurn(1);
    camera.update(0.25);
    expect(camera.yaw).toBeGreaterThan(initialYaw);
    const movingYaw = camera.yaw;
    camera.endTurn(1);
    camera.update(0.25);
    expect(camera.yaw).toBeGreaterThanOrEqual(movingYaw);
  });
});
