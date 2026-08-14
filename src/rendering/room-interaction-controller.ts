import * as THREE from 'three';
import { isCatalogueObjectId } from '../domain/catalogue-registry';
import { entityById } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import type { InteractionAccessProvider } from '../domain/interaction-types';
import { FLOOR_STEP_HEIGHT, floorWorldY } from '../domain/room-topology';
import { entityElevationSteps, spatialProfileForEntity } from '../domain/spatial-index';
import type { CellAddress, EditorState, EntityId, GridPoint, WorldEntity, WorldState } from '../domain/types';
import { centeredCellForPoint, resolveSupportedPlacement } from '../domain/world-placement';
import { ActorMotionSystem } from '../gameplay/actor-motion-system';
import { InteractionDispatcher } from '../gameplay/interaction-dispatcher';
import { resolveTargetAction } from '../gameplay/targeting-system';
import type { RoomGameNetwork } from '../online/game-network';
import { CameraPointerControls } from './camera-pointer-controls';
import { ObjectMotion } from './object-motion';
import { IsometricCameraController } from './isometric-camera';
import { RoomBuildController } from './room-build-controller';
import { RoomPicker } from './room-picking';
import { createSelectionMarker, disposeSelectionMarker as disposeMarker, updateSelectionMarker as positionSelectionMarker } from './selection-marker';
import { createTileHoverIndicator } from './tile-hover-indicator';

export type RoomInteractionMode = 'play' | 'edit';

