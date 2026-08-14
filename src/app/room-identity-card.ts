import { LitElement, css, html, nothing } from 'lit';
import type { RoomDetailDto } from '../online/types';

export class RoomIdentityCard extends LitElement {
  static override properties = { room: { attribute: false } };
  declare room: RoomDetailDto | null;
  static override styles = css`
    :host{display:block;color:#f0f5f3;font-family:system-ui,sans-serif}
    .card{display:flex;align-items:stretch;min-width:176px;max-width:min(300px,calc(100vw - 24px));border:2px solid #17272d;border-radius:5px;background:rgba(51,75,82,.94);box-shadow:3px 3px 0 rgba(0,0,0,.36),inset 0 0 0 1px #718884;overflow:hidden}
    .toggle{width:30px;min-height:44px;display:grid;place-items:center;border:0;border-right:1px solid #22363b;background:#445f61;cursor:pointer}
    .chevron{width:8px;height:8px;border-right:2px solid #eef6f3;border-bottom:2px solid #eef6f3;transform:rotate(135deg);transition:transform .12s ease}
    .collapsed .chevron{transform:rotate(-45deg)}
    .copy{min-width:0;flex:1;padding:7px 9px}.name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:950;line-height:1.15}.creator{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#bfd0cc;font-size:8px;font-weight:800}
    .settings{align-self:center;margin-right:6px;min-height:30px;padding:0 7px;border:1px solid #78918b;border-radius:3px;background:#59726f;color:#f4f7f5;font:900 7px system-ui;cursor:pointer}
    .settings:hover{background:#6a8580}.collapsed{min-width:0;max-width:170px}.collapsed .copy{padding-right:10px}.collapsed .creator,.collapsed .settings{display:none}
    button:focus-visible{outline:2px solid #f3c85a;outline-offset:-2px}
    @media(max-width:600px){.card{min-width:150px}.toggle{width:36px;min-height:44px}.settings{min-height:44px}.name{font-size:10px}}
  `;
  #collapsed = false;
  constructor() { super(); this.room = null; }
  override render() {
    const room = this.room; if (!room) return nothing;
    return html`<div class="card ${this.#collapsed ? 'collapsed' : ''}">
      <button class="toggle" aria-label=${this.#collapsed ? 'Expand room information' : 'Collapse room information'} @click=${this.toggle}><span class="chevron"></span></button>
      <div class="copy"><span class="name">${room.name}</span><span class="creator">${room.ownerUsername}</span></div>
      ${room.role === 'owner' ? html`<button class="settings" @click=${this.openSettings}>Settings</button>` : nothing}
    </div>`;
  }
  private readonly toggle = (): void => { this.#collapsed = !this.#collapsed; this.requestUpdate(); };
  private readonly openSettings = (): void => { this.dispatchEvent(new CustomEvent('room-settings-open', { bubbles: true, composed: true })); };
}
customElements.define('room-identity-card', RoomIdentityCard);
