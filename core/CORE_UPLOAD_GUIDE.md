# FreeFlow Core Upload Guide

This folder is the GitHub upload boundary for the FreeFlow core project.

## Included

- `electron/`: desktop shell and native bridge.
- `src/`: backend services and shared core code.
- `public/`: web UI, canvas runtime, assets, and bundled frontend code.
- `scripts/`: build, packaging, and verification scripts.
- `build/`: desktop packaging assets and preset tutorial files.
- `data/FreeFlow教程画布.json`: public tutorial board preset.
- `package.json` and `package-lock.json`: dependency and script definitions.
- `server.js`: web/backend startup entry.
- `README.md`, `LICENSE.md`, `.env.example`: project metadata.

## Excluded From Core

- `docs/`: papers, reports, drafts, and private writing materials.
- `github-promo-web/`: product website and roadshow pages.
- `release/`, `output/`, `tmp/`, `_archive/`: generated or temporary files.
- Local settings under `data/`, except the tutorial board preset.
- `.env` and other machine-local configuration files.

## Start

```bash
npm install
npm run start:desktop
```

The root workspace also provides `start-desktop.cmd`, which delegates startup to this folder.
