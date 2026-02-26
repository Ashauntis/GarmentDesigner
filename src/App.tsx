import { useEffect, useMemo, useState } from "react";
import { deriveGaugeCounts } from "./domain/gauge";
import { applyRounding } from "./domain/rounding";
import { storageApi } from "./storage/ipc";
import type {
  AppPreferences,
  GridEditHistoryEntry,
  GaugeProfile,
  GaugeProfileSnapshot,
  Geometry,
  InstructionGrid,
  InstructionVerbosity,
  PersonProfile,
  PersonProfileSnapshot,
  Point,
  Project,
  ProjectGridWorkspace,
  ProjectSummary,
  RoundingMode,
  Template
} from "./types/models";

type Screen = "projects" | "profiles" | "design" | "instructions" | "settings";

interface DragState {
  pointId: string;
  pointerId: number;
}

interface PersonFormState {
  id?: string;
  name: string;
  bustCircumference: number;
  armLength: number;
  garmentLength: number;
}

interface GaugeFormState {
  id?: string;
  name: string;
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  needle: string;
  notes: string;
}

interface SettingsFormState {
  displayUnit: "in" | "cm";
  stitchMode: RoundingMode;
  stitchStep: number;
  rowMode: RoundingMode;
  rowStep: number;
}

const navigation: Array<{ screen: Screen; glyph: string; label: string }> = [
  { screen: "projects", glyph: "PJ", label: "Projects" },
  { screen: "profiles", glyph: "PF", label: "Profiles" },
  { screen: "design", glyph: "DS", label: "Design" },
  { screen: "instructions", glyph: "IN", label: "Instructions" },
  { screen: "settings", glyph: "ST", label: "Settings" }
];

const emptyGeometry: Geometry = {
  points: [],
  edges: [],
  sections: [],
  constraints: []
};

function nowIso(): string {
  return new Date().toISOString();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function cloneGeometry(geometry?: Geometry): Geometry {
  if (!geometry) {
    return { points: [], edges: [], sections: [], constraints: [] };
  }
  return {
    points: geometry.points.map((point) => ({ ...point })),
    edges: geometry.edges.map((edge) => ({ ...edge })),
    sections: geometry.sections.map((section) => ({ ...section, pointLoop: [...section.pointLoop] })),
    constraints: geometry.constraints.map((constraint) => ({ ...constraint }))
  };
}

function hasGeometry(geometry?: Geometry): boolean {
  return Boolean(geometry && geometry.points.length > 0 && geometry.edges.length > 0);
}

function selectDefaultTemplate(templates: Template[]): Template | undefined {
  return templates.find((template) => template.id === "tpl_scarf_builtin_v1") ?? templates.find((template) => template.isBuiltin) ?? templates[0];
}

function defaultPreferences(): AppPreferences {
  const timestamp = nowIso();
  return {
    id: "app_preferences",
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    displayUnit: "in",
    instructionVerbosity: "grouped",
    defaultRounding: {
      stitch: { mode: "nearest", step: 2 },
      row: { mode: "nearest", step: 1 }
    }
  };
}

function settingsFormFromPreferences(preferences: AppPreferences): SettingsFormState {
  return {
    displayUnit: preferences.displayUnit,
    stitchMode: preferences.defaultRounding.stitch.mode,
    stitchStep: preferences.defaultRounding.stitch.step,
    rowMode: preferences.defaultRounding.row.mode,
    rowStep: preferences.defaultRounding.row.step
  };
}

function personSnapshotFromProfile(profile?: PersonProfile): PersonProfileSnapshot {
  if (!profile) {
    return {
      sourceProfileId: null,
      sourceProfileUpdatedAt: null,
      name: "Draft Person Snapshot",
      measurementsCm: {
        bustCircumference: 96.5,
        armLength: 58,
        garmentLength: 58
      }
    };
  }

  return {
    sourceProfileId: profile.id,
    sourceProfileUpdatedAt: profile.updatedAt,
    name: profile.name,
    measurementsCm: profile.measurementsCm
  };
}

function gaugeSnapshotFromProfile(profile?: GaugeProfile): GaugeProfileSnapshot {
  if (!profile) {
    return {
      sourceProfileId: null,
      sourceProfileUpdatedAt: null,
      name: "Draft Gauge Snapshot",
      stitchesPer10Cm: 20,
      rowsPer10Cm: 28,
      needle: "US 8 / 5.0mm",
      notes: "Starter snapshot"
    };
  }

  return {
    sourceProfileId: profile.id,
    sourceProfileUpdatedAt: profile.updatedAt,
    name: profile.name,
    stitchesPer10Cm: profile.stitchesPer10Cm,
    rowsPer10Cm: profile.rowsPer10Cm,
    needle: profile.needle,
    notes: profile.notes
  };
}

function hydrateProjectGeometry(project: Project, templates: Template[]): Project {
  if (hasGeometry(project.geometryOverrideCm)) {
    return project;
  }
  const template = templates.find((entry) => entry.id === project.templateId);
  return {
    ...project,
    geometryOverrideCm: cloneGeometry(template?.geometryCm)
  };
}

function buildProjectDraft(input: {
  template?: Template;
  projectName: string;
  preferences: AppPreferences;
  personProfile?: PersonProfile;
  gaugeProfile?: GaugeProfile;
}): Project {
  const timestamp = nowIso();
  const id = `proj_${Date.now()}`;
  const personSnapshot = personSnapshotFromProfile(input.personProfile);
  const gaugeSnapshot = gaugeSnapshotFromProfile(input.gaugeProfile);
  const gaugePreview = deriveGaugeCounts(
    {
      lengthCm: 50,
      stitchesPer10Cm: gaugeSnapshot.stitchesPer10Cm,
      rowsPer10Cm: gaugeSnapshot.rowsPer10Cm
    },
    input.preferences.defaultRounding
  );

  const draft: Project = {
    id,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.projectName,
    templateId: input.template?.id ?? "tpl_scarf_builtin_v1",
    personProfileSnapshot: personSnapshot,
    gaugeProfileSnapshot: gaugeSnapshot,
    displayUnit: input.preferences.displayUnit,
    roundingPolicy: input.preferences.defaultRounding,
    geometryOverrideCm: cloneGeometry(input.template?.geometryCm),
    derived: {
      edgeStitches: [{ edgeId: "preview_edge", count: gaugePreview.stitches }],
      sectionRows: [{ sectionId: "preview_section", count: gaugePreview.rows }]
    },
    instructions: [
      {
        id: "inst_001",
        rowStart: 1,
        rowEnd: 10,
        text: `Cast on ${gaugePreview.stitches} stitches and knit 10 rows`
      }
    ],
    progress: {
      completedRowsBySection: {},
      activePartialRowBySection: {}
    }
  };

  return recalculateProject(draft, input.preferences.instructionVerbosity);
}

function emptyPersonForm(): PersonFormState {
  return {
    name: "",
    bustCircumference: 96.5,
    armLength: 58,
    garmentLength: 58
  };
}

function emptyGaugeForm(): GaugeFormState {
  return {
    name: "",
    stitchesPer10Cm: 20,
    rowsPer10Cm: 28,
    needle: "",
    notes: ""
  };
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function cmDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface RowPlan {
  targetStitches: number;
  leadInStitches: number;
  segmentStitches: number[];
  gapStitches: number[];
  layoutKey: string;
  layoutNote: string;
}

function stitchWord(count: number): string {
  return count === 1 ? "stitch" : "stitches";
}

function intersectionsAtY(points: Point[], y: number): number[] {
  const intersections: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (p1.y === p2.y) {
      continue;
    }

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    if (y < minY || y >= maxY) {
      continue;
    }

    const ratio = (y - p1.y) / (p2.y - p1.y);
    const x = p1.x + ratio * (p2.x - p1.x);
    intersections.push(x);
  }
  intersections.sort((a, b) => a - b);
  return intersections;
}

function sectionSpansAtY(
  points: Point[],
  y: number,
  minX: number,
  maxX: number,
  options?: { fallbackToBounds?: boolean }
): Array<{ start: number; end: number }> {
  const fallbackToBounds = options?.fallbackToBounds ?? true;
  const sampled = [y, y + 0.0001, y - 0.0001]
    .map((sampleY) => intersectionsAtY(points, sampleY))
    .map((xs) => ({
      xs,
      usableCount: xs.length - (xs.length % 2)
    }))
    .sort((a, b) => b.usableCount - a.usableCount);

  const chosen = sampled[0];
  if (!chosen || chosen.usableCount < 2) {
    return fallbackToBounds ? [{ start: minX, end: maxX }] : [];
  }

  const spans: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < chosen.usableCount; i += 2) {
    const start = chosen.xs[i];
    const end = chosen.xs[i + 1];
    if (end - start > 0.000001) {
      spans.push({ start, end });
    }
  }

  if (spans.length > 0) {
    return spans;
  }
  return fallbackToBounds ? [{ start: minX, end: maxX }] : [];
}

