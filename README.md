# Garment Designer MVP Starter

Electron + React starter for a local-first knitting garment designer.

## Why Electron first

Your platform target is Windows, macOS, and Linux. Electron supports all three with one stack. React Native desktop requires separate platform implementations and does not provide first-party Linux support.

## Current scope in this starter

- Local JSON storage bootstrap under app user data directory
- Built-in templates: scarf, sleeve, sweater panel
- Domain utilities: unit conversion, rounding policy, gauge derivation
- Minimal shell UI:
  - left panel project/template list
  - center design panel placeholder
  - right instructions/chart tabs

## Run

1. `npm install`
2. `npm run dev`

## Build renderer

- `npm run build`

## Next implementation targets

1. Canvas-based wireframe editing for points and edges (Epic B)
2. Person + gauge profile CRUD (Epic D)
3. Instruction generation pipeline from geometry + derived counts (Epic E)
4. Colorwork import and chart generation (Epic F)
