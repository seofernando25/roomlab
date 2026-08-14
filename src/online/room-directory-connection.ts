import type { RoomDirectoryServerMessage } from './types';

export type RoomDirectoryStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export class RoomDirectoryConnection {
  #socket: WebSocket | null = null;
  #closed = false;
  #attempts = 0;
  #reconnectTimer = 0;
  #keepaliveTimer = 0;
  #seenReady = false;

  constructor(
    private readonly onChanged: () => void,
    private readonly onStatus?: (status: RoomDirectoryStatus) => void,
  ) {}

  connect(): void {
    if (this.#closed || this.#socket) return;
    this.onStatus?.(this.#attempts ? 'reconnecting' : 'connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws/directory`);
    this.#socket = socket;
    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return;
      this.#attempts = 0;
      this.onStatus?.('connected');
      this.startKeepalive();
    });
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => {
      if (this.#socket === socket) this.#socket = null;
      this.stopKeepalive();
      if (this.#closed) { this.onStatus?.('closed'); return; }
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => socket.close());
  }

  close(): void {
    this.#closed = true;
    window.clearTimeout(this.#reconnectTimer);
    this.stopKeepalive();
    this.#socket?.close(1000, 'Directory view closed');
    this.#socket = null;
    this.onStatus?.('closed');
  }

  private receive(raw: string): void {
    let message: RoomDirectoryServerMessage;
    try { message = JSON.parse(raw) as RoomDirectoryServerMessage; }
    catch { return; }
    if (message.type === 'rooms-changed') this.onChanged();
    if (message.type === 'ready') {
      if (this.#seenReady) this.onChanged();
      this.#seenReady = true;
    }
  }

  private scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer) return;
    this.onStatus?.('reconnecting');
    const delay = Math.min(5000, 350 * 2 ** Math.min(this.#attempts++, 4));
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = 0;
      this.connect();
    }, delay);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.#keepaliveTimer = window.setInterval(() => {
      if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send('ping');
    }, 25_000);
  }

  private stopKeepalive(): void {
    window.clearInterval(this.#keepaliveTimer);
    this.#keepaliveTimer = 0;
  }
}
