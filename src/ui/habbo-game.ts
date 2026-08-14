import { LitElement, html, nothing } from 'lit';
import {
  capabilitySummary,
  footprintLabel,
  getCatalogueObject,
  getCatalogueObjectCategory,
  isCatalogueObjectId,
  type CatalogueObjectId,
} from '../domain/catalogue-registry';
import { entityById } from '../domain/entity-queries';
import { GameStore } from '../domain/game-store';
import type { AppearanceComponent } from '../domain/material-design';
import { roomLevel } from '../domain/room-topology';
import type { EntityId, FloorFinishId, RoomEditorTool, RoomLevelId, WallFinishId, WorldState } from '../domain/types';
import { nextRotation } from '../domain/world-state';
import { addFloorHeight, nudgeActiveFloorBase, setActiveFloorBase } from '../gameplay/room-build-operations';
import { removeTeleporterPair } from '../gameplay/teleporter-editor';
import { CAMERA_TURN_MODES, isCameraTurnMode, type CameraTurnMode } from '../rendering/isometric-camera';
import { RoomScene, type RoomInteractionMode } from '../rendering/room-scene';
import type { RoomGameNetwork } from '../online/game-network';
import type { InventoryItemDto, RoomServerMessage } from '../online/types';
import './catalogue-explorer';
import './material-studio';
import './selection-inspector';
import { habboGameStyles } from './habbo-game.styles';
import { capabilityUiLabel, roomHelpText } from './habbo-game-copy';
import { applyMaterialStudioTarget, selectedMaterialStudioTarget, type MaterialStudioTarget } from './habbo-material-studio';
import { applyOnlineServerMessage, forwardPredictedInventoryPlacement } from './habbo-game-online';
export class HabboGame extends LitElement {
  static override properties = {
    initialWorld: { attribute: false }, network: { attribute: false }, inventory: { attribute: false },
    roomName: { type: String }, roomSubtitle: { type: String }, canEdit: { type: Boolean },
  };
  static override styles = habboGameStyles;
  declare initialWorld: WorldState | null;
  declare network: RoomGameNetwork | null;
  declare inventory: readonly InventoryItemDto[] | null;
  declare roomName: string;
  declare roomSubtitle: string;
  declare canEdit: boolean;
  #store = new GameStore();
  #scene: RoomScene | null = null;
  #unsubscribeWorld: (() => void) | null = null;
  #unsubscribeEditor: (() => void) | null = null;
  #message = '';
  #messageTimer = 0;
  #cameraTurn: CameraTurnMode = 'snap-90';
  #interactionMode: RoomInteractionMode = 'play';
  #catalogueOpen = true;
  #viewMenuOpen = false;
  #pendingPlacementItemId: string | null = null;
  #presenceCount = 1;
  #materialStudio: MaterialStudioTarget | null = null;
  constructor() {
    super();
    this.initialWorld = null; this.network = null; this.inventory = null;
    this.roomName = 'Tile House'; this.roomSubtitle = 'Room Lab'; this.canEdit = true;
  }
  override firstUpdated(): void {
    if (this.initialWorld) this.#store = new GameStore(this.initialWorld);
    this.#unsubscribeWorld = this.#store.subscribe((_state, change) => { this.handleLocalWorldChange(change); this.requestUpdate(); });
    this.#unsubscribeEditor = this.#store.subscribeEditor(() => this.requestUpdate());
    const canvas = this.renderRoot.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Room canvas was not created.');
    this.#scene = new RoomScene(canvas, this.#store, (message) => this.showMessage(message), this.network);
    this.#scene.setCameraTurnMode(this.#cameraTurn);
    this.#scene.setInteractionMode(this.#interactionMode);
    this.#scene.start();
  }

