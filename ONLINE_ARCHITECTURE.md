# Online, Persistence & Economy Architecture

This document defines the intended boundary between the current room simulation and future accounts, persistent rooms, multiplayer, inventories, the official Shop, player Marketplace, friends and presence.

The central rule is: **the live room simulation is not the database model and the database model is not the UI model.**

## 1. Product-level concepts

The application should grow around four durable concepts:

1. **Account** — stable user identity/profile, friends and permissions.
2. **Inventory & Economy** — owned item instances, balances, official offers and marketplace listings.
3. **Room Document** — persistent room metadata, topology and persistent placed entities.
4. **Live Room Session** — authoritative multiplayer simulation, presence, actors, predictions and temporary manipulations.

These concepts should remain separate even if they initially run inside one Bun server process.

## 2. Identity: username-only UX, opaque identity underneath

For the prototype the login screen may ask only for a username and remember the user in the browser. **Do not use username as a primary key or authentication secret.**

The browser should persist a tiny local identity record containing an opaque stable `userId` / device account token. The server should eventually issue an opaque signed session token or HttpOnly cookie. Username remains mutable display/profile data.

This lets the UX stay "choose a username and come back on this browser" without making `alice` equivalent to a password for Alice's currency and inventory.

Suggested account model:

```ts
interface UserAccount {
  id: UserId;
  username: string;
  createdAt: string;
}
```

Do not reference users by username from rooms, inventory, listings or friendships.

## 3. Persistent room versus live room

### Room record

Persistent room metadata belongs outside `WorldState`:

```ts
interface RoomRecord {
  id: RoomId;
  ownerUserId: UserId;
  name: string;
  description: string;
  access: 'open' | 'friends' | 'locked';
  maxUsers: number;
  tags: readonly string[];
  createdAt: string;
  updatedAt: string;
}
```

The persistent room document contains topology and **persistent entities only**: placed owned objects, teleport links, room scripts/state that is intentionally saved, etc.

Visiting actors and temporary editor manipulation state are not persisted in the room document.

### Live room session

A live session adds:

- connected actors/presence
- authoritative simulation revision/sequence
- temporary manipulation leases/poses
- movement paths/current actor state
- session-scoped component state
- room events not yet compacted into a snapshot

Joining a room returns one authoritative snapshot plus the current event sequence. Clients then consume ordered room events.

Leaving/changing rooms creates a new session epoch on the client. Events/acks carrying an old room session id must be discarded. This prevents delayed packets from a previous room mutating the new one.

## 4. Persistence projection

Keep the current `WorldState` useful as live simulation state, but introduce an explicit serializer/projection:

```text
Live WorldState
    |
    +-- persistent projection --> Room Document
    |
    +-- session entities/state --> discarded when session closes
```

Persistence should be explicit by entity/component policy rather than "JSON.stringify everything".

Examples:

- topology: room-persistent
- placed owned furni transform: room-persistent
- teleporter link: room-persistent
- local/visiting human actor: session-only
- pointer/editor selection: client-only (already outside WorldState)
- live furniture drag pose: session-only
- camera/interpolation: client-only

## 5. Server authority and networking

Use **HTTP/JSON for durable application operations** and **WebSocket for a joined live room**.

HTTP examples:

- account/profile
- room listings/search/create
- Shop/Marketplace queries
- inventory
- friends

WebSocket examples:

- join/leave presence
- movement intents
- room interactions
- editing/manipulation
- authoritative world events

A single Bun server can initially host room sessions in memory. PostgreSQL (or SQLite during an early single-server prototype) stores durable users/rooms/economy. Redis is unnecessary until multiple real-time room servers need shared presence/routing.

The room owner is **not** peer-to-peer authority. "Host" means room owner/editor rights; the game server remains authority.

## 6. Command/event reliability

Every client command should carry:

- `roomSessionId`
- monotonically increasing client sequence
- globally unique/idempotent `clientCommandId`
- actor/user id derived from authenticated session, never trusted from arbitrary request payload

Every authoritative room event should carry:

- `roomSessionId`
- monotonically increasing server sequence
- affected entity ids/versions where relevant

