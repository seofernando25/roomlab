import { describe, expect, test } from 'bun:test';
import {
  CATALOGUE_OBJECT_CATEGORIES,
  CATALOGUE_OBJECT_ORDER,
  CATALOGUE_OBJECTS,
  capabilitySummary,
  footprintFor,
  getCatalogueObject,
} from '../src/domain/catalogue-registry';
import { furniEntities, LOCAL_PLAYER_ID, localPlayerEntity } from '../src/domain/entity-queries';
import { GameStore } from '../src/domain/game-store';
import { ENTITY_PROTOTYPES } from '../src/domain/prototype-registry';
import { roomCellAt } from '../src/domain/room-topology';
import { SpatialIndex } from '../src/domain/spatial-index';
import type { WorldEntity } from '../src/domain/types';
import {
  centeredCellForPoint,
  createInitialWorld,
  findOpenCellForObject,
  isValidEntityPlacement,
  nextRotation,
  reduceWorld,
  resolveSupportedPlacement,
} from '../src/domain/world-state';
import { addr, furni, testWorld } from './helpers';

if(!ENTITY_PROTOTYPES.has('test.rug'))ENTITY_PROTOTYPES.register({id:'test.rug',kind:'furni',label:'Test rug',spatial:{footprint:{width:1,depth:1},rotatesWithEntity:true,occupancyLayer:'floor-overlay',conflictsWith:[]},collision:{mode:'none'},renderable:{renderer:'none'}});

describe('world placement and continuous Y occupancy',()=>{
  test('shipped demo world is serializable and every placeable has slab support',()=>{
    const state=createInitialWorld();
    expect(state.topology.cells).toHaveLength(80);
    expect(state.topology.walls).toHaveLength(0);
    expect(localPlayerEntity(state).id).toBe(LOCAL_PLAYER_ID);
    for(const entity of furniEntities(state))expect(isValidEntityPlacement(state,entity)).toBeTrue();
    expect(()=>JSON.stringify(state)).not.toThrow();
  });

  test('rotating a 2x1 catalogue object swaps its occupied dimensions',()=>{
    expect(footprintFor('table',0)).toEqual({width:2,depth:1});
    expect(footprintFor('table',1)).toEqual({width:1,depth:2});
  });

  test('same X/Z may host independent slabs and objects at different Y',()=>{
    let state=testWorld([furni('sofa','sofa',1,1)]);
    expect(isValidEntityPlacement(state,furni('chair','chair',1,1))).toBeFalse();
    state=reduceWorld(state,{type:'topology/cells-add',cells:[{position:{x:1,z:1},y:2.35,floorFinish:'wood'}]});
    expect(isValidEntityPlacement(state,furni('upper-chair','chair',1,1,0,2.35))).toBeTrue();
  });

  test('compatible occupancy layers can share the same support plane',()=>{
    const rug=furni('rug','test.rug',1,1),chair=furni('chair','chair',1,1),state=testWorld([rug]);
    expect(isValidEntityPlacement(state,chair)).toBeTrue();
    expect(SpatialIndex.fromWorld({...state,entities:[...state.entities,chair]}).entityIdsAt(addr(1,1))).toEqual(expect.arrayContaining(['rug','chair']));
  });

  test('objects resolve onto real support heights without unit quantization',()=>{
    const table=furni('table','table',1,1),state=testWorld([table],5,4);
    const lamp=resolveSupportedPlacement(state,furni('lamp','lamp',1,1));
    expect(lamp?.components.transform.y).toBeCloseTo(0.84,6);
    expect(isValidEntityPlacement({...state,entities:[...state.entities,lamp!]},lamp!)).toBeTrue();
  });

  test('support objects cannot disappear while another item depends on their top surface',()=>{
    const table=furni('table','table',1,1),base=testWorld([table],5,4),lamp=resolveSupportedPlacement(base,furni('lamp','lamp',1,1))!;
    const state={...base,entities:[...base.entities,lamp]};
    expect(reduceWorld(state,{type:'entity/remove',id:'table'})).toBe(state);
  });

  test('multi-cell placement requires support under every footprint tile at one Y',()=>{
    const state=testWorld([],3,2);
    const missing=reduceWorld(state,{type:'topology/cells-remove',addresses:[addr(1,0)]});
    expect(isValidEntityPlacement(missing,furni('table','table',0,0))).toBeFalse();
    const offset=reduceWorld(state,{type:'topology/cells-update',updates:[{address:addr(1,0),y:0.25}]});
    expect(isValidEntityPlacement(offset,furni('table','table',0,0))).toBeFalse();
  });

  test('accepted generic moves carry absolute Y and bump revision',()=>{
    const state=testWorld([furni('chair','chair',0,0)]),moved=reduceWorld(state,{type:'transform/move',id:'chair',address:addr(2,1)});
    expect(moved.revision).toBe(1);
    expect(moved.entities.find(entity=>entity.id==='chair')?.components.transform).toMatchObject({position:{x:2,z:1},y:0});
  });

  test('open-cell discovery stays sparse-floor aware',()=>{
    const occupied=[furni('a','sofa',0,0),furni('b','sofa',2,0)];
    expect(findOpenCellForObject(testWorld(occupied),'table',0)).toEqual(addr(0,1));
  });

  test('direct placement centers footprints on the nearest tile',()=>{
    expect(centeredCellForPoint({x:3.48,z:2.52},{width:1,depth:1})).toEqual({x:3,z:2});
    expect(centeredCellForPoint({x:4.08,z:2.49},{width:2,depth:1})).toEqual({x:3,z:2});
  });
});

