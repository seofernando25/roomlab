# Room Lab Architecture

The game uses a **hybrid ECS-lite simulation**. It deliberately does not use a generic archetype ECS framework: Habbo-sized rooms do not need dense component arrays or query compilers, but they benefit strongly from entity/component/system composition.

## 1. Hard boundaries

### Room topology is not an entity

`WorldState.topology` owns the room's structural grid. Today it contains room dimensions; future floor-cell masks/heights, wall edges, openings, floor finishes, and wall finishes belong here.

Do **not** create invisible furni entities for wallpaper, floor paint, missing floor cells, or structural walls. Architecture and finishes are specialized room data.

### Dynamic things are entities

Furni, actors, NPCs, pets, Roombas, and effects are `WorldEntity` instances. An entity stores only:

- `id`
- `prototypeId`
- mutable runtime `components`

Entity class (`furni`, `actor`, `npc`, `pet`, `effect`) is derived from the prototype. Do not duplicate it on the entity instance.

### Static prototype data is not runtime state

`prototype-registry.ts` is the general registry. `furni-registry.ts` adds catalogue metadata for visible furniture prototypes.

Static data belongs on prototypes: footprint, occupancy layer, collision mode, seat slots, supported capabilities, render asset, requirements, etc.

Mutable state belongs on entity components: actor pose, toggle state, teleporter links, visual-effect state, per-item material appearance, etc.

Do not add `isOpen`, `isBurning`, `teleportTarget`, `locked`, and similar one-off fields directly to `WorldEntity`.

### Authoritative state is not local UI state

`WorldState` is serializable simulation state and is the server-authority seam.

`EditorState` is local-only selection/editor state. Camera state, pointer hover, interpolation, panel state, and Three.js objects are also local presentation state.

Never put a user's local selection or camera state into `WorldState`.

## 2. Spatial model

`SpatialIndex` is derived from `WorldState` and maps each cell to **many occupants**.

Each prototype can define:

- `occupancyLayer`
- `conflictsWith`
- footprint
- collision mode

These are intentionally independent.

### Placement is not collision

Placement asks: **may these entities coexist in this space?**

Traversal asks: **may this actor walk through this space right now?**

Do not collapse those questions back into one `occupied: boolean` flag.

Examples:

- rug + chair: different/non-conflicting occupancy layers
- sparkle/fire effect + chair: effect layer does not conflict
- walk-through furni: may still occupy the furni layer but collision is `none`
- closed gate: placement is unchanged; traversal derives from gate/toggle runtime state

## 3. Gameplay systems

`src/gameplay/` must remain renderer-free. It may depend on `src/domain/`; it must not import Three.js, Lit, or rendering/UI files.

Current systems include:

- `navigation-system.ts` — actor pathfinding
- `traversal-system.ts` — actor-aware collision/gate queries
- `seating-system.ts` — seat targets and transforms
- `actor-motion-system.ts` — reusable player/NPC/pet movement state
- `interaction-system.ts` — interaction intent resolution
- `interaction-dispatcher.ts` — handler registration/execution
- `toggle-system.ts` — generic runtime toggle state
- `automatic-gate-system.ts` — permission-aware auto gates
- `teleport-system.ts` — runtime-linked teleporters
- `simulation-pipeline.ts` — independent per-tick simulation systems

The renderer projects simulation state; it does not own game rules.

## 4. Interactions

Pointer input follows one flow:

`pick entity -> resolve interactions -> choose default intent -> execute dispatcher`

`RoomInteractionController` must not contain rules such as `if chair then sit` or `if teleporter then move`.

Capabilities may declare requirements such as room rights or inventory items. Access is supplied through an injected `InteractionAccessProvider`; input code must not decide permissions.

Generic `use` capabilities carry a stable `actionId`. Custom use behavior registers an action handler instead of branching on prototype IDs.

## 5. Atomic world changes

Use `GameStore.dispatchBatch()` when one gameplay event changes multiple components/entities. A batch is atomic, produces one revision, and notifies listeners once.

Examples:

- teleport + clear seated state
- enter a seat + attach seat metadata
- future trade/consume/open operations

Do not implement a logical event as a sequence of independently observable partial states when it can be atomic.

## 6. Multiplayer seam

