import { describe, expect, test } from 'bun:test';
import { getCatalogueObject } from '../src/domain/catalogue-registry';
import { stackGroupIds, translatedStackTransforms } from '../src/domain/stack-support';
import { isValidEntityPlacement, resolveSupportedPlacement } from '../src/domain/world-placement';
import { validateWorldState } from '../src/domain/world-validation';
import { createFurniEntity, reduceWorld } from '../src/domain/world-state';
import { testWorld } from './helpers';

describe('continuous support-surface stacking',()=>{
  test('sofas and club chairs expose real world-space support heights',()=>{
    expect(getCatalogueObject('sofa').capabilities.surface).toMatchObject({status:'implemented',acceptsFurni:true,height:0.68});
    expect(getCatalogueObject('chair').capabilities.surface).toMatchObject({status:'implemented',acceptsFurni:true,height:0.68});
  });

  test('a vase lands with its bottom exactly on the sofa top',()=>{
    const sofa=createFurniEntity('sofa',{x:1,z:1},0,'sofa',0);
    const state=testWorld([sofa],5,4);
    const resolved=resolveSupportedPlacement(state,createFurniEntity('vase',{x:1,z:1},0,'vase',0));
    expect(resolved?.components.transform.y).toBeCloseTo(0.68,6);
    expect(isValidEntityPlacement(state,resolved!)).toBeTrue();
    expect(validateWorldState({...state,entities:[...state.entities,resolved!]}).valid).toBeTrue();
  });

  test('a standing lamp may stack on a club chair without integer-height coercion',()=>{
    const chair=createFurniEntity('chair',{x:1,z:1},0,'chair',0);
    const state=testWorld([chair],4,3);
    const lamp=resolveSupportedPlacement(state,createFurniEntity('lamp',{x:1,z:1},0,'lamp',0));
    expect(lamp?.components.transform.y).toBeCloseTo(0.68,6);
    expect(validateWorldState({...state,entities:[...state.entities,lamp!]}).valid).toBeTrue();
  });

  test('moving a support translates every dependent item as one stack',()=>{
    const sofa=createFurniEntity('sofa',{x:1,z:1},0,'sofa',0);
    let state=testWorld([sofa],5,4);
    const vase=resolveSupportedPlacement(state,createFurniEntity('vase',{x:1,z:1},0,'vase',0))!;
    state=reduceWorld(state,{type:'entity/add',entity:vase});
    expect(stackGroupIds(state,'sofa')).toEqual(expect.arrayContaining(['sofa','vase']));
    const target={...sofa.components.transform,position:{x:2,z:1}};
    const transforms=translatedStackTransforms(state,'sofa',target);
    const moved=reduceWorld(state,{type:'entity-group/transform',transforms});
    expect(moved.entities.find(entity=>entity.id==='sofa')?.components.transform.position).toEqual({x:2,z:1});
    expect(moved.entities.find(entity=>entity.id==='vase')?.components.transform).toMatchObject({position:{x:2,z:1},y:0.68});
    expect(validateWorldState(moved).valid).toBeTrue();
  });
});
