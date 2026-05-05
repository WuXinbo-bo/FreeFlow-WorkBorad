# Structured Export

This directory hosts the independent canvas export system.

Current module layout:

- `runtime/`
  - `createStructuredExportRuntime.js`: export runtime assembly for board / selection / arbitrary item-set export
- `host/`
  - `hostExportSnapshotAdapter.js`: host-side scope resolution and export snapshot builder
  - `hostExportAssetAdapter.js`: host-side image hydration and preload adapter
  - `hostExportFileAdapter.js`: host-side image / text persistence adapter
- root helpers
  - `renderBoardToCanvas.js`: pure board-to-canvas raster renderer
  - `buildExportReadyBoardItems.js`: export-time item normalization
  - `exportBoardAsPdf.js`: PDF encoder/export target
  - `pdfExportGuard.js`: export size guard
  - `pdfExportOptions.js`: PDF export option resolver
  - `savePdfBytes.js`: PDF persistence adapter

Design rules:

- Scope resolution, resource hydration, rendering, encoding and persistence must stay split
- `createCanvas2DEngine.js` should only orchestrate status UI and host prompts
- Board export and item export must share the same runtime path
- Future SVG / JSON / multi-page targets should extend `runtime/` and `host/`, not re-enter engine-local ad hoc code
