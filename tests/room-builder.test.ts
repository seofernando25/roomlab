import { describe, expect, test } from 'bun:test';
import { GameStore } from '../src/domain/game-store';
import { roomCellAt, wallAt, wallIsExterior } from '../src/domain/room-topology';
import { traversalConnectionForEntity } from '../src/domain/traversal-links';
import { validateWorldState } from '../src/domain/world-validation';
import { createFurniEntity, reduceWorld, resolveSupportedPlacement } from '../src/domain/world-state';
import { ActorMotionSystem } from '../src/gameplay/actor-motion-system';
import { cellBuildTargetValid, wallBuildTargetValid } from '../src/gameplay/build-preview';
import { findActorPath } from '../src/gameplay/navigation-system';
import {
  commitFloorPropertyBrush,
  commitFloorShape,
  commitWallShape,
  floorShapeIntent,
  setPlacementY,
  wallShapeIntent,
} from '../src/gameplay/room-build-operations';
import { resolveTargetAction } from '../src/gameplay/targeting-system';
import { createTeleporterPair, removeTeleporterPair, teleporterPairs } from '../src/gameplay/teleporter-editor';
import { staticInteractionAccessProvider } from '../src/domain/interaction-types';
import { addr, furni, TEST_ACTOR_ID, testWorld } from './helpers';

const OWNER=staticInteractionAccessProvider('owner');

