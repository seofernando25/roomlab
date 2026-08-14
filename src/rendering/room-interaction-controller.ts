import * as THREE from 'three';
import { isCatalogueObjectId } from '../domain/catalogue-registry';
import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import type { InteractionAccessProvider } from '../domain/interaction-types';
import { stackGroupIds, translatedStackTransforms } from '../domain/stack-support';
import { spatialProfileForEntity } from '../domain/spatial-index';
import type { CellAddress, EditorState, EntityId, TransformComponent, WorldEntity, WorldState } from '../domain/types';
import { centeredCellForPoint, resolveSupportedPlacement } from '../domain/world-placement';
import { reduceWorld } from '../domain/world-state';
import { ActorMotionSystem } from '../gameplay/actor-motion-system';
import { InteractionDispatcher } from '../gameplay/interaction-dispatcher';
import { resolveTargetAction } from '../gameplay/targeting-system';
import type { RoomGameNetwork } from '../online/game-network';
import { CameraPointerControls } from './camera-pointer-controls';
import { IsometricCameraController } from './isometric-camera';
import { ObjectMotion } from './object-motion';
import { RoomBuildController } from './room-build-controller';
import { RoomPicker } from './room-picking';
import { createSelectionMarker, disposeSelectionMarker as disposeMarker, updateSelectionMarker as positionSelectionMarker } from './selection-marker';
import { createTileHoverIndicator } from './tile-hover-indicator';

export type RoomInteractionMode='play'|'edit';
interface PlacementDrag {
  readonly id:EntityId;
  readonly groupIds:readonly EntityId[];
  readonly original:TransformComponent;
  resolved:TransformComponent;
  valid:boolean;
  changed:boolean;
  lastPoseKey:string;
}

export class RoomInteractionController {
  readonly #canvas:HTMLCanvasElement;
  readonly #scene:THREE.Scene;
  readonly #store:GameStore;
  readonly #motion:ObjectMotion;
  readonly #objects:ReadonlyMap<EntityId,THREE.Group>;
  readonly #player:ActorMotionSystem;
  readonly #accessProvider:InteractionAccessProvider;
  readonly #network:RoomGameNetwork|null;
  readonly #syncWorld:()=>void;
  readonly #notify:(message:string)=>void;
  readonly #controls:CameraPointerControls;
  readonly #interactions:InteractionDispatcher;
  readonly #picker:RoomPicker;
  readonly #build:RoomBuildController;
  readonly #tileHover=createTileHoverIndicator();
  #selectionMarker:THREE.Mesh|null=null;
  #placement:PlacementDrag|null=null;
  #mode:RoomInteractionMode='play';

  constructor(canvas:HTMLCanvasElement,scene:THREE.Scene,camera:IsometricCameraController,store:GameStore,motion:ObjectMotion,objects:ReadonlyMap<EntityId,THREE.Group>,architecture:THREE.Group,player:ActorMotionSystem,interactions:InteractionDispatcher,accessProvider:InteractionAccessProvider,network:RoomGameNetwork|null,syncWorld:()=>void,notify:(message:string)=>void){
    this.#canvas=canvas;this.#scene=scene;this.#store=store;this.#motion=motion;this.#objects=objects;this.#player=player;this.#interactions=interactions;this.#accessProvider=accessProvider;this.#network=network;this.#syncWorld=syncWorld;this.#notify=notify;
    this.#picker=new RoomPicker(canvas,camera,architecture);this.#build=new RoomBuildController(canvas,scene,store,this.#picker,notify);this.#build.setVisible(false);scene.add(this.#tileHover);
    this.#controls=new CameraPointerControls(canvas,camera,()=>true,(x,y)=>this.primaryActionAt(x,y),{begin:(x,y)=>this.beginPrimaryDrag(x,y),move:(x,y)=>this.movePrimaryDrag(x,y),end:(x,y)=>this.endPrimaryDrag(x,y),cancel:()=>this.cancelPrimaryDrag()});
    canvas.addEventListener('pointermove',this.onPointerHover);canvas.addEventListener('pointerleave',this.onPointerLeave);
  }

