import type { InteractionIntent, InteractionKind } from './interaction-system';

export type InteractionHandler = (intent: InteractionIntent) => boolean;

export class InteractionDispatcher {
  readonly #handlers = new Map<InteractionKind, InteractionHandler>();
  readonly #useHandlers = new Map<string, InteractionHandler>();

  register(kind: InteractionKind, handler: InteractionHandler): () => void {
    this.#handlers.set(kind, handler);
    return () => {
      if (this.#handlers.get(kind) === handler) this.#handlers.delete(kind);
    };
  }

  registerUse(actionId: string, handler: InteractionHandler): () => void {
    if (this.#useHandlers.has(actionId)) throw new Error(`Duplicate use action handler: ${actionId}`);
    this.#useHandlers.set(actionId, handler);
    return () => {
      if (this.#useHandlers.get(actionId) === handler) this.#useHandlers.delete(actionId);
    };
  }

  execute(intent: InteractionIntent | null): boolean {
    if (!intent) return false;
    if (intent.kind === 'use') {
      const useHandler = this.#useHandlers.get(intent.actionId);
      if (useHandler) return useHandler(intent);
    }
    return this.#handlers.get(intent.kind)?.(intent) ?? false;
  }

  hasHandler(kind: InteractionKind): boolean {
    return this.#handlers.has(kind);
  }
}
