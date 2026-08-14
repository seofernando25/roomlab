import { LOCAL_PLAYER_ID, LOCAL_PLAYER_PROTOTYPE_ID, entityById } from './entity-queries';
import type { AppearanceComponent } from './material-design';
import { getEntityPrototype } from './prototype-registry';
import { applyTopologyAction, createRectangularTopology } from './room-topology';
import { isValidEntityPlacement } from './world-placement';
import type { ComponentSetAction, DispatchResult, EntityComponents, EntityId, GridPoint, RotationQuarter, TopologyAction, WorldAction, WorldEntity, WorldState } from './types';
export { centeredCellForPoint, findOpenCell, findOpenCellForObject, isValidEntityPlacement, resolveSupportedPlacement } from './world-placement';
export function createInitialWorld():WorldState{return{id:'room-demo-001',revision:0,topology:createRectangularTopology(10,8),entities:[
  furni('bookcase',0,0,2),furni('plant',0,2,0),furni('kitchen',7,0,0),furni('stool',7,2,0),furni('stool',8,2,0),furni('table',2,4,0),furni('chair',1,4,1),furni('chair',4,4,3),furni('sofa',2,6,0),furni('lamp',1,6,0),furni('plant',5,6,0),
  {id:LOCAL_PLAYER_ID,prototypeId:LOCAL_PLAYER_PROTOTYPE_ID,components:{transform:{position:{x:5,z:4},rotation:0,y:0},actor:{pose:'stand',direction:3}}},
]};}
export function createFurniEntity(prototypeId:string,position:GridPoint,rotation:RotationQuarter=0,id:EntityId=crypto.randomUUID(),y=0,appearance?:AppearanceComponent):WorldEntity{return furni(prototypeId,position.x,position.z,rotation,id,y,appearance);}
function furni(prototypeId:string,x:number,z:number,rotation:RotationQuarter,id:EntityId=crypto.randomUUID(),y=0,appearance?:AppearanceComponent):WorldEntity{if(getEntityPrototype(prototypeId).kind!=='furni')throw new Error(`${prototypeId} is not a placeable object prototype.`);return{id,prototypeId,components:{transform:{position:{x,z},rotation,y},...(appearance&&Object.keys(appearance.materials).length?{appearance}:{})}};}
export function nextRotation(rotation:RotationQuarter):RotationQuarter{return((rotation+1)%4)as RotationQuarter;}
export function reduceWorld(state:WorldState,action:WorldAction):WorldState{
  if(isTopologyAction(action)){const topology=applyTopologyAction(state.topology,action);if(topology===state.topology)return state;const candidate={...state,topology};if(candidate.entities.some(e=>!isValidEntityPlacement(candidate,e)))return state;return{...candidate,revision:state.revision+1};}
  if(action.type==='entity/add'){if(entityById(state,action.entity.id)||!isValidEntityPlacement(state,action.entity))return state;return bump(state,[...state.entities,action.entity]);}
  if(action.type==='entity/remove'){if(state.entities.some(e=>e.components.actor?.seatedOn===action.id))return state;const entities=state.entities.filter(e=>e.id!==action.id);if(entities.length===state.entities.length)return state;const candidate={...state,entities};return allPlacementsValid(candidate)?bump(state,entities):state;}
  if(action.type==='entity-group/transform'){if(!action.transforms.length)return state;const patches=new Map(action.transforms.map(e=>[e.id,e.transform]));if(patches.size!==action.transforms.length||[...patches.keys()].some(id=>!entityById(state,id)))return state;const entities=state.entities.map(e=>{const transform=patches.get(e.id);return transform?{...e,components:{...e.components,transform}}:e;});const candidate={...state,entities};return allPlacementsValid(candidate)?bump(state,entities):state;}
  const existing=entityById(state,action.id);if(!existing)return state;
  if(action.type==='transform/move'||action.type==='transform/rotate'||action.type==='transform/set'){const transform=action.type==='transform/move'?{...existing.components.transform,position:action.address.position,y:action.address.y}:action.type==='transform/rotate'?{...existing.components.transform,rotation:action.rotation}:action.transform;const candidate={...existing,components:{...existing.components,transform}},entities=replaceEntity(state.entities,candidate),candidateState={...state,entities};if((action.validatePlacement??true)&&(!isValidEntityPlacement(state,candidate)||!allPlacementsValid(candidateState)))return state;return bump(state,entities);}
  if(action.type==='component/set'){const candidate={...existing,components:setRuntimeComponent(existing.components,action)};return bump(state,replaceEntity(state.entities,candidate));}
  return state;
}
export function dispatchResult(previous:WorldState,next:WorldState):DispatchResult{return next===previous?{accepted:false,reason:'No state change or invalid world operation.'}:{accepted:true};}
function replaceEntity(entities:readonly WorldEntity[],candidate:WorldEntity):readonly WorldEntity[]{return entities.map(e=>e.id===candidate.id?candidate:e);}
function bump(state:WorldState,entities:readonly WorldEntity[]):WorldState{return{...state,entities,revision:state.revision+1};}
function allPlacementsValid(state:WorldState):boolean{return state.entities.every(e=>isValidEntityPlacement(state,e));}
function isTopologyAction(action:WorldAction):action is TopologyAction{return action.type==='topology/cells-update'||action.type==='topology/cells-add'||action.type==='topology/cells-remove'||action.type==='topology/wall-set'||action.type==='topology/wall-remove';}
function setRuntimeComponent(components:EntityComponents,action:ComponentSetAction):EntityComponents{
  if(action.component==='actor'){if(action.value===null){const{actor:_removed,...rest}=components;return rest;}return{...components,actor:action.value};}
  if(action.component==='toggle'){if(action.value===null){const{toggle:_removed,...rest}=components;return rest;}return{...components,toggle:action.value};}
  if(action.component==='teleporter'){if(action.value===null){const{teleporter:_removed,...rest}=components;return rest;}return{...components,teleporter:action.value};}
  if(action.component==='visualEffects'){if(action.value===null){const{visualEffects:_removed,...rest}=components;return rest;}return{...components,visualEffects:action.value};}
  if(action.component==='appearance'){if(action.value===null){const{appearance:_removed,...rest}=components;return rest;}return{...components,appearance:action.value};}
  return assertNever(action);
}
function assertNever(value:never):never{throw new Error(`Unhandled runtime component action: ${JSON.stringify(value)}`);}
