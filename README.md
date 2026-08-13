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

A seated avatar remains attached to the live seat transform while the furniture is dragged, lifted, or rotated in Edit mode. Pixel Transport also morphs the seated sprite continuously through a live chair rotation.

## World model

The simulation uses **1 world unit = 1 floor cell**. Authoritative gameplay never stores raw Three.js objects/transforms.

The game now uses a deliberately small **hybrid ECS-lite** model:

- `WorldState.topology` is specialized room architecture data. Structural cells, walls, openings, floor finishes, and wallpaper belong here as those features are added.
- `WorldEntity` represents dynamic things such as furni, actors, NPCs, pets, Roombas, and effects.
- `prototype-registry.ts` defines static entity defaults/capabilities.
- `furni-registry.ts` is the catalogue-specific view for furni metadata.
- entity runtime components contain mutable state such as transform, actor pose/facing, toggle state, teleporter links, and visual effects.
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

## Furni registry and explorer

The furni catalogue is ontology-driven rather than a flat list of kind checks. Catalogue taxonomy is separate from runtime capabilities such as sit, surface, light, storage, use, toggle, gate, teleport, roller, dispenser, and WIRED-style roles. Capabilities can be marked `implemented` or `planned`.

Edit mode includes a searchable/category-filterable **Furni Explorer** driven entirely by registry metadata. `hotel-panel.ts` is a reusable compact UI shell inspired by the useful structural ideas in `references/style.css`—colored title strips, light bodies, edge borders, and compact chrome—without copying its font, branding, or sprite-sheet assets.

## Rendering

`src/rendering/` owns Three.js and presentation interpolation. `room-scene.ts` synchronizes entity state to render objects and runs the camera/render loop; game rules stay in `src/gameplay/`.

The avatar uses authored standing/walking/sitting directional sprites. Optional avatar-only morph modes are Off, Dither, Grid Warp, and full Pixel Transport. Pixel Transport uses 2×2 clusters, a 0.5% authored-endpoint stabilization window, and silhouette-constrained filling. The room itself remains true 3D and is never postprocessed through the avatar morph.

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
bun run smoke     # system Chromium gameplay/UI smoke and screenshots
bun run visual:qa # optional OpenRouter visual comparison against references/
```

The smoke test exercises camera modes, morph modes, floor hover, click-to-walk, authored walking, click-to-sit, Play/Edit switching, the Furni Explorer, seated furniture pickup/dragging, Pixel Transport during seated chair rotation, panning, zoom, adding furni, rotation, and WebGL sizing. Browser console/page errors fail the smoke pass.

Interaction screenshots are written under `artifacts/`, including `room.png`, `room-editor.png`, `furni-explorer.png`, `avatar-walk.png`, `avatar-sit.png`, `avatar-sit-furni-hover.png`, and `avatar-sit-furni-rotate-transport.png`.


## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the Bun/Docker/Coolify production contract.
