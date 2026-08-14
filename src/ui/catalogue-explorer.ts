import { LitElement, html, nothing } from 'lit';
import {
  CATALOGUE_OBJECT_CATEGORIES,
  getCatalogueObjectCategory,
  listCatalogueObjects,
  type CatalogueObjectId,
} from '../domain/catalogue-registry';
import { FLOOR_FINISHES, WALL_FINISHES } from '../domain/room-finishes';
import { MAX_FLOOR_BASE, MIN_FLOOR_BASE, sortedLevels } from '../domain/room-topology';
import type { EditorState, EntityId, FloorFinishId, RoomEditorTool, RoomLevelId, WallFinishId, WorldState } from '../domain/types';
import type { InventoryItemDto } from '../online/types';
import { teleporterPairs } from '../gameplay/teleporter-editor';
import { catalogueExplorerStyles } from './catalogue-explorer.styles';
import './catalogue-object-preview';
import './hotel-panel';

type Section = 'objects' | 'floor' | 'walls' | 'travel';
type ObjectCategory = 'all' | (typeof CATALOGUE_OBJECT_CATEGORIES)[number]['id'];

export class CatalogueExplorer extends LitElement {
  static override properties = {
    world: { attribute: false },
    editor: { attribute: false },
    inventory: { attribute: false },
    section: { state: true },
    search: { state: true },
    category: { state: true },
  };
  static override styles = catalogueExplorerStyles;

  declare world: WorldState;
  declare editor: EditorState;
  declare inventory: readonly InventoryItemDto[] | null;
  declare section: Section;
  declare search: string;
  declare category: ObjectCategory;
  #inventorySelection = new Map<string, string>();

  constructor() {
    super();
    this.world = { id: '', revision: 0, topology: { levels: [] }, entities: [] };
    this.editor = {
      selectedEntityId: null, tool: 'select', activeLevelId: 'ground', floorFinish: 'wood', wallFinish: 'cream-brick',
      pendingAnchor: null, placementPrototypeId: null, placementRotation: 0, placementAppearance: null,
    };
    this.inventory = null;
    this.section = 'objects';
    this.search = '';
    this.category = 'all';
  }

  override render() {
    return html`
      <hotel-panel heading="Catalogue" tone="blue">
        <button slot="actions" class="close" title="Close Catalogue" @click=${this.close}>×</button>
        <div class="layout">
          <nav class="rail" aria-label="Catalogue sections">
            ${this.sectionButton('objects', '◆', 'Objects')}
            ${this.sectionButton('floor', '▦', 'Floor')}
            ${this.sectionButton('walls', '▥', 'Walls')}
            ${this.sectionButton('travel', '↔', 'Travel')}
          </nav>
          <main class="main">
            ${this.renderBuildHeight()}
            ${this.section === 'objects' ? this.renderObjects()
              : this.section === 'floor' ? this.renderFloor()
                : this.section === 'walls' ? this.renderWalls() : this.renderTravel()}
          </main>
        </div>
      </hotel-panel>
    `;
  }