describe('catalogue and prototype composition',()=>{
  test('Catalogue order covers every visible object exactly once',()=>{
    expect(new Set(CATALOGUE_OBJECT_ORDER).size).toBe(CATALOGUE_OBJECT_ORDER.length);
    expect([...CATALOGUE_OBJECT_ORDER].sort()).toEqual((Object.keys(CATALOGUE_OBJECTS) as (keyof typeof CATALOGUE_OBJECTS)[]).sort());
    expect(CATALOGUE_OBJECT_CATEGORIES.some(category=>category.id==='architecture')).toBeTrue();
  });
  test('seating and traversal remain capabilities rather than entity classes',()=>{
    expect(getCatalogueObject('chair').capabilities.sit?.status).toBe('implemented');
    expect(getCatalogueObject('stairs-glass').capabilities.traversal).toMatchObject({status:'implemented',mode:'steps',maxRise:0.56});
    expect(capabilitySummary(getCatalogueObject('stairs-metal'))).toContainEqual({key:'traversal',label:'Traversal',status:'implemented'});
  });
  test('traversal pieces remain ordinary placeables on flat slabs',()=>{
    expect(isValidEntityPlacement(testWorld(),furni('stairs','stairs-block',1,1))).toBeTrue();
    expect(isValidEntityPlacement(testWorld(),furni('ramp','ramp-metal',2,1))).toBeTrue();
  });
});

describe('authoritative world versus local editor state',()=>{
  test('selection and virtual placement Y remain local editor state',()=>{
    const store=new GameStore(),revision=store.state.revision,objectId=furniEntities(store.state)[0]!.id;
    store.dispatchEditor({type:'selection/set',id:objectId});
    store.dispatchEditor({type:'placement-y/set',y:1.15});
    expect(store.editorState).toMatchObject({selectedEntityId:objectId,placementY:1.15});
    expect(store.state.revision).toBe(revision);
  });

  test('world batches remain atomic',()=>{
    const store=new GameStore(testWorld([furni('chair','chair',0,0),furni('blocker','chair',1,0)])),before=store.state;
    expect(store.dispatchBatch([{type:'transform/move',id:'chair',address:addr(2,0)},{type:'transform/move',id:'chair',address:addr(1,0)}]).accepted).toBeFalse();
    expect(store.state).toBe(before);
  });

  test('malformed server snapshots with unknown prototypes are rejected',()=>{
    const store=new GameStore(),before=store.state;
    const badEntity:WorldEntity={id:'bad',prototypeId:'prototype.missing',components:{transform:{position:{x:0,z:0},rotation:0,y:0}}};
    expect(store.replaceFromServer({...before,revision:before.revision+1,entities:[...before.entities,badEntity]}).accepted).toBeFalse();
    expect(store.state).toBe(before);
  });

  test('quarter-turn helper remains deterministic',()=>{expect(nextRotation(0)).toBe(1);expect(nextRotation(3)).toBe(0);});

  test('sparse floor lookup distinguishes two floating slabs at identical X/Z',()=>{
    let state=testWorld();
    state=reduceWorld(state,{type:'topology/cells-add',cells:[{position:{x:0,z:0},y:1.15,floorFinish:'wood'}]});
    expect(roomCellAt(state.topology,addr(0,0,0))).toBeDefined();
    expect(roomCellAt(state.topology,addr(0,0,1.15))).toBeDefined();
    expect(roomCellAt(state.topology,addr(1,0,1.15))).toBeUndefined();
  });
});
