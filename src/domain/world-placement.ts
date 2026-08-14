import { roomCellAt, wallBetween } from './room-topology';
import { supportTopY } from './stack-support';
import { SpatialIndex, occupiedCells, spatialProfileForEntity } from './spatial-index';
import type { CellAddress, EntityId, GridPoint, RotationQuarter, WorldEntity, WorldState } from './types';

export function centeredCellForPoint(point:GridPoint,footprint:{width:number;depth:number}):GridPoint{return{x:Math.round(point.x-footprint.width/2),z:Math.round(point.z-footprint.depth/2)};}

export function isValidEntityPlacement(state:WorldState,candidate:WorldEntity):boolean{
  const profile=spatialProfileForEntity(candidate);if(!profile)return true;
  const transform=candidate.components.transform;if(!Number.isFinite(transform.y))return false;
  const cells=occupiedCells(transform.position,profile.footprint);
  if(footprintCrossesWall(state,transform.y,cells))return false;
  const index=SpatialIndex.fromWorld(state),byId=new Map(state.entities.map(entity=>[entity.id,entity]));
  for(const position of cells){
    const hasSlab=Boolean(roomCellAt(state.topology,{position,y:transform.y}));
    if(!hasSlab&&(!profile.canStack||!hasSupportAt(index,byId,candidate,position,transform.y)))return false;
  }
  for(const occupant of index.occupantsForCells(transform.y,cells)){
    if(occupant.entityId===candidate.id)continue;
    const other=byId.get(occupant.entityId);if(!other)continue;
    const otherProfile=spatialProfileForEntity(other);if(!otherProfile)continue;
    if(profile.conflictsWith.includes(otherProfile.layer)||otherProfile.conflictsWith.includes(profile.layer))return false;
  }
  return true;
}

/** Resolve the object's bottom onto the highest common support surface at or above its virtual placement Y. */
export function resolveSupportedPlacement(state:WorldState,candidate:WorldEntity):WorldEntity|null{
  const profile=spatialProfileForEntity(candidate);if(!profile)return candidate;
  const transform=candidate.components.transform,cells=occupiedCells(transform.position,profile.footprint);
  let common:Set<number>|null=null;
  const index=SpatialIndex.fromWorld(state),byId=new Map(state.entities.map(entity=>[entity.id,entity]));
  for(const position of cells){
    const ys=new Set<number>();
    for(const slab of state.topology.cells){
      if(slab.position.x===position.x&&slab.position.z===position.z&&slab.y>=transform.y-0.000001)ys.add(slab.y);
    }
    if(profile.canStack){
      for(const occupant of index.entitiesInColumn(position)){
        if(occupant.entityId===candidate.id)continue;
        const support=byId.get(occupant.entityId),top=support?supportTopY(support):null;
        if(top!==null&&top>=transform.y-0.000001)ys.add(top);
      }
    }
    common=common===null?ys:new Set<number>([...common].filter((value:number)=>ys.has(value)));
  }
  for(const y of [...(common??[])].sort((a,b)=>b-a)){
    const resolved={...candidate,components:{...candidate.components,transform:{...transform,y}}};
    if(isValidEntityPlacement(state,resolved))return resolved;
  }
  return null;
}

export function findOpenCell(state:WorldState,entity:WorldEntity):CellAddress|null{
  const transform=entity.components.transform;
  const cells=[...state.topology.cells].sort((a,b)=>a.y-b.y||a.position.z-b.position.z||a.position.x-b.position.x);
  for(const cell of cells){
    const candidate={...entity,components:{...entity.components,transform:{...transform,position:cell.position,y:cell.y}}};
    if(isValidEntityPlacement(state,candidate))return{position:cell.position,y:cell.y};
  }
  return null;
}
export function findOpenCellForObject(state:WorldState,prototypeId:string,y=0,rotation:RotationQuarter=0):CellAddress|null{
  return findOpenCell(state,{id:`placement-probe:${prototypeId}`,prototypeId,components:{transform:{position:{x:0,z:0},rotation,y}}});
}
function hasSupportAt(index:SpatialIndex,byId:ReadonlyMap<EntityId,WorldEntity>,candidate:WorldEntity,position:GridPoint,y:number):boolean{
  return index.entitiesInColumn(position).some(occupant=>{
    if(occupant.entityId===candidate.id)return false;
    const support=byId.get(occupant.entityId);return Boolean(support&&Math.abs((supportTopY(support)??Infinity)-y)<0.000001);
  });
}
function footprintCrossesWall(state:WorldState,y:number,cells:readonly GridPoint[]):boolean{
  const keys=new Set(cells.map(cell=>`${cell.x},${cell.z}`));
  for(const position of cells){
    for(const neighbor of[{x:position.x+1,z:position.z},{x:position.x,z:position.z+1}]){
      if(keys.has(`${neighbor.x},${neighbor.z}`)&&wallBetween(state.topology,{y,position},{y,position:neighbor}))return true;
    }
  }
  return false;
}