function compressLayout(
  leadInStitches: number,
  segmentStitches: number[],
  gapStitches: number[]
): { leadInStitches: number; segmentStitches: number[]; gapStitches: number[] } {
  if (segmentStitches.length <= 1 || gapStitches.length === 0) {
    return {
      leadInStitches: Math.max(0, leadInStitches),
      segmentStitches: [...segmentStitches],
      gapStitches: [...gapStitches]
    };
  }

  const nextSegments = [segmentStitches[0]];
  const nextGaps: number[] = [];
  for (let i = 0; i < gapStitches.length; i += 1) {
    const gap = gapStitches[i];
    const segment = segmentStitches[i + 1] ?? 0;
    if (gap <= 0) {
      nextSegments[nextSegments.length - 1] += segment;
      continue;
    }
    nextGaps.push(gap);
    nextSegments.push(segment);
  }

  return {
    leadInStitches: Math.max(0, leadInStitches),
    segmentStitches: nextSegments,
    gapStitches: nextGaps
  };
}

function buildRowLayoutNote(layout: {
  leadInStitches: number;
  segmentStitches: number[];
  gapStitches: number[];
}): string {
  const { leadInStitches, segmentStitches, gapStitches } = layout;
  if (segmentStitches.length === 0) {
    return "";
  }
  if (leadInStitches <= 0 && gapStitches.length === 0) {
    return "";
  }

  const parts: string[] = [];
  if (leadInStitches > 0) {
    parts.push(`skip ${leadInStitches} ${stitchWord(leadInStitches)} before start`);
  }

  parts.push(`work ${segmentStitches[0]} ${stitchWord(segmentStitches[0])}`);
  for (let i = 0; i < gapStitches.length; i += 1) {
    const gap = gapStitches[i];
    const segment = segmentStitches[i + 1] ?? 0;
    parts.push(`skip ${gap} ${stitchWord(gap)}`);
    parts.push(`work ${segment} ${stitchWord(segment)}`);
  }

  return `layout: ${parts.join(", ")}`;
}

function withLayoutNote(baseText: string, rowPlan: RowPlan): string {
  return rowPlan.layoutNote ? `${baseText}; ${rowPlan.layoutNote}` : baseText;
}

