import type { OccupancyLayer } from './prototype-components';
import { getEntityPrototype } from './prototype-registry';
import type { CellAddress, EntityId, Footprint, GridPoint, WorldEntity, WorldState } from './types';
export interface SpatialOccupant { readonly entityId:EntityId; readonly layer:OccupancyLayer; readonly y:number; }
export class SpatialIndex {
  readonly #cells=new Map<string,SpatialOccupant[]>();
  readonly #columns=new Map<string,SpatialOccupant[]>();
  static fromWorld(state:WorldState):SpatialIndex{const index=new SpatialIndex();for(const entity of state.entities)index.add(entity);return index;}
  entitiesAt(address:CellAddress):readonly SpatialOccupant[]{return this.#cells.get(addressKey(address))??[];}
  entitiesInColumn(position:GridPoint):readonly SpatialOccupant[]{return this.#columns.get(cellKey(position))??[];}
  entityIdsAt(address:CellAddress):readonly EntityId[]{return this.entitiesAt(address).map(e=>e.entityId);}
  occupantsForCells(y:number,cells:readonly GridPoint[]):readonly SpatialOccupant[]{const unique=new Map<EntityId,SpatialOccupant>();for(const position of cells)for(const o of this.entitiesAt({y,position}))unique.set(o.entityId,o);return[...unique.values()];}
  private add(entity:WorldEntity):void{const spatial=spatialProfileForEntity(entity);if(!spatial)return;const t=entity.components.transform;for(const position of occupiedCells(t.position,spatial.footprint)){const o={entityId:entity.id,layer:spatial.layer,y:t.y};const key=addressKey({y:t.y,position});this.#cells.set(key,[...(this.#cells.get(key)??[]),o]);const column=cellKey(position);this.#columns.set(column,[...(this.#columns.get(column)??[]),o]);}}
}
export interface EntitySpatialProfile { readonly footprint:Footprint; readonly layer:OccupancyLayer; readonly conflictsWith:readonly OccupancyLayer[]; readonly canStack:boolean; }
export function spatialProfileForEntity(entity:WorldEntity):EntitySpatialProfile|null{const spatial=getEntityPrototype(entity.prototypeId).spatial;if(!spatial)return null;const r=entity.components.transform.rotation;const footprint=spatial.rotatesWithEntity&&r%2===1?{width:spatial.footprint.depth,depth:spatial.footprint.width}:spatial.footprint;return{footprint,layer:spatial.occupancyLayer,conflictsWith:spatial.conflictsWith,canStack:spatial.canStack??false};}
export function occupiedCells(origin:GridPoint,footprint:Footprint):readonly GridPoint[]{const cells:GridPoint[]=[];for(let z=0;z<footprint.depth;z+=1)for(let x=0;x<footprint.width;x+=1)cells.push({x:origin.x+x,z:origin.z+z});return cells;}
export function addressKey(address:CellAddress):string{return`${address.y}:${address.position.x},${address.position.z}`;}
export function cellKey(cell:GridPoint):string{return`${cell.x},${cell.z}`;}
export function entityBottomY(entity:WorldEntity):number{return entity.components.transform.y;}
