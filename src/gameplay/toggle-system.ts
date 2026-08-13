import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { getEntityPrototype } from '../domain/prototype-registry';
import type { EntityId } from '../domain/types';

export function toggleEntity(store: GameStore, targetId: EntityId): boolean {
  const entity = entityById(store.state, targetId);
  if (!entity) return false;
  const toggle = getEntityPrototype(entity.prototypeId).capabilities?.toggle;
  if (!toggle || toggle.status !== 'implemented' || toggle.states < 2) return false;
  const current = entity.components.toggle?.state ?? toggle.initialState ?? 0;
  const next = (current + 1) % toggle.states;
  return store.dispatch({ type: 'component/set', id: targetId, component: 'toggle', value: { state: next } }).accepted;
}

export function setToggleState(store: GameStore, targetId: EntityId, state: number): boolean {
  const entity = entityById(store.state, targetId);
  if (!entity) return false;
  const toggle = getEntityPrototype(entity.prototypeId).capabilities?.toggle;
  if (!toggle || toggle.status !== 'implemented' || state < 0 || state >= toggle.states || !Number.isInteger(state)) return false;
  return store.dispatch({ type: 'component/set', id: targetId, component: 'toggle', value: { state } }).accepted;
}
