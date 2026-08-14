import { DEFAULT_LEVEL_ID } from './room-topology';
import type { EditorAction, EditorState } from './types';

export function createInitialEditorState(): EditorState {
  return {
    selectedEntityId: null,
    tool: 'select',
    activeLevelId: DEFAULT_LEVEL_ID,
    floorFinish: 'wood',
    wallFinish: 'cream-brick',
    pendingAnchor: null,
    placementPrototypeId: null,
    placementRotation: 0,
    placementAppearance: null,
  };
}

export function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'selection/set') {
    return state.selectedEntityId === action.id ? state : { ...state, selectedEntityId: action.id };
  }
  if (action.type === 'tool/set') {
    if (state.tool === action.tool && state.pendingAnchor === null) return state;
    return {
      ...state,
      tool: action.tool,
      pendingAnchor: null,
      selectedEntityId: action.tool === 'select' ? state.selectedEntityId : null,
    };
  }
  if (action.type === 'active-level/set') {
    if (state.activeLevelId === action.levelId) return state;
    return {
      ...state,
      activeLevelId: action.levelId,
      selectedEntityId: null,
      pendingAnchor: state.tool === 'teleport-pair' ? state.pendingAnchor : null,
    };
  }
  if (action.type === 'floor-finish/set') {
    return state.floorFinish === action.finish ? state : { ...state, floorFinish: action.finish };
  }
  if (action.type === 'wall-finish/set') {
    return state.wallFinish === action.finish ? state : { ...state, wallFinish: action.finish };
  }
  if (action.type === 'placement-prototype/set') {
    return state.placementPrototypeId === action.prototypeId ? state : { ...state, placementPrototypeId: action.prototypeId, placementAppearance: null };
  }
  if (action.type === 'placement-rotation/set') {
    return state.placementRotation === action.rotation ? state : { ...state, placementRotation: action.rotation };
  }
  if (action.type === 'placement-appearance/set') {
    return state.placementAppearance === action.appearance ? state : { ...state, placementAppearance: action.appearance };
  }
  if (action.type === 'pending-anchor/set') {
    const same = state.pendingAnchor?.levelId === action.cell?.levelId
      && state.pendingAnchor?.position.x === action.cell?.position.x
      && state.pendingAnchor?.position.z === action.cell?.position.z;
    return same ? state : { ...state, pendingAnchor: action.cell };
  }
  return state;
}