  get mode():RoomInteractionMode{return this.#mode;}
  setMode(mode:RoomInteractionMode):void{if(mode===this.#mode)return;this.#mode=mode;if(mode==='play')this.#build.setVisible(false);this.clearHover();this.cancelPrimaryDrag();if(mode==='play')this.#store.dispatchEditor({type:'selection/set',id:null});else this.#player.cancelMovement();}
  setBuildContextVisible(visible:boolean):void{this.#build.setVisible(this.#mode==='edit'&&visible);}

  syncSelection(state:WorldState,editor:EditorState):void{
    this.#build.sync();this.disposeSelectionMarker();if(editor.tool!=='select'||this.#mode!=='edit')return;
    const entity=editor.selectedEntityId?entityById(state,editor.selectedEntityId):undefined;if(!entity||!isCatalogueObjectId(entity.prototypeId))return;
    const fp=spatialProfileForEntity(entity)?.footprint;if(!fp)return;const marker=createSelectionMarker(fp.width*0.94,fp.depth*0.94);positionSelectionMarker(marker,state,addressFor(entity),fp.width,fp.depth,entity.components.transform.y,true);this.#selectionMarker=marker;this.#scene.add(marker);
  }
  dispose():void{this.#controls.dispose();this.#canvas.removeEventListener('pointermove',this.onPointerHover);this.#canvas.removeEventListener('pointerleave',this.onPointerLeave);this.disposeSelectionMarker();this.#build.dispose();this.#scene.remove(this.#tileHover);}

  private beginPrimaryDrag(clientX:number,clientY:number):boolean{
    if(this.#mode!=='edit')return false;if(this.#store.editorState.tool!=='select')return this.#build.beginStroke(clientX,clientY);
    const id=this.#picker.entityIdAt(this.#objects,clientX,clientY),entity=id?entityById(this.#store.state,id):undefined;if(!entity||!isCatalogueObjectId(entity.prototypeId))return false;
    this.#store.dispatchEditor({type:'selection/set',id:entity.id});const groupIds=stackGroupIds(this.#store.state,entity.id),original=entity.components.transform;
    this.#placement={id:entity.id,groupIds,original,resolved:original,valid:true,changed:false,lastPoseKey:transformKey(original)};
    this.#canvas.dataset.dragActive='true';for(const memberId of groupIds)this.#motion.setHeld(memberId,true);
    // Lease immediately on pointer-down so remote editors never see a delayed ownership race.
    this.#network?.beginManipulation(entity.id);return true;
  }

  private movePrimaryDrag(clientX:number,clientY:number):void{
    const placement=this.#placement;if(!placement){this.#build.moveStroke(clientX,clientY);return;}
    const entity=entityById(this.#store.state,placement.id);if(!entity)return;
    const hit=this.#picker.surfaceAt(clientX,clientY,this.#store.state.topology,this.#store.editorState.placementY);if(!hit)return;
    const fp=spatialProfileForEntity(entity)?.footprint;if(!fp)return;const position=centeredCellForPoint({x:hit.point.x,z:hit.point.z},fp);
    const candidateEntity:WorldEntity={...entity,components:{...entity.components,transform:{...entity.components.transform,position,y:this.#store.editorState.placementY}}};
    const resolveState=placement.groupIds.length>1?{...this.#store.state,entities:this.#store.state.entities.filter(member=>member.id===placement.id||!placement.groupIds.includes(member.id))}:this.#store.state;
    const resolvedEntity=resolveSupportedPlacement(resolveState,candidateEntity),transforms=resolvedEntity?translatedStackTransforms(this.#store.state,placement.id,resolvedEntity.components.transform):[];
    const valid=Boolean(resolvedEntity&&transforms.length&&reduceWorld(this.#store.state,{type:'entity-group/transform',transforms})!==this.#store.state);
    this.#canvas.dataset.dragCandidate=`${position.x},${position.z}`;this.#canvas.dataset.dragValid=String(valid);placement.valid=valid;
    if(!resolvedEntity){this.updateSelectionMarker({position,y:this.#store.editorState.placementY},fp.width,fp.depth,this.#store.editorState.placementY,false);return;}
    placement.resolved=resolvedEntity.components.transform;placement.changed=transformKey(placement.resolved)!==transformKey(placement.original);
    const poseKey=transformKey(placement.resolved);if(poseKey===placement.lastPoseKey){this.updateSelectionMarker(addressForTransform(placement.resolved),fp.width,fp.depth,placement.resolved.y,valid);return;}
    placement.lastPoseKey=poseKey;
    for(const patch of transforms){const member=entityById(this.#store.state,patch.id);if(!member)continue;const memberFp=spatialProfileForEntity({...member,components:{...member.components,transform:patch.transform}})?.footprint??{width:1,depth:1};this.#motion.setPlacementTarget(patch.id,patch.transform.position.x+memberFp.width/2,patch.transform.y,patch.transform.position.z+memberFp.depth/2);}
    this.updateSelectionMarker(addressForTransform(placement.resolved),fp.width,fp.depth,placement.resolved.y,valid);
    // Same-cell mouse jitter produces no message because poseKey is stable.
    this.#network?.updateManipulation(placement.id,placement.resolved,0.18);
  }

  private endPrimaryDrag(clientX:number,clientY:number):void{
    if(!this.#placement){this.#build.endStroke(clientX,clientY);return;}
    this.movePrimaryDrag(clientX,clientY);const placement=this.#placement;this.#placement=null;this.clearDragDataset();for(const id of placement.groupIds)this.#motion.setHeld(id,false);
    if(!placement.valid||!placement.changed){this.#network?.cancelManipulation(placement.id);this.#syncWorld();return;}
    const transforms=translatedStackTransforms(this.#store.state,placement.id,placement.resolved),result=transforms.length?this.#store.dispatch({type:'entity-group/transform',transforms}):{accepted:false};
    if(!result.accepted){this.#notify('That stack does not fit there.');this.#network?.cancelManipulation(placement.id);}else{const entity=entityById(this.#store.state,placement.id);if(entity)this.#network?.commitManipulation(placement.id,entity.components.transform);}
    this.#syncWorld();
  }
  private cancelPrimaryDrag():void{const placement=this.#placement;this.#placement=null;this.clearDragDataset();if(placement){for(const id of placement.groupIds)this.#motion.setHeld(id,false);this.#network?.cancelManipulation(placement.id);}this.#build.cancelStroke();this.#syncWorld();}

  private primaryActionAt(clientX:number,clientY:number):void{
    if(this.#mode==='edit'){if(this.#build.primaryAction(clientX,clientY))return;if(this.#store.editorState.tool==='select'){const id=this.#picker.entityIdAt(this.#objects,clientX,clientY),entity=id?entityById(this.#store.state,id):undefined;this.#store.dispatchEditor({type:'selection/set',id:entity&&isCatalogueObjectId(entity.prototypeId)?entity.id:null});}return;}
    const hit=this.#picker.surfaceAt(clientX,clientY,this.#store.state.topology),targetId=this.#picker.entityIdAt(this.#objects,clientX,clientY),access=this.#accessProvider(this.#player.actorId,this.#store.state);
    const action=resolveTargetAction({state:this.#store.state,actorId:this.#player.actorId,...(targetId?{targetId}:{}),...(hit?{cell:hit.cell,point:{x:hit.point.x,z:hit.point.z}}:{}),access});
    if(action.type==='interaction')this.#interactions.execute(action.intent);else if(action.type==='walk'&&this.#player.moveTo(action.cell,this.#store.state))this.#network?.move(action.cell);
  }
  private updateSelectionMarker(address:CellAddress,width:number,depth:number,y:number,valid:boolean):void{if(this.#selectionMarker)positionSelectionMarker(this.#selectionMarker,this.#store.state,address,width,depth,y,valid);}

  private readonly onPointerHover=(event:PointerEvent):void=>{
    if(this.#placement)return void(this.#tileHover.visible=false);
    if(this.#mode==='edit'){this.#tileHover.visible=false;if(this.#build.updateHover(event.clientX,event.clientY))return;return this.clearHover();}
    const hit=this.#picker.surfaceAt(event.clientX,event.clientY,this.#store.state.topology);if(!hit)return this.clearHover();let hoverCell=hit.cell,action='walk';const targetId=this.#picker.entityIdAt(this.#objects,event.clientX,event.clientY),target=targetId?entityById(this.#store.state,targetId):undefined,access=this.#accessProvider(this.#player.actorId,this.#store.state);
    const targetAction=resolveTargetAction({state:this.#store.state,actorId:this.#player.actorId,...(targetId?{targetId}:{}),cell:hit.cell,point:{x:hit.point.x,z:hit.point.z},access});if(targetAction.type==='interaction'){action=targetAction.intent.kind;if(targetAction.intent.kind==='sit')hoverCell=targetAction.intent.seat.cell;}else action=targetAction.type;
    if(target&&isCatalogueObjectId(target.prototypeId))this.#canvas.dataset.hoverObjectKind=target.prototypeId;else delete this.#canvas.dataset.hoverObjectKind;
    this.#tileHover.position.set(hoverCell.position.x+0.5,hoverCell.y+0.014,hoverCell.position.z+0.5);this.#tileHover.visible=true;this.#canvas.dataset.hoverCell=`${hoverCell.position.x},${hoverCell.position.z}`;this.#canvas.dataset.hoverY=String(hoverCell.y);this.#canvas.dataset.hoverAction=action;
  };
  private readonly onPointerLeave=():void=>this.clearHover();
  private clearHover():void{this.#tileHover.visible=false;this.#build.clearHover();delete this.#canvas.dataset.hoverCell;delete this.#canvas.dataset.hoverY;delete this.#canvas.dataset.hoverAction;delete this.#canvas.dataset.hoverObjectKind;}
  private clearDragDataset():void{delete this.#canvas.dataset.dragActive;delete this.#canvas.dataset.dragCandidate;delete this.#canvas.dataset.dragValid;}
  private disposeSelectionMarker():void{if(!this.#selectionMarker)return;this.#scene.remove(this.#selectionMarker);disposeMarker(this.#selectionMarker);this.#selectionMarker=null;}
}

function addressFor(entity:WorldEntity):CellAddress{return addressForTransform(entity.components.transform);}
function addressForTransform(transform:TransformComponent):CellAddress{return{y:transform.y,position:transform.position};}
function transformKey(transform:TransformComponent):string{return`${transform.position.x},${transform.position.z}@${Math.round(transform.y*1000)/1000}:${transform.rotation}`;}
