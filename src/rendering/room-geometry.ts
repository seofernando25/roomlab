import * as THREE from 'three';
import { getFloorFinish, getWallFinish } from '../domain/room-finishes';
import { FLOOR_SLAB_THICKNESS, adjacentCellsForWall } from '../domain/room-topology';
import type { GridPoint, RoomCell, RoomTopology, WallSegment } from '../domain/types';
import { palette, toon, unlitSurface, wallMaterial } from './materials';
import type { FadingWall } from './wall-visibility';

export const ROOM_WALL_HEIGHT = 2.65;

/** Rebuildable sparse architecture made of independently floating floor slabs and wall lines. */
export class RoomArchitectureRenderer {
  readonly group=new THREE.Group();
  #walls:FadingWall[]=[];

  constructor(topology:RoomTopology){this.group.name='room-architecture';this.sync(topology);}
  get walls():readonly FadingWall[]{return this.#walls;}

  sync(topology:RoomTopology):void{
    this.disposeChildren();this.#walls=[];
    for(const cell of topology.cells)this.addFloorCell(cell);
    for(const wall of topology.walls)this.addWall(topology,wall);
  }
  setEditPlane(_topology:RoomTopology,_y:number|null):void{/* All slabs stay visible; the placement grid carries edit focus. */}
  dispose():void{this.disposeChildren();}

  private addFloorCell(cell:RoomCell):void{
    const finish=getFloorFinish(cell.floorFinish);
    const slab=new THREE.Mesh(new THREE.BoxGeometry(0.96,FLOOR_SLAB_THICKNESS,0.96),unlitSurface(finish.color,finish.pattern,1,1));
    slab.name=`floor:${cell.y}:${cell.position.x},${cell.position.z}`;
    slab.position.set(cell.position.x+0.5,cell.y-FLOOR_SLAB_THICKNESS/2,cell.position.z+0.5);
    tagSurface(slab,cell.y,cell.position,'floor');
    this.group.add(slab);
  }

  private addWall(topology:RoomTopology,wall:WallSegment):void{
    const adjacent=adjacentCellsForWall(topology,wall);if(!adjacent.length)return;
    const finish=getWallFinish(wall.finish),root=new THREE.Group();
    root.name=`wall:${wall.y}:${wall.axis}:${wall.x}:${wall.z}`;tagWall(root,wall);
    const main=new THREE.Mesh(wall.axis==='x'?new THREE.BoxGeometry(1.02,ROOM_WALL_HEIGHT,0.06):new THREE.BoxGeometry(0.06,ROOM_WALL_HEIGHT,1.02),wallMaterial(finish.color,finish.pattern,1.2,3));
    main.position.y=wall.y+ROOM_WALL_HEIGHT/2;root.add(main);
    addWallTrim(root,wall.axis,wall.y+0.07,palette.woodDark);addWallTrim(root,wall.axis,wall.y+0.76,palette.wallTrim);addWallTrim(root,wall.axis,wall.y+ROOM_WALL_HEIGHT-0.07,palette.woodDark);
    if(wall.axis==='x')root.position.set(wall.x+0.5,0,wall.z);else root.position.set(wall.x,0,wall.z+0.5);
    root.traverse(object=>tagWall(object,wall));this.group.add(root);
    this.#walls.push({root,y:wall.y,axis:wall.axis,x:wall.x,z:wall.z,center:new THREE.Vector3(root.position.x,wall.y+ROOM_WALL_HEIGHT/2,root.position.z),exteriorNormal:exteriorNormalFor(topology,wall)});
  }

  private disposeChildren():void{
    this.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();});
    this.group.clear();
  }
}

function exteriorNormalFor(topology:RoomTopology,wall:WallSegment):THREE.Vector3|null{
  const adjacent=adjacentCellsForWall(topology,wall);if(adjacent.length!==1)return null;const cell=adjacent[0]!.position;
  if(wall.axis==='x')return new THREE.Vector3(0,0,cell.z<wall.z?1:-1);return new THREE.Vector3(cell.x<wall.x?1:-1,0,0);
}
function addWallTrim(root:THREE.Group,axis:WallSegment['axis'],y:number,color:number):void{const mesh=new THREE.Mesh(axis==='x'?new THREE.BoxGeometry(1.04,0.12,0.10):new THREE.BoxGeometry(0.10,0.12,1.04),toon(color,'wood'));mesh.position.y=y;root.add(mesh);}
function tagSurface(object:THREE.Object3D,y:number,position:GridPoint,kind:string):void{object.userData.roomSurfaceY=y;object.userData.roomCell=`${position.x},${position.z}`;object.userData.roomSurface=kind;}
function tagWall(object:THREE.Object3D,wall:WallSegment):void{object.userData.wallY=wall.y;object.userData.wallAxis=wall.axis;object.userData.wallX=wall.x;object.userData.wallZ=wall.z;}
