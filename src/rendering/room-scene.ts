import * as THREE from 'three';
import { entityById, furniEntities, LOCAL_PLAYER_ID } from '../domain/entity-queries';
import type { GameStore } from '../domain/game-store';
import { materialAppearanceKey } from '../domain/material-design';
import { floorWorldY, roomCellAt, topologyBounds } from '../domain/room-topology';
import { spatialProfileForEntity } from '../domain/spatial-index';
import { translatedStackTransforms } from '../domain/stack-support';
import type { CellAddress, EntityId, RoomTopology, TransformComponent, WorldEntity, WorldState } from '../domain/types';
import { ActorMotionSystem } from '../gameplay/actor-motion-system';
import { createPlayerInteractionDispatcher } from '../gameplay/player-interactions';
import { seatPoseForVisualTransform } from '../gameplay/seating-system';
import { createRoomSimulation, type SimulationPipeline } from '../gameplay/simulation-pipeline';
import type { RoomGameNetwork } from '../online/game-network';
import { disposeRenderTree } from './dispose-render-tree';
import { createObjectVisual } from './object-factory';
import { ObjectMotion } from './object-motion';
import { HumanAvatar } from './human-avatar';
import { IsometricCameraController, type CameraTurnMode } from './isometric-camera';
import { RoomArchitectureRenderer } from './room-geometry';
import { RoomKeyboardControls } from './room-keyboard-controls';
import { addRoomLighting } from './room-lighting';
import { RoomInteractionController, type RoomInteractionMode } from './room-interaction-controller';
import { RemoteActorsRenderer } from './remote-actors-renderer';
import { forwardRoomNetworkChange, roomAccessProvider, syncRoomDiagnostics } from './room-network-bridge';
import { projectWorldPointToCanvas } from './screen-projection';
import { TeleportLinkRenderer } from './teleport-link-renderer';
import { WallVisibilitySystem } from './wall-visibility';
export type { RoomInteractionMode } from './room-interaction-controller';
export class RoomScene {
  readonly #canvas: HTMLCanvasElement;
  readonly #store: GameStore;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #architecture: RoomArchitectureRenderer;
  readonly #teleportLinks = new TeleportLinkRenderer();
  readonly #cameraController: IsometricCameraController;
  readonly #interaction: RoomInteractionController;
  readonly #keyboard: RoomKeyboardControls;
  readonly #wallVisibility: WallVisibilitySystem;
  readonly #objectRoot = new THREE.Group();
  readonly #motion = new ObjectMotion();
  readonly #human = new HumanAvatar(3);
  readonly #player: ActorMotionSystem;
  readonly #remotes: RemoteActorsRenderer;
  readonly #network: RoomGameNetwork | null;
  readonly #remoteManipulations = new Set<EntityId>();
  readonly #remoteManipulationMembers = new Map<EntityId, readonly EntityId[]>();
  readonly #simulation: SimulationPipeline;
  readonly #objects = new Map<EntityId, THREE.Group>();
  readonly #timer = new THREE.Timer();
  readonly #resizeObserver: ResizeObserver;
  readonly #unsubscribeWorld: () => void;
  readonly #unsubscribeEditor: () => void;
  #topology: RoomTopology;
  #animationFrame = 0;
  constructor(canvas: HTMLCanvasElement, store: GameStore, notify: (message: string) => void = () => {}, network: RoomGameNetwork | null = null) {
    this.#canvas = canvas;
    this.#store = store;
    this.#network = network;
    const bounds = topologyBounds(store.state.topology);
    this.#cameraController = new IsometricCameraController(bounds.width, bounds.depth);
    this.#cameraController.frameRoomBounds(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.#renderer.setPixelRatio(1);
    this.#renderer.shadowMap.enabled = false;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.NoToneMapping;
    this.#scene.background = new THREE.Color(0x152431);
    this.#architecture = new RoomArchitectureRenderer(store.state.topology);
    this.#topology = store.state.topology;
    const actorId = network?.actorId ?? LOCAL_PLAYER_ID;
    const accessProvider = roomAccessProvider(network);
    this.#player = new ActorMotionSystem(store, actorId, accessProvider);
    const playerInteractions = createPlayerInteractionDispatcher(store, this.#player, {
      onSit: (targetId, seatIndex) => network?.sit(targetId, seatIndex),
      onTeleport: (targetId) => network?.teleport(targetId),
    });
    this.#simulation = createRoomSimulation(store, accessProvider);
    this.#remotes = new RemoteActorsRenderer(store.state, actorId, this.#objects);
    this.applyHumanVisualPose();
    this.#scene.add(this.#architecture.group, this.#objectRoot, this.#teleportLinks.group, this.#human, this.#remotes.group);
    void this.#human.load()
      .then(() => { this.#canvas.dataset.humanReady = 'true'; })
      .catch((error) => { this.#canvas.dataset.humanReady = 'error'; this.#canvas.dataset.humanError = error instanceof Error ? error.message : String(error); });
    this.#wallVisibility = new WallVisibilitySystem(this.#architecture.walls);
    addRoomLighting(this.#scene, bounds.width, bounds.depth);
    this.#timer.connect(document);
    this.#interaction = new RoomInteractionController(
      canvas, this.#scene, this.#cameraController, store, this.#motion, this.#objects,
      this.#architecture.group, this.#player, playerInteractions, accessProvider, network,
      () => this.syncState(this.#store.state), notify,
    );
    this.#keyboard = new RoomKeyboardControls(store, this.#cameraController, this.#player, network, () => this.#interaction.mode);
    this.#unsubscribeWorld = store.subscribe((state, change) => {
      if (change.type === 'world/replaced') this.#player.syncFromWorld();
      else forwardRoomNetworkChange(this.#store, change, this.#network);
      this.syncState(state);
    });
    this.#unsubscribeEditor = store.subscribeEditor(() => this.syncEditorView());
    this.syncState(store.state);
    this.syncEditorView();
    this.#resizeObserver = new ResizeObserver(() => this.resize());
    this.#resizeObserver.observe(canvas.parentElement ?? canvas);
    this.updatePlayerDataset();
    this.resize();
  }
  start(): void { this.#timer.reset(); this.tick(); }
  isPlayerMoving(): boolean { return this.#player.moving; }
  syncPlayerFromWorld(): void { this.#player.syncFromWorld(); this.applyHumanVisualPose(); }
  debugScreenPointForPrototype(prototypeId: string): { x: number; y: number } | null {
    const entity = furniEntities(this.#store.state).find((candidate) => candidate.prototypeId === prototypeId);
    const object = entity ? this.#objects.get(entity.id) : null;
    if (!object?.visible) return null;
    return projectWorldPointToCanvas(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()), this.#cameraController.camera, this.#canvas);
  }
  debugScreenPointForCell(address: CellAddress): { x: number; y: number } | null {
    if (!roomCellAt(this.#store.state.topology, address)) return null;
    return projectWorldPointToCanvas(new THREE.Vector3(address.position.x + 0.5, floorWorldY(this.#store.state.topology, address) + 0.02, address.position.z + 0.5), this.#cameraController.camera, this.#canvas);
  }
  dispose(): void {
    cancelAnimationFrame(this.#animationFrame);
    this.#resizeObserver.disconnect();
    this.#unsubscribeWorld();
    this.#unsubscribeEditor();
    this.#keyboard.dispose();
    this.#interaction.dispose();
    this.#teleportLinks.dispose();
    this.#architecture.dispose();
    this.#human.dispose();
    this.#remotes.dispose();
    for (const object of this.#objects.values()) disposeRenderTree(object);
    this.#timer.dispose();
    this.#renderer.dispose();
  }
  beginCameraTurn(direction: -1 | 1): void { this.#cameraController.beginTurn(direction); }
  endCameraTurn(direction?: -1 | 1): void { this.#cameraController.endTurn(direction); }
  setCameraTurnMode(mode: CameraTurnMode): void { this.#cameraController.setTurnMode(mode); }
  setTeleportFocus(entityId: EntityId | null): void { this.#teleportLinks.setFocusedEntity(entityId); }
  applyRemoteActorVisual(actorId: EntityId, x: number, y: number, z: number): void { this.#remotes.setVisualTarget(actorId, x, y, z); }
  showChat(actorId: EntityId, chatId: string, text: string): void {
    if (actorId === this.#player.actorId) this.#human.say(chatId, text);
    else this.#remotes.say(actorId, chatId, text);
    this.#canvas.dataset.lastChat = `${actorId}:${text}`;
  }
  applyRemoteManipulation(entityId: EntityId, transform: TransformComponent, lift: number): void {
    this.#remoteManipulations.add(entityId);
    this.#canvas.dataset.remoteManipulations = String(this.#remoteManipulations.size);
    const transforms = translatedStackTransforms(this.#store.state, entityId, transform);
    this.#remoteManipulationMembers.set(entityId, transforms.map((entry) => entry.id));
    for (const patch of transforms) {
      const entity = entityById(this.#store.state, patch.id);
      if (!entity) continue;
      const fp = spatialProfileForEntity({ ...entity, components: { ...entity.components, transform: patch.transform } })?.footprint ?? { width: 1, depth: 1 };
      this.#motion.setRemotePose(patch.id, patch.transform.position.x + fp.width / 2, patch.transform.y, patch.transform.position.z + fp.depth / 2, -patch.transform.rotation * Math.PI / 2, lift);
    }
  }
  clearRemoteManipulation(entityId: EntityId): void {
    for (const id of this.#remoteManipulationMembers.get(entityId) ?? [entityId]) this.#motion.clearRemotePose(id);
    this.#remoteManipulationMembers.delete(entityId);
    this.#remoteManipulations.delete(entityId);
    this.#canvas.dataset.remoteManipulations = String(this.#remoteManipulations.size);
  }
  setInteractionMode(mode: RoomInteractionMode): void {
    this.#interaction.setMode(mode);
    this.#teleportLinks.setEditMode(mode === 'edit');
    this.syncEditorView();
  }
  setEditorGridVisible(visible: boolean): void { this.#interaction.setBuildContextVisible(visible); }
  private syncState(state: WorldState): void {
    if (state.topology !== this.#topology) {
      this.#topology = state.topology;
      const bounds = topologyBounds(state.topology);
      this.#cameraController.setRoomBounds(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
      this.#architecture.sync(state.topology);
      this.#wallVisibility.setWalls(this.#architecture.walls);
      this.#player.syncFloorElevation();
    }
    const objects = furniEntities(state);
    const live = new Set(objects.map((entity) => entity.id));
    for (const [id, object] of this.#objects) {
      if (live.has(id)) continue;
      this.#objectRoot.remove(object);
      disposeRenderTree(object);
      this.#motion.remove(id);
      this.#objects.delete(id);
    }
    for (const entity of objects) this.syncEntity(entity);
    if (this.#player.seatedOn && !live.has(this.#player.seatedOn)) this.#player.stand();
    this.#interaction.syncSelection(state, this.#store.editorState);
    this.#teleportLinks.sync(state, this.#store.editorState);
    this.#remotes.sync(state);
    syncRoomDiagnostics(this.#canvas, state, this.#player.actorId);
    this.syncEditorVisibility();
  }
  private syncEntity(entity: WorldEntity): void {
    const transform = entity.components.transform;
    const fp = spatialProfileForEntity(entity)?.footprint ?? { width: 1, depth: 1 };
    const y = transform.y;
    let object = this.#objects.get(entity.id);
    if (object && object.userData.appearanceKey !== materialAppearanceKey(entity.components.appearance)) {
      this.#objectRoot.remove(object); disposeRenderTree(object); this.#motion.remove(entity.id); this.#objects.delete(entity.id); object = undefined;
    }
    if (!object) {
      object = createObjectVisual(entity.prototypeId, entity.components.appearance);
      object.userData.entityId = entity.id;
      object.userData.y = transform.y;
      this.#objects.set(entity.id, object);
      this.#objectRoot.add(object);
      const visual = object.getObjectByName('object-visual');
      if (!(visual instanceof THREE.Group)) throw new Error(`Object ${entity.prototypeId} has no visual group.`);
      this.#motion.register(
        entity.id, object, visual,
        transform.position.x + fp.width / 2, y, transform.position.z + fp.depth / 2,
        -transform.rotation * Math.PI / 2,
      );
      return;
    }
    object.userData.y = transform.y;
    this.#motion.setPose(
      entity.id,
      transform.position.x + fp.width / 2, y, transform.position.z + fp.depth / 2,
      -transform.rotation * Math.PI / 2,
    );
  }
  private syncEditorView(): void {
    this.#interaction.syncSelection(this.#store.state, this.#store.editorState);
    this.#teleportLinks.sync(this.#store.state, this.#store.editorState);
    this.syncEditorVisibility();
    if (this.#interaction.mode === 'edit') {
      this.#cameraController.setTargetHeight(this.#store.editorState.placementY + 0.55);
    } else this.#cameraController.setTargetHeight(this.#player.visualPose.y + 0.55);
  }
  private syncEditorVisibility(): void {
    this.#architecture.setEditPlane(this.#store.state.topology, this.#interaction.mode === 'edit' ? this.#store.editorState.placementY : null);
    for (const object of this.#objects.values()) object.visible = true;
  }
  private resize(): void {
    const width = Math.max(1, this.#canvas.clientWidth);
    const height = Math.max(1, this.#canvas.clientHeight);
    this.#renderer.setSize(width, height, false);
    this.#cameraController.resize(width, height);
  }
  private readonly tick = (timestamp?: number): void => {
    this.#timer.update(timestamp);
    const delta = Math.min(this.#timer.getDelta(), 0.05);
    this.#motion.update(delta);
    this.#player.update(delta);
    this.#simulation.update(delta);
    this.syncSeatedPlayerToObject();
    this.applyHumanVisualPose();
    this.#cameraController.update(delta);
    this.#human.update(this.#cameraController.yaw, this.#cameraController.camera, delta);
    this.#remotes.update(this.#cameraController.yaw, this.#cameraController.camera, delta);
    this.#canvas.dataset.chatBubbles = String((this.#human.hasChat ? 1 : 0) + this.#remotes.chatCount);
    this.updatePlayerDataset();
    const pose = this.#player.visualPose;
    this.#wallVisibility.update(
      this.#cameraController.camera,
      new THREE.Vector3(pose.x, pose.y, pose.z),
      this.#player.cell.y,
      delta,
    );
    this.#renderer.render(this.#scene, this.#cameraController.camera);
    this.#animationFrame = requestAnimationFrame(this.tick);
  };
  private syncSeatedPlayerToObject(): void {
    const target = this.#player.seatedTarget;
    if (!target) return;
    const root = this.#objects.get(target.entityId);
    const visual = root?.getObjectByName('object-visual');
    if (!root || !(visual instanceof THREE.Group)) return;
    this.#player.followSeatedVisual(seatPoseForVisualTransform(
      target, root.position.x, root.position.y - 0.012, root.position.z, root.rotation.y, visual.position.y,
    ));
  }
  private updatePlayerDataset(): void {
    this.#canvas.dataset.playerCell = `${this.#player.cell.position.x},${this.#player.cell.position.z}`;
    this.#canvas.dataset.playerY = String(this.#player.cell.y);
    this.#canvas.dataset.playerPose = this.#player.pose;
    this.#canvas.dataset.playerDirection = String(this.#player.direction);
    this.#canvas.dataset.playerSeatedOn = this.#player.seatedOn ?? '';
    this.#canvas.dataset.cameraState = `${this.#cameraController.target.x.toFixed(3)},${this.#cameraController.target.z.toFixed(3)},${this.#cameraController.viewHeight.toFixed(3)}`;
  }
  private applyHumanVisualPose(): void {
    const pose = this.#player.visualPose;
    const groundY = pose.pose === 'sit' ? floorWorldY(this.#store.state.topology, this.#player.cell) : pose.y;
    this.#human.position.set(pose.x, groundY, pose.z);
    this.#human.setWorldDirectionContinuous(pose.direction);
    this.#human.setElevation(Math.max(0, pose.y - groundY));
    this.#human.setPose(pose.pose);
  }
}
