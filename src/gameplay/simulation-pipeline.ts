import type { GameStore } from '../domain/game-store';
import type { InteractionAccessProvider } from '../domain/interaction-types';
import { updateAutomaticGates } from './automatic-gate-system';

export interface SimulationSystem {
  readonly id: string;
  update(store: GameStore, deltaSeconds: number): void;
}

export class SimulationPipeline {
  readonly #store: GameStore;
  readonly #systems: SimulationSystem[] = [];

  constructor(store: GameStore) {
    this.#store = store;
  }

  register(system: SimulationSystem): () => void {
    if (this.#systems.some((entry) => entry.id === system.id)) throw new Error(`Duplicate simulation system: ${system.id}`);
    this.#systems.push(system);
    return () => {
      const index = this.#systems.indexOf(system);
      if (index >= 0) this.#systems.splice(index, 1);
    };
  }

  update(deltaSeconds: number): void {
    for (const system of this.#systems) system.update(this.#store, deltaSeconds);
  }
}

export function createRoomSimulation(store: GameStore, accessProvider: InteractionAccessProvider): SimulationPipeline {
  const pipeline = new SimulationPipeline(store);
  pipeline.register({
    id: 'automatic-gates',
    update: (worldStore) => { updateAutomaticGates(worldStore, accessProvider); },
  });
  return pipeline;
}
