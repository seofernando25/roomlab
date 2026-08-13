import type { PrototypeCapabilityKey } from '../domain/prototype-components';
import type { EditorState } from '../domain/types';
import type { CameraTurnMode } from '../rendering/isometric-camera';
import type { RoomInteractionMode } from '../rendering/room-scene';

export function roomHelpText(mode: RoomInteractionMode, turnMode: CameraTurnMode, editor: EditorState, hasSelection: boolean): string {
  if (mode === 'play') {
    const cameraHelp = turnMode === 'free' ? 'Hold Q / E for free camera · ' : 'Q / E rotate camera · ';
    return `Click floor to walk · Click seats to sit · ${cameraHelp}drag empty room to pan · wheel to zoom`;
  }
  if (editor.tool === 'place-prototype') return 'Click floor to place · R rotates the next object · Esc stops placing · drag empty room to pan';
  if (editor.tool === 'floor-shape') return 'Floor Shape: drag from floor to remove, or from a ghost tile to add · Esc returns to Select';
  if (editor.tool === 'floor-paint') return 'Drag across floor to paint · Esc returns to Select';
  if (editor.tool === 'floor-raise' || editor.tool === 'floor-lower') return 'Drag across floor to sculpt height · Esc returns to Select';
  if (editor.tool === 'wall-shape') return 'Wall Shape: drag from an edge to draw or remove walls · Esc returns to Select';
  if (editor.tool === 'wall-paint') return 'Drag across existing walls to change their finish · Esc returns to Select';
  if (editor.tool === 'teleport-pair') return editor.pendingAnchor ? 'Entrance A chosen · switch storey if needed, then choose B · Esc cancels' : 'Choose entrance A, then exit B · Esc cancels';
  return hasSelection ? 'Drag selected object · R rotates · Delete picks up · Esc deselects · drag empty room to pan' : 'Click an object to select it · drag empty room to pan · wheel to zoom · Catalogue contains building tools';
}

export function capabilityUiLabel(key: PrototypeCapabilityKey, fallback: string): string {
  if (key === 'sit') return 'Can sit';
  if (key === 'surface') return 'Supports objects';
  if (key === 'traversal') return 'Walkable piece';
  if (key === 'teleport') return 'Teleporter';
  if (key === 'toggle') return 'Has states';
  if (key === 'gate') return 'Gate';
  return fallback;
}
