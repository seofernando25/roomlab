import * as THREE from 'three';
import { topologyBounds } from '../domain/room-topology';
import type { EditorState, WorldState } from '../domain/types';

/** Semi-transparent virtual placement plane used by the room editor. */
export class BuildContextOverlay {
  readonly group=new THREE.Group();
  #key='';

  constructor(){this.group.name='build-context-overlay';}

  sync(world:WorldState,editor:EditorState):void{
    const bounds=topologyBounds(world.topology),nextKey=`${world.revision}:${editor.placementY}:${bounds.minX}:${bounds.maxX}:${bounds.minZ}:${bounds.maxZ}`;
    if(nextKey===this.#key)return;this.#key=nextKey;disposeChildren(this.group);
    const margin=3,minX=bounds.minX-margin,maxX=bounds.maxX+margin+1,minZ=bounds.minZ-margin,maxZ=bounds.maxZ+margin+1,y=editor.placementY+0.012;
    const fill=new THREE.Mesh(new THREE.PlaneGeometry(maxX-minX,maxZ-minZ),new THREE.MeshBasicMaterial({color:0x9bdbe5,transparent:true,opacity:0.045,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
    fill.rotation.x=-Math.PI/2;fill.position.set((minX+maxX)/2,y,(minZ+maxZ)/2);fill.renderOrder=4;this.group.add(fill);
    const points:THREE.Vector3[]=[];
    for(let x=minX;x<=maxX;x+=1)points.push(new THREE.Vector3(x,y,minZ),new THREE.Vector3(x,y,maxZ));
    for(let z=minZ;z<=maxZ;z+=1)points.push(new THREE.Vector3(minX,y,z),new THREE.Vector3(maxX,y,z));
    const lines=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa9eeff,transparent:true,opacity:0.38,depthWrite:false,toneMapped:false}));
    lines.renderOrder=5;this.group.add(lines);
  }
  dispose():void{disposeChildren(this.group);}
}
function disposeChildren(group:THREE.Group):void{group.traverse(object=>{if(!(object instanceof THREE.Mesh||object instanceof THREE.LineSegments))return;object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();});group.clear();}
