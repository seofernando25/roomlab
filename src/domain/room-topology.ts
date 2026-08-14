import type { CellAddress, GridPoint, RoomCell, RoomCellUpdate, RoomTopology, TopologyAction, WallAxis, WallSegment } from './types';

export const FLOOR_SLAB_THICKNESS = 0.18;
export const DEFAULT_PLACEMENT_Y_STEP = 1;
export const MIN_PLACEMENT_Y = -8;
export const MAX_PLACEMENT_Y = 32;
/** Maximum floor-to-floor step an avatar can climb without a traversal object. */
export const AUTO_STEP_DELTA = 0.32;

export interface TopologyBounds { readonly minX:number; readonly maxX:number; readonly minZ:number; readonly maxZ:number; readonly width:number; readonly depth:number; }

export function createRectangularTopology(width:number,depth:number):RoomTopology {
  const cells:RoomCell[]=[];
  for(let z=0;z<depth;z+=1){
    for(let x=0;x<width;x+=1){
      cells.push({position:{x,z},y:0,floorFinish:x>=width-4&&z<3?'cream-tile':'wood'});
    }
  }
  return {cells,walls:[]};
}

export function sortedSurfaceYs(topology:RoomTopology):readonly number[]{return [...new Set(topology.cells.map(cell=>cell.y))].sort((a,b)=>a-b);}
export function roomCellAt(topology:RoomTopology,address:CellAddress):RoomCell|undefined{return topology.cells.find(cell=>sameCell(cell.position,address.position)&&sameY(cell.y,address.y));}
export function floorWorldY(_topology:RoomTopology,address:CellAddress):number{return address.y;}
export function surfaceWorldY(y:number):number{return y;}
export function surfaceY(_topology:RoomTopology,address:CellAddress):number|null{return address.y;}
export function topologyBounds(topology:RoomTopology,y?:number):TopologyBounds{
  const cells=y===undefined?topology.cells:topology.cells.filter(cell=>sameY(cell.y,y));
  if(!cells.length)return{minX:0,maxX:0,minZ:0,maxZ:0,width:1,depth:1};
  const xs=cells.map(c=>c.position.x),zs=cells.map(c=>c.position.z);const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  return{minX,maxX,minZ,maxZ,width:maxX-minX+1,depth:maxZ-minZ+1};
}
export function suggestedNewCell(topology:RoomTopology,address:CellAddress,finish:RoomCell['floorFinish']):RoomCell|null{
  if(roomCellAt(topology,address))return null;
  return{position:address.position,y:normalizeY(address.y),floorFinish:finish};
}
export function wallKey(wall:Pick<WallSegment,'axis'|'x'|'z'|'y'>):string{return`${normalizeY(wall.y)}:${wall.axis}:${wall.x}:${wall.z}`;}
export function wallAt(topology:RoomTopology,y:number,axis:WallAxis,x:number,z:number):WallSegment|undefined{return topology.walls.find(w=>sameY(w.y,y)&&w.axis===axis&&w.x===x&&w.z===z);}
export function edgeForAdjacentCells(a:GridPoint,b:GridPoint):Pick<WallSegment,'axis'|'x'|'z'>|null{const dx=b.x-a.x,dz=b.z-a.z;if(Math.abs(dx)+Math.abs(dz)!==1)return null;if(dx!==0)return{axis:'z',x:Math.max(a.x,b.x),z:Math.min(a.z,b.z)};return{axis:'x',x:Math.min(a.x,b.x),z:Math.max(a.z,b.z)};}
export function wallBetween(topology:RoomTopology,a:CellAddress,b:CellAddress):WallSegment|undefined{const edge=edgeForAdjacentCells(a.position,b.position);if(!edge)return undefined;return wallAt(topology,a.y,edge.axis,edge.x,edge.z)??wallAt(topology,b.y,edge.axis,edge.x,edge.z);}
export function canTraverseTopologyEdge(topology:RoomTopology,from:CellAddress,to:CellAddress):boolean{
  if(!roomCellAt(topology,from)||!roomCellAt(topology,to))return false;
  const dx=Math.abs(to.position.x-from.position.x),dz=Math.abs(to.position.z-from.position.z);
  if(dx>1||dz>1||(dx===0&&dz===0))return false;
  if(wallBetween(topology,from,to))return false;
  return Math.abs(from.y-to.y)<=AUTO_STEP_DELTA;
}
export function nearestWallEdge(cell:GridPoint,point:{x:number;z:number}):Pick<WallSegment,'axis'|'x'|'z'>{const lx=point.x-cell.x,lz=point.z-cell.z;return[{distance:lz,edge:{axis:'x' as const,x:cell.x,z:cell.z}},{distance:1-lz,edge:{axis:'x' as const,x:cell.x,z:cell.z+1}},{distance:lx,edge:{axis:'z' as const,x:cell.x,z:cell.z}},{distance:1-lx,edge:{axis:'z' as const,x:cell.x+1,z:cell.z}}].reduce((best,e)=>e.distance<best.distance?e:best).edge;}
export function adjacentCellsForWall(topology:RoomTopology,edge:Pick<WallSegment,'axis'|'x'|'z'|'y'>):readonly CellAddress[]{const positions=edge.axis==='x'?[{x:edge.x,z:edge.z-1},{x:edge.x,z:edge.z}]:[{x:edge.x-1,z:edge.z},{x:edge.x,z:edge.z}];return positions.flatMap(position=>roomCellAt(topology,{position,y:edge.y})?[{position,y:edge.y}]:[]);}
export function wallIsExterior(topology:RoomTopology,wall:WallSegment):boolean{return adjacentCellsForWall(topology,wall).length===1;}

