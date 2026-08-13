import { LitElement, css, html, nothing } from 'lit';
import { api } from '../online/api-client';
import type { RoomDetailDto, RoomEditorDto } from '../online/types';
import { appTheme } from './app-theme';

export class RoomSettingsPanel extends LitElement {
  static override properties = { room: { attribute: false }, editors: { state: true }, busy: { state: true }, error: { state: true } };
  static override styles = [appTheme, css`
    :host{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px;background:rgba(1,16,28,.66);backdrop-filter:blur(3px)}
    .modal{width:min(620px,100%);max-height:min(760px,calc(100vh - 36px));overflow:auto;padding:20px;background:#0a2c45}
    .head{display:flex;align-items:start;justify-content:space-between;gap:18px;margin-bottom:18px}.head h2{margin:2px 0 4px;font-size:23px}.head p{margin:0;color:#9fc5d7;font-size:13px}.close{width:38px;height:38px;padding:0;font-size:22px}
    form{display:grid;grid-template-columns:1fr 160px;gap:12px}.wide{grid-column:1/-1}textarea{min-height:78px;resize:vertical}.actions{display:flex;justify-content:flex-end;gap:8px;grid-column:1/-1;margin-top:2px}
    .rights{margin-top:20px;padding-top:18px;border-top:1px solid rgba(139,213,242,.22)}.rights h3{margin:0 0 4px;font-size:16px}.rights p{margin:0 0 12px;color:#9fc5d7;font-size:12px}.grant{display:grid;grid-template-columns:1fr auto;gap:8px}.list{display:grid;gap:7px;margin-top:10px}.editor{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;background:rgba(16,62,91,.72);border:1px solid rgba(139,213,242,.18)}.editor strong{font-size:13px}.editor button{min-height:31px;padding:5px 9px}.empty-rights{padding:11px;border-radius:9px;color:#86afc2;background:rgba(4,31,49,.55);font-size:12px}.error{margin:0 0 12px;padding:9px 11px;border-radius:8px;background:#742d39;color:#fff;font-size:12px}
    @media(max-width:600px){form{grid-template-columns:1fr}.wide,.actions{grid-column:1}.grant{grid-template-columns:1fr}.modal{padding:16px}}
  `];

  declare room: RoomDetailDto;
  declare editors: readonly RoomEditorDto[];
  declare busy: boolean;
  declare error: string;

  constructor() {
    super();
    this.room = { id: '', ownerUserId: '', ownerUsername: '', name: '', description: '', access: 'open', maxUsers: 25, tags: [], userCount: 0, updatedAt: '', role: 'owner' };
    this.editors = [];
    this.busy = false;
    this.error = '';
  }

  override connectedCallback(): void { super.connectedCallback(); void this.loadEditors(); }

  override render() {
    return html`<section class="modal panel" role="dialog" aria-modal="true" aria-labelledby="room-settings-title">
      <header class="head"><div><div class="eyebrow">Owner controls</div><h2 id="room-settings-title">Room settings</h2><p>Choose who can enter and who can build with you.</p></div><button class="ghost close" @click=${this.close} aria-label="Close settings">×</button></header>
      ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
      <form @submit=${this.saveRoom}>
        <label class="field wide"><span>Room name</span><input name="name" required minlength="2" maxlength="48" .value=${this.room.name}></label>
        <label class="field wide"><span>Description</span><textarea name="description" maxlength="240" .value=${this.room.description}></textarea></label>
        <label class="field"><span>Who can enter?</span><select name="access" .value=${this.room.access}><option value="open">Everyone</option><option value="friends">Friends + editors</option><option value="locked">Owner + editors only</option></select></label>
        <label class="field"><span>Capacity</span><input name="maxUsers" type="number" min="1" max="50" .value=${String(this.room.maxUsers)}></label>
        <div class="actions"><button type="button" class="ghost" @click=${this.close}>Cancel</button><button class="primary" ?disabled=${this.busy}>${this.busy ? 'Saving…' : 'Save settings'}</button></div>
      </form>
      <section class="rights">
        <h3>Room editors</h3><p>Editors can build, move furniture, and use room tools while visitors continue playing.</p>
        <form class="grant" @submit=${this.grantEditor}><input name="username" required minlength="3" maxlength="18" placeholder="Username" aria-label="Editor username"><button class="secondary" ?disabled=${this.busy}>Grant build rights</button></form>
        <div class="list">${this.editors.length ? this.editors.map((editor) => html`<div class="editor"><strong>${editor.username}</strong><button class="danger" ?disabled=${this.busy} @click=${() => this.revokeEditor(editor)}>Revoke</button></div>`) : html`<div class="empty-rights">No additional editors yet.</div>`}</div>
      </section>
    </section>`;
  }

  private async loadEditors(): Promise<void> {
    if (!this.room.id) return;
    try { this.editors = await api.roomEditors(this.room.id); }
    catch (error) { this.error = messageFor(error, 'Could not load editor rights.'); }
  }

  private readonly saveRoom = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    this.busy = true; this.error = '';
    try {
      const room = await api.updateRoom(this.room.id, {
        name: String(data.get('name') ?? ''), description: String(data.get('description') ?? ''),
        access: String(data.get('access') ?? 'open') as RoomDetailDto['access'], maxUsers: Number(data.get('maxUsers') ?? 25),
      });
      this.room = room;
      this.dispatchEvent(new CustomEvent<RoomDetailDto>('room-settings-updated', { detail: room, bubbles: true, composed: true }));
    } catch (error) { this.error = messageFor(error, 'Could not save room settings.'); }
    finally { this.busy = false; }
  };

  private readonly grantEditor = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const username = String(new FormData(form).get('username') ?? '').trim();
    this.busy = true; this.error = '';
    try {
      const editor = await api.grantRoomEditor(this.room.id, username);
      this.editors = [...this.editors.filter((entry) => entry.userId !== editor.userId), editor].sort((a, b) => a.username.localeCompare(b.username));
      form.reset();
    } catch (error) { this.error = messageFor(error, 'Could not grant build rights.'); }
    finally { this.busy = false; }
  };

  private async revokeEditor(editor: RoomEditorDto): Promise<void> {
    this.busy = true; this.error = '';
    try { await api.revokeRoomEditor(this.room.id, editor.userId); this.editors = this.editors.filter((entry) => entry.userId !== editor.userId); }
    catch (error) { this.error = messageFor(error, 'Could not revoke build rights.'); }
    finally { this.busy = false; }
  }

  private readonly close = (): void => { this.dispatchEvent(new CustomEvent('room-settings-close', { bubbles: true, composed: true })); };
}

function messageFor(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
customElements.define('room-settings-panel', RoomSettingsPanel);
