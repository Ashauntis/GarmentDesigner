export type DisplayUnit = "in" | "cm";
export type RoundingMode = "nearest" | "ceil" | "floor";
export type InstructionVerbosity = "grouped" | "verbose";

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
  };
  instructions: ProjectInstruction[];
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
