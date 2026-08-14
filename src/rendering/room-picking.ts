import * as THREE from 'three';
import { nearestWallEdge } from '../domain/room-topology';
import type { CellAddress, EntityId, GridPoint, RoomTopology, WallAxis } from '../domain/types';
import type { IsometricCameraController } from './isometric-camera';

export interface RoomSurfaceHit { readonly cell: CellAddress; readonly point: THREE.Vector3; }
export interface WallEdgeHit { readonly y:number; readonly axis:WallAxis; readonly x:number; readonly z:number; }

export class RoomPicker {
  readonly #canvas:HTMLCanvasElement;
  readonly #camera:IsometricCameraController;
  readonly #architecture:THREE.Group;
  readonly #raycaster=new THREE.Raycaster();
  readonly #pointer=new THREE.Vector2();
  readonly #fallbackHit=new THREE.Vector3();

  constructor(canvas:HTMLCanvasElement,camera:IsometricCameraController,architecture:THREE.Group){this.#canvas=canvas;this.#camera=camera;this.#architecture=architecture;}

  entityIdAt(objects:ReadonlyMap<EntityId,THREE.Group>,clientX:number,clientY:number):EntityId|null{
    this.setRay(clientX,clientY);const hit=this.#raycaster.intersectObjects([...objects.values()].filter(object=>object.visible),true)[0];let current:THREE.Object3D|null=hit?.object??null;
    while(current&&typeof current.userData.entityId!=='string')current=current.parent;return current?String(current.userData.entityId):null;
  }

  surfaceAt(clientX:number,clientY:number,_topology:RoomTopology,preferredY?:number):RoomSurfaceHit|null{
    this.setRay(clientX,clientY);
    const hits=this.#raycaster.intersectObject(this.#architecture,true);
    for(const hit of hits){
      const surface=inheritedUserData(hit.object,'roomSurface'),y=inheritedUserData(hit.object,'roomSurfaceY'),value=inheritedUserData(hit.object,'roomCell');
      if(surface!=='floor'||typeof y!=='number'||typeof value!=='string')continue;
      if(preferredY!==undefined&&Math.abs(y-preferredY)>0.000001)continue;
      const position=parseCell(value);if(position)return{cell:{y,position},point:hit.point.clone()};
    }
    if(preferredY===undefined)return null;
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-preferredY),point=this.#raycaster.ray.intersectPlane(plane,this.#fallbackHit);if(!point)return null;
    return{cell:{y:preferredY,position:{x:Math.floor(point.x),z:Math.floor(point.z)}},point:point.clone()};
  }

  wallEdgeAt(clientX:number,clientY:number,topology:RoomTopology,y:number):WallEdgeHit|null{
    this.setRay(clientX,clientY);const hits=this.#raycaster.intersectObject(this.#architecture,true);
    for(const hit of hits){
      const hitY=inheritedUserData(hit.object,'wallY'),axis=inheritedUserData(hit.object,'wallAxis'),x=inheritedUserData(hit.object,'wallX'),z=inheritedUserData(hit.object,'wallZ');
      if(typeof hitY==='number'&&Math.abs(hitY-y)<0.000001&&(axis==='x'||axis==='z')&&typeof x==='number'&&typeof z==='number')return{y,axis,x,z};
    }
    const surface=this.surfaceAt(clientX,clientY,topology,y);return surface?{y,...nearestWallEdge(surface.cell.position,surface.point)}:null;
  }

  private setRay(clientX:number,clientY:number):void{const rect=this.#canvas.getBoundingClientRect();this.#pointer.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);this.#raycaster.setFromCamera(this.#pointer,this.#camera.camera);}
}

function inheritedUserData(object:THREE.Object3D,key:string):unknown{let current:THREE.Object3D|null=object;while(current){if(current.userData[key]!==undefined)return current.userData[key];current=current.parent;}return undefined;}
function parseCell(value:string):GridPoint|null{const[x,z]=value.split(',').map(Number);return Number.isInteger(x)&&Number.isInteger(z)?{x:x!,z:z!}:null;}
