import { LitElement, css, html } from 'lit';
import { api } from '../online/api-client';
import { RoomDirectoryConnection } from '../online/room-directory-connection';
import type { RoomSummaryDto } from '../online/types';
import { appTheme } from './app-theme';

export class RoomBrowserPanel extends LitElement {
  static override properties = { currentRoomId: { type: String } };
  declare currentRoomId: string;
  static override styles = [appTheme, css`
    :host{display:block;width:min(430px,calc(100vw - 28px));max-height:min(610px,calc(100dvh - 126px));color:#edf7f8}
    .panel{display:grid;grid-template-rows:auto auto minmax(0,1fr);max-height:inherit;padding:0;overflow:hidden;border:3px solid #172a31;border-radius:7px;background:#dfe6e5;box-shadow:5px 6px 0 rgba(0,0,0,.36),inset 0 0 0 2px #f8fbfa}
    .head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;background:linear-gradient(#53828d,#376874);border-bottom:3px solid #213f48}
    .head strong{font-size:13px;letter-spacing:.02em}.close{width:34px;height:34px;padding:0;border:2px solid #412a2d;border-radius:4px;background:#945558;color:#fff;font:900 16px system-ui;cursor:pointer}
    .search-wrap{padding:8px;border-bottom:2px solid #aab6b4;background:#e9eeed}.search{height:38px;font-size:13px;font-weight:750}
    .list{min-height:0;overflow:auto;padding:7px;overscroll-behavior:contain;scrollbar-width:thin}
    .room{width:100%;display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:9px;align-items:center;margin-bottom:5px;padding:7px;border:2px solid #9aa9a7;border-radius:5px;background:#f7f9f8;color:#31484e;text-align:left;box-shadow:inset 0 2px rgba(255,255,255,.8),0 2px #bcc6c4;cursor:pointer;font:inherit}
    .room:hover,.room:focus-visible{border-color:#557e8a;background:#fff;outline:none}.room.current{border-color:#c19a37;background:#fff5d8}.preview{width:44px;height:44px;position:relative;border:2px solid #60787d;border-radius:4px;background:#dbe5e3;overflow:hidden}
    .preview::before{content:'';position:absolute;width:34px;height:22px;left:5px;top:13px;transform:skewY(-24deg);background:#8fb6b6;border:2px solid #476a70;box-shadow:inset -8px 0 #789fa1}.preview::after{content:'';position:absolute;width:18px;height:17px;right:4px;top:6px;border-left:3px solid #648a8e;border-bottom:3px solid #648a8e}
    .copy{min-width:0}.name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:950}.creator{display:block;margin-top:3px;color:#748387;font-size:8px;font-weight:850}.count{min-width:42px;padding:5px 6px;border-radius:4px;background:#4f7f69;color:#fff;text-align:center;font-size:8px;font-weight:950}.count.zero{background:#82918d}.empty{padding:28px 14px;color:#718084;text-align:center;font-size:10px}.live{font-size:8px;color:#dce9e7;opacity:.8}
    @media(max-width:600px){:host{width:calc(100vw - 20px);max-height:calc(100dvh - 98px)}.search{height:44px;font-size:16px}.room{min-height:62px}.close{width:44px;height:44px}.head{padding:6px 8px}}
  `];

  #rooms: readonly RoomSummaryDto[] = [];
  #loading = true;
  #search = '';
  #message = '';
  #searchTimer = 0;
  #refreshTimer = 0;
  #loadGeneration = 0;
  #directory: RoomDirectoryConnection | null = null;

  constructor() { super(); this.currentRoomId = ''; }
  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.#directory = new RoomDirectoryConnection(() => this.queueRefresh());
    this.#directory.connect();
  }
  override disconnectedCallback(): void {
    this.#loadGeneration += 1;
    window.clearTimeout(this.#searchTimer); window.clearTimeout(this.#refreshTimer);
    this.#directory?.close(); this.#directory = null;
    super.disconnectedCallback();
  }
  override render() {
    return html`<section class="panel" role="dialog" aria-label="Room browser">
      <header class="head"><div><strong>Rooms</strong> <span class="live">live</span></div><button class="close" aria-label="Close room browser" @click=${this.close}>×</button></header>
      <div class="search-wrap"><input class="search" type="search" placeholder="Search rooms" .value=${this.#search} @input=${this.onSearch}></div>
      <div class="list">${this.#loading ? html`<div class="empty">Loading rooms…</div>` : this.#message ? html`<div class="empty">${this.#message}</div>` : this.#rooms.length ? this.#rooms.map((room) => this.room(room)) : html`<div class="empty">No rooms match that search.</div>`}</div>
    </section>`;
  }
  private room(room: RoomSummaryDto) {
    const current = room.id === this.currentRoomId;
    return html`<button class="room ${current ? 'current' : ''}" ?disabled=${current} @click=${() => this.join(room.id)}>
      <span class="preview" aria-hidden="true"></span><span class="copy"><span class="name">${room.name}</span><span class="creator">${room.ownerUsername}</span></span>
      <span class="count ${room.userCount ? '' : 'zero'}">${room.userCount} here</span>
    </button>`;
  }
  private async load(showLoading = true): Promise<void> {
    const generation = ++this.#loadGeneration, search = this.#search;
    if (showLoading) { this.#loading = true; this.requestUpdate(); }
    try {
      const rooms = await api.rooms('popular', search);
      if (generation !== this.#loadGeneration) return;
      this.#rooms = rooms; this.#message = '';
    } catch {
      if (generation === this.#loadGeneration) this.#message = 'Rooms are temporarily unavailable.';
    } finally {
      if (generation === this.#loadGeneration) { this.#loading = false; this.requestUpdate(); }
    }
  }
  private readonly onSearch = (event: Event): void => {
    this.#search = (event.currentTarget as HTMLInputElement).value;
    window.clearTimeout(this.#searchTimer);
    this.#searchTimer = window.setTimeout(() => void this.load(), 160);
  };
  private queueRefresh(): void {
    window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = window.setTimeout(() => void this.load(false), 90);
  }
  private join(roomId: string): void { this.dispatchEvent(new CustomEvent('room-browser-join', { detail: { roomId }, bubbles: true, composed: true })); }
  private readonly close = (): void => { this.dispatchEvent(new CustomEvent('room-browser-close', { bubbles: true, composed: true })); };
}
customElements.define('room-browser-panel', RoomBrowserPanel);
