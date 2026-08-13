import { LitElement, css, html } from 'lit';

export type HotelPanelTone = 'blue' | 'green' | 'red' | 'grey';

/**
 * Reusable compact game window inspired by the reference stylesheet's
 * colored-title / light-body / thin-edge panel construction.
 */
export class HotelPanel extends LitElement {
  static override properties = {
    heading: { type: String },
    tone: { type: String, reflect: true },
    compact: { type: Boolean, reflect: true },
    bodyHidden: { type: Boolean, reflect: true, attribute: 'body-hidden' },
  };

  static override styles = css`
    :host {
      --panel-border: #26373d;
      --panel-body: #e7ece9;
      --panel-body-edge: #9aa9a5;
      --panel-title: #597f8c;
      --panel-title-hi: #789ca5;
      display: block;
      color: #26363a;
      font-family: inherit;
    }
    :host([tone='green']) { --panel-title: #668253; --panel-title-hi: #8da375; }
    :host([tone='red']) { --panel-title: #9b5a57; --panel-title-hi: #bd7970; }
    :host([tone='grey']) { --panel-title: #687176; --panel-title-hi: #899397; }
    .shell {
      overflow: hidden;
      border: 3px solid var(--panel-border);
      border-radius: 7px;
      background: var(--panel-body);
      box-shadow: 4px 5px 0 rgba(5, 14, 18, .38), inset 0 0 0 1px rgba(255,255,255,.55);
    }
    .titlebar {
      min-height: 37px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 0 9px 0 11px;
      color: #fff;
      background:
        linear-gradient(rgba(255,255,255,.12), transparent 45%),
        linear-gradient(var(--panel-title-hi), var(--panel-title));
      border-bottom: 2px solid #33484e;
      box-shadow: inset 0 2px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(0,0,0,.18);
      text-shadow: 0 1px 0 rgba(31, 51, 57, .7);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .015em;
    }
    .body {
      min-height: 0;
      padding: 9px;
      border-left: 1px solid var(--panel-body-edge);
      border-right: 1px solid var(--panel-body-edge);
      background:
        linear-gradient(90deg, rgba(255,255,255,.32), transparent 14px),
        var(--panel-body);
    }
    :host([compact]) .titlebar { min-height: 31px; font-size: 11px; }
    :host([compact]) .body { padding: 7px; }
    :host([body-hidden]) .body { display: none; }
    ::slotted([slot='actions']) { flex: 0 0 auto; }
  `;

  declare heading: string;
  declare tone: HotelPanelTone;
  declare compact: boolean;
  declare bodyHidden: boolean;

  constructor() {
    super();
    this.heading = '';
    this.tone = 'blue';
    this.compact = false;
    this.bodyHidden = false;
  }

  override render() {
    return html`
      <section class="shell">
        <header class="titlebar">
          <span>${this.heading}</span>
          <slot name="actions"></slot>
        </header>
        <div class="body"><slot></slot></div>
      </section>
    `;
  }
}

customElements.define('hotel-panel', HotelPanel);