function rowTargetsForSection(args: {
  points: Point[];
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  roundingPolicy: Project["roundingPolicy"];
}): { rowCount: number; rows: RowPlan[] } {
  const { points, stitchesPer10Cm, rowsPer10Cm, roundingPolicy } = args;
  const fallbackRowCount = Math.max(roundingPolicy.row.step, 1);
  const fallbackTarget = Math.max(roundingPolicy.stitch.step, 1);
  if (points.length < 3) {
    return {
      rowCount: fallbackRowCount,
      rows: Array.from({ length: fallbackRowCount }, () => ({
        targetStitches: fallbackTarget,
        leadInStitches: 0,
        segmentStitches: [fallbackTarget],
        gapStitches: [],
        layoutKey: `0|${fallbackTarget}|`,
        layoutNote: ""
      }))
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const heightCm = Math.max(maxY - minY, 0.01);
  const rowCount = applyRounding((heightCm / 10) * rowsPer10Cm, roundingPolicy.row.mode, roundingPolicy.row.step);

  const rows: RowPlan[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const y = minY + ((i + 0.5) / rowCount) * heightCm;
    const spans = sectionSpansAtY(points, y, minX, maxX);
    const segmentStitchesRaw = spans.map((span) =>
      applyRounding(((Math.max(span.end - span.start, 0.01) / 10) * stitchesPer10Cm), roundingPolicy.stitch.mode, roundingPolicy.stitch.step)
    );
    const leadInRaw = ((spans[0].start - minX) / 10) * stitchesPer10Cm;
    const gapStitchesRaw = spans.slice(0, -1).map((span, index) => {
      const next = spans[index + 1];
      const raw = ((next.start - span.end) / 10) * stitchesPer10Cm;
      return Math.max(0, Math.round(raw));
    });

    const compressed = compressLayout(Math.max(0, Math.round(leadInRaw)), segmentStitchesRaw, gapStitchesRaw);
    const targetStitches = compressed.segmentStitches.reduce((sum, value) => sum + value, 0);
    const layoutNote = buildRowLayoutNote(compressed);
    rows.push({
      targetStitches: Math.max(targetStitches, fallbackTarget),
      leadInStitches: compressed.leadInStitches,
      segmentStitches: compressed.segmentStitches,
      gapStitches: compressed.gapStitches,
      layoutKey: `${compressed.leadInStitches}|${compressed.segmentStitches.join(".")}|${compressed.gapStitches.join(".")}`,
      layoutNote
    });
  }

  return {
    rowCount,
    rows
  };
}

function generateSectionInstructions(args: {
  sectionId: string;
  rowPlans: RowPlan[];
  startRow: number;
  startingStitches: number;
  verbosity: InstructionVerbosity;
}): { instructions: Project["instructions"]; endRow: number; endingStitches: number } {
  const { sectionId, rowPlans, startRow, startingStitches, verbosity } = args;
  if (rowPlans.length === 0) {
    return { instructions: [], endRow: startRow - 1, endingStitches: startingStitches };
  }

  const instructions: Project["instructions"] = [];
  let currentStitches = startingStitches;
  let spanStart = startRow;

  if (verbosity === "verbose") {
    for (let i = 0; i < rowPlans.length; i += 1) {
      const rowNumber = startRow + i;
      const rowPlan = rowPlans[i];
      const next = rowPlan.targetStitches;
      if (next === currentStitches) {
        instructions.push({
          id: "",
          rowStart: rowNumber,
          rowEnd: rowNumber,
          text: withLayoutNote(`Work row ${rowNumber} even at ${next} stitches (${sectionId})`, rowPlan)
        });
      } else {
        const delta = next - currentStitches;
        instructions.push({
          id: "",
          rowStart: rowNumber,
          rowEnd: rowNumber,
          text: withLayoutNote(
            `${delta > 0 ? "Increase" : "Decrease"} ${Math.abs(delta)} ${stitchWord(Math.abs(delta))} to ${next} stitches (${sectionId})`,
            rowPlan
          )
        });
      }
      currentStitches = next;
    }

    return {
      instructions,
      endRow: startRow + rowPlans.length - 1,
      endingStitches: currentStitches
    };
  }

  let currentLayoutPlan = rowPlans[0];
  for (let i = 0; i < rowPlans.length; i += 1) {
    const rowNumber = startRow + i;
    const rowPlan = rowPlans[i];
    const next = rowPlan.targetStitches;
    if (next === currentStitches) {
      if (rowPlan.layoutKey !== currentLayoutPlan.layoutKey) {
        const spanEnd = rowNumber - 1;
        if (spanStart <= spanEnd) {
          instructions.push({
            id: "",
            rowStart: spanStart,
            rowEnd: spanEnd,
            text: withLayoutNote(`Work even at ${currentStitches} stitches (${sectionId})`, currentLayoutPlan)
          });
        }
        spanStart = rowNumber;
        currentLayoutPlan = rowPlan;
      }
      continue;
    }

    const spanEnd = rowNumber - 1;
    if (spanStart <= spanEnd) {
      instructions.push({
        id: "",
        rowStart: spanStart,
        rowEnd: spanEnd,
        text: withLayoutNote(`Work even at ${currentStitches} stitches (${sectionId})`, currentLayoutPlan)
      });
    }

    const delta = next - currentStitches;
    const action = delta > 0 ? "Increase" : "Decrease";
    instructions.push({
      id: "",
      rowStart: rowNumber,
      rowEnd: rowNumber,
      text: withLayoutNote(`${action} ${Math.abs(delta)} ${stitchWord(Math.abs(delta))} to ${next} stitches (${sectionId})`, rowPlan)
    });

    currentStitches = next;
    spanStart = rowNumber + 1;
    currentLayoutPlan = rowPlans[i + 1] ?? rowPlan;
  }

  const endRow = startRow + rowPlans.length - 1;
  if (spanStart <= endRow) {
    instructions.push({
      id: "",
      rowStart: spanStart,
      rowEnd: endRow,
      text: withLayoutNote(`Work even at ${currentStitches} stitches (${sectionId})`, currentLayoutPlan)
    });
  }

  return { instructions, endRow, endingStitches: currentStitches };
}

function rowPlanGridWidth(rowPlan: RowPlan): number {
  return rowPlan.leadInStitches + rowPlan.segmentStitches.reduce((sum, value) => sum + value, 0) + rowPlan.gapStitches.reduce((sum, value) => sum + value, 0);
}

const GRID_CELL_COVERAGE_THRESHOLD = 0.5;
const GRID_ROW_SAMPLE_OFFSETS = [0.2, 0.5, 0.8];
const GRID_HISTORY_LIMIT = 200;

function cloneInstructionGrid(grid: InstructionGrid): InstructionGrid {
  return {
    columnCount: grid.columnCount,
    rowCount: grid.rowCount,
    numberedCellCount: grid.numberedCellCount,
    rows: grid.rows.map((row) => ({
      ...row,
      cells: [...row.cells]
    }))
  };
}

function renumberInstructionGrid(grid: InstructionGrid): InstructionGrid {
  let nextCellNumber = 1;
  const rows = grid.rows.map((row) => {
    let occupiedStitches = 0;
    const cells = row.cells.map((cell) => {
      if (cell === null) {
        return null;
      }
      occupiedStitches += 1;
      const assigned = nextCellNumber;
      nextCellNumber += 1;
      return assigned;
    });
    return {
      ...row,
      occupiedStitches,
      cells
    };
  });

  return {
    ...grid,
    rowCount: rows.length,
    numberedCellCount: nextCellNumber - 1,
    rows
  };
}

function gridCellProgressKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

function trimCompletedCellKeysForGrid(completedCellKeys: string[], grid: InstructionGrid): string[] {
  const validKeys = new Set<string>();
  for (let rowIndex = 0; rowIndex < grid.rows.length; rowIndex += 1) {
    const row = grid.rows[rowIndex];
    for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
      if (row.cells[colIndex] !== null) {
        validKeys.add(gridCellProgressKey(rowIndex, colIndex));
      }
    }
  }
  return completedCellKeys.filter((key) => validKeys.has(key));
}

function appendGridHistory(
  entries: GridEditHistoryEntry[],
  entry: Omit<GridEditHistoryEntry, "id" | "timestamp">
): GridEditHistoryEntry[] {
  const next = [
    ...entries,
    {
      ...entry,
      id: `grid_hist_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso()
    }
  ];
  return next.slice(-GRID_HISTORY_LIMIT);
}

function normalizeGridWorkspace(
  project: Project,
  sourceShapeGrid: InstructionGrid
): ProjectGridWorkspace {
  const existing = project.gridWorkspace;
  if (!existing) {
    return {
      currentGrid: cloneInstructionGrid(sourceShapeGrid),
      sourceShapeGrid: cloneInstructionGrid(sourceShapeGrid),
      completedCellKeys: [],
      editHistory: []
    };
  }

  const currentGrid = renumberInstructionGrid(cloneInstructionGrid(existing.currentGrid));
  const normalizedCompletedCellKeys = trimCompletedCellKeysForGrid(
    Array.isArray(existing.completedCellKeys) ? existing.completedCellKeys : [],
    currentGrid
  );

  return {
    currentGrid,
    sourceShapeGrid: cloneInstructionGrid(sourceShapeGrid),
    completedCellKeys: normalizedCompletedCellKeys,
    editHistory: Array.isArray(existing.editHistory) ? existing.editHistory.slice(-GRID_HISTORY_LIMIT) : []
  };
}

function replaceGridWorkspaceFromShape(project: Project): Project {
  const sourceGrid = project.derived.instructionGrid;
  if (!sourceGrid) {
    return project;
  }
  const nextWorkspace: ProjectGridWorkspace = {
    currentGrid: cloneInstructionGrid(sourceGrid),
    sourceShapeGrid: cloneInstructionGrid(sourceGrid),
    completedCellKeys: [],
    editHistory: appendGridHistory(project.gridWorkspace?.editHistory ?? [], {
      action: "generate_from_shape",
      rowIndex: null,
      columnIndex: null,
      note: "Generated new editable grid from current shape"
    })
  };

  return {
    ...project,
    gridWorkspace: nextWorkspace
  };
}

function toggleGridCellStitch(project: Project, rowIndex: number, columnIndex: number): Project {
  const grid = project.gridWorkspace?.currentGrid;
  if (!grid) {
    return project;
  }
  const row = grid.rows[rowIndex];
  if (!row || columnIndex < 0 || columnIndex >= row.cells.length) {
    return project;
  }

  const nextGrid = cloneInstructionGrid(grid);
  const currentCell = nextGrid.rows[rowIndex].cells[columnIndex];
  const nextEnabled = currentCell === null;
  nextGrid.rows[rowIndex].cells[columnIndex] = nextEnabled ? 1 : null;
  const renumbered = renumberInstructionGrid(nextGrid);
  const toggledKey = gridCellProgressKey(rowIndex, columnIndex);
  const nextCompletedCellKeys = trimCompletedCellKeysForGrid(
    (project.gridWorkspace?.completedCellKeys ?? []).filter((key) => !(key === toggledKey && !nextEnabled)),
    renumbered
  );

  return {
    ...project,
    gridWorkspace: {
      ...(project.gridWorkspace as ProjectGridWorkspace),
      currentGrid: renumbered,
      completedCellKeys: nextCompletedCellKeys,
      editHistory: appendGridHistory(project.gridWorkspace?.editHistory ?? [], {
        action: "toggle_stitch",
        rowIndex,
        columnIndex,
        afterEnabled: nextEnabled,
        note: `${nextEnabled ? "Enabled" : "Disabled"} stitch at row ${row.projectRowNumber}, col ${columnIndex + 1}`
      })
    }
  };
}

function toggleGridCellProgress(project: Project, rowIndex: number, columnIndex: number): Project {
  const workspace = project.gridWorkspace;
  const grid = workspace?.currentGrid;
  const row = grid?.rows[rowIndex];
  if (!workspace || !grid || !row || row.cells[columnIndex] === null) {
    return project;
  }

  const key = gridCellProgressKey(rowIndex, columnIndex);
  const completed = new Set(workspace.completedCellKeys);
  const nextCompleted = !completed.has(key);
  if (nextCompleted) {
    completed.add(key);
  } else {
    completed.delete(key);
  }

  return {
    ...project,
    gridWorkspace: {
      ...workspace,
      completedCellKeys: [...completed],
      editHistory: appendGridHistory(workspace.editHistory ?? [], {
        action: "toggle_progress",
        rowIndex,
        columnIndex,
        afterCompleted: nextCompleted,
        note: `${nextCompleted ? "Marked" : "Unmarked"} progress at row ${row.projectRowNumber}, col ${columnIndex + 1}`
      })
    }
  };
}

function buildInstructionGrid(args: {
  sectionPlans: Array<{ sectionId: string; points: Point[]; rowPlans: RowPlan[] }>;
  stitchesPer10Cm: number;
}): InstructionGrid {
  const { sectionPlans, stitchesPer10Cm } = args;
  const allPoints = sectionPlans.flatMap((section) => section.points);
  const stitchWidthCm = stitchesPer10Cm > 0 ? 10 / stitchesPer10Cm : 0.5;
  const globalMinX = allPoints.length > 0 ? Math.min(...allPoints.map((point) => point.x)) : 0;
  const globalMaxX = allPoints.length > 0 ? Math.max(...allPoints.map((point) => point.x)) : 0;
  const globalWidthCm = Math.max(globalMaxX - globalMinX, 0.01);
  const columnCount = allPoints.length > 0 ? Math.max(1, Math.ceil(globalWidthCm / stitchWidthCm)) : 0;
  const rows: InstructionGrid["rows"] = [];
  let nextCellNumber = 1;
  let projectRowNumber = 2;

  for (const section of sectionPlans) {
    const ys = section.points.map((point) => point.y);
    const xs = section.points.map((point) => point.x);
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxY = ys.length > 0 ? Math.max(...ys) : 0;
    const minX = xs.length > 0 ? Math.min(...xs) : globalMinX;
    const maxX = xs.length > 0 ? Math.max(...xs) : globalMaxX;
    const heightCm = Math.max(maxY - minY, 0.01);
    const rowCount = Math.max(section.rowPlans.length, 1);
    const rowBandHeightCm = heightCm / rowCount;

    for (let rowIndex = 0; rowIndex < section.rowPlans.length; rowIndex += 1) {
      const rowPlan = section.rowPlans[rowIndex];
      const cells: Array<number | null> = Array.from({ length: columnCount }, () => null);
      const rowBandTop = minY + (rowIndex / rowCount) * heightCm;

      for (let col = 0; col < cells.length; col += 1) {
        const cellStart = globalMinX + col * stitchWidthCm;
        const cellEnd = cellStart + stitchWidthCm;
        const coverageRatio =
          GRID_ROW_SAMPLE_OFFSETS.reduce((sum, offset) => {
            const sampleY = rowBandTop + rowBandHeightCm * offset;
            const spans = sectionSpansAtY(section.points, sampleY, minX, maxX, { fallbackToBounds: false });
            const overlapWidth = spans.reduce((overlapSum, span) => {
              const overlap = Math.max(0, Math.min(cellEnd, span.end) - Math.max(cellStart, span.start));
              return overlapSum + overlap;
            }, 0);
            return sum + overlapWidth / stitchWidthCm;
          }, 0) / GRID_ROW_SAMPLE_OFFSETS.length;

        if (coverageRatio < GRID_CELL_COVERAGE_THRESHOLD) {
          continue;
        }
        cells[col] = nextCellNumber;
        nextCellNumber += 1;
      }

      rows.push({
        projectRowNumber,
        sectionId: section.sectionId,
        sectionRowNumber: rowIndex + 1,
        occupiedStitches: rowPlan.targetStitches,
        cells
      });
      projectRowNumber += 1;
    }
  }

  return {
    columnCount,
    rowCount: rows.length,
    numberedCellCount: nextCellNumber - 1,
    rows
  };
}

function csvEscape(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function instructionGridToCsv(grid: InstructionGrid): string {
  const header = ["project_row", "section_id", "section_row", "occupied_stitches"];
  for (let col = 0; col < grid.columnCount; col += 1) {
    header.push(`c${col + 1}`);
  }

  const lines = [header.map(csvEscape).join(",")];
  for (const row of grid.rows) {
    const values: Array<string | number | null> = [row.projectRowNumber, row.sectionId, row.sectionRowNumber, row.occupiedStitches, ...row.cells];
    lines.push(values.map(csvEscape).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function recalculateProject(project: Project, verbosity: InstructionVerbosity): Project {
  const pointMap = new Map(project.geometryOverrideCm.points.map((point) => [point.id, point]));
  const stitchesPer10Cm = project.gaugeProfileSnapshot?.stitchesPer10Cm || 20;
  const rowsPer10Cm = project.gaugeProfileSnapshot?.rowsPer10Cm || 28;

  const edgeStitches = project.geometryOverrideCm.edges.map((edge) => {
    const p1 = pointMap.get(edge.p1);
    const p2 = pointMap.get(edge.p2);
    const cm = p1 && p2 ? cmDistance(p1, p2) : 0;
    const raw = (cm / 10) * stitchesPer10Cm;
    return {
      edgeId: edge.id,
      count: applyRounding(raw, project.roundingPolicy.stitch.mode, project.roundingPolicy.stitch.step)
    };
  });

  const sectionPlans = project.geometryOverrideCm.sections.map((section) => {
    const points = section.pointLoop.map((id) => pointMap.get(id)).filter(Boolean) as Point[];
    const { rowCount, rows } = rowTargetsForSection({
      points,
      stitchesPer10Cm,
      rowsPer10Cm,
      roundingPolicy: project.roundingPolicy
    });
    return {
      sectionId: section.id,
      points,
      rowCount,
      rowPlans: rows
    };
  });

  const sectionRows = sectionPlans.map((plan) => ({
    sectionId: plan.sectionId,
    count: plan.rowCount
  }));
  const instructionGrid = buildInstructionGrid({
    sectionPlans,
    stitchesPer10Cm
  });
  const gridWorkspace = normalizeGridWorkspace(project, instructionGrid);

  const firstTarget = sectionPlans[0]?.rowPlans[0]?.targetStitches ?? Math.max(project.roundingPolicy.stitch.step, 1);
  const lastPlan = sectionPlans[sectionPlans.length - 1];
  const lastTarget = lastPlan?.rowPlans[lastPlan.rowPlans.length - 1]?.targetStitches ?? firstTarget;

  const instructions: Project["instructions"] = [
    {
      id: "",
      rowStart: 1,
      rowEnd: 1,
      text: `Cast on ${firstTarget} stitches`
    }
  ];

  let rowCursor = 2;
  let currentStitches = firstTarget;
  for (const plan of sectionPlans) {
    const generated = generateSectionInstructions({
      sectionId: plan.sectionId,
      rowPlans: plan.rowPlans,
      startRow: rowCursor,
      startingStitches: currentStitches,
      verbosity
    });
    instructions.push(...generated.instructions);
    rowCursor = generated.endRow + 1;
    currentStitches = generated.endingStitches;
  }

  instructions.push({
    id: "",
    rowStart: rowCursor,
    rowEnd: rowCursor,
    text: `Bind off ${currentStitches || lastTarget} stitches`
  });

  const withIds = instructions.map((instruction, index) => ({
    ...instruction,
    id: `inst_${String(index + 1).padStart(3, "0")}`
  }));

  const nextCompletedRowsBySection: Record<string, number> = {};
  const nextActivePartialBySection: Project["progress"]["activePartialRowBySection"] = {};
  for (const section of sectionRows) {
    nextCompletedRowsBySection[section.sectionId] = project.progress.completedRowsBySection[section.sectionId] ?? 0;
    nextActivePartialBySection[section.sectionId] = project.progress.activePartialRowBySection[section.sectionId] ?? null;
  }

  return {
    ...project,
    derived: {
      edgeStitches,
      sectionRows,
      instructionGrid
    },
    instructions: withIds,
    gridWorkspace,
    progress: {
      completedRowsBySection: nextCompletedRowsBySection,
      activePartialRowBySection: nextActivePartialBySection
    }
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("projects");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [personProfiles, setPersonProfiles] = useState<PersonProfile[]>([]);
  const [gaugeProfiles, setGaugeProfiles] = useState<GaugeProfile[]>([]);
  const [selectedPersonProfileId, setSelectedPersonProfileId] = useState<string>("");
  const [selectedGaugeProfileId, setSelectedGaugeProfileId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences());
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(settingsFormFromPreferences(defaultPreferences()));
  const [personForm, setPersonForm] = useState<PersonFormState>(emptyPersonForm());
  const [gaugeForm, setGaugeForm] = useState<GaugeFormState>(emptyGaugeForm());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [edgeLengthInput, setEdgeLengthInput] = useState<string>("");
  const [templateNameDraft, setTemplateNameDraft] = useState<string>("");
  const [edgeEditorError, setEdgeEditorError] = useState<string>("");
  const [gaugeFormError, setGaugeFormError] = useState<string>("");
  const [settingsNotice, setSettingsNotice] = useState<string>("");
  const [instructionsNotice, setInstructionsNotice] = useState<string>("");
  const [gridClickMode, setGridClickMode] = useState<"edit" | "progress">("edit");
  const [error, setError] = useState<string | null>(null);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeProject?.templateId),
    [activeProject?.templateId, templates]
  );

  const selectedPersonProfile = useMemo(
    () => personProfiles.find((profile) => profile.id === selectedPersonProfileId),
    [personProfiles, selectedPersonProfileId]
  );

  const selectedGaugeProfile = useMemo(
    () => gaugeProfiles.find((profile) => profile.id === selectedGaugeProfileId),
    [gaugeProfiles, selectedGaugeProfileId]
  );

  const pointById = useMemo(
    () => new Map(activeProject?.geometryOverrideCm.points.map((point) => [point.id, point]) ?? []),
    [activeProject?.geometryOverrideCm.points]
  );

  const activeGeometry = activeProject?.geometryOverrideCm ?? emptyGeometry;

  const canvasViewBox = useMemo(() => {
    if (activeGeometry.points.length === 0) {
      return "0 0 120 120";
    }
    const xs = activeGeometry.points.map((point) => point.x);
    const ys = activeGeometry.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 16;
    const width = Math.max(maxX - minX, 20) + pad * 2;
    const height = Math.max(maxY - minY, 20) + pad * 2;
    return `${minX - pad} ${minY - pad} ${width} ${height}`;
  }, [activeGeometry.points]);

  async function refreshProjects() {
    const loadedProjects = await storageApi.listProjects();
    setProjects(loadedProjects);
  }

  async function refreshTemplates(): Promise<Template[]> {
    const loadedTemplates = await storageApi.listTemplates();
    setTemplates(loadedTemplates);
    return loadedTemplates;
  }

  async function refreshProfiles() {
    const [persons, gauges] = await Promise.all([
      storageApi.listProfiles("person") as Promise<PersonProfile[]>,
      storageApi.listProfiles("gauge") as Promise<GaugeProfile[]>
    ]);
    setPersonProfiles(persons);
    setGaugeProfiles(gauges);
    if (!selectedPersonProfileId && persons.length > 0) {
      setSelectedPersonProfileId(persons[0].id);
    }
    if (!selectedGaugeProfileId && gauges.length > 0) {
      setSelectedGaugeProfileId(gauges[0].id);
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        await storageApi.bootstrap();
        const [loadedTemplates, loadedPreferences] = await Promise.all([storageApi.listTemplates(), storageApi.getPreferences()]);
        setTemplates(loadedTemplates);
        setPreferences(loadedPreferences);
        setSettingsForm(settingsFormFromPreferences(loadedPreferences));
        await Promise.all([refreshProjects(), refreshProfiles()]);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : "Failed to initialize app data.";
        setError(message);
      }
    };

    void initialize();
  }, []);

  useEffect(() => {
    if (activeProject && !hasGeometry(activeProject.geometryOverrideCm)) {
      setActiveProject(recalculateProject(hydrateProjectGeometry(activeProject, templates), preferences.instructionVerbosity));
    }
  }, [activeProject, templates]);

  useEffect(() => {
    setSelectedEdgeId("");
    setEdgeLengthInput("");
    setDragState(null);
    setEdgeEditorError("");
  }, [activeProject?.id]);

  useEffect(() => {
    setTemplateNameDraft(activeTemplate?.name ?? "");
  }, [activeProject?.id, activeTemplate?.id, activeTemplate?.name]);

  async function handleCreateProject() {
    try {
      const projectName = newProjectName.trim() || `Project ${projects.length + 1}`;
      const draft = buildProjectDraft({
        template: selectDefaultTemplate(templates),
        projectName,
        preferences,
        personProfile: selectedPersonProfile,
        gaugeProfile: selectedGaugeProfile
      });
      const saved = await storageApi.saveProject(draft);
      await refreshProjects();
      setActiveProject(recalculateProject(saved, preferences.instructionVerbosity));
      setNewProjectName("");
      setScreen("design");
      setError(null);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to create project.";
      setError(message);
    }
  }

  async function handleOpenProject(projectId: string) {
    try {
      const loaded = await storageApi.loadProject(projectId);
      setActiveProject(recalculateProject(hydrateProjectGeometry(loaded, templates), preferences.instructionVerbosity));
      setScreen("design");
      setError(null);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to open project.";
      setError(message);
    }
  }

  async function handleDeleteProject(projectId: string) {
    await storageApi.deleteProject(projectId);
    if (activeProject?.id === projectId) {
      setActiveProject(null);
    }
    await refreshProjects();
  }

  async function handleSaveProject() {
    if (!activeProject) {
      return;
    }
    const saved = await storageApi.saveProject({
      ...recalculateProject(activeProject, preferences.instructionVerbosity),
      updatedAt: nowIso()
    });
    setActiveProject(recalculateProject(saved, preferences.instructionVerbosity));
    await refreshProjects();
  }

  async function handleSavePersonProfile() {
    const timestamp = nowIso();
    const existing = personProfiles.find((profile) => profile.id === personForm.id);
    const toSave: PersonProfile = {
      id: personForm.id ?? `person_${Date.now()}`,
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      name: personForm.name.trim() || "Unnamed Person",
      measurementsCm: {
        bustCircumference: personForm.bustCircumference,
        armLength: personForm.armLength,
        garmentLength: personForm.garmentLength
      }
    };
    const saved = (await storageApi.saveProfile("person", toSave)) as PersonProfile;
    await refreshProfiles();
    setSelectedPersonProfileId(saved.id);
    setPersonForm({
      id: saved.id,
      name: saved.name,
      bustCircumference: saved.measurementsCm.bustCircumference ?? 0,
      armLength: saved.measurementsCm.armLength ?? 0,
      garmentLength: saved.measurementsCm.garmentLength ?? 0
    });
  }

  async function handleDeletePersonProfile() {
    if (!personForm.id) {
      return;
    }
    await storageApi.deleteProfile("person", personForm.id);
    setPersonForm(emptyPersonForm());
    setSelectedPersonProfileId("");
    await refreshProfiles();
  }

  async function handleSaveGaugeProfile() {
    if (gaugeForm.stitchesPer10Cm <= 0 || gaugeForm.rowsPer10Cm <= 0) {
      setGaugeFormError("Stitches/rows per 10cm must both be greater than 0.");
      return;
    }
    setGaugeFormError("");
    const timestamp = nowIso();
    const existing = gaugeProfiles.find((profile) => profile.id === gaugeForm.id);
    const toSave: GaugeProfile = {
      id: gaugeForm.id ?? `gauge_${Date.now()}`,
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      name: gaugeForm.name.trim() || "Unnamed Gauge",
      stitchesPer10Cm: gaugeForm.stitchesPer10Cm,
      rowsPer10Cm: gaugeForm.rowsPer10Cm,
      needle: gaugeForm.needle,
      notes: gaugeForm.notes
    };
    const saved = (await storageApi.saveProfile("gauge", toSave)) as GaugeProfile;
    await refreshProfiles();
    setSelectedGaugeProfileId(saved.id);
    setGaugeForm({
      id: saved.id,
      name: saved.name,
      stitchesPer10Cm: saved.stitchesPer10Cm,
      rowsPer10Cm: saved.rowsPer10Cm,
      needle: saved.needle,
      notes: saved.notes ?? ""
    });
  }

  async function handleDeleteGaugeProfile() {
    if (!gaugeForm.id) {
      return;
    }
    await storageApi.deleteProfile("gauge", gaugeForm.id);
    setGaugeForm(emptyGaugeForm());
    setSelectedGaugeProfileId("");
    await refreshProfiles();
  }

  async function handleSaveSettings() {
    const saved = await storageApi.savePreferences({
      ...preferences,
      displayUnit: settingsForm.displayUnit,
      defaultRounding: {
        stitch: { mode: settingsForm.stitchMode, step: Math.max(settingsForm.stitchStep, 1) },
        row: { mode: settingsForm.rowMode, step: Math.max(settingsForm.rowStep, 1) }
      }
    });
    setPreferences(saved);
    setSettingsForm(settingsFormFromPreferences(saved));
    setSettingsNotice("Settings saved.");
    if (activeProject) {
      setActiveProject(
        recalculateProject({
          ...activeProject,
          displayUnit: saved.displayUnit,
          roundingPolicy: saved.defaultRounding
        }, saved.instructionVerbosity)
      );
    }
  }

  function handleTemplateChange(templateId: string) {
    if (!activeProject) {
      return;
    }
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }
    setActiveProject(
      recalculateProject({
        ...activeProject,
        templateId: template.id,
        geometryOverrideCm: cloneGeometry(template.geometryCm)
      }, preferences.instructionVerbosity)
    );
    setSelectedEdgeId("");
    setEdgeLengthInput("");
  }

  async function handleSaveAsTemplate() {
    if (!activeProject) {
      return;
    }
    const timestamp = nowIso();
    const sourceTemplate = templates.find((entry) => entry.id === activeProject.templateId);
    const toSave: Template = {
      id: `tpl_user_${Date.now()}`,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      name: templateNameDraft.trim() || `${activeProject.name} Template`,
      garmentType: sourceTemplate?.garmentType ?? "custom",
      isBuiltin: false,
      basedOnTemplateId: sourceTemplate?.id ?? null,
      geometryCm: cloneGeometry(activeProject.geometryOverrideCm)
    };
    const saved = await storageApi.saveTemplate(toSave);
    await refreshTemplates();
    setActiveProject(recalculateProject({ ...activeProject, templateId: saved.id }, preferences.instructionVerbosity));
  }

  async function handleUpdateTemplate() {
    if (!activeProject || !activeTemplate || activeTemplate.isBuiltin) {
      return;
    }
    const updated = await storageApi.saveTemplate({
      ...activeTemplate,
      name: templateNameDraft.trim() || activeTemplate.name,
      geometryCm: cloneGeometry(activeProject.geometryOverrideCm)
    });
    await refreshTemplates();
    setActiveProject(recalculateProject({ ...activeProject, templateId: updated.id }, preferences.instructionVerbosity));
  }

  async function handleDeleteTemplate() {
    if (!activeTemplate || activeTemplate.isBuiltin) {
      return;
    }
    await storageApi.deleteTemplate(activeTemplate.id);
    const nextTemplates = await refreshTemplates();
    if (!activeProject) {
      return;
    }
    const fallback = nextTemplates.find((template) => template.isBuiltin) ?? nextTemplates[0];
    if (fallback) {
      setActiveProject(
        recalculateProject({
          ...activeProject,
          templateId: fallback.id,
          geometryOverrideCm: cloneGeometry(fallback.geometryCm)
        }, preferences.instructionVerbosity)
      );
    }
  }

  function handleSelectEdge(edgeId: string) {
    if (!activeProject) {
      return;
    }
    const edge = activeProject.geometryOverrideCm.edges.find((entry) => entry.id === edgeId);
    if (!edge) {
      return;
    }
    setSelectedEdgeId(edge.id);
    const p1 = pointById.get(edge.p1);
    const p2 = pointById.get(edge.p2);
    setEdgeLengthInput(p1 && p2 ? cmDistance(p1, p2).toFixed(2) : "0");
    setEdgeEditorError("");
  }

  function handleApplyEdgeLength() {
    if (!activeProject || !selectedEdgeId) {
      setEdgeEditorError("Select an edge first.");
      return;
    }
    const targetLength = parseOptionalNumber(edgeLengthInput);
    if (targetLength === null || targetLength <= 0) {
      setEdgeEditorError("Length must be a positive number.");
      return;
    }
    setEdgeEditorError("");

    setActiveProject((previous) => {
      if (!previous) {
        return previous;
      }

      const edge = previous.geometryOverrideCm.edges.find((entry) => entry.id === selectedEdgeId);
      if (!edge) {
        return previous;
      }

      const p1 = previous.geometryOverrideCm.points.find((entry) => entry.id === edge.p1);
      const p2 = previous.geometryOverrideCm.points.find((entry) => entry.id === edge.p2);
      if (!p1 || !p2) {
        return previous;
      }

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const scale = length === 0 ? 0 : targetLength / length;

      const nextP2 = length === 0 ? { x: p1.x + targetLength, y: p1.y } : { x: p1.x + dx * scale, y: p1.y + dy * scale };

      const nextProject = {
        ...previous,
        geometryOverrideCm: {
          ...previous.geometryOverrideCm,
          points: previous.geometryOverrideCm.points.map((point) =>
            point.id === p2.id ? { ...point, x: round2(nextP2.x), y: round2(nextP2.y) } : point
          )
        }
      };
      return recalculateProject(nextProject, preferences.instructionVerbosity);
    });
    setEdgeLengthInput(targetLength.toFixed(2));
  }

  function handleRegenerateInstructions() {
    if (!activeProject) {
      return;
    }
    const recalculated = recalculateProject(activeProject, preferences.instructionVerbosity);
    setActiveProject(replaceGridWorkspaceFromShape(recalculated));
    setInstructionsNotice("Generated a new editable grid from the current shape.");
  }

  function handleExportInstructionGridCsv() {
    if (!activeProject) {
      setInstructionsNotice("Open a project before exporting a grid.");
      return;
    }
    const exportGrid = activeProject?.gridWorkspace?.currentGrid ?? activeProject?.derived.instructionGrid;
    if (!exportGrid) {
      setInstructionsNotice("No instruction grid available to export.");
      return;
    }

    const csv = instructionGridToCsv(exportGrid);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const slug = (activeProject.name || activeProject.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "garment-project";

    anchor.href = url;
    anchor.download = `${slug}-instruction-grid.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setInstructionsNotice(`Exported CSV grid (${exportGrid.rowCount} rows).`);
  }

  function handleGridCellClick(rowIndex: number, columnIndex: number) {
    setActiveProject((previous) => {
      if (!previous) {
        return previous;
      }
      const next =
        gridClickMode === "edit"
          ? toggleGridCellStitch(previous, rowIndex, columnIndex)
          : toggleGridCellProgress(previous, rowIndex, columnIndex);
      return next;
    });
  }

  function handleClearGridProgress() {
    if (!activeProject?.gridWorkspace) {
      return;
    }
    setActiveProject({
      ...activeProject,
      gridWorkspace: {
        ...activeProject.gridWorkspace,
        completedCellKeys: [],
        editHistory: appendGridHistory(activeProject.gridWorkspace.editHistory ?? [], {
          action: "clear_progress",
          rowIndex: null,
          columnIndex: null,
          note: "Cleared grid progress marks"
        })
      }
    });
    setInstructionsNotice("Grid progress marks cleared.");
  }

  async function handleInstructionVerbosityChange(nextVerbosity: InstructionVerbosity) {
    if (nextVerbosity === preferences.instructionVerbosity) {
      return;
    }
    try {
      const saved = await storageApi.savePreferences({
        ...preferences,
        instructionVerbosity: nextVerbosity
      });
      setPreferences(saved);
      setSettingsForm(settingsFormFromPreferences(saved));
      setInstructionsNotice(nextVerbosity === "verbose" ? "Verbose mode enabled." : "Grouped mode enabled.");
      if (activeProject) {
        setActiveProject(recalculateProject(activeProject, nextVerbosity));
      }
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to change instruction mode.";
      setError(message);
    }
  }

  function handlePointPointerDown(event: React.PointerEvent<SVGCircleElement>, pointId: string) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) {
      return;
    }
    svg.setPointerCapture(event.pointerId);
    setDragState({ pointId, pointerId: event.pointerId });
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState || !activeProject) {
      return;
    }
    if (event.pointerId !== dragState.pointerId) {
      return;
    }
    const nextPoint = svgPoint(event.currentTarget, event.clientX, event.clientY);
    setActiveProject((previous) => {
      if (!previous) {
        return previous;
      }
      const nextProject = {
        ...previous,
        geometryOverrideCm: {
          ...previous.geometryOverrideCm,
          points: previous.geometryOverrideCm.points.map((point) =>
            point.id === dragState.pointId ? { ...point, x: round2(nextPoint.x), y: round2(nextPoint.y) } : point
          )
        }
      };
      return recalculateProject(nextProject, preferences.instructionVerbosity);
    });
  }

  function handleCanvasPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragState(null);
  }

  function renderProjectsScreen() {
    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>New Project</h2>
          <label>
            Project Name
            <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Blue Raglan" />
          </label>
          <label>
            Person Snapshot Source
            <select value={selectedPersonProfileId} onChange={(event) => setSelectedPersonProfileId(event.target.value)}>
              <option value="">No saved profile</option>
              {personProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gauge Snapshot Source
            <select value={selectedGaugeProfileId} onChange={(event) => setSelectedGaugeProfileId(event.target.value)}>
              <option value="">No saved profile</option>
              {gaugeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-btn" onClick={handleCreateProject}>
            Create Project
          </button>
        </section>

        <section className="surface">
          <h2>Projects</h2>
          <ul className="item-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button className="link-btn" onClick={() => handleOpenProject(project.id)}>
                  {project.name}
                </button>
                <button className="danger-btn" onClick={() => handleDeleteProject(project.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  function renderProfilesScreen() {
    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>Person Profiles</h2>
          <div className="inline-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setPersonForm(emptyPersonForm());
                setSelectedPersonProfileId("");
              }}
            >
              New
            </button>
          </div>
          <ul className="item-list compact">
            {personProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  className={`link-btn ${selectedPersonProfileId === profile.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedPersonProfileId(profile.id);
                    setPersonForm({
                      id: profile.id,
                      name: profile.name,
                      bustCircumference: profile.measurementsCm.bustCircumference ?? 0,
                      armLength: profile.measurementsCm.armLength ?? 0,
                      garmentLength: profile.measurementsCm.garmentLength ?? 0
                    });
                  }}
                >
                  {profile.name}
                </button>
              </li>
            ))}
          </ul>
          <label>
            Name
            <input value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} />
          </label>
          <label>
            Bust (cm)
            <input
              type="number"
              value={personForm.bustCircumference}
              onChange={(event) => setPersonForm({ ...personForm, bustCircumference: parseNumber(event.target.value, personForm.bustCircumference) })}
            />
          </label>
          <label>
            Arm Length (cm)
            <input
              type="number"
              value={personForm.armLength}
              onChange={(event) => setPersonForm({ ...personForm, armLength: parseNumber(event.target.value, personForm.armLength) })}
            />
          </label>
          <label>
            Garment Length (cm)
            <input
              type="number"
              value={personForm.garmentLength}
              onChange={(event) => setPersonForm({ ...personForm, garmentLength: parseNumber(event.target.value, personForm.garmentLength) })}
            />
          </label>
          <div className="inline-actions">
            <button className="primary-btn" onClick={handleSavePersonProfile}>
              Save
            </button>
            <button className="danger-btn" onClick={handleDeletePersonProfile}>
              Delete
            </button>
          </div>
        </section>

        <section className="surface">
          <h2>Gauge Profiles</h2>
          <div className="inline-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setGaugeForm(emptyGaugeForm());
                setSelectedGaugeProfileId("");
                setGaugeFormError("");
              }}
            >
              New
            </button>
          </div>
          <ul className="item-list compact">
            {gaugeProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  className={`link-btn ${selectedGaugeProfileId === profile.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedGaugeProfileId(profile.id);
                    setGaugeFormError("");
                    setGaugeForm({
                      id: profile.id,
                      name: profile.name,
                      stitchesPer10Cm: profile.stitchesPer10Cm,
                      rowsPer10Cm: profile.rowsPer10Cm,
                      needle: profile.needle,
                      notes: profile.notes ?? ""
                    });
                  }}
                >
                  {profile.name}
                </button>
              </li>
            ))}
          </ul>
          <label>
            Name
            <input
              value={gaugeForm.name}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, name: event.target.value });
              }}
            />
          </label>
          <label>
            Stitches / 10cm
            <input
              type="number"
              value={gaugeForm.stitchesPer10Cm}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, stitchesPer10Cm: parseNumber(event.target.value, gaugeForm.stitchesPer10Cm) });
              }}
            />
          </label>
          <label>
            Rows / 10cm
            <input
              type="number"
              value={gaugeForm.rowsPer10Cm}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, rowsPer10Cm: parseNumber(event.target.value, gaugeForm.rowsPer10Cm) });
              }}
            />
          </label>
          <label>
            Needle
            <input
              value={gaugeForm.needle}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, needle: event.target.value });
              }}
            />
          </label>
          <label>
            Notes
            <input
              value={gaugeForm.notes}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, notes: event.target.value });
              }}
            />
          </label>
          {gaugeFormError && <p className="field-error">{gaugeFormError}</p>}
          <div className="inline-actions">
            <button className="primary-btn" onClick={handleSaveGaugeProfile}>
              Save
            </button>
            <button className="danger-btn" onClick={handleDeleteGaugeProfile}>
              Delete
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderDesignScreen() {
    const parsedEdgeLength = parseOptionalNumber(edgeLengthInput);
    const canApplyEdgeLength = Boolean(selectedEdgeId) && parsedEdgeLength !== null && parsedEdgeLength > 0;

    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>Canvas Editor</h2>
          {!activeProject && <p>Select a project from Projects to begin editing.</p>}
          {activeProject && (
            <>
              <label>
                Project Name
                <input
                  value={activeProject.name}
                  onChange={(event) => setActiveProject({ ...activeProject, name: event.target.value })}
                />
              </label>
              <label>
                Active Template
                <select value={activeProject.templateId} onChange={(event) => handleTemplateChange(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.isBuiltin ? "(Built-in)" : "(User)"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="canvas-wrap">
                <svg
                  viewBox={canvasViewBox}
                  className="design-canvas"
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  {activeGeometry.sections.map((section) => {
                    const points = section.pointLoop.map((id) => pointById.get(id)).filter(Boolean) as Point[];
                    if (points.length < 3) {
                      return null;
                    }
                    return <polygon key={section.id} points={points.map((p) => `${p.x},${p.y}`).join(" ")} className="section-shape" />;
                  })}

                  {activeGeometry.edges.map((edge) => {
                    const p1 = pointById.get(edge.p1);
                    const p2 = pointById.get(edge.p2);
                    if (!p1 || !p2) {
                      return null;
                    }
                    return (
                      <g key={edge.id}>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          className="edge-hit"
                          vectorEffect="non-scaling-stroke"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            handleSelectEdge(edge.id);
                          }}
                        />
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          className={`edge-line ${selectedEdgeId === edge.id ? "selected" : ""}`}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2} className="edge-label">
                          {edge.label}
                        </text>
                      </g>
                    );
                  })}

                  {activeGeometry.points.map((point) => (
                    <g key={point.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        className="point-hit"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => handlePointPointerDown(event, point.id)}
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={3.6}
                        className="point-node"
                      />
                      <text x={point.x + 3.5} y={point.y - 2.5} className="point-label">
                        {point.id}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <button className="primary-btn" onClick={handleSaveProject}>
                Save Project
              </button>
            </>
          )}
        </section>

        <section className="surface">
          <h2>Template Library</h2>
          {!activeProject && <p>Open a project to manage templates.</p>}
          {activeProject && (
            <>
              <label>
                Template Name
                <input value={templateNameDraft} onChange={(event) => setTemplateNameDraft(event.target.value)} />
              </label>
              <div className="inline-actions">
                <button className="primary-btn" onClick={handleSaveAsTemplate}>
                  Save As New Template
                </button>
                <button className="secondary-btn" onClick={handleUpdateTemplate} disabled={activeTemplate?.isBuiltin}>
                  Update Template
                </button>
                <button className="danger-btn" onClick={handleDeleteTemplate} disabled={activeTemplate?.isBuiltin}>
                  Delete Template
                </button>
              </div>

              <h3>Edge Length Editor</h3>
              {!selectedEdgeId && <p>Select an edge in the canvas.</p>}
              {selectedEdgeId && (
                <>
                  <p>
                    Selected edge: <strong>{selectedEdgeId}</strong>
                  </p>
                  <label>
                    Length (cm)
                    <input
                      type="number"
                      value={edgeLengthInput}
                      onChange={(event) => {
                        setEdgeEditorError("");
                        setEdgeLengthInput(event.target.value);
                      }}
                    />
                  </label>
                  {edgeEditorError && <p className="field-error">{edgeEditorError}</p>}
                  <button className="secondary-btn" onClick={handleApplyEdgeLength} disabled={!canApplyEdgeLength}>
                    Apply Length
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  function renderInstructionsScreen() {
    const instructionGrid = activeProject?.gridWorkspace?.currentGrid ?? activeProject?.derived.instructionGrid;
    const sourceShapeGrid = activeProject?.gridWorkspace?.sourceShapeGrid ?? activeProject?.derived.instructionGrid;
    const completedCellKeys = new Set(activeProject?.gridWorkspace?.completedCellKeys ?? []);
    const gridHistory = activeProject?.gridWorkspace?.editHistory ?? [];

    return (
      <section className="surface">
        <h2>Instruction Grid + Progress</h2>
        {!activeProject && <p>Open a project to view instructions.</p>}
        {activeProject && (
          <>
            <div className="inline-actions">
              <label className="inline-control">
                Legacy Text Detail
                <select
                  value={preferences.instructionVerbosity}
                  onChange={(event) => void handleInstructionVerbosityChange(event.target.value as InstructionVerbosity)}
                >
                  <option value="grouped">Grouped</option>
                  <option value="verbose">Verbose</option>
                </select>
              </label>
              <button className="secondary-btn" onClick={handleRegenerateInstructions}>
                Generate New Grid From Shape
              </button>
              <button className="secondary-btn" onClick={handleExportInstructionGridCsv} disabled={!instructionGrid || instructionGrid.rowCount === 0}>
                Export Grid CSV
              </button>
              <label className="inline-control">
                Grid Click Mode
                <select value={gridClickMode} onChange={(event) => setGridClickMode(event.target.value as "edit" | "progress")}>
                  <option value="edit">Edit Stitches</option>
                  <option value="progress">Track Progress</option>
                </select>
              </label>
              <button className="secondary-btn" onClick={handleClearGridProgress} disabled={!activeProject.gridWorkspace || completedCellKeys.size === 0}>
                Clear Grid Progress
              </button>
              <button className="primary-btn" onClick={handleSaveProject}>
                Save Progress
              </button>
            </div>
            {instructionsNotice && <p className="field-note">{instructionsNotice}</p>}
            {instructionGrid && (
              <>
                <p className="grid-summary">
                  {instructionGrid.rowCount} rows x {instructionGrid.columnCount} columns, {instructionGrid.numberedCellCount} numbered cells.
                  Click cells in <strong>{gridClickMode === "edit" ? "Edit Stitches" : "Track Progress"}</strong> mode.
                </p>
                {sourceShapeGrid && activeProject.gridWorkspace && (
                  <p className="grid-summary">
                    Shape grid: {sourceShapeGrid.numberedCellCount} cells. Editable grid progress: {completedCellKeys.size} completed cells.
                  </p>
                )}
                <div className="grid-preview-wrap">
                  <table className="grid-preview-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Section</th>
                        <th>Sec Row</th>
                        <th>Sts</th>
                        {Array.from({ length: instructionGrid.columnCount }, (_, index) => (
                          <th key={`col_${index + 1}`}>C{index + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {instructionGrid.rows.map((row, rowIndex) => (
                        <tr key={`${row.sectionId}_${row.sectionRowNumber}_${row.projectRowNumber}`}>
                          <td className="grid-meta-cell">{row.projectRowNumber}</td>
                          <td className="grid-meta-cell">{row.sectionId}</td>
                          <td className="grid-meta-cell">{row.sectionRowNumber}</td>
                          <td className="grid-meta-cell">{row.occupiedStitches}</td>
                          {row.cells.map((cell, index) => (
                            <td
                              key={`${row.projectRowNumber}_${index}`}
                              className={[
                                "grid-stitch-cell",
                                cell === null ? "empty" : "",
                                completedCellKeys.has(gridCellProgressKey(rowIndex, index)) ? "completed" : "",
                                gridClickMode === "edit" ? "edit-mode" : "progress-mode"
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => handleGridCellClick(rowIndex, index)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleGridCellClick(rowIndex, index);
                                }
                              }}
                              aria-label={`Grid cell row ${row.projectRowNumber}, column ${index + 1}${cell === null ? ", empty" : `, stitch ${cell}`}`}
                            >
                              {cell ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="legacy-instructions">
                  <summary>Grid edit history ({gridHistory.length})</summary>
                  {gridHistory.length === 0 && <p className="grid-history-empty">No grid edits yet.</p>}
                  {gridHistory.length > 0 && (
                    <ol className="grid-history-list">
                      {[...gridHistory].reverse().map((entry) => (
                        <li key={entry.id}>
                          {new Date(entry.timestamp).toLocaleString()}: {entry.note}
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              </>
            )}
            {!instructionGrid && <p>No instruction grid available for this project.</p>}
            <details className="legacy-instructions">
              <summary>Legacy text instructions (fallback)</summary>
              <ol>
                {activeProject.instructions.map((instruction) => (
                  <li key={instruction.id}>
                    Rows {instruction.rowStart}-{instruction.rowEnd}: {instruction.text}
                  </li>
                ))}
              </ol>
            </details>
            {activeProject.derived.sectionRows.map((section) => {
              const partial = activeProject.progress.activePartialRowBySection[section.sectionId];
              return (
                <div key={section.sectionId} className="progress-row">
                  <h3>{section.sectionId}</h3>
                  <label>
                    Completed Full Rows
                    <input
                      type="number"
                      value={activeProject.progress.completedRowsBySection[section.sectionId] ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            completedRowsBySection: {
                              ...activeProject.progress.completedRowsBySection,
                              [section.sectionId]: Math.max(parseNumber(event.target.value, 0), 0)
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    Active Row Number
                    <input
                      type="number"
                      value={partial?.rowNumber ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            activePartialRowBySection: {
                              ...activeProject.progress.activePartialRowBySection,
                              [section.sectionId]: {
                                rowNumber: Math.max(parseNumber(event.target.value, 0), 0),
                                completedStitches: partial?.completedStitches ?? 0
                              }
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    Completed Stitches In Active Row
                    <input
                      type="number"
                      value={partial?.completedStitches ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            activePartialRowBySection: {
                              ...activeProject.progress.activePartialRowBySection,
                              [section.sectionId]: {
                                rowNumber: partial?.rowNumber ?? 1,
                                completedStitches: Math.max(parseNumber(event.target.value, 0), 0)
                              }
                            }
                          }
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </>
        )}
      </section>
    );
  }

  function renderSettingsScreen() {
    return (
      <section className="surface">
        <h2>Settings</h2>
        <label>
          Display Unit
          <select
            value={settingsForm.displayUnit}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, displayUnit: event.target.value as "in" | "cm" });
            }}
          >
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
          </select>
        </label>
        <label>
          Stitch Rounding Mode
          <select
            value={settingsForm.stitchMode}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, stitchMode: event.target.value as RoundingMode });
            }}
          >
            <option value="nearest">Nearest</option>
            <option value="ceil">Ceil</option>
            <option value="floor">Floor</option>
          </select>
        </label>
        <label>
          Stitch Rounding Step
          <input
            type="number"
            min={1}
            value={settingsForm.stitchStep}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, stitchStep: Math.max(parseNumber(event.target.value, 1), 1) });
            }}
          />
        </label>
        <label>
          Row Rounding Mode
          <select
            value={settingsForm.rowMode}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, rowMode: event.target.value as RoundingMode });
            }}
          >
            <option value="nearest">Nearest</option>
            <option value="ceil">Ceil</option>
            <option value="floor">Floor</option>
          </select>
        </label>
        <label>
          Row Rounding Step
          <input
            type="number"
            min={1}
            value={settingsForm.rowStep}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, rowStep: Math.max(parseNumber(event.target.value, 1), 1) });
            }}
          />
        </label>
        {settingsNotice && <p className="field-note">{settingsNotice}</p>}
        <button className="primary-btn" onClick={handleSaveSettings}>
          Save Settings
        </button>
      </section>
    );
  }

  return (
    <div className="app-frame">
      <aside className="nav-rail">
        <div className="brand-pill">GD</div>
        {navigation.map((item) => (
          <button
            key={item.screen}
            className={`nav-icon ${screen === item.screen ? "active" : ""}`}
            onClick={() => setScreen(item.screen)}
            title={item.label}
            aria-label={item.label}
          >
            {item.glyph}
          </button>
        ))}
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <h1>{navigation.find((item) => item.screen === screen)?.label ?? "Workspace"}</h1>
          <p>Kayla's Garment Designer</p>
        </header>
        <div className="workspace-body">
          {screen === "projects" && renderProjectsScreen()}
          {screen === "profiles" && renderProfilesScreen()}
          {screen === "design" && renderDesignScreen()}
          {screen === "instructions" && renderInstructionsScreen()}
          {screen === "settings" && renderSettingsScreen()}
        </div>
      </main>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
