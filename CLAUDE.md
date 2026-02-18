# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server + Electron (full app)
- `npm run build` — Production build (Vite, outputs to `dist/`)
- `npm run typecheck` — TypeScript type checking (`tsc --noEmit`)

No test framework is configured yet.

## Architecture

Electron + React (TypeScript) local-first knitting garment designer. Three-layer architecture:

1. **Renderer** (`src/`) — React UI. Most state lives in `App.tsx` via React hooks (no Redux/Zustand).
2. **Domain** (`src/domain/`) — Pure functions with no side effects: unit conversion (`units.ts`), gauge derivation (`gauge.ts`), rounding rules (`rounding.ts`).
3. **Electron main process** (`electron/`) — `main.js` registers IPC handlers, `preload.js` exposes secure context bridge, `storage.js` handles JSON file persistence.

**IPC flow:** React → `src/storage/ipc.ts` (typed async wrapper) → preload context bridge → main process IPC handlers → `electron/storage.js` → filesystem.

**Types** are centralized in `src/types/models.ts`. Electron API types in `src/types/electron.d.ts`.

## Key Domain Rules

- **Canonical unit is cm.** All geometry and measurements stored in cm. UI converts to/from display unit (in or cm).
- **Profile snapshots:** Projects embed copies of person/gauge profiles (not references), so projects remain standalone.
- **Template copy-on-write:** Built-in templates (`data/templates/builtin/`) are immutable. Edits create new user templates with `basedOnTemplateId` lineage.
- **Geometry coordinates:** Screen-aligned Cartesian — origin top-left, +x right, +y down. Negative coordinates allowed during editing.
- **Rounding:** Configurable per-project (mode: nearest/ceil/floor, step size). Minimum result clamped to step value.

## Data Persistence

JSON files stored under Electron's `app.getPath("userData")`. All entities carry `id`, `schemaVersion`, `createdAt`, `updatedAt`. Schema version is validated on load.

## Spec Reference

`mvp-spec.md` is the authoritative specification — contains domain schemas, logic rules, acceptance criteria, and build order (Epics A→F).