  private renderObjects() {
    const query = this.search.trim().toLowerCase();
    const inventoryByPrototype = this.availableInventory();
    const objects = listCatalogueObjects().filter((object) => {
      if (this.inventory && !(inventoryByPrototype.get(object.id)?.length)) return false;
      if (this.category !== 'all' && object.category !== this.category) return false;
      if (!query) return true;
      return [object.label, object.description, ...object.tags, getCatalogueObjectCategory(object.category).label]
        .join(' ').toLowerCase().includes(query);
    });
    const placing = this.editor.tool === 'place-prototype'
      ? objects.find((object) => object.id === this.editor.placementPrototypeId)
        ?? listCatalogueObjects().find((object) => object.id === this.editor.placementPrototypeId)
      : undefined;
    return html`
      ${placing ? html`
        <div class="active-tool">
          <strong>Placing ${placing.label}</strong>
          <span>Tap or click the room to place · Esc finishes</span>
          <button class="placement-rotate" @click=${this.rotatePlacement}>↻ Rotate 90°</button>
        </div>
      ` : nothing}
      <div class="toolbar">
        <input type="search" placeholder="Search objects…" .value=${this.search} @input=${this.onSearch} />
        <select .value=${this.category} @change=${this.onCategory} aria-label="Object category">
          <option value="all">All objects</option>
          ${CATALOGUE_OBJECT_CATEGORIES.map((category) => html`<option value=${category.id}>${category.label}</option>`)}
        </select>
      </div>
      <div class="grid">
        ${objects.length ? objects.map((object) => {
          const items = inventoryByPrototype.get(object.id) ?? [];
          const item = this.selectedInventoryItem(object.id, items);
          return html`<div class="object-wrap">
            <button class="object-card ${this.editor.tool === 'place-prototype' && this.editor.placementPrototypeId === object.id ? 'active' : ''}"
              @click=${() => this.placeObject(object.id as CatalogueObjectId, item?.id)} title=${object.description}>
              <span class="preview">
                <catalogue-object-preview .prototypeId=${object.id} .appearance=${item?.appearance ?? null}></catalogue-object-preview>
                <span class="footprint-badge" title="${object.placement.footprint.width}×${object.placement.footprint.depth} floor footprint">${footprintPreview(object.placement.footprint.width, object.placement.footprint.depth)}</span>
              </span>
              <span><span class="name">${object.label}</span><span class="meta">${getCatalogueObjectCategory(object.category).shortLabel} · ${object.placement.footprint.width}×${object.placement.footprint.depth}${this.inventory ? ` · ${items.length} owned${item?.appearance ? ' · styled' : ''}` : ''}</span></span>
            </button>
            ${items.length > 1 ? html`<select class="item-picker" aria-label="Choose owned ${object.label}" .value=${item?.id ?? ''} @change=${(event: Event) => this.chooseInventoryItem(object.id, event)}>${items.map((owned, index) => html`<option value=${owned.id}>${index + 1} · ${owned.appearance ? 'Styled' : 'Original'}</option>`)}</select>` : nothing}
            ${object.renderable.materialSlots?.length ? html`<button class="style-action" @click=${() => this.customizeObject(object.id as CatalogueObjectId, item)}>Style</button>` : nothing}
          </div>`;
        }) : html`<div class="empty">No Catalogue objects match.</div>`}
      </div>
      ${placing ? nothing : html`<div class="hint">${this.inventory ? 'Choose one of your available items, then click where you want it.' : 'Choose an object, then click where you want it. You can keep placing copies until you press Esc.'}</div>`}
    `;
  }

  private renderFloor() {
    return html`
      <div class="section-title">Floor tools</div>
      <div class="tools">
        ${this.tool('floor-shape', 'Shape', 'Build or remove tiles')}
        ${this.tool('floor-raise', 'Raise', 'Lift selected floor')}
        ${this.tool('floor-lower', 'Lower', 'Drop selected floor')}
      </div>
      <div class="section-title" style="margin-top:9px">Floor finishes</div>
      <div class="finishes">
        ${FLOOR_FINISHES.map((finish) => html`
          <button class="finish ${this.editor.tool === 'floor-paint' && this.editor.floorFinish === finish.id ? 'active' : ''}" @click=${() => this.chooseFloorFinish(finish.id)} title=${finish.description}>
            <span class="swatch" style="background:#${finish.color.toString(16).padStart(6, '0')}"></span><span>${finish.label}</span>
          </button>
        `)}
      </div>
      <div class="hint">With <strong>Shape</strong>, drag from a highlighted ghost tile to build outward, or start on existing floor to remove tiles.</div>
    `;
  }

  private renderWalls() {
    return html`
      <div class="section-title">Wall tools</div>
      <div class="tools">
        ${this.tool('wall-shape', 'Draw / remove', 'Drag along floor edges')}
      </div>
      <div class="section-title" style="margin-top:9px">Wall finishes</div>
      <div class="finishes">
        ${WALL_FINISHES.map((finish) => html`
          <button class="finish ${this.editor.tool === 'wall-paint' && this.editor.wallFinish === finish.id ? 'active' : ''}" @click=${() => this.chooseWallFinish(finish.id)} title=${finish.description}>
            <span class="swatch" style="background:#${finish.color.toString(16).padStart(6, '0')}"></span><span>${finish.label}</span>
          </button>
        `)}
      </div>
      <div class="hint">Walls fade only when they would block your view of the room or avatar.</div>
    `;
  }

