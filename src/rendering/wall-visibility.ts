import * as THREE from 'three';
import type { WallAxis } from '../domain/types';

export interface FadingWall {
  readonly root: THREE.Group;
  readonly y: number;
  readonly axis: WallAxis;
  readonly x: number;
  readonly z: number;
  readonly center: THREE.Vector3;
  /** Null means a floor slab exists on both sides: this is an interior partition. */
  readonly exteriorNormal: THREE.Vector3 | null;
}

export class WallVisibilitySystem {
  #walls:readonly FadingWall[];
  constructor(walls:readonly FadingWall[]){this.#walls=walls;}
  setWalls(walls:readonly FadingWall[]):void{this.#walls=walls;}
  update(camera:THREE.Camera,playerWorld:THREE.Vector3,playerY:number,deltaSeconds:number):void{
    const blend=1-Math.exp(-deltaSeconds*14);
    for(const wall of this.#walls){
      const targetOpacity=wall.exteriorNormal?exteriorOpacity(wall,camera.position):interiorOpacity(wall,camera.position,playerWorld,playerY);
      if(targetOpacity>0.02)wall.root.visible=true;let greatestOpacity=0;
      wall.root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){material.transparent=targetOpacity<1||material.transparent;material.opacity=THREE.MathUtils.lerp(material.opacity,targetOpacity,blend);material.depthWrite=material.opacity>0.92;greatestOpacity=Math.max(greatestOpacity,material.opacity);}});
      if(targetOpacity===0&&greatestOpacity<0.012)wall.root.visible=false;
    }
  }
}
function exteriorOpacity(wall:FadingWall,camera:THREE.Vector3):number{const toCamera=new THREE.Vector3(camera.x-wall.center.x,0,camera.z-wall.center.z).normalize();return wall.exteriorNormal!.dot(toCamera)>0.12?0:1;}
function interiorOpacity(wall:FadingWall,camera:THREE.Vector3,player:THREE.Vector3,playerY:number):number{if(playerY<wall.y-0.1||playerY>wall.y+3)return 1;return segmentIntersectsWall(camera.x,camera.z,player.x,player.z,wall)?0.16:1;}
function segmentIntersectsWall(ax:number,az:number,bx:number,bz:number,wall:Pick<FadingWall,'axis'|'x'|'z'>):boolean{const cx=wall.x,cz=wall.z,dx=wall.axis==='x'?wall.x+1:wall.x,dz=wall.axis==='z'?wall.z+1:wall.z,den=(bx-ax)*(dz-cz)-(bz-az)*(dx-cx);if(Math.abs(den)<1e-7)return false;const t=((cx-ax)*(dz-cz)-(cz-az)*(dx-cx))/den,u=((cx-ax)*(bz-az)-(cz-az)*(bx-ax))/den;return t>0.02&&t<0.98&&u>=0&&u<=1;}
