import type { InteractionRequirement } from './interaction-types';
import type { Footprint } from './types';

export type OccupancyLayer = 'floor-overlay' | 'furni' | 'surface-item' | 'actor' | 'wall-furni' | 'effect';
export type CapabilityStatus = 'implemented' | 'planned';
export type WiredRole = 'trigger' | 'effect' | 'condition' | 'selector' | 'addon';

export interface SeatDefinition {
  readonly x: number;
  readonly z: number;
  readonly height: number;
}

interface CapabilityBase {
  readonly status: CapabilityStatus;
  readonly requirements?: readonly InteractionRequirement[];
}

export interface SitCapability extends CapabilityBase { readonly seats: readonly SeatDefinition[]; }
export interface LayCapability extends CapabilityBase { readonly spots: readonly SeatDefinition[]; }
export interface SurfaceCapability extends CapabilityBase { readonly height: number; readonly acceptsFurni: boolean; }
export interface LightCapability extends CapabilityBase { readonly toggleable: boolean; }
export interface StorageCapability extends CapabilityBase { readonly capacity?: number; }
export interface UseCapability extends CapabilityBase {
  readonly actionId: string;
  readonly actionLabel: string;
}
export interface ToggleCapability extends CapabilityBase { readonly states: number; readonly initialState?: number; }
export interface GateCapability extends CapabilityBase { readonly passableState: number; readonly autoOpen?: boolean; }
export interface TeleportCapability extends CapabilityBase { readonly paired: boolean; }
/** Optional navigation affordance layered onto an otherwise ordinary placeable entity. */
export interface TraversalCapability extends CapabilityBase {
  readonly mode: 'steps' | 'ramp';
  readonly maxRiseSteps: number;
}
export interface RollerCapability extends CapabilityBase { readonly speed: number; }
export interface DispenserCapability extends CapabilityBase { readonly handItem: string; }
export interface WiredCapability extends CapabilityBase { readonly role: WiredRole; }

/** Static prototype capabilities. Mutable state belongs on WorldEntity.components. */
export interface PrototypeCapabilities {
  readonly sit?: SitCapability;
  readonly lay?: LayCapability;
  readonly surface?: SurfaceCapability;
  readonly light?: LightCapability;
  readonly storage?: StorageCapability;
  readonly use?: UseCapability;
  readonly toggle?: ToggleCapability;
  readonly gate?: GateCapability;
  readonly teleport?: TeleportCapability;
  readonly traversal?: TraversalCapability;
  readonly roller?: RollerCapability;
  readonly dispenser?: DispenserCapability;
  readonly wired?: WiredCapability;
}

export type PrototypeCapabilityKey = keyof PrototypeCapabilities;

export interface PrototypeSpatialDefinition {
  readonly footprint: Footprint;
  readonly rotatesWithEntity: boolean;
  readonly occupancyLayer: OccupancyLayer;
  readonly conflictsWith: readonly OccupancyLayer[];
  /** Whether this placeable may resolve onto an implemented support surface above the floor. */
  readonly canStack?: boolean;
}

export interface CollisionComponentDefinition {
  readonly mode: 'solid' | 'none' | 'gate';
}

export interface MaterialSlotDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface RenderableComponentDefinition {
  readonly renderer: 'procedural-furni' | 'human-avatar' | 'none';
  readonly asset?: string;
  readonly materialSlots?: readonly MaterialSlotDefinition[];
}
