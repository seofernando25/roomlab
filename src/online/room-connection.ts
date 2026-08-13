import type { RoomClientMessage, RoomServerMessage, JoinRoomDto } from './types';

type CommandInput<T = RoomClientMessage> = T extends RoomClientMessage ? Omit<T, 'clientCommandId' | 'clientSequence'> : never;
export interface RoomConnectionHooks {
  readonly onMessage: (message: RoomServerMessage) => void;
  readonly onStatus?: (status: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
  readonly onJoinChanged?: (join: JoinRoomDto) => void;
  readonly onError?: (message: string) => void;
}

export class RoomConnection {
  #join: JoinRoomDto;
  #socket: WebSocket | null = null;
  #clientSequence = 0;
  #lastServerSequence: number;
  #closed = false;
  #reconnectAttempts = 0;
  readonly #pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: number }>();

  constructor(join: JoinRoomDto, private readonly rejoin: () => Promise<JoinRoomDto>, private readonly hooks: RoomConnectionHooks) {
    this.#join = join;
    this.#lastServerSequence = join.serverSequence;
  }

  get join(): JoinRoomDto { return this.#join; }
  get connected(): boolean { return this.#socket?.readyState === WebSocket.OPEN; }

  connect(): void {
    if (this.#closed) return;
    this.hooks.onStatus?.(this.#reconnectAttempts ? 'reconnecting' : 'connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}${this.#join.websocketPath}`);
    this.#socket = socket;
    socket.addEventListener('open', () => { this.#reconnectAttempts = 0; this.hooks.onStatus?.('connected'); });
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => {
      if (this.#socket === socket) this.#socket = null;
      if (this.#closed) { this.hooks.onStatus?.('closed'); return; }
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => this.hooks.onError?.('Realtime connection error.'));
  }

  close(): void {
    this.#closed = true;
    this.#socket?.close(1000, 'Leaving room');
    this.#socket = null;
    this.hooks.onStatus?.('closed');
    for (const pending of this.#pending.values()) { window.clearTimeout(pending.timer); pending.reject(new Error('Room connection closed.')); }
    this.#pending.clear();
  }

  send(input: CommandInput): Promise<void> {
    if (!this.connected || !this.#socket) return Promise.reject(new Error('Room is reconnecting.'));
    const clientCommandId = crypto.randomUUID();
    const clientSequence = ++this.#clientSequence;
    const message = { ...input, clientCommandId, clientSequence } as RoomClientMessage;
    this.#socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.#pending.delete(clientCommandId); reject(new Error('Room command timed out.')); }, 7000);
      this.#pending.set(clientCommandId, { resolve, reject, timer });
    });
  }

  private receive(raw: string): void {
    let message: RoomServerMessage;
    try { message = JSON.parse(raw) as RoomServerMessage; }
    catch { this.hooks.onError?.('Received malformed room data.'); return; }
    if (message.roomSessionId !== this.#join.roomSessionId) return;
    if (message.type === 'ack' || message.type === 'rejected') {
      const pending = this.#pending.get(message.clientCommandId);
      if (pending) {
        window.clearTimeout(pending.timer);
        this.#pending.delete(message.clientCommandId);
        if (message.type === 'ack') pending.resolve();
        else pending.reject(new Error(message.reason));
      }
    }
    if (message.type !== 'ack' && message.type !== 'rejected') {
      if (message.serverSequence > this.#lastServerSequence + 1) this.hooks.onError?.('Room updates were missed; resynchronizing.');
      this.#lastServerSequence = Math.max(this.#lastServerSequence, message.serverSequence);
    }
    this.hooks.onMessage(message);
  }

  private scheduleReconnect(): void {
    if (this.#closed) return;
    this.hooks.onStatus?.('reconnecting');
    const wait = Math.min(5000, 350 * 2 ** Math.min(this.#reconnectAttempts++, 4));
    window.setTimeout(async () => {
      if (this.#closed) return;
      try {
        this.#join = await this.rejoin();
        this.hooks.onJoinChanged?.(this.#join);
        this.#lastServerSequence = this.#join.serverSequence;
        this.#clientSequence = 0;
        this.connect();
      } catch (error) {
        this.hooks.onError?.(error instanceof Error ? error.message : 'Could not rejoin room.');
        this.scheduleReconnect();
      }
    }, wait);
  }
}
