import type { EditorAction, EditorState } from './types';

export function createInitialEditorState(): EditorState {
  return {
    selectedEntityId: null,
    tool: 'select',
    placementY: 0,
    floorFinish: 'wood',
    wallFinish: 'cream-brick',
    pendingAnchor: null,
    placementPrototypeId: null,
    placementRotation: 0,
    placementAppearance: null,
  };
}
export function reduceEditor(state:EditorState,action:EditorAction):EditorState{
  if(action.type==='selection/set')return state.selectedEntityId===action.id?state:{...state,selectedEntityId:action.id};
  if(action.type==='tool/set')return state.tool===action.tool&&state.pendingAnchor===null?state:{...state,tool:action.tool,pendingAnchor:null,selectedEntityId:action.tool==='select'?state.selectedEntityId:null};
  if(action.type==='placement-y/set')return state.placementY===action.y?state:{...state,placementY:action.y};
  if(action.type==='floor-finish/set')return state.floorFinish===action.finish?state:{...state,floorFinish:action.finish};
  if(action.type==='wall-finish/set')return state.wallFinish===action.finish?state:{...state,wallFinish:action.finish};
  if(action.type==='placement-prototype/set')return state.placementPrototypeId===action.prototypeId?state:{...state,placementPrototypeId:action.prototypeId,placementAppearance:null};
  if(action.type==='placement-rotation/set')return state.placementRotation===action.rotation?state:{...state,placementRotation:action.rotation};
  if(action.type==='placement-appearance/set')return state.placementAppearance===action.appearance?state:{...state,placementAppearance:action.appearance};
  if(action.type==='pending-anchor/set'){
    const same=state.pendingAnchor?.y===action.cell?.y&&state.pendingAnchor?.position.x===action.cell?.position.x&&state.pendingAnchor?.position.z===action.cell?.position.z;
    return same?state:{...state,pendingAnchor:action.cell};
  }
  return state;
}
