## MVP: Knitting Garment Pattern Designer

### 1) Product goal

Create a tool that lets a knitter:

1. pick a garment “template” (starter wireframe),
2. size it to a person (via measurement profiles + gauge),
3. optionally add colorwork/artwork,
4. generate usable knitting instructions + charts,
5. track progress row-by-row.

---

## 2) Core user flows (MVP)

### Flow A — Start a project from a template

* User selects a garment type (e.g., sweater front, sleeve, hat).
* App loads a **2D wireframe** starter layout for that type (from a library inspired by garment-notation).
* User adjusts dimensions interactively.

**Output:** a saved “Project” with a garment shape + sizing inputs.

### Flow B — Apply a person profile + gauge

* User selects or creates a **Person Profile** (standard measurements).
* User selects or creates a **Knitter/Gauge Profile** (stitch/row gauge, needle size, fabric notes).
* App applies the measurements + gauge to convert dimensions into stitch/row counts.

**Output:** the wireframe updates to “real” stitch geometry.

### Flow C — Add colorwork (optional in MVP, but scoped)

* User can assign colors to regions/sections.
* User can import an image and convert it to a **knitting chart grid** (color per cell).
* App provides controls: max colors, palette selection, downscale size.

**Output:** a chart/grid attached to a garment section.

### Flow D — Generate instructions + chart view

* App shows:

  * a **chart/grid view** (colorwork) and
  * **row-by-row instructions** (text)
* Layout supports dockable/resizable panels or at least tabbed panels.

**Output:** instructions that update when the design changes.

### Flow E — Progress tracking

* User marks rows as complete.
* App reflects completion state:

  * instructions: checked/strikethrough
  * chart: dim/completed overlay on finished rows

**Output:** persistent progress saved with the project.

---

## 3) MVP feature breakdown

### A. Garment wireframe editor (must-have)

**What it is**

* 2D pattern outline with control points/edges.
* Drag points to change shape/dimensions.
* Set edge lengths precisely.

**MVP interactions**

* Left-drag: move control point.
* Select edge → input numeric length (right-click menu optional).
* Snap/constraints (simple): keep symmetry if garment requires it (e.g., mirror left/right).

**MVP garment templates**
Start with 2–3 templates only:

1. Sweater front/back panel (rect + neckline shaping simplified)
2. Sleeve (tapered trapezoid)
3. Hat (simple tube + crown decreases) *or* scarf (rectangle) if you want the easiest first win

### B. Profiles (must-have)

**Person Profile**

* Name
* Key measurements (MVP set depends on templates; keep minimal):

  * Chest/bust circumference
  * Waist circumference (optional)
  * Hip circumference (optional)
  * Arm length (for sleeve)
  * Upper arm circumference (for sleeve)
  * Garment length
  * Neck opening width/depth (optional for neckline shaping)

**Knitter/Gauge Profile**

* Stitches per inch (or per 10cm)
* Rows per inch (or per 10cm)
* Needle size (text)
* Notes

**Behavior**

* “Apply profile” populates the wireframe’s target dimensions.
* App converts to stitch/row counts and rounds with rules (MVP rule: nearest whole stitch/row).

### C. Color regions + chart import (MVP-lite)

You have two levels; pick one for MVP:

**Option 1 (simpler MVP):**

* Manual region coloring only (paint/fill regions).
* No image import.

**Option 2 (still doable MVP):**

* Image import → chart grid generation:

  * User chooses grid size (width in stitches, height in rows) or chooses “fit to section”
  * User chooses max colors OR selects a palette
  * Output: chart grid + legend (color index → RGB/name)

**MVP constraints**

* Limit to rectangular chart regions. - KAYLA This will be fine - maybe each image starts as a rectangle and is processed by the user into it's grid format before it's added to the garment. We can use transparent cells to indicate where the color should come from whatever it's going onto.  
* Dithering optional; start with simple color quantization.

### D. Instructions generator (must-have, but keep minimal)

**MVP instruction types**

* Cast on X stitches
* Knit rows 1–N
* Increase/decrease patterns in simple terms (e.g., “dec 1 each side every 2 rows, 10 times”)
* Bind off X stitches

**Display**

* Panel: “Instructions”
* Panel: “Chart” (if colorwork exists)
* Panel: “2D Design” (wireframe editor)

### E. Project saving + progress tracking (must-have)

* Save/load project file (JSON is fine).
* Save:

  * template type + wireframe geometry + applied measurements
  * gauge profile reference or embedded values
  * chart grids
  * progress state (completed row index per section)

---

## 4) Data model (MVP)

### Project

* id, name, created_at, updated_at
* garment_type (template key)
* wireframe:

  * points: [{id, x, y, constraints?}]
  * edges: [{id, p1, p2, target_length?, label}]
  * sections/panels: [{id, polygon/edge loop refs}]
* person_profile (embedded snapshot or link)
* gauge_profile (embedded snapshot or link)
* derived:

  * stitch_counts per edge/section
  * row_counts per section
* colorwork:

  * regions: [{section_id, color_id}]
  * charts: [{section_id, grid[w][h], palette}]
* progress:

  * per section: completed_rows (int) or set of completed row numbers

### PersonProfile

* id, name
* measurements (key/value)

### GaugeProfile

* id, name
* stitches_per_unit, rows_per_unit, unit (“in” or “cm”)
* needle, notes

---

## 5) UI layout (MVP)

Blender/Godot/Aseprite inspiration without overbuilding:

**Default layout**

* Left: Template/Profiles/Project panel (tree + properties)
* Center: 2D design canvas (wireframe)
* Right: Instructions panel (scrollable, row grouped)
* Bottom tab: Chart view (only when colorwork exists)

**Minimum interactions**

* Select point/edge → properties appear (numeric fields).
* Undo/redo (strongly recommended even in MVP).

---

## 6) Non-goals for MVP (explicitly postpone)

These will blow scope if included too early:

* Full draping/3D simulation
* Complex shaping rules (short rows, darts, advanced necklines)
* Multi-size grading sets (S/M/L) in one file
* Yarn inventory management
* Collaborative editing / cloud sync
* Fully general “any point/any edge” editing without constraints (start constrained)

---

## 7) Suggested build sequence (practical)

1. Template library + wireframe editor (drag points, set edge length)
2. Gauge + basic stitch/row conversion
3. Person profiles + “apply measurements”
4. Instruction generator for the supported templates
5. Save/load project
6. Progress tracking
7. Color regions
8. Image → chart grid import + palette limiting

---

If you want, I can also convert this into:

* a Jira-style backlog (epics → stories → acceptance criteria), or
* a short PRD + wireframes list, or
* a technical architecture recommendation (desktop app vs web, rendering approach, file formats).