  private renderTravel() {
    const pairs = teleporterPairs(this.world);
    return html`
      <div class="pairing">
        <div><strong>Linked teleporters</strong><span>Pick entrance A, then exit B. You can switch build heights between clicks.</span></div>
        <button class="action primary" @click=${this.togglePairing}>${this.editor.tool === 'teleport-pair' ? 'Cancel' : 'Link pair'}</button>
      </div>
      ${this.editor.tool === 'teleport-pair' && this.editor.pendingAnchor ? html`
        <div class="hint"><strong>Entrance A:</strong> ${this.levelLabel(this.editor.pendingAnchor.levelId)} ${coord(this.editor.pendingAnchor.position)}. Choose B at any build height.</div>
      ` : nothing}
      <div class="pair-list">
        ${pairs.length ? pairs.map((pair, index) => html`
          <div class="pair" @mouseenter=${() => this.focusPair(pair.first.id)} @mouseleave=${() => this.focusPair(null)}>
            <div><strong>Pair ${index + 1} · A ↔ B</strong><span>${this.endpointLabel(pair.first)} ↔ ${this.endpointLabel(pair.second)}</span></div>
            <button class="remove" @click=${() => this.removePair(pair.first.id)}>Remove</button>
          </div>
        `) : html`<div class="empty">No teleport pairs yet.</div>`}
      </div>
    `;
  }

  private renderBuildHeight() {
    const levels = sortedLevels(this.world.topology);
    const active = levels.find((level) => level.id === this.editor.activeLevelId);
    return html`
      <section class="height-context" aria-label="Build height">
        <div class="height-heading">
          <span><strong>Build height</strong><small>${active ? `${baseHeightLabel(active.baseElevation)} · ${active.cells.length} tile${active.cells.length === 1 ? '' : 's'}` : 'Choose a floor height'}</small></span>
          <button class="action primary add-height" title="Add another floor height" @click=${this.addHeight}>+ New height</button>
        </div>
        <div class="height-levels">
          ${levels.map((level) => html`
            <button class="height-choice ${level.id === this.editor.activeLevelId ? 'active' : ''}" @click=${() => this.setLevel(level.id)}>
              <strong>${baseHeightLabel(level.baseElevation)}</strong><span>${level.cells.length} tile${level.cells.length === 1 ? '' : 's'}</span>
            </button>
          `)}
        </div>
        ${active ? html`
          <div class="height-adjust">
            <span>Floor base height</span>
            <div><button class="action" aria-label="Lower floor base height" @click=${() => this.nudgeHeight(-1)}>−</button><input class="height-input" type="number" step="1" min=${MIN_FLOOR_BASE} max=${MAX_FLOOR_BASE} .value=${String(active.baseElevation)} aria-label="Floor base height in steps" @change=${this.setHeightFromInput}><button class="action" aria-label="Raise floor base height" @click=${() => this.nudgeHeight(1)}>+</button></div>
          </div>
        ` : nothing}
      </section>
    `;
  }

