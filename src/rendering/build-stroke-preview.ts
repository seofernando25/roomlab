import * as THREE from 'three';
import type { CellAddress, WorldState } from '../domain/types';
import { ROOM_WALL_HEIGHT } from './room-geometry';
import type { WallEdgeHit } from './room-picking';

export class BuildStrokePreview {
  readonly group=new THREE.Group();
  constructor(){this.group.name='build-stroke-preview';}

  showFloor(_state:WorldState,addresses:readonly CellAddress[],valid:(address:CellAddress)=>boolean):void{
    this.clear();
    for(const address of addresses){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.9),new THREE.MeshBasicMaterial({color:valid(address)?0x7fe5b0:0xef6f73,transparent:true,opacity:0.34,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
      mesh.rotation.x=-Math.PI/2;mesh.position.set(address.position.x+0.5,address.y+0.025,address.position.z+0.5);this.group.add(mesh);
    }
  }
  showWalls(_state:WorldState,edges:readonly WallEdgeHit[],valid:(edge:WallEdgeHit)=>boolean):void{
    this.clear();
    for(const edge of edges){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(edge.axis==='x'?0.94:0.06,ROOM_WALL_HEIGHT,edge.axis==='z'?0.94:0.06),new THREE.MeshBasicMaterial({color:valid(edge)?0x7fe5b0:0xef6f73,transparent:true,opacity:0.30,depthWrite:false,toneMapped:false}));
      mesh.position.set(edge.axis==='x'?edge.x+0.5:edge.x,edge.y+ROOM_WALL_HEIGHT/2,edge.axis==='x'?edge.z:edge.z+0.5);this.group.add(mesh);
    }
  }
  clear():void{this.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();});this.group.clear();}
  dispose():void{this.clear();}
}
