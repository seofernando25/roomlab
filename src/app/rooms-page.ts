import { LitElement, html } from 'lit';
import type { AccountDto, RoomSummaryDto } from '../online/types';
import { api } from '../online/api-client';
import { RoomDirectoryConnection } from '../online/room-directory-connection';
import { roomsPageStyles } from './rooms-page.styles';

export class RoomsPage extends LitElement {
  static override properties = { account: { attribute: false } };
  declare account: AccountDto;
  static override styles = roomsPageStyles;

  #rooms: readonly RoomSummaryDto[] = [];
  #scope: 'popular' | 'friends' | 'mine' | 'recent' = 'popular';
  #search = '';
  #loading = true;
  #creating = false;
  #message = '';
  #searchTimer = 0;
  #directoryTimer = 0;
  #loadGeneration = 0;
  #directory: RoomDirectoryConnection | null = null;

  constructor() {
    super();
    this.account = { id: '', username: '', createdAt: '', balance: 0 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.#directory = new RoomDirectoryConnection(() => this.queueDirectoryRefresh());
    this.#directory.connect();
  }

  override disconnectedCallback(): void {
    this.#loadGeneration += 1;
    window.clearTimeout(this.#searchTimer);
    window.clearTimeout(this.#directoryTimer);
    this.#directory?.close();
    this.#directory = null;
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <div class="section-head">
        <div><div class="eyebrow">Navigator</div><h2>Rooms</h2><p>Find active spaces, friends, or keep building your own.</p></div>
        <button class="primary" @click=${this.toggleCreate}>+ New room</button>
      </div>
      ${this.#creating ? this.renderCreateForm() : null}
      <div class="toolbar">
        ${(['popular', 'friends', 'mine', 'recent'] as const).map((scope) => html`
          <button class="scope ${scope === this.#scope ? 'active' : ''}" @click=${() => this.setScope(scope)}>${scopeLabel(scope)}</button>
        `)}
        <input class="search" type="search" placeholder="Search rooms" .value=${this.#search} @input=${this.onSearch}>
      </div>
      ${this.#message ? html`<div class="message">${this.#message}</div>` : null}
      <div class="spacer"></div>
      ${this.#loading ? html`<div class="empty">Loading rooms…</div>` : this.#rooms.length
        ? html`<div class="card-grid">${this.#rooms.map((room) => this.renderRoom(room))}</div>`
        : html`<div class="empty">No rooms here yet. Make one and invite somebody in.</div>`}
    `;
  }

  private renderRoom(room: RoomSummaryDto) {
    return html`<article class="card room-card">
      <div class="room-body">
        <div class="room-icon">▦</div>
        <div><div class="room-top"><h3>${room.name}</h3><span class="badge">${room.userCount} here</span></div><p>${room.description || 'A room waiting to become something.'}</p></div>
      </div>
      <div class="room-meta"><span class="badge">by ${room.ownerUsername}</span><span class="badge">${room.access}</span>${room.ownerUserId === this.account.id ? html`<span class="badge">Your room</span>` : null}</div>
      <button class="secondary join" @click=${() => this.join(room.id)}>Enter room</button>
    </article>`;
  }

  private renderCreateForm() {
    return html`<form class="soft-panel create" @submit=${this.createRoom}>
      <label class="field"><span>Room name</span><input name="name" maxlength="48" required placeholder="Rooftop Café"></label>
      <label class="field"><span>Who can enter?</span><select name="access"><option value="open">Everyone</option><option value="friends">Friends</option><option value="locked">Invite/rights only</option></select></label>
      <label class="field wide"><span>Description</span><input name="description" maxlength="240" placeholder="What is this room for?"></label>
      <button class="primary">Create</button>
    </form>`;
  }

  private async load(showLoading = true): Promise<void> {
    const generation = ++this.#loadGeneration;
    const scope = this.#scope, search = this.#search;
    if (showLoading) { this.#loading = true; this.requestUpdate(); }
    try {
      const rooms = await api.rooms(scope, search);
      if (generation !== this.#loadGeneration) return;
      this.#rooms = rooms; this.#message = '';
    } catch (error) {
      if (generation === this.#loadGeneration) this.#message = messageOf(error);
    } finally {
      if (generation === this.#loadGeneration) { this.#loading = false; this.requestUpdate(); }
    }
  }

  private readonly toggleCreate = (): void => { this.#creating = !this.#creating; this.requestUpdate(); };
  private setScope(scope: 'popular' | 'friends' | 'mine' | 'recent'): void { this.#scope = scope; void this.load(); }
  private readonly onSearch = (event: Event): void => {
    this.#search = (event.currentTarget as HTMLInputElement).value;
    window.clearTimeout(this.#searchTimer);
    this.#searchTimer = window.setTimeout(() => void this.load(), 180);
  };
  private queueDirectoryRefresh(): void {
    window.clearTimeout(this.#directoryTimer);
    this.#directoryTimer = window.setTimeout(() => void this.load(false), 90);
  }
  private join(roomId: string): void { this.dispatchEvent(new CustomEvent('join-room', { detail: { roomId }, bubbles: true, composed: true })); }
  private readonly createRoom = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    try {
      const room = await api.createRoom({ name: String(data.get('name') ?? ''), description: String(data.get('description') ?? ''), access: String(data.get('access') ?? 'open') as 'open' | 'friends' | 'locked' });
      this.#creating = false; this.#scope = 'mine'; await this.load(); this.join(room.id);
    } catch (error) { this.#message = messageOf(error); this.requestUpdate(); }
  };
}
function scopeLabel(scope: 'popular' | 'friends' | 'mine' | 'recent'): string { return scope === 'popular' ? 'Popular' : scope === 'friends' ? "Friends' rooms" : scope === 'mine' ? 'My rooms' : 'Recent'; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong.'; }
customElements.define('rooms-page', RoomsPage);
