import { LitElement, css, html } from 'lit';
import type { MaterialStyle } from '../domain/material-design';
import { rasterizeMaterialStyle } from '../rendering/material-program-texture';

export class MaterialSwatchPreview extends LitElement {
  static override properties = { materialStyle: { attribute: false } };
  static override styles = css`
    :host{display:block;aspect-ratio:1;min-width:0}.frame{width:100%;height:100%;box-sizing:border-box;padding:8px;border:2px solid #718785;border-radius:7px;background:#d8e2df;box-shadow:inset 0 2px rgba(255,255,255,.72),0 2px #a6b2af}canvas{display:block;width:100%;height:100%;image-rendering:pixelated;border:2px solid #40585d;box-sizing:border-box;background:#fff}
  `;
  declare materialStyle: MaterialStyle;

  override render() { return html`<div class="frame"><canvas aria-label="Procedural material texture preview"></canvas></div>`; }
  override updated(): void { this.draw(); }

  private draw(): void {
    if (!this.materialStyle) return;
    const canvas = this.renderRoot.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const size = 320;
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const raster = rasterizeMaterialStyle(this.materialStyle);
    const tile = document.createElement('canvas');
    tile.width = raster.size; tile.height = raster.size;
    const tileContext = tile.getContext('2d');
    if (!tileContext) return;
    const image = new ImageData(raster.size, raster.size);
    image.data.set(raster.data);
    tileContext.putImageData(image, 0, 0);
    const tileWidth = size / this.materialStyle.repeatX;
    const tileHeight = size / this.materialStyle.repeatY;
    for (let y = 0; y < size; y += tileHeight) {
      for (let x = 0; x < size; x += tileWidth) context.drawImage(tile, x, y, tileWidth, tileHeight);
    }
  }
}

customElements.define('material-swatch-preview', MaterialSwatchPreview);
