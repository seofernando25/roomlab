import { LitElement, html, nothing } from 'lit';
import { getCatalogueObject } from '../domain/catalogue-registry';
import {
  MATERIAL_LAYER_KINDS,
  MATERIAL_RESOLUTIONS,
  createMaterialLayer,
  parseAppearanceComponent,
  parseMaterialStyle,
  type AppearanceComponent,
  type MaterialLayer,
  type MaterialLayerKind,
  type MaterialStyle,
} from '../domain/material-design';
import { MATERIAL_PRESETS, materialPreset } from '../domain/material-presets';
import './catalogue-object-preview';
import './hotel-panel';
import { materialStudioStyles } from './material-studio.styles';
import { loadSavedMaterialPresets, removeMaterialPreset, saveMaterialPreset, type SavedMaterialPreset } from './material-preset-store';

export class MaterialStudio extends LitElement {
  static override properties = {
    prototypeId: { type: String, attribute: 'prototype-id' },
    appearance: { attribute: false },
    actionLabel: { type: String, attribute: 'action-label' },
  };
  static override styles = materialStudioStyles;

  declare prototypeId: string;
  declare appearance: AppearanceComponent | null;
  declare actionLabel: string;
  #draft: AppearanceComponent = { materials: {} };
  #slotId = '';
  #layerIndex = 0;
  #addKind: MaterialLayerKind = 'stripes';
  #saved: readonly SavedMaterialPreset[] = [];
  #saveName = '';
  #message = '';
  #sourceAppearance: AppearanceComponent | null = null;
  #sourcePrototype = '';

  constructor() {
    super();
    this.prototypeId = '';
    this.appearance = null;
    this.actionLabel = 'Apply';
  }

