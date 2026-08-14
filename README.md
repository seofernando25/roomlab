# Habbo-like Room Lab

A fully typed Bun + TypeScript + Vite + Lit + Three.js room game/editor inspired by the design grammar of classic Habbo rooms: orthographic isometric framing, discrete floor cells, chunky readable furni, avatar movement, sitting, and live room editing. It does not copy Habbo's proprietary game assets.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the simulation/component contracts and extension recipes.

## Run it

```bash
bun install
bun run dev
```

## Controls

- **Play / Edit** — top-right mode toggle; Play is the default.
- **Play: hover + left-click a cell** — pathfind and walk there with authored directional walking sprites.
- **Play: click a chair, stool, or sofa seat** — walk to the selected seat and use the authored sitting sprites.
- **Edit: click furni** — select it.
- **Edit: left-drag furni** — move it directly between snapped floor cells; invalid placement is rejected.
- **Edit: R** — rotate selected furni 90° when valid.
- **Edit: Delete / Backspace** — pick up selected furni.
- **Drag empty space with any mouse button** — pan.
- **Mouse wheel** — zoom.
- **Q / E** — free orbit, Snap 45°, or Snap 90° according to the selected camera mode.

### Touch / mobile

- **Tap a floor cell or interactive object** — move, sit, or use it.
- **One-finger drag on empty room space** — pan the camera.
- **One-finger drag on an object/build tool in Edit** — move or paint/build with the active tool.
- **Two-finger pinch/drag** — zoom and pan without committing an object/build drag.
- Object placement exposes an on-screen **Rotate 90°** action; selected objects keep touch-sized Rotate/Pick up actions.
- The landing/lobby use normal document scrolling; only the joined Three.js room owns the fixed viewport and disables native scrolling on its canvas.

A seated avatar remains attached to the live seat transform while the furniture is dragged, lifted, or rotated in Edit mode. Pixel Transport also morphs the seated sprite continuously through a live chair rotation.

## World model

The simulation uses **1 world unit = 1 floor cell**. Authoritative gameplay never stores raw Three.js objects/transforms.

The game now uses a deliberately small **hybrid ECS-lite** model:

- `WorldState.topology` is specialized room architecture data. Structural cells, walls, openings, floor finishes, and wallpaper belong here as those features are added.
- `WorldEntity` represents dynamic things such as furni, actors, NPCs, pets, Roombas, and effects.
- `prototype-registry.ts` defines static entity defaults/capabilities.
- `furni-registry.ts` is the catalogue-specific view for furni metadata.
- entity runtime components contain mutable state such as transform, actor pose/facing, toggle state, teleporter links, visual effects, and per-item material appearance.
- `EditorState` is local-only; selection is deliberately not part of authoritative multiplayer state.

Entity class is derived from its prototype instead of duplicated on each instance.

### Spatial rules

`SpatialIndex` supports **many entities per cell**. Placement and traversal are separate concepts:

- prototype occupancy layers + conflict rules decide whether entities may coexist;
- collision/gate state decides whether a particular actor may traverse a cell.

That makes rugs/effects/stacked layers, pass-through furni, dynamic gates, and actor occupancy composable instead of special cases.

## Gameplay systems

`src/gameplay/` is renderer-free and reusable by a future server/headless simulation. It currently contains:

- actor pathfinding and traversal
- seat targeting/attachment math
- reusable player/NPC actor motion
- interaction resolution and handler dispatch
- injectable permission/inventory requirements
- generic toggle state
- permission-aware automatic gates
- runtime-linked teleporters
- an independent simulation pipeline

Pointer input only does **pick → resolve interaction → execute dispatcher**. It does not know what a chair, gate, or teleporter does.

Generic `use` capabilities carry stable action IDs so custom actions can register handlers without prototype-ID branching.

Logical multi-component events can use `GameStore.dispatchBatch()` for atomic one-revision updates.

## Catalogue

The Catalogue is prototype/capability-driven rather than a flat list of kind checks. Catalogue taxonomy is separate from runtime capabilities such as sit, surface, light, storage, use, toggle, gate, teleport, roller, dispenser, and WIRED-style roles. Capabilities can be marked `implemented` or `planned`.

Edit mode includes a searchable/category-filterable **Catalogue** driven entirely by registry metadata. `hotel-panel.ts` is a reusable compact UI shell inspired by the useful structural ideas in `references/style.css`—colored title strips, light bodies, edge borders, and compact chrome—without copying its font, branding, or sprite-sheet assets.

