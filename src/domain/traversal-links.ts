import { getEntityPrototype } from './prototype-registry';
import { AUTO_STEP_DELTA, roomCellAt } from './room-topology';
import type { CellAddress, GridPoint, RotationQuarter, WorldEntity, WorldState } from './types';
export interface TraversalConnection{readonly low:CellAddress;readonly high:CellAddress;readonly rise:number;}
export function traversalConnectionForEntity(state:WorldState,entity:WorldEntity):TraversalConnection|null{
  const capability=getEntityPrototype(entity.prototypeId).capabilities?.traversal;if(!capability||capability.status!=='implemented')return null;const t=entity.components.transform;
  const lowCell=state.topology.cells.filter(c=>c.position.x===t.position.x&&c.position.z===t.position.z&&c.y<=t.y+1e-6).sort((a,b)=>b.y-a.y)[0];if(!lowCell)return null;
  const low:CellAddress={position:t.position,y:lowCell.y};const delta=directionDelta(t.rotation),targetPosition={x:t.position.x+delta.x,z:t.position.z+delta.z};const maxY=t.y+capability.maxRise;
  const target=state.topology.cells.filter(c=>c.position.x===targetPosition.x&&c.position.z===targetPosition.z&&c.y>low.y+AUTO_STEP_DELTA&&c.y<=maxY+1e-6).sort((a,b)=>a.y-b.y)[0];
  if(!target)return null;const high={position:target.position,y:target.y};return roomCellAt(state.topology,high)?{low,high,rise:high.y-low.y}:null;
}
export function traversalConnectsCells(state:WorldState,a:CellAddress,b:CellAddress):boolean{return state.entities.some(e=>{const c=traversalConnectionForEntity(state,e);return Boolean(c&&((same(c.low,a)&&same(c.high,b))||(same(c.low,b)&&same(c.high,a))));});}
export function traversalNeighbors(state:WorldState,address:CellAddress):readonly CellAddress[]{const result:CellAddress[]=[];for(const e of state.entities){const c=traversalConnectionForEntity(state,e);if(!c)continue;if(same(c.low,address))result.push(c.high);else if(same(c.high,address))result.push(c.low);}return result;}
export function directionDelta(rotation:RotationQuarter):GridPoint{if(rotation===0)return{x:0,z:1};if(rotation===1)return{x:-1,z:0};if(rotation===2)return{x:0,z:-1};return{x:1,z:0};}
function same(a:CellAddress,b:CellAddress):boolean{return a.y===b.y&&a.position.x===b.position.x&&a.position.z===b.position.z;}
