# Canvas element runtime

Canvas elements are registered through one definition contract. Core engine code resolves capabilities from the registry instead of adding new central `item.type` branches.

Every built-in definition declares:

- model: `normalize`, `getBounds`, `translate`, `resize`
- presentation: `render`, `lod`, `layer`, `cache`, `visibility`
- interaction: `hitTest`, `handles`, `marquee`, `editor`
- runtime: `overlay`, `resource`, lifecycle hooks

Runtime state follows this recovery chain:

```text
unmounted -> dormant -> visible -> interacting/editing -> settling -> visible
```

Removal or engine teardown transitions an element to `unmounted`. A completed interaction must pass through `settling` before returning to `visible`, so overlay and asynchronous resource adapters have a deterministic recovery point.

## Adding an element type

Register the definition and optional adapters through `engine.registerElementDefinition(definition, adapters)`. The definition must provide the three required model functions. The registry test intentionally fails when a built-in type omits a declared capability.

Render adapters should set `supportedTypes`, or be supplied through `registerElementDefinition`. Registered renderers use direct type lookup. Renderers without `supportedTypes` remain supported as compatibility fallbacks, but new element types should not use that path.

Editor, overlay, renderer, and resource adapters are stacked per capability key. A newer adapter may temporarily override an existing adapter; disposing it restores the previous adapter. Registration cleanup is idempotent and must not remove a later registration of the same element type.

All rendering work for a frame receives one immutable frame context containing the camera, scene revision, board revision, registry revision, DPR, and runtime mode. Canvas layers and DOM overlays must use that snapshot rather than reading mutable view state during the frame.

The scene presentation coordinator owns the immutable camera matrix, viewport dimensions, and interaction session. Viewport resize may advance only the viewport revision; it must not mutate the camera or complete a newer interaction session with a stale recovery callback.

Resource adapters are reconciled only when the scene revision changes. They must release resources that no longer belong to an active element and ignore stale asynchronous completions.
Registering or removing a resource adapter invalidates this revision guard so the active adapter receives the current scene on the next frame.
