import { createRectangularTopology } from '../src/domain/room-topology';
import type { GridPoint, RotationQuarter, WorldEntity, WorldState } from '../src/domain/types';

export const TEST_ACTOR_ID='actor:test';
export const GROUND=0;
export const addr=(x:number,z:number,y=GROUND)=>({y,position:{x,z}});

export function testWorld(entities:readonly WorldEntity[]=[],width=4,depth=3,actorPosition:GridPoint={x:0,z:0},actorY=GROUND):WorldState{
  return{id:'test-room',revision:0,topology:createRectangularTopology(width,depth),entities:[actor(TEST_ACTOR_ID,actorPosition,0,actorY),...entities]};
}
export function furni(id:string,prototypeId:string,x:number,z:number,rotation:RotationQuarter=0,y=GROUND):WorldEntity{
  return{id,prototypeId,components:{transform:{position:{x,z},rotation,y}}};
}
export function actor(id:string,position:GridPoint,direction=0,y=GROUND):WorldEntity{
  return{id,prototypeId:'actor.local-player',components:{transform:{position,rotation:0,y},actor:{pose:'stand',direction}}};
}