  override connectedCallback(): void {
    super.connectedCallback(); this.#saved = loadSavedMaterialPresets();
    this.setAttribute('role', 'dialog'); this.setAttribute('aria-modal', 'true'); this.setAttribute('aria-label', 'Material Studio');
  }
  override firstUpdated(): void { queueMicrotask(() => this.renderRoot.querySelector<HTMLButtonElement>('.close-studio')?.focus()); }
  override willUpdate(): void {
    if (this.prototypeId === this.#sourcePrototype && this.appearance === this.#sourceAppearance) return;
    this.#sourcePrototype = this.prototypeId;
    this.#sourceAppearance = this.appearance;
    this.#draft = cloneAppearance(this.appearance);
    this.#slotId = getCatalogueObject(this.prototypeId).renderable.materialSlots?.[0]?.id ?? '';
    this.#layerIndex = 0;
    this.#message = '';
  }

  override render() {
    const definition = getCatalogueObject(this.prototypeId);
    const slots = definition.renderable.materialSlots ?? [];
    const style = this.#draft.materials[this.#slotId];
    const layer = style?.program.layers[this.#layerIndex];
    return html`<div class="backdrop"><hotel-panel heading="Material Studio" tone="blue" @keydown=${this.onKeyDown}>
      <button slot="actions" class="small-action ghost close-studio" aria-label="Close Material Studio" @click=${this.close}>×</button>
      <div class="studio">
        <aside class="preview-column">
          <div class="preview"><catalogue-object-preview .prototypeId=${this.prototypeId} .appearance=${this.normalizedDraft()}></catalogue-object-preview></div>
          <div class="object-copy"><div class="object-title">${definition.label}</div><div class="object-subtitle">Style parts independently. The recipe travels with the owned item.</div></div>
          <div class="slots" aria-label="Furniture material parts">${slots.map((slot) => html`
            <button class="slot ${slot.id === this.#slotId ? 'active' : ''}" title=${slot.description} @click=${() => this.selectSlot(slot.id)}>
              <span><strong>${slot.label}</strong><small>${slot.description}</small></span>${this.#draft.materials[slot.id] ? html`<span class="override">styled</span>` : nothing}
            </button>`)}
          </div>
        </aside>
        <main class="editor">
          <section class="section">
            <div class="section-head"><div class="section-title">Quick styles</div><div class="section-note">Only ${slotLabel(definition, this.#slotId)} changes</div></div>
            <div class="preset-grid">${MATERIAL_PRESETS.map((preset) => html`
              <button class="preset ${style && sameStyle(style, preset.style) ? 'active' : ''}" @click=${() => this.useStyle(preset.style)}><strong>${preset.label}</strong><span>${preset.description}</span></button>
            `)}</div>
          </section>

          ${style ? html`
            <section class="section">
              <div class="section-head"><div class="section-title">Surface</div><button class="small-action ghost" @click=${this.resetSlot}>Use original</button></div>
              <div class="fields">
                ${this.colorField('Base color', style.program.baseColor, (value) => this.updateStyle({ ...style, program: { ...style.program, baseColor: value } }))}
                <label class="field"><span>Detail</span><select .value=${String(style.program.resolution)} @change=${(e: Event) => this.updateResolution(Number((e.currentTarget as HTMLSelectElement).value))}>${MATERIAL_RESOLUTIONS.map((size) => html`<option value=${size}>${size} px</option>`)}</select></label>
                ${this.numberField('Repeat X', style.repeatX, 0.25, 8, 0.25, (value) => this.updateStyle({ ...style, repeatX: value }))}
                ${this.numberField('Repeat Y', style.repeatY, 0.25, 8, 0.25, (value) => this.updateStyle({ ...style, repeatY: value }))}
              </div>
            </section>

            <section class="section">
              <div class="section-head"><div class="section-title">Recipe layers</div><div class="section-note">Applied top to bottom</div></div>
              <div class="layers">${style.program.layers.map((entry, index) => html`<button class="layer ${index === this.#layerIndex ? 'active' : ''}" @click=${() => { this.#layerIndex = index; this.requestUpdate(); }}>${index + 1}. ${layerName(entry.kind)}</button>`)}</div>
              <div class="add-layer"><select aria-label="Layer type" .value=${this.#addKind} @change=${(e: Event) => { this.#addKind = (e.currentTarget as HTMLSelectElement).value as MaterialLayerKind; }}>${MATERIAL_LAYER_KINDS.map((kind) => html`<option value=${kind}>${layerName(kind)}</option>`)}</select><button class="small-action" @click=${this.addLayer}>+ Add layer</button></div>
              ${layer ? html`<div class="layer-editor">${this.renderLayer(style, layer)}<div class="layer-actions"><button class="small-action danger" @click=${this.removeLayer}>Remove layer</button></div></div>` : html`<div class="object-subtitle">No layers yet. A solid base color is a valid clean material.</div>`}
            </section>

            <section class="section">
              <div class="section-head"><div class="section-title">My patterns</div><div class="section-note">Saved in this browser</div></div>
              <div class="saved-row"><input maxlength="32" placeholder="Pattern name" aria-label="Pattern name" .value=${this.#saveName} @input=${(e: Event) => { this.#saveName = (e.currentTarget as HTMLInputElement).value; }}><button class="small-action" @click=${this.saveCurrent}>Save</button></div>
              ${this.#saved.length ? html`<div class="saved-list">${this.#saved.map((preset) => html`<span class="saved"><button @click=${() => this.useStyle(preset.style)}>${preset.name}</button><button class="delete" title="Delete saved pattern" @click=${() => this.deleteSaved(preset.id)}>×</button></span>`)}</div>` : nothing}
            </section>
          ` : html`<section class="section"><div class="object-subtitle">This part is using the furniture’s original authored material.</div><button class="action primary" style="margin-top:8px" @click=${this.startRecommended}>Customize this part</button></section>`}

          <details class="advanced"><summary>Recipe data · portable & deterministic</summary><div class="advanced-body"><div class="object-subtitle">Recipes contain bounded data only—no JavaScript, shader code, URLs, or uploaded executable content.</div><pre class="recipe">${JSON.stringify(style ?? null, null, 2)}</pre></div></details>
          ${this.#message ? html`<div class="message" role="status" aria-live="polite">${this.#message}</div>` : nothing}
        </main>
      </div>
      <div class="footer"><div class="footer-group"><button class="action secondary" @click=${this.resetAll}>Reset all</button><button class="action secondary" @click=${this.close}>Cancel</button></div><button class="action primary apply" @click=${this.apply}>${this.actionLabel}</button></div>
    </hotel-panel></div>`;
  }

  private renderLayer(style: MaterialStyle, layer: MaterialLayer) {
    const set = (next: MaterialLayer) => this.replaceLayer(style, next);
    return html`<div class="fields">
      ${this.colorField('Layer color', layer.color, (color) => set({ ...layer, color }))}
      ${this.numberField('Opacity', layer.opacity, 0, 1, 0.05, (opacity) => set({ ...layer, opacity }))}
      ${layer.kind === 'stripes' ? html`${this.numberField('Spacing', layer.spacing, 2, 32, 1, (spacing) => set({ ...layer, spacing, thickness: Math.min(layer.thickness, spacing) }))}${this.numberField('Thickness', layer.thickness, 1, Math.min(16, layer.spacing), 1, (thickness) => set({ ...layer, thickness }))}<label class="field"><span>Angle</span><select .value=${String(layer.angle)} @change=${(e: Event) => set({ ...layer, angle: Number((e.currentTarget as HTMLSelectElement).value) as 0|45|90|135 })}>${[0,45,90,135].map((angle) => html`<option value=${angle}>${angle}°</option>`)}</select></label>` : nothing}
      ${layer.kind === 'checker' ? this.numberField('Check size', layer.size, 2, 32, 1, (size) => set({ ...layer, size })) : nothing}
      ${layer.kind === 'grid' ? html`${this.numberField('Spacing', layer.spacing, 3, 32, 1, (spacing) => set({ ...layer, spacing, thickness: Math.min(layer.thickness, spacing - 1) }))}${this.numberField('Line width', layer.thickness, 1, Math.min(8, layer.spacing - 1), 1, (thickness) => set({ ...layer, thickness }))}` : nothing}
      ${layer.kind === 'dots' ? html`${this.numberField('Spacing', layer.spacing, 3, 32, 1, (spacing) => set({ ...layer, spacing, radius: Math.min(layer.radius, Math.floor(spacing / 2)) }))}${this.numberField('Radius', layer.radius, 1, Math.min(8, Math.floor(layer.spacing / 2)), 1, (radius) => set({ ...layer, radius }))}<label class="field"><span>Layout</span><select .value=${layer.stagger ? 'stagger' : 'grid'} @change=${(e: Event) => set({ ...layer, stagger: (e.currentTarget as HTMLSelectElement).value === 'stagger' })}><option value="stagger">Staggered</option><option value="grid">Grid</option></select></label>` : nothing}
      ${layer.kind === 'speckles' ? html`${this.numberField('Density', layer.density, 0.01, 0.6, 0.01, (density) => set({ ...layer, density }))}${this.numberField('Size', layer.size, 1, 3, 1, (size) => set({ ...layer, size }))}${this.numberField('Seed', layer.seed, 0, 65535, 1, (seed) => set({ ...layer, seed }))}` : nothing}
      ${layer.kind === 'grain' ? html`${this.numberField('Spacing', layer.spacing, 3, 32, 1, (spacing) => set({ ...layer, spacing }))}${this.numberField('Line width', layer.thickness, 1, 4, 1, (thickness) => set({ ...layer, thickness }))}${this.numberField('Seed', layer.seed, 0, 65535, 1, (seed) => set({ ...layer, seed }))}` : nothing}
    </div>`;
  }

  private colorField(label: string, value: string, change: (value: string) => void) { return html`<label class="field"><span>${label}</span><input type="color" .value=${value} @input=${(e: Event) => change((e.currentTarget as HTMLInputElement).value)}></label>`; }
  private numberField(label: string, value: number, min: number, max: number, step: number, change: (value: number) => void) { return html`<label class="field"><span>${label}</span><input type="number" .value=${String(value)} min=${min} max=${max} step=${step} @change=${(e: Event) => change(clampNumber((e.currentTarget as HTMLInputElement), min, max))}></label>`; }
  private selectSlot(id: string): void { this.#slotId = id; this.#layerIndex = 0; this.#message = ''; this.requestUpdate(); }
  private startRecommended = (): void => this.useStyle(recommendedStyle(this.#slotId));
  private useStyle(style: MaterialStyle): void { this.setSlotStyle(cloneStyle(style)); this.#layerIndex = 0; }
  private updateStyle(style: MaterialStyle): void { const parsed = parseMaterialStyle(style); parsed ? this.setSlotStyle(parsed) : this.setMessage('That combination is outside the safe material limits.'); }
  private updateResolution(resolution: number): void { const style = this.#draft.materials[this.#slotId]; if (style && (resolution === 16 || resolution === 32 || resolution === 64)) this.updateStyle({ ...style, program: { ...style.program, resolution } }); }
  private replaceLayer(style: MaterialStyle, layer: MaterialLayer): void { const layers = style.program.layers.map((entry, index) => index === this.#layerIndex ? layer : entry); this.updateStyle({ ...style, program: { ...style.program, layers } }); }
  private addLayer = (): void => { const style = this.#draft.materials[this.#slotId] ?? recommendedStyle(this.#slotId); if (style.program.layers.length >= 6) return this.setMessage('A material can use up to 6 layers.'); const layers = [...style.program.layers, createMaterialLayer(this.#addKind)]; this.updateStyle({ ...style, program: { ...style.program, layers } }); this.#layerIndex = layers.length - 1; this.requestUpdate(); };
  private removeLayer = (): void => { const style = this.#draft.materials[this.#slotId]; if (!style) return; const layers = style.program.layers.filter((_, index) => index !== this.#layerIndex); this.updateStyle({ ...style, program: { ...style.program, layers } }); this.#layerIndex = Math.max(0, Math.min(this.#layerIndex, layers.length - 1)); };
  private resetSlot = (): void => { const { [this.#slotId]: _removed, ...materials } = this.#draft.materials; this.#draft = { materials }; this.#layerIndex = 0; this.requestUpdate(); };
  private resetAll = (): void => { this.#draft = { materials: {} }; this.#layerIndex = 0; this.#message = ''; this.requestUpdate(); };
  private setSlotStyle(style: MaterialStyle): void { this.#draft = { materials: { ...this.#draft.materials, [this.#slotId]: style } }; this.#message = ''; this.requestUpdate(); }
  private saveCurrent = (): void => { const style = this.#draft.materials[this.#slotId]; if (!style) return this.setMessage('Customize this part before saving a pattern.'); try { this.#saved = saveMaterialPreset(this.#saveName, style); this.#saveName = ''; this.#message = 'Pattern saved in this browser.'; this.requestUpdate(); } catch (error) { this.setMessage(messageOf(error)); } };
  private deleteSaved(id: string): void { try { this.#saved = removeMaterialPreset(id); this.requestUpdate(); } catch (error) { this.setMessage(messageOf(error)); } }
  private normalizedDraft(): AppearanceComponent | null { const parsed = parseAppearanceComponent(this.#draft); return parsed && Object.keys(parsed.materials).length ? parsed : null; }
  private apply = (): void => { this.dispatchEvent(new CustomEvent('material-studio-apply', { detail: { appearance: this.normalizedDraft() }, bubbles: true, composed: true })); };
  private readonly close = (): void => { this.dispatchEvent(new CustomEvent('material-studio-close', { bubbles: true, composed: true })); };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...this.renderRoot.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const active = this.shadowRoot?.activeElement; const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };
  private setMessage(message: string): void { this.#message = message; this.requestUpdate(); }
}

function cloneAppearance(value: AppearanceComponent | null): AppearanceComponent { return value ? JSON.parse(JSON.stringify(value)) as AppearanceComponent : { materials: {} }; }
function cloneStyle(value: MaterialStyle): MaterialStyle { return JSON.parse(JSON.stringify(value)) as MaterialStyle; }
function recommendedStyle(slotId: string): MaterialStyle { const id = /wood|frame|structure/.test(slotId) ? 'walnut-grain' : /metal|hardware|deck|treads/.test(slotId) ? 'studio-charcoal' : /ceramic|pot/.test(slotId) ? 'clean-ivory' : /foliage/.test(slotId) ? 'leaf-green' : 'fine-linen'; return cloneStyle(materialPreset(id)!.style); }
function sameStyle(a: MaterialStyle, b: MaterialStyle): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function layerName(kind: MaterialLayerKind): string { return kind === 'checker' ? 'Checker' : kind.charAt(0).toUpperCase() + kind.slice(1); }
function slotLabel(definition: ReturnType<typeof getCatalogueObject>, id: string): string { return definition.renderable.materialSlots?.find((slot) => slot.id === id)?.label ?? 'part'; }
function clampNumber(input: HTMLInputElement, min: number, max: number): number { const value = Number(input.value); const safe = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; input.value = String(safe); return safe; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'That pattern could not be saved.'; }
customElements.define('material-studio', MaterialStudio);
