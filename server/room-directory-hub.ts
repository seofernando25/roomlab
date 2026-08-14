import type { RoomDirectoryServerMessage } from '../src/online/types';

export interface RoomDirectoryTransport {
  readonly id: string;
  readonly send: (message: RoomDirectoryServerMessage) => void;
}

export class RoomDirectoryHub {
  readonly #transports = new Map<string, RoomDirectoryTransport>();
  #revision = 0;

  attach(transport: RoomDirectoryTransport): void {
    try {
      transport.send({ type: 'ready', revision: this.#revision });
      this.#transports.set(transport.id, transport);
    } catch { this.#transports.delete(transport.id); }
  }

  detach(transportId: string): void { this.#transports.delete(transportId); }

  changed(): void {
    this.#revision += 1;
    const message: RoomDirectoryServerMessage = { type: 'rooms-changed', revision: this.#revision };
    for (const [id, transport] of this.#transports) {
      try { transport.send(message); }
      catch { this.#transports.delete(id); }
    }
  }
}