### Material Studio

Custom furniture styling is built as a deterministic **material recipe language**, not arbitrary JavaScript or shader snippets. Furniture prototypes expose semantic parts such as Upholstery, Cushion, Frame, Wood, Counter, Ceramic, or Foliage. The Material Studio previews the complete furniture while a user edits one part at a time.

Recipes use a bounded base color plus composable procedural layers: stripes, checker, grid, dots, seeded speckles, and seeded grain. Resolution, repeat, spacing, thickness, opacity, angle, density, radius, and seeds are all validated before they can enter authoritative room state. Recipes cannot contain executable code, remote URLs, or user shaders. WebSocket room commands are capped at 64 KiB and canonical material appearance is capped at 12 KiB with at most 8 material slots and 6 layers per slot.

The UI leads with curated styles such as Fine Linen, Walnut Grain, Studio Charcoal, Clean Ivory, and natural foliage; layer controls remain available underneath for custom patterns. Users may save up to 24 named material recipes in **My Patterns** in local browser storage. Those saved recipe shortcuts are browser-local, but once a recipe is applied to an owned furniture item its canonical appearance belongs to that exact item instance: pickup, room changes, Marketplace listing, and Marketplace transfer retain it.

When several owned items share a prototype, the Catalogue exposes the exact owned copy (`Styled` or `Original`) rather than treating them as interchangeable. A room editor may move another player's item, but permanent restyling of an owned item is restricted to that item's owner. A room owner can still return another player's placed item to its owner. Built-in room furniture that has no owned item instance may use room-local styling.

## Rendering

`src/rendering/` owns Three.js and presentation interpolation. `room-scene.ts` synchronizes entity state to render objects and runs the camera/render loop; game rules stay in `src/gameplay/`.

The avatar uses authored standing/walking/sitting directional sprites with **Pixel Transport as the single directional transition**. Pixel Transport uses 2×2 clusters, a 0.5% authored-endpoint stabilization window, and silhouette-constrained filling; there is no player-facing avatar tuning mode. The room itself remains true 3D and is never postprocessed through the avatar transition.

Rendering uses nearest-sampled procedural materials, restrained toon shading, baked/contact-style grounding, and no hard dynamic shadow maps.

## Architecture guardrails

- `src/domain/` and `src/gameplay/` must not import Three.js or Lit.
- room/cell architecture is not represented as fake furni.
- prototype data and mutable entity state stay separate.
- local camera/editor/pointer state stays outside `WorldState`.
- no gameplay system may assume a cell contains zero-or-one entity.
- new behavior should normally be **component/prototype data + focused system/handler + tests**.
- avoid prototype-ID checks in navigation, pointer handling, and `RoomScene`.

All current `src/**/*.ts` files are kept below 300 lines.

## Verification

```bash
bun run test      # world/component/gameplay/rendering regression tests
bun run build     # strict TypeScript + production Vite build
bun run smoke        # desktop Chromium gameplay/UI smoke and screenshots
bun run smoke:mobile # 390x844 touch scrolling, gestures, room UI and Catalogue smoke
bun run visual:qa # optional OpenRouter visual comparison against references/
```

The desktop smoke exercises camera modes, floor hover, click-to-walk, authored walking, click-to-sit, Play/Edit switching, the Catalogue, Material Studio preview/presets/saved patterns, styled placement, direct floor-base-height editing, seated furniture pickup/dragging, Pixel Transport during seated chair rotation, panning, zoom, adding objects, rotation, and WebGL sizing. Browser console/page errors fail the smoke pass. The mobile smoke additionally verifies real touch scrolling on the landing/lobby, compact Shop rows, Material Studio sheet scrolling and touch sizes, tap-to-walk, one-finger camera panning, pinch zoom including the wider portrait zoom-out range, double-tap browser-zoom suppression on the room canvas, full-viewport canvas behavior, and touch-sized Catalogue controls. The two-browser online acceptance flow verifies styled-item persistence through placement, placed-item restyling, seated live manipulation, pickup, Marketplace transfer, rights, presence, friends, and restart/reconnect.

Interaction screenshots are written under `artifacts/`, including `room.png`, `ui-catalogue.png`, `ui-material-studio.png`, `mobile-material-studio.png`, `online-material-studio.png`, and the room/editor/multiplayer captures used by the smoke suites.


## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the Bun/Docker/Coolify production contract.
