import * as THREE from 'three';
import type { GameStore } from '../domain/game-store';
import { roomCellAt, wallAt } from '../domain/room-topology';
import type { CellAddress, RoomEditorTool } from '../domain/types';
import { cellBuildTargetValid, resolvedObjectPlacement, wallBuildTargetValid } from '../gameplay/build-preview';
import {
  commitFloorPropertyBrush,
  commitFloorShape,
  commitWallPaint,
  commitWallShape,
  floorShapeIntent,
  placePrototypeAt,
  stepTeleportPair,
  wallShapeIntent,
  type BuildOperationResult,
  type ShapeIntent,
} from '../gameplay/room-build-operations';
import { BuildContextOverlay } from './build-context-overlay';
import { BuildStrokePreview } from './build-stroke-preview';
import { ObjectPlacementGhost } from './object-placement-ghost';
import { ROOM_WALL_HEIGHT } from './room-geometry';
import type { RoomPicker, WallEdgeHit } from './room-picking';
import { createTileHoverIndicator, setTileHoverValidity } from './tile-hover-indicator';

type FloorBrushTool=Extract<RoomEditorTool,'floor-shape'|'floor-paint'|'floor-raise'|'floor-lower'>;
type WallBrushTool=Extract<RoomEditorTool,'wall-shape'|'wall-paint'>;
type BrushTool=FloorBrushTool|WallBrushTool;
interface BuildStroke{readonly tool:BrushTool;shapeIntent:ShapeIntent|null;anchorCell:CellAddress|null;anchorEdge:WallEdgeHit|null;readonly cells:Map<string,CellAddress>;readonly edges:Map<string,WallEdgeHit>;}

export class RoomBuildController {
  readonly #canvas:HTMLCanvasElement;
  readonly #scene:THREE.Scene;
  readonly #store:GameStore;
  readonly #picker:RoomPicker;
  readonly #notify:(message:string)=>void;
  readonly #context=new BuildContextOverlay();
  readonly #strokePreview=new BuildStrokePreview();
  readonly #objectGhost=new ObjectPlacementGhost();
  readonly #tileHover=createTileHoverIndicator();
  readonly #wallHover=createWallHoverIndicator();
  #stroke:BuildStroke|null=null;

