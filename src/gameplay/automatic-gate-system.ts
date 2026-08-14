import { actorEntities } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { requirementsMet, type InteractionAccessProvider } from '../domain/interaction-types';
import { getEntityPrototype } from '../domain/prototype-registry';
import { occupiedCells, spatialProfileForEntity } from '../domain/spatial-index';
import type { WorldEntity, WorldState } from '../domain/types';
import { setToggleState } from './toggle-system';

export function updateAutomaticGates(store: GameStore, accessProvider: InteractionAccessProvider): number {
  const desired = automaticGateUpdates(store.state, accessProvider);
  let changed = 0;
  for (const update of desired) {
    if (setToggleState(store, update.entity.id, update.state)) changed += 1;
  }
  return changed;
}

export function automaticGateUpdates(
  state: WorldState,
  accessProvider: InteractionAccessProvider,
): readonly { entity: WorldEntity; state: number }[] {
  const actors = actorEntities(state);
  const updates: { entity: WorldEntity; state: number }[] = [];
  for (const entity of state.entities) {
    const prototype = getEntityPrototype(entity.prototypeId);
    const gate = prototype.capabilities?.gate;
    const toggle = prototype.capabilities?.toggle;
    if (!gate?.autoOpen || gate.status !== 'implemented' || !toggle || toggle.status !== 'implemented') continue;
    const profile = spatialProfileForEntity(entity);
    if (!profile) continue;
    const gateCells = occupiedCells(entity.components.transform.position, profile.footprint);
    const nearby = actors.some((actor) => {
      if (actor.components.transform.y !== entity.components.transform.y) return false;
      const access = accessProvider(actor.id, state);
      if (!requirementsMet(gate.requirements, access)) return false;
      return gateCells.some((cell) => chebyshev(actor.components.transform.position, cell) <= 1);
    });
    const desiredState = nearby ? gate.passableState : closedState(toggle.states, gate.passableState, toggle.initialState);
    const currentState = entity.components.toggle?.state ?? toggle.initialState ?? 0;
    if (currentState !== desiredState) updates.push({ entity, state: desiredState });
  }
  return updates;
}

function closedState(states: number, passableState: number, initialState = 0): number {
  if (initialState !== passableState && initialState >= 0 && initialState < states) return initialState;
  for (let state = 0; state < states; state += 1) if (state !== passableState) return state;
  return passableState;
}

function chebyshev(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}
