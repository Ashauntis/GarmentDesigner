# Knitting Garment Designer MVP Spec (v1)

## 1) Product Intent

Build a local-first knitting garment design app that supports:

1. Template-based 2D garment drafting.
2. Measurement + gauge driven stitch/row calculations.
3. Row-by-row instruction generation.
4. Optional colorwork charting tied to owned palettes/gauges.
5. Persistent project progress tracking.

## 2) Locked Decisions

1. Persistence is JSON files for MVP (no SQLite yet).
2. Internal canonical unit is `cm`.
3. User display/input unit can be `in` or `cm` (default `in`).
4. Rounding policy is configurable (mode + step), not hardcoded.
5. Template editing is copy-on-write (never overwrite source template).
6. Colorwork generation requires a selected gauge profile and palette.
7. Project stores embedded profile snapshots (person + gauge) so each project remains standalone.
8. Progress tracks:
   - completed full rows by section
   - completed stitches in the currently active partial row by section
9. Geometry uses a screen-aligned Cartesian plane:
   - origin is top-left of template-local bounds
   - `+x` moves right, `+y` moves down
   - negative coordinates are allowed during editing

## 3) Architecture (MVP)

1. `domain/` pure logic:
   - unit conversion
   - rounding rules
   - stitch/row derivation
   - instruction generation
2. `editor/` state + canvas interactions:
   - wireframe templates
   - point/edge edits
   - section assignment
3. `storage/` JSON persistence:
   - load/save/list/delete
   - schema version checks + migrations
4. `ui/` panels:
   - project + profiles
   - 2D design
   - instructions
   - chart + progress

## 4) File Persistence Model

## 4.1 Directory Layout

```text
data/
  templates/
    builtin/
      sweater-panel.v1.json
      sleeve.v1.json
      scarf.v1.json
    user/
      tpl_*.json
  projects/
    proj_*.json
  profiles/
    person_*.json
    gauge_*.json
    palette_*.json
  app-preferences.json
```

## 4.2 Common Metadata

All persisted files include:

- `id` (string)
- `schemaVersion` (number)
- `createdAt` (ISO timestamp)
- `updatedAt` (ISO timestamp)

## 5) Domain Data Schemas

## 5.1 AppPreferences

```json
{
  "id": "app_preferences",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "displayUnit": "in",
  "defaultRounding": {
    "stitch": { "mode": "nearest", "step": 2 },
    "row": { "mode": "nearest", "step": 1 }
  }
}
```

## 5.2 PersonProfile

```json
{
  "id": "person_01",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "name": "Client A",
  "measurementsCm": {
    "bustCircumference": 96.5,
    "waistCircumference": 78.0,
    "hipCircumference": 102.0,
    "armLength": 58.0,
    "upperArmCircumference": 31.0,
    "garmentLength": 58.0,
    "neckWidth": 18.0,
    "neckDepth": 8.0
  }
}
```

## 5.3 GaugeProfile

```json
{
  "id": "gauge_01",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "name": "Worsted 5mm stockinette",
  "stitchesPer10Cm": 20,
  "rowsPer10Cm": 28,
  "needle": "US 8 / 5.0mm",
  "notes": "Blocked swatch"
}
```

## 5.4 Palette

```json
{
  "id": "palette_01",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "name": "Main stash",
  "yarns": [
    {
      "id": "yarn_01",
      "label": "Navy",
      "hex": "#1D3557",
      "availableMeters": 550,
      "supportedGaugeProfileIds": ["gauge_01", "gauge_02"]
    }
  ]
}
```

## 5.5 Template

```json
{
  "id": "tpl_sweater_panel_builtin_v1",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "name": "Sweater Panel",
  "garmentType": "sweater_panel",
  "isBuiltin": true,
  "basedOnTemplateId": null,
  "geometryCm": {
    "points": [
      { "id": "p1", "x": 0, "y": 0 },
      { "id": "p2", "x": 50, "y": 0 },
      { "id": "p3", "x": 50, "y": 60 },
      { "id": "p4", "x": 0, "y": 60 }
    ],
    "edges": [
      { "id": "e1", "p1": "p1", "p2": "p2", "label": "hem" },
      { "id": "e2", "p1": "p2", "p2": "p3", "label": "side_right" }
    ],
    "sections": [
      { "id": "s1", "name": "body", "pointLoop": ["p1", "p2", "p3", "p4"] }
    ],
    "constraints": [
      { "type": "mirrorX", "leftPointId": "p1", "rightPointId": "p2", "axisX": 25 }
    ]
  }
}
```

## 5.6 Project