Local predicted world mutations can increase the local revision, while authoritative server revision ordering is tracked separately. `replaceFromServer()` replaces world simulation state without replacing local editor state and reconciles the local actor presentation on `world/replaced`.

A future networking layer should send/receive semantic domain commands/events or authoritative snapshots; it should not serialize Three.js state.

The durable online/economy design—including Accounts, persistent Room Documents vs Live Room Sessions, optimistic movement, live furniture manipulation, Inventory, official Shop, Marketplace, currency ledger, friends and room listings—is specified in [`ONLINE_ARCHITECTURE.md`](./ONLINE_ARCHITECTURE.md).

## 7. Extension recipes

### Walk-through furni

Add/modify a prototype:

- spatial/placement metadata remains normal
- collision mode: `none`

No pathfinding special case.

### More than one item in a cell

Choose compatible occupancy layers/conflict rules. Do not weaken all collision/placement globally.

Typical future layers include floor overlay, furni, surface item, actor, wall furni, and effect.

### Stateful door/gate

Prototype components:

- `toggle`
- `gate`
- collision mode `gate`

Runtime component:

- `toggle.state`

Traversal and auto-opening derive from that state. Permissions belong in capability requirements.

### Custom interaction

Prefer an existing generic capability when appropriate. For a generic use interaction:

1. give the prototype a stable `actionId`
2. register a use handler for that action ID
3. keep pointer input unchanged

If the behavior is a genuinely new reusable capability, add its component schema and a focused system rather than a prototype-specific branch.

### Teleporter

Prototype: implemented `teleport` capability.

Entity runtime component: `teleporter.targetEntityId`.

`teleport-system.ts` resolves the link; actor motion/presentation performs the visible relocation.

### NPC, pet, Roomba

Create a prototype of kind `npc`/`pet` and an entity with an `actor` runtime component. Reuse `ActorMotionSystem`, navigation, traversal, gates, and teleport rules. AI decides destinations; it should not reimplement movement.

### Fire, shine, particles, postprocessing

Use runtime presentation/effect components or effect entities. Simulation state should describe the effect (`id`, intensity/state); rendering adapters decide shaders, particles, lights, or postprocessing.

Do not put Three.js materials/passes into domain state.

### Programmable furniture materials

Furniture appearance is authoritative **recipe data**, never a Three.js material, shader source, script, URL, or uploaded executable asset. A prototype declares semantic `renderable.materialSlots`; an entity may carry an `appearance.materials` map that assigns a validated `MaterialStyle` to those slots. Owned-item persistence mirrors the same canonical appearance so pickup and Marketplace transfer preserve identity.

`material-design.ts` defines the bounded recipe language and parser. `material-program-texture.ts` is the rendering adapter that compiles that data into a nearest-filtered Three.js texture. Shared recipe textures are reference-counted and must be released with the render tree so experimentation cannot grow an unbounded GPU cache. `object-material-appearance.ts` applies recipes only to meshes tagged with the corresponding semantic slot. New furniture authors should tag geometry and declare slot metadata rather than branch in Material Studio or `RoomScene`.

The recipe language intentionally remains finite and deterministic. Add new reusable layer primitives to the domain parser + renderer together; do not add an "escape hatch" for arbitrary JS/GLSL. Every authoritative recipe addition needs parser bounds, deterministic rendering, protocol validation, and tests.

### Floors, wallpaper, walls, windows, paintings

- structural floor plan/wall edges/openings: `RoomTopology`
- floor/wall finishes: topology surface/finish data
- windows/doors that alter wall structure: topology fixtures/openings or dedicated structural fixture data
- paintings/posters/wall lamps: wall-mounted entities/furni
- rugs: entities/furni over floor finishes

Do not model wallpaper or painted floor tiles as ordinary furni entities.

## 8. Review rules

A feature should normally be rejected/refactored if it requires any of these:

- `if (prototypeId === 'special-item')` in navigation, pointer input, or room scene
- adding unrelated boolean fields directly to `WorldEntity`
- assuming a cell contains zero-or-one entity
- using placement overlap as actor collision
- importing Three.js/Lit into `src/domain` or `src/gameplay`
- putting local selection/camera/pointer state in `WorldState`
- making `RoomScene` execute prototype-specific game mechanics
- duplicating movement/pathfinding for NPCs or pets

The preferred feature shape is:

**prototype/component data + focused system/handler + tests**, with unrelated systems unchanged.