The server stores/recently remembers processed command ids so a retry cannot buy twice, place twice, or execute an interaction twice.

If a client detects a sequence gap, it asks for missed events or a fresh snapshot instead of guessing.

## 7. Optimistic movement

Local movement should feel immediate.

1. Client computes/predicts a route using its latest authoritative room state.
2. Avatar begins moving immediately.
3. Client sends `MoveIntent(targetCell, clientCommandId)`.
4. Server resolves the route against current authoritative traversal/permissions.
5. Server broadcasts accepted path/state.
6. Local client reconciles if its prediction differs; remote clients interpolate server state rather than predicting another user.

The authoritative state should remain tile/pose/facing/path-level. Rendering interpolation remains client-side at 60fps.

## 8. Live furniture editing while people play

Furniture manipulation should be an explicit **session operation**, not repeated authoritative transform commits at pointer frequency.

Suggested lifecycle:

```text
BeginManipulation(entityId)
  -> server grants manipulation lease
  -> ManipulationStarted

ManipulationPose(manipulationId, pose)
  -> throttled ephemeral stream
  -> other clients render the live pose

CommitManipulation(manipulationId, candidateTransform)
  -> server validates authoritative placement
  -> committed transform event OR revert

Cancel/disconnect
  -> revert to committed transform
```

Only one editor may manipulate an entity at a time. Use a per-entity version/lease rather than forcing every edit to conflict on one global room revision.

The manipulating client predicts the visual pose immediately. The committed simulation transform remains authoritative until commit.

### Seated player on a chair being moved

This should deliberately work:

- the chair entity remains in the room while held
- it receives a temporary live manipulation pose
- `actor.seatedOn` remains attached to the chair id
- clients project the seated avatar from the chair's **live visual pose**, exactly like the current local seated-chair attachment
- the seated user may explicitly stand/move if gameplay allows; otherwise they ride the chair until it is dropped
- a true `ReturnToInventory`/entity removal is rejected while an actor is attached, preserving referential integrity

While held, the chair can be treated as kinematic/non-navigation-blocking until commit so other users can continue moving. Final placement is validated against current authoritative occupancy and actors.

The same pattern can later support moving platforms and objects carrying other objects.

## 9. Object stacking and support relationships

For multiplayer/persistence, stacked decor should eventually have an explicit support relationship rather than relying only on coincident X/Z plus height:

```ts
interface SupportedByComponent {
  entityId: EntityId;
  localOffset: { x: number; y: number; z: number };
}
```

This makes "vase on sofa", "object on table", and optionally "move the parent and carry its children" deterministic across clients and saves. Clicking/raycasting still selects the frontmost/topmost visible entity naturally.

Do not encode support by array ordering.

## 10. Official Shop versus owned Inventory

The current in-room Catalogue is a placement/build browser. Once ownership exists, distinguish these product concepts clearly:

### Shop

What can be purchased from the official game economy.

- Official offers
- categories/seasonal collections
- price/currency
- availability windows
- one prototype may appear in multiple offers

### Inventory / My Items

Actual item **instances the user owns** and can place in rooms.

- instance id
- prototype id
- owner user id
- state: inventory / placed / listed
- optional instance-specific state later

The room editor's Objects section should eventually source from owned Inventory rather than exposing infinite free copies of Shop items. Structural room tools (floor/wall brushes) can remain free build tools unless design later monetizes them.

Keep economic offer metadata out of the gameplay prototype registry. A prototype describes how an object behaves; an offer describes how it is sold.

## 11. Currency and ledger

Currency is integer-valued and server-authoritative. Never trust a client-submitted balance or price total.

Do not model purchases as `wallet.balance -= price` followed by a separate item creation. Use an atomic transaction/ledger.

Official purchase transaction:

1. lock/check offer
2. debit buyer wallet
3. append currency ledger entry
4. mint item instance owned by buyer
5. commit atomically

A balance may be materialized/cached, but the ledger provides an auditable history and recovery boundary.

## 12. Player Marketplace / free market

Marketplace listings sell **specific owned item instances**, not prototype ids.

