# Canvas interaction performance

## Scope and rollback

Shared implementation for mac, main and win. No remote push. Baselines:
mac 3da8d12, main 33859b4, win c72b4e9; backup branches use
`backup/<branch>-before-stutter-20261013`.

## Batches and acceptance

1. Image display resources: bounded decode concurrency, resolution appropriate to display,
   original resources preserved for editing/export, stale completion and release checks.
2. Rendering: interruptible cache preparation, bounded tile recovery, retain valid pixels,
   coherent memory budgets, whole-frame timing.
3. Interaction overhead: incremental image metadata, cached text/file layout, coalesced
   pointer and minimap work. Check final pointer position, cancel, undo and fast re-entry.
4. Isolated Electron stress runs with cold/warm images and mixed scenes; shared regression
   checks; commit source once, cherry-pick to both Windows branches, build platform bundles.

## State transitions

- Steady -> active on input: cancel queued background preparation; preserve ready resources
  and current content. Only the latest pending pointer position is processed each frame.
- Active -> recovery on release/quiet: commit final camera/pointer state; drain invalidations
  and restore detail with bounded work. A new gesture invalidates obsolete recovery tasks.
- Resource absent -> queued -> decoding -> ready/error: at most two concurrent decodes;
  replacement, eviction, board switch or disposal must invalidate asynchronous completions.
- Preview -> higher detail: retain the previous valid representation until its replacement
  is ready. Source data, crop coordinates, export resolution and model geometry stay intact.
- Background/dispose/cancel: cancel timers/frames, release owned bitmaps, and prevent stale
  callbacks from reviving deleted resources or changed boards.

## Baseline evidence

Isolated Mac Electron, 1440x960, GPU enabled: a 360-element mixed scene with 120 1024x768
images showed warm pan RAF P95 about 57-59 ms and maxima about 133-142 ms. Image cache
evicted about 125 resources per round; tracked pools peaked near 415 MiB against a 192 MiB
budget. These are synthetic scene measurements, not a guarantee for all user boards.

Results and limitations will be recorded after implementation and verification.

## Implementation and verification record

Implemented shared changes:

- Added a bounded preview image cache with two concurrent decodes, display-sized bitmaps, source metadata preservation, stale completion cancellation, and release on eviction/board replacement. Export and image editing continue to use the original-resolution cache.
- Paused retained-camera preparation during active gestures and added an 8,388,608-pixel backing-surface cap; presentation keeps valid retained pixels while recovery rebuilds detail after the gesture.
- Added frame-level timing around input collection and rendering, so performance pressure includes the complete scheduled frame.
- Coalesced selection/resize/marquee pointer moves to one latest event per animation frame, including final pointer-up coordinates and cancellation cleanup.
- Deferred store emissions and autosave work during active interaction; text serialization can preserve already-measured geometry instead of remeasuring the whole board.
- Cached file-card filename wrapping and made minimap snapshot/viewport refreshes animation-frame scheduled.
- Reused sanitized rich-text display HTML and extended bounded rich layout/run caches for larger visible scenes; cache keys remain the full content, so edits select new entries.
- Added regression coverage for image cache concurrency/cancellation/reentry/release, retained-frame pause/recovery, scheduler timing, tile recovery, persistence geometry, native desktop drag/undo/redo, and mixed-scene desktop gestures.

Verification on the isolated macOS Electron runtime (GPU enabled, 1440x960):

- Shared browser suite passed through document preview, rich editing, text experience, media integrity, card UX, trackpad, and clipboard prerequisites. The clipboard fidelity test currently fails on both the pre-change baseline and current branch in the existing repeated paste/cancel assertion; it is not attributable to this patch.
- Native desktop drag/click/undo/redo passed for 120 and 1200 file cards with no frame gap above 50ms in the measured click, drag, or recovery windows.
- Mixed 360-element stress (120 images, 120 file cards, 120 rich text items) showed gesture RAF P95 around 8–17ms in the warm runs, with no >50ms gesture frame gaps; recovery returned to `steady` and resource reconciliation completed on the normal path.
- Follow-up 1200 text/file zoom profiling found repeated DOM sanitization and bounded-cache thrash. After reusing sanitized markup and increasing run/layout entry limits to 512, the isolated profile recorded RAF P95 about 17ms, maximum about 33ms, and no >50ms gesture frame gaps. This is diagnostic evidence, not a hardware-independent FPS guarantee.
- Full generated-bundle consistency check passed. The existing html2canvas duplicate-case warning remains vendor-only.

Limitations: DOM scene images still retain their normal `<img>` representation while visible; the preview cache covers the Canvas2D fallback path. Native Windows runtime execution is unavailable on this macOS host and must be validated on Windows after cherry-pick.