```json
{
  "id": "proj_01",
  "schemaVersion": 1,
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "name": "Blue Raglan",
  "templateId": "tpl_sweater_panel_user_013",
  "personProfileSnapshot": {
    "sourceProfileId": "person_01",
    "sourceProfileUpdatedAt": "2026-02-18T00:00:00.000Z",
    "name": "Client A",
    "measurementsCm": {
      "bustCircumference": 96.5,
      "waistCircumference": 78.0,
      "hipCircumference": 102.0
    }
  },
  "gaugeProfileSnapshot": {
    "sourceProfileId": "gauge_01",
    "sourceProfileUpdatedAt": "2026-02-18T00:00:00.000Z",
    "name": "Worsted 5mm stockinette",
    "stitchesPer10Cm": 20,
    "rowsPer10Cm": 28,
    "needle": "US 8 / 5.0mm",
    "notes": "Blocked swatch"
  },
  "paletteId": "palette_01",
  "displayUnit": "in",
  "roundingPolicy": {
    "stitch": { "mode": "nearest", "step": 2 },
    "row": { "mode": "ceil", "step": 2 }
  },
  "geometryOverrideCm": {
    "points": [],
    "edges": [],
    "sections": [],
    "constraints": []
  },
  "derived": {
    "edgeStitches": [
      { "edgeId": "e1", "count": 94 }
    ],
    "sectionRows": [
      { "sectionId": "s1", "count": 168 }
    ]
  },
  "colorwork": {
    "regions": [
      { "sectionId": "s1", "defaultYarnId": "yarn_01" }
    ],
    "charts": [
      {
        "id": "chart_01",
        "sectionId": "s1",
        "widthStitches": 60,
        "heightRows": 80,
        "paletteYarnIds": ["yarn_01", "yarn_03"],
        "cells": [["yarn_01", "transparent"]]
      }
    ]
  },
  "instructions": [
    {
      "id": "inst_001",
      "rowStart": 1,
      "rowEnd": 8,
      "text": "K all stitches"
    }
  ],
  "progress": {
    "completedRowsBySection": {
      "s1": 5
    },
    "activePartialRowBySection": {
      "s1": {
        "rowNumber": 6,
        "completedStitches": 14
      }
    }
  }
}
```

## 6) Core Logic Rules

## 6.1 Units

1. All stored geometry/measurements use `cm`.
2. UI converts to/from display unit for input and rendering labels.
3. Conversion constants:
   - `1 in = 2.54 cm`
   - `1 cm = 0.3937007874 in`

## 6.2 Gauge Conversion

Given:

- `lengthCm`
- `stitchesPer10Cm`
- `rowsPer10Cm`

Then:

- raw stitches = `(lengthCm / 10) * stitchesPer10Cm`
- raw rows = `(lengthCm / 10) * rowsPer10Cm`

## 6.3 Rounding

`applyRounding(raw, mode, step)`:

1. Normalize by step: `n = raw / step`
2. Round:
   - `nearest`: `round(n)`
   - `ceil`: `ceil(n)`
   - `floor`: `floor(n)`
3. Denormalize: `result = rounded * step`
4. Clamp minimum result to `step`.

Examples:

- raw 91, nearest, step 2 => 92
- raw 91, ceil, step 4 => 92
- raw 89, nearest, step 4 => 88

## 6.4 Template Versioning

1. Built-in templates are immutable.
2. Editing any template triggers "Save as New Template".
3. New template stores `basedOnTemplateId`.
4. Deleting user templates is allowed, but only if no project references them.

## 6.5 Colorwork Constraints

1. Chart import target is rectangular for MVP.
2. User must select:
   - one gauge profile
   - one palette
3. Import options:
   - width/height
   - max colors OR explicit yarn subset from palette
4. `transparent` cell is allowed and means "fall back to section default yarn."

## 6.6 Geometry Conventions

1. Geometry coordinates are template-local and stored in `cm`.
2. Origin (`0,0`) is top-left of the template-local bounding box.
3. Axes:
   - `+x`: right
   - `+y`: down
4. Negative coordinates are allowed during editing and rendering.
5. Constraint solve order for MVP:
   - apply direct point drag/input
   - apply mirror constraints in declaration order
   - persist resulting point coordinates

## 7) MVP Epics and Acceptance Criteria

## Epic A: JSON Storage Foundation

Acceptance criteria:

1. App can create/read/update/delete project JSON files.
2. `schemaVersion` is present and validated on load.
3. Corrupt file handling shows actionable error and does not crash app.

## Epic B: Template System

Acceptance criteria:

1. App ships with 3 built-in templates: scarf, sleeve, sweater panel.
2. Editing template geometry never mutates original template file.
3. "Save as New Template" creates a user template with lineage.
4. User can delete unreferenced user templates.

## Epic C: Unit + Rounding Preferences

Acceptance criteria:

1. User can toggle display between inches and centimeters.
2. Internal stored values remain centimeters regardless of display unit.
3. User can set stitch and row rounding mode + step independently.
4. Derived stitch/row counts update immediately after preference change.

## Epic D: Profiles + Derivation Engine

Acceptance criteria:

1. Person and gauge profiles can be created and reused across projects.
2. Applying profile selection writes embedded person/gauge snapshots into project JSON.
3. Derivation always uses embedded snapshots in project file.
4. Stitch/row counts match conversion + rounding rules exactly.

## Epic E: Instruction Generation + Progress

Acceptance criteria:

1. App generates row/group instructions from current geometry + gauge.
2. User can mark completed full rows per section.
3. User can track completed stitches for a single active partial row per section.
4. Completed state reflects in instructions and chart.
5. Progress state persists after save/reopen.

## Epic F: Colorwork MVP

Acceptance criteria:

1. Colorwork import requires a selected gauge profile and palette.
2. Imported image is converted to rectangular chart grid.
3. User can constrain colors using max colors or explicit palette subset.
4. Transparent cells are preserved and rendered as base section color.

## 8) Suggested Build Order

1. Epic A (storage)
2. Epic B (templates)
3. Epic C (units + rounding)
4. Epic D (profiles + derivation)
5. Epic E (instructions + progress)
6. Epic F (colorwork)

## 9) Deferred Until Post-MVP

1. SQLite backend.
2. Complex shaping (short rows, darts).
3. Multi-size grading in one project file.
4. Cloud sync/collaboration.
5. Yarn inventory forecasting beyond simple `availableMeters`.