Listing rules:

- item must belong to seller
- item must not currently be placed in a room
- item must not already be listed/locked in another transaction
- listing stores seller, item instance, asking price, created/expiry timestamps

Purchase must be one database transaction:

1. lock listing/item
2. verify still active
3. debit buyer
4. credit seller (optionally minus fee)
5. transfer item ownership
6. close listing
7. append ledger entries
8. commit

No optimistic client authority for this flow. UI may optimistically show a spinner/reservation, but ownership changes only after server commit.

## 13. Room object ownership

Persistent placed purchasable objects should reference the owned item instance that created them:

```text
Inventory item instance
    <-> placed persistent room entity
```

An item is either available in inventory, placed in exactly one room, or locked/listed. This prevents duplication.

Picking up an object from a room is a transactional state transition back to inventory. If it supports seated actors/stacked children, invariants must be resolved first rather than deleting dangling references.

## 14. Room listings and joining

Provide a Habbo-style room browser over `RoomRecord` plus live presence:

Useful sections:

- Popular / active rooms
- Friends' rooms
- My rooms
- Recent
- Search

A listing combines persistent metadata with ephemeral occupancy count/status. Occupancy does not need to be written into the room record every time somebody joins.

Joining:

1. choose room
2. authorize access
3. open/join room WebSocket session
4. receive snapshot + server sequence + presence
5. instantiate renderer
6. begin event stream

Room thumbnails can be regenerated after meaningful edits or on a debounce, not on every movement tick.

## 15. Editing permissions

Model room rights independently from account/friendship:

```text
owner
admin/rights
visitor
```

Capabilities/interactions already accept injected access context; the networking layer should derive that context from authenticated room membership/rights.

The server validates every edit regardless of what controls the client hides.

## 16. Friends and presence

Friendship is durable account data; online presence is ephemeral session data.

Suggested friendship state:

```ts
type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
```

Store user ids, never usernames, in relationships.

Presence service can expose:

- online/offline
- current joinable room id (subject to privacy)
- "Join" action

A simple Friends panel can show online friends first and provide `Join room` without coupling the friend model to room simulation.

## 17. Initial persistence strategy

For the immediate browser prototype:

- localStorage: only tiny local identity/session bootstrap (`userId`, username, token reference/preferences)
- IndexedDB may hold offline/local prototype rooms if needed
- do not build economy truth around localStorage

As soon as currency, marketplace or real multiplayer is enabled, durable account/inventory/economy truth belongs on the server even if the login UX remains username-only-on-this-device.

## 18. Suggested durable tables

A future relational schema will likely need concepts equivalent to:

- `users`
- `sessions`
- `friendships`
- `rooms`
- `room_permissions`
- `room_snapshots` and/or `room_events`
- `item_instances`
- `store_offers`
- `wallets`
- `currency_ledger`
- `market_listings`

Do not force these into one generic entity table simply because the live simulation uses ECS-lite components.

## 19. UI information architecture

A useful top-level product navigation can remain small:

- **Rooms** — browse/create/join rooms
- **Shop** — Official / Marketplace
- **Inventory** — owned items
- **Friends** — presence and join actions
- **Me** — username/profile/currency

Inside a room, Edit mode can keep the current Catalogue shell but its Objects section should evolve into **My Items**. Floor/Walls/Travel remain room construction tools.

This avoids confusing "the thing I can buy" with "the thing I own" and "the tool I can place with".

## 20. Architecture review rules

Reject/refactor a design if it does any of these:

- trusts username as authentication
- trusts client currency/balance/ownership
- makes the room owner's browser authoritative
- persists visiting actor/camera/editor state into the room document
- sends Three.js transforms/materials as the network protocol
- mutates economy records in multiple non-atomic requests
- removes an entity while another authoritative entity references it
- applies events from an old room session after the user changed rooms
- sends 60 authoritative furniture transform mutations per second during a drag
- identifies inventory items only by prototype id rather than unique owned item instance id

Preferred shape:

**semantic command -> authoritative validation/transaction -> ordered event -> client reconciliation/presentation**.
