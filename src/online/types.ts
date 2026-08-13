import type { CellAddress, RoomLevelId, RotationQuarter, TopologyAction, TransformComponent, WorldState } from '../domain/types';

export type UserId = string;
export type RoomId = string;
export type ItemInstanceId = string;
export type ListingId = string;
export type FriendshipId = string;
export type RoomAccess = 'open' | 'friends' | 'locked';
export type RoomRole = 'owner' | 'rights' | 'visitor';

export interface AccountDto {
  readonly id: UserId;
  readonly username: string;
  readonly createdAt: string;
  readonly balance: number;
}

export interface RoomSummaryDto {
  readonly id: RoomId;
  readonly ownerUserId: UserId;
  readonly ownerUsername: string;
  readonly name: string;
  readonly description: string;
  readonly access: RoomAccess;
  readonly maxUsers: number;
  readonly tags: readonly string[];
  readonly userCount: number;
  readonly updatedAt: string;
}

export interface RoomDetailDto extends RoomSummaryDto {
  readonly role: RoomRole;
}

export interface InventoryItemDto {
  readonly id: ItemInstanceId;
  readonly prototypeId: string;
  readonly state: 'inventory' | 'placed' | 'listed';
  readonly roomId: RoomId | null;
  readonly entityId: string | null;
  readonly acquiredAt: string;
}

export interface StoreOfferDto {
  readonly id: string;
  readonly prototypeId: string;
  readonly label: string;
  readonly price: number;
  readonly active: boolean;
}

export interface MarketListingDto {
  readonly id: ListingId;
  readonly itemId: ItemInstanceId;
  readonly prototypeId: string;
  readonly sellerUserId: UserId;
  readonly sellerUsername: string;
  readonly price: number;
  readonly createdAt: string;
}

export interface RoomEditorDto {
  readonly userId: UserId;
  readonly username: string;
}

export interface FriendDto {
  readonly friendshipId: FriendshipId;
  readonly userId: UserId;
  readonly username: string;
  readonly status: 'incoming' | 'outgoing' | 'accepted';
  readonly online: boolean;
  readonly roomId: RoomId | null;
  readonly roomName: string | null;
}

export interface JoinRoomDto {
  readonly room: RoomDetailDto;
  readonly roomSessionId: string;
  readonly actorId: string;
  readonly snapshot: WorldState;
  readonly serverSequence: number;
  readonly websocketPath: string;
}

export interface ManipulationPoseDto {
  readonly entityId: string;
  readonly transform: TransformComponent;
  readonly lift: number;
}

export type RoomClientMessage =
  | { readonly type: 'ping'; readonly clientCommandId: string; readonly clientSequence: number }
  | { readonly type: 'move'; readonly clientCommandId: string; readonly clientSequence: number; readonly target: CellAddress }
  | { readonly type: 'sit'; readonly clientCommandId: string; readonly clientSequence: number; readonly targetEntityId: string; readonly seatIndex?: number }
  | { readonly type: 'teleport-use'; readonly clientCommandId: string; readonly clientSequence: number; readonly targetEntityId: string }
  | { readonly type: 'stand'; readonly clientCommandId: string; readonly clientSequence: number }
  | { readonly type: 'manipulation-begin'; readonly clientCommandId: string; readonly clientSequence: number; readonly entityId: string }
  | { readonly type: 'manipulation-pose'; readonly clientCommandId: string; readonly clientSequence: number; readonly manipulationId: string; readonly transform: TransformComponent; readonly lift?: number }
  | { readonly type: 'manipulation-commit'; readonly clientCommandId: string; readonly clientSequence: number; readonly manipulationId: string; readonly transform: TransformComponent }
  | { readonly type: 'manipulation-cancel'; readonly clientCommandId: string; readonly clientSequence: number; readonly manipulationId: string }
  | { readonly type: 'entity-place'; readonly clientCommandId: string; readonly clientSequence: number; readonly itemInstanceId: ItemInstanceId; readonly prototypeId: string; readonly transform: TransformComponent }
  | { readonly type: 'entity-rotate'; readonly clientCommandId: string; readonly clientSequence: number; readonly entityId: string; readonly rotation: RotationQuarter }
  | { readonly type: 'entity-pickup'; readonly clientCommandId: string; readonly clientSequence: number; readonly entityId: string }
  | { readonly type: 'topology'; readonly clientCommandId: string; readonly clientSequence: number; readonly action: TopologyAction }
  | { readonly type: 'teleporter-pair'; readonly clientCommandId: string; readonly clientSequence: number; readonly first: CellAddress; readonly second: CellAddress }
  | { readonly type: 'teleporter-remove'; readonly clientCommandId: string; readonly clientSequence: number; readonly entityId: string };

export type RoomServerMessage =
  | { readonly type: 'hello'; readonly roomSessionId: string; readonly serverSequence: number; readonly actorId: string; readonly snapshot: WorldState }
  | { readonly type: 'ack'; readonly roomSessionId: string; readonly serverSequence: number; readonly clientCommandId: string }
  | { readonly type: 'rejected'; readonly roomSessionId: string; readonly serverSequence: number; readonly clientCommandId: string; readonly reason: string; readonly snapshot?: WorldState }
  | { readonly type: 'world'; readonly roomSessionId: string; readonly serverSequence: number; readonly snapshot: WorldState }
  | { readonly type: 'actor'; readonly roomSessionId: string; readonly serverSequence: number; readonly actorId: string; readonly transform: TransformComponent; readonly pose: 'stand' | 'walk' | 'sit'; readonly direction: number; readonly seatedOn?: string; readonly seatIndex?: number }
  | { readonly type: 'presence'; readonly roomSessionId: string; readonly serverSequence: number; readonly users: readonly { readonly userId: UserId; readonly username: string; readonly actorId: string }[] }
  | { readonly type: 'manipulation'; readonly roomSessionId: string; readonly serverSequence: number; readonly manipulationId: string; readonly userId: UserId; readonly pose: ManipulationPoseDto }
  | { readonly type: 'manipulation-end'; readonly roomSessionId: string; readonly serverSequence: number; readonly manipulationId: string; readonly entityId: string }
  | { readonly type: 'role'; readonly roomSessionId: string; readonly serverSequence: number; readonly role: RoomRole }
  | { readonly type: 'toast'; readonly roomSessionId: string; readonly serverSequence: number; readonly message: string };

export interface CreateRoomInput {
  readonly name: string;
  readonly description?: string;
  readonly access?: RoomAccess;
  readonly maxUsers?: number;
}

export interface CreateListingInput { readonly itemId: ItemInstanceId; readonly price: number; }
export interface FriendRequestInput { readonly username: string; }
export interface RenameInput { readonly username: string; }
export interface LevelSelection { readonly levelId: RoomLevelId; }
