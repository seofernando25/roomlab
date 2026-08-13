export type EntityId = string;
export type PrototypeId = string;
export type RoomLevelId = string;
export type RotationQuarter = 0 | 1 | 2 | 3;
export type EntityKind = 'furni' | 'actor' | 'npc' | 'pet' | 'effect';
export type ActorPose = 'stand' | 'walk' | 'sit';
export type FloorFinishId = 'wood' | 'cream-tile' | 'terracotta' | 'slate' | 'mint-carpet';
export type WallFinishId = 'cream-brick' | 'mint-wallpaper' | 'warm-plaster' | 'blue-panel';
export type WallAxis = 'x' | 'z';

export interface GridPoint {
  readonly x: number;
  readonly z: number;
}

export interface CellAddress {
  readonly levelId: RoomLevelId;
  readonly position: GridPoint;
}

export interface Footprint {
  readonly width: number;
  readonly depth: number;
}

export interface RoomCell {
  readonly position: GridPoint;
  /** Local sculpting offset in floor steps, relative to the storey's base elevation. */
  readonly elevation: number;
  readonly floorFinish: FloorFinishId;
}

/** A unit wall edge owned by a storey. Axis x spans (x,z)->(x+1,z); axis z spans (x,z)->(x,z+1). */
export interface WallSegment {
  readonly axis: WallAxis;
  readonly x: number;
  readonly z: number;
  readonly finish: WallFinishId;
}

export interface RoomLevel {
  readonly id: RoomLevelId;
  readonly label: string;
  /** Base storey height in the same integer step units used by RoomCell.elevation. */
  readonly baseElevation: number;
  readonly cells: readonly RoomCell[];
  readonly walls: readonly WallSegment[];
}

/** Sparse stacked architecture. Multiple storeys may contain floor at the same X/Z. */
export interface RoomTopology {
  readonly levels: readonly RoomLevel[];
}

export interface TransformComponent {
  readonly levelId: RoomLevelId;
  readonly position: GridPoint;
  readonly rotation: RotationQuarter;
  /** Vertical placement offset above the supporting floor, in room floor-step units. */
  readonly elevation?: number;
}

export interface ActorComponent {
  readonly pose: ActorPose;
  /** Continuous world-facing direction in eighth-turn units, normalized to [0, 8). */
  readonly direction: number;
  readonly seatedOn?: EntityId;
  readonly seatIndex?: number;
}

export interface ToggleStateComponent { readonly state: number; }
export interface TeleporterStateComponent { readonly targetEntityId?: EntityId; }
export interface VisualEffectStateComponent {
  readonly effects: readonly { readonly id: string; readonly intensity?: number }[];
}

/** Runtime-mutating component state only. Static capabilities live on prototypes. */
export interface EntityComponents {
  readonly transform: TransformComponent;
  readonly actor?: ActorComponent;
  readonly toggle?: ToggleStateComponent;
  readonly teleporter?: TeleporterStateComponent;
  readonly visualEffects?: VisualEffectStateComponent;
}

export interface WorldEntity {
  readonly id: EntityId;
  readonly prototypeId: PrototypeId;
  readonly components: EntityComponents;
}

export interface WorldState {
  readonly id: string;
  readonly revision: number;
  readonly topology: RoomTopology;
  readonly entities: readonly WorldEntity[];
}

export type RoomEditorTool =
  | 'select'
  | 'place-prototype'
  | 'floor-shape'
  | 'floor-paint'
  | 'floor-raise'
  | 'floor-lower'
  | 'wall-shape'
  | 'wall-paint'
  | 'teleport-pair';

/** Local-only editor state. This must never be interpreted as authoritative multiplayer room state. */
export interface EditorState {
  readonly selectedEntityId: EntityId | null;
  readonly tool: RoomEditorTool;
  readonly activeLevelId: RoomLevelId;
  readonly floorFinish: FloorFinishId;
  readonly wallFinish: WallFinishId;
  readonly pendingAnchor: CellAddress | null;
  readonly placementPrototypeId: PrototypeId | null;
  readonly placementRotation: RotationQuarter;
}

export interface RoomCellUpdate {
  readonly levelId: RoomLevelId;
  readonly position: GridPoint;
  readonly elevation?: number;
  readonly floorFinish?: FloorFinishId;
}

export type ComponentStateKey = Exclude<keyof EntityComponents, 'transform'>;
export type ComponentSetAction = {
  [K in ComponentStateKey]: {
    readonly type: 'component/set';
    readonly id: EntityId;
    readonly component: K;
    readonly value: NonNullable<EntityComponents[K]> | null;
  }
}[ComponentStateKey];

export type TopologyAction =
  | { readonly type: 'topology/cells-update'; readonly updates: readonly RoomCellUpdate[] }
  | { readonly type: 'topology/cells-add'; readonly levelId: RoomLevelId; readonly cells: readonly RoomCell[] }
  | { readonly type: 'topology/cells-remove'; readonly levelId: RoomLevelId; readonly positions: readonly GridPoint[] }
  | { readonly type: 'topology/wall-set'; readonly levelId: RoomLevelId; readonly wall: WallSegment }
  | { readonly type: 'topology/wall-remove'; readonly levelId: RoomLevelId; readonly axis: WallAxis; readonly x: number; readonly z: number }
  | { readonly type: 'topology/level-add'; readonly level: RoomLevel }
  | { readonly type: 'topology/level-base-set'; readonly levelId: RoomLevelId; readonly baseElevation: number };

export type WorldAction =
  | { readonly type: 'entity/add'; readonly entity: WorldEntity }
  | { readonly type: 'entity/remove'; readonly id: EntityId }
  | { readonly type: 'transform/move'; readonly id: EntityId; readonly address: CellAddress; readonly elevation?: number; readonly validatePlacement?: boolean }
  | { readonly type: 'transform/rotate'; readonly id: EntityId; readonly rotation: RotationQuarter; readonly validatePlacement?: boolean }
  | { readonly type: 'transform/set'; readonly id: EntityId; readonly transform: TransformComponent; readonly validatePlacement?: boolean }
  | ComponentSetAction
  | TopologyAction;

export type WorldChange =
  | WorldAction
  | { readonly type: 'world/batch'; readonly actions: readonly WorldAction[] }
  | { readonly type: 'world/replaced' };

export type EditorAction =
  | { readonly type: 'selection/set'; readonly id: EntityId | null }
  | { readonly type: 'tool/set'; readonly tool: RoomEditorTool }
  | { readonly type: 'active-level/set'; readonly levelId: RoomLevelId }
  | { readonly type: 'floor-finish/set'; readonly finish: FloorFinishId }
  | { readonly type: 'wall-finish/set'; readonly finish: WallFinishId }
  | { readonly type: 'placement-prototype/set'; readonly prototypeId: PrototypeId | null }
  | { readonly type: 'placement-rotation/set'; readonly rotation: RotationQuarter }
  | { readonly type: 'pending-anchor/set'; readonly cell: CellAddress | null };

export interface DispatchResult {
  readonly accepted: boolean;
  readonly reason?: string;
}
