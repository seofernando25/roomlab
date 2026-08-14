import type { GameStore } from '../domain/game-store';
import { DEFAULT_PLACEMENT_Y_STEP, MAX_PLACEMENT_Y, MIN_PLACEMENT_Y, normalizeY, roomCellAt, sortedSurfaceYs, suggestedNewCell, wallAt } from '../domain/room-topology';
import type { CellAddress, RoomCellUpdate, WallSegment, WorldAction, WorldState } from '../domain/types';
import { isValidEntityPlacement } from '../domain/world-placement';
import { createFurniEntity, reduceWorld, resolveSupportedPlacement } from '../domain/world-state';
import { createTeleporterPair } from './teleporter-editor';
export interface BuildOperationResult{readonly accepted:boolean;readonly message?:string;}
export type ShapeIntent='add'|'remove';
export function floorShapeIntent(state:WorldState,address:CellAddress):ShapeIntent|null{return roomCellAt(state.topology,address)?'remove':suggestedNewCell(state.topology,address,'wood')?'add':null;}
export function commitFloorShape(store:GameStore,intent:ShapeIntent,addresses:readonly CellAddress[]):BuildOperationResult{
  if(!addresses.length)return{accepted:true};const unique=uniqueAddresses(addresses),actions:WorldAction[]=[];let preview=store.state;
  if(intent==='remove'){for(const address of unique){if(!roomCellAt(preview.topology,address))continue;const action:WorldAction={type:'topology/cells-remove',addresses:[address]};const next=reduceWorld(preview,action);if(next===preview)return{accepted:false,message:'That floor tile is supporting an object or actor and cannot be removed.'};actions.push(action);preview=next;}}
  else{const pending=new Map(unique.filter(a=>!roomCellAt(preview.topology,a)).map(a=>[key(a),a]));let progressed=true;while(pending.size&&progressed){progressed=false;for(const[k,address]of[...pending]){const cell=suggestedNewCell(preview.topology,address,store.editorState.floorFinish);if(!cell)continue;const action:WorldAction={type:'topology/cells-add',cells:[cell]};const next=reduceWorld(preview,action);if(next===preview)continue;actions.push(action);preview=next;pending.delete(k);progressed=true;}}}
  if(!actions.length)return{accepted:false,message:'Those slab positions are already occupied.'};return store.dispatchBatch(actions).accepted?{accepted:true}:{accepted:false,message:'That floor shape edit is not valid.'};
}
export function commitFloorPropertyBrush(store:GameStore,tool:'floor-paint'|'floor-raise'|'floor-lower',addresses:readonly CellAddress[]):BuildOperationResult{const updates:RoomCellUpdate[]=[];for(const address of uniqueAddresses(addresses)){const cell=roomCellAt(store.state.topology,address);if(!cell)continue;updates.push(tool==='floor-paint'?{address,floorFinish:store.editorState.floorFinish}:{address,y:normalizeY(cell.y+(tool==='floor-raise'?0.25:-0.25))});}if(!updates.length)return{accepted:false};return store.dispatch({type:'topology/cells-update',updates}).accepted?{accepted:true}:{accepted:false,message:'That floor edit would collide with another surface or supported object.'};}
export function wallShapeIntent(state:{topology:Parameters<typeof wallAt>[0]},edge:Pick<WallSegment,'axis'|'x'|'z'|'y'>):ShapeIntent{return wallAt(state.topology,edge.y,edge.axis,edge.x,edge.z)?'remove':'add';}
export function commitWallShape(store:GameStore,intent:ShapeIntent,edges:readonly Pick<WallSegment,'axis'|'x'|'z'|'y'>[]):BuildOperationResult{const actions:WorldAction[]=[];for(const edge of uniqueEdges(edges)){const existing=wallAt(store.state.topology,edge.y,edge.axis,edge.x,edge.z);if(intent==='remove'){if(existing)actions.push({type:'topology/wall-remove',edge});}else if(!existing)actions.push({type:'topology/wall-set',wall:{...edge,finish:store.editorState.wallFinish}});}if(!actions.length)return{accepted:false};return store.dispatchBatch(actions).accepted?{accepted:true}:{accepted:false,message:'That wall line crosses unsupported floor or furniture.'};}
export function commitWallPaint(store:GameStore,edges:readonly Pick<WallSegment,'axis'|'x'|'z'|'y'>[]):BuildOperationResult{const actions:WorldAction[]=[];for(const edge of uniqueEdges(edges)){const existing=wallAt(store.state.topology,edge.y,edge.axis,edge.x,edge.z);if(existing&&existing.finish!==store.editorState.wallFinish)actions.push({type:'topology/wall-set',wall:{...edge,finish:store.editorState.wallFinish}});}if(!actions.length)return{accepted:false};return store.dispatchBatch(actions).accepted?{accepted:true}:{accepted:false,message:'That wall finish could not be applied.'};}
export function placePrototypeAt(store:GameStore,address:CellAddress):BuildOperationResult{const id=crypto.randomUUID(),probe=createFurniEntity(store.editorState.placementPrototypeId??'',address.position,store.editorState.placementRotation,id,address.y,store.editorState.placementAppearance??undefined),entity=resolveSupportedPlacement(store.state,probe);if(!entity)return{accepted:false,message:'That object does not fit there.'};return store.dispatch({type:'entity/add',entity}).accepted?{accepted:true}:{accepted:false,message:'That object does not fit there.'};}
export function stepTeleportPair(store:GameStore,address:CellAddress):BuildOperationResult{
  const probe=createFurniEntity('tile.teleporter',address.position,0,'teleport-placement-probe',address.y);
  if(!isValidEntityPlacement(store.state,probe))return{accepted:false,message:'Teleport tiles need a clear floor slab.'};
  const anchor=store.editorState.pendingAnchor;
  if(!anchor){store.dispatchEditor({type:'pending-anchor/set',cell:address});return{accepted:true};}
  if(same(anchor,address)){store.dispatchEditor({type:'pending-anchor/set',cell:null});return{accepted:true};}
  if(!createTeleporterPair(store,anchor,address))return{accepted:false,message:'Could not create that teleport pair.'};
  store.dispatchEditor({type:'pending-anchor/set',cell:null});
  return{accepted:true};
}
export function chooseNewPlacementY(store:GameStore):number|null{const highest=Math.max(store.editorState.placementY,...sortedSurfaceYs(store.state.topology),0),next=Math.min(MAX_PLACEMENT_Y,highest+DEFAULT_PLACEMENT_Y_STEP);if(next===store.editorState.placementY)return null;store.dispatchEditor({type:'placement-y/set',y:next});return next;}
export function setPlacementY(store:GameStore,y:number):BuildOperationResult{if(!Number.isFinite(y))return{accepted:false,message:'Choose a valid placement Y.'};if(y<MIN_PLACEMENT_Y||y>MAX_PLACEMENT_Y)return{accepted:false,message:`Placement Y must stay between ${MIN_PLACEMENT_Y} and ${MAX_PLACEMENT_Y}.`};store.dispatchEditor({type:'placement-y/set',y:normalizeY(y)});return{accepted:true};}
export function nudgePlacementY(store:GameStore,delta:number):BuildOperationResult{return setPlacementY(store,store.editorState.placementY+delta);}
function uniqueAddresses(addresses:readonly CellAddress[]):CellAddress[]{return[...new Map(addresses.map(a=>[key(a),a])).values()];}
function uniqueEdges<T extends Pick<WallSegment,'axis'|'x'|'z'|'y'>>(edges:readonly T[]):T[]{return[...new Map(edges.map(e=>[`${e.y}:${e.axis}:${e.x}:${e.z}`,e])).values()];}
function key(a:CellAddress):string{return`${a.y}:${a.position.x},${a.position.z}`;}
function same(a:CellAddress,b:CellAddress):boolean{return key(a)===key(b);}