export function applyTopologyAction(topology:RoomTopology,action:TopologyAction):RoomTopology{
  if(action.type==='topology/cells-add'){
    const keys=new Set(topology.cells.map(cellKey));const additions=action.cells.map(normalizeCell).filter(c=>!keys.has(cellKey(c)));
    return additions.length?{...topology,cells:[...topology.cells,...additions]}:topology;
  }
  if(action.type==='topology/cells-remove'){
    const remove=new Set(action.addresses.map(addressKey));const cells=topology.cells.filter(c=>!remove.has(cellKey(c)));
    if(cells.length===topology.cells.length)return topology;const walls=topology.walls.filter(w=>wallStillTouchesFloor(cells,w));return{cells,walls};
  }
  if(action.type==='topology/cells-update'){
    const byKey=new Map(action.updates.map(u=>[addressKey(u.address),u]));let changed=false;const cells:RoomCell[]=[];
    for(const cell of topology.cells){const u=byKey.get(cellKey(cell));if(!u){cells.push(cell);continue;}const next={...cell,...(u.floorFinish===undefined?{}:{floorFinish:u.floorFinish}),...(u.y===undefined?{}:{y:normalizeY(u.y)})};if(next.floorFinish!==cell.floorFinish||!sameY(next.y,cell.y))changed=true;cells.push(next);}
    if(!changed||new Set(cells.map(cellKey)).size!==cells.length)return topology;return{...topology,cells};
  }
  if(action.type==='topology/wall-set'){
    const wall={...action.wall,y:normalizeY(action.wall.y)};if(!adjacentCellsForWall(topology,wall).length)return topology;
    const walls=topology.walls.filter(w=>wallKey(w)!==wallKey(wall));return{...topology,walls:[...walls,wall]};
  }
  if(action.type==='topology/wall-remove'){
    const key=wallKey(action.edge),walls=topology.walls.filter(w=>wallKey(w)!==key);return walls.length===topology.walls.length?topology:{...topology,walls};
  }
  return topology;
}

export function normalizeY(value:number):number{return Math.max(MIN_PLACEMENT_Y,Math.min(MAX_PLACEMENT_Y,Math.round(value*100)/100));}
function normalizeCell(cell:RoomCell):RoomCell{return{...cell,y:normalizeY(cell.y)};}
function wallStillTouchesFloor(cells:readonly RoomCell[],wall:WallSegment):boolean{const candidates=wall.axis==='x'?[{x:wall.x,z:wall.z-1},{x:wall.x,z:wall.z}]:[{x:wall.x-1,z:wall.z},{x:wall.x,z:wall.z}];return candidates.some(position=>cells.some(c=>sameY(c.y,wall.y)&&sameCell(c.position,position)));}
function addressKey(a:CellAddress):string{return`${normalizeY(a.y)}:${a.position.x},${a.position.z}`;}
function cellKey(c:RoomCell):string{return`${normalizeY(c.y)}:${c.position.x},${c.position.z}`;}
function sameY(a:number,b:number):boolean{return Math.abs(a-b)<=0.000001;}
function sameCell(a:GridPoint,b:GridPoint):boolean{return a.x===b.x&&a.z===b.z;}