  constructor(canvas:HTMLCanvasElement,scene:THREE.Scene,store:GameStore,picker:RoomPicker,notify:(message:string)=>void){this.#canvas=canvas;this.#scene=scene;this.#store=store;this.#picker=picker;this.#notify=notify;scene.add(this.#context.group,this.#strokePreview.group,this.#objectGhost.group,this.#tileHover,this.#wallHover);}
  get active():boolean{return this.#store.editorState.tool!=='select';}
  setVisible(visible:boolean):void{this.#context.group.visible=visible;if(!visible)this.clearHover();}
  sync():void{this.#context.sync(this.#store.state,this.#store.editorState);if(this.#store.editorState.tool!=='place-prototype')this.#objectGhost.hide();}

  beginStroke(clientX:number,clientY:number):boolean{
    const tool=this.#store.editorState.tool;if(!isBrushTool(tool))return false;
    const stroke:BuildStroke={tool,shapeIntent:null,anchorCell:null,anchorEdge:null,cells:new Map(),edges:new Map()};
    if(isFloorBrush(tool)){
      const hit=this.buildSurfaceAt(clientX,clientY);if(!hit)return false;
      const intent=tool==='floor-shape'?floorShapeIntent(this.#store.state,hit.cell):null;if(tool==='floor-shape'&&!intent)return false;
      stroke.shapeIntent=intent;stroke.anchorCell=hit.cell;
    }else{
      const edge=this.wallEdgeAt(clientX,clientY);if(!edge)return false;
      stroke.shapeIntent=tool==='wall-shape'?wallShapeIntent(this.#store.state,edge):null;stroke.anchorEdge=edge;
    }
    this.#stroke=stroke;this.addStrokePoint(clientX,clientY);
    return Boolean(stroke.cells.size||stroke.edges.size);
  }
  moveStroke(clientX:number,clientY:number):void{if(!this.#stroke)return;this.addStrokePoint(clientX,clientY);this.updateHover(clientX,clientY);}
  endStroke(clientX:number,clientY:number):void{
    const stroke=this.#stroke;if(!stroke)return;this.addStrokePoint(clientX,clientY);this.#stroke=null;this.#strokePreview.clear();
    let result:BuildOperationResult;
    if(stroke.tool==='floor-shape')result=commitFloorShape(this.#store,stroke.shapeIntent!,[...stroke.cells.values()]);
    else if(stroke.tool==='floor-paint'||stroke.tool==='floor-raise'||stroke.tool==='floor-lower')result=commitFloorPropertyBrush(this.#store,stroke.tool,[...stroke.cells.values()]);
    else if(stroke.tool==='wall-shape')result=commitWallShape(this.#store,stroke.shapeIntent!,[...stroke.edges.values()]);
    else result=commitWallPaint(this.#store,[...stroke.edges.values()]);
    this.report(result);
  }
  cancelStroke():void{this.#stroke=null;this.#strokePreview.clear();}

  primaryAction(clientX:number,clientY:number):boolean{
    const tool=this.#store.editorState.tool;if(tool!=='place-prototype'&&tool!=='teleport-pair')return false;
    const hit=this.buildSurfaceAt(clientX,clientY);if(!hit)return true;
    if(tool==='teleport-pair'&&!roomCellAt(this.#store.state.topology,hit.cell))return true;
    this.report(tool==='place-prototype'?placePrototypeAt(this.#store,hit.cell):stepTeleportPair(this.#store,hit.cell));return true;
  }

  updateHover(clientX:number,clientY:number):boolean{
    if(!this.active)return false;const tool=this.#store.editorState.tool;
    if(tool==='wall-shape'||tool==='wall-paint')return this.updateWallHover(clientX,clientY);
    const hit=this.buildSurfaceAt(clientX,clientY);if(!hit)return this.clearHover();
    const valid=this.strokeAwareCellValidity(hit.cell);this.#wallHover.visible=false;setTileHoverValidity(this.#tileHover,valid);
    this.#tileHover.position.set(hit.cell.position.x+0.5,hit.cell.y+0.018,hit.cell.position.z+0.5);this.#tileHover.visible=true;
    if(tool==='place-prototype'&&this.#store.editorState.placementPrototypeId){
      const resolved=resolvedObjectPlacement(this.#store.state,this.#store.editorState,hit.cell);
      this.#objectGhost.show(this.#store.state,this.#store.editorState.placementPrototypeId,hit.cell,this.#store.editorState.placementRotation,valid,resolved?.components.transform.y??hit.cell.y,this.#store.editorState.placementAppearance);
    }else this.#objectGhost.hide();
    this.setDataset(hit.cell,`build-${tool}`,valid);return true;
  }
  clearHover():false{this.#tileHover.visible=false;this.#wallHover.visible=false;this.#objectGhost.hide();for(const key of['hoverCell','hoverY','hoverAction','hoverWall','hoverValid'])delete this.#canvas.dataset[key];return false;}
  dispose():void{this.#scene.remove(this.#context.group,this.#strokePreview.group,this.#objectGhost.group,this.#tileHover,this.#wallHover);this.#context.dispose();this.#strokePreview.dispose();this.#objectGhost.dispose();disposeTree(this.#tileHover);disposeTree(this.#wallHover);}

  private buildSurfaceAt(clientX:number,clientY:number){return this.#picker.surfaceAt(clientX,clientY,this.#store.state.topology,this.#store.editorState.placementY);}
  private wallEdgeAt(clientX:number,clientY:number){return this.#picker.wallEdgeAt(clientX,clientY,this.#store.state.topology,this.#store.editorState.placementY);}
  private addStrokePoint(clientX:number,clientY:number):void{
    const stroke=this.#stroke;if(!stroke)return;
    if(isFloorBrush(stroke.tool)){
      const hit=this.buildSurfaceAt(clientX,clientY);if(!hit)return;
      if(stroke.tool==='floor-shape'){
        if(!stroke.anchorCell||Math.abs(hit.cell.y-stroke.anchorCell.y)>0.000001)return;
        stroke.cells.clear();for(const address of floorRectangle(stroke.anchorCell,hit.cell))stroke.cells.set(addressKey(address),address);this.syncStrokePreview(stroke);return;
      }
      if(!roomCellAt(this.#store.state.topology,hit.cell))return;stroke.cells.set(addressKey(hit.cell),hit.cell);return;
    }
    const edge=this.wallEdgeAt(clientX,clientY);if(!edge)return;
    if(stroke.tool==='wall-shape'&&stroke.anchorEdge){stroke.edges.clear();for(const lineEdge of wallLine(stroke.anchorEdge,edge))stroke.edges.set(edgeKey(lineEdge),lineEdge);this.syncStrokePreview(stroke);return;}
    stroke.edges.set(edgeKey(edge),edge);
  }
  private strokeAwareCellValidity(address:CellAddress):boolean{
    if(this.#stroke?.tool==='floor-shape')return this.#stroke.shapeIntent==='add'?!roomCellAt(this.#store.state.topology,address):Boolean(roomCellAt(this.#store.state.topology,address));
    return cellBuildTargetValid(this.#store.state,this.#store.editorState,address);
  }
  private syncStrokePreview(stroke:BuildStroke):void{
    if(stroke.tool==='floor-shape'){
      const addresses=[...stroke.cells.values()].filter(address=>stroke.shapeIntent==='add'?!roomCellAt(this.#store.state.topology,address):Boolean(roomCellAt(this.#store.state.topology,address)));
      this.#strokePreview.showFloor(this.#store.state,addresses,address=>stroke.shapeIntent==='add'||cellBuildTargetValid(this.#store.state,this.#store.editorState,address));return;
    }
    if(stroke.tool==='wall-shape'){
      const edges=[...stroke.edges.values()].filter(edge=>stroke.shapeIntent==='add'?!wallAt(this.#store.state.topology,edge.y,edge.axis,edge.x,edge.z):Boolean(wallAt(this.#store.state.topology,edge.y,edge.axis,edge.x,edge.z)));
      this.#strokePreview.showWalls(this.#store.state,edges,edge=>wallBuildTargetValid(this.#store.state,this.#store.editorState,edge));
    }
  }
  private updateWallHover(clientX:number,clientY:number):boolean{
    const edge=this.wallEdgeAt(clientX,clientY);if(!edge)return this.clearHover();const valid=wallBuildTargetValid(this.#store.state,this.#store.editorState,edge);
    this.#tileHover.visible=false;this.#objectGhost.hide();this.#wallHover.scale.set(edge.axis==='x'?1:0.07,1,edge.axis==='z'?1:0.07);this.#wallHover.position.set(edge.axis==='x'?edge.x+0.5:edge.x,edge.y+ROOM_WALL_HEIGHT/2,edge.axis==='x'?edge.z:edge.z+0.5);(this.#wallHover.material as THREE.MeshBasicMaterial).color.set(valid?0x85e5ff:0xef6262);this.#wallHover.visible=true;
    this.#canvas.dataset.hoverWall=`${edge.y}:${edge.axis}:${edge.x}:${edge.z}`;this.#canvas.dataset.hoverAction=`build-${this.#store.editorState.tool}`;this.#canvas.dataset.hoverValid=String(valid);return true;
  }
  private setDataset(address:CellAddress,action:string,valid:boolean):void{this.#canvas.dataset.hoverCell=`${address.position.x},${address.position.z}`;this.#canvas.dataset.hoverY=String(address.y);this.#canvas.dataset.hoverAction=action;this.#canvas.dataset.hoverValid=String(valid);delete this.#canvas.dataset.hoverWall;}
  private report(result:BuildOperationResult):void{if(result.message)this.#notify(result.message);}
}

function createWallHoverIndicator():THREE.Mesh{const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.04,ROOM_WALL_HEIGHT,1.04),new THREE.MeshBasicMaterial({color:0x85e5ff,transparent:true,opacity:0.26,depthWrite:false,toneMapped:false}));mesh.visible=false;return mesh;}
function isFloorBrush(tool:RoomEditorTool):tool is FloorBrushTool{return['floor-shape','floor-paint','floor-raise','floor-lower'].includes(tool);}
function isBrushTool(tool:RoomEditorTool):tool is BrushTool{return isFloorBrush(tool)||tool==='wall-shape'||tool==='wall-paint';}
function addressKey(address:CellAddress):string{return`${address.y}:${address.position.x},${address.position.z}`;}
function edgeKey(edge:WallEdgeHit):string{return`${edge.y}:${edge.axis}:${edge.x}:${edge.z}`;}
function floorRectangle(a:CellAddress,b:CellAddress):readonly CellAddress[]{const result:CellAddress[]=[];for(let z=Math.min(a.position.z,b.position.z);z<=Math.max(a.position.z,b.position.z);z+=1)for(let x=Math.min(a.position.x,b.position.x);x<=Math.max(a.position.x,b.position.x);x+=1)result.push({y:a.y,position:{x,z}});return result;}
function wallLine(start:WallEdgeHit,end:WallEdgeHit):readonly WallEdgeHit[]{const result:WallEdgeHit[]=[];if(start.axis==='x'){for(let x=Math.min(start.x,end.x);x<=Math.max(start.x,end.x);x+=1)result.push({y:start.y,axis:'x',x,z:start.z});}else{for(let z=Math.min(start.z,end.z);z<=Math.max(start.z,end.z);z+=1)result.push({y:start.y,axis:'z',x:start.x,z});}return result;}
function disposeTree(root:THREE.Object3D):void{root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();});}