interface PlacementDrag {
  readonly id: EntityId;
  readonly candidate: CellAddress;
  readonly elevation: number;
  readonly valid: boolean;
  readonly started: boolean;
}
export class RoomInteractionController {
  readonly #canvas: HTMLCanvasElement;
  readonly #scene: THREE.Scene;
  readonly #store: GameStore;
  readonly #motion: ObjectMotion;
  readonly #objects: ReadonlyMap<EntityId, THREE.Group>;
  readonly #player: ActorMotionSystem;
  readonly #accessProvider: InteractionAccessProvider;
  readonly #network: RoomGameNetwork | null;
  readonly #syncWorld: () => void;
  readonly #notify: (message: string) => void;
  readonly #controls: CameraPointerControls;
  readonly #interactions: InteractionDispatcher;
  readonly #picker: RoomPicker;
  readonly #build: RoomBuildController;
  readonly #tileHover = createTileHoverIndicator();
  #selectionMarker: THREE.Mesh | null = null;
  #placement: PlacementDrag | null = null;
  #mode: RoomInteractionMode = 'play';

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    camera: IsometricCameraController,
    store: GameStore,
    motion: ObjectMotion,
    objects: ReadonlyMap<EntityId, THREE.Group>,
    architecture: THREE.Group,
    player: ActorMotionSystem,
    interactions: InteractionDispatcher,
    accessProvider: InteractionAccessProvider,
    network: RoomGameNetwork | null,
    syncWorld: () => void,
    notify: (message: string) => void,
  ) {
    this.#canvas = canvas;
    this.#scene = scene;
    this.#store = store;
    this.#motion = motion;
    this.#objects = objects;
    this.#player = player;
    this.#interactions = interactions;
    this.#accessProvider = accessProvider;
    this.#network = network;
    this.#syncWorld = syncWorld;
    this.#notify = notify;
    this.#picker = new RoomPicker(canvas, camera, architecture);
    this.#build = new RoomBuildController(canvas, scene, store, this.#picker, notify);
    scene.add(this.#tileHover);
    this.#controls = new CameraPointerControls(
      canvas,
      camera,
      () => true,
      (x, y) => this.primaryActionAt(x, y),
      {
        begin: (x, y) => this.beginPrimaryDrag(x, y),
        move: (x, y) => this.movePrimaryDrag(x, y),
        end: (x, y) => this.endPrimaryDrag(x, y),
        cancel: () => this.cancelPrimaryDrag(),
      },
    );
    canvas.addEventListener('pointermove', this.onPointerHover);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  get mode(): RoomInteractionMode { return this.#mode; }

  setMode(mode: RoomInteractionMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.clearHover();
    this.cancelPrimaryDrag();
    if (mode === 'play') this.#store.dispatchEditor({ type: 'selection/set', id: null });
    else this.#player.cancelMovement();
  }

  syncSelection(state: WorldState, editor: EditorState): void {
    this.#build.sync();
    this.disposeSelectionMarker();
    if (editor.tool !== 'select' || this.#mode !== 'edit') return;
    const entity = editor.selectedEntityId ? entityById(state, editor.selectedEntityId) : undefined;
    if (!entity || !isCatalogueObjectId(entity.prototypeId)) return;
    const transform = entity.components.transform;
    if (transform.levelId !== editor.activeLevelId) return;
    const fp = spatialProfileForEntity(entity)?.footprint;
    if (!fp) return;
    const marker = createSelectionMarker(fp.width * 0.94, fp.depth * 0.94);
    positionSelectionMarker(marker, state, addressFor(entity), fp.width, fp.depth, entityElevationSteps(entity), true);
    this.#selectionMarker = marker;
    this.#scene.add(marker);
  }

  dispose(): void {
    this.#controls.dispose();
    this.#canvas.removeEventListener('pointermove', this.onPointerHover);
    this.#canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.disposeSelectionMarker();
    this.#build.dispose();
    this.#scene.remove(this.#tileHover);
  }

  private beginPrimaryDrag(clientX: number, clientY: number): boolean {
    if (this.#mode !== 'edit') return false;
    if (this.#store.editorState.tool !== 'select') return this.#build.beginStroke(clientX, clientY);
    const id = this.#picker.entityIdAt(this.#objects, clientX, clientY);
    const entity = id ? entityById(this.#store.state, id) : undefined;
    if (!entity || !isCatalogueObjectId(entity.prototypeId)) return false;
    if (entity.components.transform.levelId !== this.#store.editorState.activeLevelId) return false;
    this.#store.dispatchEditor({ type: 'selection/set', id: entity.id });
    this.#placement = { id: entity.id, candidate: addressFor(entity), elevation: entityElevationSteps(entity), valid: true, started: false };
    return true;
  }

  private movePrimaryDrag(clientX: number, clientY: number): void {
    if (!this.#placement) {
      this.#build.moveStroke(clientX, clientY);
      return;
    }
    let placement = this.#placement;
    if (!placement.started) { placement = { ...placement, started: true }; this.#placement = placement; this.#canvas.dataset.dragActive = 'true'; this.#motion.setHeld(placement.id, true); this.#network?.beginManipulation(placement.id); }
    const entity = entityById(this.#store.state, placement.id);
    if (!entity) return;
    const hit = this.#picker.surfaceAt(clientX, clientY, this.#store.state.topology, this.#store.editorState.activeLevelId);
    if (!hit) return;
    const fp = spatialProfileForEntity(entity)?.footprint;
    if (!fp) return;
    const position = centeredCellForPoint({ x: hit.point.x, z: hit.point.z }, fp);
    const candidate: CellAddress = { levelId: hit.cell.levelId, position };
    const candidateEntity: WorldEntity = {
      ...entity,
      components: {
        ...entity.components,
        transform: { ...entity.components.transform, levelId: candidate.levelId, position: candidate.position },
      },
    };
    const resolved = resolveSupportedPlacement(this.#store.state, candidateEntity);
    const elevation = resolved?.components.transform.elevation ?? 0;
    const valid = Boolean(resolved); this.#canvas.dataset.dragCandidate = `${candidate.position.x},${candidate.position.z}`; this.#canvas.dataset.dragValid = String(valid);
    this.#placement = { id: placement.id, candidate, elevation, valid, started: true };
    this.#motion.setPlacementTarget(
      placement.id,
      position.x + fp.width / 2,
      floorWorldY(this.#store.state.topology, candidate) + elevation * FLOOR_STEP_HEIGHT,
      position.z + fp.depth / 2,
    );
    this.updateSelectionMarker(candidate, fp.width, fp.depth, elevation, valid);
    if (resolved) this.#network?.updateManipulation(placement.id, resolved.components.transform, 0.28);
  }

  private endPrimaryDrag(clientX: number, clientY: number): void {
    if (!this.#placement) {
      this.#build.endStroke(clientX, clientY);
      return;
    }
    if (!this.#placement.started) { this.#placement = null; return; }
    this.movePrimaryDrag(clientX, clientY);
    const placement = this.#placement;
    this.#placement = null; delete this.#canvas.dataset.dragActive; delete this.#canvas.dataset.dragCandidate; delete this.#canvas.dataset.dragValid;
    this.#motion.setHeld(placement.id, false);
    if (placement.valid) {
      const result = this.#store.dispatch({ type: 'transform/move', id: placement.id, address: placement.candidate, elevation: placement.elevation });
      if (!result.accepted) this.#notify('Move anything stacked on this object before moving it.');
      else {
        const entity = entityById(this.#store.state, placement.id);
        if (entity) this.#network?.commitManipulation(placement.id, entity.components.transform);
      }
    } else this.#network?.cancelManipulation(placement.id);
    this.#syncWorld();
  }

  private cancelPrimaryDrag(): void {
    const placement = this.#placement;
    this.#placement = null; delete this.#canvas.dataset.dragActive; delete this.#canvas.dataset.dragCandidate; delete this.#canvas.dataset.dragValid;
    if (placement?.started) { this.#motion.setHeld(placement.id, false); this.#network?.cancelManipulation(placement.id); }
    this.#build.cancelStroke();
    this.#syncWorld();
  }

  private primaryActionAt(clientX: number, clientY: number): void {
    if (this.#mode === 'edit') {
      if (this.#build.primaryAction(clientX, clientY)) return;
      if (this.#store.editorState.tool === 'select') {
        const id = this.#picker.entityIdAt(this.#objects, clientX, clientY);
        const entity = id ? entityById(this.#store.state, id) : undefined;
        const selectable = entity && isCatalogueObjectId(entity.prototypeId)
          && entity.components.transform.levelId === this.#store.editorState.activeLevelId;
        this.#store.dispatchEditor({ type: 'selection/set', id: selectable ? entity.id : null });
      }
      return;
    }
    const hit = this.#picker.surfaceAt(clientX, clientY, this.#store.state.topology);
    const targetId = this.#picker.entityIdAt(this.#objects, clientX, clientY);
    const access = this.#accessProvider(this.#player.actorId, this.#store.state);
    const action = resolveTargetAction({
      state: this.#store.state,
      actorId: this.#player.actorId,
      ...(targetId ? { targetId } : {}),
      ...(hit ? { cell: hit.cell, point: { x: hit.point.x, z: hit.point.z } } : {}),
      access,
    });
    if (action.type === 'interaction') this.#interactions.execute(action.intent);
    else if (action.type === 'walk' && this.#player.moveTo(action.cell, this.#store.state)) this.#network?.move(action.cell);
  }

  private updateSelectionMarker(address: CellAddress, width: number, depth: number, elevation: number, valid: boolean): void {
    if (this.#selectionMarker) positionSelectionMarker(this.#selectionMarker, this.#store.state, address, width, depth, elevation, valid);
  }

  private readonly onPointerHover = (event: PointerEvent): void => {
    if (this.#placement) return void (this.#tileHover.visible = false);
    if (this.#mode === 'edit') {
      this.#tileHover.visible = false;
      if (this.#build.updateHover(event.clientX, event.clientY)) return;
      return this.clearHover();
    }
    const hit = this.#picker.surfaceAt(event.clientX, event.clientY, this.#store.state.topology);
    if (!hit) return this.clearHover();
    let hoverCell = hit.cell;
    let action = 'walk';
    const targetId = this.#picker.entityIdAt(this.#objects, event.clientX, event.clientY);
    const target = targetId ? entityById(this.#store.state, targetId) : undefined;
    const access = this.#accessProvider(this.#player.actorId, this.#store.state);
    const targetAction = resolveTargetAction({
      state: this.#store.state,
      actorId: this.#player.actorId,
      ...(targetId ? { targetId } : {}),
      cell: hit.cell,
      point: { x: hit.point.x, z: hit.point.z },
      access,
    });
    if (targetAction.type === 'interaction') {
      action = targetAction.intent.kind;
      if (targetAction.intent.kind === 'sit') hoverCell = targetAction.intent.seat.cell;
    } else action = targetAction.type;
    if (target && isCatalogueObjectId(target.prototypeId)) this.#canvas.dataset.hoverObjectKind = target.prototypeId;
    else delete this.#canvas.dataset.hoverObjectKind;
    this.#tileHover.position.set(
      hoverCell.position.x + 0.5,
      floorWorldY(this.#store.state.topology, hoverCell),
      hoverCell.position.z + 0.5,
    );
    this.#tileHover.visible = true;
    this.#canvas.dataset.hoverCell = `${hoverCell.position.x},${hoverCell.position.z}`;
    this.#canvas.dataset.hoverLevel = hoverCell.levelId;
    this.#canvas.dataset.hoverAction = action;
  };

  private readonly onPointerLeave = (): void => this.clearHover();

  private clearHover(): void {
    this.#tileHover.visible = false;
    this.#build.clearHover();
    delete this.#canvas.dataset.hoverCell;
    delete this.#canvas.dataset.hoverLevel;
    delete this.#canvas.dataset.hoverAction;
    delete this.#canvas.dataset.hoverObjectKind;
  }

  private disposeSelectionMarker(): void {
    if (!this.#selectionMarker) return;
    this.#scene.remove(this.#selectionMarker);
    disposeMarker(this.#selectionMarker);
    this.#selectionMarker = null;
  }
}

function addressFor(entity: WorldEntity): CellAddress {
  const transform = entity.components.transform;
  return { levelId: transform.levelId, position: transform.position };
}
