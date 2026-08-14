import { LitElement, css, html, nothing } from 'lit';
import type { AppearanceComponent } from '../domain/material-design';
import { catalogueThumbnail } from '../rendering/catalogue-thumbnail-renderer';

export class CatalogueObjectPreview extends LitElement {
  static override properties = {
    prototypeId: { type: String, attribute: 'prototype-id' },
    appearance: { attribute: false },
    imageUrl: { state: true },
    failed: { state: true },
  };

  static override styles = css`
    :host { display:block; width:100%; height:100%; }
    .frame { width:100%; height:100%; display:grid; place-items:center; overflow:hidden; }
    img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
    .fallback { color:#77878a; font-size:22px; font-weight:900; }
  `;

  declare prototypeId: string;
  declare appearance: AppearanceComponent | null;
  declare imageUrl: string;
  declare failed: boolean;
  #request = 0;

  constructor() {
    super();
    this.prototypeId = '';
    this.appearance = null;
    this.imageUrl = '';
    this.failed = false;
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('prototypeId') || changed.has('appearance')) this.renderThumbnail();
  }

  override render() {
    return html`<div class="frame">
      ${this.imageUrl
        ? html`<img src=${this.imageUrl} alt="" draggable="false" />`
        : this.failed ? html`<span class="fallback">◆</span>` : nothing}
    </div>`;
  }

  private renderThumbnail(): void {
    const prototypeId = this.prototypeId;
    const request = ++this.#request;
    this.imageUrl = '';
    this.failed = false;
    delete this.dataset.ready;
    if (!prototypeId) return;
    queueMicrotask(() => {
      if (request !== this.#request) return;
      try {
        this.imageUrl = catalogueThumbnail(prototypeId, this.appearance);
        this.dataset.ready = 'true';
      } catch (error) {
        console.warn(`Catalogue preview failed for ${prototypeId}.`, error);
        this.failed = true;
        this.dataset.ready = 'false';
      }
    });
  }
}

customElements.define('catalogue-object-preview', CatalogueObjectPreview);
