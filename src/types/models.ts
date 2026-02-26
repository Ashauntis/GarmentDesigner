export type DisplayUnit = "in" | "cm";
export type RoundingMode = "nearest" | "ceil" | "floor";
export type InstructionVerbosity = "grouped" | "verbose";
export type SectionConstructionMode = "flat" | "round";

export interface Metadata {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoundingRule {
  mode: RoundingMode;
  step: number;
}

export interface RoundingPolicy {
  stitch: RoundingRule;
  row: RoundingRule;
}

export interface AppPreferences extends Metadata {
  displayUnit: DisplayUnit;
  defaultRounding: RoundingPolicy;
  instructionVerbosity: InstructionVerbosity;
}

export interface Point {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  p1: string;
  p2: string;
  label: string;
}

export interface Section {
  id: string;
  name: string;
  pointLoop: string[];
  construction?: SectionConstructionSpec;
}

export interface SectionConstructionTransition {
  id: string;
  atOffsetCm: number;
  mode: SectionConstructionMode;
}

export interface SectionConstructionSpec {
  initialMode: SectionConstructionMode;
  transitions: SectionConstructionTransition[];
}

export interface Geometry {
  points: Point[];
  edges: Edge[];
  sections: Section[];
  constraints: Record<string, unknown>[];
}

export interface Template extends Metadata {
  name: string;
  garmentType: string;
  isBuiltin: boolean;
  basedOnTemplateId: string | null;
  geometryCm: Geometry;
}

export interface ProjectInstruction {
  id: string;
  rowStart: number;
  rowEnd: number;
  text: string;
  workMode?: SectionConstructionMode | "setup" | "transition" | "finish";
}

export interface InstructionGridRow {
  projectRowNumber: number;
  sectionId: string;
  sectionRowNumber: number;
  workMode: SectionConstructionMode;
  occupiedStitches: number;
  cells: Array<number | null>;
}

export interface InstructionGrid {
  columnCount: number;
  rowCount: number;
  numberedCellCount: number;
  rows: InstructionGridRow[];
}

export interface GridEditHistoryEntry {
  id: string;
  timestamp: string;
  action: "generate_from_shape" | "toggle_stitch" | "toggle_progress" | "clear_progress";
  rowIndex: number | null;
  columnIndex: number | null;
  afterEnabled?: boolean;
  afterCompleted?: boolean;
  note: string;
}

export interface ProjectGridWorkspace {
  currentGrid: InstructionGrid;
  sourceShapeGrid: InstructionGrid;
  completedCellKeys: string[];
  editHistory: GridEditHistoryEntry[];
 }

export interface PersonProfileSnapshot {
  sourceProfileId: string | null;
  sourceProfileUpdatedAt: string | null;
  name: string;
  measurementsCm: Record<string, number>;
}

export interface GaugeProfileSnapshot {
  sourceProfileId: string | null;
  sourceProfileUpdatedAt: string | null;
  name: string;
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  needle: string;
  notes?: string;
}

export interface PartialRowProgress {
  rowNumber: number;
  completedStitches: number;
}

export interface Project extends Metadata {
  name: string;
  templateId: string;
  personProfileSnapshot?: PersonProfileSnapshot;
  gaugeProfileSnapshot?: GaugeProfileSnapshot;
  paletteId?: string;
  displayUnit: DisplayUnit;
  roundingPolicy: RoundingPolicy;
  geometryOverrideCm: Geometry;
  derived: {
    edgeStitches: Array<{ edgeId: string; count: number }>;
    sectionRows: Array<{ sectionId: string; count: number }>;
    instructionGrid?: InstructionGrid;
  };
  instructions: ProjectInstruction[];
  gridWorkspace?: ProjectGridWorkspace;
  progress: {
    completedRowsBySection: Record<string, number>;
    activePartialRowBySection: Record<string, PartialRowProgress | null>;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PersonProfile extends Metadata {
  name: string;
  measurementsCm: Record<string, number>;
}

export interface GaugeProfile extends Metadata {
  name: string;
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  needle: string;
  notes?: string;
}

export type ProfileKind = "person" | "gauge";