  override disconnectedCallback(): void {
    this.#scene?.dispose();
    this.#scene = null;
    this.#unsubscribeWorld?.();
    this.#unsubscribeEditor?.();
    window.clearTimeout(this.#messageTimer);
    super.disconnectedCallback();
  }

  override render() {
    const state = this.#store.state;
    const editor = this.#store.editorState;
    const selected = editor.selectedEntityId ? entityById(state, editor.selectedEntityId) : undefined;
    const selectedDefinition = selected && isCatalogueObjectId(selected.prototypeId) ? getCatalogueObject(selected.prototypeId) : null;
    const selectedLevel = selected ? roomLevel(state.topology, selected.components.transform.levelId) : undefined;
    const selectedCapabilities = selectedDefinition
      ? capabilitySummary(selectedDefinition).filter((capability) => capability.status === 'implemented')
      : [];
    const catalogueVisible = this.#interactionMode === 'edit' && this.#catalogueOpen;
    const floorCells = state.topology.levels.reduce((sum, level) => sum + level.cells.length, 0);
    const activeLevel = state.topology.levels.find((level) => level.id === editor.activeLevelId);
    return html`
      <div class="game ${this.#interactionMode} ${catalogueVisible ? 'editor-open' : ''}">
        <canvas tabindex="0" aria-label="Playable and editable isometric hotel room"></canvas>
        <div class="topbar">
          <div class="room-card">
            <div class="badge">H</div>
            <div class="room-meta">
              <strong>${this.roomName} • ${this.roomSubtitle}</strong>
              <span>${this.#presenceCount} here · ${floorCells} floor tiles</span>
            </div>
          </div>
          <div class="controls" aria-label="Camera and room controls">
            ${this.canEdit ? html`<button class="mode-btn ${this.#interactionMode}" @click=${this.toggleInteractionMode}
              title=${this.#interactionMode === 'play' ? 'Edit this room' : 'Finish editing and return to play'}>
              ${this.#interactionMode === 'play' ? '✦ Edit room' : '✓ Done'}
            </button>` : nothing}
            ${this.canEdit && this.#interactionMode === 'edit' ? html`
              <button class="icon-btn catalogue-open ${catalogueVisible ? 'active' : ''}" @click=${this.toggleCatalogue} title="Open Catalogue">Catalogue</button>
            ` : nothing}
            <div class="view-control">
              <button class="icon-btn view-open ${this.#viewMenuOpen ? 'active' : ''}" @click=${this.toggleViewMenu} aria-expanded=${this.#viewMenuOpen}>View ▾</button>
              ${this.#viewMenuOpen ? html`
                <div class="view-menu">
                  <label><span>Camera turning</span>
                    <select class="turn-select" aria-label="Camera turn mode" .value=${this.#cameraTurn} @change=${this.changeCameraTurn}>
                      ${CAMERA_TURN_MODES.map((mode) => html`<option value=${mode}>${turnLabel(mode)}</option>`)}
                    </select>
                  </label>
                  <div class="view-rotate-row" aria-label="Rotate camera">
                    <button @pointerdown=${(event: PointerEvent) => this.beginCameraTurn(event, -1)} @pointerup=${(event: PointerEvent) => this.endCameraTurn(event, -1)} @pointercancel=${(event: PointerEvent) => this.endCameraTurn(event, -1)}>↶ Left</button>
                    <button @pointerdown=${(event: PointerEvent) => this.beginCameraTurn(event, 1)} @pointerup=${(event: PointerEvent) => this.endCameraTurn(event, 1)} @pointercancel=${(event: PointerEvent) => this.endCameraTurn(event, 1)}>Right ↷</button>
                  </div>
                  <div class="view-hint">Q / E rotate the camera · wheel or pinch zooms</div>
                </div>
              ` : nothing}
            </div>
          </div>
        </div>

        ${this.#message ? html`<div class="toast">${this.#message}</div>` : nothing}
        <div class="help"><span class="tile-note">${activeLevel ? floorHeightLabel(activeLevel.baseElevation) : 'Room'}.</span> ${this.helpText()}</div>

        ${catalogueVisible ? html`
          <catalogue-explorer class="catalogue" .world=${state} .editor=${editor} .inventory=${this.inventory}
            @catalogue-place-object=${this.onCataloguePlaceObject}
            @catalogue-customize-object=${this.onCatalogueCustomizeObject}
            @catalogue-rotate-placement=${this.rotateCurrent}
            @catalogue-tool=${this.onCatalogueTool}
            @catalogue-floor-finish=${this.onCatalogueFloorFinish}
            @catalogue-wall-finish=${this.onCatalogueWallFinish}
            @catalogue-level=${this.onCatalogueLevel}
            @catalogue-add-height=${this.onCatalogueAddHeight}
            @catalogue-nudge-height=${this.onCatalogueNudgeHeight}
            @catalogue-set-height=${this.onCatalogueSetHeight}
            @catalogue-remove-teleport=${this.onCatalogueRemoveTeleport}
            @catalogue-teleport-focus=${this.onCatalogueTeleportFocus}
            @catalogue-close=${this.closeCatalogue}></catalogue-explorer>
        ` : nothing}

        ${this.#interactionMode === 'edit' && selected && selectedDefinition && !this.#materialStudio ? html`
          <selection-inspector class="selection-panel" .label=${selectedDefinition.label}
            .meta=${`${getCatalogueObjectCategory(selectedDefinition.category).label} · ${floorHeightLabel(selectedLevel?.baseElevation)} · ${footprintLabel(selected.prototypeId)} footprint`}
            .capabilities=${selectedCapabilities.map((capability) => ({ label: capabilityUiLabel(capability.key, capability.label) }))}
            .customizable=${Boolean(selectedDefinition.renderable.materialSlots?.length)}
            @selection-rotate=${this.rotateCurrent} @selection-customize=${this.customizeSelected} @selection-pickup=${this.removeSelected}></selection-inspector>
        ` : nothing}
        ${this.#materialStudio ? html`<material-studio class="material-studio" .prototypeId=${this.#materialStudio.prototypeId}
          .appearance=${this.#materialStudio.appearance} .actionLabel=${this.#materialStudio.kind === 'placement' ? 'Use style & place' : 'Apply style'}
          @material-studio-apply=${this.applyMaterialStudio} @material-studio-close=${this.closeMaterialStudio}></material-studio>` : nothing}
      </div>
    `;
  }

  applyServerMessage(message: RoomServerMessage): void {
    applyOnlineServerMessage(message, {
      store: this.#store, scene: this.#scene, network: this.network,
      showMessage: (text) => this.showMessage(text),
      setPresenceCount: (count) => { this.#presenceCount = count; this.requestUpdate(); },
      requestInventoryRefresh: () => this.dispatchEvent(new CustomEvent('inventory-refresh', { bubbles: true, composed: true })),
    });
  }

  debugScreenPointForPrototype(prototypeId: string): { x: number; y: number } | null { return this.#scene?.debugScreenPointForPrototype(prototypeId) ?? null; }
  debugScreenPointForCell(levelId: RoomLevelId, x: number, z: number): { x: number; y: number } | null { return this.#scene?.debugScreenPointForCell({ levelId, position: { x, z } }) ?? null; }
  private handleLocalWorldChange(change: import('../domain/types').WorldChange): void {
    const result = forwardPredictedInventoryPlacement(change, this.network, this.#pendingPlacementItemId);
    if (!result.consumed) return;
    this.#pendingPlacementItemId = null;
    this.#store.dispatchEditor({ type: 'tool/set', tool: 'select' });
  }

  private helpText() { return roomHelpText(this.#interactionMode, this.#cameraTurn, this.#store.editorState, this.#store.editorState.selectedEntityId !== null); }

  private readonly toggleInteractionMode = (): void => {
    this.#interactionMode = this.#interactionMode === 'play' ? 'edit' : 'play';
    this.#viewMenuOpen = false;
    if (this.#interactionMode === 'edit') {
      this.#catalogueOpen = true;
      this.#store.dispatchEditor({ type: 'tool/set', tool: 'select' });
    }
    this.#scene?.setInteractionMode(this.#interactionMode);
    this.requestUpdate();
  };
  private readonly toggleCatalogue = (): void => { this.#catalogueOpen = !this.#catalogueOpen; this.requestUpdate(); };
  private readonly toggleViewMenu = (): void => { this.#viewMenuOpen = !this.#viewMenuOpen; this.requestUpdate(); };
  private readonly closeCatalogue = (): void => { this.#catalogueOpen = false; this.#scene?.setTeleportFocus(null); this.requestUpdate(); };

  private readonly onCataloguePlaceObject = (event: Event): void => {
    const { prototypeId, itemInstanceId } = (event as CustomEvent<{ prototypeId: CatalogueObjectId; itemInstanceId?: string }>).detail;
    const item = itemInstanceId ? this.inventory?.find((candidate) => candidate.id === itemInstanceId) : undefined;
    this.#pendingPlacementItemId = itemInstanceId ?? null;
    this.#store.dispatchEditor({ type: 'placement-prototype/set', prototypeId });
    this.#store.dispatchEditor({ type: 'placement-appearance/set', appearance: item?.appearance ?? null });
    this.#store.dispatchEditor({ type: 'tool/set', tool: 'place-prototype' });
  };
  private readonly onCatalogueCustomizeObject = (event: Event): void => {
    const detail = (event as CustomEvent<{ prototypeId: CatalogueObjectId; itemInstanceId?: string; appearance: AppearanceComponent | null }>).detail;
    this.#materialStudio = { kind: 'placement', ...detail };
    this.#catalogueOpen = false;
    this.requestUpdate();
  };
  private readonly customizeSelected = (): void => {
    this.#materialStudio = selectedMaterialStudioTarget(this.#store);
    if (this.#materialStudio) { this.#catalogueOpen = false; this.requestUpdate(); }
  };
  private readonly applyMaterialStudio = (event: Event): void => {
    const target = this.#materialStudio;
    if (!target) return;
    const appearance = (event as CustomEvent<{ appearance: AppearanceComponent | null }>).detail.appearance;
    const result = applyMaterialStudioTarget(target, appearance, this.#store, this.network);
    if (result.pendingItemId !== undefined) this.#pendingPlacementItemId = result.pendingItemId;
    this.#materialStudio = null;
    result.message ? this.showMessage(result.message) : this.requestUpdate();
  };
  private readonly closeMaterialStudio = (): void => {
    const returnToCatalogue = this.#materialStudio?.kind === 'placement';
    this.#materialStudio = null;
    if (returnToCatalogue) this.#catalogueOpen = true;
    this.requestUpdate();
  };
  private readonly onCatalogueTool = (event: Event): void => { this.#store.dispatchEditor({ type: 'tool/set', tool: (event as CustomEvent<{ tool: RoomEditorTool }>).detail.tool }); };
  private readonly onCatalogueFloorFinish = (event: Event): void => {
    const { finish } = (event as CustomEvent<{ finish: FloorFinishId }>).detail;
    this.#store.dispatchEditor({ type: 'floor-finish/set', finish });
    this.#store.dispatchEditor({ type: 'tool/set', tool: 'floor-paint' });
  };
  private readonly onCatalogueWallFinish = (event: Event): void => {
    const { finish } = (event as CustomEvent<{ finish: WallFinishId }>).detail;
    this.#store.dispatchEditor({ type: 'wall-finish/set', finish });
    this.#store.dispatchEditor({ type: 'tool/set', tool: 'wall-paint' });
  };
  private readonly onCatalogueLevel = (event: Event): void => { this.#store.dispatchEditor({ type: 'active-level/set', levelId: (event as CustomEvent<{ levelId: RoomLevelId }>).detail.levelId }); };
  private readonly onCatalogueAddHeight = (): void => {
    const level = addFloorHeight(this.#store);
    this.showMessage(level ? `${floorHeightLabel(level.baseElevation)} ready. Click a ghost tile to start building there.` : 'Could not add another floor height.');
  };
  private readonly onCatalogueNudgeHeight = (event: Event): void => { this.showBuildError(nudgeActiveFloorBase(this.#store, (event as CustomEvent<{ delta: number }>).detail.delta)); };
  private readonly onCatalogueSetHeight = (event: Event): void => { this.showBuildError(setActiveFloorBase(this.#store, (event as CustomEvent<{ value: number }>).detail.value)); };
  private readonly onCatalogueRemoveTeleport = (event: Event): void => {
    const id = (event as CustomEvent<{ id: EntityId }>).detail.id;
    if (removeTeleporterPair(this.#store, id)) { this.network?.removeTeleporter(id); this.showMessage('Teleport pair removed.'); }
  };
  private readonly onCatalogueTeleportFocus = (event: Event): void => { this.#scene?.setTeleportFocus((event as CustomEvent<{ id: EntityId | null }>).detail.id); };

  private readonly rotateCurrent = (): void => {
    const editor = this.#store.editorState;
    if (editor.tool === 'place-prototype') {
      this.#store.dispatchEditor({ type: 'placement-rotation/set', rotation: nextRotation(editor.placementRotation) });
      return;
    }
    const entity = editor.selectedEntityId ? entityById(this.#store.state, editor.selectedEntityId) : undefined;
    if (!entity || !isCatalogueObjectId(entity.prototypeId)) return;
    const result = this.#store.dispatch({ type: 'transform/rotate', id: entity.id, rotation: nextRotation(entity.components.transform.rotation) });
    if (!result.accepted) this.showMessage('That rotation does not fit here.');
  };
  private readonly removeSelected = (): void => {
    const id = this.#store.editorState.selectedEntityId;
    const entity = id ? entityById(this.#store.state, id) : undefined;
    if (!entity || !isCatalogueObjectId(entity.prototypeId)) return;
    const result = this.#store.dispatch({ type: 'entity/remove', id: entity.id });
    if (result.accepted) this.network?.pickup(entity.id);
    if (!result.accepted) this.showMessage('Move anything stacked on this object before picking it up.');
  };

  private readonly changeCameraTurn = (event: Event): void => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!isCameraTurnMode(value)) return;
    this.#cameraTurn = value; this.#scene?.setCameraTurnMode(value); this.requestUpdate();
  };
  private beginCameraTurn(event: PointerEvent, direction: -1 | 1): void {
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId); this.#scene?.beginCameraTurn(direction);
  }
  private endCameraTurn(event: PointerEvent, direction: -1 | 1): void {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    this.#scene?.endCameraTurn(direction);
  }

  private showMessage(message: string): void {
    this.#message = message; this.requestUpdate(); window.clearTimeout(this.#messageTimer);
    this.#messageTimer = window.setTimeout(() => { this.#message = ''; this.requestUpdate(); }, 2200);
  }
  private showBuildError(result: { accepted: boolean; message?: string }): void { if (!result.accepted && result.message) this.showMessage(result.message); }
}


customElements.define('habbo-game', HabboGame);
function floorHeightLabel(value?: number): string { return value === undefined || value === 0 ? 'Ground' : `${value > 0 ? '+' : ''}${value} steps`; }
function turnLabel(mode: CameraTurnMode): string { return mode === 'free' ? 'Free rotation' : mode === 'snap-45' ? '45° steps' : '90° steps'; }
