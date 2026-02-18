export type DisplayUnit = "in" | "cm";
export type RoundingMode = "nearest" | "ceil" | "floor";

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

export interface Template extends Metadata {
  name: string;
  garmentType: string;
  isBuiltin: boolean;
  basedOnTemplateId: string | null;
  geometryCm: {
    points: Point[];
    edges: Edge[];
    sections: Section[];
    constraints: Record<string, unknown>[];
  };
}

export interface ProjectInstruction {
  id: string;
  rowStart: number;
  rowEnd: number;
  text: string;
}

export interface Project extends Metadata {
  name: string;
  templateId: string;
  personProfileId?: string;
  gaugeProfileId?: string;
  paletteId?: string;
  displayUnit: DisplayUnit;
  roundingPolicy: RoundingPolicy;
  geometryOverrideCm: {
    points: Point[];
    edges: Edge[];
    sections: Section[];
    constraints: Record<string, unknown>[];
  };
  derived: {
    edgeStitches: Array<{ edgeId: string; count: number }>;
    sectionRows: Array<{ sectionId: string; count: number }>;
  };
  instructions: ProjectInstruction[];
  progress: {
    completedRowsBySection: Record<string, number[]>;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}
