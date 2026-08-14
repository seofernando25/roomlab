import type { AppearanceComponent } from './material-design';

export type EntityId = string;
export type PrototypeId = string;
export type RotationQuarter = 0 | 1 | 2 | 3;
export type EntityKind = 'furni' | 'actor' | 'npc' | 'pet' | 'effect';
export type ActorPose = 'stand' | 'walk' | 'sit';
export type FloorFinishId = 'wood' | 'cream-tile' | 'terracotta' | 'slate' | 'mint-carpet';
export type WallFinishId = 'cream-brick' | 'mint-wallpaper' | 'warm-plaster' | 'blue-panel';
export type WallAxis = 'x' | 'z';

export interface GridPoint { readonly x: number; readonly z: number; }
/** X/Z tile coordinate plus the absolute world-space Y of its support surface. */
export interface CellAddress { readonly position: GridPoint; readonly y: number; }
export interface Footprint { readonly width: number; readonly depth: number; }
/** A thin architectural slab. `y` is its walkable top surface. */
export interface RoomCell { readonly position: GridPoint; readonly y: number; readonly floorFinish: FloorFinishId; }
/** A unit wall line anchored to a slab surface Y. */
export interface WallSegment { readonly axis: WallAxis; readonly x: number; readonly z: number; readonly y: number; readonly finish: WallFinishId; }
export interface RoomTopology { readonly cells: readonly RoomCell[]; readonly walls: readonly WallSegment[]; }

export interface TransformComponent {
  readonly position: GridPoint;
  readonly rotation: RotationQuarter;
  /** Absolute world-space Y of the object's bottom/support contact. */
  readonly y: number;
}

export interface ActorComponent {
  readonly pose: ActorPose;
  readonly direction: number;
  readonly seatedOn?: EntityId;
  readonly seatIndex?: number;
}
export interface ToggleStateComponent { readonly state: number; }
export interface TeleporterStateComponent { readonly targetEntityId?: EntityId; }
export interface VisualEffectStateComponent { readonly effects: readonly { readonly id: string; readonly intensity?: number }[]; }
export interface EntityComponents {
  readonly transform: TransformComponent;
  readonly actor?: ActorComponent;
  readonly toggle?: ToggleStateComponent;
  readonly teleporter?: TeleporterStateComponent;
  readonly visualEffects?: VisualEffectStateComponent;
  readonly appearance?: AppearanceComponent;
}
export interface WorldEntity { readonly id: EntityId; readonly prototypeId: PrototypeId; readonly components: EntityComponents; }
export interface WorldState { readonly id: string; readonly revision: number; readonly topology: RoomTopology; readonly entities: readonly WorldEntity[]; }

export type RoomEditorTool = 'select'|'place-prototype'|'floor-shape'|'floor-paint'|'floor-raise'|'floor-lower'|'wall-shape'|'wall-paint'|'teleport-pair';
export interface EditorState {
  readonly selectedEntityId: EntityId | null;
  readonly tool: RoomEditorTool;
  /** Local-only virtual placement plane for floating slabs/furniture. */
  readonly placementY: number;
  readonly floorFinish: FloorFinishId;
  readonly wallFinish: WallFinishId;
  readonly pendingAnchor: CellAddress | null;
  readonly placementPrototypeId: PrototypeId | null;
  readonly placementRotation: RotationQuarter;
  readonly placementAppearance: AppearanceComponent | null;
}
export interface RoomCellUpdate {
  readonly address: CellAddress;
  readonly y?: number;
  readonly floorFinish?: FloorFinishId;
}
export type ComponentStateKey = Exclude<keyof EntityComponents, 'transform'>;
export type ComponentSetAction = { [K in ComponentStateKey]: { readonly type:'component/set'; readonly id:EntityId; readonly component:K; readonly value:NonNullable<EntityComponents[K]>|null } }[ComponentStateKey];
export type TopologyAction =
  | { readonly type:'topology/cells-update'; readonly updates:readonly RoomCellUpdate[] }
  | { readonly type:'topology/cells-add'; readonly cells:readonly RoomCell[] }
  | { readonly type:'topology/cells-remove'; readonly addresses:readonly CellAddress[] }
  | { readonly type:'topology/wall-set'; readonly wall:WallSegment }
  | { readonly type:'topology/wall-remove'; readonly edge:Pick<WallSegment,'axis'|'x'|'z'|'y'> };
export type WorldAction =
  | { readonly type:'entity/add'; readonly entity:WorldEntity }
  | { readonly type:'entity/remove'; readonly id:EntityId }
  | { readonly type:'entity-group/transform'; readonly transforms:readonly {readonly id:EntityId;readonly transform:TransformComponent}[] }
  | { readonly type:'transform/move'; readonly id:EntityId; readonly address:CellAddress; readonly validatePlacement?:boolean }
  | { readonly type:'transform/rotate'; readonly id:EntityId; readonly rotation:RotationQuarter; readonly validatePlacement?:boolean }
  | { readonly type:'transform/set'; readonly id:EntityId; readonly transform:TransformComponent; readonly validatePlacement?:boolean }
  | ComponentSetAction | TopologyAction;
export type WorldChange = WorldAction | {readonly type:'world/batch';readonly actions:readonly WorldAction[]} | {readonly type:'world/replaced'};
export type EditorAction =
  | {readonly type:'selection/set';readonly id:EntityId|null}
  | {readonly type:'tool/set';readonly tool:RoomEditorTool}
  | {readonly type:'placement-y/set';readonly y:number}
  | {readonly type:'floor-finish/set';readonly finish:FloorFinishId}
  | {readonly type:'wall-finish/set';readonly finish:WallFinishId}
  | {readonly type:'placement-prototype/set';readonly prototypeId:PrototypeId|null}
  | {readonly type:'placement-rotation/set';readonly rotation:RotationQuarter}
  | {readonly type:'placement-appearance/set';readonly appearance:AppearanceComponent|null}
  | {readonly type:'pending-anchor/set';readonly cell:CellAddress|null};
export interface DispatchResult { readonly accepted:boolean; readonly reason?:string; }
