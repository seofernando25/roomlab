import { ENTITY_PROTOTYPES, getEntityPrototype } from './prototype-registry';
import { parseAppearanceComponent } from './material-design';
import { FLOOR_FINISHES, WALL_FINISHES } from './room-finishes';
import { MAX_FLOOR_BASE, MAX_FLOOR_ELEVATION, MIN_FLOOR_BASE, MIN_FLOOR_ELEVATION, adjacentCellsForWall, roomLevel, wallKey } from './room-topology';
import type { WorldEntity, WorldState } from './types';
import { isValidEntityPlacement } from './world-placement';

export interface WorldValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateWorldState(state: WorldState): WorldValidationResult {
  const errors: string[] = [];
  validateTopology(state, errors);

  const ids = new Set<string>();
  const knownEntities: WorldEntity[] = [];
  for (const entity of state.entities) {
    if (ids.has(entity.id)) errors.push(`Duplicate entity id: ${entity.id}.`);
    ids.add(entity.id);
    if (!ENTITY_PROTOTYPES.has(entity.prototypeId)) {
      errors.push(`Entity ${entity.id} references unknown prototype ${entity.prototypeId}.`);
      continue;
    }
    knownEntities.push(entity);
    validateEntitySchema(state, entity, errors);
  }

  const knownState = { ...state, entities: knownEntities };
  for (const entity of knownEntities) {
    if (!isValidEntityPlacement(knownState, entity)) errors.push(`Entity ${entity.id} has an invalid spatial placement.`);
  }
  validateRuntimeLinks(knownState, errors);
  return { valid: errors.length === 0, errors };
}

function validateTopology(state: WorldState, errors: string[]): void {
  const { levels } = state.topology;
  if (!levels.length) errors.push('Room topology needs at least one floor-height layer.');
  const levelIds = new Set<string>();
  const baseElevations = new Set<number>();
  const floorFinishes = new Set(FLOOR_FINISHES.map((finish) => finish.id));
  const wallFinishes = new Set(WALL_FINISHES.map((finish) => finish.id));

  for (const level of levels) {
    if (!level.id.trim()) errors.push('Room floor-layer id cannot be empty.');
    if (levelIds.has(level.id)) errors.push(`Duplicate room floor-layer id: ${level.id}.`);
    levelIds.add(level.id);
    if (!Number.isInteger(level.baseElevation)) errors.push(`Floor layer ${level.id} base elevation must be an integer step.`);
    if (level.baseElevation < MIN_FLOOR_BASE || level.baseElevation > MAX_FLOOR_BASE) errors.push(`Floor layer ${level.id} base elevation is outside the supported build range.`);
    if (baseElevations.has(level.baseElevation)) errors.push(`Two floor layers share base elevation ${level.baseElevation}.`);
    baseElevations.add(level.baseElevation);

    const cellKeys = new Set<string>();
    for (const cell of level.cells) {
      const key = `${cell.position.x},${cell.position.z}`;
      if (cellKeys.has(key)) errors.push(`Duplicate floor cell ${level.id}:${key}.`);
      cellKeys.add(key);
      if (!Number.isInteger(cell.position.x) || !Number.isInteger(cell.position.z)) errors.push(`Floor cell ${level.id}:${key} must use integer X/Z.`);
      if (!Number.isInteger(cell.elevation) || cell.elevation < MIN_FLOOR_ELEVATION || cell.elevation > MAX_FLOOR_ELEVATION) {
        errors.push(`Floor cell ${level.id}:${key} has invalid local elevation.`);
      }
      if (!floorFinishes.has(cell.floorFinish)) errors.push(`Floor cell ${level.id}:${key} has unknown finish ${cell.floorFinish}.`);
    }

    const wallKeys = new Set<string>();
    for (const wall of level.walls) {
      const key = wallKey(wall);
      if (wallKeys.has(key)) errors.push(`Duplicate wall ${level.id}:${key}.`);
      wallKeys.add(key);
      if (!Number.isInteger(wall.x) || !Number.isInteger(wall.z)) errors.push(`Wall ${level.id}:${key} must use integer grid coordinates.`);
      if (!wallFinishes.has(wall.finish)) errors.push(`Wall ${level.id}:${key} has unknown finish ${wall.finish}.`);
      if (!adjacentCellsForWall(state.topology, level.id, wall).length) errors.push(`Wall ${level.id}:${key} touches no floor.`);
    }
  }
}

function validateEntitySchema(state: WorldState, entity: WorldEntity, errors: string[]): void {
  const transform = entity.components.transform;
  if (!roomLevel(state.topology, transform.levelId)) errors.push(`Entity ${entity.id} references missing floor layer ${transform.levelId}.`);
  if (!Number.isInteger(transform.position.x) || !Number.isInteger(transform.position.z)) errors.push(`Entity ${entity.id} has a non-integer grid transform.`);
  if (![0, 1, 2, 3].includes(transform.rotation)) errors.push(`Entity ${entity.id} has an invalid quarter rotation.`);
  const stackElevation = transform.elevation ?? 0;
  if (!Number.isInteger(stackElevation) || stackElevation < 0) errors.push(`Entity ${entity.id} has an invalid stack elevation.`);

  const prototype = getEntityPrototype(entity.prototypeId);
  const toggle = entity.components.toggle;
  const toggleCapability = prototype.capabilities?.toggle;
  if (toggle && (!toggleCapability || toggleCapability.status !== 'implemented')) {
    errors.push(`Entity ${entity.id} has toggle state without an implemented toggle capability.`);
  } else if (toggle && (toggle.state < 0 || toggle.state >= toggleCapability!.states)) {
    errors.push(`Entity ${entity.id} has toggle state outside its prototype range.`);
  }

  if (entity.components.teleporter && prototype.capabilities?.teleport?.status !== 'implemented') {
    errors.push(`Entity ${entity.id} has teleporter state without an implemented teleport capability.`);
  }
  if (entity.components.appearance) {
    const appearance = parseAppearanceComponent(entity.components.appearance);
    if (!appearance) errors.push(`Entity ${entity.id} has an invalid material appearance.`);
    else {
      const allowed = new Set(prototype.renderable.materialSlots?.map((slot) => slot.id) ?? []);
      for (const slotId of Object.keys(appearance.materials)) {
        if (!allowed.has(slotId)) errors.push(`Entity ${entity.id} customizes unknown material slot ${slotId}.`);
      }
    }
  }
}

function validateRuntimeLinks(state: WorldState, errors: string[]): void {
  const ids = new Set(state.entities.map((entity) => entity.id));
  for (const entity of state.entities) {
    const prototype = getEntityPrototype(entity.prototypeId);
    const targetId = entity.components.teleporter?.targetEntityId;
    if (targetId && !ids.has(targetId)) errors.push(`Teleporter ${entity.id} references missing target entity ${targetId}.`);
    if (targetId && prototype.capabilities?.teleport?.paired) {
      const target = state.entities.find((candidate) => candidate.id === targetId);
      if (!target || target.components.teleporter?.targetEntityId !== entity.id) errors.push(`Paired teleporter ${entity.id} does not have a reciprocal link.`);
    }

    const actor = entity.components.actor;
    if (!actor?.seatedOn) continue;
    const seatEntity = state.entities.find((candidate) => candidate.id === actor.seatedOn);
    const sit = seatEntity ? getEntityPrototype(seatEntity.prototypeId).capabilities?.sit : undefined;
    if (!seatEntity || !sit || sit.status !== 'implemented' || actor.seatIndex === undefined || !sit.seats[actor.seatIndex]) {
      errors.push(`Actor ${entity.id} references an invalid seat attachment.`);
    }
  }
}