describe('floating floor slabs',()=>{
  test('floor slabs may be placed freely in empty space at arbitrary continuous Y',()=>{
    const store=new GameStore(testWorld([],2,2));
    expect(setPlacementY(store,1.15).accepted).toBeTrue();
    expect(store.editorState.placementY).toBe(1.15);
    const area=[addr(5,4,1.15),addr(6,4,1.15),addr(5,5,1.15),addr(6,5,1.15)];
    expect(floorShapeIntent(store.state,area[0]!)).toBe('add');
    expect(commitFloorShape(store,'add',area).accepted).toBeTrue();
    for(const address of area)expect(roomCellAt(store.state.topology,address)?.y).toBe(1.15);
  });

  test('negative X/Z are ordinary slab coordinates',()=>{
    const store=new GameStore(testWorld([],2,2));
    expect(commitFloorShape(store,'add',[addr(-3,-2,0.75)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology,addr(-3,-2,0.75))).toBeDefined();
  });

  test('occupied support slabs cannot be removed while empty floating slabs can',()=>{
    const store=new GameStore(testWorld([furni('chair','chair',0,0)]));
    expect(commitFloorShape(store,'remove',[addr(0,0)]).accepted).toBeFalse();
    expect(commitFloorShape(store,'add',[addr(7,7,2.2)]).accepted).toBeTrue();
    expect(commitFloorShape(store,'remove',[addr(7,7,2.2)]).accepted).toBeTrue();
  });

  test('floor raise/lower uses fractional world Y rather than integer storeys',()=>{
    const store=new GameStore(testWorld());
    expect(commitFloorPropertyBrush(store,'floor-raise',[addr(2,1)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology,addr(2,1,0.25))).toBeDefined();
    expect(commitFloorPropertyBrush(store,'floor-lower',[addr(2,1,0.25)]).accepted).toBeTrue();
    expect(roomCellAt(store.state.topology,addr(2,1,0))).toBeDefined();
  });

  test('build preview delegates to the same slab legality rules',()=>{
    const store=new GameStore(testWorld());
    store.dispatchEditor({type:'placement-y/set',y:1.15});
    store.dispatchEditor({type:'tool/set',tool:'floor-shape'});
    expect(cellBuildTargetValid(store.state,store.editorState,addr(9,9,1.15))).toBeTrue();
    expect(commitFloorShape(store,'add',[addr(9,9,1.15)]).accepted).toBeTrue();
    expect(cellBuildTargetValid(store.state,store.editorState,addr(9,9,1.15))).toBeTrue();
  });
});

describe('stair traversal',()=>{
  test('a stair activates only when an elevated slab exists in its facing direction',()=>{
    const stair=furni('stairs','stairs-block',1,1,0,0);
    let state=testWorld([stair],4,4,{x:1,z:1});
    expect(traversalConnectionForEntity(state,stair)).toBeNull();
    state=reduceWorld(state,{type:'topology/cells-add',cells:[{position:{x:1,z:2},y:0.56,floorFinish:'wood'}]});
    expect(traversalConnectionForEntity(state,stair)).toEqual({low:addr(1,1,0),high:addr(1,2,0.56),rise:0.56});
    expect(findActorPath(state,TEST_ACTOR_ID,addr(1,1,0),addr(1,2,0.56))).toEqual([addr(1,2,0.56)]);
  });

  test('clicking a working stair resolves to a climb target instead of phasing through it',()=>{
    const stair=furni('stairs','stairs-block',1,1,0,0);
    let state=testWorld([stair],4,4,{x:1,z:0});
    state=reduceWorld(state,{type:'topology/cells-add',cells:[{position:{x:1,z:2},y:0.56,floorFinish:'wood'}]});
    const action=resolveTargetAction({state,actorId:TEST_ACTOR_ID,targetId:stair.id,cell:addr(1,1,0),access:OWNER(TEST_ACTOR_ID,state)});
    expect(action).toEqual({type:'walk',cell:addr(1,2,0.56)});
  });

  test('stacked stairs extend their reachable Y using their actual bottom',()=>{
    const first=furni('stair-a','stairs-block',1,1,0,0);
    let state=testWorld([first],4,4,{x:1,z:0});
    const second=resolveSupportedPlacement(state,createFurniEntity('stairs-block',{x:1,z:1},0,'stair-b',0))!;
    expect(second.components.transform.y).toBeCloseTo(0.56,6);
    state=reduceWorld(state,{type:'entity/add',entity:second});
    state=reduceWorld(state,{type:'topology/cells-add',cells:[{position:{x:1,z:2},y:1.12,floorFinish:'wood'}]});
    expect(traversalConnectionForEntity(state,second)).toEqual({low:addr(1,1,0),high:addr(1,2,1.12),rise:1.12});
    expect(findActorPath(state,TEST_ACTOR_ID,addr(1,1,0),addr(1,2,1.12))).toEqual([addr(1,2,1.12)]);
  });

  test('actor visual Y interpolates while traversing to a raised slab',()=>{
    const stair=furni('stairs','stairs-block',1,1,0,0);
    let world=testWorld([stair],4,4,{x:1,z:1});
    world=reduceWorld(world,{type:'topology/cells-add',cells:[{position:{x:1,z:2},y:0.56,floorFinish:'wood'}]});
    const store=new GameStore(world),motion=new ActorMotionSystem(store,TEST_ACTOR_ID,OWNER);
    expect(motion.moveTo(addr(1,2,0.56),store.state)).toBeTrue();
    motion.update(0.1);
    expect(motion.visualPose.y).toBeGreaterThan(0);
    for(let i=0;i<20&&motion.moving;i+=1)motion.update(0.1);
    expect(motion.cell).toEqual(addr(1,2,0.56));
    expect(motion.visualPose.y).toBeCloseTo(0.56,6);
  });
});

describe('manual wall lines',()=>{
  test('rooms start without automatic perimeter walls',()=>{
    expect(testWorld().topology.walls).toEqual([]);
  });

  test('a manual interior wall blocks navigation and can be removed',()=>{
    const store=new GameStore(testWorld([],4,1,{x:0,z:0}));
    const edge={y:0,axis:'z' as const,x:2,z:0};
    expect(wallShapeIntent(store.state,edge)).toBe('add');
    expect(commitWallShape(store,'add',[edge]).accepted).toBeTrue();
    expect(findActorPath(store.state,TEST_ACTOR_ID,addr(0,0),addr(3,0))).toBeNull();
    expect(commitWallShape(store,'remove',[edge]).accepted).toBeTrue();
    expect(findActorPath(store.state,TEST_ACTOR_ID,addr(0,0),addr(3,0))).not.toBeNull();
  });

  test('wall exterior classification is derived from slabs touching the line at the same Y',()=>{
    const store=new GameStore(testWorld([],2,1));
    const interior={axis:'z' as const,x:1,z:0,y:0,finish:'blue-panel' as const};
    const exterior={axis:'z' as const,x:0,z:0,y:0,finish:'blue-panel' as const};
    expect(wallIsExterior(store.state.topology,interior)).toBeFalse();
    expect(wallIsExterior(store.state.topology,exterior)).toBeTrue();
  });

  test('wall preview and commit share footprint legality',()=>{
    const store=new GameStore(testWorld([furni('table','table',0,0)],3,2));
    store.dispatchEditor({type:'tool/set',tool:'wall-shape'});
    const throughTable={y:0,axis:'z' as const,x:1,z:0};
    expect(wallBuildTargetValid(store.state,store.editorState,throughTable)).toBeFalse();
    expect(commitWallShape(store,'add',[throughTable]).accepted).toBeFalse();
  });

  test('orphan walls are pruned when their last adjacent slab is removed',()=>{
    let state=testWorld([],2,1,{x:1,z:0});
    state=reduceWorld(state,{type:'topology/wall-set',wall:{y:0,axis:'z',x:0,z:0,finish:'cream-brick'}});
    expect(wallAt(state.topology,0,'z',0,0)).toBeDefined();
    state=reduceWorld(state,{type:'topology/cells-remove',addresses:[addr(0,0)]});
    expect(wallAt(state.topology,0,'z',0,0)).toBeUndefined();
  });
});

describe('teleport pairs across floating slabs',()=>{
  test('pair creation is reciprocal across arbitrary Y values including same X/Z',()=>{
    const store=new GameStore(testWorld([],4,3));
    store.dispatch({type:'topology/cells-add',cells:[{position:{x:2,z:1},y:1.15,floorFinish:'wood'}]});
    expect(createTeleporterPair(store,addr(2,1,0),addr(2,1,1.15))).toBeTrue();
    const pair=teleporterPairs(store.state)[0]!;
    expect(pair.first.components.teleporter?.targetEntityId).toBe(pair.second.id);
    expect(pair.second.components.teleporter?.targetEntityId).toBe(pair.first.id);
    expect(validateWorldState(store.state).valid).toBeTrue();
  });

  test('teleport tiles can share a slab with ordinary furniture',()=>{
    const store=new GameStore(testWorld([furni('chair','chair',1,1)],4,3));
    expect(createTeleporterPair(store,addr(1,1),addr(2,1))).toBeTrue();
  });

  test('managed pair removal removes both endpoints atomically',()=>{
    const store=new GameStore(testWorld([],4,3));
    expect(createTeleporterPair(store,addr(1,1),addr(2,1))).toBeTrue();
    const id=teleporterPairs(store.state)[0]!.first.id;
    expect(removeTeleporterPair(store,id)).toBeTrue();
    expect(teleporterPairs(store.state)).toHaveLength(0);
  });

  test('authoritative validation rejects broken reciprocal links',()=>{
    const store=new GameStore(testWorld([],4,3));createTeleporterPair(store,addr(1,1),addr(2,1));
    const pair=teleporterPairs(store.state)[0]!;
    const broken={...store.state,entities:store.state.entities.map(entity=>entity.id===pair.second.id?{...entity,components:{...entity.components,teleporter:{}}}:entity)};
    expect(validateWorldState(broken).valid).toBeFalse();
  });
});
