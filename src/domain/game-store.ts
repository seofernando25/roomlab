import { createInitialEditorState, reduceEditor } from './editor-state';
import { createInitialWorld, dispatchResult, reduceWorld } from './world-state';
import { validateWorldState } from './world-validation';
import type { DispatchResult, EditorAction, EditorState, WorldAction, WorldChange, WorldState } from './types';

export type WorldListener = (state: WorldState, action: WorldChange) => void;
export type EditorListener = (state: EditorState, action: EditorAction) => void;

export class GameStore {
  #world: WorldState;
  #editor: EditorState;
  #lastServerRevision = -1;
  readonly #worldListeners = new Set<WorldListener>();
  readonly #editorListeners = new Set<EditorListener>();

  constructor(world: WorldState = createInitialWorld(), editor: EditorState = createInitialEditorState()) {
    this.#world = world;
    this.#editor = editor;
  }

  get state(): WorldState { return this.#world; }
  get editorState(): EditorState { return this.#editor; }

  dispatch(action: WorldAction): DispatchResult {
    const previous = this.#world;
    const next = reduceWorld(previous, action);
    const result = dispatchResult(previous, next);
    if (!result.accepted) return result;
    this.commitWorld(next, action);
    return result;
  }

  /** Apply one logical gameplay event atomically with one revision and one listener notification. */
  dispatchBatch(actions: readonly WorldAction[]): DispatchResult {
    if (!actions.length) return { accepted: false, reason: 'World transaction is empty.' };
    const previous = this.#world;
    let next = previous;
    for (const action of actions) {
      const reduced = reduceWorld(next, action);
      if (reduced === next) return { accepted: false, reason: `World transaction rejected at ${action.type}.` };
      next = reduced;
    }
    next = { ...next, revision: previous.revision + 1 };
    this.commitWorld(next, { type: 'world/batch', actions });
    return { accepted: true };
  }

  dispatchEditor(action: EditorAction): DispatchResult {
    const previous = this.#editor;
    const next = reduceEditor(previous, action);
    if (next === previous) return { accepted: false, reason: 'No local editor state change.' };
    this.#editor = next;
    for (const listener of this.#editorListeners) listener(next, action);
    return { accepted: true };
  }

  subscribe(listener: WorldListener): () => void {
    this.#worldListeners.add(listener);
    return () => this.#worldListeners.delete(listener);
  }

  subscribeEditor(listener: EditorListener): () => void {
    this.#editorListeners.add(listener);
    return () => this.#editorListeners.delete(listener);
  }

  /** Future authoritative multiplayer snapshots replace simulation state only; local editor state is preserved. */
  replaceFromServer(snapshot: WorldState): DispatchResult {
    if (snapshot.id !== this.#world.id) return { accepted: false, reason: 'Server snapshot belongs to a different world.' };
    if (snapshot.revision < this.#lastServerRevision) return { accepted: false, reason: 'Server snapshot is older than the last accepted authority revision.' };
    const validation = validateWorldState(snapshot);
    if (!validation.valid) return { accepted: false, reason: validation.errors.join(' ') };
    this.#lastServerRevision = snapshot.revision;
    this.commitWorld(snapshot, { type: 'world/replaced' });
    return { accepted: true };
  }

  private commitWorld(next: WorldState, change: WorldChange): void {
    this.#world = next;
    if (this.#editor.selectedEntityId && !next.entities.some((entity) => entity.id === this.#editor.selectedEntityId)) {
      this.dispatchEditor({ type: 'selection/set', id: null });
    }
    for (const listener of this.#worldListeners) listener(next, change);
  }
}