  private sectionButton(section: Section, mark: string, label: string) {
    return html`<button class=${this.section === section ? 'active' : ''} @click=${() => this.changeSection(section)}><span class="mark">${mark}</span>${label}</button>`;
  }
  private tool(tool: RoomEditorTool, label: string, meta: string) {
    return html`<button class="tool-card ${this.editor.tool === tool ? 'active' : ''}" @click=${() => this.setTool(tool)}><strong>${label}</strong>${meta}</button>`;
  }
  private placeObject(prototypeId: CatalogueObjectId, itemInstanceId?: string): void { emit(this, 'catalogue-place-object', { prototypeId, ...(itemInstanceId ? { itemInstanceId } : {}) }); }
  private customizeObject(prototypeId: CatalogueObjectId, item?: InventoryItemDto): void { emit(this, 'catalogue-customize-object', { prototypeId, ...(item ? { itemInstanceId: item.id, appearance: item.appearance } : { appearance: null }) }); }
  private readonly rotatePlacement = (): void => emit(this, 'catalogue-rotate-placement', {});
  private chooseFloorFinish(finish: FloorFinishId): void { emit(this, 'catalogue-floor-finish', { finish }); }
  private chooseWallFinish(finish: WallFinishId): void { emit(this, 'catalogue-wall-finish', { finish }); }
  private setTool(tool: RoomEditorTool): void { emit(this, 'catalogue-tool', { tool }); }
  private readonly togglePairing = (): void => this.setTool(this.editor.tool === 'teleport-pair' ? 'select' : 'teleport-pair');
  private setLevel(levelId: RoomLevelId): void { emit(this, 'catalogue-level', { levelId }); }
  private readonly addHeight = (): void => { this.section = 'floor'; emit(this, 'catalogue-add-height', {}); };
  private nudgeHeight(delta: number): void { emit(this, 'catalogue-nudge-height', { delta }); }
  private readonly setHeightFromInput = (event: Event): void => {
    emit(this, 'catalogue-set-height', { value: Number((event.currentTarget as HTMLInputElement).value) });
  };
  private removePair(id: EntityId): void { emit(this, 'catalogue-remove-teleport', { id }); }
  private focusPair(id: EntityId | null): void { emit(this, 'catalogue-teleport-focus', { id }); }
  private readonly close = (): void => emit(this, 'catalogue-close', {});
  private readonly onSearch = (event: Event): void => { this.search = (event.currentTarget as HTMLInputElement).value; };
  private readonly onCategory = (event: Event): void => { this.category = (event.currentTarget as HTMLSelectElement).value as ObjectCategory; };


  private availableInventory(): Map<string, InventoryItemDto[]> {
    const result = new Map<string, InventoryItemDto[]>();
    for (const item of this.inventory ?? []) {
      if (item.state !== 'inventory') continue;
      result.set(item.prototypeId, [...(result.get(item.prototypeId) ?? []), item]);
    }
    return result;
  }
  private selectedInventoryItem(prototypeId: string, items: readonly InventoryItemDto[]): InventoryItemDto | undefined {
    const selectedId = this.#inventorySelection.get(prototypeId);
    return items.find((item) => item.id === selectedId) ?? items[0];
  }
  private chooseInventoryItem(prototypeId: string, event: Event): void {
    this.#inventorySelection.set(prototypeId, (event.currentTarget as HTMLSelectElement).value);
    this.requestUpdate();
  }

  private changeSection(section: Section): void {
    this.section = section;
    const tool = this.editor.tool;
    if (section === 'objects' && tool !== 'select' && tool !== 'place-prototype') this.setTool('select');
    if (section === 'floor' && !isFloorTool(tool)) this.setTool('floor-shape');
    if (section === 'walls' && !isWallTool(tool)) this.setTool('wall-shape');
    if (section === 'travel' && tool !== 'teleport-pair') this.setTool('select');
  }

  private levelLabel(levelId: RoomLevelId): string {
    const level = this.world.topology.levels.find((entry) => entry.id === levelId);
    return level ? baseHeightLabel(level.baseElevation) : 'Unknown height';
  }

  private endpointLabel(entity: { components: { transform: { levelId: string; position: { x: number; z: number } } } }): string {
    const transform = entity.components.transform;
    return `${this.levelLabel(transform.levelId)} ${coord(transform.position)}`;
  }
}

customElements.define('catalogue-explorer', CatalogueExplorer);

function emit<T>(target: HTMLElement, name: string, detail: T): void {
  target.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
}
function footprintPreview(width: number, depth: number) {
  return html`<span class="footprint" style="grid-template-columns:repeat(${width},12px)">${Array.from({ length: width * depth }, () => html`<i></i>`)}</span>`;
}
function coord(position: { x: number; z: number }): string { return `${position.x},${position.z}`; }
function baseHeightLabel(value: number): string { return value === 0 ? 'ground level' : `${value > 0 ? '+' : ''}${value} steps`; }
function isFloorTool(tool: RoomEditorTool): boolean { return ['floor-shape', 'floor-paint', 'floor-raise', 'floor-lower'].includes(tool); }
function isWallTool(tool: RoomEditorTool): boolean { return tool === 'wall-shape' || tool === 'wall-paint'; }
